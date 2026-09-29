import { vfxManager } from '../../utils/vfx.js';
import { playHit } from '../../utils/audio.js';
import { buildAlerts, buildResolutionSummary } from './feedback.js';

function playResolvedSkillFeedback(data, state, getPlayerCardElement) {
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

export function playTurnResolution(data, { state: S, lifecycle: viewLifecycle, isActive, commit, setHP, getPlayerCardElement }) {
  const newState = data.state;
  const { damage, finalDef, penalty, gameOver, attackerIdx } = data;

  const phase = document.getElementById('phase-text');
  const alerts = buildAlerts(data);
  if (phase) phase.innerHTML = `${buildResolutionSummary(data)}${alerts}`;
  playResolvedSkillFeedback(data, newState, getPlayerCardElement);

  const dArea = document.getElementById('dice-area');
  if (dArea) {
    const defSumEl = dArea.querySelector('.dice-row:last-child .dice-sum');
    if (defSumEl) defSumEl.innerHTML = `= ${finalDef}${penalty ? ` <small>(−${penalty})</small>` : ''}`;
  }

  const isAoE = data.isAoE && Array.isArray(data.aoeResults);

  if (isAoE) {
    // FFA 群伤效果动画
    viewLifecycle.delay(() => {
      if (!isActive()) return;
      if (!S || typeof S.myIndex === 'undefined') {
        commit(newState, gameOver);
        return;
      }
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

      const ffaGrid = document.querySelector('.ffa-opponents-grid');
      ffaGrid?.classList.add('aoe-resolving');
      const aoeHold = Math.max(1500, 520 + data.aoeResults.length * 170);

      data.aoeResults.forEach((res, index) => {
        const dId = res.playerId;
        const getLiveDCard = () => dId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${dId}"]`);

        const impactDelay = 260 + index * 150;
        viewLifecycle.delay(() => {
          if (!isActive()) return;
          const liveDCard = getLiveDCard();
          if (liveDCard && document.body.contains(liveDCard)) liveDCard.classList.add('card-hit', 'aoe-target-hit');
        }, impactDelay);

        viewLifecycle.delay(() => {
          if (!isActive()) return;
          const liveDCard = getLiveDCard();
          if (liveDCard && document.body.contains(liveDCard)) {
            vfxManager.playHitImpact(liveDCard, res.damage, {
              isCrit: res.damage >= 8,
              isHeavy: res.damage >= 15,
              nineLivesTriggered: res.nineLivesTriggered,
              isAoE: true
            });
            if (res.lcCounterDamage > 0) {
              viewLifecycle.delay(() => {
                if (!isActive()) return;
                const liveAtkCard = getLiveAtkCard();
                if (liveAtkCard && document.body.contains(liveAtkCard)) {
                  vfxManager.playHitImpact(liveAtkCard, res.lcCounterDamage, { counter: true });
                }
              }, 180);
            }
          }
        }, impactDelay + 80);
      });

      viewLifecycle.delay(() => {
        if (!isActive()) return;
        setHP('hp-me', newState.me.hp, newState.me.maxHp, 'hp-me-t');
      }, 400);

      viewLifecycle.delay(() => {
        if (!isActive()) return;
        const liveAtkCard = getLiveAtkCard();
        if (liveAtkCard && document.body.contains(liveAtkCard)) liveAtkCard.classList.remove('card-attacking');
        ffaGrid?.classList.remove('aoe-resolving');
        data.aoeResults.forEach(res => {
          const dId = res.playerId;
          const liveDCard = dId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${dId}"]`);
          if (liveDCard && document.body.contains(liveDCard)) liveDCard.classList.remove('card-hit', 'aoe-target-hit');
        });

        viewLifecycle.delay(() => {
          commit(newState, gameOver);
        }, data.classChanged ? 1500 : 500);
      }, aoeHold);
    }, 800);
  } else {
    // 1v1 动画
    viewLifecycle.delay(() => {
      if (!isActive()) return;
      if (!S || typeof S.myIndex === 'undefined') {
        commit(newState, gameOver);
        return;
      }
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

      viewLifecycle.delay(() => {
        if (!isActive()) return;
        const liveDefCard = getLiveDefCard();
        if (liveDefCard && document.body.contains(liveDefCard)) liveDefCard.classList.add('card-hit');
      }, 300);

      viewLifecycle.delay(() => {
        if (!isActive()) return;
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
          viewLifecycle.delay(() => {
            if (!isActive()) return;
            const liveAtkCard = getLiveAtkCard();
            if (liveAtkCard && document.body.contains(liveAtkCard)) {
              vfxManager.playHitImpact(liveAtkCard, data.lcCounterDamage, { counter: true });
            }
          }, 180);
        }
        playHit(damage >= 8);
        if (isActive()) {
          setHP('hp-me', newState.me.hp, newState.me.maxHp, 'hp-me-t');
        }
        if (newState.gameMode === '1v1') {
          if (isActive()) {
            setHP('hp-op', newState.opponent.hp, newState.opponent.maxHp, 'hp-op-t');
          }
        }
      }, 400);

      viewLifecycle.delay(() => {
        if (!isActive()) return;
        const liveAtkCard = getLiveAtkCard();
        const liveDefCard = getLiveDefCard();
        if (liveAtkCard && document.body.contains(liveAtkCard)) liveAtkCard.classList.remove('card-attacking');
        if (liveDefCard && document.body.contains(liveDefCard)) liveDefCard.classList.remove('card-hit');

        viewLifecycle.delay(() => {
          commit(newState, gameOver);
        }, data.classChanged ? 1500 : 500);
      }, 1500);
    }, 800);
  }
}
