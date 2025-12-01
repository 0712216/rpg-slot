// 5×3 RPG 主題拉霸機（原生 JS 模組化腳本）
// 可直接與 index.html 放在同一資料夾使用

(() => {
  // ======= 可調校參數（方便測試/平衡） =======
  // 轉動速度（越小越快）
  const SPIN_TICKS_BASE = 12;        // 原 18 → 建議 10~14
  const SPIN_TICKS_RAND = 6;         // 原 10 → 建議 4~8
  const SPIN_DELAY_BASE_MS = 20;     // 原 35 → 建議 10~25
  const SPIN_DELAY_STEP_MS = 6;      // 原 10 → 建議 4~8

  // 怪物屬性（決定克制關係）：'水' | '火' | '木' | '光' | '暗'
  const MONSTER_ATTR = '火';
  // 目前生效中的怪物屬性（可由外部 combat.js 覆蓋）
  let currentMonsterAttr = MONSTER_ATTR;
  let currentSpinType = 'paid';   // 'paid' 或 'free'

  // 對外提供少量 API（例如切換怪物屬性）
  window.SlotCore = window.SlotCore || {};
  window.SlotCore.setMonsterAttr = (attr) => { currentMonsterAttr = attr; };
  window.SlotCore.getMonsterAttr = () => currentMonsterAttr;
  // 克制倍率：僅在「我方連線屬性」克制怪物時套用；不克制則 ×1。Wild-only 連線不吃克制。
  const ADV_MULT = 1.5; // 推薦 1.5

  // Scatter 連線時的整體加成：+50%/每枚 → 總傷害 × (1 + 0.5×scatter)
  const SCATTER_ON_LINE_STEP = 0.5; // 0.5 代表 +50%/枚
  const SCATTER_CONSOLATION = 5;    // 無線時的保底/枚

  // ===== 基本盤面設定 =====
  const REELS = 5;
  const ROWS = 3;

  // 符號與屬性分類：三屬性=水/火/木；雙屬性=光/暗；Wild、Scatter 特殊
  const SYMBOLS = {
    WATER:   { key: '水', group: 'tri' },   // 三屬性
    FIRE:    { key: '火', group: 'tri' },
    WOOD:    { key: '木', group: 'tri' },
    LIGHT:   { key: '光', group: 'dual' },  // 雙屬性
    DARK:    { key: '暗', group: 'dual' },
    WILD:    { key: '★', group: 'wild' },
    SCATTER: { key: '✦', group: 'scatter' },
  };

  // 權重（出現率）
  const WEIGHTS = { '水':10, '火':10, '木':10, '光':8, '暗':8, '★':2, '✦':1.5 };

  // --- 傷害系統 ---
  // 三屬性基本傷害=2；雙屬性基本傷害=4；Wild-only 基礎傷害=250（僅限前綴連續 Wild 計分）
  const BASE_DAMAGE = { tri: 2, dual: 4};
  const WILD_BASE = 250;
  // 連線倍率：3→x5、4→x15、5→x50
  const MULTIPLIER = { 3: 4, 4: 15, 5: 60 };

  // 固定 10 條線（MVP）。可擴充或切換成 243/1024 Ways。
  const PAYLINES = [
    [0,0,0,0,0],
    [1,1,1,1,1],
    [2,2,2,2,2],
    [0,1,2,1,0],
    [2,1,0,1,2],
    [0,0,1,0,0],
    [2,2,1,2,2],
    [1,0,1,2,1],
    [1,2,1,0,1],
    [0,1,1,1,2],
  ];

  // ===== DOM 參照 =====
  const elGrid = document.getElementById('grid');
  const elSpin = document.getElementById('spinBtn');
  const elFreeSpin = document.getElementById('freeSpinBtn');
  const elLast = document.getElementById('lastWin');
  const elDetail = document.getElementById('detail');

  // ===== 工具 =====
  function weightedPick() {
    const entries = Object.entries(WEIGHTS);
    const total = entries.reduce((a, [,w]) => a + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) { r -= w; if (r <= 0) return k; }
    return entries[entries.length - 1][0];
  }

  function spinOnce() {
    const grid = Array.from({ length: ROWS }, () => Array(REELS).fill(''));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < REELS; c++) {
        grid[r][c] = weightedPick();
      }
    }
    return grid; // [row][reel]
  }

  const isWild    = (sym) => sym === SYMBOLS.WILD.key;
  const isScatter = (sym) => sym === SYMBOLS.SCATTER.key;
  const isTri     = (sym) => sym === SYMBOLS.WATER.key || sym === SYMBOLS.FIRE.key || sym === SYMBOLS.WOOD.key;
  const isDual    = (sym) => sym === SYMBOLS.LIGHT.key || sym === SYMBOLS.DARK.key;

  function groupOf(sym) {
    if (isTri(sym)) return 'tri';
    if (isDual(sym)) return 'dual';
    if (isWild(sym)) return 'wild';
    if (isScatter(sym)) return 'scatter';
    return 'other';
  }

  function elementOf(sym) {
    if (isTri(sym) || isDual(sym)) return sym; // 直接回傳字元 '水'|'火'|'木'|'光'|'暗'
    return null; // wild/scatter/other → 無屬性
  }

  // 三屬性循環：水 → 火 → 木 → 水
  function triAdvantage(playerElem, monsterElem) {
    return (
      (playerElem === '水' && monsterElem === '火') ||
      (playerElem === '火' && monsterElem === '木') ||
      (playerElem === '木' && monsterElem === '水')
    );
  }

  // 雙屬性互剋：光 ↔ 暗
  function dualAdvantage(playerElem, monsterElem) {
    return (
      (playerElem === '光' && monsterElem === '暗') ||
      (playerElem === '暗' && monsterElem === '光')
    );
  }

  function elementAdvMultiplier(playerElem, monsterElem) {
    if (!playerElem || !monsterElem) return 1;
    // 同群組判斷克制；跨群組（tri vs dual）暫視為中性
    if ((playerElem === '光' || playerElem === '暗') && (monsterElem === '光' || monsterElem === '暗')) {
      return dualAdvantage(playerElem, monsterElem) ? ADV_MULT : 1;
    }
    if ((playerElem === '水' || playerElem === '火' || playerElem === '木') && (monsterElem === '水' || monsterElem === '火' || monsterElem === '木')) {
      return triAdvantage(playerElem, monsterElem) ? ADV_MULT : 1;
    }
    return 1;
  }

  // 計算「前綴連續 Wild」的傷害（w,w,w[,w,w]...），長度>=3 才計分；不吃屬性克制
  function evalWildPrefixDamage(grid, line) {
    let count = 0;
    for (let reel = 0; reel < REELS; reel++) {
      const sym = grid[line[reel]][reel];
      if (isWild(sym)) count++; else break;
    }
    if (count >= 3) {
      const m = MULTIPLIER[count] || 0; // 只允許 3/4/5
      return { count, damage: WILD_BASE * m };
    }
    return { count: 0, damage: 0 };
  }

  // 計算「目標符號」的連線傷害：第一個非 Wild/Scatter 作為目標；Wild 可視為目標
  function evalTargetLineDamage(grid, line) {
    let target = null; let count = 0;
    for (let reel = 0; reel < REELS; reel++) {
      const sym = grid[line[reel]][reel];
      if (isScatter(sym)) break; // Scatter 中斷線上計算
      if (!target) {
        if (isWild(sym)) { count++; continue; }
        target = sym; count++; continue;
      }
      if (sym === target || isWild(sym)) { count++; } else { break; }
    }
    if (count >= 3) {
      // 若仍未找到目標（全是 Wild），不在此函式計分（交給 wildPrefix）；否則依目標群組給基傷
      if (!target) return { target: null, count, damage: 0, elem: null, mult: 1 };
      const g = groupOf(target);
      const base = BASE_DAMAGE[g] ?? 0;
      const m = MULTIPLIER[count] || 0;
      const elem = elementOf(target);
      const adv = elementAdvMultiplier(elem, currentMonsterAttr);
      const dmg = Math.round(base * m * adv);
      return { target, count, damage: dmg, elem, mult: adv };
    }
    return { target: null, count: 0, damage: 0, elem: null, mult: 1 };
  }

  function evaluateScatter(grid){
    let scatters = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < REELS; c++) if (isScatter(grid[r][c])) scatters++;
    return scatters;
  }

  function collectWinningCoords(grid){
    const coords = {};
    PAYLINES.forEach((line, idx) => {
      const { count } = evalTargetLineDamage(grid, line);
      const { count: wildPrefix } = evalWildPrefixDamage(grid, line);
      const len = Math.max(count, wildPrefix);
      if (len >= 3) {
        coords[idx] = [];
        for (let reel = 0; reel < len; reel++) coords[idx].push([line[reel], reel]);
      }
    });
    return coords; // { lineIndex: [[row,reel], ...] }
  }

  // ===== UI =====
  let currentGrid = spinOnce();

  function renderGrid(grid, highlight={}){
    elGrid.innerHTML = '';
    for (let c = 0; c < REELS; c++) {
      const col = document.createElement('div');
      col.className = 'col';
      for (let r = 0; r < ROWS; r++) {
        const cell = document.createElement('div');
        const sym = grid[r][c];
        cell.className = 'cell';
        const win = Object.values(highlight).some(list => list.some(([rr, cc]) => rr===r && cc===c));
        if (win) cell.classList.add('win');
        cell.textContent = sym;
        col.appendChild(cell);
      }
      elGrid.appendChild(col);
    }
  }

  function settleAndShow(grid){
    let totalDamage = 0; const detail = [];
    let hadAnyLine = false;

    // 各線計分：Wild-only 前綴（不吃屬性） + 目標符號最佳連線（吃屬性）
    PAYLINES.forEach((line, idx) => {
      const wildRes = evalWildPrefixDamage(grid, line);
      const tgtRes  = evalTargetLineDamage(grid, line);
      let lineDamage = 0; const seg = [];

      if (wildRes.damage > 0) { lineDamage += wildRes.damage; seg.push(`WILD ×${wildRes.count} → ${wildRes.damage}`); }
      if (tgtRes.damage > 0)  {
        lineDamage += tgtRes.damage;
        if (tgtRes.elem) {
          if (tgtRes.mult && tgtRes.mult !== 1) seg.push(`${tgtRes.target} ×${tgtRes.count} ×${tgtRes.mult}（克制${currentMonsterAttr}） → ${tgtRes.damage}`);
          else seg.push(`${tgtRes.target} ×${tgtRes.count} → ${tgtRes.damage}`);
        } else {
          seg.push(`${tgtRes.target || '—'} ×${tgtRes.count} → ${tgtRes.damage}`);
        }
      }

      if (lineDamage > 0) {
        hadAnyLine = true;
        totalDamage += lineDamage;
        detail.push(`線#${idx+1}: ${seg.join(' + ')}`);
      }
    });

    // Scatter：有連線 → 乘數加成；無連線 → 保底
    const scatters = evaluateScatter(grid);
    if (scatters > 0) {
      if (totalDamage > 0) {
        const factor = 1 + SCATTER_ON_LINE_STEP * scatters; // 1, 1.5, 2.0, 2.5, ...
        const before = totalDamage;
        totalDamage = Math.round(totalDamage * factor);
        detail.push(`Scatter ✦ ×${scatters} → 全傷害 ×${factor.toFixed(2)}（由 ${before} → ${totalDamage}）`);
      } else {
        const consolation = SCATTER_CONSOLATION * scatters;
        totalDamage += consolation;
        detail.push(`Scatter ✦ ×${scatters} 無連線保底 → +${consolation}`);
      }
    }

    const coords = collectWinningCoords(grid);
    renderGrid(grid, coords);

    elLast.textContent = String(totalDamage);
    elDetail.textContent = detail.length ? detail.join('  |  ') : '—';

    // 對戰鬥系統發出事件
    const evt = new CustomEvent('slot:settled', {
      detail: { totalDamage, hadAnyLine, scatters, grid, coords, spinType: currentSpinType }
    });
    window.dispatchEvent(evt);

    return totalDamage;
  }

  // ===== 初始化渲染 =====
  renderGrid(currentGrid);
  settleAndShow(currentGrid);

  // ===== 旋轉流程 =====
  let spinning = false;

  async function runSpin(spinType) {
    if (spinning) return;
    spinning = true;
    currentSpinType = spinType;

    // 轉動期間兩顆按鈕都鎖住
    if (elSpin) { elSpin.disabled = true; elSpin.textContent = '旋轉中…'; }
    if (elFreeSpin) { elFreeSpin.disabled = true; }

    const ticks = SPIN_TICKS_BASE + Math.floor(Math.random() * SPIN_TICKS_RAND);
    for (let i = 0; i < ticks; i++) {
      currentGrid = spinOnce();
      renderGrid(currentGrid);
      await new Promise(res => setTimeout(res, SPIN_DELAY_BASE_MS + i * SPIN_DELAY_STEP_MS));
    }
    currentGrid = spinOnce();
    settleAndShow(currentGrid);

    // 還原按鈕狀態（FREE 的 enable/disable 交給 combat.js）
    if (elSpin) {
      elSpin.disabled = false;
      elSpin.textContent = 'SPIN 旋轉';
    }
    spinning = false;
  }

  // 一般付費 SPIN
  if (elSpin) {
    elSpin.addEventListener('click', () => runSpin('paid'));
  }

  // Free Spin（由 combat.js 控制 disabled）
  if (elFreeSpin) {
    elFreeSpin.addEventListener('click', () => runSpin('free'));
  }

})();
