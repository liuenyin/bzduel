const MAX_BATTLE_LOG_ENTRIES = 120;

export function appendBattleLog(state, entry) {
  if (!Array.isArray(state.log)) state.log = [];
  state.logSequence = (state.logSequence || 0) + 1;
  const classIndex = Number.isInteger(state.currentClassIndex) ? state.currentClassIndex : null;
  const subject = classIndex !== null ? (state.schedule?.[classIndex] || null) : null;

  state.log.push({
    id: `battle-log-${state.logSequence}`,
    day: Number.isInteger(state.currentDay) ? state.currentDay : 1,
    totalRound: Number.isInteger(state.totalRound) ? state.totalRound : null,
    classIndex,
    subRound: Number.isInteger(state.currentSubRound) ? state.currentSubRound : null,
    subject,
    type: 'system',
    actorId: null,
    targetId: null,
    details: null,
    ...entry,
  });

  if (state.log.length > MAX_BATTLE_LOG_ENTRIES) {
    state.log.splice(0, state.log.length - MAX_BATTLE_LOG_ENTRIES);
  }
}
