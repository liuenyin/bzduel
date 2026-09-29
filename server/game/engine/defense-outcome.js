import { removePositiveSkill } from './skills.js';
import { appendBattleLog } from './battle-log.js';
import { PHASE, GAME_MODE, IDENTITY } from '../../../shared/rules.js';

export function settleDefenseDeaths(state, atk, def) {
  let gameOver = false, winner = null;
  if (atk.hp <= 0) {
    atk.hp = 0;
    if (!atk.isDead) {
      atk.isDead = true;
      // atk caused their own death
    }
  }
  if (def.hp <= 0) {
    def.hp = 0;
    if (!def.isDead) {
      def.isDead = true;
      // Lord kills Loyalist penalty
      if (state.gameMode === GAME_MODE.MODE_FFA && atk.identity === IDENTITY.LORD && def.identity === IDENTITY.LOYALIST) {
        removePositiveSkill(atk); // 主公误杀忠臣，失去正面技能
        appendBattleLog(state, { text: `【系统】主公 ${atk.nickname} 误杀忠臣，失去了正面技能！`, type: 'system', actorId: atk.id, targetId: def.id });
      }
    }
  }

  // 结算胜负
  if (state.gameMode === GAME_MODE.MODE_1V1) {
    if (atk.isDead || def.isDead) {
      gameOver = true;
      if (atk.isDead && def.isDead) winner = 'draw';
      else if (def.isDead) winner = state.turnData.attackerIdx;
      else winner = state.turnData.defenderIdx;
      state.phase = PHASE.GAME_OVER;
      state.winner = winner;
    }
  } else {
    // FFA 胜负
    const lord = state.players.find(p => p.identity === IDENTITY.LORD);
    if (lord && lord.isDead) {
      gameOver = true;
      state.phase = PHASE.GAME_OVER;
      const aliveSpies = state.players.filter(p => p.identity === IDENTITY.SPY && !p.isDead);
      const otherAlive = state.players.filter(p => p.identity !== IDENTITY.SPY && !p.isDead);
      if (aliveSpies.length === 1 && otherAlive.length === 0) {
        winner = 'spy';
      } else {
        winner = 'rebel';
      }
      state.winner = winner;
    } else {
      const aliveBadGuys = state.players.filter(p => (p.identity === IDENTITY.REBEL || p.identity === IDENTITY.SPY) && !p.isDead);
      if (aliveBadGuys.length === 0) {
        gameOver = true;
        state.phase = PHASE.GAME_OVER;
        winner = 'lord';
        state.winner = winner;
      }
    }
  }

  return { gameOver, winner };
}
