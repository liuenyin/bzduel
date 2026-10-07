import { rollDie, rollDiceGroup, findPlayer, getCourseMultiplier } from './primitives.js';
import { getRollingPool } from './dice.js';
import { TURN } from '../../../shared/turn.js';
import { SKILL } from '../../../shared/characters.js';
import { getRandomCard } from '../../../shared/cards.js';

export function calcTacticalCardEffects(state, atk, def, keptRolls, defKeptRolls = keptRolls) {
  let atkBonus = 0;
  let defBonus = 0;
  let flatPierce = 0;
  let trueDamage = 0;
  let ignoreReduction = false;
  let finalBonusDamage = 0;
  let finalDamageReduction = 0;
  let defMultiplier = 1;
  let isNoFixedBonus = false;
  let maxDmgCap = Infinity;
  let damageMultiplier = 1.0;
  let halveFirstDamage = false;
  const curSubj = state.schedule[state.currentClassIndex];

  if (!atk || !def) return { atkBonus, defBonus, trueDamage, ignoreReduction, flatPierce, finalBonusDamage, finalDamageReduction, defMultiplier, isNoFixedBonus, maxDmgCap, damageMultiplier, halveFirstDamage };

  // 1. 检查攻击者的祝福与单轮卡 (Attacker's cards)
  const atkPlayedTurn = atk.playedTurnCards || (atk.playedTurnCard ? [atk.playedTurnCard] : []);
  const atkCards = [...(atk.activeBlessings || []), ...atkPlayedTurn];
  atkCards.forEach(c => {
    switch (c.id) {
      case 'card_chi_1': if (curSubj === 'chinese') atkBonus += 2; break;
      case 'card_mat_2': atkBonus += 3; break;
      case 'card_pe_2': atkBonus += 4; break;
      
      // 通用增益卡 (Buffs played by attacker)
      case 'card_gen_02': atkBonus += 2; break; // 本回合基础攻击/防御总和+2
      case 'card_gen_04': flatPierce += 2; break; // 附加 2 点穿透伤害
      case 'card_gen_08': finalBonusDamage += 2; break; // 最终结算额外伤害，不参与倍率

      case 'card_phy_1':
        if (curSubj === 'physics' && keptRolls) {
          const evens = keptRolls.filter(r => r % 2 === 0).length;
          atkBonus += evens * 2;
        }
        break;
      case 'card_phy_2': trueDamage += 3; break;
      case 'card_phy_3': defMultiplier *= 0.7; break;
      case 'card_mat_3': ignoreReduction = true; break;
      case 'card_pol_1': if (curSubj === 'politics') isNoFixedBonus = true; break;
      case 'card_his_2': atkBonus += (atk.prevUnusedDiceSum || 0); break;
      case 'card_art_2': atkBonus += (def.prevMaxRoll || 0); break;
      case 'card_it_3': finalBonusDamage -= 5; break;
      case 'card_mus_1':
        if (curSubj === 'music' && keptRolls && keptRolls.length >= 2) {
          const maxR = Math.max(...keptRolls), minR = Math.min(...keptRolls);
          if (maxR - minR <= 2) damageMultiplier *= 1.3;
        }
        break;
      case 'card_mus_2':
        if (keptRolls && new Set(keptRolls).size < keptRolls.length) atkBonus += 4;
        break;
      case 'card_geo_1':
        break; // 主场倍率提升由 getCourseMultiplier 统一处理
      case 'card_geo_2':
        break; // 骰面加成由 getRollingPool 处理
    }
  });

  // 观星说明的是最终伤害倍率；攻击减防、固定伤害和角色修正仍按原顺序结算。
  if (atk.card.positiveSkill?.id === SKILL.STAR_SHOWOFF && Array.isArray(keptRolls) && keptRolls.length > 0) {
    const max = Math.max(...keptRolls);
    const min = Math.min(...keptRolls);
    if (max - min <= 2) damageMultiplier *= 0.5 + getCourseMultiplier(atk, state);
  }

  // 2. 检查防御者的祝福与单轮卡 (Defender's cards)
  const defPlayedTurn = def.playedTurnCards || (def.playedTurnCard ? [def.playedTurnCard] : []);
  const defCards = [...(def.activeBlessings || []), ...defPlayedTurn];
  defCards.forEach(c => {
    switch (c.id) {
      case 'card_chi_1':
        if (curSubj === 'chinese') {
          defBonus += 2;
          if (Array.isArray(defKeptRolls)) {
            defBonus += defKeptRolls.filter(value => value % 2 !== 0).length;
          }
        }
        break;
      case 'card_mat_2':
        defBonus += 3;
        break;
      case 'card_pol_1': if (curSubj === 'politics') isNoFixedBonus = true; break;
      case 'card_pol_3': maxDmgCap = Math.min(maxDmgCap, 8); break;
      case 'card_pol_2': defBonus += 3; break;
      
      // 通用增益卡 (Buffs played by defender)
      case 'card_gen_02': defBonus += 2; break; // 本回合基础攻击/防御总和+2
      case 'card_gen_05': finalDamageReduction += 3; break;

      case 'card_tec_1': if (curSubj === 'tech') defBonus += 2; break;
      case 'card_bio_1': if (curSubj === 'biology') finalDamageReduction += 3; break;
      case 'card_his_1': if (curSubj === 'history' && !c.usedInClass) halveFirstDamage = true; break;
      case 'card_phy_1':
        if (curSubj === 'physics' && defKeptRolls) {
          defBonus += defKeptRolls.filter(value => value % 2 === 0).length * 2;
        }
        break;
    }
  });

  return { atkBonus, defBonus, trueDamage, ignoreReduction, flatPierce, finalBonusDamage, finalDamageReduction, defMultiplier, isNoFixedBonus, maxDmgCap, damageMultiplier, halveFirstDamage };
}

