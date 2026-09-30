import { settleWinner } from './outcome.js';
import { removePositiveSkill } from './skills.js';
import { appendBattleLog } from './battle-log.js';
import { GAME_MODE, IDENTITY } from '../../../shared/rules.js';

export function settleDefenseDeaths(state, atk, def) {
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

  return settleWinner(state);
}
