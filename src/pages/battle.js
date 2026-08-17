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
let pendingState = null;
let lastRenderedStatusIds = new Map();
let lastTurnSignature = null;
let pendingTacticalFeedback = null;

const ATTACK_TACTICAL_CARDS = new Set([
  'card_phy_2', 'card_phy_3', 'card_his_2', 'card_art_2', 'card_it_3',
  'card_mus_2', 'card_pe_2', 'card_pe_3', 'card_gen_04', 'card_gen_08', 'card_gen_15',
]);
const DEFENSE_TACTICAL_CARDS = new Set([
  'card_bio_2', 'card_pol_2', 'card_his_3', 'card_gen_05', 'card_gen_14',
]);
const CLASH_TACTICAL_CARDS = new Set([
  'card_chi_2', 'card_chi_3', 'card_mat_2', 'card_mat_3', 'card_eng_3',
  'card_geo_2', 'card_geo_3', 'card_mus_3', 'card_art_3', 'card_tec_2',
  'card_stu_2', 'card_gen_01', 'card_gen_02', 'card_gen_06', 'card_gen_09',
  'card_gen_10', 'card_gen_12', 'card_gen_13',
]);
const OPPONENT_TARGET_TACTICAL_CARDS = new Set([
  'card_chi_3', 'card_mat_3', 'card_phy_3', 'card_che_3', 'card_bio_3',
  'card_pol_3', 'card_geo_3', 'card_it_2', 'card_pe_3', 'card_gen_06',
  'card_gen_07', 'card_gen_08', 'card_gen_09', 'card_gen_10',
]);

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getStatusEffects(player, state = S) {
  if (!player) return [];
  const effects = [];
  const currentSubject = state?.schedule?.[state.currentClassIndex];
  const add = (effect) => effects.push({
    id: effect.id,
    name: effect.name,
    description: effect.description || '暂无额外说明',
    category: effect.category || 'neutral',
    value: effect.value || '',
    durationLabel: effect.durationLabel || '',
  });

  for (const card of player.playedTurnCards || []) {
    add({
      id: `turn-card-${card.id}`,
      name: card.name,
      description: card.desc,
      category: card.type === 'debuff' ? 'debuff' : (card.type === 'other' ? 'neutral' : 'buff'),
      durationLabel: '本回合',
    });
  }

  for (const card of player.activeBlessings || []) {
    if (card.subject !== 'universal' && card.subject !== currentSubject) continue;
    add({
      id: `blessing-${card.id}`,
      name: card.name,
      description: card.desc,
      category: 'blessing',
      durationLabel: '本节课',
    });
  }

  if (player.stealthActive) add({ id: 'stealth', name: '隐蔽', description: '本回合对手无法查看你的掷骰点数与结算数值', category: 'buff', durationLabel: '本回合' });
  if (player.tempSlotBonus > 0) add({ id: 'slot-bonus', name: '选骰扩容', description: '攻击和防御可额外选择骰子', category: 'buff', value: `+${player.tempSlotBonus}`, durationLabel: '本节课' });
  if (player.chargeStacks > 0) add({ id: 'charge', name: '蓄势', description: '攻击时消耗层数强化爆发效果', category: 'buff', value: `${player.chargeStacks}层`, durationLabel: '消耗前持续' });
  if (player.invertReduction > 0) add({ id: 'damage-reduction', name: '深度思考', description: '受到的最终伤害永久降低', category: 'buff', value: `-${player.invertReduction}`, durationLabel: '永久' });

  if (player.permanentDefPenalty > 0) add({ id: 'def-penalty', name: '防御透支', description: '防御结算永久降低', category: 'debuff', value: `-${player.permanentDefPenalty}`, durationLabel: '永久' });
  const sugarCrash = (player.buffs || []).find(buff => buff.id === 'sugar_crash');
  if (sugarCrash) {
    const remaining = Number.isInteger(sugarCrash.expireRound) && Number.isInteger(state?.totalRound)
      ? Math.max(1, sugarCrash.expireRound - state.totalRound)
      : null;
    add({ id: 'sugar-crash', name: '犯糖', description: '无法重投，攻击回合开始时受到伤害', category: 'debuff', durationLabel: remaining ? `剩余 ${remaining} 回合` : '临时' });
  }
  if (player.redHeat > 0) add({ id: 'red-heat', name: '红温', description: '攻击回合开始时按当前层数失去生命，随后减少 1 层', category: 'debuff', value: `${player.redHeat}层`, durationLabel: '层数归零前' });
  if (player.stickers > 0) add({ id: 'stickers', name: '贴画', description: '身上的贴画达到 2 张时会引爆', category: 'debuff', value: `${player.stickers}/2`, durationLabel: '引爆前' });
  if (player.selfStickers > 0) add({ id: 'self-stickers', name: '暴露贴画', description: '自身贴画达到 2 张时会引爆', category: 'debuff', value: `${player.selfStickers}/2`, durationLabel: '引爆前' });
  if (player.skillsSealed) add({ id: 'skill-sealed', name: '技能封印', description: '正面、中性和负面技能暂时无法生效', category: 'debuff', durationLabel: player.skillsSealedTurnsLeft ? `剩余 ${player.skillsSealedTurnsLeft} 次攻击` : '临时' });
  if (player.pendingDreamState) add({ id: 'dream-pending', name: '梦境待命', description: '下一节课开始时进入梦境领域', category: 'neutral', durationLabel: '下节课触发' });
  if (player.dreamStacks > 0 && !player.inDreamState) add({ id: 'dream-stacks', name: '梦境记录', description: '达到 3 层后，下一节课展开梦境领域', category: 'neutral', value: `${player.dreamStacks}/3`, durationLabel: '触发前' });
  if (player.inDreamState && !player.lgpyForm) add({ id: 'dream-state', name: '梦境领域', description: '对手需要盲选本体；选中分身时本体不受伤害', category: 'buff', durationLabel: '本节课' });
  if (player.lgpyForm) add({ id: 'lgpy-form', name: '狂暴形态', description: '当前使用强化骰池进行战斗', category: 'neutral', durationLabel: player.lgpyTurnsLeft ? `剩余 ${player.lgpyTurnsLeft} 次攻击` : '临时' });
  if (player.nineLivesUsed) add({ id: 'nine-lives-used', name: '九条命已触发', description: '复活效果已经消耗，骰池已升级为 D10', category: 'neutral', durationLabel: '本局' });
  if (player.hasReschedule) add({ id: 'reschedule', name: '调课权', description: '仍可调整尚未开始的一节课程', category: 'neutral', durationLabel: '使用前' });

  const priority = { debuff: 0, buff: 1, blessing: 2, neutral: 3 };
  return effects.sort((a, b) => (priority[a.category] ?? 9) - (priority[b.category] ?? 9));
}

