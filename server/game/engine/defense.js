import { canPlayBattleAction, getCourseMultiplier } from './primitives.js';
import { TURN } from '../../../shared/turn.js';
import { resolveAoeDefense } from './aoe-defense.js';
import { resolveSingleDefense } from './single-defense.js';

export function confirmDefense(state, playerId, keepIndices, options = {}) {
  if (!canPlayBattleAction(state) || state.turnPhase !== TURN.DEF_ROLLED) return { ok: false };
  if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};

  const atk = state.players[state.turnData.attackerIdx];
  if (!atk?.card || atk.isDead || atk.hp <= 0) return { ok: false, error: 'player_defeated' };
  const subj = state.schedule[state.currentClassIndex];
  let atkMulti = getCourseMultiplier(atk, state);
  const ar = state.turnData.atkResult;
  if (!ar || !Number.isFinite(ar.finalAtk)) return { ok: false, error: 'invalid_turn_state' };
  let finalBaseAtk = ar.finalAtk;

  const resolve = state.turnData.isAoE ? resolveAoeDefense : resolveSingleDefense;
  return resolve(state, playerId, keepIndices, options, { atk, subj, atkMulti, ar, finalBaseAtk });
}
