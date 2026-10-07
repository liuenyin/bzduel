import { createDraftShop } from './draft-shop.js';
import { createDiceSelection } from './dice-selection.js';
import { createBattleChoices } from './choices.js';
import { createBattleResults } from './results.js';
import { configureCombatControls } from './controls.js';
import { buildAlerts } from './feedback.js';
import { playTurnResolution } from './animation.js';
import { buildArena, buildFfaGrid, getTurnFlow, hpLabel, tacticalBarHTML } from './arena.js';
import { OPPONENT_TARGET_TACTICAL_CARDS } from '../../../shared/tactical-rules.js';
import { createLifecycle } from '../../utils/lifecycle.js';
import { pct, getM, getAuraClass, multiTag, phasePrompt, actionButtons, battleTopbarHTML } from './presentation.js';

import { getLogSummary, battleLogContentHTML } from './log.js';
import { getStatusEffects, statusEffectHTML } from './status.js';
import { escapeHTML } from '../../utils/html.js';
// ============================================================
// 校园战力党 — 对战页面 (阶段制 · 卡牌动画)
// ============================================================
import { gameSocket } from '../../net/socket.js';
import { navigate } from '../../app/router.js';
import { SUBJECTS } from '../../../shared/rules.js';

import { vfxManager } from '../../utils/vfx.js';

import { bindBattleActions } from './actions.js';

