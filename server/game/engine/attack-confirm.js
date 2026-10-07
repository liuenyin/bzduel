import { rollDefense } from './defense-roll.js';
import { calcTacticalCardEffects, applyOpponentAttackRollDebuffs } from './tactical-effects.js';
import { resolvePositiveSkill, resolveNegativeSkill } from './skills.js';
import { getRollingPool, getAllowedSlotCount } from './dice.js';
import { appendBattleLog } from './battle-log.js';
import { canPlayBattleAction, getCourseMultiplier, areValidDiceIndices } from './primitives.js';
import { TURN } from '../../../shared/turn.js';

import { SKILL } from '../../../shared/characters.js';


export function confirmAttack(state, keepIndices) {
  if (!canPlayBattleAction(state) || state.turnPhase !== TURN.ATK_ROLLED) return { ok: false };
  const atk = state.players[state.turnData.attackerIdx];
  if (!atk?.card || atk.isDead || atk.hp <= 0) return { ok: false, error: 'player_defeated' };

  const def = state.players[state.turnData.defenderIdx];
  if (!def?.card || def.isDead || def.hp <= 0) return { ok: false, error: 'player_defeated' };
  const subj = state.schedule[state.currentClassIndex];
  const multi = getCourseMultiplier(atk, state);

  const allowedAtkSlots = getAllowedSlotCount(state, atk.id, 'attack');

  const atkRolls = state.turnData.attackRolls;
  const expectedSlots = atk.card.atkSlots === -1 ? null : allowedAtkSlots;
  if (!areValidDiceIndices(keepIndices, atkRolls?.length, expectedSlots)) {
    return { ok: false, error: 'invalid_slots' };
  }

  applyOpponentAttackRollDebuffs(state, atk);
  let keptRolls = keepIndices.map(i => atkRolls[i]);

  atk.lastMaxRoll = Math.max(...atkRolls);
  atk.unusedDiceSum = atkRolls.filter((_, i) => !keepIndices.includes(i)).reduce((a, b) => a + b, 0);

  // 语文-增益 (card_chi_2): 选中的点数最小骰子自动变为最大面值
  const atkTurnCards = atk.playedTurnCards || (atk.playedTurnCard ? [atk.playedTurnCard] : []);
  if (atkTurnCards.some(c => c.id === 'card_chi_2') && keptRolls.length > 0) {
    let minVal = Math.min(...keptRolls);
    let minIdx = keptRolls.indexOf(minVal);
    if (minIdx !== -1) {
      const origDieIdx = keepIndices[minIdx];
      const maxFace = getRollingPool(atk, state)[origDieIdx] || 6;
      keptRolls[minIdx] = maxFace;
    }
  }

  // 数学-祝福 (card_mat_1): 全质数时跳过目标的下一次普通攻击
  if (subj === 'math') {
    const mat1 = (atk.activeBlessings || []).find(c => c.id === 'card_mat_1');
    if (mat1 && !mat1.usedInClass) {
      const primes = [2, 3, 5, 7, 11];
      if (keptRolls.length > 0 && keptRolls.every(v => primes.includes(v))) {
        mat1.usedInClass = true;
        def.skipAttackCount = (def.skipAttackCount || 0) + 1;
        appendBattleLog(state, { text: `【数学-祝福】${atk.nickname} 选中的骰点全为质数，${def.nickname} 的下一次普通攻击将被跳过！`, type: 'skill', actorId: atk.id, targetId: def.id });
      }
    }
  }

  // 体育-祝福 (card_pe_1): 选中至少3个奇数得额外攻击回合
  if (subj === 'pe') {
    const pe1 = (atk.activeBlessings || []).find(c => c.id === 'card_pe_1');
    if (pe1 && !pe1.usedInClass) {
      const odds = keptRolls.filter(r => r % 2 !== 0).length;
      if (odds >= 3) {
        pe1.usedInClass = true;
        if (!state.extraTurnQueue) state.extraTurnQueue = [];
        state.extraTurnQueue.push({ attackerId: atk.id, targetId: def?.id });
        appendBattleLog(state, { text: `【体育-祝福】${atk.nickname} 选中3个奇数，触发额外攻击回合！`, type: 'skill', actorId: atk.id, targetId: def?.id });
      }
    }
  }

  // 姜鹏泽正面: 骰子点数 × 课程倍率
  if (atk.card.positiveSkill?.id === SKILL.LIBERAL_ARTS) {
    keptRolls = keptRolls.map(v => Math.floor(v * multi));
  }

  const baseAtk = keptRolls.reduce((s, v) => s + v, 0);

  const hasStu2 = atkTurnCards.some(c => c.id === 'card_stu_2');
  const pos = resolvePositiveSkill(atk.card.positiveSkill, multi, keptRolls, state.totalRound, state.turnData);
  const neg = hasStu2 ? { triggered: false } : resolveNegativeSkill(atk.card.negativeSkill, multi, keptRolls, state.totalRound);

  let finalBase = baseAtk;

  // 贪睡惩罚
  if (state.turnData.sleepyAtkPenalty > 0) {
    finalBase = Math.max(0, finalBase - state.turnData.sleepyAtkPenalty);
  }

  // 黄佳程过敏处理: 强制锁定攻击力
  if (state.turnData.allergyTriggered) {
    finalBase = Math.floor(4 * multi);
  }

  // 记号: 若选中骰子全为奇数，参与骰子永久面数+2，无上限
  if (pos.upgradeDice) {
    let pool = atk.card.dicePool;
    for (let i of keepIndices) {
      if (i < pool.length) {
        pool[i] += 2;
      }
    }
  }

  // 付修然正面: 攻击选中的骰点数和 >= 15 记一次梦境
  if (atk.card.positiveSkill?.id === SKILL.DREAM_KING) {
    const sumChosen = keptRolls.reduce((s, v) => s + v, 0);
    if (sumChosen >= 15) {
      atk.dreamStacks = Math.min(3, (atk.dreamStacks || 0) + 1);
      if (atk.dreamStacks >= 3 && !atk.inDreamState && !atk.pendingDreamState) {
        atk.pendingDreamState = true;
      }
    }
  }

  state.turnData.atkResult = {
    baseAtk: finalBase, bonusDamage: pos.bonusDamage || 0, pierce: pos.pierce || false,
    selfDamage: neg.selfDamage || 0, finalAtk: finalBase + (pos.bonusDamage || 0),
    posTriggered: pos.triggered, posName: pos.triggered ? atk.card.positiveSkill.name : null,
    negTriggered: neg.triggered || state.turnData.allergyTriggered,
    negName: state.turnData.allergyTriggered ? "过敏" : (neg.triggered ? atk.card.negativeSkill.name : null),
    keptIndices: keepIndices,
    faces: keptRolls,
  };

  // 战术卡攻击攻击力/加成计算
  let tac = { isNoFixedBonus: false };
  if (def) {
    tac = calcTacticalCardEffects(state, atk, def, keptRolls);
    if (!tac.isNoFixedBonus && tac.atkBonus !== 0) {
      state.turnData.atkResult.bonusDamage += tac.atkBonus;
      state.turnData.atkResult.finalAtk += tac.atkBonus;
    }
  }

  // 殷泽轩正面: 攻击力额外 +2 × 课程倍率
  if (atk.card.positiveSkill?.id === SKILL.STEALTH_STRIKE && !tac.isNoFixedBonus) {
    state.turnData.atkResult.bonusDamage += Math.floor(2 * multi);
    state.turnData.atkResult.finalAtk += Math.floor(2 * multi);
  }

  // 张楚唯: 额外回合 → 在 rollAttack 中处理 (+2重投, 面数临时+2)

  // 周煊声: 蓄势真正消耗（从 rollAttack 延迟到此处）
  if (state.turnData.pendingCharges > 0 && !tac.isNoFixedBonus) {
    const chargeConsumed = state.turnData.pendingCharges;
    atk.chargeStacks = 0;
    state.turnData.chargeConsumed = chargeConsumed;
    const chargeBonus = chargeConsumed * 8;
    state.turnData.atkResult.bonusDamage += chargeBonus;
    state.turnData.atkResult.finalAtk += chargeBonus;
    state.turnData.atkResult.posTriggered = true;
    state.turnData.atkResult.posName = '蓄势爆发';
  } else if (state.turnData.pendingCharges > 0) {
    // 政治祝福只允许纯骰点，蓄势的固定攻击加成不能在本回合结算。
    atk.chargeStacks = 0;
    state.turnData.chargeConsumed = 0;
  }

  return rollDefense(state, atk, def);
}
