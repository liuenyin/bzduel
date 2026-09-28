import { sealPlayerSkills, restorePlayerSkills } from './skills.js';
import { appendBattleLog } from './battle-log.js';
import { SKILL } from '../../../shared/characters.js';

export function advanceAttackerTimedStates(state, attacker) {
  if (!attacker) return;

  if (attacker.lgpyForm && attacker.lgpyActivatedAtRound !== state.totalRound) {
    attacker.lgpyTurnsLeft = Math.max(0, (attacker.lgpyTurnsLeft || 0) - 1);
    if (attacker.lgpyTurnsLeft === 0) {
      attacker.lgpyForm = false;
      attacker.lgpyActivatedAtRound = null;
    }
  }

  if (attacker.skillsSealed && attacker.skillsSealedAtRound !== state.totalRound) {
    attacker.skillsSealedTurnsLeft = Math.max(0, (attacker.skillsSealedTurnsLeft || 0) - 1);
    if (attacker.skillsSealedTurnsLeft === 0) restorePlayerSkills(attacker);
  }
}

export function clearResolvedTurnState(state) {
  state.players.forEach(player => {
    player.playedTurnCard = null;
    player.playedTurnCards = [];
    player.stealthActive = false;
    player.prevUnusedDiceSum = player.unusedDiceSum || 0;
  });
}

export function checkElephantCondemn(state, player, opponent) {
  if (player?.card?.negativeSkill?.id !== SKILL.ELEPHANT_CONDEMN || player.lgpyTriggered) return false;
  if (!opponent || opponent.hp <= 0 || opponent.hp >= opponent.maxHp * 0.2) return false;

  player.lgpyTriggered = true;
  opponent.lgpyForm = true;
  opponent.lgpyTurnsLeft = 1;
  opponent.lgpyActivatedAtRound = state.totalRound;
  player.inDreamState = false;
  player.pendingDreamState = false;
  player.dreamTargetChoice = null;
  sealPlayerSkills(opponent, state);
  sealPlayerSkills(player, state);
  appendBattleLog(state, {
    text: `【小象的谴责】${opponent.nickname} 被迫进入 gpy 斩杀形态！${player.nickname} 的技能同时被封印！`,
    type: 'skill',
    actorId: player.id,
    targetId: opponent.id,
  });
  return true;
}

