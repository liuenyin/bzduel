import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TURN,
  buyWater,
  confirmAttack,
  confirmDefense,
  createGame,
  getAttackConfirmationView,
  getStateView,
  playTacticalCard,
  rerollDice,
  rollAttack,
  selectCard,
  selectTarget,
  setReady,
} from '../server/game/engine.js';
import { cardMap } from '../shared/cards.js';
import { GAME_MODE, IDENTITY } from '../shared/rules.js';

function createBattle(firstCard = 'char_6', secondCard = 'char_6') {
  const game = createGame([
    { id: 'player-a', nickname: 'A' },
    { id: 'player-b', nickname: 'B' },
  ]);

  assert.equal(selectCard(game, 'player-a', firstCard).ok, true);
  assert.equal(selectCard(game, 'player-b', secondCard).ok, true);
  assert.equal(setReady(game, 'player-a').battleStarted, false);
  assert.equal(setReady(game, 'player-b').battleStarted, true);
  return game;
}

function createFfaBattle(cardIds = ['char_6', 'char_6', 'char_6']) {
  const players = cardIds.map((_, index) => ({
    id: `ffa-player-${index}`,
    nickname: `FFA ${index + 1}`,
  }));
  const game = createGame(players, GAME_MODE.MODE_FFA);

  players.forEach((player, index) => {
    assert.equal(selectCard(game, player.id, cardIds[index]).ok, true);
    const readyResult = setReady(game, player.id);
    assert.equal(readyResult.ok, true);
    assert.equal(readyResult.battleStarted, index === players.length - 1);
  });

  return game;
}

