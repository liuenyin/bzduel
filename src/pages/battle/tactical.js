import { GAME_MODE, SUBJECTS } from '../../../shared/rules.js';
import { ATTACK_TACTICAL_CARDS, DEFENSE_TACTICAL_CARDS, CLASH_TACTICAL_CARDS, DIRECT_OPPONENT_TACTICAL_CARDS, OPPONENT_TARGET_TACTICAL_CARDS } from '../../../shared/tactical-rules.js';

/** Hidden dice remain targetable by position without exposing their values. */
export function getRerollTargetChoices(state) {
  const choices = [];
  const attacker = state.players?.[state.attackerIdx];
  const isAttacker = attacker?.id === state.me?.id;
  const add = (player, rolls, count = rolls?.length || 0) => {
    if (!player || player.isDead) return;
    for (let index = 0; index < count; index++) {
      const value = rolls?.[index];
      choices.push({ playerId: player.id, nickname: player.nickname, index,
        value: Number.isFinite(value) && value > 0 ? value : '?' });
    }
  };
  add(attacker, state.attackRolls);
  if (state.aoeDefenses) {
    for (const [id, defense] of Object.entries(state.aoeDefenses)) {
      if (defense.confirmed || (!isAttacker && id !== state.me?.id)) continue;
      add(state.players?.find(player => player.id === id), defense.rolls, defense.rollCount ?? defense.rolls?.length ?? 0);
    }
  } else {
    add(state.players?.[state.defenderIdx], state.defenseRolls);
  }
  return choices;
}

export function getTacticalCardMoment(card) {
  if (card.type === 'blessing') return { label: '持续强化', kind: 'blessing' };
  if (ATTACK_TACTICAL_CARDS.has(card.id)) return { label: '攻击时', kind: 'attack' };
  if (DEFENSE_TACTICAL_CARDS.has(card.id)) return { label: '防守时', kind: 'defense' };
  if (CLASH_TACTICAL_CARDS.has(card.id)) return { label: '交锋时', kind: 'clash' };
  return { label: OPPONENT_TARGET_TACTICAL_CARDS.has(card.id) ? '影响对手' : '即时使用', kind: 'instant' };
}

export function getTacticalCardUsability(card, state) {
  const me = state.me;
  if (state.phase !== 'battle') return { canPlay: false, reason: '对局尚未开始或已结束' };
  if (me.isDead) return { canPlay: false, reason: '已淘汰，正在观战' };
  if (state.draftShop?.active) return { canPlay: false, reason: '补给结束后才可出牌' };
  if (state.aoeDefenses?.[me.id]?.confirmed) return { canPlay: false, reason: '已确认防御，等待其他玩家' };
  const isAttacker = state.attackerIdx === state.myIndex;
  const isDefender = state.aoeDefenses
    ? !!state.aoeDefenses[me.id] && !state.aoeDefenses[me.id].confirmed
    : state.defenderIdx === state.myIndex;
  if (!isAttacker && !isDefender) return { canPlay: false, reason: '等待自己的交锋' };
  if (state.gameMode === GAME_MODE.MODE_FFA
    && isAttacker
    && state.defenderIdx == null
    && DIRECT_OPPONENT_TACTICAL_CARDS.has(card.id)) {
    return { canPlay: false, reason: '请先选择攻击目标' };
  }
  const currentSubject = state.schedule[state.currentClassIndex];
  const subject = SUBJECTS[card.subject];
  if (card.subject !== 'universal' && card.subject !== currentSubject) {
    return { canPlay: false, reason: `仅限${subject?.label || card.subject}课` };
  }

  if (card.type === 'blessing' && (me.activeBlessings || []).some(active => active.id === card.id)) {
    return { canPlay: false, reason: '本节课已生效' };
  }
  if ((me.playedTurnCards || []).some(active => active.id === card.id)) {
    return { canPlay: false, reason: '同类效果已生效' };
  }

  const opponentIndex = isAttacker ? state.defenderIdx : state.attackerIdx;
  const opponent = state.opponent || state.players?.[opponentIndex];
  if (['card_eng_2', 'card_gen_03'].includes(card.id) && me.hp >= me.maxHp) {
    return { canPlay: false, reason: '生命值已满' };
  }
  if (card.id === 'card_che_2') {
    const hasNegativeState = (me.buffs || []).length > 0 || me.redHeat > 0 || me.stickers > 0 || me.selfStickers > 0 || me.permanentDefPenalty > 0;
    if (!hasNegativeState) return { canPlay: false, reason: '当前无负面效果' };
  }
  if (card.id === 'card_tec_3') {
    if (me.cardId !== 'char_14' && me.card?.id !== 'char_14') return { canPlay: false, reason: '仅周煊声可用' };
    if ((me.chargeStacks || 0) >= 2) return { canPlay: false, reason: '蓄势已满' };
  }
  if (card.id === 'card_gen_11' && (me.handCards || []).length < 2) {
    return { canPlay: false, reason: '至少需要另一张手牌才能弃置' };
  }
  if (card.id === 'card_gen_01' && getRerollTargetChoices(state).length === 0) {
    return { canPlay: false, reason: '当前没有可指定的骰子' };
  }
  if (card.id === 'card_che_3' && !(opponent?.redHeat > 0)) {
    return { canPlay: false, reason: '对手没有红温' };
  }
  if (['card_it_2', 'card_gen_07'].includes(card.id) && !(opponent?.tp > 0)) {
    return { canPlay: false, reason: '对手没有 TP' };
  }

  const moment = getTacticalCardMoment(card);
  if (moment.kind === 'attack' && !isAttacker) return { canPlay: false, reason: '仅在攻击回合使用' };
  if (moment.kind === 'defense' && !isDefender) return { canPlay: false, reason: '仅在防守回合使用' };
  if (moment.kind === 'clash' && !isAttacker && !isDefender) return { canPlay: false, reason: '等待自己的交锋' };
  return { canPlay: true, reason: '' };
}
