import { PHASE, getSkillMultiplier } from '../../../shared/rules.js';

export function rollDie(faces) { return Math.floor(Math.random() * faces) + 1; }

export function rollDiceGroup(arr) { return arr.map(f => rollDie(f)); }

export function invertDieValue(value, faces) {
  const face = Math.max(1, Math.floor(Number(faces) || 1));
  return Math.max(1, Math.min(face, face + 1 - value));
}

export function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function pickRandom(arr, n) { return shuffle(arr).slice(0, n); }

export function isDraftShopActive(state) {
  return !!state?.draftShop?.active;
}

export function canPlayBattleAction(state) {
  return state?.phase === PHASE.BATTLE && !isDraftShopActive(state);
}

export function getCourseMultiplier(player, state) {
  if (!player?.card) return 1;
  const subject = state?.schedule?.[state.currentClassIndex];
  const base = getSkillMultiplier(player.card.subjects, subject);
  const hasGeographyBlessing = subject === 'geography'
    && base === 2
    && (player.activeBlessings || []).some(card => card.id === 'card_geo_1');
  return hasGeographyBlessing ? 3 : base;
}

export function areValidDiceIndices(indices, rollCount, expectedCount = null) {
  if (!Array.isArray(indices) || indices.length === 0) return false;
  if (expectedCount !== null && indices.length !== expectedCount) return false;
  if (!Number.isInteger(rollCount) || rollCount <= 0) return false;

  const unique = new Set(indices);
  return unique.size === indices.length && indices.every(i => Number.isInteger(i) && i >= 0 && i < rollCount);
}

export function cloneCard(card) {
  return card ? JSON.parse(JSON.stringify(card)) : card;
}

export function findPlayer(state, id) { return state.players.find(p => p.id === id); }
