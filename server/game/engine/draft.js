import { cloneCard, findPlayer } from './primitives.js';
import { PHASE } from '../../../shared/rules.js';
import { getRandomCard } from '../../../shared/cards.js';

export function refreshDraftSlot(state, playerId, slotIndex) {
  if (!state.draftShop || !state.draftShop.active) return { ok: false, error: '商店未开启' };
  if (!Number.isInteger(slotIndex)) return { ok: false, error: '槽位不存在' };
  const pDraft = state.draftShop.players[playerId];
  if (!pDraft || !pDraft.slots[slotIndex]) return { ok: false, error: '槽位不存在' };
  const slot = pDraft.slots[slotIndex];
  if (slot.refreshesLeft <= 0) return { ok: false, error: '该栏刷新次数已用完' };

  const p = findPlayer(state, playerId);
  const curSubj = state.schedule[state.currentClassIndex] || 'chinese';
  slot.refreshesLeft -= 1;
  slot.card = getRandomCard(curSubj, p?.card?.subjects || []);
  return { ok: true, slot };
}

export function buyDraftCard(state, playerId, slotIndex) {
  if (!state.draftShop || !state.draftShop.active) return { ok: false, error: '商店未开启' };
  if (!Number.isInteger(slotIndex)) return { ok: false, error: '槽位不存在' };
  const pDraft = state.draftShop.players[playerId];
  if (!pDraft || !pDraft.slots[slotIndex]) return { ok: false, error: '槽位不存在' };
  const slot = pDraft.slots[slotIndex];
  if (!slot.card) return { ok: false, error: '空槽位' };

  const p = findPlayer(state, playerId);
  if (!p) return { ok: false };
  if ((p.handCards || []).length >= 3) return { ok: false, error: '手牌已满 (最多持有 3 张)' };

  if ((p.tp || 0) < slot.card.tpCost) return { ok: false, error: 'TP 不足' };
  p.tp -= slot.card.tpCost;

  p.handCards.push(cloneCard(slot.card));

  // 自动补货
  const curSubj = state.schedule[state.currentClassIndex] || 'chinese';
  slot.card = getRandomCard(curSubj, p.card?.subjects || []);

  return { ok: true, handCards: p.handCards };
}

export function confirmDraftReady(state, playerId) {
  if (state.phase !== PHASE.BATTLE || !state.draftShop?.active) return { ok: false, error: 'invalid_phase' };
  const player = findPlayer(state, playerId);
  if (!player) return { ok: false, error: 'player_not_found' };
  if (player.isDead || player.hp <= 0) return { ok: false, error: 'player_defeated' };
  const pDraft = state.draftShop.players?.[playerId];
  if (!pDraft) return { ok: false, error: 'player_not_found' };
  if (pDraft.ready) return { ok: false, error: 'already_ready' };
  pDraft.ready = true;

  const allReady = state.players
    .filter(candidate => !candidate.isDead && candidate.hp > 0)
    .every(candidate => state.draftShop.players?.[candidate.id]?.ready);
  if (allReady) {
    state.draftShop.active = false;
  }
  return { ok: true, allReady };
}
