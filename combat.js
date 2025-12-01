// 戰鬥與押注模組（與 slot.js 協作）— HP 成本 + 隨機怪物屬性版
(() => {
  // ===== 可調整參數 =====
  const START_BALANCE = 0;      // 本局起始金幣
  const PLAYER_MAX_HP = 100;    // 一局 100 HP = 100 元
  const MONSTER_MAX_HP = 100;   // 怪物最大 HP（與模擬 --hp=100 對齊）

  const BET_TO_DAMAGE_SCALE = 1; // 目前不再用 bet，固定 1 即可
  const KILL_BONUS = 30;        // 對應模擬中的 kill=30
  const HP_COST_PER_SPIN = 5;   // 每次付費 SPIN 扣 5 HP

  const MONSTER_ATTR_POOL = ['水', '火', '木', '光', '暗'];

  // ===== DOM =====
  const $ = (id) => document.getElementById(id);
  const elBalance = $('balance');
  const elMonsterAttr = $('monsterAttr');   // 純文字顯示
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

  // 抽一種怪物屬性
  function pickRandomMonsterAttr() {
    const idx = Math.floor(Math.random() * MONSTER_ATTR_POOL.length);
    return MONSTER_ATTR_POOL[idx];
  }

  // 套用怪物屬性：更新畫面 + 通知 slot.js
  function applyMonsterAttr(attr) {
    currentMonsterAttr = attr;

    // 畫面上顯示屬性文字
    if (elMonsterAttr) {
      elMonsterAttr.textContent = attr;
    }

    // 通知 slot.js 使用新的怪物屬性
    if (window.SlotCore && typeof window.SlotCore.setMonsterAttr === 'function') {
      window.SlotCore.setMonsterAttr(attr);
    }
  }

  // 狀態渲染
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

  // 監聽 slot.js 的結算事件
  window.addEventListener('slot:settled', (ev) => {
    const detail = ev.detail || {};
    const totalDamage = detail.totalDamage || 0;
    const spinType = detail.spinType || 'paid';

    // free spin 次數處理
    if (spinType === 'free' && freeSpins > 0) {
      freeSpins--;
    }

    // 付費 SPIN：消耗固定 HP，不再使用 bet
    if (spinType === 'paid' && pHp > 0) {
      pHp = Math.max(0, pHp - HP_COST_PER_SPIN);
    }

    const appliedDamage = Math.round(totalDamage * BET_TO_DAMAGE_SCALE);
    const hpBefore = mHp;

    // 怪物扣血
    if (appliedDamage > 0) {
      mHp = Math.max(0, mHp - appliedDamage);
    }

    // 擊殺與 overkill
    if (mHp === 0 && appliedDamage > 0) {
      // 擊殺固定獎勵
      balance += KILL_BONUS;

      const overkill = appliedDamage - hpBefore;
      let gainedFreeSpins = 0;

      // 以怪物 MAX HP 判定 overkill 段數
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
