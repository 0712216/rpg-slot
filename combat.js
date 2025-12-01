// 戰鬥與押注模組（與 slot.js 協作）— HP 成本 + 隨機怪物屬性版
(() => {
  // ===== 可調整參數 =====
  const START_BALANCE = 0;      // 本局起始金幣
  const PLAYER_MAX_HP = 100;    // 一局 100 HP = 100 元
  const MONSTER_MAX_HP = 100;   // 怪物血量（如要對齊模擬 hp=100，可一併改成 100）

  const BET_TO_DAMAGE_SCALE = 1;
  const KILL_BONUS = 30;        // 你現在模擬用的是 kill=30，可以對齊
  const HP_COST_PER_SPIN = 5;   // 每次付費 SPIN 扣 5 HP

  const MONSTER_ATTR_POOL = ['水', '火', '木', '光', '暗'];

  // ===== DOM =====
  const $ = (id) => document.getElementById(id);
  const elBet = $('bet');
  const elBalance = $('balance');
  const elMonsterAttr = $('monsterAttr');   // 只做顯示，不給玩家改
  const elPHp = $('pHp');
  const elPHpMax = $('pHpMax');
  const elMHp = $('mHp');
  const elMHpMax = $('mHpMax');
  const elSpinBtn = $('spinBtn');
  const elFreeSpinBtn = $('freeSpinBtn');

  // ===== 狀態 =====
  let balance = START_BALANCE;
  let pHp = PLAYER_MAX_HP;
  let mHp = MONSTER_MAX_HP;
  let freeSpins = 0;
  let currentMonsterAttr = null;

  function pickRandomMonsterAttr() {
    const idx = Math.floor(Math.random() * MONSTER_ATTR_POOL.length);
    return MONSTER_ATTR_POOL[idx];
  }

  function applyMonsterAttr(attr) {
    currentMonsterAttr = attr;
    // 更新畫面上的 select（當顯示用）
    if (elMonsterAttr) {
      elMonsterAttr.value = attr;
    }
    // 通知 slot.js 使用新的怪物屬性
    if (window.SlotCore && typeof window.SlotCore.setMonsterAttr === 'function') {
      window.SlotCore.setMonsterAttr(attr);
    }
  }

  function renderState() {
    if (elBalance) elBalance.textContent = String(balance);
    if (elPHp) elPHp.textContent = String(pHp);
    if (elPHpMax) elPHpMax.textContent = String(PLAYER_MAX_HP);
    if (elMHp) elMHp.textContent = String(mHp);
    if (elMHpMax) elMHpMax.textContent = String(MONSTER_MAX_HP);

    if (elSpinBtn) {
      elSpinBtn.disabled = pHp <= 0;
    }
    if (elFreeSpinBtn) {
      elFreeSpinBtn.disabled = freeSpins <= 0 || pHp <= 0;
      elFreeSpinBtn.textContent = `FREE SPIN (${freeSpins})`;
    }
  }

  // 初始化：抽第一隻怪物屬性
  applyMonsterAttr(pickRandomMonsterAttr());
  renderState();

  // 不再允許玩家手動改 select，因此不要綁 change 事件

  // 監聽 slot.js 的結算事件
  window.addEventListener('slot:settled', (ev) => {
    const detail = ev.detail || {};
    const totalDamage = detail.totalDamage || 0;
    const spinType = detail.spinType || 'paid';

    // free spin 次數處理
    if (spinType === 'free' && freeSpins > 0) {
      freeSpins--;
    }

    // 押注只影響傷害倍率，不影響 HP / balance
    let bet = 0;
    if (spinType === 'paid') {
      bet = Math.max(1, parseInt(elBet?.value || '1', 10) || 1);

      // 付費 SPIN 扣 HP
      if (pHp > 0) {
        pHp = Math.max(0, pHp - HP_COST_PER_SPIN);
      }
    }

    const appliedDamage = Math.round(totalDamage * BET_TO_DAMAGE_SCALE);
    const hpBefore = mHp;

    // 怪物扣血
    if (appliedDamage > 0) {
      mHp = Math.max(0, mHp - appliedDamage);
    }

    // 擊殺與 overkill
    if (mHp === 0 && appliedDamage > 0) {
      balance += KILL_BONUS;

      const overkill = appliedDamage - hpBefore;
      let gainedFreeSpins = 0;
      if (overkill >= 2 * MONSTER_MAX_HP) {
        gainedFreeSpins = 6;
      } else if (overkill >= 1 * MONSTER_MAX_HP) {
        gainedFreeSpins = 3;
      }
      if (gainedFreeSpins > 0) {
        freeSpins += gainedFreeSpins;
      }

      // 怪物重生：HP 重置 + 隨機換屬性
      mHp = MONSTER_MAX_HP;
      applyMonsterAttr(pickRandomMonsterAttr());
    }

    // 玩家死亡 → 結束本局
    if (pHp === 0) {
      if (elSpinBtn) elSpinBtn.disabled = true;
      if (elFreeSpinBtn) elFreeSpinBtn.disabled = true;

      const detailDom = document.getElementById('detail');
      if (detailDom) {
        detailDom.textContent =
          `本局結束：玩家 HP 已用盡，請找莊家加值。當前金幣：${balance}`;
      }
    }

    renderState();
  });
})();
