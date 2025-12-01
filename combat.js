// 戰鬥與押注模組（與 slot.js 協作）
// 使用方式：
// 1) 在 index.html 於 slot.js 之後加：<script src="combat.js"></script>
// 2) 在頁面中新增下列元素（id）：bet, balance, monsterAttr, pHp, pHpMax, mHp, mHpMax
// 3) 本模組會監聽 slot.js 派發的 'slot:settled' 事件，接管金流與血量

(() => {
  // ===== 參數（可依平衡性調整） =====
  const START_BALANCE = 1000;
  const PLAYER_MAX_HP = 100;
  const MONSTER_MAX_HP = 120;

  const BET_TO_DAMAGE_SCALE = 1;     // 押注對傷害的影響（暫不放大）
  const KILL_BONUS = 75;             // 擊殺固定獎金
  const MISS_PENALTY_HP = 5;         // 無連線時玩家扣血（怪物反擊）

  // ===== DOM =====
  const $ = (id) => document.getElementById(id);
  const elBet = $('bet');
  const elBalance = $('balance');
  const elMonsterAttr = $('monsterAttr');
  const elPHp = $('pHp');
  const elPHpMax = $('pHpMax');
  const elMHp = $('mHp');
  const elMHpMax = $('mHpMax');
  const elFreeSpinBtn = $('freeSpinBtn');

  // ===== 狀態 =====
  let balance = START_BALANCE;
  let pHp = PLAYER_MAX_HP;
  let mHp = MONSTER_MAX_HP;
  let freeSpins = 0;

  function renderState() {
    if (elBalance) elBalance.textContent = String(balance);
    if (elPHp) elPHp.textContent = String(pHp);
    if (elPHpMax) elPHpMax.textContent = String(PLAYER_MAX_HP);
    if (elMHp) elMHp.textContent = String(mHp);
    if (elMHpMax) elMHpMax.textContent = String(MONSTER_MAX_HP);
    if (elFreeSpinBtn) {
      elFreeSpinBtn.disabled = freeSpins <= 0;
      elFreeSpinBtn.textContent = `FREE SPIN (${freeSpins})`;
    }
  }

  // 初始化
  renderState();

  // 下拉切換怪物屬性 → 通知 slot.js 使用者當前屬性
  if (elMonsterAttr && window.SlotCore && typeof window.SlotCore.setMonsterAttr === 'function') {
    window.SlotCore.setMonsterAttr(elMonsterAttr.value);
    elMonsterAttr.addEventListener('change', () => {
      window.SlotCore.setMonsterAttr(elMonsterAttr.value);
    });
  }

  // 監聽 slot.js 的結算事件
  window.addEventListener('slot:settled', (ev) => {
    const detail = ev.detail || {};
    const totalDamage = detail.totalDamage || 0;
    const spinType = detail.spinType || 'paid';  // 'paid' or 'free'

    // 如果是 free spin，先扣掉一點 freeSpins
    if (spinType === 'free' && freeSpins > 0) {
      freeSpins--;
    }

    // 讀取押注，只在「paid spin」時扣款
    let bet = 0;
    if (spinType === 'paid') {
      bet = Math.max(1, parseInt(elBet?.value || '1', 10) || 1);
      balance = Math.max(0, balance - bet);
    }

    const appliedDamage = Math.round(totalDamage * BET_TO_DAMAGE_SCALE);
    const hpBefore = mHp;

    // 傷害處理
    if (appliedDamage > 0) {
      mHp = Math.max(0, mHp - appliedDamage);
    } else {
      // 無傷害時的怪物反擊（一般來說 free spin 時不再扣玩家血）
      if (spinType === 'paid' && MISS_PENALTY_HP > 0) {
        pHp = Math.max(0, pHp - MISS_PENALTY_HP);
      }
    }

    // 擊殺與 overkill 判定
    if (mHp === 0 && appliedDamage > 0) {
      // 1) 金錢獎勵（無論 paid/free 都可以給，視你設計，也可以限制 only paid）
      balance += KILL_BONUS;

      // 2) Overkill 計算
      const overkill = appliedDamage - hpBefore; // 多打出去的傷害

      let gainedFreeSpins = 0;
      if (overkill >= 2 * MONSTER_MAX_HP) {
        gainedFreeSpins = 6;
      } else if (overkill >= 1 * MONSTER_MAX_HP) {
        gainedFreeSpins = 3;
      }

      // 是否允許 free spin 中也觸發 free spin？→ 目前設計為「可以疊加」
      if (gainedFreeSpins > 0) {
        freeSpins += gainedFreeSpins;
      }

      // 3) 怪物重生
      mHp = MONSTER_MAX_HP;
    }

    // 玩家死亡處理（為了測試不中斷流程，直接復活）
    if (pHp === 0) {
      pHp = PLAYER_MAX_HP;
    }

    renderState();
  });

})();
