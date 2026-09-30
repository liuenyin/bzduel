import { getTacticalOpponent, applyInstantCardEffect } from './tactical-effects.js';
import { appendBattleLog } from './battle-log.js';
import { isDraftShopActive, cloneCard, findPlayer } from './primitives.js';
import { ATTACK_TACTICAL_CARDS, DEFENSE_TACTICAL_CARDS, CLASH_TACTICAL_CARDS } from '../../../shared/tactical-rules.js';
import { PHASE } from '../../../shared/rules.js';
import { cardMap, CARD_TYPE } from '../../../shared/cards.js';
import { resolveImmediateCardDeaths } from './immediate-deaths.js';

export function playTacticalCard(state, playerId, cardId) {
  if (state.phase !== PHASE.BATTLE) return { ok: false, error: '非战斗阶段' };
  if (isDraftShopActive(state)) return { ok: false, error: '请先完成补给' };
  const p = findPlayer(state, playerId);
  if (!p || p.isDead) return { ok: false, error: '玩家不存在或已阵亡' };
  if (typeof cardId !== 'string') return { ok: false, error: '无效卡牌' };

  const canonicalCard = cardMap[cardId];
  if (!canonicalCard) return { ok: false, error: '无效卡牌' };
  const cIdx = (p.handCards || []).findIndex(c => c.id === cardId);
  if (cIdx === -1) return { ok: false, error: '手牌中无此卡牌' };
  const card = cloneCard(canonicalCard);

  const curSubj = state.schedule[state.currentClassIndex];

  // 校验学科限制（学科卡只能在对应课程使用）
  if (card.subject !== 'universal' && card.subject !== curSubj) {
    return { ok: false, error: `【${card.name}】只能在 ${card.subject} 课使用！` };
  }

  const attacker = state.players[state.turnData?.attackerIdx];
  const defender = state.turnData?.defenderIdx == null
    ? null
    : state.players[state.turnData.defenderIdx];
  const isAttacker = attacker?.id === p.id;
  const isDefender = state.turnData?.isAoE
    ? !!state.turnData.aoeDefenses?.[p.id] && !state.turnData.aoeDefenses[p.id].confirmed
    : defender?.id === p.id;
  if (!isAttacker && !isDefender) {
    return { ok: false, error: '仅当前交锋玩家可使用' };
  }
  if (ATTACK_TACTICAL_CARDS.has(card.id) && !isAttacker) {
    return { ok: false, error: '仅攻击方可在此时使用' };
  }
  if (DEFENSE_TACTICAL_CARDS.has(card.id) && !isDefender) {
    return { ok: false, error: '仅防守方可在此时使用' };
  }
  if (CLASH_TACTICAL_CARDS.has(card.id) && !isAttacker && !isDefender) {
    return { ok: false, error: '仅交锋中的玩家可使用' };
  }
  if (card.type === CARD_TYPE.BLESSING && (p.activeBlessings || []).some(active => active.id === card.id)) {
    return { ok: false, error: '本节课已激活此祝福' };
  }
  if (card.type !== CARD_TYPE.BLESSING && (p.playedTurnCards || []).some(active => active.id === card.id)) {
    return { ok: false, error: '同类效果已生效' };
  }

  p.handCards.splice(cIdx, 1);

  if (card.type === CARD_TYPE.BLESSING) {
    if (!p.activeBlessings) p.activeBlessings = [];
    p.activeBlessings.push(card);
    appendBattleLog(state, {
      text: `【祝福】${p.nickname} 激活了【${card.name}】！`,
      type: 'tactical',
      actorId: p.id,
      details: { cardId: card.id, cardName: card.name, cardType: card.type },
    });
    if (card.id === 'card_eng_1') {
      p.rerolls += 2;
    } else if (card.id === 'card_it_1') {
      const opp = getTacticalOpponent(state, p);
      if (opp && opp.card) {
        p.copiedPositiveSkill = { original: cloneCard(p.card.positiveSkill) };
        if (opp.card.positiveSkill) {
          p.card.positiveSkill = cloneCard(opp.card.positiveSkill);
        }
      }
    }
  } else {
    if (!p.playedTurnCards) p.playedTurnCards = [];
    p.playedTurnCards.push(card);
    p.playedTurnCard = card;
    appendBattleLog(state, {
      text: `【战术】${p.nickname} 使用了【${card.name}】！`,
      type: 'tactical',
      actorId: p.id,
      details: { cardId: card.id, cardName: card.name, cardType: card.type },
    });
    applyInstantCardEffect(state, p, card);
  }

  const deathResolution = state.players.some(player => player.hp <= 0)
    ? resolveImmediateCardDeaths(state, p, card)
    : { gameOver: false, winner: null, nineLivesTriggered: false, defeatedIds: [] };

  return { ok: true, card, ...deathResolution };
}
