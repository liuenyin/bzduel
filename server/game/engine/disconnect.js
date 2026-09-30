import { confirmDefense } from './defense.js';
import { resolvePhaseEnd } from './phase.js';
import { getAllowedSlotCount } from './dice.js';
import { areValidDiceIndices, findPlayer } from './primitives.js';
import { PHASE, GAME_MODE } from '../../../shared/rules.js';
import { resolveImmediateDeaths } from './immediate-deaths.js';

export function eliminateDisconnectedPlayer(state, playerId) {
  if (state?.phase !== PHASE.BATTLE) return { ok: false, error: 'invalid_phase' };
  const player = findPlayer(state, playerId);
  if (!player || player.isDead) return { ok: false, error: 'player_not_found' };

  const turnData = state.turnData || {};
  const playerIndex = state.players.indexOf(player);
  const wasAttacker = turnData.attackerIdx === playerIndex;
  const wasDefender = turnData.defenderIdx === playerIndex;
  const wasAoeDefender = !!(turnData.isAoE && turnData.aoeDefenses?.[playerId]);

  player.hp = 0;
  const deathResolution = resolveImmediateDeaths(state, {
    cause: 'disconnect',
    allowRevive: false,
  });
  const baseResult = {
    ok: true,
    ...deathResolution,
    deathCause: 'disconnect',
    disconnectedId: playerId,
    advanced: false,
  };
  if (deathResolution.gameOver) return baseResult;
  if (state.gameMode !== GAME_MODE.MODE_FFA) return baseResult;

  if (wasAoeDefender) {
    const aoeDefenses = turnData.aoeDefenses || {};
    const liveDefenses = Object.entries(aoeDefenses).filter(([id]) => {
      const candidate = findPlayer(state, id);
      return candidate && !candidate.isDead && candidate.hp > 0;
    });
    if (liveDefenses.some(([, defense]) => !defense?.confirmed)) {
      return { ...baseResult, waitingForOthers: true };
    }

    // Earlier confirmations only record choices; damage is resolved when the
    // final living defender confirms. Replaying one recorded confirmation is
    // therefore safe and lets a last-pending disconnect finish the AoE turn.
    const [candidateId, defense] = liveDefenses.find(([, entry]) => entry?.confirmed) || [];
    const candidate = candidateId ? findPlayer(state, candidateId) : null;
    const rolls = Array.isArray(defense?.rolls) ? defense.rolls : [];
    if (candidate?.card && rolls.length > 0) {
      const allowedSlots = getAllowedSlotCount(state, candidateId, 'defense');
      const requiredSlots = allowedSlots === -1 ? rolls.length : allowedSlots;
      const savedIndices = Array.isArray(defense.keepIndices) ? defense.keepIndices : [];
      const keepIndices = areValidDiceIndices(savedIndices, rolls.length, requiredSlots)
        ? savedIndices
        : Array.from({ length: requiredSlots }, (_, index) => index);
      if (areValidDiceIndices(keepIndices, rolls.length, requiredSlots)) {
        defense.confirmed = false;
        const turnResult = confirmDefense(state, candidateId, keepIndices, defense.options || {});
        if (turnResult.ok) return { ...baseResult, ...turnResult, advanced: true, deathCause: 'disconnect' };
      }
    }

    return { ...baseResult, ...resolvePhaseEnd(state), advanced: true, deathCause: 'disconnect' };
  }

  if (wasAttacker || wasDefender) {
    return { ...baseResult, ...resolvePhaseEnd(state), advanced: true, deathCause: 'disconnect' };
  }
  return baseResult;
}
