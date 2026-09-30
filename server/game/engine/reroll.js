import { reviveNineLives } from './skills.js';
import { getRollingPool } from './dice.js';
import { rollDie, invertDieValue, canPlayBattleAction, areValidDiceIndices, findPlayer } from './primitives.js';
import { TURN } from '../../../shared/turn.js';
import { SKILL } from '../../../shared/characters.js';
import { finishSelfKill } from './immediate-deaths.js';

export function rerollDice(state, playerId, indices) {
  if (!canPlayBattleAction(state)) return { ok: false, error: '非战斗阶段' };
  const p = findPlayer(state, playerId);
  if (!p?.card || p.isDead || p.hp <= 0 || p.rerolls <= 0) return { ok: false };
  const opp = state.players.find(x => x.id !== playerId && !x.isDead);
  const oppTurnCards = opp ? (opp.playedTurnCards || (opp.playedTurnCard ? [opp.playedTurnCard] : [])) : [];
  if (oppTurnCards.some(c => c.id === 'card_gen_09')) return { ok: false, error: '对方使用了【重投锁死】，无法重投！' };
  if (oppTurnCards.some(c => c.id === 'card_mat_3')) return { ok: false, error: '对方使用了【数学-减益】，无法重投！' };

  // 检查是否被禁锢重投 (需校验 buff 是否过期)
  if (p.buffs) {
    p.buffs = p.buffs.filter(b => b.expireRound > state.totalRound);
    if (p.buffs.find(b => b.id === SKILL.SUGAR_CRASH)) return { ok: false, error: 'sugar_crash_locked' };
  }

  let rolls;
  if (state.turnPhase === TURN.ATK_ROLLED) {
    if (state.players[state.turnData.attackerIdx].id !== playerId) return { ok: false };
    rolls = state.turnData.attackRolls;
  } else if (state.turnPhase === TURN.DEF_ROLLED) {
    if (state.turnData.isAoE) {
      if (!state.turnData.aoeDefenses[playerId] || state.turnData.aoeDefenses[playerId].confirmed) return { ok: false };
      rolls = state.turnData.aoeDefenses[playerId].rolls;
    } else {
      if (state.players[state.turnData.defenderIdx].id !== playerId) return { ok: false };
      rolls = state.turnData.defenseRolls;
    }
  } else {
    return { ok: false };
  }

  if (!areValidDiceIndices(indices, rolls.length)) return { ok: false, error: 'invalid_indices' };

  const faces = getRollingPool(p, state);

  // 王鹤迪 rerollAll: 重投时所有骰子均重投
  const rolledIndices = p.card.rerollAll
    ? rolls.map((_, index) => index)
    : indices;
  if (p.card.rerollAll) {
    for (let i = 0; i < rolls.length; i++) {
      let face = faces[i];
      if (state.turnData.isExtraTurn && p.card.positiveSkill?.id === SKILL.EXTRA_TURN && state.turnData.extraTurnFaceBoost) {
        face += state.turnData.extraTurnFaceBoost;
      }
      rolls[i] = rollDie(face);
    }
  } else {
    for (const i of indices) {
      let face = faces[i];
      if (state.turnData.isExtraTurn && p.card.positiveSkill?.id === SKILL.EXTRA_TURN && state.turnData.extraTurnFaceBoost) {
        face += state.turnData.extraTurnFaceBoost;
      }
      rolls[i] = rollDie(face);
    }
  }

  // 廖展韬: 重投后重新反转最小骰子
  if (p.card.positiveSkill?.id === SKILL.INVERT_DIE) {
    let minVal = Infinity, minIdx = -1;
    for (let i = 0; i < rolls.length; i++) {
      if (rolls[i] < minVal) { minVal = rolls[i]; minIdx = i; }
    }
    if (minIdx >= 0) {
      let face = faces[minIdx];
      if (state.turnData.isExtraTurn && p.card.positiveSkill?.id === SKILL.EXTRA_TURN && state.turnData.extraTurnFaceBoost) {
        face += state.turnData.extraTurnFaceBoost;
      }
      rolls[minIdx] = invertDieValue(rolls[minIdx], face);
      // 深度思考: 仅攻击阶段反转给对方+1永久减伤
      if (p.card.negativeSkill?.id === SKILL.DEEP_THOUGHT && state.turnPhase === TURN.ATK_ROLLED) {
        const defIdx = state.turnData.defenderIdx;
        if (defIdx != null) {
          state.players[defIdx].invertReduction = (state.players[defIdx].invertReduction || 0) + 1;
        }
      }
    }
  }

  // 廖展韬正面附加: 对方骰子无法投出最大值
  {
    let opp = null;
    if (state.turnPhase === TURN.ATK_ROLLED) {
      opp = state.players[state.turnData.defenderIdx];
    } else if (state.turnPhase === TURN.DEF_ROLLED && !state.turnData.isAoE) {
      opp = state.players[state.turnData.attackerIdx];
    }
    if (opp?.card.positiveSkill?.id === SKILL.INVERT_DIE) {
      for (let i = 0; i < rolls.length; i++) {
        let face = faces[i];
        if (state.turnData.isExtraTurn && p.card.positiveSkill?.id === SKILL.EXTRA_TURN && state.turnData.extraTurnFaceBoost) {
          face += state.turnData.extraTurnFaceBoost;
        }
        if (rolls[i] >= face) rolls[i] = face - 1;
      }
    }
  }

  // 闫紫铭负面: Inelegant! 重投出1自伤 (英语-祝福 card_eng_1 / 自习-增益 card_stu_2 可免疫)
  const curSubjReroll = state.schedule[state.currentClassIndex];
  const hasEng1 = curSubjReroll === 'english' && (p.activeBlessings || []).some(c => c.id === 'card_eng_1');
  const hasStu2 = (p.playedTurnCards || (p.playedTurnCard ? [p.playedTurnCard] : [])).some(c => c.id === 'card_stu_2');
  if (p.card.negativeSkill?.id === SKILL.ROYAL_ETIQUETTE && !hasEng1 && !hasStu2) {
    const newlyRolledOnes = rolledIndices.map(idx => rolls[idx]).filter(r => r === 1).length;
    if (newlyRolledOnes > 0) {
      p.hp -= newlyRolledOnes;
      if (p.hp <= 0) {
        if (!reviveNineLives(p)) {
          const winner = state.turnPhase === TURN.ATK_ROLLED ? state.turnData.defenderIdx : state.turnData.attackerIdx;
          const resolution = finishSelfKill(state, p, winner, {
            cause: 'dice_self_damage',
            selfDamage: newlyRolledOnes,
          });
          return { ok: true, rolls: [...rolls], remaining: p.rerolls, ...resolution };
        }
      }
    }
  }

  p.rerolls--;
  if (state.turnPhase === TURN.ATK_ROLLED) {
    state.turnData.hasAttackerRerolled = true;
  } else if (state.turnPhase === TURN.DEF_ROLLED) {
    if (state.turnData.isAoE) {
      state.turnData.aoeDefenses[playerId].hasRerolled = true;
    } else {
      state.turnData.hasDefenderRerolled = true;
    }
  }
  return { ok: true, rolls: [...rolls], remaining: p.rerolls };
}
