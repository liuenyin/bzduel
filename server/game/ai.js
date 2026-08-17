// ============================================================
// 校园战力党 — PVE AI 对手
// ============================================================
import { characters, SKILL } from '../../shared/characters.js';
import { getSkillMultiplier } from '../../shared/rules.js';

/**
 * AI 选卡策略：根据课程表选择亲和度最高的角色
 */
export function aiSelectCard(schedule) {
  let bestId = characters[0].id;
  let bestScore = -Infinity;

  for (const char of characters) {
    if (char.ffaOnly) continue;
    let score = 0;
    for (const subject of schedule) {
      score += getSkillMultiplier(char.subjects, subject);
    }
    // 加一点随机性
    score += Math.random() * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestId = char.id;
    }
  }

  return bestId;
}

function combinations(values, count) {
  if (count <= 0) return [[]];
  if (count >= values.length) return [[...values]];
  const result = [];
  const visit = (start, picked) => {
    if (picked.length === count) {
      result.push([...picked]);
      return;
    }
    for (let index = start; index <= values.length - (count - picked.length); index++) {
      picked.push(values[index]);
      visit(index + 1, picked);
      picked.pop();
    }
  };
  visit(0, []);
  return result;
}

function maxFrequency(values) {
  const frequencies = new Map();
  let max = 0;
  for (const value of values) {
    const next = (frequencies.get(value) || 0) + 1;
    frequencies.set(value, next);
    max = Math.max(max, next);
  }
  return max;
}

export function aiChooseKeepIndices({ rolls, faces = [], slots, phase = 'attack', skillId = null, targetValue = 0 }) {
  if (!Array.isArray(rolls) || rolls.length === 0) return [];
  const keepCount = slots === -1 ? rolls.length : Math.max(1, Math.min(slots || 1, rolls.length));
  const candidates = combinations(rolls.map((_, index) => index), keepCount)
    .filter(indices => skillId !== SKILL.D10_LIMIT || indices.filter(index => faces[index] === 10).length <= 1);

  let best = candidates[0] || [];
  let bestScore = -Infinity;
  for (const indices of candidates) {
    const values = indices.map(index => rolls[index]);
    const sum = values.reduce((total, value) => total + value, 0);
    const range = Math.max(...values) - Math.min(...values);
    const frequency = maxFrequency(values);
    let score = sum;

    if (phase === 'defense' && targetValue > 0) {
      score += sum >= targetValue ? 60 - Math.max(0, sum - targetValue) * 0.05 : sum * 0.4;
    }
    if (skillId === SKILL.STAR_SHOWOFF && phase === 'attack') {
      score += range <= 2 ? 100 : -range * 3;
    }
    if (skillId === SKILL.TIMELESS_GRACE && phase === 'attack') {
      score += frequency * 24;
      if (frequency >= 4) score += 55;
      if (frequency >= 5) score += 70;
    }
    if (skillId === SKILL.DREAM_KING && sum >= 15) score += 35;

    if (score > bestScore) {
      bestScore = score;
      best = indices;
    }
  }
  return best;
}

export function aiChooseRerollIndices({ player, rolls, faces = [], phase = 'attack', slots, targetValue = 0 }) {
  if (!player || !Array.isArray(rolls) || rolls.length === 0 || player.rerolls <= 0) return [];
  if ((player.buffs || []).some(buff => buff.id === SKILL.SUGAR_CRASH)) return [];

  const skillId = phase === 'defense'
    ? (player.card?.neutralSkill?.id || player.card?.positiveSkill?.id)
    : player.card?.positiveSkill?.id;
  const keepIndices = aiChooseKeepIndices({ rolls, faces, slots, phase, skillId, targetValue });
  const keptSum = keepIndices.reduce((sum, index) => sum + rolls[index], 0);
  if (phase === 'defense' && targetValue > 0 && keptSum >= targetValue) return [];
  if (skillId === SKILL.DREAM_KING && keptSum >= 15) return [];

  if (skillId === SKILL.TIMELESS_GRACE && phase === 'attack') {
    const counts = new Map();
    for (const value of rolls) counts.set(value, (counts.get(value) || 0) + 1);
    const [dominantValue, dominantCount] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    if (dominantCount >= 4) return [];
    return rolls
      .map((value, index) => ({ value, index, face: faces[index] || Math.max(...rolls) }))
      .filter(item => item.value !== dominantValue && item.value / item.face <= 0.65)
      .slice(0, 3)
      .map(item => item.index);
  }

  const lowIndices = rolls
    .map((value, index) => ({ value, index, face: faces[index] || Math.max(...rolls) }))
    .filter(item => item.value / Math.max(1, item.face) <= 0.38)
    .sort((a, b) => (a.value / a.face) - (b.value / b.face))
    .map(item => item.index);

  if (player.card?.rerollAll) {
    const averageRatio = rolls.reduce((sum, value, index) => sum + value / Math.max(1, faces[index] || value), 0) / rolls.length;
    return averageRatio < 0.58 ? rolls.map((_, index) => index) : [];
  }
  return lowIndices.slice(0, phase === 'defense' ? 2 : 3);
}

