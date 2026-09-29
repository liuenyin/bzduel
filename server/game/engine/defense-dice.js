import { SKILL } from '../../../shared/characters.js';
import { getRollingPool, getAllowedSlotCount } from './dice.js';
import { areValidDiceIndices } from './primitives.js';

export function validateDefenseSelection(state, defender, rolls, indices) {
  const slots = getAllowedSlotCount(state, defender.id, 'defense');
  if (!areValidDiceIndices(indices, rolls?.length, slots)) return { ok: false, error: 'invalid_slots' };
  if (defender.card.neutralSkill?.id === SKILL.D10_LIMIT) {
    const pool = getRollingPool(defender, state);
    if (indices.filter(index => pool[index] === 10).length > 1) return { ok: false, error: 'zww_d10_limit' };
  }
  return { ok: true };
}

export function turnCards(player) {
  return player.playedTurnCards || (player.playedTurnCard ? [player.playedTurnCard] : []);
}

/** Apply selection effects in order, leaving the original rolled dice intact. */
export function prepareDefenseDice(state, attacker, defender, rolls, indices) {
  const keptRolls = indices.map(index => rolls[index]);
  const defTurnCards = turnCards(defender);
  const atkTurnCards = turnCards(attacker);
  if (keptRolls.length && defTurnCards.some(card => card.id === 'card_chi_2')) {
    const index = keptRolls.indexOf(Math.min(...keptRolls));
    keptRolls[index] = getRollingPool(defender, state)[indices[index]] || 6;
  }
  if (keptRolls.length && atkTurnCards.some(card => card.id === 'card_chi_3')) {
    keptRolls[keptRolls.indexOf(Math.max(...keptRolls))] = 2;
  }
  if (keptRolls.length && atkTurnCards.some(card => card.id === 'card_gen_06')) {
    const index = keptRolls.indexOf(Math.max(...keptRolls));
    keptRolls[index] = Math.max(1, keptRolls[index] - 2);
  }
  return { keptRolls, defTurnCards, atkTurnCards };
}

export function sacrificeDefenseDie(defender, rolls, indices, keptRolls, options) {
  if (defender.card.positiveSkill?.id !== SKILL.GAL_PLAYER || options?.sacrificeIndex === undefined) {
    return { lcHealTriggered: false, healAmount: 0 };
  }
  const selectedIndex = indices.indexOf(options.sacrificeIndex);
  const value = keptRolls[selectedIndex];
  if (selectedIndex < 0 || value <= 1) return { lcHealTriggered: false, healAmount: 0 };
  const healAmount = value - 1;
  keptRolls[selectedIndex] = 1;
  rolls[options.sacrificeIndex] = 1;
  defender.hp = Math.min(defender.maxHp, defender.hp + healAmount);
  return { lcHealTriggered: true, healAmount };
}