function statusEffectHTML(effect) {
  const tooltip = [effect.name, effect.description, effect.durationLabel].filter(Boolean).join(' · ');
  return `
    <details class="status-effect status-${escapeHTML(effect.category)}" data-status-id="${escapeHTML(effect.id)}">
      <summary title="${escapeHTML(tooltip)}" aria-label="${escapeHTML(tooltip)}">
        <span class="status-name">${escapeHTML(effect.name)}</span>
        ${effect.value ? `<span class="status-value">${escapeHTML(effect.value)}</span>` : ''}
      </summary>
      <div class="status-popover">
        <strong>${escapeHTML(effect.name)}</strong>
        <span>${escapeHTML(effect.description)}</span>
        ${effect.durationLabel ? `<small>${escapeHTML(effect.durationLabel)}</small>` : ''}
      </div>
    </details>
  `;
}

function buffIcons(player, state = S) {
  const effects = getStatusEffects(player, state);
  if (effects.length === 0) return '<span class="status-empty">暂无状态</span>';
  return effects.map(statusEffectHTML).join('');
}

function getLogSummary(entry) {
  if (!entry) return '尚无战斗记录';
  const details = entry.details || {};
  if (entry.type === 'turn' && Array.isArray(details.targets)) {
    const totalDamage = details.targets.reduce((sum, target) => sum + (Number(target.damage) || 0), 0);
    return `${details.actorName || '攻击方'} · ${details.targets.length} 个目标 · ${totalDamage > 0 ? `共 ${totalDamage} 伤害` : '未造成伤害'}`;
  }
  if (entry.type === 'turn') {
    return `${details.actorName || '攻击方'} → ${details.targetName || '防守方'} · ${(Number(details.damage) || 0) > 0 ? `${details.damage} 伤害` : '未造成伤害'}`;
  }
  return entry.text || '战斗记录';
}

function logEntryHTML(entry) {
  const details = entry.details || {};
  const entryAttrs = `data-log-id="${escapeHTML(entry.id || '')}" data-log-type="${escapeHTML(entry.type || 'system')}" data-actor-id="${escapeHTML(entry.actorId || '')}"`;
  if (entry.type === 'turn') {
    const notes = [];
    if (details.pierce) notes.push('穿透');
    if (Number(details.selfDamage) > 0) notes.push(`攻击方自伤 ${details.selfDamage}`);
    if (Number(details.counterDamage) > 0) notes.push(`反击 ${details.counterDamage}`);
    if (Number(details.healAmount) > 0) notes.push(`回复 ${details.healAmount}`);

    if (Array.isArray(details.targets)) {
      const targets = details.targets.map(target => {
        const targetNotes = [];
        if (Number(target.counterDamage) > 0) targetNotes.push(`反击 ${target.counterDamage}`);
        if (Number(target.healAmount) > 0) targetNotes.push(`回复 ${target.healAmount}`);
        return `
          <div class="log-target-result">
            <span>${escapeHTML(details.actorName || '攻击方')} → ${escapeHTML(target.targetName || '目标')}</span>
            <strong class="${Number(target.damage) > 0 ? 'damage' : 'miss'}">${Number(target.damage) > 0 ? `-${target.damage} HP` : '无伤害'}</strong>
            ${targetNotes.length ? `<small>${escapeHTML(targetNotes.join(' · '))}</small>` : ''}
          </div>
        `;
      }).join('');
      return `<article class="log-entry log-entry-turn" ${entryAttrs}>${targets}${notes.length ? `<div class="log-entry-notes">${escapeHTML(notes.join(' · '))}</div>` : ''}</article>`;
    }

    const damage = Number(details.damage) || 0;
    return `
      <article class="log-entry log-entry-turn" ${entryAttrs}>
        <div class="log-entry-main">
          <span>${escapeHTML(details.actorName || '攻击方')} → ${escapeHTML(details.targetName || '防守方')}</span>
          <strong class="${damage > 0 ? 'damage' : 'miss'}">${damage > 0 ? `-${damage} HP` : '无伤害'}</strong>
        </div>
        ${notes.length ? `<div class="log-entry-notes">${escapeHTML(notes.join(' · '))}</div>` : ''}
      </article>
    `;
  }

  const typeLabel = entry.type === 'tactical' ? '战术' : (entry.type === 'skill' ? '技能' : '系统');
  return `
    <article class="log-entry log-entry-${escapeHTML(entry.type || 'system')}" ${entryAttrs}>
      <span class="log-type">${typeLabel}</span>
      <span class="log-entry-text">${escapeHTML(entry.text || '')}</span>
    </article>
  `;
}

function battleLogContentHTML(state) {
  const entries = [...(state?.log || [])].reverse();
  if (entries.length === 0) return '<div class="battle-log-empty">第一轮结算后会在这里留下记录</div>';

  const classGroups = new Map();
  for (const entry of entries) {
    const classKey = Number.isInteger(entry.classIndex)
      ? `${Number.isInteger(entry.day) ? entry.day : 1}:${entry.classIndex}`
      : 'legacy';
    if (!classGroups.has(classKey)) classGroups.set(classKey, []);
    classGroups.get(classKey).push(entry);
  }

  return [...classGroups.entries()].map(([classKey, classEntries]) => {
    const first = classEntries[0];
    const subject = SUBJECTS[first.subject];
    const [dayNumber, classIndex] = classKey === 'legacy'
      ? [null, null]
      : classKey.split(':').map(Number);
    const classTitle = classKey === 'legacy'
      ? '早期记录'
      : `第 ${dayNumber} 天 · 第 ${classIndex + 1} 节 · ${subject?.label || first.subject || '课程'}`;
    const roundGroups = new Map();
    for (const entry of classEntries) {
      const roundKey = Number.isInteger(entry.totalRound) ? entry.totalRound : 'legacy';
      if (!roundGroups.has(roundKey)) roundGroups.set(roundKey, []);
      roundGroups.get(roundKey).push(entry);
    }

    const rounds = [...roundGroups.entries()].map(([roundKey, roundEntries]) => {
      const subRound = roundEntries[0].subRound;
      const roundTitle = roundKey === 'legacy'
        ? '记录'
        : `第 ${Number.isInteger(subRound) ? subRound + 1 : roundKey} 回合`;
      return `
        <section class="battle-log-round">
          <h4>${escapeHTML(roundTitle)}</h4>
          <div class="battle-log-entries">${roundEntries.map(logEntryHTML).join('')}</div>
        </section>
      `;
    }).join('');

    return `<section class="battle-log-class"><h3>${escapeHTML(classTitle)}</h3>${rounds}</section>`;
  }).join('');
}

