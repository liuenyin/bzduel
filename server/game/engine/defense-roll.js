import { reviveNineLives } from './skills.js';
import { getRollingPool } from './dice.js';

import { rollDiceGroup, invertDieValue } from './primitives.js';
import { TURN } from '../../../shared/turn.js';
import { GAME_MODE } from '../../../shared/rules.js';
import { SKILL } from '../../../shared/characters.js';

import { finishSelfKill, resolveImmediateDeaths } from './immediate-deaths.js';

export function rollDefense(state, atk, def) {
  // Auto-roll defense using pool
  if (state.gameMode === GAME_MODE.MODE_FFA && atk.card.positiveSkill?.id === SKILL.RAPPER) {
    state.turnData.isAoE = true;
    state.turnData.aoeDefenses = {};
    let defenseRollsRecord = {};
    let rollSelfDamage = 0;
    state.players.forEach(p => {
      if (!p.isDead && p.id !== atk.id) {
        const rolls = rollDiceGroup(getRollingPool(p, state));

        // 闫紫铭负面: Inelegant! AoE防守时
        if (p.card.negativeSkill?.id === SKILL.ROYAL_ETIQUETTE) {
          const ones = rolls.filter(r => r === 1).length;
          if (ones > 0) {
            p.hp = Math.max(0, p.hp - ones);
            rollSelfDamage += ones;
          }
        }

        state.turnData.aoeDefenses[p.id] = {
          rolls,
          confirmed: false,
          keepIndices: null,
          options: null,
          hasRerolled: false
        };
        defenseRollsRecord[p.id] = [...rolls];
      }
    });

    const deathResolution = resolveImmediateDeaths(state, { cause: 'dice_self_damage' });
    deathResolution.defeatedIds.forEach(playerId => {
      delete state.turnData.aoeDefenses[playerId];
      delete defenseRollsRecord[playerId];
    });

    if (deathResolution.gameOver) {
      return {
        ok: true,
        atkResult: state.turnData.atkResult,
        aoeDefenseRolls: defenseRollsRecord,
        selfKill: true,
        selfDamage: rollSelfDamage,
        attackerIdx: state.turnData.attackerIdx,
        ...deathResolution,
      };
    }

    state.turnPhase = TURN.DEF_ROLLED;
    return {
      ok: true,
      atkResult: state.turnData.atkResult,
      aoeDefenseRolls: defenseRollsRecord,
      selfDamage: rollSelfDamage,
      nineLivesTriggered: deathResolution.nineLivesTriggered,
      defeatedIds: deathResolution.defeatedIds,
    };
  } else {
    state.turnData.isAoE = false;
    const defRolls = rollDiceGroup(getRollingPool(def, state));

    // 闫紫铭负面: Inelegant! 1v1防守时
    if (def.card.negativeSkill?.id === SKILL.ROYAL_ETIQUETTE) {
      const ones = defRolls.filter(r => r === 1).length;
      if (ones > 0) {
        def.hp -= ones;
        if (def.hp <= 0) {
          if (!reviveNineLives(def)) {
            const resolution = finishSelfKill(state, def, state.turnData.attackerIdx, {
              cause: 'dice_self_damage',
              selfDamage: ones,
            });
            return { ok: true, atkResult: state.turnData.atkResult, defenseRolls: [...defRolls], ...resolution };
          }
        }
      }
    }

    // 廖展韬正面附加: 对方骰子无法投出最大值
    if (atk.card.positiveSkill?.id === SKILL.INVERT_DIE) {
      const effectivePool = getRollingPool(def, state);
      for (let i = 0; i < defRolls.length; i++) {
        if (defRolls[i] >= effectivePool[i]) defRolls[i] = Math.max(1, effectivePool[i] - 1);
      }
    }

    // 廖展韬正面: 字斟句酌 — 防御掷骰后反转最小骰子 (不叠加减伤)
    if (def.card.positiveSkill?.id === SKILL.INVERT_DIE) {
      let minVal = Infinity, minIdx = -1;
      for (let i = 0; i < defRolls.length; i++) {
        if (defRolls[i] < minVal) { minVal = defRolls[i]; minIdx = i; }
      }
      if (minIdx >= 0) {
        const effectivePool = getRollingPool(def, state);
        defRolls[minIdx] = invertDieValue(defRolls[minIdx], effectivePool[minIdx]);
      }
    }

    // 余汉正面: 防御时+1重投
    if (def.card.positiveSkill?.id === SKILL.MAMA_HEAL) {
      def.rerolls += 1;
    }

    state.turnData.defenseRolls = defRolls;
    state.turnPhase = TURN.DEF_ROLLED;
    return { ok: true, atkResult: state.turnData.atkResult, defenseRolls: [...defRolls] };
  }
}
