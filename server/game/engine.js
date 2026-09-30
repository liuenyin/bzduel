// Public battle API. Implementation modules never import this facade.
export { confirmDefense } from './engine/defense.js';
export { resolvePhaseEnd } from './engine/phase.js';
export { refreshDraftSlot, buyDraftCard, confirmDraftReady } from './engine/draft.js';
export { getCurrentAttackerId, getCurrentDefenderId, getStateView, getAttackConfirmationView } from './engine/state-view.js';
export { getEffectiveDicePool, getAllowedSlotCount } from './engine/dice.js';
export { generateSchedule, createGame, selectCard, setReady, useReschedule } from './engine/preparation.js';
export { TURN } from '../../shared/turn.js';
export { eliminateDisconnectedPlayer } from './engine/disconnect.js';
export { rollAttack } from './engine/attack-roll.js';
export { rerollDice } from './engine/reroll.js';
export { confirmAttack } from './engine/attack-confirm.js';
export { chooseDreamTarget, selectTarget, buyWater } from './engine/battle-actions.js';
export { playTacticalCard } from './engine/tactical-play.js';