function battleLogHTML(state) {
  const entries = state?.log || [];
  const latest = entries[entries.length - 1];
  return `
    <details class="battle-log" id="battle-log">
      <summary class="battle-log-summary">
        <span class="battle-log-heading">战斗记录 <span id="battle-log-count">${entries.length}</span></span>
        <span class="battle-log-latest" id="battle-log-latest">${escapeHTML(getLogSummary(latest))}</span>
        <span class="battle-log-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="battle-log-content" id="battle-log-content">${battleLogContentHTML(state)}</div>
    </details>
  `;
}

const identityName = (id) => {
  switch(id) {
    case IDENTITY.LORD: return '主公';
    case IDENTITY.LOYALIST: return '忠臣';
    case IDENTITY.REBEL: return '反贼';
    case IDENTITY.SPY: return '内奸';
    default: return '身份';
  }
};

function getOpponentCardElement() {
  return document.getElementById('card-op') ||
    document.querySelector('.ffa-micro-card.active-target') ||
    document.querySelector('.ffa-micro-card:not(.dead)') ||
    document.querySelector('.ffa-micro-card');
}

function getPlayerCardElement(playerId, state = S) {
  if (!playerId || !state?.me) return null;
  if (playerId === state.me.id) return document.getElementById('card-me');
  if (state.gameMode === '1v1') return document.getElementById('card-op');
  return document.querySelector(`.ffa-micro-card[data-pid="${playerId}"]`);
}

function getTurnSignature(state) {
  if (!state || state.phase !== 'battle') return null;
  const attackerId = state.players?.[state.attackerIdx]?.id || state.attackerIdx;
  return `${state.totalRound ?? 0}:${attackerId ?? 'none'}:${state.isExtraTurn ? 'extra' : 'normal'}`;
}

function seedBattleFeedbackState(state) {
  lastRenderedStatusIds = new Map(
    (state?.players || []).map(player => [player.id, new Set(getStatusEffects(player, state).map(effect => effect.id))])
  );
  lastTurnSignature = getTurnSignature(state);
  pendingTacticalFeedback = null;
}

