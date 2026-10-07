import { pct, getM, getAuraClass, multiTag, phasePrompt, actionButtons, portraitHTML, battleTopbarHTML } from './presentation.js';
import { getTacticalCardMoment, getTacticalCardUsability } from './tactical.js';
import { battleLogHTML } from './log.js';
import { buffIcons } from './status.js';
import { escapeHTML } from '../../utils/html.js';
import { SUBJECTS, IDENTITY } from '../../../shared/rules.js';

export function buildArena(s, tacticalHandOpen = false) {
  const me = s.me, op = s.opponent;
  const subj = s.schedule[s.currentClassIndex];
  const turnFlow = getTurnFlow(s);
  

  return `
    <div class="battle-view">
    <div class="arena">
      <header class="battle-topbar sidebar-left" id="sidebar-schedule">
        ${battleTopbarHTML(s)}
      </header>

      <main class="arena-center">
        <div class="card-row">
          ${ s.gameMode === 'sanguosha' ? `<div id="ffa-grid-container">${buildFfaGrid(s)}</div>` : `
          <div class="battle-card-wrap opponent-side ${s.attackerIdx !== s.myIndex ? 'active-attacker' : ''} ${op.isDead ? 'dead' : ''}" id="card-op">
            <div class="bc-multi" id="multi-op">${multiTag(getM(op,subj))}</div>
            <div class="battle-card ${getAuraClass(op)}">
              ${portraitHTML(op.card?.name, op.card?.image)}
              <div class="bc-name">${op.card?.name||'???'}</div>
              <div class="atk-badge-lg">进攻</div>
            </div>
            <div class="bc-hp ${pct(op.hp, op.maxHp) <= 25 ? 'hp-critical' : ''}" aria-label="对手生命 ${op.hp}/${op.maxHp}">
              <div class="hp-bar-h enemy" id="hp-op" data-hp="${op.hp}" style="width:${pct(op.hp,op.maxHp)}%"></div>
              <span class="hp-label" id="hp-op-t">${hpLabel(op.hp, op.maxHp)}</span>
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
              <div class="bc-buffs" id="buffs-op" aria-label="对手状态">${buffIcons(op, s)}</div>
          </div>
          `}

          <div class="vs-area" id="vs-area">
            <div class="battle-flow ${turnFlow.direction}" aria-hidden="true">
              <span class="flow-line"></span><span class="flow-arrow">${turnFlow.arrow}</span>
            </div>
            <div class="battle-round" id="battle-round">${s.isExtraTurn ? '额外回合' : `第 ${s.totalRound || 1} 回合`}</div>
            <div id="phase-text" class="phase-text" aria-live="polite" aria-atomic="true">${phasePrompt(s)}</div>
          </div>

          <div class="battle-card-wrap self-side ${s.attackerIdx === s.myIndex ? 'active-attacker' : ''} ${me.isDead ? 'dead' : ''}" id="card-me">
            <div class="bc-multi" id="multi-me">${multiTag(getM(me,subj))}</div>
            <div class="battle-card ${getAuraClass(me)}">
              ${portraitHTML(me.card?.name, me.card?.image)}
              <div class="bc-name">${me.card?.name||'???'}</div>
              <div class="atk-badge-lg">进攻</div>
              ${me.isDead ? `<div class="dead-overlay">已阵亡</div>` : ''}
            </div>
            <div class="bc-hp ${pct(me.hp, me.maxHp) <= 25 ? 'hp-critical' : ''}" aria-label="我的生命 ${me.hp}/${me.maxHp}">
              <div class="hp-bar-h friendly" id="hp-me" data-hp="${me.hp}" style="width:${pct(me.hp,me.maxHp)}%"></div>
              <span class="hp-label" id="hp-me-t">${hpLabel(me.hp, me.maxHp)}</span>
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
              <div class="bc-buffs" id="buffs-me" aria-label="我的状态">${buffIcons(me, s)}</div>
          </div>
        </div>

        <section class="battle-control-panel ${hasRenderedDice(s) ? 'has-dice' : 'is-idle'}" aria-label="本回合操作">
          <div class="dice-area" id="dice-area"></div>
          <div class="action-bar" id="action-bar">${actionButtons(s)}</div>
          <div class="battle-control-strip" id="sidebar-reroll">
            <div class="reroll-count" id="reroll-count">重投 <strong>${me.rerolls}</strong> 次</div>
            <p class="reroll-hint" id="reroll-hint">选中骰子后可重投</p>
            <button id="btn-reroll" data-battle-action="reroll" class="btn btn-secondary" style="display:none;">重投选中</button>
            ${s.gameMode === '1v1' ? '<button id="btn-surrender" data-battle-action="surrender" class="btn btn-secondary battle-surrender">投降</button>' : ''}
            <details class="battle-menu">
              <summary aria-label="更多对局操作" title="更多对局操作">&#8943;</summary>
              <div class="battle-menu-popover">
                <button id="btn-leave-battle" data-battle-action="leaveBattle" class="btn btn-secondary">退出对局</button>
              </div>
            </details>
          </div>
        </section>
        <div class="tactical-layer" id="tactical-bar">${tacticalBarHTML(s, tacticalHandOpen)}</div>
      </main>
    </div>
    ${battleLogHTML(s)}
    </div>
  `;
}

