// ============================================================
// 校园战力党 — 对战页面 (阶段制 · 卡牌动画)
// ============================================================
import { gameSocket } from '../net/socket.js';
import { navigate } from '../main.js';
import { SUBJECTS, CORE_SUBJECTS, ELECTIVE_SUBJECTS, MINOR_SUBJECTS, getSkillMultiplier, DICE_COLORS, IDENTITY } from '../../shared/rules.js';
import { playDiceRoll, playHit } from '../utils/audio.js';
import { vfxManager } from '../utils/vfx.js';

let S; // module-level state ref
let animLock = false; // prevent state_update during animations

const identityName = (id) => {
  switch(id) {
    case IDENTITY.LORD: return '主公';
    case IDENTITY.LOYALIST: return '忠臣';
    case IDENTITY.REBEL: return '反贼';
    case IDENTITY.SPY: return '内奸';
    default: return '身份';
  }
};

export function renderBattle(container, data) {
  S = data.state;
  animLock = false; // 重置动画锁

  window._refreshDraftSlot = (idx) => { gameSocket.refreshDraftSlot(idx); };
  window._buyDraftCard = (idx) => { gameSocket.buyDraftCard(idx); };
  window._confirmDraftReady = () => { gameSocket.confirmDraftReady(); };
  window._playTacticalCard = (id, evt) => {
    const cardEl = evt?.currentTarget || document.querySelector(`.hand-card-kards[onclick*="${id}"]`);
    const targetCardEl = document.getElementById('card-op') || document.getElementById('card-me');
    vfxManager.playTacticalCardVFX(cardEl, targetCardEl, () => {
      gameSocket.playTacticalCard(id);
    });
  };

  container.innerHTML = buildArena(S);
  bindCoreEvents();

  gameSocket.on('state_update', (s) => { if (!animLock) { S = s; refreshAll(); } });
  gameSocket.on('atk_confirmed', (d) => { S = d.state; onAtkConfirmed(d); });
  gameSocket.on('turn_resolved', (d) => { S = d.state; onTurnResolved(d); });
  gameSocket.on('class_change', (d) => showClassChange(d));
  gameSocket.on('opponent_disconnected', () => {
    const el = document.getElementById('phase-text');
    if (el) el.innerHTML = '<span style="color:var(--red)">对手已断开连接</span>';
  });
  gameSocket.on('error_msg', (d) => {
    alert(d.message);
    refreshAll();
  });
  gameSocket.on('buy_water_result', (d) => {
    S = d.state;
    refreshAll();
    showBanner(`买水成功！当前蓄势: ${d.chargeStacks} 层`);
  });

  return () => {};
}

// ── HTML 骨架 ──
function buildArena(s) {
  const me = s.me, op = s.opponent;
  const subj = s.schedule[s.currentClassIndex];
  
  window.selectFfaTarget = (pid) => {
    if (S.turnPhase === 'choose_target' && S.isMyAttackTurn) {
      gameSocket.selectTarget(pid);
    }
  };
  return `
    <div class="arena">
      <aside class="sidebar sidebar-left" id="sidebar-schedule">
        <div class="sidebar-title">课程表</div>
        ${scheduleHTML(s)}
        ${me.hasReschedule ? '<button id="btn-reschedule" class="btn btn-secondary" style="width:100%;margin-top:8px;font-size:.78rem;">调课</button>' : ''}
      </aside>

      <main class="arena-center">
        <div class="card-row">
          ${ s.gameMode === 'sanguosha' ? `<div id="ffa-grid-container">${buildFfaGrid(s)}</div>` : `
          <div class="battle-card-wrap" id="card-op">
            <div class="bc-multi" id="multi-op">${multiTag(getM(op,subj))}</div>
            <div class="battle-card ${getAuraClass(op)}">
              <img src="${op.card?.image||''}" alt="" onerror="this.style.display='none'">
              <div class="bc-name">${op.card?.name||'???'}</div>
            </div>
            <div class="bc-hp">
              <div class="hp-bar-h enemy" id="hp-op" style="width:${pct(op.hp,op.maxHp)}%"></div>
              <span class="hp-label" id="hp-op-t">${op.hp}</span>
            </div>
            ${s.gameMode === 'sanguosha' ? `<div class="bc-identity-badge">${identityName(op.identity)}</div>` : ''}
            <details class="skill-details">
              <summary style="font-size:0.75rem; color:var(--text-secondary); cursor:pointer; text-align:center; padding-top:4px;">查看技能 (点击展开)</summary>
              <div class="skill-desc-box">
              ${op.card?.positiveSkill ? `<div class="skill-desc-line pos">✦ ${op.card.positiveSkill.name}: ${op.card.positiveSkill.desc}</div>` : ''}
              ${op.card?.neutralSkill ? `<div class="skill-desc-line neu">⬩ ${op.card.neutralSkill.name}: ${op.card.neutralSkill.desc}</div>` : ''}
              ${op.card?.negativeSkill ? `<div class="skill-desc-line neg">✧ ${op.card.negativeSkill.name}: ${op.card.negativeSkill.desc}</div>` : ''}
            </div>
              </details>
              <div class="bc-buffs" id="buffs-op">${buffIcons(op)}</div>
          </div>
          `}

          <div class="vs-area" id="vs-area">
            <div id="phase-text" class="phase-text">${phasePrompt(s)}</div>
          </div>

          <div class="battle-card-wrap self-side ${s.attackerIdx === s.myIndex ? 'active-attacker' : ''} ${me.isDead ? 'dead' : ''}" id="card-me">
            <div class="bc-multi" id="multi-me">${multiTag(getM(me,subj))}</div>
            <div class="battle-card ${getAuraClass(me)}" style="border: 3px solid ${s.attackerIdx === s.myIndex ? 'var(--red)' : 'transparent'}">
              <img src="${me.card?.image||''}" alt="" onerror="this.style.display='none'">
              <div class="bc-name">${me.card?.name||'???'}</div>
              ${s.attackerIdx === s.myIndex ? `<div class="atk-badge-lg">ATTACKING</div>` : ''}
              ${me.isDead ? `<div class="dead-overlay">已阵亡</div>` : ''}
            </div>
            <div class="bc-hp">
              <div class="hp-bar-h friendly" id="hp-me" style="width:${pct(me.hp,me.maxHp)}%"></div>
              <span class="hp-label" id="hp-me-t">${me.hp}</span>
            </div>
            ${s.gameMode === 'sanguosha' ? `<div class="bc-identity-badge">${identityName(me.identity)}</div>` : ''}
            <details class="skill-details">
              <summary style="font-size:0.75rem; color:var(--text-secondary); cursor:pointer; text-align:center; padding-top:4px;">查看技能 (点击展开)</summary>
              <div class="skill-desc-box">
              ${me.card?.positiveSkill ? `<div class="skill-desc-line pos">✦ ${me.card.positiveSkill.name}: ${me.card.positiveSkill.desc}</div>` : ''}
              ${me.card?.neutralSkill ? `<div class="skill-desc-line neu">⬩ ${me.card.neutralSkill.name}: ${me.card.neutralSkill.desc}</div>` : ''}
              ${me.card?.negativeSkill ? `<div class="skill-desc-line neg">✧ ${me.card.negativeSkill.name}: ${me.card.negativeSkill.desc}</div>` : ''}
            </div>
              </details>
              <div class="bc-buffs" id="buffs-me">${buffIcons(me)}</div>
          </div>
        </div>

        <div class="dice-area" id="dice-area"></div>
        <div class="action-bar" id="action-bar">${actionButtons(s)}</div>
        <div class="tactical-bar" id="tactical-bar">${tacticalBarHTML(s)}</div>
      </main>

      <aside class="sidebar sidebar-right" id="sidebar-reroll">
        <div class="sidebar-title">重投</div>
        <div class="reroll-count" id="reroll-count">剩余 <strong>${me.rerolls}</strong> 次</div>
        <p class="reroll-hint" id="reroll-hint">点击骰子选中后重投</p>
        <button id="btn-reroll" class="btn btn-secondary" style="width:100%;display:none;">重投选中</button>
      </aside>
    </div>
    <div class="battle-log-bar" id="battle-log"></div>
  `;
}
// ── 事件绑定 (仅初始化时调用一次) ──
function bindCoreEvents() {
  on('btn-roll', 'click', () => { playDiceRoll(); gameSocket.rollDice(); disableBtn('btn-roll'); });
  on('btn-confirm', 'click', () => {
    const sel = document.querySelectorAll('.die.selected');
    const indices = [...sel].map(d => parseInt(d.dataset.idx));
    gameSocket.confirmDice(indices);
    disableBtn('btn-confirm'); hide('btn-reroll');
  });
  // btn-reroll 在 sidebar 中，只绑一次
  const rr = document.getElementById('btn-reroll');
  if (rr) rr.onclick = () => {
    const sel = document.querySelectorAll('.die.selected');
    if (sel.length === 0) return;
    rr.disabled = true;
    rr.dataset.rerolling = 'true';
    playDiceRoll();
    gameSocket.rerollDice([...sel].map(d => parseInt(d.dataset.idx)));
    sel.forEach(d => d.classList.remove('selected'));
    hide('btn-reroll');
  };
  on('btn-reschedule', 'click', () => showRescheduleModal());
}