export function applyOpponentAttackRollDebuffs(state, attacker) {
  const rolls = state.turnData?.attackRolls;
  if (!Array.isArray(rolls) || rolls.length === 0) return;

  for (const opponent of state.players) {
    if (opponent === attacker || opponent.isDead) continue;
    const cards = opponent.playedTurnCards || (opponent.playedTurnCard ? [opponent.playedTurnCard] : []);
    for (const card of cards) {
      if (card.id !== 'card_chi_3' && card.id !== 'card_gen_06') continue;
      const maxValue = Math.max(...rolls);
      const maxIndex = rolls.indexOf(maxValue);
      if (maxIndex < 0) continue;
      rolls[maxIndex] = card.id === 'card_chi_3'
        ? 2
        : Math.max(1, rolls[maxIndex] - 2);
    }
  }
}

export function getTacticalOpponent(state, p) {
  const playerIndex = state.players.indexOf(p);
  const attackerIdx = state.turnData?.attackerIdx;
  if (state.turnData?.isAoE && state.turnData.aoeDefenses?.[p.id]
    && playerIndex !== attackerIdx) {
    const attacker = state.players[attackerIdx];
    if (attacker && !attacker.isDead && attacker.hp > 0) return attacker;
  }

  const preferredIdx = state.turnData?.attackerIdx === playerIndex
    ? state.turnData.defenderIdx
    : state.turnData?.defenderIdx === playerIndex
      ? state.turnData.attackerIdx
      : null;
  const oppIdx = Number.isInteger(preferredIdx) && state.players[preferredIdx]?.id !== p.id && !state.players[preferredIdx]?.isDead
    ? preferredIdx
    : state.players.findIndex(x => x.id !== p.id && !x.isDead);
  return oppIdx === -1 ? null : state.players[oppIdx];
}

export function getDefenseRollsForPlayer(state, player) {
  if (!player || !state.turnData) return null;
  if (state.turnData.isAoE) return state.turnData.aoeDefenses?.[player.id]?.rolls || null;
  return state.turnData.defenseRolls || null;
}