export function buildFfaGrid(s) {
  if (!s || typeof s !== 'object') return '<div class="ffa-opponents-grid"></div>';
  const players = Array.isArray(s.players) ? s.players : [];
  const me = s.me;
  const others = players.filter(p => p?.id !== me?.id);
  const isTargeting = s.turnPhase === 'choose_target' && s.isMyAttackTurn;

  let html = `<div class="ffa-opponents-grid" role="list" aria-label="其他玩家">`;
  others.forEach(p => {
    if (!p || !p.card) return;
    const isDefender = Number.isInteger(s.defenderIdx) && players[s.defenderIdx]?.id === p.id;
    const isAttacker = Number.isInteger(s.attackerIdx) && players[s.attackerIdx]?.id === p.id;
    const canBeTargeted = isTargeting && !p.isDead;
    const identityDisplay = p.identity === 'lord' ? '主将' : (p.identity === '?' ? '未知' : identityName(p.identity));
    const stateLabel = p.isDead ? '已阵亡' : (isDefender ? '当前目标' : (isAttacker ? '进攻中' : '待命'));
    const targetLabel = canBeTargeted ? '，点击选择为攻击目标' : '';
    const safeName = escapeHTML(p.nickname || '匿名玩家');
    const cardRole = canBeTargeted ? 'button' : 'listitem';

    html += `
      <div data-pid="${escapeHTML(p.id)}" class="ffa-micro-card ${getAuraClass(p)} ${isDefender ? 'active-target' : ''} ${isAttacker ? 'active-attacker' : ''} ${p.isDead ? 'dead' : ''} ${canBeTargeted ? 'selectable-target' : ''}"
           role="${cardRole}" ${canBeTargeted ? `tabindex="0" data-battle-action="selectFfaTarget" data-value="${escapeHTML(p.id)}"` : ''}
           aria-label="${safeName}${targetLabel}">
        <div class="ffa-card-topline">
          <strong class="ffa-player-name">${safeName}</strong>
          <span class="ffa-state-label">${stateLabel}</span>
        </div>
        <div class="micro-avatar-wrap">
          <img src="${escapeHTML(p.card?.image || '')}" alt="${escapeHTML(p.card?.name || '')}" onerror="this.style.display='none'">
          ${isAttacker ? `<span class="atk-badge">进攻</span>` : ''}
          ${p.isDead ? `<span class="ffa-dead-mark">阵亡</span>` : ''}
        </div>
        <div class="ffa-card-meta"><span class="identity-badge">${escapeHTML(identityDisplay)}</span><span class="ffa-character-name">${escapeHTML(p.card.name || '未知角色')}</span></div>
        <div class="ffa-hp-row"><div class="ffa-hp-track"><span style="width:${pct(p.hp, p.maxHp)}%"></span></div><span>${escapeHTML(p.hp)}/${escapeHTML(p.maxHp)}</span></div>
        <div class="bc-buffs ffa-buffs" aria-label="${safeName}的状态">${buffIcons(p, s)}</div>
      </div>
    `;
  });
  html += `</div>`;
  if (isTargeting) {
    html += `<div class="ffa-targeting-hint"><span aria-hidden="true">◎</span><strong>选择攻击目标</strong><span>点击一名存活玩家</span></div>`;
  }
  return html;
}

export function getTurnFlow(state) {
  if (state.attackerIdx === state.myIndex) return { direction: 'toward-opponent', arrow: '←' };
  const meIsDefender = state.gameMode === '1v1' || state.defenderIdx === state.myIndex || state.isMyDefendTurn;
  return meIsDefender
    ? { direction: 'toward-me', arrow: '→' }
    : { direction: 'neutral', arrow: '↔' };
}

export function hpLabel(hp, maxHp) {
  return hp === '??' ? '??' : `${hp} / ${maxHp}`;
}

