import { prepareDefenseDice, recordDefenseRollHistory, sacrificeDefenseDie, validateDefenseSelection } from './defense-dice.js';
import { resolvePhaseEnd } from './phase.js';
import { advanceAttackerTimedStates } from './turn-state.js';
import { calcTacticalCardEffects } from './tactical-effects.js';
import { reviveNineLives, resolveDefenderNegativeSkill, hasNegativeImmunity } from './skills.js';

import { appendBattleLog } from './battle-log.js';
import { getCourseMultiplier } from './primitives.js';
import { SKILL } from '../../../shared/characters.js';
import { calculateDamageSteps, finalizeDamageExplanation } from './damage.js';
import { applyDefenseEffects } from './defense-effects.js';
import { settleDefenseDeaths } from './defense-outcome.js';

export function resolveSingleDefense(state, playerId, keepIndices, options, { atk, subj, atkMulti, ar, finalBaseAtk }) {
  // 正常 1v1 防御逻辑
  const defIdx = state.turnData.defenderIdx;
  const def = state.players[defIdx];
  if (!def?.card || def.isDead || def.hp <= 0 || def.id !== playerId) return { ok: false };

  const defRolls = state.turnData.defenseRolls;
  const validation = validateDefenseSelection(state, def, defRolls, keepIndices);
  if (!validation.ok) return validation;

  let defMulti = getCourseMultiplier(def, state);

  recordDefenseRollHistory(def, defRolls, keepIndices);

  const { keptRolls, defTurnCards, atkTurnCards } = prepareDefenseDice(state, atk, def, defRolls, keepIndices);

  // 姜鹏泽正面: 防御骰子也乘以课程倍率
  const adjustedDefRolls = def.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? keptRolls.map(v => Math.floor(v * defMulti)) : keptRolls;
  const baseDef = adjustedDefRolls.reduce((s, v) => s + v, 0);

  const negativeSkillName = def.card.negativeSkill?.name ?? null;
  const defNeg = hasNegativeImmunity(def, state, def.card.negativeSkill?.id === SKILL.REROLL_PENALTY) ? { triggered: false } : resolveDefenderNegativeSkill(def.card.negativeSkill, defMulti, state.totalRound, state.turnData);

  if (defNeg.addPermanentPenalty) {
    def.permanentDefPenalty = (def.permanentDefPenalty || 0) + defNeg.addPermanentPenalty;
  }

  const attackRolls = Array.isArray(state.turnData.attackRolls) ? state.turnData.attackRolls : [];
  const attackKeepIndices = Array.isArray(ar.keptIndices) ? ar.keptIndices : [];
  const selectedAttackFaces = attackKeepIndices.map(index => Number(attackRolls[index]) || 0);
  if (!Array.isArray(ar.faces) || ar.faces.length !== selectedAttackFaces.length) {
    ar.faces = [...selectedAttackFaces];
  }
  const tac = calcTacticalCardEffects(state, atk, def, selectedAttackFaces, keptRolls);

  let appliedDefBonus = tac.isNoFixedBonus ? 0 : tac.defBonus;

  const penalty = (defNeg.defensePenalty || 0) + (def.permanentDefPenalty || 0) - appliedDefBonus;
  const finalDef = Math.floor(Math.max(0, baseDef - penalty) * tac.defMultiplier);

  // 曾无畏正面: “吃掉!” 将对方选定的最大骰子改为 2
  let eatTriggered = false;
  if (def.card.positiveSkill?.id === SKILL.EAT_IT) {
    let maxVal = -1, maxIdx = -1;
    for (let index = 0; index < selectedAttackFaces.length; index++) {
      if (selectedAttackFaces[index] > maxVal) {
        maxVal = selectedAttackFaces[index];
        maxIdx = index;
      }
    }
    if (maxVal > 2) {
      finalBaseAtk = Math.max(0, finalBaseAtk - maxVal + 2);
      eatTriggered = true;
      if (maxIdx !== -1) ar.faces[maxIdx] = 2;
      ar.finalAtk = finalBaseAtk;
    }
  }

  // 闫紫铭正面: Timeless Grace 延后到攻击发动时结算
  if (atk.card.positiveSkill?.id === SKILL.TIMELESS_GRACE) {
    const freq = {};
    for (let face of ar.faces) {
      freq[face] = (freq[face] || 0) + 1;
    }
    const maxFreq = Math.max(...Object.values(freq));
    if (maxFreq >= 3) {
      atk.rerolls += 1;
    }
    if (maxFreq >= 4) {
      ar.pierce = true;
    }
    if (maxFreq >= 5) {
      if (!state.extraTurnQueue) state.extraTurnQueue = [];
      state.extraTurnQueue.push({ attackerId: atk.id, targetId: def.id });
    }
  }

  const { lcHealTriggered, healAmount } = sacrificeDefenseDie(def, defRolls, keepIndices, keptRolls, options);

  // 重新计算最终防御
  const finalKeptRolls = keptRolls;
  const finalAdjusted = def.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? finalKeptRolls.map(v => Math.floor(v * defMulti)) : finalKeptRolls;
  const finalBaseDef = finalAdjusted.reduce((s, v) => s + v, 0);
  let finalFinalDef = Math.floor(Math.max(0, finalBaseDef - penalty) * tac.defMultiplier);

  // 周煊声: 蓄势爆发时对方防御力× 1/(1+层数)
  if (state.turnData.chargeConsumed > 0) {
    finalFinalDef = Math.floor(finalFinalDef / (1 + state.turnData.chargeConsumed));
  }

  let isPierce = ar.pierce || atkTurnCards.some(c => c.id === 'card_it_3');
  const damageCalculation = calculateDamageSteps(finalBaseAtk, finalFinalDef, isPierce, tac, true);
  let damage = damageCalculation.damage;

  const effects = applyDefenseEffects(state, {
    atk, def, ar, subj, atkMulti, defMulti, keptRolls, finalFinalDef,
    finalBaseAtk, isPierce, tac, defTurnCards, atkTurnCards, damage,
  });
  damage = effects.damage;
  const { talentTriggered, lcCounterTriggered, lcCounterDamage, noobTriggered,
    commanderTriggered, firstBloodTriggeredThisTurn, redHeatApplied, detonateTriggered, detonateDamage } = effects;

  // 张锦元正面: 九条命 — 首次HP归零时复活
  const defenderNineLivesTriggered = reviveNineLives(def);
  const attackerNineLivesTriggered = reviveNineLives(atk);
  const nineLivesTriggered = defenderNineLivesTriggered || attackerNineLivesTriggered;

  // Check game over & handle deaths
  let gameOver = false, winner = null, classChanged = false, nextSubject = null;
  let dayChanged = false, currentDay = state.currentDay || 1;
  const prevAttackerIdx = state.turnData.attackerIdx;

  ({ gameOver, winner } = settleDefenseDeaths(state, atk, def));

  // 张楚唯正面: 逆袭 — 受到 >=8 伤害时获得额外攻击回合
  let extraTurnTriggered = false;
  if (damage >= 8 && def.card.positiveSkill?.id === SKILL.EXTRA_TURN && !gameOver && def.hp > 0) {
    extraTurnTriggered = true;
    if (!state.extraTurnQueue) state.extraTurnQueue = [];
    state.extraTurnQueue.push({ attackerId: def.id, targetId: atk.id });
    // 张楚唯负面: 腰疼？ — 每次逆袭后防御选骰 -1
    if (def.card.negativeSkill?.id === SKILL.BACK_PAIN && def.card.defSlots > 1) {
      def.card.defSlots -= 1;
    }
  }

  appendBattleLog(state, {
    type: 'turn',
    actorId: atk.id,
    targetId: def.id,
    text: damage > 0
      ? `${atk.nickname} 对 ${def.nickname} 造成 ${damage} 点伤害`
      : `${def.nickname} 完成防守，未受到伤害`,
    details: {
      actorName: atk.nickname,
      targetName: def.nickname,
      damage,
      selfDamage: ar.selfDamage || 0,
      pierce: !!isPierce,
      counterDamage: lcCounterDamage || 0,
      healAmount: healAmount || 0,
      damageBreakdown: finalizeDamageExplanation(damageCalculation, damage, atk, def),
    },
  });
  advanceAttackerTimedStates(state, atk);

  const chargeConsumed = state.turnData?.chargeConsumed || 0;
  const resPhase = resolvePhaseEnd(state);
  gameOver = resPhase.gameOver;
  winner = resPhase.winner;
  classChanged = resPhase.classChanged;
  nextSubject = resPhase.nextSubject;
  dayChanged = resPhase.dayChanged;
  currentDay = resPhase.currentDay;

  return {
    ok: true, baseDef, finalDef, penalty, keptIndices: keepIndices,
    atkResult: ar,
    defNegTriggered: defNeg.triggered,
    defNegName: defNeg.triggered ? negativeSkillName : null,
    defPosTriggered: commanderTriggered || talentTriggered || eatTriggered || lcHealTriggered || lcCounterTriggered || extraTurnTriggered,
    defPosName: talentTriggered ? "天赋怪" : (commanderTriggered ? "团长大人!" : (eatTriggered ? "吃掉!" : (lcHealTriggered ? "献祭" : (lcCounterTriggered ? "反击" : (extraTurnTriggered ? "死磕" : null))))),
    noobTriggered, detonateTriggered, detonateDamage, redHeatApplied,
    damage, selfDamage: ar.selfDamage, pierce: ar.pierce,
    lcCounterDamage, healAmount, lcHealTriggered, eatTriggered,
    extraTurnTriggered,
    firstBloodTriggered: firstBloodTriggeredThisTurn,
    nineLivesTriggered,
    chargeConsumed,
    gameOver, winner, classChanged, nextSubject, dayChanged, currentDay,
    attackerIdx: prevAttackerIdx,
  };
}