export function rerollCurrentDice(state, player, rolls, faces) {
  if (!player || !Array.isArray(rolls)) return;
  const nextRolls = rollDiceGroup(faces);
  rolls.splice(0, rolls.length, ...nextRolls);
  const hasImmunity = (player.activeBlessings || []).some(card => card.id === 'card_eng_1')
    || (player.playedTurnCards || []).some(card => card.id === 'card_stu_2');
  if (player.card?.negativeSkill?.id === SKILL.ROYAL_ETIQUETTE && !hasImmunity) {
    const ones = nextRolls.filter(value => value === 1).length;
    player.hp = Math.max(0, player.hp - ones);
  }
}

export function rerollOneCurrentDie(state, player, rolls, faces, forcedIndex = null) {
  if (!player || !Array.isArray(rolls) || rolls.length === 0) return;
  const index = Number.isInteger(forcedIndex) ? forcedIndex : Math.floor(Math.random() * rolls.length);
  const nextValue = rollDie(faces[index] || 8);
  rolls[index] = nextValue;
  const hasImmunity = (player.activeBlessings || []).some(card => card.id === 'card_eng_1')
    || (player.playedTurnCards || []).some(card => card.id === 'card_stu_2');
  if (nextValue === 1 && player.card?.negativeSkill?.id === SKILL.ROYAL_ETIQUETTE && !hasImmunity) {
    player.hp = Math.max(0, player.hp - 1);
  }
}

