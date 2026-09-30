import { settleWinner } from './outcome.js';
import { resolvePhaseEnd } from './phase.js';
import { removePositiveSkill, reviveNineLives } from './skills.js';
import { appendBattleLog } from './battle-log.js';
import { PHASE, GAME_MODE, IDENTITY } from '../../../shared/rules.js';

export function finishSelfKill(state, player, winner, { cause = 'self_damage', selfDamage = 0 } = {}) {
  const attackerIdx = state.turnData?.attackerIdx ?? null;
  player.hp = 0;
  player.isDead = true;

  if (state.gameMode === GAME_MODE.MODE_FFA) {
    const phaseResolution = resolvePhaseEnd(state);
    if (phaseResolution.gameOver) state.endReason = cause;
    return {
      selfKill: true,
      ...phaseResolution,
      selfDamage,
      deathCause: cause,
      attackerIdx,
    };
  }

  state.phase = PHASE.GAME_OVER;
  state.winner = winner;
  state.endReason = cause;
  return {
    selfKill: true,
    gameOver: true,
    winner,
    selfDamage,
    deathCause: cause,
    attackerIdx,
  };
}

export function resolveImmediateDeaths(state, {
  actor = null,
  cause = 'self_damage',
  penalizeLoyalistKill = false,
  allowRevive = true,
} = {}) {
  let nineLivesTriggered = false;
  const defeatedPlayers = [];

  state.players.forEach(player => {
    if (player.hp > 0 || player.isDead) return;
    if (allowRevive && reviveNineLives(player)) {
      nineLivesTriggered = true;
      return;
    }
    player.hp = 0;
    player.isDead = true;
    defeatedPlayers.push(player);
  });

  // A player eliminated while AoE defense is being prepared must not leave a
  // stale defense entry that can still be resolved later in the same attack.
  if (state.turnData?.isAoE && defeatedPlayers.length > 0) {
    for (const player of defeatedPlayers) {
      delete state.turnData.aoeDefenses?.[player.id];
    }
  }

  if (defeatedPlayers.length === 0) {
    return {
      gameOver: false,
      winner: null,
      nineLivesTriggered,
      defeatedIds: [],
      deathCause: null,
    };
  }

  if (penalizeLoyalistKill && state.gameMode === GAME_MODE.MODE_FFA && actor?.identity === IDENTITY.LORD) {
    defeatedPlayers.filter(player => player.identity === IDENTITY.LOYALIST).forEach(player => {
      removePositiveSkill(actor);
      appendBattleLog(state, {
        text: `【系统】主公 ${actor.nickname} 误杀忠臣，失去了正面技能！`,
        type: 'system',
        actorId: actor.id,
        targetId: player.id,
      });
    });
  }

  const { gameOver, winner } = settleWinner(state);

  if (gameOver) {
    state.phase = PHASE.GAME_OVER;
    state.winner = winner;
    state.endReason = cause;
  }

  return {
    gameOver,
    winner,
    nineLivesTriggered,
    defeatedIds: defeatedPlayers.map(player => player.id),
    deathCause: gameOver ? cause : null,
  };
}

export function resolveImmediateCardDeaths(state, actor, card) {
  const deathResolution = resolveImmediateDeaths(state, {
    actor,
    cause: 'tactical_card',
    penalizeLoyalistKill: true,
  });
  if (deathResolution.gameOver || deathResolution.defeatedIds.length === 0
    || state.gameMode !== GAME_MODE.MODE_FFA) {
    return { ...deathResolution, cardId: card?.id || null };
  }

  // A tactical card can eliminate the current attacker/defender before dice
  // resolution. In FFA that must consume the current subround and select the
  // next living attacker, otherwise the match remains stuck on a dead player.
  const phaseResolution = resolvePhaseEnd(state);
  return {
    ...deathResolution,
    ...phaseResolution,
    cardId: card?.id || null,
    deathCause: 'tactical_card',
  };
}
