import { configureCombatControls } from './controls.js';
import { buildAlerts } from './feedback.js';
import { playTurnResolution } from './animation.js';
import { buildArena, buildFfaGrid, getTurnFlow, hpLabel, tacticalBarHTML, identityName } from './arena.js';
import { OPPONENT_TARGET_TACTICAL_CARDS } from '../../../shared/tactical-rules.js';
import { createLifecycle } from '../../utils/lifecycle.js';
import { pct, getM, getAuraClass, multiTag, phasePrompt, actionButtons, battleTopbarHTML } from './presentation.js';

import { getLogSummary, battleLogContentHTML, battleSummaryHTML } from './log.js';
import { getStatusEffects, statusEffectHTML, buffIcons } from './status.js';
import { escapeHTML } from '../../utils/html.js';
// ============================================================
// 校园战力党 — 对战页面 (阶段制 · 卡牌动画)
// ============================================================
import { gameSocket } from '../../net/socket.js';
import { navigate } from '../../app/router.js';
import { SUBJECTS, CORE_SUBJECTS, ELECTIVE_SUBJECTS, MINOR_SUBJECTS, DICE_COLORS } from '../../../shared/rules.js';

import { vfxManager } from '../../utils/vfx.js';

import { bindBattleActions } from './actions.js';