export function hasRenderedDice(state) {
  return !!(state?.attackRolls || state?.defenseRolls || state?.aoeDefenses?.[state?.me?.id]?.rolls);
}

export function tacticalBarHTML(s, tacticalHandOpen = false) {
  if (!s || !s.me) return '';
  const me = s.me;
  const tp = me.tp || 0;
  const handCards = me.handCards || [];

  let cardsHtml = '';
  if (handCards.length === 0) {
    cardsHtml = `
      <div class="hand-empty-state">
        <span class="hand-empty-icon" aria-hidden="true"></span>
        <strong>当前没有战术卡</strong>
        <span>可在课间补给站购入</span>
      </div>
    `;
  } else {
    cardsHtml = handCards.map((c) => {
      if (c.hidden) return '';
      const typeClass = c.type || 'buff';
      const scopeLabel = c.subject === 'universal' ? '通用' : (SUBJECTS[c.subject]?.label || c.subject);
      const moment = getTacticalCardMoment(c);
      const usability = getTacticalCardUsability(c, s);
      const canPlay = usability.canPlay;
      const disableReason = usability.reason;

      return `
        <button type="button" class="hand-card-kards ${canPlay ? '' : 'disabled'}" data-card-id="${escapeHTML(c.id)}"
                ${canPlay ? `data-battle-action="playTacticalCard" data-value="${escapeHTML(c.id)}"` : 'disabled'}
                aria-label="${escapeHTML(canPlay ? `打出${c.name}` : `${c.name}，${disableReason}`)}">
          <div class="card-tag-row">
            <span class="card-tag-type ${escapeHTML(typeClass)}">${escapeHTML(scopeLabel)}</span>
            <span class="card-timing">${escapeHTML(moment.label)}</span>
          </div>
          <div class="card-title-text">${escapeHTML(c.name)}</div>
          <div class="card-desc-text">${escapeHTML(c.desc)}</div>
          <div class="hand-card-footer">
            <span class="card-tp-cost" title="仅为补给站购入价格，打出不消耗 TP">补给价 ${c.tpCost} TP</span>
            <span class="hand-card-action">${canPlay ? '打出' : escapeHTML(disableReason)}</span>
          </div>
          ${canPlay ? '' : `<span class="card-disable-overlay" aria-hidden="true"><span class="card-disable-badge">${escapeHTML(disableReason)}</span></span>`}
        </button>
      `;
    }).join('');
  }

  let blessingsHtml = '';
  if (me.activeBlessings && me.activeBlessings.length > 0) {
    blessingsHtml = `<div class="blessing-badges">
      ${me.activeBlessings.map(b => `<span class="blessing-badge" title="${escapeHTML(b.desc || b.name)}"><span aria-hidden="true">✦</span>${escapeHTML(b.name)}</span>`).join('')}
    </div>`;
  }

  return `
    <div class="hand-fab-container">
      ${blessingsHtml}
      <button type="button" class="hand-fab" id="hand-fab" data-battle-action="toggleHand"
              aria-controls="hand-fan-container" aria-expanded="${tacticalHandOpen}" title="查看战术手牌">
        <span class="fab-icon" aria-hidden="true"></span>
        <span class="fab-count">${handCards.length}</span>
        <span class="fab-tp">${tp} TP</span>
      </button>
      <button type="button" class="hand-tray-backdrop ${tacticalHandOpen ? 'expanded' : ''}" id="hand-tray-backdrop"
              data-battle-action="closeHand" aria-label="关闭战术手牌" tabindex="-1"></button>
      <section class="hand-fan-container ${tacticalHandOpen ? 'expanded' : ''}" id="hand-fan-container"
               aria-label="战术手牌" aria-hidden="${!tacticalHandOpen}" ${tacticalHandOpen ? '' : 'inert'}>
        <header class="hand-tray-header">
          <div>
            <span class="hand-tray-eyebrow">战术准备</span>
            <strong>手牌 ${handCards.length} / 3</strong>
          </div>
          <div class="hand-tray-meta">
            <span>${tp} TP</span>
            <button type="button" class="hand-tray-close" data-battle-action="closeHand" aria-label="关闭战术手牌" title="关闭">×</button>
          </div>
        </header>
        <div class="hand-tray-cards">${cardsHtml}</div>
        <p class="hand-tray-note">打出战术卡不消耗 TP</p>
      </section>
      </div>
  `;
}

export const identityName = (id) => {
  switch(id) {
    case IDENTITY.LORD: return '主公';
    case IDENTITY.LOYALIST: return '忠臣';
    case IDENTITY.REBEL: return '反贼';
    case IDENTITY.SPY: return '内奸';
    default: return '身份';
  }
};