export function renderBattle(container, data) {
  S = data.state;
  animLock = false; // 重置动画锁
  pendingState = null;
  let localConnectionLost = false;

  window._refreshDraftSlot = (idx) => { gameSocket.refreshDraftSlot(idx); };
  window._buyDraftCard = (idx) => {
    gameSocket.buyDraftCard(idx, (result) => {
      window._showToast(result?.ok ? '购买成功！' : (result?.error || '购买失败'));
    });
  };
  window._confirmDraftReady = () => { gameSocket.confirmDraftReady(); };
  window._playTacticalCard = (id) => {
    const cardEl = document.querySelector(`.hand-card-kards[data-card-id="${id}"]`);
    cardEl?.classList.add('disabled');
    gameSocket.playTacticalCard(id, (result) => {
      if (!result?.ok) {
        cardEl?.classList.remove('disabled');
        window._showToast(result?.error || '无法打出此战术卡');
      }
    });
  };

  container.innerHTML = buildArena(S);
  seedBattleFeedbackState(S);
  bindCoreEvents();

  gameSocket.on('state_update', (s) => {
    if (animLock) {
      pendingState = s;
    } else {
      S = s;
      pendingState = null;
      refreshAll();
    }
  });
  gameSocket.on('atk_confirmed', (d) => { S = d.state; onAtkConfirmed(d); });
  gameSocket.on('turn_resolved', (d) => { S = d.state; onTurnResolved(d); });
  gameSocket.on('class_change', (d) => showClassChange(d));
  gameSocket.on('opponent_connection_lost', ({ graceMs }) => {
    const seconds = Math.ceil((graceMs || 60000) / 1000);
    const el = document.getElementById('phase-text');
    if (el) el.innerHTML = `<span style="color:var(--accent)">对手暂时掉线，等待重连（${seconds} 秒）</span>`;
  });
  gameSocket.on('opponent_reconnected', () => {
    window._showToast('对手已重新连接');
    const el = document.getElementById('phase-text');
    if (el) el.innerHTML = '<span style="color:var(--green)">对手已重新连接</span>';
  });
  gameSocket.on('opponent_disconnected', () => {
    const el = document.getElementById('phase-text');
    if (el) el.innerHTML = '<span style="color:var(--red)">对手离线超时，已退出本局</span>';
  });
  gameSocket.on('game_over', ({ state, reason, surrenderedId }) => {
    S = state;
    animLock = false;
    pendingState = null;
    refreshAll();
    showGameOver(state, { reason, surrenderedId });
  });
  gameSocket.on('rematch_status', ({ readyCount, required, isReady }) => {
    const button = document.getElementById('btn-rematch');
    if (!button) return;
    button.disabled = isReady;
    button.textContent = isReady ? `等待对手（${readyCount}/${required}）` : `申请重赛（${readyCount}/${required}）`;
  });
  gameSocket.on('rematch_started', (nextGame) => {
    document.querySelector('.game-over-screen')?.remove();
    navigate('preparation', nextGame);
  });
  gameSocket.on('opponent_left_room', () => {
    const button = document.getElementById('btn-rematch');
    if (button) {
      button.disabled = true;
      button.textContent = '对手已离开';
    }
    window._showToast('对手已离开房间');
  });
  gameSocket.on('room_closed', ({ reason }) => {
    window.alert(reason || '房间已关闭');
    gameSocket.currentRoomId = null;
    navigate('lobby');
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
  gameSocket.on('tactical_card_played', ({ playerId, card }) => {
    const isMe = playerId === S.me.id;
    const sourceCardEl = isMe
      ? document.querySelector(`.hand-card-kards[data-card-id="${card.id}"]`)
      : getPlayerCardElement(playerId);
    const targetsOpponent = OPPONENT_TARGET_TACTICAL_CARDS.has(card.id);
    const targetCardEl = targetsOpponent
      ? (isMe ? getOpponentCardElement() : document.getElementById('card-me'))
      : getPlayerCardElement(playerId);
    pendingTacticalFeedback = { playerId, cardId: card.id };
    vfxManager.playTacticalCardResolved(sourceCardEl, targetCardEl, {
      cardType: card.type,
      affectsOpponent: targetsOpponent,
    });
    window._showToast(isMe ? `已使用【${card.name}】` : `对手使用了【${card.name}】`);
  });

  const stopConnectionStatus = gameSocket.onConnectionStatus(({ connected }) => {
    const el = document.getElementById('phase-text');
    if (!connected) {
      localConnectionLost = true;
      if (el) el.innerHTML = '<span style="color:var(--accent)">连接中断，正在自动重连…</span>';
    } else if (localConnectionLost) {
      localConnectionLost = false;
      if (el) el.innerHTML = '<span style="color:var(--green)">连接已恢复，正在同步战局…</span>';
      window._showToast('已重新连接到对局');
    }
  });

  if (S.phase === 'game_over') queueMicrotask(() => showGameOver(S));

  return () => stopConnectionStatus();
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
    <div class="battle-view">
    <div class="arena">
      <header class="battle-topbar sidebar-left" id="sidebar-schedule">
        ${battleTopbarHTML(s)}
      </header>

      <main class="arena-center">
        <div class="card-row">
          ${ s.gameMode === 'sanguosha' ? `<div id="ffa-grid-container">${buildFfaGrid(s)}</div>` : `
          <div class="battle-card-wrap" id="card-op">
            <div class="bc-multi" id="multi-op">${multiTag(getM(op,subj))}</div>
            <div class="battle-card ${getAuraClass(op)}">
              ${portraitHTML(op.card?.name, op.card?.image)}
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
              <div class="bc-buffs" id="buffs-op" aria-label="对手状态">${buffIcons(op, s)}</div>
          </div>
          `}

          <div class="vs-area" id="vs-area">
            <div id="phase-text" class="phase-text">${phasePrompt(s)}</div>
          </div>

          <div class="battle-card-wrap self-side ${s.attackerIdx === s.myIndex ? 'active-attacker' : ''} ${me.isDead ? 'dead' : ''}" id="card-me">
            <div class="bc-multi" id="multi-me">${multiTag(getM(me,subj))}</div>
            <div class="battle-card ${getAuraClass(me)}" style="border: 3px solid ${s.attackerIdx === s.myIndex ? 'var(--red)' : 'transparent'}">
              ${portraitHTML(me.card?.name, me.card?.image)}
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
              <div class="bc-buffs" id="buffs-me" aria-label="我的状态">${buffIcons(me, s)}</div>
          </div>
        </div>

        <section class="battle-control-panel" aria-label="本回合操作">
          <div class="dice-area" id="dice-area"></div>
          <div class="action-bar" id="action-bar">${actionButtons(s)}</div>
          <div class="battle-control-strip" id="sidebar-reroll">
            <div class="reroll-count" id="reroll-count">重投 <strong>${me.rerolls}</strong> 次</div>
            <p class="reroll-hint" id="reroll-hint">选中骰子后可重投</p>
            <button id="btn-reroll" class="btn btn-secondary" style="display:none;">重投选中</button>
            <details class="battle-menu">
              <summary aria-label="更多对局操作" title="更多对局操作">&#8943;</summary>
              <div class="battle-menu-popover">
                ${s.gameMode === '1v1' ? '<button id="btn-surrender" class="btn btn-secondary">投降</button>' : ''}
                <button id="btn-leave-battle" class="btn btn-secondary">退出对局</button>
              </div>
            </details>
          </div>
        </section>
        <div class="tactical-layer" id="tactical-bar">${tacticalBarHTML(s)}</div>
      </main>
    </div>
    ${battleLogHTML(s)}
    </div>
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
  on('btn-surrender', 'click', () => {
    if (!window.confirm('确定要投降吗？本局将立即判负。')) return;
    disableBtn('btn-surrender');
    gameSocket.surrender((result) => {
      if (!result?.ok) {
        const button = document.getElementById('btn-surrender');
        if (button) button.disabled = false;
        window._showToast(result?.error || '投降失败');
      }
    });
  });
  on('btn-leave-battle', 'click', () => {
    if (!window.confirm('确定要退出当前对局吗？战斗中退出会被判负。')) return;
    gameSocket.leaveRoom();
    navigate('lobby');
  });
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

function refreshStatusEffects(containerId, player) {
  const container = document.getElementById(containerId);
  if (!container || !player) return;

  const effects = getStatusEffects(player, S);
  const previousIds = lastRenderedStatusIds.get(player.id) || new Set();
  const currentIds = new Set(effects.map(effect => effect.id));
  const addedEffects = effects.filter(effect => !previousIds.has(effect.id));
  const removedCount = [...previousIds].filter(id => !currentIds.has(id)).length;

  container.innerHTML = effects.length ? effects.map(statusEffectHTML).join('') : '<span class="status-empty">暂无状态</span>';
  lastRenderedStatusIds.set(player.id, currentIds);

  queueMicrotask(() => {
    for (const effect of addedEffects) {
      const element = [...container.querySelectorAll('.status-effect')]
        .find(candidate => candidate.dataset.statusId === effect.id);
      if (element) vfxManager.playStatusChange(element, { added: true, category: effect.category });
    }
    if (removedCount > 0) vfxManager.playStatusChange(container, { added: false, category: 'neutral' });
  });
}

function playTurnTransitionIfNeeded() {
  const signature = getTurnSignature(S);
  if (!signature || signature === lastTurnSignature) return;
  lastTurnSignature = signature;
  const attacker = S.players?.[S.attackerIdx];
  const cardElement = getPlayerCardElement(attacker?.id);
  if (cardElement) {
    vfxManager.playTurnTransition(cardElement, {
      extraTurn: !!S.isExtraTurn,
      label: S.isExtraTurn ? '额外回合' : '攻击回合',
    });
  }
}

// ── 刷新所有 UI ──
function refreshAll() {
  const subj = curSubj();
  // HP
  setHP('hp-me', S.me.hp, S.me.maxHp, 'hp-me-t');
  if (S.gameMode === '1v1') {
    setHP('hp-op', S.opponent.hp, S.opponent.maxHp, 'hp-op-t');
    setText('multi-op', multiTag(getM(S.opponent, subj)));
    refreshStatusEffects('buffs-op', S.opponent);
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
  refreshStatusEffects('buffs-me', S.me);
  // 动态更新自己 aura
  const meCard = document.querySelector('#card-me .battle-card');
  if (meCard) updateAura(meCard, S.me);
  // Schedule
  const sb = document.getElementById('sidebar-schedule');
  if (sb) {
    const hasR = S.me.hasReschedule;
    sb.innerHTML = battleTopbarHTML(S);
    if (hasR) on('btn-reschedule', 'click', () => showRescheduleModal());
  }
  // Reroll count
  setText('reroll-count', `重投 <strong>${S.me.rerolls}</strong> 次`);
  const rrEl = document.getElementById('btn-reroll');
  if (rrEl) delete rrEl.dataset.rerolling;
  // Phase & actions
  setText('phase-text', phasePrompt(S));
  setText('action-bar', actionButtons(S));
  setText('tactical-bar', tacticalBarHTML(S));
  rebindActionButtons();
  refreshBattleLog();
  // Dice - render if available
  renderDice();
  // Check dream target modal
  checkDreamTargetModal(S);
  checkDraftShopModal(S);
  playTurnTransitionIfNeeded();
}

function refreshBattleLog() {
  const entries = S?.log || [];
  const latest = entries[entries.length - 1];
  const count = document.getElementById('battle-log-count');
  const latestEl = document.getElementById('battle-log-latest');
  const content = document.getElementById('battle-log-content');
  if (count) count.textContent = String(entries.length);
  if (latestEl) latestEl.textContent = getLogSummary(latest);
  if (content) content.innerHTML = battleLogContentHTML(S);

  if (content && pendingTacticalFeedback) {
    const matchingEntry = [...entries].reverse().find(entry => (
      entry.type === 'tactical' &&
      entry.actorId === pendingTacticalFeedback.playerId &&
      entry.details?.cardId === pendingTacticalFeedback.cardId
    ));
    const matchingElement = matchingEntry
      ? [...content.querySelectorAll('.log-entry')].find(element => element.dataset.logId === matchingEntry.id)
      : null;
    if (matchingElement) {
      matchingElement.classList.add('log-entry-new');
      vfxManager.playSkillTrigger(matchingElement, 'tactical');
    }
    pendingTacticalFeedback = null;
  }
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

function getTacticalCardMoment(card) {
  if (card.type === 'blessing') return { label: '持续强化', kind: 'blessing' };
  if (ATTACK_TACTICAL_CARDS.has(card.id)) return { label: '攻击时', kind: 'attack' };
  if (DEFENSE_TACTICAL_CARDS.has(card.id)) return { label: '防守时', kind: 'defense' };
  if (CLASH_TACTICAL_CARDS.has(card.id)) return { label: '交锋时', kind: 'clash' };
  return { label: OPPONENT_TARGET_TACTICAL_CARDS.has(card.id) ? '影响对手' : '即时使用', kind: 'instant' };
}

function getTacticalCardUsability(card, state) {
  const me = state.me;
  const currentSubject = state.schedule[state.currentClassIndex];
  const subject = SUBJECTS[card.subject];
  if (card.subject !== 'universal' && card.subject !== currentSubject) {
    return { canPlay: false, reason: `仅限${subject?.label || card.subject}课` };
  }

  if (card.type === 'blessing' && (me.activeBlessings || []).some(active => active.id === card.id)) {
    return { canPlay: false, reason: '本节课已生效' };
  }
  if ((me.playedTurnCards || []).some(active => active.id === card.id)) {
    return { canPlay: false, reason: '同类效果已生效' };
  }

  const opponent = state.opponent || (state.players || []).find(player => player.id !== me.id && !player.isDead);
  if (['card_eng_2', 'card_gen_03'].includes(card.id) && me.hp >= me.maxHp) {
    return { canPlay: false, reason: '生命值已满' };
  }
  if (card.id === 'card_che_2') {
    const hasNegativeState = (me.buffs || []).length > 0 || me.redHeat > 0 || me.stickers > 0 || me.selfStickers > 0 || me.permanentDefPenalty > 0;
    if (!hasNegativeState) return { canPlay: false, reason: '当前无负面效果' };
  }
  if (card.id === 'card_che_3' && !(opponent?.redHeat > 0)) {
    return { canPlay: false, reason: '对手没有红温' };
  }
  if (['card_it_2', 'card_gen_07'].includes(card.id) && !(opponent?.tp > 0)) {
    return { canPlay: false, reason: '对手没有 TP' };
  }

  const moment = getTacticalCardMoment(card);
  const isAttacker = state.attackerIdx === state.myIndex;
  const isDefender = state.defenderIdx === state.myIndex || state.isMyDefendTurn;
  if (moment.kind === 'attack' && !isAttacker) return { canPlay: false, reason: '仅在攻击回合使用' };
  if (moment.kind === 'defense' && !isDefender) return { canPlay: false, reason: '仅在防守回合使用' };
  if (moment.kind === 'clash' && !isAttacker && !isDefender) return { canPlay: false, reason: '等待自己的交锋' };
  return { canPlay: true, reason: '' };
}

function tacticalBarHTML(s) {
  if (!s || !s.me) return '';
  const me = s.me;
  const tp = me.tp || 0;
  const handCards = me.handCards || [];

  let cardsHtml = '';
  if (handCards.length === 0) {
    cardsHtml = `<div style="color:var(--text-secondary); text-align:center; margin-top:40px;">暂无战术卡</div>`;
  } else {
    cardsHtml = handCards.map((c, i) => {
      if (c.hidden) return '';
      const typeClass = c.type || 'buff';
      const scopeLabel = c.subject === 'universal' ? '通用' : (SUBJECTS[c.subject]?.label || c.subject);
      const moment = getTacticalCardMoment(c);
      const usability = getTacticalCardUsability(c, s);
      const canPlay = usability.canPlay;
      const disableReason = usability.reason;

      // 扇形展开的角度计算 (-15deg, 0deg, 15deg)
      const total = handCards.length;
      const mid = (total - 1) / 2;
      const rotateDeg = (i - mid) * 15;
      const transY = Math.abs(i - mid) * 10;

      return `
        <div class="hand-card-kards ${canPlay ? '' : 'disabled'}" data-card-id="${c.id}" style="--card-rotate: ${rotateDeg}deg; transform: rotate(${rotateDeg}deg) translateY(${transY}px)" ${canPlay ? `onclick="window._toggleHand(); window._playTacticalCard('${c.id}')"` : ''} title="${disableReason}">
          <div class="card-tag-row">
            <span class="card-tag-type ${typeClass}">${scopeLabel}</span>
            <span class="card-timing">${moment.label}</span>
            <span class="card-tp-cost" title="补给站购入费用">★${c.tpCost}</span>
          </div>
          <div class="card-title-text">${c.name}</div>
          <div class="card-desc-text">${c.desc}</div>
          ${!canPlay ? `<div class="card-disable-overlay"><span class="card-disable-badge">${disableReason}</span></div>` : ''}
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
        const scopeLabel = c.subject === 'universal' ? '通用' : (SUBJECTS[c.subject]?.label || c.subject);
        const isHandFull = (s.me.handCards || []).length >= 3;
        const isAfford = s.me.tp >= c.tpCost;
        const buyDisabled = isHandFull || !isAfford;
        let disableReason = '';
        if (isHandFull) disableReason = '手牌已满';
        else if (!isAfford) disableReason = 'TP不足';
        
        const stars = '★'.repeat(c.tpCost) + '☆'.repeat(Math.max(0, 3 - c.tpCost));

        return `
          <div class="draft-slot-card ${buyDisabled ? 'disabled' : 'clickable'}" ${buyDisabled ? '' : `onclick="window._buyDraftCard(${idx})"`}>
            <button class="btn-icon-refresh" ${slot.refreshesLeft > 0 ? '' : 'disabled'} onclick="event.stopPropagation(); window._refreshDraftSlot(${idx})" title="刷新 (${slot.refreshesLeft})">↻</button>
            <div class="draft-card-header">
              <span class="card-tag-type ${typeClass}">${scopeLabel}</span>
              <span class="draft-card-star">${stars}</span>
            </div>
            <div class="draft-card-title">${c.name}</div>
            <div class="draft-card-desc">${c.desc}</div>
            ${buyDisabled ? `<div class="card-disable-overlay"><span class="card-disable-badge">${disableReason}</span></div>` : ''}
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
        <div class="bc-buffs ffa-buffs" aria-label="${escapeHTML(p.nickname)}的状态">${buffIcons(p, s)}</div>
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
    const target = isAtk
      ? (S.me.effectiveAtkSlots ?? S.me.card.atkSlots)
      : (isDef ? (S.me.effectiveDefSlots ?? S.me.card.defSlots) : 99);
    
    // 李灿献祭逻辑
    const btnSacrifice = document.getElementById('btn-sacrifice');
    if (btnSacrifice) {
      if (isDef && S.me.cardId === 'char_8' && !S.me.skillsSealed && count === target) {
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

  if (data.deathCause === 'red_heat') alerts.push('<div class="skill-alert negative">红温伤害致死</div>');

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

function playResolvedSkillFeedback(data, state) {
  const attacker = state.players?.[data.attackerIdx];
  const attackerElement = getPlayerCardElement(attacker?.id, state);
  const attackTriggered = data.atkResult?.posTriggered || data.atkResult?.negTriggered || data.extraTurnTriggered || data.firstBloodTriggered;
  if (attackTriggered && attackerElement) {
    vfxManager.playSkillTrigger(attackerElement, data.atkResult?.negTriggered ? 'debuff' : 'buff');
  }

  const results = data.isAoE && Array.isArray(data.aoeResults) ? data.aoeResults : [data];
  const lastTurnEntry = [...(state.log || [])].reverse().find(entry => entry.type === 'turn' && entry.actorId === attacker?.id);
  results.forEach((result, index) => {
    const targetId = result.playerId || lastTurnEntry?.targetId;
    const targetElement = getPlayerCardElement(targetId, state);
    if (!targetElement) return;
    const hasPositiveTrigger = result.defPosTriggered || result.lcHealTriggered || result.nineLivesTriggered || (index === 0 && data.nineLivesTriggered);
    const hasNegativeTrigger = result.defNegTriggered || result.noobTriggered || result.detonateTriggered;
    if (hasPositiveTrigger || hasNegativeTrigger) {
      vfxManager.playSkillTrigger(targetElement, hasNegativeTrigger ? 'debuff' : 'buff');
    }
  });
}

// ── 回合结算回调 (含攻击动画) ──
export function onTurnResolved(data) {
  animLock = true;
  const newState = data.state;
  const { damage, finalDef, penalty, gameOver, attackerIdx } = data;

  const phase = document.getElementById('phase-text');
  const alerts = buildAlerts(data);
  if (phase && alerts) phase.innerHTML = alerts;
  playResolvedSkillFeedback(data, newState);

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
      const getLiveAtkCard = () => (atkId && S.me && atkId === S.me.id) ? document.getElementById('card-me') : (atkId ? document.querySelector(`.ffa-micro-card[data-pid="${atkId}"]`) : null);
      
      const atkCard = getLiveAtkCard();
      if (atkCard && document.body.contains(atkCard)) atkCard.classList.add('card-attacking');
      
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
        const getLiveDCard = () => dId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${dId}"]`);
        
        setTimeout(() => {
          const liveDCard = getLiveDCard();
          if (liveDCard && document.body.contains(liveDCard)) liveDCard.classList.add('card-hit');
        }, 300);
        
        setTimeout(() => {
          const liveDCard = getLiveDCard();
          if (liveDCard && document.body.contains(liveDCard)) {
            vfxManager.playHitImpact(liveDCard, res.damage, {
              isCrit: res.damage >= 8,
              isHeavy: res.damage >= 15,
              nineLivesTriggered: res.nineLivesTriggered,
              isAoE: true
            });
            if (res.lcCounterDamage > 0) {
              setTimeout(() => {
                const liveAtkCard = getLiveAtkCard();
                if (liveAtkCard && document.body.contains(liveAtkCard)) {
                  vfxManager.playHitImpact(liveAtkCard, res.lcCounterDamage, { counter: true });
                }
              }, 180);
            }
          }
        }, 400);
      });
      
      setTimeout(() => {
        setHP('hp-me', newState.me.hp, newState.me.maxHp, 'hp-me-t');
      }, 400);

      setTimeout(() => {
        const liveAtkCard = getLiveAtkCard();
        if (liveAtkCard && document.body.contains(liveAtkCard)) liveAtkCard.classList.remove('card-attacking');
        data.aoeResults.forEach(res => {
          const dId = res.playerId;
          const liveDCard = dId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${dId}"]`);
          if (liveDCard && document.body.contains(liveDCard)) liveDCard.classList.remove('card-hit');
        });
        
        setTimeout(() => {
          if (pendingState) {
            S = pendingState;
            pendingState = null;
          } else {
            S = newState;
          }
          animLock = false;
          refreshAll();
          if (data.gameOver) setTimeout(() => showGameOver(S), 800);
        }, data.classChanged ? 1500 : 500);
      }, 1500);
    }, 800);
  } else {
    // 1v1 动画
    setTimeout(() => {
      if (!S || typeof S.myIndex === 'undefined') return;
      const isMyAtk = S.myIndex === attackerIdx;

      const getLiveAtkCard = () => {
        if (S.gameMode === '1v1') {
          return document.getElementById(isMyAtk ? 'card-me' : 'card-op');
        } else {
          const atkId = (S.players && S.players[attackerIdx]) ? S.players[attackerIdx].id : null;
          return (atkId && S.me && atkId === S.me.id) ? document.getElementById('card-me') : (atkId ? document.querySelector(`.ffa-micro-card[data-pid="${atkId}"]`) : null);
        }
      };

      const getLiveDefCard = () => {
        if (S.gameMode === '1v1') {
          return document.getElementById(isMyAtk ? 'card-op' : 'card-me');
        } else {
          const defId = (S.defenderIdx !== null && S.defenderIdx !== undefined && S.players && S.players[S.defenderIdx]) ? S.players[S.defenderIdx].id : null;
          return (defId && S.me && defId === S.me.id) ? document.getElementById('card-me') : (defId ? document.querySelector(`.ffa-micro-card[data-pid="${defId}"]`) : null);
        }
      };

      const atkCard = getLiveAtkCard();
      if (atkCard && document.body.contains(atkCard)) atkCard.classList.add('card-attacking');

      setTimeout(() => {
        const liveDefCard = getLiveDefCard();
        if (liveDefCard && document.body.contains(liveDefCard)) liveDefCard.classList.add('card-hit');
      }, 300);

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

        const liveDefCard = getLiveDefCard();
        if (liveDefCard && document.body.contains(liveDefCard)) {
          vfxManager.playHitImpact(liveDefCard, damage, {
            isCrit: damage >= 8,
            isHeavy: damage >= 15,
            nineLivesTriggered: data.nineLivesTriggered,
            pierce: data.pierce
          });
        }
        if (data.lcCounterDamage > 0) {
          setTimeout(() => {
            const liveAtkCard = getLiveAtkCard();
            if (liveAtkCard && document.body.contains(liveAtkCard)) {
              vfxManager.playHitImpact(liveAtkCard, data.lcCounterDamage, { counter: true });
            }
          }, 180);
        }
        playHit(damage >= 8);
        setHP('hp-me', newState.me.hp, newState.me.maxHp, 'hp-me-t');
        if (newState.gameMode === '1v1') {
          setHP('hp-op', newState.opponent.hp, newState.opponent.maxHp, 'hp-op-t');
        }
      }, 400);

      setTimeout(() => {
        const liveAtkCard = getLiveAtkCard();
        const liveDefCard = getLiveDefCard();
        if (liveAtkCard && document.body.contains(liveAtkCard)) liveAtkCard.classList.remove('card-attacking');
        if (liveDefCard && document.body.contains(liveDefCard)) liveDefCard.classList.remove('card-hit');
        
        setTimeout(() => {
          if (pendingState) {
            S = pendingState;
            pendingState = null;
          } else {
            S = newState;
          }
          animLock = false;
          refreshAll();
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
    overlay.className = data.dayChanged ? 'class-change-overlay day-change-overlay' : 'class-change-overlay compact';
    overlay.innerHTML = `
      <div class="class-change-content">
        <div class="cc-icon">${s?.icon || '📝'}</div>
        ${data.dayChanged ? `<div class="cc-day">第 ${data.day || 1} 天</div>` : ''}
        <div class="cc-label">第 ${data.index + 1} 节课</div>
        <div class="cc-name">${s?.label || data.subject}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    const holdTime = data.dayChanged ? 1700 : 900;
    setTimeout(() => { overlay.classList.add('fade-out'); setTimeout(() => overlay.remove(), 350); }, holdTime);
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
function buildBattleSummary(state, playerId) {
  const summary = {
    damageDealt: 0,
    damageTaken: 0,
    flawlessDefenses: 0,
    tacticalCards: 0,
    highestHit: 0,
    skillTriggers: 0,
  };
  const player = state.players?.find(candidate => candidate.id === playerId);

  for (const entry of state.log || []) {
    if (entry.type === 'tactical' && entry.actorId === playerId) summary.tacticalCards += 1;
    if (entry.type === 'skill' && (entry.actorId === playerId || (!entry.actorId && player?.nickname && entry.text?.includes(player.nickname)))) {
      summary.skillTriggers += 1;
    }
    if (entry.type !== 'turn') continue;

    const details = entry.details || {};
    if (entry.actorId === playerId) summary.damageTaken += Number(details.selfDamage) || 0;

    if (Array.isArray(details.targets)) {
      for (const target of details.targets) {
        const damage = Number(target.damage) || 0;
        const counterDamage = Number(target.counterDamage) || 0;
        if (entry.actorId === playerId) {
          summary.damageDealt += damage;
          summary.damageTaken += counterDamage;
          summary.highestHit = Math.max(summary.highestHit, damage);
        }
        if (target.playerId === playerId) {
          summary.damageTaken += damage;
          summary.flawlessDefenses += damage === 0 ? 1 : 0;
          summary.damageDealt += counterDamage;
          summary.highestHit = Math.max(summary.highestHit, counterDamage);
        }
      }
      continue;
    }

    const damage = Number(details.damage) || 0;
    const counterDamage = Number(details.counterDamage) || 0;
    if (entry.actorId === playerId) {
      summary.damageDealt += damage;
      summary.damageTaken += counterDamage;
      summary.highestHit = Math.max(summary.highestHit, damage);
    }
    if (entry.targetId === playerId) {
      summary.damageTaken += damage;
      summary.flawlessDefenses += damage === 0 ? 1 : 0;
      summary.damageDealt += counterDamage;
      summary.highestHit = Math.max(summary.highestHit, counterDamage);
    }
  }

  return summary;
}

function battleSummaryHTML(state) {
  const summary = buildBattleSummary(state, state.me.id);
  const metrics = [
    ['造成伤害', summary.damageDealt],
    ['承受伤害', summary.damageTaken],
    ['无伤防守', summary.flawlessDefenses],
    ['战术卡', summary.tacticalCards],
    ['最高单次', summary.highestHit],
    ['技能触发', summary.skillTriggers],
  ];
  return `
    <section class="go-review" aria-label="本局复盘">
      <h2>本局复盘</h2>
      <div class="go-review-grid">
        ${metrics.map(([label, value]) => `
          <div class="go-review-metric">
            <strong>${value}</strong>
            <span>${label}</span>
          </div>
        `).join('')}
      </div>
      <details class="go-battle-log">
        <summary>查看完整战斗记录 <span>${state.log?.length || 0}</span></summary>
        <div class="go-battle-log-content">${battleLogContentHTML(state)}</div>
      </details>
    </section>
  `;
}

function showGameOver(s, meta = {}) {
  if (document.querySelector('.game-over-screen')) return;
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
  const endReason = meta.reason || s.endReason;
  const surrenderedPlayer = s.players?.find(player => player.id === (meta.surrenderedId || s.surrenderedId));
  const reasonText = endReason === 'surrender'
    ? `${surrenderedPlayer?.nickname || '一名玩家'} 投降`
    : (endReason === 'red_heat'
      ? '红温伤害致死'
      : (endReason === 'dice_self_damage'
        ? '掷骰自伤致死'
        : (endReason === 'tactical_card' ? '战术卡造成致命伤害' : '对局结束')));

  function renderPlayer(p, index) {
    if (!p) return '';
    const isMe = index === s.myIndex;
    const card = p.card;
    const isYzx = (p.cardId === 'char_10' || p.stealth) && !isMe;
    const hpText = isYzx ? '??' : p.hp;
    const maxHpText = isYzx ? '??' : p.maxHp;
    const hpPercent = isYzx ? 100 : (p.hp / p.maxHp) * 100;
    const identityHtml = s.gameMode === 'sanguosha' ? `<div style="color:var(--accent);font-size:0.8rem;margin-top:4px;">身份: ${escapeHTML(p.identity === 'lord' ? '主公' : (p.identity === '?' ? '未知' : p.identity))}</div>` : '';

    return `
      <div class="player-box ${isMe ? 'me' : 'op'} ${isYzx ? 'stealth' : ''}" style="${s.gameMode === 'sanguosha' ? 'width:45%; margin-bottom:10px;' : ''}">
        <div class="avatar-area">
          <img src="${escapeHTML(card.image)}" class="avatar" alt="" />
          ${isMe ? `<div class="badge-me">我</div>` : ''}
        </div>
        <div class="player-info">
          <div class="name-row">
            <span class="nickname">${escapeHTML(p.nickname)}</span>
            <span class="card-name">${escapeHTML(card.name)}</span>
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
      <p class="go-reason">${escapeHTML(reasonText)}</p>
      <div class="go-stats" style="${s.gameMode==='sanguosha'?'flex-direction:row; flex-wrap:wrap;':''}">
        ${statsHtml}
      </div>
      ${battleSummaryHTML(s)}
      <div class="go-footer">
        ${s.gameMode === '1v1' ? '<button class="btn btn-primary btn-lg" id="btn-rematch">再来一局</button>' : ''}
        <button class="btn btn-secondary btn-lg" id="btn-back">返回大厅</button>
      </div>
    </div>
  `;
  document.body.appendChild(o);
  document.getElementById('btn-rematch')?.addEventListener('click', () => {
    const button = document.getElementById('btn-rematch');
    button.disabled = true;
    button.textContent = s.opponent?.id?.startsWith('AI_') ? '正在重开…' : '等待对手（1/2）';
    gameSocket.requestRematch((result) => {
      if (!result?.ok) {
        button.disabled = false;
        button.textContent = '再来一局';
        window._showToast(result?.error || '无法重赛');
      }
    });
  });
  document.getElementById('btn-back').addEventListener('click', () => {
    gameSocket.leaveRoom();
    o.remove();
    navigate('lobby');
  });
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
    const attackSlots = s.me.effectiveAtkSlots ?? s.me.card.atkSlots;
    const buyBtn = (s.me.cardId === 'char_14' && !s.me.skillsSealed && !s.hasAttackerRerolled && s.me.chargeStacks < 2)
      ? '<button id="btn-buy-water" class="btn btn-secondary" style="margin-left:8px;">买水</button>' 
      : '';
    return `<div>
          <button id="btn-confirm" class="btn btn-success" disabled>✓ 确认</button>
          ${buyBtn}
        </div>` + `${attackSlots === -1 ? '至少选 1 颗' : `需选 ${attackSlots} 颗`}`;
  }
  if (s.turnPhase === 'def_rolled' && s.isMyDefendTurn) {
    const defenseSlots = s.me.effectiveDefSlots ?? s.me.card.defSlots;
    const sacBtn = s.me.cardId === 'char_8' && !s.me.skillsSealed ? '<button id="btn-sacrifice" class="btn btn-secondary" style="display:none;" onclick="window._showSacrifice()">献祭回血</button>' : '';
    return `<div>
          <button id="btn-confirm" class="btn btn-primary" disabled>✓ 确认</button>
          ${sacBtn}
        </div>` + `需选 ${defenseSlots} 颗`;
  }
  return `<span style="color:var(--text-muted);font-size:.88rem">${phasePrompt(s)}</span>`;
}

function portraitInitials(name) {
  const cleaned = Array.from(String(name || '?').replace(/[\[\]\s]/g, ''));
  return cleaned.slice(-2).join('') || '?';
}

function portraitHTML(name, image) {
  return `
    <span class="portrait-fallback" aria-hidden="true">${portraitInitials(name)}</span>
    ${image ? `<img src="${image}" alt="${name || '角色'}" onerror="this.remove()">` : ''}
  `;
}

function battleTopbarHTML(s) {
  const canReschedule = !!s.me?.hasReschedule;
  return `
    <div class="battle-day">
      <span>对局进度</span>
      <strong>第 ${s.currentDay || 1} 天</strong>
    </div>
    <div class="battle-schedule-track">${scheduleHTML(s)}</div>
    ${canReschedule ? '<button id="btn-reschedule" class="btn btn-secondary battle-reschedule">调课</button>' : ''}
  `;
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