export function createBattleView(container, data) {
  const actions = Object.create(null);
  const overlays = new Set();
  let shop, renderDice, updateActionButtons, showSacrifice, doSacrifice;
  let checkDreamTargetModal, showRescheduleModal, showGameOver;
  let S; // State belongs only to this mounted view.
  let animLock = false; // prevent state_update during animations
  let pendingState = null;
  let battleViewEpoch = 0;
  let activeBattleViewEpoch = 0;
  let animationEpoch = 0;
  let lastRenderedStatusIds = new Map();
  let lastTurnSignature = null;
  let pendingTacticalFeedback = null;
  let tacticalHandOpen = false;
  let viewLifecycle = createLifecycle();
  let lastLogContent = null;

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

  function isBattleViewActive(viewEpoch) {
    return activeBattleViewEpoch === viewEpoch;
  }

  function isAnimationActive(viewEpoch, animationId) {
    return isBattleViewActive(viewEpoch) && animationEpoch === animationId;
  }

  function cancelBattleAnimations() {
    animationEpoch += 1;
    animLock = false;
    pendingState = null;
  }

  function commitAnimatedState(newState, viewEpoch, animationId, shouldShowGameOver = false) {
    if (!isAnimationActive(viewEpoch, animationId)) return false;
    S = pendingState || newState;
    pendingState = null;
    animLock = false;
    refreshAll();
    if (shouldShowGameOver || S?.phase === 'game_over') {
      showGameOver(S);
    }
    return true;
  }

  function updateTurnFlow(state) {
    const flow = document.querySelector('#vs-area .battle-flow');
    const round = document.getElementById('battle-round');
    if (!flow || !round) return;
    const { direction, arrow: arrowText } = getTurnFlow(state);
    flow.classList.remove('toward-me', 'toward-opponent', 'neutral');
    flow.classList.add(direction);
    const arrow = flow.querySelector('.flow-arrow');
    if (arrow) arrow.textContent = arrowText;
    round.textContent = state.isExtraTurn ? '额外回合' : `第 ${state.totalRound || 1} 回合`;
  }

  function syncActiveCombatants(state) {
    const meWrap = document.getElementById('card-me');
    const opWrap = document.getElementById('card-op');
    const meIsAttacker = state.attackerIdx === state.myIndex;
    if (meWrap) {
      meWrap.classList.toggle('active-attacker', meIsAttacker);
      meWrap.classList.toggle('dead', !!state.me?.isDead);
    }
    if (opWrap) {
      opWrap.classList.toggle('active-attacker', !meIsAttacker);
      opWrap.classList.toggle('dead', !!state.opponent?.isDead);
    }
  }

  function syncBattleControlPanel() {
    const panel = document.querySelector('.battle-control-panel');
    const area = document.getElementById('dice-area');
    if (!panel || !area) return;
    const hasDice = area.childElementCount > 0;
    panel.classList.toggle('has-dice', hasDice);
    panel.classList.toggle('is-idle', !hasDice);
  }

  function revealCurrentClass() {
    const track = document.querySelector('.battle-schedule-track');
    const active = track?.querySelector('.sch-item.active');
    if (!track || !active || track.clientWidth >= track.scrollWidth) return;
    const target = active.offsetLeft - (track.clientWidth - active.offsetWidth) / 2;
    track.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }

  function seedBattleFeedbackState(state) {
    lastRenderedStatusIds = new Map(
      (state?.players || []).map(player => [player.id, new Set(getStatusEffects(player, state).map(effect => effect.id))])
    );
    lastTurnSignature = getTurnSignature(state);
    pendingTacticalFeedback = null;
  }

  function mount() {
    if (!container || !data?.state || typeof data.state !== 'object') {
      if (container) container.textContent = '战斗数据无效，请返回大厅重试。';
      return () => {};
    }
    const viewEpoch = ++battleViewEpoch;
    viewLifecycle.dispose();
    viewLifecycle = createLifecycle();
    lastLogContent = null;
    activeBattleViewEpoch = viewEpoch;
    cancelBattleAnimations();
    S = data.state;
    shop = createDraftShop({ actions, viewLifecycle, appendOverlay });
    ({ renderDice, updateActionButtons, showSacrifice, doSacrifice } = createDiceSelection({ getState: () => S, appendOverlay }));
    ({ checkDreamTargetModal, showRescheduleModal } = createBattleChoices({ getState: () => S, actions, appendOverlay }));
    ({ showGameOver } = createBattleResults({ actions, viewLifecycle, appendOverlay }));
    tacticalHandOpen = false;
    document.body.classList.remove('tactical-hand-open');
    let localConnectionLost = false;
    const socketListeners = [];
    const listen = (event, handler) => {
      const guardedHandler = (...args) => {
        if (!isBattleViewActive(viewEpoch)) return;
        handler(...args);
      };
      socketListeners.push([event, guardedHandler]);
      gameSocket.on(event, guardedHandler);
    };

    actions.showSacrifice = showSacrifice;
    actions.doSacrifice = value => doSacrifice(Number(value));
    actions.playTacticalCard = (id) => {
      if (id === 'card_gen_01') {
        const attacker = S.players?.[S.attackerIdx];
        const choices = [];
        const isAttacker = S.attackerIdx === S.myIndex;
        const addChoices = (player, rolls, allowed = true) => {
          if (!allowed || !player || !Array.isArray(rolls)) return;
          rolls.forEach((value, index) => {
            if (Number(value) >= 0) choices.push({ playerId: player.id, nickname: player.nickname, index, value });
          });
        };
        addChoices(attacker, S.attackRolls);
        if (S.aoeDefenses) {
          Object.entries(S.aoeDefenses).forEach(([playerId, defense]) => {
            const player = S.players?.find(item => item.id === playerId);
            if (player && !defense.confirmed) {
              addChoices(player, defense.rolls, isAttacker || playerId === S.me?.id);
            }
          });
        } else addChoices(S.players?.[S.defenderIdx], S.defenseRolls);
        const overlay = document.createElement('div');
        overlay.className = 'result-overlay targeted-card-overlay';
        overlay.innerHTML = `<div class="result-card targeted-card-modal" role="dialog" aria-modal="true" aria-label="选择重投目标">
          <h2>选择要重投的骰子</h2>
          <p>通用-增益：强行重投指定 1 颗骰子</p>
          <div class="targeted-dice-options">${choices.length
            ? choices.map(choice => `<button type="button" class="result-action" data-battle-action="playTargetedCard" data-value="${escapeHTML(`${choice.playerId}:${choice.index}`)}">${escapeHTML(choice.nickname)} · 第 ${choice.index + 1} 颗（${choice.value}）</button>`).join('')
            : '<p>当前没有可指定的骰子</p>'}</div>
          <button type="button" class="result-action secondary" data-battle-action="closeModal">取消</button>
        </div>`;
        appendOverlay(overlay);
        return;
      }
      actions.toggleHand(false);
      const cardEl = document.querySelector(`.hand-card-kards[data-card-id="${id}"]`);
      cardEl?.classList.add('disabled');
      gameSocket.playTacticalCard(id, (result) => {
        if (!viewLifecycle.active) return;
        if (!isBattleViewActive(viewEpoch)) return;
        if (!result?.ok) {
          cardEl?.classList.remove('disabled');
          actions.showToast(result?.error || '无法打出此战术卡');
        }
      });
    };

    actions.playTargetedCard = (value, target) => {
      const [targetId, indexText] = String(value || '').split(':');
      const dieIndex = Number(indexText);
      const overlay = target.closest('.targeted-card-overlay');
      if (!targetId || !Number.isInteger(dieIndex)) return;
      gameSocket.playTacticalCard('card_gen_01', { targetId, dieIndex }, (result) => {
        if (!viewLifecycle.active || !isBattleViewActive(viewEpoch)) return;
        if (result?.ok) overlay?.remove();
        else actions.showToast(result?.error || '无法重投此骰子');
      });
    };

    actions.selectFfaTarget = (pid) => {
      if (S.turnPhase === 'choose_target' && S.isMyAttackTurn) {
        gameSocket.selectTarget(pid);
      }
    };

    container.innerHTML = buildArena(S, tacticalHandOpen);
    seedBattleFeedbackState(S);
    actions.closeHand = () => actions.toggleHand(false);
    actions.closeModal = (_value, target) => target.closest('.result-overlay')?.remove();
    bindBattleActions({ container, overlays, lifecycle: viewLifecycle, actions });
    viewLifecycle.own(() => {
      for (const overlay of overlays) overlay.remove();
      overlays.clear();
    });
    configureCombatControls({ actions, socket: gameSocket, lifecycle: viewLifecycle, showRescheduleModal, navigate, updateActionButtons });
    refreshAll();
    queueMicrotask(viewLifecycle.guard(revealCurrentClass));

    listen('state_update', (s) => {
      if (s?.phase === 'game_over') {
        cancelBattleAnimations();
        S = s;
        refreshAll();
        showGameOver(s);
        return;
      }
      if (animLock) {
        pendingState = s;
      } else {
        S = s;
        pendingState = null;
        refreshAll();
      }
    });
    listen('atk_confirmed', (d) => { S = d.state; onAtkConfirmed(d); });
    listen('turn_resolved', (d) => { S = d.state; onTurnResolved(d); });
    listen('class_change', (d) => showClassChange(d));
    listen('opponent_connection_lost', ({ graceMs }) => {
      const seconds = Math.ceil((graceMs || 60000) / 1000);
      const el = document.getElementById('phase-text');
      if (el) el.innerHTML = `<span style="color:var(--accent)">对手暂时掉线，等待重连（${seconds} 秒）</span>`;
    });
    listen('opponent_reconnected', () => {
      actions.showToast('对手已重新连接');
      const el = document.getElementById('phase-text');
      if (el) el.innerHTML = '<span style="color:var(--green)">对手已重新连接</span>';
    });
    listen('opponent_disconnected', () => {
      const el = document.getElementById('phase-text');
      if (el) el.innerHTML = '<span style="color:var(--red)">对手离线超时，已退出本局</span>';
    });
    listen('game_over', ({ state, reason, surrenderedId }) => {
      S = state;
      cancelBattleAnimations();
      refreshAll();
      showGameOver(state, { reason, surrenderedId });
    });
    listen('rematch_status', ({ readyCount, required, isReady }) => {
      const button = document.getElementById('btn-rematch');
      if (!button) return;
      button.disabled = isReady;
      button.textContent = isReady ? `等待对手（${readyCount}/${required}）` : `申请重赛（${readyCount}/${required}）`;
    });
    listen('rematch_started', (nextGame) => {
      document.querySelector('.game-over-screen')?.remove();
      navigate('preparation', nextGame);
    });
    listen('opponent_left_room', () => {
      const button = document.getElementById('btn-rematch');
      if (button) {
        button.disabled = true;
        button.textContent = '对手已离开';
      }
      actions.showToast('对手已离开房间');
    });
    listen('room_closed', ({ reason }) => {
      window.alert(reason || '房间已关闭');
      gameSocket.currentRoomId = null;
      navigate('lobby');
    });
    listen('error_msg', (d) => {
      actions.showToast(d?.message || '操作失败');
      refreshAll();
    });
    listen('buy_water_result', (d) => {
      S = d.state;
      refreshAll();
      showBanner(`买水成功！当前蓄势: ${d.chargeStacks} 层`);
    });
    listen('tactical_card_played', ({ playerId, card }) => {
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
      actions.showToast(isMe ? `已使用【${card.name}】` : `对手使用了【${card.name}】`);
    });

    const stopConnectionStatus = gameSocket.onConnectionStatus(({ connected }) => {
      if (!isBattleViewActive(viewEpoch)) return;
      const el = document.getElementById('phase-text');
      if (!connected) {
        localConnectionLost = true;
        if (el) el.innerHTML = '<span style="color:var(--accent)">连接中断，正在自动重连…</span>';
      } else if (localConnectionLost) {
        localConnectionLost = false;
        if (el) el.innerHTML = '<span style="color:var(--green)">连接已恢复，正在同步战局…</span>';
        actions.showToast('已重新连接到对局');
      }
    });

    if (S.phase === 'game_over') queueMicrotask(() => {
      if (isBattleViewActive(viewEpoch)) showGameOver(S);
    });

    return () => {
      for (const [event, handler] of socketListeners) gameSocket.off(event, handler);
      stopConnectionStatus();
      if (activeBattleViewEpoch === viewEpoch) {
        viewLifecycle.dispose();
        tacticalHandOpen = false;
        activeBattleViewEpoch = 0;
        cancelBattleAnimations();
        document.body.classList.remove('tactical-hand-open');
      }
    };
  }

  // ── 事件绑定 (仅初始化时调用一次) ──
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

    queueMicrotask(viewLifecycle.guard(() => {
      for (const effect of addedEffects) {
        const element = [...container.querySelectorAll('.status-effect')]
          .find(candidate => candidate.dataset.statusId === effect.id);
        if (element) vfxManager.playStatusChange(element, { added: true, category: effect.category });
      }
      if (removedCount > 0) vfxManager.playStatusChange(container, { added: false, category: 'neutral' });
    }));
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
      appendOverlay(dreamBg);
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
      sb.innerHTML = battleTopbarHTML(S);
    }
    // Reroll count
    setText('reroll-count', `重投 <strong>${S.me.rerolls}</strong> 次`);
    const rrEl = document.getElementById('btn-reroll');
    if (rrEl) delete rrEl.dataset.rerolling;
    // Phase & actions
    setText('phase-text', phasePrompt(S));
    setText('action-bar', actionButtons(S));
    setText('tactical-bar', tacticalBarHTML(S, tacticalHandOpen));
    refreshBattleLog();
    // Dice - render if available
    renderDice();
    syncActiveCombatants(S);
    syncBattleControlPanel();
    updateTurnFlow(S);
    revealCurrentClass();
    // Check dream target modal
    checkDreamTargetModal(S);
    shop.render(S);
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
    const logContent = JSON.stringify(entries);
    if (content && logContent !== lastLogContent) {
      content.innerHTML = battleLogContentHTML(S);
      lastLogContent = logContent;
    }

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

  // ── 战术卡 & 补给站 Modal ──
  actions.toggleHand = (force) => {
    tacticalHandOpen = typeof force === 'boolean' ? force : !tacticalHandOpen;
    const tray = document.getElementById('hand-fan-container');
    const backdrop = document.getElementById('hand-tray-backdrop');
    const fab = document.getElementById('hand-fab');
    tray?.classList.toggle('expanded', tacticalHandOpen);
    backdrop?.classList.toggle('expanded', tacticalHandOpen);
    fab?.classList.toggle('active', tacticalHandOpen);
    fab?.setAttribute('aria-expanded', String(tacticalHandOpen));
    tray?.setAttribute('aria-hidden', String(!tacticalHandOpen));
    if (tray) {
      if (tacticalHandOpen) tray.removeAttribute('inert');
      else tray.setAttribute('inert', '');
    }
    document.body.classList.toggle('tactical-hand-open', tacticalHandOpen);
  };

  actions.showToast = (msg) => {
    const t = document.createElement('div');
    t.className = 'toast show';
    t.textContent = msg;
    appendOverlay(t);
    viewLifecycle.delay(() => t.remove(), 2500);
  };

  // ── 掷骰展示 ──

  // 献祭弹窗

  // ── 攻击确认回调 ──
  function onAtkConfirmed(data) {
    const phase = document.getElementById('phase-text');
    if (phase) phase.innerHTML = buildAlerts(data);

    viewLifecycle.delay(() => refreshAll(), 600);
  }

  // ── 辅助：构建提示信息 ──

  // ── 回合结算回调 (含攻击动画) ──
  function onTurnResolved(data) {
    if (!viewLifecycle.active || !data?.state) return;
    const viewEpoch = activeBattleViewEpoch;
    const animationId = ++animationEpoch;
    animLock = true;
    playTurnResolution(data, {
      state: S, lifecycle: viewLifecycle, setHP, getPlayerCardElement,
      isActive: () => isAnimationActive(viewEpoch, animationId),
      commit: (nextState, gameOver) => commitAnimatedState(nextState, viewEpoch, animationId, gameOver),
    });
  }

  // ── 换课动画 ──
  function showClassChange(data = {}) {
    const viewEpoch = activeBattleViewEpoch;
    viewLifecycle.delay(() => {
      if (!isBattleViewActive(viewEpoch)) return;
      if (!data || typeof data !== 'object') return;
      const subjectId = typeof data.subject === 'string' ? data.subject : '';
      const subject = SUBJECTS[subjectId];
      const classIndex = Number.isInteger(data.index) && data.index >= 0 ? data.index : 0;
      const day = Number.isInteger(data.day) && data.day > 0 ? data.day : 1;
      const overlay = document.createElement('div');
      overlay.className = data.dayChanged ? 'class-change-overlay day-change-overlay' : 'class-change-overlay compact';
      overlay.innerHTML = `
        <div class="class-change-content">
          <div class="cc-icon">${escapeHTML(subject?.icon || '📝')}</div>
          ${data.dayChanged ? `<div class="cc-day">第 ${day} 天</div>` : ''}
          <div class="cc-label">第 ${classIndex + 1} 节课</div>
          <div class="cc-name">${escapeHTML(subject?.label || subjectId || '未知课程')}</div>
        </div>
      `;
      appendOverlay(overlay);
      const holdTime = data.dayChanged ? 1700 : 900;
      viewLifecycle.delay(() => { overlay.classList.add('fade-out'); viewLifecycle.delay(() => overlay.remove(), 350); }, holdTime);
    }, 2500);
  }


  // ── 结算 ──

  // ── 辅助 ──
  function curSubj() {
    const schedule = Array.isArray(S?.schedule) ? S.schedule : [];
    return schedule[S?.currentClassIndex] || schedule[schedule.length - 1] || '';
  }

  function updateAura(el, p) {
    if (!el) return;
    const newAura = getAuraClass(p);
    vfxManager.triggerAuraEffect(el, newAura);
  }

  function setHP(barId, hp, maxHp, txtId) {
    const bar = document.getElementById(barId);
    const txt = document.getElementById(txtId);
    const isHidden = hp === '??';
    if (bar) {
      const container = bar.closest('.bc-hp');
      const previousHp = Number(bar.dataset.hp);
      const nextHp = Number(hp);
      bar.style.width = isHidden ? '100%' : `${pct(hp, maxHp)}%`;
      if (!isHidden && Number.isFinite(nextHp)) {
        bar.dataset.hp = String(nextHp);
        container?.classList.toggle('hp-critical', maxHp > 0 && nextHp / maxHp <= 0.25);
        container?.setAttribute('aria-label', `生命 ${nextHp}/${maxHp}`);
        if (Number.isFinite(previousHp) && previousHp !== nextHp && container) {
          const feedbackClass = nextHp < previousHp ? 'hp-loss' : 'hp-gain';
          container.classList.remove('hp-loss', 'hp-gain');
          void container.offsetWidth;
          container.classList.add(feedbackClass);
          viewLifecycle.delay(() => container.classList.remove(feedbackClass), 620);
        }
      }
    }
    if (txt) txt.textContent = hpLabel(hp, maxHp);
  }

  function showBanner(text) {
    const b = document.createElement('div');
    b.className = 'class-banner';
    b.textContent = text;
    appendOverlay(b);
    viewLifecycle.delay(() => b.classList.add('fade-out'), 1500);
    viewLifecycle.delay(() => b.remove(), 2000);
  }
  function setText(id, html) { const e = document.getElementById(id); if(e) e.innerHTML = html; }

  function appendOverlay(element) {
    for (const existing of overlays) if (!existing.isConnected) overlays.delete(existing);
    overlays.add(element);
    document.body.appendChild(element);
  }

  return { mount, resolveTurn: value => {
    if (viewLifecycle.active && activeBattleViewEpoch) onTurnResolved(value);
  } };
}