function withRandom(value, callback) {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

function distinctIndices(count) {
  return Array.from({ length: count }, (_, index) => index);
}

function forceTurn(game, attackerIdx, defenderIdx) {
  game.phase = 'battle';
  game.turnPhase = TURN.WAITING_ATK;
  game.turnData = {
    attackerIdx,
    defenderIdx,
    attackRolls: null,
    defenseRolls: null,
    hasAttackerRerolled: false,
    hasDefenderRerolled: false,
  };
}

function completeCurrentTurn(game, { attackRandom = 0.999999, defenseRollValue = 1 } = {}) {
  const attacker = game.players[game.turnData.attackerIdx];
  const defender = game.players[game.turnData.defenderIdx];
  withRandom(attackRandom, () => rollAttack(game));
  const attackSlots = attacker.card.atkSlots === -1 ? game.turnData.attackRolls.length : attacker.card.atkSlots;
  assert.equal(confirmAttack(game, distinctIndices(attackSlots)).ok, true);
  game.turnData.defenseRolls = game.turnData.defenseRolls.map(() => defenseRollValue);
  return confirmDefense(game, defender.id, distinctIndices(defender.card.defSlots));
}

test('ready can only transition a game from preparation to battle once', () => {
  const game = createBattle();
  game.currentClassIndex = 4;
  game.currentSubRound = 1;
  game.totalRound = 9;

  const result = setReady(game, 'player-a');

  assert.deepEqual(result, { ok: false, error: 'invalid_phase' });
  assert.equal(game.currentClassIndex, 4);
  assert.equal(game.currentSubRound, 1);
  assert.equal(game.totalRound, 9);
});

test('attack confirmation rejects duplicate and out-of-range dice indices', () => {
  for (const invalidIndices of [[0, 0, 0], [999, 999, 999], [0, 1, 1.5]]) {
    const game = createBattle();
    withRandom(0.999999, () => rollAttack(game));

    const result = confirmAttack(game, invalidIndices);

    assert.equal(result.ok, false);
    assert.equal(result.error, 'invalid_slots');
    assert.equal(game.turnPhase, TURN.ATK_ROLLED);
    assert.equal(game.turnData.atkResult, undefined);
  }
});

test('defense confirmation rejects duplicate and out-of-range dice indices', () => {
  for (const invalidFactory of [
    count => Array(count).fill(0),
    count => Array(count).fill(999),
  ]) {
    const game = createBattle();
    withRandom(0.999999, () => rollAttack(game));
    const attackSlots = game.players[0].card.atkSlots;
    assert.equal(confirmAttack(game, distinctIndices(attackSlots)).ok, true);

    const defenseSlots = game.players[1].card.defSlots;
    const result = confirmDefense(game, 'player-b', invalidFactory(defenseSlots));

    assert.equal(result.ok, false);
    assert.equal(result.error, 'invalid_slots');
    assert.equal(game.turnPhase, TURN.DEF_ROLLED);
  }
});

test('reroll rejects duplicate indices without consuming a reroll', () => {
  const game = createBattle();
  withRandom(0.5, () => rollAttack(game));
  const beforeRolls = [...game.turnData.attackRolls];
  const beforeRerolls = game.players[0].rerolls;

  const result = rerollDice(game, 'player-a', [0, 0]);

  assert.equal(result.ok, false);
  assert.equal(result.error, 'invalid_indices');
  assert.deepEqual(game.turnData.attackRolls, beforeRolls);
  assert.equal(game.players[0].rerolls, beforeRerolls);
});

test('geography debuff reduces the opponent attack and defense dice faces', () => {
  const attackGame = createBattle();
  attackGame.schedule[0] = 'geography';
  attackGame.players[1].handCards = [cardMap.card_geo_3];
  assert.equal(playTacticalCard(attackGame, 'player-b', 'card_geo_3').ok, true);

  const originalAttackPool = [...attackGame.players[0].card.dicePool];
  const expectedAttackPool = originalAttackPool.map(face => Math.max(4, face - 2));
  const attackResult = withRandom(0.999999, () => rollAttack(attackGame));
  assert.deepEqual(attackResult.rolls, expectedAttackPool);
  assert.deepEqual(getStateView(attackGame, 'player-a').me.effectiveDicePool, expectedAttackPool);

  const defenseGame = createBattle();
  defenseGame.schedule[0] = 'geography';
  defenseGame.players[0].handCards = [cardMap.card_geo_3];
  assert.equal(playTacticalCard(defenseGame, 'player-a', 'card_geo_3').ok, true);
  withRandom(0.999999, () => rollAttack(defenseGame));

  const attackSlots = defenseGame.players[0].card.atkSlots;
  const confirmResult = withRandom(0.999999, () => confirmAttack(defenseGame, distinctIndices(attackSlots)));
  const originalDefensePool = defenseGame.players[1].card.dicePool;
  assert.deepEqual(confirmResult.defenseRolls, originalDefensePool.map(face => Math.max(4, face - 2)));
});

test('tactical effects and their structured log are exposed in the state view', () => {
  const game = createBattle();
  game.schedule[0] = 'geography';
  game.players[0].handCards = [cardMap.card_geo_3];

  assert.equal(playTacticalCard(game, 'player-a', 'card_geo_3').ok, true);

  const view = getStateView(game, 'player-a');
  assert.equal(view.me.playedTurnCards.some(card => card.id === 'card_geo_3'), true);
  const tacticalLog = view.log.at(-1);
  assert.equal(tacticalLog.type, 'tactical');
  assert.equal(tacticalLog.actorId, 'player-a');
  assert.equal(tacticalLog.subject, 'geography');
  assert.equal(tacticalLog.details.cardId, 'card_geo_3');
});

test('a completed turn is retained as a structured reconnect-safe battle log', () => {
  const game = createBattle();
  withRandom(0.999999, () => rollAttack(game));
  assert.equal(confirmAttack(game, distinctIndices(game.players[0].card.atkSlots)).ok, true);

  const result = confirmDefense(game, 'player-b', distinctIndices(game.players[1].card.defSlots));
  assert.equal(result.ok, true);

  const view = getStateView(game, 'player-b');
  const turnLog = view.log.find(entry => entry.type === 'turn');
  assert.ok(turnLog);
  assert.equal(turnLog.totalRound, 1);
  assert.equal(turnLog.classIndex, 0);
  assert.equal(turnLog.subRound, 0);
  assert.equal(turnLog.actorId, 'player-a');
  assert.equal(turnLog.targetId, 'player-b');
  assert.equal(turnLog.details.damage, result.damage);
  assert.equal(Object.hasOwn(turnLog.details, 'attackRolls'), false);
  assert.equal(Object.hasOwn(turnLog.details, 'defenseRolls'), false);
});

test('elephant condemn seals skills and guarantees one lgpy attack before restoration', () => {
  const game = createBattle('char_fxr', 'char_6');
  game.players[1].hp = 4;

  const firstResult = completeCurrentTurn(game, { attackRandom: 0, defenseRollValue: 20 });
  assert.equal(firstResult.ok, true);
  assert.equal(game.players[0].skillsSealed, true);
  assert.equal(game.players[1].skillsSealed, true);
  assert.equal(game.players[1].lgpyForm, true);
  assert.equal(game.players[1].card.positiveSkill, null);
  assert.equal(game.players[1].card.negativeSkill, null);
  assert.deepEqual(getStateView(game, 'player-b').me.effectiveDicePool, [7, 9, 9, 9, 11]);

  const secondResult = completeCurrentTurn(game, { attackRandom: 0, defenseRollValue: 20 });
  assert.equal(secondResult.ok, true);
  assert.equal(game.players[1].lgpyForm, false);
  assert.equal(game.players[1].skillsSealed, false);
  assert.equal(game.players[1].card.positiveSkill.id, 'talented');
  assert.equal(game.players[1].card.negativeSkill.id, 'hjc_neg');
  assert.equal(game.players[0].skillsSealed, true);
});

test('extra turns clear one-turn tactical cards and stealth before the bonus attack', () => {
  const game = createBattle();
  game.players[0].playedTurnCard = cardMap.card_gen_12;
  game.players[0].playedTurnCards = [cardMap.card_gen_12];
  game.players[0].stealthActive = true;
  game.extraTurnQueue = [{ attackerId: 'player-a', targetId: 'player-b' }];

  assert.equal(completeCurrentTurn(game, { defenseRollValue: 20 }).ok, true);
  assert.equal(game.turnData.isExtraTurn, true);
  assert.deepEqual(game.players[0].playedTurnCards, []);
  assert.equal(game.players[0].playedTurnCard, null);
  assert.equal(game.players[0].stealthActive, false);
});

test('subject blessings are discarded when their class finishes', () => {
  const game = createBattle();
  const completedSubject = game.schedule[0];
  game.currentSubRound = 1;
  game.players[0].activeBlessings = [{ id: 'test-blessing', subject: completedSubject }];

  assert.equal(completeCurrentTurn(game, { defenseRollValue: 20 }).ok, true);
  assert.equal(game.currentClassIndex, 1);
  assert.deepEqual(game.players[0].activeBlessings, []);
});

test('a surviving 1v1 continues into a new six-class day', () => {
  const game = createBattle();
  game.players.forEach(player => {
    player.hp = 999;
    player.maxHp = 999;
  });
  const firstSchedule = [...game.schedule];
  let result = null;

  for (let turn = 0; turn < 11; turn++) {
    result = completeCurrentTurn(game, { attackRandom: 0.5, defenseRollValue: 100 });
    assert.equal(result.gameOver, false);
  }

  game.players.forEach(player => {
    player.rerolls = 0;
    player.hasReschedule = false;
  });
  result = completeCurrentTurn(game, { attackRandom: 0.5, defenseRollValue: 100 });

  assert.equal(result.gameOver, false);
  assert.equal(result.classChanged, true);
  assert.equal(result.dayChanged, true);
  assert.equal(result.currentDay, 2);
  assert.equal(game.phase, 'battle');
  assert.equal(game.currentDay, 2);
  assert.equal(game.currentClassIndex, 0);
  assert.equal(game.currentSubRound, 0);
  assert.equal(game.schedule.length, firstSchedule.length);
  assert.equal(game.players.every(player => player.rerolls === 3), true);
  assert.equal(game.players.every(player => player.hasReschedule), true);
  assert.equal(game.draftShop?.active, true);

  const view = getStateView(game, 'player-a');
  assert.equal(view.currentDay, 2);
  assert.equal(view.log.at(-1).day, 2);
  assert.match(view.log.at(-1).text, /第 2 天开始/);
});

test('nine lives revives once and upgrades the restored dice pool', () => {
  const game = createBattle('char_6', 'char_16');
  game.players[1].hp = 1;

  const result = completeCurrentTurn(game, { attackRandom: 0.999999, defenseRollValue: 0 });
  assert.equal(result.ok, true);
  assert.equal(game.players[1].hp, 9);
  assert.equal(game.players[1].nineLivesUsed, true);
  assert.deepEqual(game.players[1].card.dicePool, [10, 10, 10, 10]);
});

test('red heat damages its owner at the start of their next attack', () => {
  const game = createBattle('char_7', 'char_6');
  assert.equal(completeCurrentTurn(game, { attackRandom: 0.999999, defenseRollValue: 0 }).ok, true);
  const heatBefore = game.players[1].redHeat;
  const hpBefore = game.players[1].hp;
  assert.ok(heatBefore > 0);

  assert.equal(rollAttack(game).ok, true);
  assert.equal(game.players[1].hp, Math.max(0, hpBefore - heatBefore));
  assert.equal(game.players[1].redHeat, heatBefore - 1);
});

test('lethal red heat ends the game before attack dice are rolled', () => {
  const game = createBattle();
  const attacker = game.players[game.turnData.attackerIdx];
  attacker.hp = 2;
  attacker.redHeat = 3;

  const result = rollAttack(game);

  assert.equal(result.ok, true);
  assert.equal(result.selfKill, true);
  assert.equal(result.gameOver, true);
  assert.equal(result.deathCause, 'red_heat');
  assert.equal(result.winner, game.turnData.defenderIdx);
  assert.equal(attacker.hp, 0);
  assert.equal(attacker.isDead, true);
  assert.equal(game.phase, 'game_over');
  assert.equal(game.endReason, 'red_heat');
  assert.match(game.log.at(-1).text, /红温.*倒下/);
});

test('playing a tactical card does not spend TP', () => {
  const game = createBattle();
  game.players[0].tp = 3;
  game.players[0].handCards = [cardMap.card_gen_12];

  const result = playTacticalCard(game, 'player-a', 'card_gen_12');

  assert.equal(result.ok, true);
  assert.equal(game.players[0].tp, 3);
  assert.equal(game.players[0].handCards.length, 0);
});

test('a lethal tactical red-heat detonation settles the game immediately', () => {
  const game = createBattle();
  game.schedule[game.currentClassIndex] = 'chemistry';
  game.players[0].handCards = [cardMap.card_che_3];
  game.players[1].hp = 2;
  game.players[1].redHeat = 3;

  const result = playTacticalCard(game, 'player-a', 'card_che_3');

  assert.equal(result.ok, true);
  assert.equal(result.gameOver, true);
  assert.equal(result.winner, 0);
  assert.equal(result.deathCause, 'tactical_card');
  assert.deepEqual(result.defeatedIds, ['player-b']);
  assert.equal(game.players[1].hp, 0);
  assert.equal(game.players[1].isDead, true);
  assert.equal(game.phase, 'game_over');
  assert.equal(game.endReason, 'tactical_card');
});

test('nine lives revives from lethal tactical-card damage before game-over settlement', () => {
  const game = createBattle('char_6', 'char_16');
  game.schedule[game.currentClassIndex] = 'chemistry';
  game.players[0].handCards = [cardMap.card_che_3];
  game.players[1].hp = 2;
  game.players[1].redHeat = 3;

  const result = playTacticalCard(game, 'player-a', 'card_che_3');

  assert.equal(result.ok, true);
  assert.equal(result.gameOver, false);
  assert.equal(result.nineLivesTriggered, true);
  assert.equal(game.players[1].hp, 9);
  assert.equal(game.players[1].isDead, false);
  assert.equal(game.players[1].nineLivesUsed, true);
  assert.deepEqual(game.players[1].card.dicePool, [10, 10, 10, 10]);
  assert.equal(game.phase, 'battle');
});

test('lethal reroll self-damage returns a complete game-over result', () => {
  const game = createBattle('char_19', 'char_6');
  const attacker = game.players[0];
  attacker.hp = 1;
  withRandom(0.999999, () => rollAttack(game));

  const result = withRandom(0, () => rerollDice(game, 'player-a', [0]));

  assert.equal(result.ok, true);
  assert.equal(result.selfKill, true);
  assert.equal(result.gameOver, true);
  assert.equal(result.winner, 1);
  assert.equal(result.deathCause, 'dice_self_damage');
  assert.equal(attacker.isDead, true);
  assert.equal(game.phase, 'game_over');
});

test('lethal automatic defense-roll self-damage settles before defense selection', () => {
  const game = createBattle('char_6', 'char_19');
  const defender = game.players[1];
  defender.hp = 1;
  withRandom(0.999999, () => rollAttack(game));

  const result = withRandom(0, () => confirmAttack(
    game,
    distinctIndices(game.players[0].card.atkSlots),
  ));

  assert.equal(result.ok, true);
  assert.equal(result.selfKill, true);
  assert.equal(result.gameOver, true);
  assert.equal(result.winner, 0);
  assert.equal(result.deathCause, 'dice_self_damage');
  assert.equal(defender.isDead, true);
  assert.equal(game.phase, 'game_over');
});

test('FFA self-damage eliminates one attacker and advances without ending the match', () => {
  const game = createFfaBattle(['char_19', 'char_6', 'char_6']);
  game.players[0].identity = IDENTITY.REBEL;
  game.players[1].identity = IDENTITY.LORD;
  game.players[2].identity = IDENTITY.SPY;
  game.players[0].hp = 1;
  assert.equal(selectTarget(game, game.players[0].id, game.players[1].id).ok, true);

  const result = withRandom(0, () => rollAttack(game));

  assert.equal(result.ok, true);
  assert.equal(result.selfKill, true);
  assert.equal(result.gameOver, false);
  assert.equal(result.deathCause, 'dice_self_damage');
  assert.equal(game.players[0].isDead, true);
  assert.equal(game.phase, 'battle');
  assert.equal(game.turnPhase, TURN.CHOOSE_TARGET);
  assert.equal(game.players[game.turnData.attackerIdx].id, game.players[1].id);
});

test('lethal FFA AoE defense-roll self-damage settles before defense selection', () => {
  const game = createFfaBattle(['char_13', 'char_19', 'char_6']);
  game.players[0].identity = IDENTITY.REBEL;
  game.players[1].identity = IDENTITY.LORD;
  game.players[2].identity = IDENTITY.SPY;
  game.players[1].hp = 1;
  assert.equal(selectTarget(game, game.players[0].id, game.players[1].id).ok, true);
  withRandom(0.999999, () => rollAttack(game));

  const result = withRandom(0, () => confirmAttack(game, [0, 1, 2]));

  assert.equal(result.ok, true);
  assert.equal(result.selfKill, true);
  assert.equal(result.gameOver, true);
  assert.equal(result.winner, IDENTITY.REBEL);
  assert.equal(result.deathCause, 'dice_self_damage');
  assert.deepEqual(result.defeatedIds, [game.players[1].id]);
  assert.equal(game.players[1].isDead, true);
  assert.equal(game.phase, 'game_over');
});

test('buy water stores charge and consumes it on the next normal attack', () => {
  const game = createBattle('char_14', 'char_6');
  withRandom(0.5, () => rollAttack(game));
  const waterResult = buyWater(game, 'player-a');
  assert.equal(waterResult.ok, true);
  assert.equal(game.players[0].chargeStacks, 1);

  forceTurn(game, 0, 1);
  const rollResult = withRandom(0.5, () => rollAttack(game));
  assert.equal(rollResult.ok, true);
  assert.equal(game.players[0].chargeStacks, 1);
  assert.equal(confirmAttack(game, distinctIndices(game.players[0].card.atkSlots)).ok, true);
  assert.equal(game.players[0].chargeStacks, 0);
  assert.equal(game.turnData.chargeConsumed, 1);
});

test('stealth tactical cards hide rolls from opponents and expire after the turn', () => {
  const game = createBattle();
  game.players[0].handCards = [cardMap.card_gen_12];
  assert.equal(playTacticalCard(game, 'player-a', 'card_gen_12').ok, true);
  withRandom(0.75, () => rollAttack(game));

  const ownerView = getStateView(game, 'player-a');
  const opponentView = getStateView(game, 'player-b');
  assert.notDeepEqual(ownerView.attackRolls, ownerView.attackRolls.map(() => -1));
  assert.deepEqual(opponentView.attackRolls, opponentView.attackRolls.map(() => -1));

  const attackSlots = game.players[0].card.atkSlots;
  assert.equal(confirmAttack(game, distinctIndices(attackSlots)).ok, true);
  assert.equal(getStateView(game, 'player-b').atkResult.finalAtk, '??');
  assert.equal(getAttackConfirmationView(game, 'player-b').atkResult.finalAtk, '??');

  const defenseSlots = game.players[1].card.defSlots;
  assert.equal(confirmDefense(game, 'player-b', distinctIndices(defenseSlots)).ok, true);
  assert.equal(game.players[0].stealthActive, false);
});

test('stealth masks defense dice in attack confirmation events', () => {
  const game = createBattle();
  game.players[1].handCards = [cardMap.card_gen_12];
  assert.equal(playTacticalCard(game, 'player-b', 'card_gen_12').ok, true);
  withRandom(0.75, () => rollAttack(game));
  assert.equal(confirmAttack(game, distinctIndices(game.players[0].card.atkSlots)).ok, true);

  const attackerView = getAttackConfirmationView(game, 'player-a');
  const defenderView = getAttackConfirmationView(game, 'player-b');
  assert.deepEqual(attackerView.defenseRolls, attackerView.defenseRolls.map(() => -1));
  assert.notDeepEqual(defenderView.defenseRolls, defenderView.defenseRolls.map(() => -1));
});