export function applyInstantCardEffect(state, p, card, options = {}) {
  const opp = getTacticalOpponent(state, p);

  switch (card.id) {
    case 'card_eng_2':
    case 'card_gen_03':
      p.hp = Math.min(p.maxHp, p.hp + (card.id === 'card_eng_2' ? 5 : 4));
      break;
    case 'card_che_2':
      p.buffs = []; p.redHeat = 0; p.stickers = 0; p.selfStickers = 0;
      p.permanentDefPenalty = 0;
      break;
    case 'card_che_3':
      if (opp && (opp.redHeat || 0) > 0) {
        const dmg = opp.redHeat;
        opp.hp = Math.max(0, opp.hp - dmg);
        opp.redHeat = 0;
      }
      break;
    case 'card_it_2':
    case 'card_gen_07':
      if (opp && (opp.tp || 0) > 0) {
        opp.tp -= 1;
        if (card.id === 'card_it_2') p.tp = Math.min(10, p.tp + 1);
      }
      break;
    case 'card_stu_3':
      if ((p.handCards || []).length < 3) {
        const curSubj = state.schedule[state.currentClassIndex];
        p.handCards.push(getRandomCard(curSubj, p.card?.subjects || []));
      }
      break;
    case 'card_gen_15':
      break;
    case 'card_gen_11':
      if (p.handCards && p.handCards.length > 0) {
        p.handCards.splice(Math.floor(Math.random() * p.handCards.length), 1);
      }
      p.handCards.push(getRandomCard(state.schedule[state.currentClassIndex] || 'chinese', p.card?.subjects || []));
      break;
    case 'card_gen_12':
    case 'card_art_3':
      p.stealthActive = true;
      break;
    case 'card_gen_14':
      // 防守无伤获得 2 TP（由 confirmDefense 处理）
      break;
    case 'card_bio_3': {
      const hpCost = Math.floor(p.hp * 0.3);
      const realDmg = Math.min(10, Math.max(1, hpCost));
      p.hp = Math.max(1, p.hp - hpCost);
      if (opp) {
        opp.hp = Math.max(0, opp.hp - realDmg);
      }
      card.metadata = { realDmg };
      break;
    }
    case 'card_gen_10':
      if (opp) opp.redHeat = (opp.redHeat || 0) + 2;
      break;
    case 'card_eng_3':
      if (state.turnData?.attackRolls) {
        const atkP = state.players[state.turnData.attackerIdx];
        if (atkP) rerollCurrentDice(state, atkP, state.turnData.attackRolls, getRollingPool(atkP, state));
      }
      if (state.turnData?.isAoE) {
        for (const [playerId, defense] of Object.entries(state.turnData.aoeDefenses || {})) {
          const defP = findPlayer(state, playerId);
          if (defP && !defP.isDead && !defense.confirmed) rerollCurrentDice(state, defP, defense.rolls, getRollingPool(defP, state));
        }
      } else if (state.turnData?.defenseRolls) {
        const defP = state.players[state.turnData.defenderIdx];
        if (defP) rerollCurrentDice(state, defP, state.turnData.defenseRolls, getRollingPool(defP, state));
      }
      if (state.turnPhase === TURN.DEF_ROLLED) {
        rebuildAttackResultAfterDieChange(state, state.players[state.turnData.attackerIdx], state.players[state.turnData.defenderIdx]);
      }
      break;
    case 'card_mus_3':
      if (state.turnPhase === TURN.ATK_ROLLED && state.turnData?.attackRolls?.length > 0) {
        const atkP = state.players[state.turnData.attackerIdx];
        const index = Math.floor(Math.random() * state.turnData.attackRolls.length);
        if (!state.turnData.temporaryDiceFaces) state.turnData.temporaryDiceFaces = {};
        if (!state.turnData.temporaryDiceFaces[atkP.id]) state.turnData.temporaryDiceFaces[atkP.id] = {};
        state.turnData.temporaryDiceFaces[atkP.id][index] = 8;
        rerollOneCurrentDie(state, atkP, state.turnData.attackRolls, getRollingPool(atkP, state), index);
      } else if (state.turnPhase === TURN.DEF_ROLLED) {
        const target = state.turnData.isAoE
          ? (state.turnData.aoeDefenses?.[p.id] ? p : state.players[state.turnData.defenderIdx])
          : state.players[state.turnData.defenderIdx];
        const rolls = getDefenseRollsForPlayer(state, target);
        if (target && rolls?.length > 0) {
          const index = Math.floor(Math.random() * rolls.length);
          if (!state.turnData.temporaryDiceFaces) state.turnData.temporaryDiceFaces = {};
          if (!state.turnData.temporaryDiceFaces[target.id]) state.turnData.temporaryDiceFaces[target.id] = {};
          state.turnData.temporaryDiceFaces[target.id][index] = 8;
          rerollOneCurrentDie(state, target, rolls, getRollingPool(target, state), index);
        }
      }
      break;
    case 'card_it_1':
      break;
    case 'card_tec_3':
      p.chargeStacks = Math.min(2, (p.chargeStacks || 0) + 1);
      break;
    case 'card_pe_3':
      if (opp) opp.permanentDefPenalty = (opp.permanentDefPenalty || 0) + 2;
      break;
    case 'card_his_3': {
      const prevHp = p.hpLastRound ?? p.hp;
      const diff = Math.max(0, prevHp - p.hp);
      const heal = Math.min(10, diff);
      p.hp = Math.min(p.maxHp, p.hp + heal);
      break;
    }
    case 'card_gen_01':
      return rerollSelectedDie(state, p, options)
        ? { ok: true }
        : { ok: false, error: '没有可重投的目标骰子' };
    case 'card_gen_13':
      p.tempSlotBonus = (p.tempSlotBonus || 0) + 1;
      break;
  }
}

