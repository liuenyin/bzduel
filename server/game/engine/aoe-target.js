import { prepareDefenseDice, sacrificeDefenseDie } from './defense-dice.js';
import { applyDefenseEffects } from './defense-effects.js';
import { calcTacticalCardEffects } from './tactical-effects.js';
import { reviveNineLives, resolveDefenderNegativeSkill, hasNegativeImmunity } from './skills.js';

import { getCourseMultiplier, findPlayer } from './primitives.js';
import { SKILL } from '../../../shared/characters.js';
import { calculateDamageSteps, finalizeDamageExplanation } from './damage.js';

export function resolveAoeTarget(state, pid, { atk, ar, atkMulti, selectedAttackFaces, finalBaseAtk, eatTriggeredBy }) {
  const subj = state.schedule[state.currentClassIndex];
  const p = findPlayer(state, pid);
  const ds = state.turnData.aoeDefenses[pid];
  if (!p || p.isDead || p.hp <= 0 || !ds.confirmed) return;
  const defenseRolls = Array.isArray(ds.rolls) ? ds.rolls : [];
  const defenseKeepIndices = Array.isArray(ds.keepIndices) ? ds.keepIndices : [];
  let pMulti = getCourseMultiplier(p, state);
  const primaryDefender = Number.isInteger(state.turnData.defenderIdx)
    ? state.players[state.turnData.defenderIdx]
    : null;
  const isPrimary = primaryDefender?.id === pid;
  const { keptRolls: pKeptRolls, defTurnCards, atkTurnCards } = prepareDefenseDice(state, atk, p, defenseRolls, defenseKeepIndices);

  // 姜鹏泽正面: 防御骰子也乘以课程倍率
  const pAdjustedRolls = p.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? pKeptRolls.map(v => Math.floor(v * pMulti)) : pKeptRolls;
  const pBaseDef = pAdjustedRolls.reduce((s, v) => s + v, 0);

  const turnDataSimulated = { hasDefenderRerolled: ds.hasRerolled };
  const negativeSkillName = p.card.negativeSkill?.name ?? null;
  const defNeg = hasNegativeImmunity(p, state, p.card.negativeSkill?.id === SKILL.REROLL_PENALTY) ? { triggered: false } : resolveDefenderNegativeSkill(p.card.negativeSkill, pMulti, state.totalRound, turnDataSimulated);
  if (defNeg.addPermanentPenalty) p.permanentDefPenalty = (p.permanentDefPenalty || 0) + defNeg.addPermanentPenalty;

  const tac = calcTacticalCardEffects(state, atk, p, selectedAttackFaces, pKeptRolls);
  let appliedDefBonus = tac.isNoFixedBonus ? 0 : tac.defBonus;

  const penalty = (defNeg.defensePenalty || 0) + (p.permanentDefPenalty || 0) - appliedDefBonus;

  const { lcHealTriggered, healAmount } = sacrificeDefenseDie(p, defenseRolls, defenseKeepIndices, pKeptRolls, ds.options);

  const pFinalKeptRolls = pKeptRolls;
  const pFinalAdjusted = p.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? pFinalKeptRolls.map(v => Math.floor(v * pMulti)) : pFinalKeptRolls;
  const pFinalBaseDef = pFinalAdjusted.reduce((s, v) => s + v, 0);
  let pFinalFinalDef = Math.max(0, pFinalBaseDef - penalty);
  pFinalFinalDef = Math.floor(pFinalFinalDef * tac.defMultiplier);

  // 周煊声: 蓄势爆发时对方防御力× 1/(1+层数)
  if (state.turnData.chargeConsumed > 0) {
    pFinalFinalDef = Math.floor(pFinalFinalDef / (1 + state.turnData.chargeConsumed));
  }

  let targetDamageMultiplier = 1;
  if (!isPrimary) {
    if (atkMulti === 0.5) targetDamageMultiplier = 0.33;
    else if (atkMulti === 1) targetDamageMultiplier = 0.5;
    else if (atkMulti === 2) targetDamageMultiplier = 0.66;
  }

  const isPierce = ar.pierce || atkTurnCards.some(c => c.id === 'card_it_3');
  const targetTac = targetDamageMultiplier === 1
    ? tac
    : { ...tac, damageMultiplier: tac.damageMultiplier * targetDamageMultiplier };
  const damageCalculation = calculateDamageSteps(finalBaseAtk, pFinalFinalDef, isPierce, targetTac, true);
  const effects = applyDefenseEffects(state, {
    atk, def: p, ar, subj, atkMulti, defMulti: pMulti, keptRolls: pKeptRolls,
    finalFinalDef: pFinalFinalDef, finalBaseAtk,
    isPierce, tac: targetTac, defTurnCards, atkTurnCards, damage: damageCalculation.damage,
    hasDefenderRerolled: ds.hasRerolled, selfDamage: 0,
  });
  const { damage, talentTriggered, lcCounterTriggered, lcCounterDamage,
    commanderTriggered, noobTriggered, detonateTriggered, detonateDamage, redHeatApplied,
    firstBloodTriggeredThisTurn: pFirstBloodTriggered } = effects;

  const pNineLivesTriggered = reviveNineLives(p);
  let pExtraTurnTriggered = false;
  if (damage >= 8 && p.card.positiveSkill?.id === SKILL.EXTRA_TURN && p.hp > 0) {
    pExtraTurnTriggered = true;
    if (p.card.negativeSkill?.id === SKILL.BACK_PAIN && p.card.defSlots > 1) p.card.defSlots -= 1;
  }


  let pEatTriggered = eatTriggeredBy === pid;

  return {
    playerId: pid,
    damageBreakdown: finalizeDamageExplanation(damageCalculation, damage, atk, p),
    damage, finalDef: pFinalFinalDef, penalty, baseDef: pBaseDef,
    defNegTriggered: defNeg.triggered,
    defNegName: defNeg.triggered ? negativeSkillName : null,
    defPosTriggered: lcHealTriggered || pExtraTurnTriggered || pEatTriggered || talentTriggered || lcCounterTriggered || commanderTriggered,
    defPosName: talentTriggered ? "天赋怪" : (commanderTriggered ? "团长大人!" : (pEatTriggered ? "吃掉!" : (lcHealTriggered ? "献祭" : (lcCounterTriggered ? "反击" : (pExtraTurnTriggered ? "死磕" : null))))),
    lcHealTriggered, healAmount,
    eatTriggered: pEatTriggered,
    extraTurnTriggered: pExtraTurnTriggered,
    lcCounterDamage, lcCounterTriggered,
    noobTriggered,
    detonateTriggered, detonateDamage,
    redHeatApplied,
    firstBloodTriggered: pFirstBloodTriggered,
    nineLivesTriggered: pNineLivesTriggered
  };
}
