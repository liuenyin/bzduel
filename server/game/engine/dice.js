import { findPlayer } from './primitives.js';
import { SKILL } from '../../../shared/characters.js';

export function getRollingPool(player, state = null) {
  if (!player?.card || !Array.isArray(player.card.dicePool)) return [];
  let pool = player.card.dicePool;
  if (player.lgpyForm) {
    pool = [7, 9, 9, 9, 11];
  } else if (player.card.positiveSkill?.id === SKILL.DREAM_KING || player.card.negativeSkill?.id === SKILL.ELEPHANT_CONDEMN) {
    if (player.inDreamState && player.dreamTargetChoice !== null && player.dreamTargetChoice !== player.realTargetIdx) {
      pool = [7, 9, 9, 9, 11];
    }
  }

  pool = [...pool];

  // 通技-增益 (card_tec_2): 最小面数骰子+2
  const turnCards = player.playedTurnCards || (player.playedTurnCard ? [player.playedTurnCard] : []);
  if (turnCards.some(c => c.id === 'card_tec_2') && pool.length > 0) {
    let minVal = Math.min(...pool);
    let minIdx = pool.indexOf(minVal);
    if (minIdx !== -1) pool[minIdx] += 2;
  }

  // 地理-增益 (card_geo_2): 本回合所有骰子面数临时+2。
  if (turnCards.some(c => c.id === 'card_geo_2')) {
    pool = pool.map(face => face + 2);
  }

  // 地理-减益 (card_geo_3): 对方所有骰子面数临时-2(最低减少至4)
  if (state && Array.isArray(state.players)) {
    const opponentHasGeographyDebuff = state.players.some(opp => {
      if (!opp || opp.id === player.id || opp.isDead) return false;
      const oppTurnCards = opp.playedTurnCards || (opp.playedTurnCard ? [opp.playedTurnCard] : []);
      return oppTurnCards.some(c => c.id === 'card_geo_3');
    });
    if (opponentHasGeographyDebuff) {
      pool = pool.map(face => Math.max(4, Number(face) - 2));
    }
  }

  // 音乐-其他：被替换的骰子在本回合后续重投中仍保持 D8。
  const temporaryFaces = state?.turnData?.temporaryDiceFaces?.[player.id];
  if (temporaryFaces && typeof temporaryFaces === 'object') {
    for (const [index, face] of Object.entries(temporaryFaces)) {
      if (Number.isInteger(Number(index)) && Number(index) >= 0 && Number(index) < pool.length) {
        pool[Number(index)] = Math.max(1, Number(face) || 8);
      }
    }
  }

  return pool.map(face => Math.max(1, Math.floor(Number(face) || 1)));
}

export function getEffectiveDicePool(state, playerId) {
  const player = findPlayer(state, playerId);
  if (!player?.card) return [];
  return getRollingPool(player, state);
}

export function getAllowedSlotCount(state, playerId, kind) {
  const player = findPlayer(state, playerId);
  if (!player?.card) return 0;
  let slots = kind === 'defense' ? player.card.defSlots : player.card.atkSlots;
  if (slots === -1) return -1;
  slots = Math.max(0, Math.floor(Number(slots) || 0));
  const subject = state.schedule[state.currentClassIndex];
  if (subject === 'art' && (player.activeBlessings || []).some(card => card.id === 'card_art_1')) slots += 1;
  slots += Math.max(0, Math.floor(Number(player.tempSlotBonus) || 0));
  return Math.min(slots, getRollingPool(player, state).length);
}