/** Rebuild only the derived attack total after a card changes an already rolled attack die. */
export function rebuildAttackResultAfterDieChange(state, atk, def) {
  const ar = state.turnData?.atkResult;
  const rolls = state.turnData?.attackRolls;
  if (!ar || !Array.isArray(rolls) || !Array.isArray(ar.keptIndices) || !atk || !def) return;
  let keptRolls = ar.keptIndices.map(index => rolls[index]);
  const turnCards = atk.playedTurnCards || (atk.playedTurnCard ? [atk.playedTurnCard] : []);
  if (turnCards.some(card => card.id === 'card_chi_2') && keptRolls.length > 0) {
    const index = keptRolls.indexOf(Math.min(...keptRolls));
    const originalIndex = ar.keptIndices[index];
    keptRolls[index] = getRollingPool(atk, state)[originalIndex] || 6;
  }
  const multi = getCourseMultiplier(atk, state);
  if (atk.card.positiveSkill?.id === SKILL.LIBERAL_ARTS) keptRolls = keptRolls.map(value => Math.floor(value * multi));
  let baseAtk = keptRolls.reduce((sum, value) => sum + value, 0);
  if (state.turnData.sleepyAtkPenalty > 0) baseAtk = Math.max(0, baseAtk - state.turnData.sleepyAtkPenalty);
  if (state.turnData.allergyTriggered) baseAtk = Math.floor(4 * multi);
  const tac = calcTacticalCardEffects(state, atk, def, keptRolls);
  let finalAtk = baseAtk + (tac.isNoFixedBonus ? 0 : tac.atkBonus);
  if (atk.card.positiveSkill?.id === SKILL.STEALTH_STRIKE && !tac.isNoFixedBonus) finalAtk += Math.floor(2 * multi);
  if ((state.turnData.chargeConsumed || 0) > 0 && !tac.isNoFixedBonus) finalAtk += state.turnData.chargeConsumed * 8;
  ar.baseAtk = baseAtk;
  ar.bonusDamage = finalAtk - baseAtk;
  ar.finalAtk = finalAtk;
  ar.faces = keptRolls;
}

function rerollSelectedDie(state, player, options) {
  const target = resolveRerollTarget(state, player, options);
  if (!target) return false;
  const rolls = target.id === state.players[state.turnData?.attackerIdx]?.id
    ? state.turnData?.attackRolls
    : getDefenseRollsForPlayer(state, target);
  if (!Array.isArray(rolls) || rolls.length === 0) return false;
  const index = Number.isInteger(options?.dieIndex) ? options.dieIndex : Math.floor(Math.random() * rolls.length);
  if (index < 0 || index >= rolls.length) return false;
  const faces = getRollingPool(target, state);
  rolls[index] = rollDie(faces[index] || 8);
  if (target.id === state.players[state.turnData?.attackerIdx]?.id && state.turnPhase === TURN.DEF_ROLLED) {
    rebuildAttackResultAfterDieChange(state, target, state.players[state.turnData.defenderIdx]);
  }
  const hasImmunity = (target.activeBlessings || []).some(card => card.id === 'card_eng_1')
    || (target.playedTurnCards || []).some(card => card.id === 'card_stu_2');
  if (rolls[index] === 1 && target.card?.negativeSkill?.id === SKILL.ROYAL_ETIQUETTE && !hasImmunity) {
    target.hp = Math.max(0, target.hp - 1);
  }
  return true;
}

function resolveRerollTarget(state, player, options) {
  const attacker = state.players[state.turnData?.attackerIdx];
  const defender = state.turnData?.isAoE
    ? state.players.find(candidate => candidate?.id === options?.targetId)
    : state.players[state.turnData?.defenderIdx];
  const requested = options?.targetId ? state.players.find(candidate => candidate?.id === options.targetId) : null;
  const target = requested || (player.id === attacker?.id ? attacker : defender);
  if (!target || target.isDead || target.hp <= 0) return null;
  if (target.id !== player.id && target.id !== attacker?.id && target.id !== defender?.id) return null;
  if (target.id === attacker?.id && !Array.isArray(state.turnData?.attackRolls)) return null;
  if (target.id !== attacker?.id && !getDefenseRollsForPlayer(state, target)) return null;
  if (state.turnData?.isAoE && target.id !== player.id && target.id !== attacker?.id) return null;
  if (target.id !== player.id && player.id !== attacker?.id && target.id !== attacker?.id) return null;
  if (state.turnData?.isAoE && target.id !== attacker?.id && state.turnData.aoeDefenses?.[target.id]?.confirmed) return null;
  return target;
}