// ── 仅重绑 action-bar 内的按钮 (refreshAll 每次重建 action-bar HTML) ──
function rebindActionButtons() {
  const roll = document.getElementById('btn-roll');
  if (roll) roll.onclick = () => { playDiceRoll(); gameSocket.rollDice(); disableBtn('btn-roll'); };
  const conf = document.getElementById('btn-confirm');
  if (conf) conf.onclick = () => {
    const sel = document.querySelectorAll('.die.selected');
    const indices = [...sel].map(d => parseInt(d.dataset.idx));
    gameSocket.confirmDice(indices);
    disableBtn('btn-confirm'); hide('btn-reroll');
  };
  const buy = document.getElementById('btn-buy-water');
  if (buy) buy.onclick = () => { gameSocket.buyWater(); disableBtn('btn-buy-water'); };
}

// ── 刷新所有 UI ──
function refreshAll() {
  const subj = curSubj();
  // HP
  setHP('hp-me', S.me.hp, S.me.maxHp, 'hp-me-t');
  if (S.gameMode === '1v1') {
    setHP('hp-op', S.opponent.hp, S.opponent.maxHp, 'hp-op-t');
    setText('multi-op', multiTag(getM(S.opponent, subj)));
    const bOp = document.getElementById('buffs-op'); if (bOp) bOp.innerHTML = buffIcons(S.opponent);
    // 动态更新对手 aura
    const opCard = document.querySelector('#card-op .battle-card');
    if (opCard) updateAura(opCard, S.opponent);
  } else {
    const grid = document.getElementById('ffa-grid-container');
    if (grid) grid.innerHTML = buildFfaGrid(S);
  }
  // FXR dream domain background & ultimate VFX trigger
  const anyDreaming = (S.players || []).some(p => p.inDreamState && !p.lgpyForm);
  let dreamBg = document.getElementById('fxr-dream-bg');
  if (anyDreaming && !dreamBg) {
    dreamBg = document.createElement('div');
    dreamBg.id = 'fxr-dream-bg';
    dreamBg.className = 'fxr-dream-bg';
    document.body.appendChild(dreamBg);
    vfxManager.triggerUltimateVFX('char_fxr', 'DREAM_KING', document.body);
  } else if (!anyDreaming && dreamBg) {
    dreamBg.remove();
  }

  // Multipliers & Buffs
  setText('multi-me', multiTag(getM(S.me, subj)));
  const bMe = document.getElementById('buffs-me'); if (bMe) bMe.innerHTML = buffIcons(S.me);
  // 动态更新自己 aura
  const meCard = document.querySelector('#card-me .battle-card');
  if (meCard) updateAura(meCard, S.me);
  // Schedule
  const sb = document.getElementById('sidebar-schedule');
  if (sb) {
    const hasR = S.me.hasReschedule;
    sb.innerHTML = `<div class="sidebar-title">课程表</div>${scheduleHTML(S)}${hasR ? '<button id="btn-reschedule" class="btn btn-secondary" style="width:100%;margin-top:8px;font-size:.78rem;">调课</button>' : ''}`;
    if (hasR) on('btn-reschedule', 'click', () => showRescheduleModal());
  }
  // Reroll count
  setText('reroll-count', `剩余 <strong>${S.me.rerolls}</strong> 次`);
  const rrEl = document.getElementById('btn-reroll');
  if (rrEl) delete rrEl.dataset.rerolling;
  // Phase & actions
  setText('phase-text', phasePrompt(S));
  setText('action-bar', actionButtons(S));
  setText('tactical-bar', tacticalBarHTML(S));
  rebindActionButtons();
  // Dice - render if available
  renderDice();
  // Check dream target modal
  checkDreamTargetModal(S);
  checkDraftShopModal(S);
}

function checkDreamTargetModal(s) {
  const existing = document.getElementById('dream-target-modal');
  const fxr = s.players?.find(p => (p.card?.positiveSkill?.id === 'dream_king' || p.cardId === 'char_fxr'));
  if (s.phase === 'battle' && fxr && fxr.inDreamState && !fxr.lgpyForm && s.me.id !== fxr.id && fxr.dreamTargetChoice === null) {
    if (existing) return;
    const overlay = document.createElement('div');
    overlay.className = 'result-overlay';
    overlay.id = 'dream-target-modal';
    overlay.style.zIndex = '10000';
    overlay.innerHTML = `
      <div class="dream-target-modal-panel">
        <h2 style="color:var(--accent); margin-bottom:6px; font-size:1.35rem; font-family:var(--font-display);">梦境之王 - 盲选真身</h2>
        <p style="font-size:0.88rem; color:var(--text); margin-bottom:14px; line-height:1.4;">付修然展开了梦境领域！出现 1 个本体与 2 个分身，请盲选本节课的攻击目标：</p>
        <div class="dream-target-cards-container">
          <button class="dream-target-btn" onclick="window._pickDreamTarget(0)">
            目标 A
          </button>
          <button class="dream-target-btn" onclick="window._pickDreamTarget(1)">
            目标 B
          </button>
          <button class="dream-target-btn" onclick="window._pickDreamTarget(2)">
            目标 C
          </button>
        </div>
        <p style="font-size:0.75rem; color:var(--text-secondary);">* 选错分身：分身使用超强骰池 (D7+D9+D9+D9+D11) 且无法伤及本体！</p>
      </div>
    `;
    document.body.appendChild(overlay);
    window._pickDreamTarget = (idx) => {
      gameSocket.chooseDreamTarget(idx);
      overlay.remove();
    };
  } else {
    if (existing) existing.remove();
  }
}

