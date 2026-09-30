import { isDraftShopActive, canPlayBattleAction, cloneCard } from './primitives.js';
import { getRollingPool, getAllowedSlotCount } from './dice.js';
import { TURN } from '../../../shared/turn.js';
import { PHASE, GAME_MODE, IDENTITY } from '../../../shared/rules.js';

export function getCurrentAttackerId(state) {
  if (!canPlayBattleAction(state)) return null;
  const attacker = state.players?.[state.turnData?.attackerIdx];
  return attacker?.id || null;
}

export function getCurrentDefenderId(state) {
  if (!canPlayBattleAction(state)) return null;
  if (state.turnData?.defenderIdx === null || state.turnData?.defenderIdx === undefined) return null;
  return state.players?.[state.turnData.defenderIdx]?.id || null;
}

export function getStateView(state, playerId) {
  const players = Array.isArray(state?.players) ? state.players : [];
  const myIdx = players.findIndex(p => p?.id === playerId);
  const isAtk = state.turnData?.attackerIdx === myIdx;
  const shouldHideRolls = (p, pIdx) => (
    pIdx !== myIdx &&
    state.phase !== PHASE.GAME_OVER &&
    (p?.cardId === 'char_10' || p?.stealthActive)
  );

  const mapPlayerView = (p, pIdx) => {
    // 殷泽轩 (char_10) 技能：对方无法查看你的 HP 与掷骰点数
    const isYZX = p.cardId === 'char_10';
    const isMe = pIdx === myIdx;
    const hideHP = (isYZX || p.stealthActive) && !isMe && state.phase !== PHASE.GAME_OVER;
    
    // 身份隐藏逻辑 (大乱斗模式下，非主公且非自己的身份对他人隐藏)
    const hideIdentity = state.gameMode === GAME_MODE.MODE_FFA && !isMe && p.identity !== IDENTITY.LORD && !p.isDead && state.phase !== PHASE.GAME_OVER;
    
    return {
      id: p.id, nickname: p.nickname,
      cardId: (state.phase === PHASE.BATTLE || state.phase === PHASE.GAME_OVER) ? p.cardId : null,
      card: (state.phase === PHASE.BATTLE || state.phase === PHASE.GAME_OVER) ? cloneCard(p.card) : null,
      hp: hideHP ? '??' : p.hp,
      maxHp: hideHP ? '??' : p.maxHp,
      ready: p.ready,
      hasReschedule: p.hasReschedule, rerolls: p.rerolls, buffs: cloneCard(p.buffs || []),
      permanentDefPenalty: p.permanentDefPenalty, redHeat: p.redHeat || 0,
      chargeStacks: p.chargeStacks || 0,
      isDead: !!p.isDead,
      identity: hideIdentity ? '?' : p.identity,
      // 新增字段
      stickers: p.stickers || 0,
      selfStickers: p.selfStickers || 0,
      invertReduction: p.invertReduction || 0,
      nineLivesUsed: !!p.nineLivesUsed,
      effectiveDicePool: (state.phase === PHASE.BATTLE || state.phase === PHASE.GAME_OVER) ? getRollingPool(p, state) : null,
      effectiveAtkSlots: getAllowedSlotCount(state, p.id, 'attack'),
      effectiveDefSlots: getAllowedSlotCount(state, p.id, 'defense'),
      pendingDreamState: !!p.pendingDreamState,
      stealthActive: !!p.stealthActive,
      tempSlotBonus: p.tempSlotBonus || 0,
      skillsSealed: !!p.skillsSealed,
      skillsSealedTurnsLeft: p.skillsSealedTurnsLeft || 0,
      // 战术卡与 TP
      tp: p.tp || 0,
      handCards: isMe ? (p.handCards || []).map(cloneCard) : Array((p.handCards || []).length).fill({ hidden: true }),
      activeBlessings: (p.activeBlessings || []).map(cloneCard),
      playedTurnCard: cloneCard(p.playedTurnCard),
      playedTurnCards: (p.playedTurnCards || (p.playedTurnCard ? [p.playedTurnCard] : [])).map(cloneCard),
      // 付修然 (fxr) 状态
      dreamStacks: p.dreamStacks || 0,
      inDreamState: !!p.inDreamState,
      dreamTargetChoice: p.dreamTargetChoice,
      realTargetIdx: isMe ? p.realTargetIdx : (p.dreamTargetChoice !== null ? p.realTargetIdx : null),
      lgpyForm: !!p.lgpyForm,
      lgpyTurnsLeft: p.lgpyTurnsLeft || 0,
    };
  };

  const playersView = players.filter(Boolean).map(mapPlayerView);
  const logView = (state.log || []).map((entry, index) => ({
    id: entry.id || `legacy-log-${index}`,
    day: Number.isInteger(entry.day) ? entry.day : 1,
    totalRound: Number.isInteger(entry.totalRound) ? entry.totalRound : null,
    classIndex: Number.isInteger(entry.classIndex) ? entry.classIndex : null,
    subRound: Number.isInteger(entry.subRound) ? entry.subRound : null,
    subject: entry.subject || null,
    type: entry.type || 'system',
    actorId: entry.actorId || null,
    targetId: entry.targetId || null,
    text: entry.text || '',
    details: entry.details ? JSON.parse(JSON.stringify(entry.details)) : null,
  }));

  return {
    gameMode: state.gameMode,
    phase: state.phase,
    currentDay: state.currentDay || 1,
    currentClassIndex: state.currentClassIndex,
    currentSubRound: state.currentSubRound,
    totalRound: state.totalRound,
    myIndex: myIdx,
    attackerIdx: state.turnData?.attackerIdx,
    defenderIdx: state.turnData?.defenderIdx,
    turnPhase: state.turnPhase,
    isMyAttackTurn: isAtk && !isDraftShopActive(state) && (state.turnPhase === TURN.WAITING_ATK || state.turnPhase === TURN.ATK_ROLLED || state.turnPhase === TURN.CHOOSE_TARGET),
    isMyDefendTurn: !isAtk && !players[myIdx]?.isDead && !isDraftShopActive(state) && state.turnPhase === TURN.DEF_ROLLED && (state.turnData?.isAoE ? !!state.turnData?.aoeDefenses?.[playerId] && !state.turnData.aoeDefenses[playerId].confirmed : state.turnData?.defenderIdx === myIdx),
    // 殷泽轩屏蔽点数逻辑：如果是 YZX 在掷骰且不是我，点数显示为 null
    attackRolls: (state.turnData?.attackRolls) ? (
      shouldHideRolls(state.players[state.turnData.attackerIdx], state.turnData.attackerIdx)
      ? state.turnData.attackRolls.map(() => -1) 
      : [...state.turnData.attackRolls]
    ) : null,
    defenseRolls: state.turnData?.defenseRolls ? (
       shouldHideRolls(state.players[state.turnData.defenderIdx], state.turnData.defenderIdx)
       ? state.turnData.defenseRolls.map(() => -1)
       : [...state.turnData.defenseRolls]
    ) : null,
    aoeDefenses: state.turnData?.isAoE ? (
      Object.fromEntries(Object.entries(state.turnData.aoeDefenses || {}).map(([pid, d]) => {
        const pIdx = players.findIndex(x => x?.id === pid);
        const hideRolls = shouldHideRolls(state.players[pIdx], pIdx);
        return [
          pid, {
            confirmed: !!d?.confirmed,
            hasRerolled: !!d?.hasRerolled,
            rolls: (pid === playerId || (state.turnPhase !== TURN.DEF_ROLLED && !hideRolls))
              ? (Array.isArray(d?.rolls) ? [...d.rolls] : [])
              : (hideRolls && Array.isArray(d?.rolls) ? d.rolls.map(() => -1) : null)
          }
        ];
      }))
    ) : null,
    atkResult: (state.turnData?.atkResult) ? (
      shouldHideRolls(state.players[state.turnData.attackerIdx], state.turnData.attackerIdx)
      ? { ...cloneCard(state.turnData.atkResult), baseAtk: '??', finalAtk: '??' }
      : cloneCard(state.turnData.atkResult)
    ) : null,
    allergyTriggered: state.turnData?.allergyTriggered || false,
    isExtraTurn: state.turnData?.isExtraTurn || false,
    extraTurnFaceBoost: state.turnData?.extraTurnFaceBoost || 0,
    hasAttackerRerolled: state.turnData?.hasAttackerRerolled || false,
    hasDefenderRerolled: state.turnData?.hasDefenderRerolled || false,
    draftShop: state.draftShop ? {
      active: !!state.draftShop.active,
      pendingPlayerIds: players.filter(p => !p.isDead && p.hp > 0 && !state.draftShop.players?.[p.id]?.ready).map(p => p.id),
      players: state.draftShop.players?.[playerId]
        ? { [playerId]: cloneCard(state.draftShop.players[playerId]) }
        : {},
    } : null,
    schedule: cloneCard(state.schedule),
    log: logView,
    players: playersView,
    winner: state.winner,
    endReason: state.endReason || null,
    surrenderedId: state.surrenderedId || null,
    me: playersView[myIdx],
    opponent: state.gameMode === GAME_MODE.MODE_1V1 ? playersView[1 - myIdx] : null,
  };
}

export function getAttackConfirmationView(state, playerId) {
  const stateView = getStateView(state, playerId);
  return {
    atkResult: stateView.atkResult,
    defenseRolls: stateView.defenseRolls,
    state: stateView,
  };
}