export function createBattleView(container, data) {
  const actions = Object.create(null);
  const overlays = new Set();
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
  let draftInteraction = null;
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
    tacticalHandOpen = false;
    draftInteraction = null;
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

    actions.refreshDraftSlot = (value) => {
      const idx = Number(value);
      if (draftInteraction) return;
      const slot = document.querySelector(`.draft-slot-card[data-slot-index="${idx}"]`);
      draftInteraction = {
        type: 'refresh',
        index: idx,
        previousCardId: slot?.dataset.cardId || '',
      };
      slot?.classList.add('is-refreshing');
      gameSocket.refreshDraftSlot(idx);
      viewLifecycle.delay(() => {
        if (draftInteraction?.type === 'refresh' && draftInteraction.index === idx) {
          draftInteraction = null;
          slot?.classList.remove('is-refreshing');
        }
      }, 1400);
    };
    actions.buyDraftCard = (value) => {
      const idx = Number(value);
      if (draftInteraction) return;
      const slot = document.querySelector(`.draft-slot-card[data-slot-index="${idx}"]`);
      draftInteraction = { type: 'buy', index: idx };
      slot?.classList.add('is-buying');
      slot?.setAttribute('aria-busy', 'true');
      gameSocket.buyDraftCard(idx, (result) => {
        if (!viewLifecycle.active) return;
        if (!isBattleViewActive(viewEpoch)) return;
        if (result?.ok) {
          actions.showToast('已加入手牌');
          viewLifecycle.delay(() => {
            if (draftInteraction?.type === 'buy' && draftInteraction.index === idx) draftInteraction = null;
          }, 900);
        } else {
          draftInteraction = null;
          slot?.classList.remove('is-buying');
          slot?.removeAttribute('aria-busy');
          actions.showToast(result?.error || '购买失败');
        }
      });
    };
    actions.confirmDraftReady = () => { gameSocket.confirmDraftReady(); };
    actions.showSacrifice = showSacrifice;
    actions.doSacrifice = value => doSacrifice(Number(value));
    actions.playTacticalCard = (id) => {
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
            <button class="dream-target-btn" data-battle-action="pickDreamTarget" data-value="0">
              目标 A
            </button>
            <button class="dream-target-btn" data-battle-action="pickDreamTarget" data-value="1">
              目标 B
            </button>
            <button class="dream-target-btn" data-battle-action="pickDreamTarget" data-value="2">
              目标 C
            </button>
          </div>
          <p style="font-size:0.75rem; color:var(--text-secondary);">* 选错分身：分身使用超强骰池 (D7+D9+D9+D9+D11) 且无法伤及本体！</p>
        </div>
      `;
      appendOverlay(overlay);
      actions.pickDreamTarget = (value) => {
      const idx = Number(value);
        gameSocket.chooseDreamTarget(idx);
        overlay.remove();
      };
    } else {
      if (existing) existing.remove();
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

  function checkDraftShopModal(s) {
    const existing = document.getElementById('draft-shop-modal');
    if (s.draftShop && s.draftShop.active && s.me) {
      const pDraft = s.draftShop.players?.[s.me.id];
      if (!pDraft) return;

      const renderSlots = () => {
        return pDraft.slots.map((slot, idx) => {
          const c = slot.card;
          if (!c) {
            const justPurchased = draftInteraction?.type === 'buy' && draftInteraction.index === idx;
            return `
              <div class="draft-slot-card empty ${justPurchased ? 'just-purchased' : ''}" data-slot-index="${idx}">
                <span class="draft-purchased-mark" aria-hidden="true">✓</span>
                <strong>已加入手牌</strong>
                <small>此位置已购买</small>
              </div>
            `;
          }
          const typeClass = c.type || 'buff';
          const scopeLabel = c.subject === 'universal' ? '通用' : (SUBJECTS[c.subject]?.label || c.subject);
          const isHandFull = (s.me.handCards || []).length >= 3;
          const isAfford = s.me.tp >= c.tpCost;
          const buyDisabled = isHandFull || !isAfford;
          let disableReason = '';
          if (isHandFull) disableReason = '手牌已满';
          else if (!isAfford) disableReason = 'TP不足';

          const stars = '★'.repeat(c.tpCost) + '☆'.repeat(Math.max(0, 3 - c.tpCost));
          const isRefreshing = draftInteraction?.type === 'refresh' && draftInteraction.index === idx;
          const justRefreshed = isRefreshing && draftInteraction.previousCardId && draftInteraction.previousCardId !== c.id;
          const cardState = justRefreshed ? 'just-refreshed' : (isRefreshing ? 'is-refreshing' : '');
          const actionLabel = buyDisabled ? disableReason : `购买 · ${c.tpCost} TP`;

          return `
            <div class="draft-slot-card ${buyDisabled ? 'disabled' : 'clickable'} ${cardState}" data-slot-index="${idx}" data-card-id="${escapeHTML(c.id)}"
                 ${buyDisabled ? '' : `role="button" tabindex="0" data-battle-action="buyDraftCard" data-value="${idx}"`}
                 aria-label="${escapeHTML(`${c.name}，${actionLabel}`)}">
              <button type="button" class="btn-icon-refresh" ${slot.refreshesLeft > 0 && !isRefreshing ? '' : 'disabled'}
                      data-battle-action="refreshDraftSlot" data-value="${idx}" title="刷新卡牌，剩余 ${slot.refreshesLeft} 次" aria-label="刷新卡牌，剩余 ${slot.refreshesLeft} 次">
                <span aria-hidden="true">↻</span><small>${slot.refreshesLeft}</small>
              </button>
              <div class="draft-card-header">
                <span class="card-tag-type ${escapeHTML(typeClass)}">${escapeHTML(scopeLabel)}</span>
                <span class="draft-card-star" aria-label="${c.tpCost} 点战术点">${stars}</span>
              </div>
              <div class="draft-card-title">${escapeHTML(c.name)}</div>
              <div class="draft-card-desc">${escapeHTML(c.desc)}</div>
              <div class="draft-card-footer">
                <span class="draft-card-cost">${c.tpCost} TP</span>
                <span class="draft-card-action">${escapeHTML(actionLabel)}</span>
              </div>
            </div>
          `;
        }).join('');
      };

      const statusHTML = `
        <div class="draft-shop-status-copy">
          <span class="draft-shop-kicker">下一节课开始前</span>
          <strong>选一张卡，或刷新你不需要的卡</strong>
        </div>
        <div class="draft-shop-metrics" aria-label="补给站资源">
          <span class="draft-metric"><small>手牌</small><b>${s.me.handCards?.length || 0}/3</b></span>
          <span class="draft-metric tp"><small>战术点</small><b>${s.me.tp} TP</b></span>
        </div>
      `;

      if (pDraft.ready) {
        if (existing) {
          existing.querySelector('.draft-shop-panel').innerHTML = `
            <div class="draft-shop-title-row"><div><span class="draft-shop-eyebrow">课间补给</span><h2>战术补给站</h2></div><span class="draft-ready-mark">✓</span></div>
            <div class="draft-waiting-state"><span class="draft-waiting-dot" aria-hidden="true"></span><strong>已完成选牌</strong><span>等待对方完成选择…</span></div>
          `;
        }
        return;
      }

      if (existing) {
        const slotsWrap = existing.querySelector('#draft-slots-wrap');
        if (slotsWrap) slotsWrap.innerHTML = renderSlots();
        const status = existing.querySelector('#draft-shop-status');
        if (status) status.innerHTML = statusHTML;
        if (draftInteraction?.type === 'refresh' && draftInteraction.previousCardId && pDraft.slots[draftInteraction.index]?.card?.id !== draftInteraction.previousCardId) {
          viewLifecycle.delay(() => { if (draftInteraction?.type === 'refresh') draftInteraction = null; }, 450);
        }
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'result-overlay';
      overlay.id = 'draft-shop-modal';
      overlay.style.zIndex = '9999';

      overlay.innerHTML = `
        <div class="draft-shop-panel">
          <div class="draft-shop-title-row">
            <div><span class="draft-shop-eyebrow">课间补给</span><h2>战术补给站</h2></div>
            <span class="draft-shop-icon" aria-hidden="true">✦</span>
          </div>
          <div class="draft-shop-status" id="draft-shop-status">${statusHTML}</div>
          <div class="draft-slots-container" id="draft-slots-wrap">
            ${renderSlots()}
          </div>
          <div class="draft-shop-footer">
            <span>最多持有 3 张战术卡</span>
            <button class="btn btn-primary btn-lg" data-battle-action="confirmDraftReady">
              完成选牌
            </button>
          </div>
        </div>
      `;

      appendOverlay(overlay);
    } else {
      if (existing) existing.remove();
    }
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
        const isYzx = v === -1 || (atkPlayer && atkPlayer.stealthActive);
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
    const myAoeDefense = S.aoeDefenses?.[S.me?.id] || null;
    if (Array.isArray(S.defenseRolls) || Array.isArray(myAoeDefense?.rolls)) {
      // 防御骰
      const canSelect = S.turnPhase === 'def_rolled' && S.isMyDefendTurn;
      const rollsToRender = myAoeDefense ? myAoeDefense.rolls : S.defenseRolls;
      const isConfirmed = !!myAoeDefense?.confirmed;

      html += `<div class="dice-row"><span class="dice-label" style="color:var(--blue)">守</span>`;
      if (Array.isArray(rollsToRender)) {
        html += rollsToRender.map((v, i) => {
          const face = defPool[i] || 6;
          const color = DICE_COLORS[face];
          // 如果点数是 -1，说明被后端屏蔽了
          const isYzx = v === -1 || (defPlayer && defPlayer.stealthActive);
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
      d.dataset.battleAction = 'selectDie';
      d.setAttribute('role', 'button');
      d.tabIndex = 0;
      d.setAttribute('aria-label', `骰子 ${d.dataset.val}`);
      d.setAttribute('aria-pressed', String(d.classList.contains('selected')));
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
        btnReroll.innerHTML = `重投 ${count} 颗`;
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
  function showSacrifice() {
    const sel = document.querySelectorAll('.die.defense.selected');
    let opts = '';
    sel.forEach(d => {
      opts += `<button class="btn btn-secondary" data-battle-action="doSacrifice" data-value="${d.dataset.idx}">献祭 ${d.dataset.val}</button>`;
    });
    const m = document.createElement('div');
    m.className = 'result-overlay';
    m.id = 'sacrifice-modal';
    m.innerHTML = `<div class="panel"><h3>选择一个骰子进行献祭</h3><p>该骰子变1，回复其点数-1的HP</p>${opts}</div>`;
    appendOverlay(m);
  }

  function doSacrifice(idx) {
    const indices = Array.from(document.querySelectorAll('.die.defense.selected')).map(d => parseInt(d.dataset.idx));
    gameSocket.confirmDice(indices, { sacrificeIndex: idx });
    document.getElementById('sacrifice-modal')?.remove();
  }

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
      return `<button data-battle-action="pickSubj" data-value="${id}">${s.icon} ${s.label}</button>`;
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
          <button class="btn btn-secondary" data-battle-action="closeModal">取消</button>
        </div>
      </div>
    `;
    appendOverlay(overlay);
    actions.pickSubj = (id) => {
      const targetIdx = parseInt(document.getElementById('reschedule-idx-select').value);
      gameSocket.useReschedule(targetIdx, id);
      overlay.remove();
    };
  }

  // ── 结算 ──

  function showGameOver(s, meta = {}) {
    if (!s || typeof s !== 'object') return;
    meta = meta && typeof meta === 'object' ? meta : {};
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
        isWin = s.me?.identity === 'lord' || s.me?.identity === 'loyalist';
        statusStr = isWin ? '胜 利 (主公/忠臣 赢)' : '败 北 (主公/忠臣 赢)';
      } else if (s.winner === 'rebel') {
        isWin = s.me?.identity === 'rebel';
        statusStr = isWin ? '胜 利 (反贼 赢)' : '败 北 (反贼 赢)';
      } else if (s.winner === 'spy') {
        isWin = s.me?.identity === 'spy';
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
      const card = p.card && typeof p.card === 'object'
        ? p.card
        : { name: '未知角色', image: '' };
      const isYzx = (p.cardId === 'char_10' || p.stealthActive) && !isMe;
      const hpText = isYzx ? '??' : p.hp;
      const maxHpText = isYzx ? '??' : p.maxHp;
      const hpPercent = isYzx ? 100 : pct(Number(p.hp), Number(p.maxHp));
      const identityHtml = s.gameMode === 'sanguosha' ? `<div style="color:var(--accent);font-size:0.8rem;margin-top:4px;">身份: ${escapeHTML(p.identity === '?' ? '未知' : identityName(p.identity))}</div>` : '';

      return `
        <div class="player-box ${isMe ? 'me' : 'op'} ${isYzx ? 'stealth' : ''}" style="${s.gameMode === 'sanguosha' ? 'width:45%; margin-bottom:10px;' : ''}">
          <div class="avatar-area">
            ${card.image ? `<img src="${escapeHTML(card.image)}" class="avatar" alt="${escapeHTML(card.name || '角色')}" onerror="this.remove()" />` : ''}
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
              <div class="hp-text">${escapeHTML(hpText)} / ${escapeHTML(maxHpText)}</div>
            </div>
            <div class="buffs-row">${buffIcons(p, s)}</div>
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
    appendOverlay(o);
    viewLifecycle.listen(document.getElementById('btn-rematch'), 'click', () => {
      const button = document.getElementById('btn-rematch');
      button.disabled = true;
      button.textContent = s.opponent?.id?.startsWith('AI_') ? '正在重开…' : '等待对手（1/2）';
      gameSocket.requestRematch((result) => {
        if (!viewLifecycle.active) return;
        if (!result?.ok) {
          button.disabled = false;
          button.textContent = '再来一局';
          actions.showToast(result?.error || '无法重赛');
        }
      });
    });
    viewLifecycle.listen(document.getElementById('btn-back'), 'click', () => {
      gameSocket.leaveRoom();
      o.remove();
      navigate('lobby');
    });
  }

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
