import { resolvePhaseEnd } from './phase.js';
import { canPlayBattleAction } from './primitives.js';
import { TURN } from '../../../shared/turn.js';
import { PHASE, GAME_MODE } from '../../../shared/rules.js';
import { SKILL } from '../../../shared/characters.js';

export function chooseDreamTarget(state, playerId, targetIndex) {
  if (!canPlayBattleAction(state)) return { ok: false };
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > 2) {
    return { ok: false, error: 'invalid_index' };
  }
  const fxr = state.players.find(p => p.card?.positiveSkill?.id === SKILL.DREAM_KING);
  const attacker = state.players[state.turnData?.attackerIdx];
  if (!fxr || fxr.isDead || fxr.hp <= 0 || !fxr.inDreamState || fxr.lgpyForm) return { ok: false };
  const canChoose = attacker?.id === playerId && !attacker.isDead && attacker.hp > 0 && attacker.id !== fxr.id;
  const fxrIsAttacker = attacker?.id === fxr.id;
  const isLivingOpponent = playerId !== fxr.id && state.players.some(player => (
    player.id === playerId && !player.isDead && player.hp > 0
  ));
  if ((!canChoose && !fxrIsAttacker) || (fxrIsAttacker && !isLivingOpponent)) return { ok: false };
  if (fxr.dreamTargetChoice !== null && fxr.dreamTargetChoice !== undefined) return { ok: false, error: 'already_chosen' };
  if (!Number.isInteger(fxr.realTargetIdx) || fxr.realTargetIdx < 0 || fxr.realTargetIdx > 2) return { ok: false };

  fxr.dreamTargetChoice = targetIndex;
  const isReal = targetIndex === fxr.realTargetIdx;
  return { ok: true, isReal };
}

export function selectTarget(state, playerId, targetId) {
  if (state.gameMode !== GAME_MODE.MODE_FFA || !canPlayBattleAction(state) || state.turnPhase !== TURN.CHOOSE_TARGET) return { ok: false };
  const pIdx = state.players.findIndex(p => p.id === playerId);
  if (pIdx === -1 || pIdx !== state.turnData.attackerIdx || state.players[pIdx].isDead || state.players[pIdx].hp <= 0) return { ok: false };

  const tIdx = state.players.findIndex(p => p.id === targetId);
  if (tIdx === -1 || tIdx === pIdx || state.players[tIdx].isDead || state.players[tIdx].hp <= 0) return { ok: false };

  state.turnData.defenderIdx = tIdx;
  state.turnPhase = TURN.WAITING_ATK;
  return { ok: true };
}

export function buyWater(state, playerId) {
  if (state.phase !== PHASE.BATTLE || state.turnPhase !== TURN.ATK_ROLLED) return { ok: false };
  const atk = state.players[state.turnData.attackerIdx];
  if (atk.id !== playerId) return { ok: false };
  if (atk.card.positiveSkill?.id !== SKILL.BUY_WATER) return { ok: false };
  if (state.turnData.hasAttackerRerolled) return { ok: false, error: 'already_rerolled' };
  if (atk.chargeStacks >= 2) return { ok: false, error: 'max_charges' };

  atk.chargeStacks = (atk.chargeStacks || 0) + 1;

  // Skip attack and advance turn
  const phaseEnd = resolvePhaseEnd(state);
  return { ok: true, chargeStacks: atk.chargeStacks, ...phaseEnd };
}