// ── 战术卡 & 补给站 Modal ──
// ── KARDS Style Tactical Hand ──
window._toggleHand = () => {
  const fan = document.getElementById('hand-fan-container');
  if (fan) {
    fan.classList.toggle('expanded');
    const fab = document.getElementById('hand-fab');
    if (fab) fab.classList.toggle('active');
  }
};

function tacticalBarHTML(s) {
  if (!s || !s.me) return '';
  const me = s.me;
  const tp = me.tp || 0;
  const handCards = me.handCards || [];
  const curSubj = s.schedule[s.currentClassIndex];
  const canUseClass = me.card?.subjects?.includes(curSubj);

  let cardsHtml = '';
  if (handCards.length === 0) {
    cardsHtml = `<div style="color:var(--text-secondary); text-align:center; margin-top:40px;">暂无战术卡</div>`;
  } else {
    cardsHtml = handCards.map((c, i) => {
      if (c.hidden) return '';
      const typeClass = c.type || 'buff';
      const scopeLabel = c.subject === 'universal' ? '通用' : (SUBJECTS[c.subject]?.label || c.subject);
      
      const canAfford = tp >= c.tpCost;
      const subjMatch = c.subject === 'universal' || c.subject === curSubj;
      const canPlay = canAfford && (c.subject === 'universal' || (subjMatch && canUseClass));

      let disableReason = '';
      if (!canPlay) {
         if (!subjMatch && c.subject !== 'universal') disableReason = `限当节课`;
         else if (!canUseClass && c.subject !== 'universal') disableReason = '非自身选科';
         else if (!canAfford) disableReason = 'TP不足';
      }

      // 扇形展开的角度计算 (-15deg, 0deg, 15deg)
      const total = handCards.length;
      const mid = (total - 1) / 2;
      const rotateDeg = (i - mid) * 15;
      const transY = Math.abs(i - mid) * 10;

      return `
        <div class="hand-card-kards ${canPlay ? '' : 'disabled'}" style="transform: rotate(${rotateDeg}deg) translateY(${transY}px)" ${canPlay ? `onclick="window._toggleHand(); window._playTacticalCard('${c.id}', event)"` : ''} title="${disableReason}">
          <div class="card-tag-row">
            <span class="card-tag-type ${typeClass}">${scopeLabel}</span>
            <span class="card-tp-cost">⚡${c.tpCost}</span>
          </div>
          <div class="card-title-text">${c.name}</div>
          <div class="card-desc-text">${c.desc}</div>
          ${!canPlay ? `<div class="card-disable-overlay">${disableReason}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  let blessingsHtml = '';
  if (me.activeBlessings && me.activeBlessings.length > 0) {
    blessingsHtml = `<div class="blessing-badges">
      ${me.activeBlessings.map(b => `<div class="blessing-badge" title="${b.name}">✦</div>`).join('')}
    </div>`;
  }

  return `
    <div class="hand-fab-container">
      ${blessingsHtml}
      <button class="hand-fab" id="hand-fab" onclick="window._toggleHand()">
        <span class="fab-icon">🃏</span> 
        <span class="fab-count">${handCards.length}/3</span>
        <span class="fab-tp">⚡${tp}</span>
      </button>
      <div class="hand-fan-container" id="hand-fan-container">
        ${cardsHtml}
      </div>
    </div>
  `;
}

window._showToast = (msg) => {
  const t = document.createElement('div');
  t.className = 'toast show';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
};

// 重写原有的购买函数以提供反馈
const originalBuy = window._buyDraftCard;
window._buyDraftCard = (idx) => {
  if (originalBuy) originalBuy(idx);
  window._showToast("购买成功！");
  setTimeout(refreshAll, 50); // 立即刷新UI
};

function checkDraftShopModal(s) {
  const existing = document.getElementById('draft-shop-modal');
  if (s.draftShop && s.draftShop.active && s.me) {
    const pDraft = s.draftShop.players?.[s.me.id];
    if (!pDraft) return;

    const renderSlots = () => {
      return pDraft.slots.map((slot, idx) => {
        const c = slot.card;
        if (!c) return `<div class="draft-slot-card empty"><p>已购买</p></div>`;
        const typeClass = c.type || 'buff';
        const isHandFull = (s.me.handCards || []).length >= 3;
        const isAfford = s.me.tp >= c.tpCost;
        const buyDisabled = isHandFull || !isAfford;
        let disableReason = '';
        if (isHandFull) disableReason = '手牌已满';
        else if (!isAfford) disableReason = 'TP不足';
        
        const stars = '★'.repeat(c.tpCost) + '☆'.repeat(3 - c.tpCost);

        return `
          <div class="draft-slot-card ${buyDisabled ? 'disabled' : 'clickable'}" ${buyDisabled ? '' : `onclick="window._buyDraftCard(${idx})"`}>
            <button class="btn-icon-refresh" ${slot.refreshesLeft > 0 ? '' : 'disabled'} onclick="event.stopPropagation(); window._refreshDraftSlot(${idx})" title="刷新 (${slot.refreshesLeft})">↻</button>
            <div class="draft-card-star">${stars}</div>
            <div style="font-size:0.95rem; font-weight:800; color:var(--text-main); margin-top:8px;">${c.name}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.3; min-height:40px; margin-top:6px;">${c.desc}</div>
            ${buyDisabled ? `<div class="card-disable-overlay">${disableReason}</div>` : ''}
          </div>
        `;
      }).join('');
    };

    if (pDraft.ready) {
      if (existing) {
        existing.querySelector('.draft-shop-panel').innerHTML = `
          <h2 style="color:var(--gold); font-size:1.2rem; margin-bottom:8px;">⚡ 战术补给站</h2>
          <p style="color:var(--accent); font-size:1rem; animation:pulse 1s infinite;">已完成选牌，等待对方选择…</p>
        `;
      }
      return;
    }

    if (existing) {
      const slotsWrap = existing.querySelector('#draft-slots-wrap');
      if (slotsWrap) slotsWrap.innerHTML = renderSlots();
      const subTitle = existing.querySelector('.draft-shop-panel p');
      if (subTitle) {
        subTitle.innerHTML = `下节课即将开始！点击卡面直接购买（当前持有: ${s.me.handCards?.length || 0}/3 | 战术点: ⚡${s.me.tp}）`;
      }
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'result-overlay';
    overlay.id = 'draft-shop-modal';
    overlay.style.zIndex = '9999';

    overlay.innerHTML = `
      <div class="draft-shop-panel">
        <h2 style="color:var(--gold); font-size:1.25rem; margin-bottom:4px;">战术补给站</h2>
        <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:12px;">
          下节课即将开始！点击卡面直接购买（当前持有: ${s.me.handCards?.length || 0}/3 | 战术点: ⚡${s.me.tp}）
        </p>
        <div class="draft-slots-container" id="draft-slots-wrap">
          ${renderSlots()}
        </div>
        <div style="text-align:center; margin-top:14px;">
          <button class="btn btn-primary btn-lg" onclick="window._confirmDraftReady()" style="min-width:180px;">
            完成选牌
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  } else {
    if (existing) existing.remove();
  }
}

// ── FFA UI ──
function buildFfaGrid(s) {
  const me = s.me;
  const others = (s.players || []).filter(p => p.id !== me?.id);
  const isTargeting = s.turnPhase === 'choose_target' && s.isMyAttackTurn;
  
  let html = `<div class="ffa-opponents-grid" style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-bottom:12px;">`;
  others.forEach(p => {
    if (!p || !p.card) return;
    const isDefender = s.defenderIdx !== null && s.players[s.defenderIdx]?.id === p.id;
    const isAttacker = s.attackerIdx !== null && s.players[s.attackerIdx]?.id === p.id;
    const canBeTargeted = isTargeting && !p.isDead;
    const identityDisplay = p.identity === 'lord' ? '👑主' : (p.identity === '?' ? '❓' : identityName(p.identity));
    
    html += `
      <div data-pid="${p.id}" class="ffa-micro-card ${getAuraClass(p)} ${isDefender ? 'active-target' : ''} ${isAttacker ? 'active-attacker' : ''} ${p.isDead ? 'dead' : ''} ${canBeTargeted ? 'selectable-target' : ''}" 
           style="position:relative; width:80px; background:var(--bg-card); border:2px solid ${isDefender ? 'var(--red)' : (isAttacker ? 'var(--gold)' : (canBeTargeted ? 'var(--accent)' : 'var(--bg-inset)'))}; border-radius:8px; padding:4px; text-align:center; cursor:${canBeTargeted ? 'pointer' : 'default'}; transition:all 0.2s;"
           ${canBeTargeted ? `onclick="window.selectFfaTarget('${p.id}')"` : ''}>
        <div style="font-size:10px; color:var(--text-secondary); margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.nickname}</div>
        <div class="micro-avatar-wrap" style="position:relative;">
          <img src="${p.card?.image||''}" alt="" onerror="this.style.display='none'" style="width:40px; height:40px; border-radius:50%; object-fit:cover; margin:0 auto; display:block; filter:${p.isDead ? 'grayscale(1)' : 'none'}">
          ${isAttacker ? `<div class="atk-badge" style="position:absolute; bottom:-4px; left:50%; transform:translateX(-50%); background:var(--red); color:#fff; font-size:8px; padding:0 4px; border-radius:4px; font-weight:900;">ATK</div>` : ''}
          ${p.isDead ? `<div style="position:absolute; inset:0; background:rgba(0,0,0,0.4); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:900;">已阵亡</div>` : ''}
        </div>
        <div style="position:absolute; top:-4px; right:-4px; background:var(--bg-card); border-radius:10px; font-size:10px; padding:0 4px; border:1px solid var(--bg-inset);">${identityDisplay}</div>
        <div class="hp-bar-h enemy" style="width:${pct(p.hp,p.maxHp)}%; height:4px; margin-top:4px; border-radius:2px;"></div>
        <div style="font-size:9px; color:var(--text-main); margin-top:2px;">${p.hp}/${p.maxHp}</div>
      </div>
      </div>
    `;
  });
  html += `</div>`;
  if (isTargeting) {
    html += `<div style="text-align:center; color:var(--accent); font-weight:bold; font-size:1.1rem; animation:pulse 1s infinite;">请选择你要攻击的目标！</div>`;
  }
  return html;
}

// ── 掷骰展示 ──
function renderDice() {
  const area = document.getElementById('dice-area');
  if (!area) return;

  const isMeAtk = S.myIndex === S.attackerIdx;
  const isMeDef = S.myIndex === S.defenderIdx;

  let atkPlayer, defPlayer;
  if (S.gameMode === '1v1') {
    atkPlayer = isMeAtk ? S.me : S.opponent;
    defPlayer = isMeAtk ? S.opponent : S.me;
  } else {
    atkPlayer = (S.players && S.attackerIdx !== null && S.attackerIdx !== undefined) ? S.players[S.attackerIdx] : null;
    defPlayer = (S.players && S.defenderIdx !== null && S.defenderIdx !== undefined) ? S.players[S.defenderIdx] : null;
  }

  // 使用 effectiveDicePool 以正确反映状态覆盖后的骰池
  const atkPool = atkPlayer?.effectiveDicePool || atkPlayer?.card?.dicePool || [];
  const defPool = defPlayer?.effectiveDicePool || defPlayer?.card?.dicePool || [];

  let html = '';
  if (S.attackRolls) {
    // 攻击骰：由 attackerIdx 掷出
    const canSelect = S.turnPhase === 'atk_rolled' && S.isMyAttackTurn;
    html += `<div class="dice-row"><span class="dice-label" style="color:var(--gold)">攻</span>`;
    html += S.attackRolls.map((v, i) => {
      const isKept = S.atkResult?.keptIndices?.includes(i);
      let face = atkPool[i] || 6;
      if (S.isExtraTurn && S.extraTurnFaceBoost) {
        face += S.extraTurnFaceBoost;
      }
      // 殷泽轩屏蔽：如果不是我掷出的且对方是 YZX
      const isYzx = v === -1 || (atkPlayer && atkPlayer.stealth);
      const color = DICE_COLORS[face];
      let style = color ? `border-color:${color.border}; color:${color.border};` : '';
      if (S.atkResult && !isKept) style += 'opacity:0.3;';
      const displayVal = isYzx ? '?' : v;
      return `<div class="die attack${canSelect ? ' selectable' : ''}${canSelect ? ' rolling' : ''}" style="${style}" data-idx="${i}" data-val="${v}">
        ${color && !isYzx ? `<div class="die-corner" style="color:${color.border};background:${color.bg}">${color.label}</div>` : ''}
        ${displayVal}
      </div>`;
    }).join('');
    if (S.atkResult) {
      const sum = S.atkResult.baseAtk;
      const bonus = S.atkResult.bonusDamage ? `+${S.atkResult.bonusDamage}` : '';
      html += `<span class="dice-sum" style="color:var(--gold)">= ${sum}${bonus}</span></div>`;
    } else {
      html += `</div>`;
    }
  }
  if (S.defenseRolls || (S.aoeDefenses && S.aoeDefenses[S.me.id] && S.aoeDefenses[S.me.id].rolls)) {
    // 防御骰
    const canSelect = S.turnPhase === 'def_rolled' && S.isMyDefendTurn;
    const rollsToRender = S.aoeDefenses ? S.aoeDefenses[S.me.id].rolls : S.defenseRolls;
    const isConfirmed = S.aoeDefenses ? S.aoeDefenses[S.me.id].confirmed : false;
    
    html += `<div class="dice-row"><span class="dice-label" style="color:var(--blue)">守</span>`;
    if (rollsToRender) {
      html += rollsToRender.map((v, i) => {
        const face = defPool[i] || 6;
        const color = DICE_COLORS[face];
        // 如果点数是 -1，说明被后端屏蔽了
        const isYzx = v === -1 || (defPlayer && defPlayer.stealth);
        let style = color ? `border-color:${color.border}; color:${color.border};` : '';
        if (isConfirmed) style += 'opacity:0.5;';
        const displayVal = isYzx ? '?' : v;
        return `<div class="die defense${(canSelect && !isConfirmed) ? ' selectable' : ''}" style="${style}" data-idx="${i}" data-val="${v}">
          ${color && !isYzx ? `<div class="die-corner" style="color:${color.border};background:${color.bg}">${color.label}</div>` : ''}
          ${displayVal}
        </div>`;
      }).join('');
    }
    html += `<span class="dice-sum" style="color:var(--blue)">${isConfirmed ? ' 已确认' : ''}</span></div>`;
  }
  area.innerHTML = html;
  const diceEls = area.querySelectorAll('.die.rolling, .die.selectable');
  if (diceEls.length > 0) {
    const vals = Array.from(diceEls).map(d => parseInt(d.dataset.val || '0'));
    vfxManager.rollDice(diceEls, vals);
  }
  area.querySelectorAll('.die.selectable').forEach(d => {
    d.addEventListener('click', () => { d.classList.toggle('selected'); updateActionButtons(); });
  });
  updateActionButtons();
}

function updateActionButtons() {
  const area = document.getElementById('dice-area');
  const btnReroll = document.getElementById('btn-reroll');
  const btnConfirm = document.getElementById('btn-confirm');
  if (!area) return;

  const sel = area.querySelectorAll('.die.selected');
  const count = sel.length;
  
  let currentSum = 0;
  sel.forEach(d => {
    currentSum += parseInt(d.dataset.val || '0');
  });
  
  if (btnReroll) {
    btnReroll.style.display = count > 0 && S.me.rerolls > 0 ? 'block' : 'none';
    if ((S.me.buffs && S.me.buffs.find(b => b.id === 'sugar_crash')) || btnReroll.dataset.rerolling === 'true') {
      btnReroll.disabled = true;
      if (S.me.buffs && S.me.buffs.find(b => b.id === 'sugar_crash')) btnReroll.innerHTML = '🚫 犯糖';
    } else {
      btnReroll.disabled = false;
      btnReroll.innerHTML = '重投';
    }
  }
  
  if (btnConfirm) {
    const isAtk = S.turnPhase === 'atk_rolled' && S.isMyAttackTurn;
    const isDef = S.turnPhase === 'def_rolled' && S.isMyDefendTurn;
    const target = isAtk ? S.me.card.atkSlots : (isDef ? S.me.card.defSlots : 99);
    
    // 李灿献祭逻辑
    const btnSacrifice = document.getElementById('btn-sacrifice');
    if (btnSacrifice) {
      if (isDef && S.me.cardId === 'char_8' && count === target) {
        btnSacrifice.style.display = 'block';
      } else {
        btnSacrifice.style.display = 'none';
      }
    }

    if (target === -1) {
      // ... same
      if (count > 0) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = `✓ 确认 (已选 ${count} 颗) 总和:${currentSum}`;
      } else {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = `至少选 1 颗`;
      }
    } else {
      if (count === target) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = `✓ 确认 (${count}/${target}) 总和:${currentSum}`;
      } else {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = `需选 ${target} 颗 (已选 ${count})`;
      }
    }
  }
}

// 献祭弹窗
window._showSacrifice = () => {
  const sel = document.querySelectorAll('.die.defense.selected');
  let opts = '';
  sel.forEach(d => {
    opts += `<button class="btn btn-secondary" onclick="window._doSacrifice(${d.dataset.idx})">献祭 ${d.dataset.val}</button>`;
  });
  const m = document.createElement('div');
  m.className = 'result-overlay';
  m.id = 'sacrifice-modal';
  m.innerHTML = `<div class="panel"><h3>选择一个骰子进行献祭</h3><p>该骰子变1，回复其点数-1的HP</p>${opts}</div>`;
  document.body.appendChild(m);
};

window._doSacrifice = (idx) => {
  const indices = Array.from(document.querySelectorAll('.die.defense.selected')).map(d => parseInt(d.dataset.idx));
  gameSocket.confirmDice(indices, { sacrificeIndex: idx });
  document.getElementById('sacrifice-modal').remove();
};

// ── 增益/状态图标 ──
function buffIcons(p) {
  if (!p) return '';
  let h = '';
  if (p.hasReschedule) h += `<div class="buff-icon buff-neutral" title="拥有调课权"><span class="buff-label">调课</span></div>`;
  if (p.permanentDefPenalty) h += `<div class="buff-icon buff-debuff" title="体力透支: 防御力永久 -${p.permanentDefPenalty}"><span class="buff-label">-${p.permanentDefPenalty}DEF</span></div>`;
  if (p.buffs && p.buffs.find(b => b.id === 'sugar_crash')) h += `<div class="buff-icon buff-debuff buff-sugar" title="犯糖: 禁锢重投，回合开始受击"><span class="buff-label">犯糖</span></div>`;
  if (p.redHeat > 0) h += `<div class="buff-icon buff-debuff buff-heat" title="红温: ${p.redHeat}层"><span class="buff-label">${p.redHeat}</span></div>`;
  if (p.chargeStacks > 0) h += `<div class="buff-icon buff-charge" title="蓄势: ${p.chargeStacks}层"><span class="buff-label">${p.chargeStacks}</span></div>`;
  if (p.stickers > 0) h += `<div class="buff-icon buff-debuff buff-sticker" title="贴画: ${p.stickers}张"><span class="buff-label">${p.stickers}</span></div>`;
  if (p.invertReduction > 0) h += `<div class="buff-icon buff-neutral" title="深度思考: 永久减伤 ${p.invertReduction}"><span class="buff-label">-${p.invertReduction}DMG</span></div>`;
  if (p.nineLivesUsed) h += `<div class="buff-icon buff-neutral" title="九条命已触发"><span class="buff-label">D10</span></div>`;

  // 付修然 (fxr) 状态
  if (p.dreamStacks > 0 && !p.inDreamState) {
    h += `<div class="buff-icon buff-dream" title="梦境层数: ${p.dreamStacks}/3"><span class="buff-label">${p.dreamStacks}/3</span></div>`;
  }
  if (p.inDreamState && !p.lgpyForm) {
    h += `<div class="buff-icon buff-dream-active" title="梦境领域开启中"><span class="buff-label">梦境</span></div>`;
  }
  if (p.lgpyForm) {
    h += `<div class="buff-icon buff-gpy" title="gpy 狂暴斩杀形态"><span class="buff-label">狂暴</span></div>`;
  }
  return h;
}

// ── 攻击确认回调 ──
function onAtkConfirmed(data) {
  const ar = data.atkResult;
  const phase = document.getElementById('phase-text');
  if (phase) phase.innerHTML = buildAlerts(data);

  setTimeout(() => refreshAll(), 600);
}

// ── 辅助：构建提示信息 ──
function buildAlerts(data) {
  let alerts = [];
  const ar = data.atkResult || {};

  if (ar.posTriggered) alerts.push(`<div class="skill-alert positive">[${ar.posName}] 发动</div>`);
  if (ar.negTriggered) alerts.push(`<div class="skill-alert negative">[${ar.negName}] 发动</div>`);

  const results = data.isAoE ? (Array.isArray(data.aoeResults) ? data.aoeResults : []) : [data];

  results.forEach(res => {
    if (res.defPosTriggered) alerts.push(`<div class="skill-alert positive">[${res.defPosName}] 发动</div>`);
    if (res.defNegTriggered) alerts.push(`<div class="skill-alert negative">[${res.defNegName}] 发动</div>`);
    
    if (res.lcCounterDamage > 0) alerts.push(`<div class="skill-alert positive">反击伤害: ${res.lcCounterDamage}</div>`);
    if (res.lcHealTriggered) alerts.push(`<div class="skill-alert positive">献祭回复: ${res.healAmount}HP</div>`);
    if (res.eatTriggered) alerts.push(`<div class="skill-alert positive">吃掉！攻击降为 2</div>`);
    if (res.noobTriggered) alerts.push(`<div class="skill-alert negative">杂鱼反噬 — 血量减半！</div>`);
    if (res.detonateTriggered) alerts.push(`<div class="skill-alert negative">红温引爆 — ${res.detonateDamage}伤害！</div>`);
    if (res.redHeatApplied > 0) alerts.push(`<div class="skill-alert negative">红温 +${res.redHeatApplied}层</div>`);
    if (res.extraTurnTriggered) alerts.push(`<div class="skill-alert positive">死磕 — 获得额外攻击回合！</div>`);
    if (res.nineLivesTriggered || data.nineLivesTriggered) alerts.push(`<div class="skill-alert positive">九条命 — 满血复活！</div>`);
  });

  if (data.firstBloodTriggered) alerts.push(`<div class="skill-alert negative">偏科 — 防御选骰数 -1！</div>`);

  return [...new Set(alerts)].join('');
}

// ── 回合结算回调 (含攻击动画) ──
export function onTurnResolved(data) {
  animLock = true;
  const newState = data.state;
  const { damage, finalDef, penalty, gameOver, attackerIdx } = data;

  const phase = document.getElementById('phase-text');
  const alerts = buildAlerts(data);
  if (phase && alerts) phase.innerHTML = alerts;

  const dArea = document.getElementById('dice-area');
  if (dArea) {
    const defSumEl = dArea.querySelector('.dice-row:last-child .dice-sum');
    if (defSumEl) defSumEl.innerHTML = `= ${finalDef}${penalty ? ` <small>(−${penalty})</small>` : ''}`;
  }

  const isAoE = data.isAoE && Array.isArray(data.aoeResults);
  
  if (isAoE) {
    // FFA 群伤效果动画
    setTimeout(() => {
      if (!S || typeof S.myIndex === 'undefined') return;
      const isMyAtk = S.myIndex === attackerIdx;
      const atkId = (S.players && S.players[attackerIdx]) ? S.players[attackerIdx].id : null;
      const atkCard = (atkId && S.me && atkId === S.me.id) ? document.getElementById('card-me') : (atkId ? document.querySelector(`.ffa-micro-card[data-pid="${atkId}"]`) : null);
      if (atkCard) atkCard.classList.add('card-attacking');
      
      // Trigger character ultimate VFX for AoE attacker
      if (S && S.players && typeof attackerIdx === 'number' && S.players[attackerIdx]) {
        const atkP = S.players[attackerIdx];
        const cardId = atkP.cardId || atkP.card?.id;
        if (atkP.lgpyForm) {
          vfxManager.triggerUltimateVFX('lgpyForm', 'DREAM_KING_RAGE', document.body);
        } else if (cardId === 'char_19' && (data.pierce || data.atkResult?.pierce)) {
          vfxManager.triggerUltimateVFX('char_19', 'TIMELESS_GRACE', document.body);
        } else if (cardId === 'char_4' && data.atkResult?.posTriggered) {
          vfxManager.triggerUltimateVFX('char_4', 'STAR_SHOWOFF', document.body);
        } else if (cardId === 'char_14' && (atkP.chargeStacks >= 2 || data.chargeConsumed >= 2)) {
          vfxManager.triggerUltimateVFX('char_14', 'BUY_WATER', document.body);
        }
      }

      data.aoeResults.forEach(res => {
        const dId = res.playerId;
        const dCard = dId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${dId}"]`);
        if (dCard) setTimeout(() => dCard.classList.add('card-hit'), 300);
        
        setTimeout(() => {
          if (dCard) {
            vfxManager.playHitImpact(dCard, res.damage, {
              isCrit: res.damage >= 8,
              isHeavy: res.damage >= 15,
              nineLivesTriggered: res.nineLivesTriggered,
              isAoE: true
            });
          }
        }, 400);
      });
      
      setTimeout(() => {
        setHP('hp-me', newState.me.hp, newState.me.maxHp, 'hp-me-t');
      }, 400);

      setTimeout(() => {
        if (atkCard) atkCard.classList.remove('card-attacking');
        data.aoeResults.forEach(res => {
          const dId = res.playerId;
          const dCard = dId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${dId}"]`);
          if (dCard) dCard.classList.remove('card-hit');
        });
        
        setTimeout(() => {
          S = newState;
          animLock = false;
          refreshAll();
          data.aoeResults.forEach(r => addLog(r));
          if (data.gameOver) setTimeout(() => showGameOver(S), 800);
        }, data.classChanged ? 1500 : 500);
      }, 1500);
    }, 800);
  } else {
    // 1v1 动画
    setTimeout(() => {
      if (!S || typeof S.myIndex === 'undefined') return;
      const isMyAtk = S.myIndex === attackerIdx;
      let atkCard, defCard;
      if (S.gameMode === '1v1') {
        atkCard = document.getElementById(isMyAtk ? 'card-me' : 'card-op');
        defCard = document.getElementById(isMyAtk ? 'card-op' : 'card-me');
      } else {
        const atkId = (S.players && S.players[attackerIdx]) ? S.players[attackerIdx].id : null;
        const defId = (S.defenderIdx !== null && S.defenderIdx !== undefined && S.players && S.players[S.defenderIdx]) ? S.players[S.defenderIdx].id : null;
        atkCard = (atkId && S.me && atkId === S.me.id) ? document.getElementById('card-me') : (atkId ? document.querySelector(`.ffa-micro-card[data-pid="${atkId}"]`) : null);
        defCard = (defId && S.me && defId === S.me.id) ? document.getElementById('card-me') : (defId ? document.querySelector(`.ffa-micro-card[data-pid="${defId}"]`) : null);
      }

      if (atkCard) atkCard.classList.add('card-attacking');
      if (defCard) setTimeout(() => defCard.classList.add('card-hit'), 300);

      setTimeout(() => {
        // Trigger character ultimate VFX if conditions are met
        if (S && S.players && typeof attackerIdx === 'number' && S.players[attackerIdx]) {
          const atkP = S.players[attackerIdx];
          const cardId = atkP.cardId || atkP.card?.id;
          if (atkP.lgpyForm) {
            vfxManager.triggerUltimateVFX('lgpyForm', 'DREAM_KING_RAGE', document.body);
          } else if (cardId === 'char_19' && (data.pierce || data.atkResult?.pierce)) {
            vfxManager.triggerUltimateVFX('char_19', 'TIMELESS_GRACE', document.body);
          } else if (cardId === 'char_4' && data.atkResult?.posTriggered) {
            vfxManager.triggerUltimateVFX('char_4', 'STAR_SHOWOFF', document.body);
          } else if (cardId === 'char_14' && (atkP.chargeStacks >= 2 || data.chargeConsumed >= 2)) {
            vfxManager.triggerUltimateVFX('char_14', 'BUY_WATER', document.body);
          }
        }

        if (defCard) {
          vfxManager.playHitImpact(defCard, damage, {
            isCrit: damage >= 8,
            isHeavy: damage >= 15,
            nineLivesTriggered: data.nineLivesTriggered,
            pierce: data.pierce
          });
        }
        playHit(damage >= 8);
        setHP('hp-me', newState.me.hp, newState.me.maxHp, 'hp-me-t');
        if (newState.gameMode === '1v1') {
          setHP('hp-op', newState.opponent.hp, newState.opponent.maxHp, 'hp-op-t');
        }
      }, 400);

      setTimeout(() => {
        if (atkCard) atkCard.classList.remove('card-attacking');
        if (defCard) defCard.classList.remove('card-hit');
        
        setTimeout(() => {
          S = newState;
          animLock = false;
          refreshAll();
          addLog(data);
          if (data.gameOver) setTimeout(() => showGameOver(S), 800);
        }, data.classChanged ? 1500 : 500);
      }, 1500);
    }, 800);
  }
}

// ── 换课动画 ──
function showClassChange(data) {
  setTimeout(() => {
    const s = SUBJECTS[data.subject];
    const overlay = document.createElement('div');
    overlay.className = 'class-change-overlay';
    overlay.innerHTML = `
      <div class="class-change-content">
        <div class="cc-icon">${s?.icon || '📝'}</div>
        <div class="cc-label">第 ${data.index + 1} 节课</div>
        <div class="cc-name">${s?.label || data.subject}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => { overlay.classList.add('fade-out'); setTimeout(() => overlay.remove(), 500); }, 1800);
  }, 2500);
}

// ── 调课权弹窗 ──
function showRescheduleModal() {
  const overlay = document.createElement('div');
  overlay.className = 'result-overlay';
  overlay.id = 'reschedule-modal';
  overlay.style.zIndex = '9999';
  
  let options = '';
  for(let i = S.currentClassIndex; i < S.schedule.length; i++) {
    options += `<option value="${i}">第 ${i+1} 节课 (${SUBJECTS[S.schedule[i]]?.label || S.schedule[i]})</option>`;
  }

  const makeBtn = (arr) => arr.map(id => {
    const s = SUBJECTS[id];
    return `<button onclick="window._pickSubj('${id}')">${s.icon} ${s.label}</button>`;
  }).join('');
  
  overlay.innerHTML = `
    <div class="panel" style="max-width:360px;width:90%;">
      <p class="section-title" style="margin-bottom:8px;">使用调课权</p>
      <div style="text-align:center; margin-bottom:12px;">
        <select id="reschedule-idx-select" style="padding:4px 8px; border-radius:4px; font-family:var(--font-body); font-size:0.85rem; border:1.5px solid var(--bg-inset); background:var(--bg-warm); outline:none;">
          ${options}
        </select>
      </div>
      <div class="subject-picker">
        <div class="picker-section-label">主科</div>${makeBtn(CORE_SUBJECTS)}
        <div class="picker-section-label">选科</div>${makeBtn(ELECTIVE_SUBJECTS)}
        <div class="picker-section-label">副科</div>${makeBtn(MINOR_SUBJECTS)}
      </div>
      <div style="text-align:center;margin-top:14px;">
        <button class="btn btn-secondary" onclick="document.getElementById('reschedule-modal').remove()">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  window._pickSubj = (id) => { 
    const targetIdx = parseInt(document.getElementById('reschedule-idx-select').value);
    gameSocket.useReschedule(targetIdx, id); 
    overlay.remove(); 
  };
}

// ── 结算 ──
function showGameOver(s) {
  const o = document.createElement('div');
  o.className = 'game-over-screen';
  
  let isWin = false;
  let statusStr = '';
  
  if (s.gameMode === '1v1') {
    isWin = s.winner === s.myIndex;
    const isDraw = s.winner === 'draw';
    statusStr = isDraw ? '平 局' : (isWin ? '胜 利' : '败 北');
  } else {
    // FFA
    if (s.winner === 'lord') {
      isWin = s.me.identity === 'lord' || s.me.identity === 'loyalist';
      statusStr = isWin ? '胜 利 (主公/忠臣 赢)' : '败 北 (主公/忠臣 赢)';
    } else if (s.winner === 'rebel') {
      isWin = s.me.identity === 'rebel';
      statusStr = isWin ? '胜 利 (反贼 赢)' : '败 北 (反贼 赢)';
    } else if (s.winner === 'spy') {
      isWin = s.me.identity === 'spy';
      statusStr = isWin ? '胜 利 (内奸 赢)' : '败 北 (内奸 赢)';
    }
  }

  const statusClass = (s.gameMode === '1v1' && s.winner === 'draw') ? 'draw' : (isWin ? 'win' : 'lose');

  function renderPlayer(p, index) {
    if (!p) return '';
    const isMe = index === s.myIndex;
    const card = p.card;
    const isYzx = (p.cardId === 'char_10' || p.stealth) && !isMe;
    const hpText = isYzx ? '??' : p.hp;
    const maxHpText = isYzx ? '??' : p.maxHp;
    const hpPercent = isYzx ? 100 : (p.hp / p.maxHp) * 100;
    const identityHtml = s.gameMode === 'sanguosha' ? `<div style="color:var(--accent);font-size:0.8rem;margin-top:4px;">身份: ${p.identity==='lord'?'👑主公':(p.identity==='?'?'❓':p.identity)}</div>` : '';

    return `
      <div class="player-box ${isMe ? 'me' : 'op'} ${isYzx ? 'stealth' : ''}" style="${s.gameMode === 'sanguosha' ? 'width:45%; margin-bottom:10px;' : ''}">
        <div class="avatar-area">
          <img src="${card.image}" class="avatar" />
          ${isMe ? `<div class="badge-me">我</div>` : ''}
        </div>
        <div class="player-info">
          <div class="name-row">
            <span class="nickname">${p.nickname}</span>
            <span class="card-name">${card.name}</span>
          </div>
          ${identityHtml}
          <div class="hp-container">
            <div class="hp-bar">
              <div class="hp-bar-fill" style="width:${hpPercent}%"></div>
            </div>
            <div class="hp-text">${hpText} / ${maxHpText}</div>
          </div>
          <div class="buffs-row">${buffIcons(p)}</div>
        </div>
      </div>
    `;
  }
  
  let statsHtml = '';
  if (s.gameMode === '1v1') {
    statsHtml = `
      ${renderPlayer(s.me, s.myIndex)}
      <div class="go-vs">VS</div>
      ${renderPlayer(s.opponent, (s.myIndex + 1) % 2)}
    `;
  } else {
    statsHtml = `<div style="display:flex; flex-wrap:wrap; justify-content:space-between; max-height:400px; overflow-y:auto; width:100%;">`;
    (s.players || []).forEach((p, idx) => {
      statsHtml += renderPlayer(p, idx);
    });
    statsHtml += `</div>`;
  }

  o.innerHTML = `
    <div class="go-content ${statusClass}" style="${s.gameMode==='sanguosha'?'width:90%; max-width:800px;':''}">
      <h1 class="go-title">${statusStr}</h1>
      <div class="go-stats" style="${s.gameMode==='sanguosha'?'flex-direction:row; flex-wrap:wrap;':''}">
        ${statsHtml}
      </div>
      <div class="go-footer">
        <button class="btn btn-primary btn-lg" id="btn-back" style="min-width: 200px; padding: 12px 0;">返回大厅</button>
      </div>
    </div>
  `;
  document.body.appendChild(o);
  document.getElementById('btn-back').addEventListener('click', () => { o.remove(); navigate('lobby'); });
}

// ── 日志 ──
function addLog(r) {
  const el = document.getElementById('battle-log');
  if (!el) return;
  const d = document.createElement('span');
  d.className = 'log-item';
  d.textContent = `${r.damage > 0 ? `−${r.damage}HP` : 'MISS'}${r.pierce ? ' 穿透' : ''}${r.selfDamage ? ` 自伤${r.selfDamage}` : ''}`;
  el.prepend(d);
}

// ── 辅助 ──
function curSubj() { return S.schedule[S.currentClassIndex] || S.schedule[S.schedule.length-1]; }
function pct(c,m) { if (typeof c !== 'number' || typeof m !== 'number') return 100; return m>0 ? Math.max(0,Math.round(c/m*100)) : 0; }
function getM(p,subj) { return p.card ? getSkillMultiplier(p.card.subjects, subj) : 1; }

function getAuraClass(p) {
  if (!p) return '';
  if (p.lgpyForm) return 'aura-gpy-rage';
  if (p.inDreamState) return 'aura-dream-domain';
  if (p.chargeStacks > 0) return 'aura-zxs-water';
  if (p.cardId === 'char_19') return 'aura-yzm-gold';
  if (p.redHeat > 0) return 'aura-wyc-redheat';
  if (p.buffs && p.buffs.find(b => b.id === 'sugar_crash')) return 'aura-whd-sugar';
  return '';
}

function updateAura(el, p) {
  if (!el) return;
  const newAura = getAuraClass(p);
  vfxManager.triggerAuraEffect(el, newAura);
}

function multiTag(m) {
  if (m===2) return '<span class="multiplier x2">×2</span>';
  if (m===0.5) return '<span class="multiplier x05">×½</span>';
  return '<span class="multiplier x1">×1</span>';
}



function phasePrompt(s) {
  let p = '';
  if (s.turnPhase === 'choose_target') p = s.isMyAttackTurn ? '选择目标' : '等待攻击方选择目标…';
  if (s.turnPhase === 'waiting_atk') {
    if (s.isMyAttackTurn) {
      // 检查是否需要等待梦境盲选
      if (isDreamBlocking(s)) {
        p = '<span style="color:var(--accent);">等待对手完成梦境盲选…</span>';
      } else {
        p = '你的攻击回合';
      }
    } else {
      p = '等待攻击…';
    }
  }
  if (s.turnPhase === 'atk_rolled') p = s.isMyAttackTurn ? '选择骰子重投或确认' : '对手选择中…';
  if (s.turnPhase === 'def_rolled') p = s.isMyDefendTurn ? '你的防御 — 重投或确认' : '对手防御中…';
  
  if (s.allergyTriggered && s.isMyAttackTurn) {
    p = `<span style="color:var(--red); font-weight:bold;">过敏发作 — 伤害已锁定</span><br/>${p}`;
  }
  return p;
}

function isDreamBlocking(s) {
  if (!s || !s.players) return false;
  const fxr = s.players.find(p => (p.card?.positiveSkill?.id === 'dream_king' || p.cardId === 'char_fxr'));
  return fxr && fxr.inDreamState && !fxr.lgpyForm && fxr.dreamTargetChoice === null;
}

function actionButtons(s) {
  if (s.turnPhase === 'waiting_atk' && s.isMyAttackTurn) {
    if (isDreamBlocking(s)) {
      return '<button id="btn-roll" class="btn btn-primary btn-lg" disabled style="opacity:0.5;">等待盲选…</button>';
    }
    return '<button id="btn-roll" class="btn btn-primary btn-lg">掷骰</button>';
  }
  if (s.turnPhase === 'atk_rolled' && s.isMyAttackTurn) {
    const buyBtn = (s.me.cardId === 'char_14' && !s.hasAttackerRerolled && s.me.chargeStacks < 2) 
      ? '<button id="btn-buy-water" class="btn btn-secondary" style="margin-left:8px;">买水</button>' 
      : '';
    return `<div>
          <button id="btn-confirm" class="btn btn-success" disabled>✓ 确认</button>
          ${buyBtn}
        </div>` + `${s.me.card.atkSlots === -1 ? '至少选 1 颗' : `需选 ${s.me.card.atkSlots} 颗`}`;
  }
  if (s.turnPhase === 'def_rolled' && s.isMyDefendTurn) {
    const sacBtn = s.me.cardId === 'char_8' ? '<button id="btn-sacrifice" class="btn btn-secondary" style="display:none;" onclick="window._showSacrifice()">献祭回血</button>' : '';
    return `<div>
          <button id="btn-confirm" class="btn btn-primary" disabled>✓ 确认</button>
          ${sacBtn}
        </div>` + `需选 ${s.me.card.defSlots} 颗`;
  }
  return `<span style="color:var(--text-muted);font-size:.88rem">${phasePrompt(s)}</span>`;
}

function scheduleHTML(s) {
  return s.schedule.map((subj, i) => {
    const info = SUBJECTS[subj];
    const active = i === s.currentClassIndex;
    const past = i < s.currentClassIndex;
    return `<div class="sch-item${active?' active':''}" style="${past?'opacity:.35':''}">
      <span>${info?.icon||'📝'}</span><span class="sch-label">${info?.label||subj}</span>
    </div>`;
  }).join('');
}

function setHP(barId, hp, maxHp, txtId) {
  const bar = document.getElementById(barId);
  const txt = document.getElementById(txtId);
  const isHidden = hp === '??';
  if (bar) bar.style.width = isHidden ? '100%' : `${pct(hp, maxHp)}%`;
  if (txt) txt.textContent = isHidden ? '??' : hp;
}

function on(id, evt, fn) { document.getElementById(id)?.addEventListener(evt, fn); }
function disableBtn(id) { const b = document.getElementById(id); if(b) b.disabled = true; }
function hide(id) { const b = document.getElementById(id); if(b) b.style.display = 'none'; }

function showBanner(text) {
  const b = document.createElement('div');
  b.className = 'class-banner';
  b.textContent = text;
  document.body.appendChild(b);
  setTimeout(() => b.classList.add('fade-out'), 1500);
  setTimeout(() => b.remove(), 2000);
}
function setText(id, html) { const e = document.getElementById(id); if(e) e.innerHTML = html; }
