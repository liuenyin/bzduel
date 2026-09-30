import { prepareDefenseDice, sacrificeDefenseDie } from './defense-dice.js';
import { checkElephantCondemn } from './turn-state.js';
import { calcTacticalCardEffects } from './tactical-effects.js';
import { reviveNineLives, resolveDefenderNegativeSkill } from './skills.js';

import { appendBattleLog } from './battle-log.js';
import { getCourseMultiplier, findPlayer } from './primitives.js';
import { SKILL } from '../../../shared/characters.js';
import { getRandomCard } from '../../../shared/cards.js';
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
  const { keptRolls: pKeptRolls } = prepareDefenseDice(state, atk, p, defenseRolls, defenseKeepIndices);

  // 姜鹏泽正面: 防御骰子也乘以课程倍率
  const pAdjustedRolls = p.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? pKeptRolls.map(v => Math.floor(v * pMulti)) : pKeptRolls;
  const pBaseDef = pAdjustedRolls.reduce((s, v) => s + v, 0);

  const turnDataSimulated = { hasDefenderRerolled: ds.hasRerolled };
  const negativeSkillName = p.card.negativeSkill?.name ?? null;
  const defNeg = resolveDefenderNegativeSkill(p.card.negativeSkill, pMulti, state.totalRound, turnDataSimulated);
  if (defNeg.addPermanentPenalty) p.permanentDefPenalty = (p.permanentDefPenalty || 0) + defNeg.addPermanentPenalty;

  const tac = calcTacticalCardEffects(state, atk, p, selectedAttackFaces, pKeptRolls);
  let appliedDefBonus = tac.isNoFixedBonus ? 0 : tac.defBonus;

  const penalty = (defNeg.defensePenalty || 0) + (p.permanentDefPenalty || 0) - appliedDefBonus;
  const finalDef = Math.max(0, pBaseDef - penalty);

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

  let targetFinalBaseAtk = finalBaseAtk;
  if (!isPrimary) {
    if (atkMulti === 0.5) targetFinalBaseAtk = Math.floor(finalBaseAtk * 0.33);
    else if (atkMulti === 1) targetFinalBaseAtk = Math.floor(finalBaseAtk * 0.5);
    else if (atkMulti === 2) targetFinalBaseAtk = Math.floor(finalBaseAtk * 0.66);
  }

  const damageCalculation = calculateDamageSteps(targetFinalBaseAtk, pFinalFinalDef, ar.pierce, tac);
  let damage = damageCalculation.damage;

  // 殷泽轩负面: 受到伤害时，最终伤害额外 +2 × 倍率
  if (damage > 0 && p.card.neutralSkill?.id === SKILL.VULNERABLE) {
    damage += Math.floor(2 * pMulti);
  }

  // 黄佳程正面: 天赋怪 (减伤)
  let talentTriggered = false;
  if (damage > 0 && p.card.positiveSkill?.id === SKILL.TALENTED) {
    const ratioCaught = pMulti === 2 ? 0.5 : (pMulti === 1 ? 0.75 : 1);
    if (ratioCaught < 1) {
      damage = Math.floor(damage * ratioCaught);
      talentTriggered = true;
    }
  }

  // 周煊声负面: 被发现 (每层蓄势+3伤害)
  if (damage > 0 && p.card.negativeSkill?.id === SKILL.CAUGHT && p.chargeStacks > 0) {
    damage += p.chargeStacks * 3;
  }

  if (damage > 0 && tac.halveFirstDamage) {
    damage = Math.floor(damage * 0.5);
    const historyBlessing = (p.activeBlessings || []).find(card => card.id === 'card_his_1');
    if (historyBlessing) historyBlessing.usedInClass = true;
  }

  // 李灿正面A: 反击伤害
  let lcCounterTriggered = false;
  let lcCounterDamage = 0;
  if (p.card.positiveSkill?.id === SKILL.GAL_PLAYER && pFinalFinalDef > targetFinalBaseAtk && !ar.pierce) {
    lcCounterDamage = pFinalFinalDef - targetFinalBaseAtk;
    atk.hp = Math.max(0, atk.hp - lcCounterDamage);
    lcCounterTriggered = true;
  }

  // 团长大人！触发：防守时未重投 → 获得骰子
  let commanderTriggered = false;
  if (!ds.hasRerolled && p.card.positiveSkill?.id === SKILL.COMMANDER_RECRUIT && !ar.pierce) {
    const newFace = pMulti === 0.5 ? 4 : (pMulti === 1 ? 6 : 8);
    p.card.dicePool.push(newFace);
    commanderTriggered = true;
  }

  // 杂鱼自残判定 (HJC: 攻击力 < 防御力 → 自身血量减半)
  let noobTriggered = false;
  if (targetFinalBaseAtk < pFinalFinalDef && atk.card.negativeSkill?.id === 'hjc_neg') {
    atk.hp -= Math.floor(atk.hp / 2);
    noobTriggered = true;
  }

  // 红温引爆 (WYC负面: 攻击≤防御时引爆对方红温)
  let detonateTriggered = false;
  let detonateDamage = 0;
  if (targetFinalBaseAtk <= pFinalFinalDef && atk.card.negativeSkill?.id === SKILL.RED_HEAT_DETONATE) {
    const opHeat = p.redHeat || 0;
    if (opHeat > 0) {
      detonateDamage = opHeat;
      // 天赋怪减伤也适用于红温引爆
      if (p.card.positiveSkill?.id === SKILL.TALENTED) {
        const dRatio = pMulti === 2 ? 0.5 : (pMulti === 1 ? 0.75 : 1);
        if (dRatio < 1) detonateDamage = Math.floor(detonateDamage * dRatio);
      }
      damage += detonateDamage;
      p.redHeat = 0;
      detonateTriggered = true;
    }
  }

  // 余汉负面: 操碎了心 — 目标当前低于20%时，本次直接伤害固定为1。
  if (damage > 1 && atk.card.negativeSkill?.id === SKILL.MAMA_MERCY
    && p.hp > 0 && p.hp < p.maxHp * 0.2) {
    damage = 1;
  }

  p.hp = Math.max(0, p.hp - damage);

  // 通用-其他 (card_gen_14): 本轮如果防守无伤，获得 2 TP
  const pTurnCards = p.playedTurnCards || (p.playedTurnCard ? [p.playedTurnCard] : []);
  if (pTurnCards.some(c => c.id === 'card_gen_14') && damage === 0) {
    p.tp = Math.min(10, (p.tp || 0) + 2);
    appendBattleLog(state, { text: `【通用-其他】${p.nickname} 防守无伤，获得 2 TP！`, type: 'skill', actorId: p.id, targetId: atk.id });
  }

  // 通用-其他 (card_gen_15): 本轮如果攻击造成伤害，抽 1 张学科战术卡
  const atkTurnCardsAoE = atk.playedTurnCards || (atk.playedTurnCard ? [atk.playedTurnCard] : []);
  if (atkTurnCardsAoE.some(c => c.id === 'card_gen_15') && damage > 0 && !state.turnData.gen15Drawn) {
    state.turnData.gen15Drawn = true;
    if ((atk.handCards || []).length < 3) {
      atk.handCards.push(getRandomCard(subj, atk.card?.subjects || []));
      appendBattleLog(state, { text: `【通用-其他】${atk.nickname} 攻击造成伤害，抽 1 张战术卡！`, type: 'skill', actorId: atk.id, targetId: p.id });
    }
  }

  // 红温叠加 (WYC正面: 造成伤害时给对方叠红温)
  let redHeatApplied = 0;
  if (damage > 0 && atk.card.positiveSkill?.id === SKILL.RED_HEAT_APPLY) {
    redHeatApplied = 1 + Math.floor(2 * atkMulti);
    p.redHeat = (p.redHeat || 0) + redHeatApplied;
  }

  // 触发 SUGAR_CRASH 负面效果
  if (damage >= 8 && p.card.negativeSkill?.id === SKILL.SUGAR_CRASH) {
    if (!p.buffs) p.buffs = [];
    p.buffs.push({ id: SKILL.SUGAR_CRASH, expireRound: state.totalRound + 2 });
  }

  let pFirstBloodTriggered = false;
  if (damage > 0 && p.card.negativeSkill?.id === SKILL.FIRST_BLOOD && !p.hasTakenDamage) {
    p.hasTakenDamage = true;
    if (p.card.defSlots > 1) p.card.defSlots -= 1;
    pFirstBloodTriggered = true;
  }

  const pNineLivesTriggered = reviveNineLives(p);
  let pExtraTurnTriggered = false;
  if (damage >= 8 && p.card.positiveSkill?.id === SKILL.EXTRA_TURN && p.hp > 0) {
    pExtraTurnTriggered = true;
    if (p.card.negativeSkill?.id === SKILL.BACK_PAIN && p.card.defSlots > 1) p.card.defSlots -= 1;
  }

  checkElephantCondemn(state, atk, p);
  checkElephantCondemn(state, p, atk);

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