const ATTACK_CARD_IDS = new Set([
  'card_phy_2', 'card_phy_3', 'card_pol_3', 'card_geo_3', 'card_mus_2',
  'card_it_3', 'card_gen_04', 'card_gen_06', 'card_gen_08', 'card_gen_10', 'card_gen_15',
]);
const DEFENSE_CARD_IDS = new Set([
  'card_bio_2', 'card_pol_2', 'card_gen_02', 'card_gen_05', 'card_gen_09', 'card_gen_14',
]);

function scoreTacticalCard(state, player, card) {
  const opponent = state.players.find(candidate => candidate.id !== player.id && !candidate.isDead);
  const isAttacker = state.players[state.turnData?.attackerIdx]?.id === player.id;
  const isDefender = state.players[state.turnData?.defenderIdx]?.id === player.id;
  const missingHp = Math.max(0, player.maxHp - player.hp);
  let score = card.type === 'blessing' ? 70 : (card.type === 'debuff' ? 34 : 28);

  if (ATTACK_CARD_IDS.has(card.id)) score += isAttacker ? 35 : -45;
  if (DEFENSE_CARD_IDS.has(card.id)) score += isDefender ? 35 : -45;
  if (card.id === 'card_eng_2' || card.id === 'card_gen_03') score += missingHp >= 4 ? 45 : -80;
  if (card.id === 'card_che_2') {
    const hasNegativeState = (player.buffs || []).length > 0 || player.redHeat > 0 || player.stickers > 0 || player.selfStickers > 0 || player.permanentDefPenalty > 0;
    score += hasNegativeState ? 55 : -80;
  }
  if (card.id === 'card_che_3') score += (opponent?.redHeat || 0) > 0 ? 50 : -70;
  if (card.id === 'card_bio_3') score += isAttacker && player.hp >= 12 ? 35 : -90;
  if (card.id === 'card_gen_07') score += (opponent?.tp || 0) > 0 ? 25 : -45;
  if (card.id === 'card_his_3') score += missingHp >= 5 ? 35 : -55;
  if (card.id === 'card_gen_11') score -= 30;
  if (card.id === 'card_gen_13') score += state.currentSubRound === 0 ? 22 : 5;
  if (card.subject === state.schedule[state.currentClassIndex]) score += 8;
  return score;
}

export function aiChooseTacticalCard(state, playerId) {
  const player = state.players.find(candidate => candidate.id === playerId);
  if (!player || player.isDead || !Array.isArray(player.handCards)) return null;
  const subject = state.schedule[state.currentClassIndex];
  const isAttacker = state.players[state.turnData?.attackerIdx]?.id === player.id;
  const isDefender = state.players[state.turnData?.defenderIdx]?.id === player.id;
  const hasTurnWindow = isAttacker || (isDefender && state.turnPhase === 'def_rolled');

  return player.handCards
    .filter(card => card.subject === 'universal' || card.subject === subject)
    .filter(card => card.type === 'blessing' || hasTurnWindow)
    .map(card => ({ card, score: scoreTacticalCard(state, player, card) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.card || null;
}

export function aiChooseDraftSlot(state, playerId) {
  const player = state.players.find(candidate => candidate.id === playerId);
  const slots = state.draftShop?.players?.[playerId]?.slots;
  if (!player || !Array.isArray(slots) || (player.handCards || []).length >= 3) return null;

  return slots
    .map((slot, index) => ({ slot, index }))
    .filter(item => item.slot.card && item.slot.card.tpCost <= player.tp)
    .map(item => ({ ...item, score: scoreTacticalCard(state, player, item.slot.card) - item.slot.card.tpCost * 3 }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.index ?? null;
}
