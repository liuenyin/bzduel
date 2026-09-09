import test from 'node:test';
import assert from 'node:assert/strict';

import { autoResolveMatch } from '../server/game/auto-combat.js';
import {
  calculateSupportBuffs,
  confirmInvestment,
  createRun,
  getRunView,
  processBattleResult,
} from '../server/game/autobattler.js';
import { AC_CHAR_MAP } from '../shared/autochess-config.js';

function makeFighter(overrides = {}) {
  return {
    id: 'fighter',
    name: '测试角色',
    hp: 100,
    dicePool: [6],
    atkSlots: 1,
    defSlots: 1,
    coreSkills: { positive: null, negative: null },
    ...overrides,
  };
}

function withRandom(sequence, callback, fallback = 0.999999) {
  const originalRandom = Math.random;
  let index = 0;
  Math.random = () => sequence[index++] ?? fallback;
  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

test('unlimited attack slots keep every rolled die', () => {
  const result = withRandom([], () => autoResolveMatch(
    makeFighter({ id: 'all-dice', dicePool: [4, 6, 8], atkSlots: -1 }),
    makeFighter({ id: 'target', hp: 1, dicePool: [1] }),
  ));

  assert.equal(result.log[0].atkKept.length, 3);
  assert.deepEqual(result.log[0].atkKept, result.log[0].atkRolls);
});

test('combat log IDs remain unique when both fighters share a character ID', () => {
  const result = withRandom([], () => autoResolveMatch(
    makeFighter({ id: 'same-character' }),
    makeFighter({ id: 'same-character', hp: 1, dicePool: [1] }),
  ));

  assert.equal(result.log[0].attackerId, 'p1:same-character');
  assert.equal(result.log[0].defenderId, 'p2:same-character');
  assert.notEqual(result.log[0].attackerId, result.log[0].defenderId);
});

test('reroll-all fighters reroll the complete dice pool', () => {
  const result = withRandom([0, 0.25, 0.5, 0.75], () => autoResolveMatch(
    makeFighter({ id: 'reroll-all', hp: 20, dicePool: [4, 4], atkSlots: 2, rerollAll: true }),
    makeFighter({ id: 'target', hp: 1, dicePool: [1] }),
  ), 0);

  assert.deepEqual(result.log[0].atkRolls, [3, 4]);
  assert.deepEqual(result.log[0].atkKept, [3, 4]);
});

test('autochess config preserves Wang Hedi reroll-all behavior', () => {
  assert.equal(AC_CHAR_MAP.char_4.rerollAll, true);
});

test('per-round attack chance is retained for combat instead of rolled during setup', () => {
  const run = withRandom([], () => createRun('player', '测试'));
  run.planeEnvironments[run.currentPlane] = 'physics';
  run.board.hexSlots.physics = { charId: 'char_10', star: 1 };

  const originalRandom = Math.random;
  Math.random = () => { throw new Error('support setup must not roll per-round effects'); };
  try {
    const buffs = calculateSupportBuffs(run);
    assert.deepEqual(buffs.flatAtkChance.sources, [{ chance: 0.5, value: 3 }]);
  } finally {
    Math.random = originalRandom;
  }
});

test('invert-die uses face + 1 - old value after every roll', () => {
  const result = withRandom([0.125, 0.25, 0.375], () => autoResolveMatch(
    makeFighter({
      id: 'invert',
      hp: 20,
      dicePool: [8],
      coreSkills: { positive: { id: 'invert_die' }, negative: null },
    }),
    makeFighter({ id: 'target', hp: 1, dicePool: [1] }),
  ), 0);

  assert.deepEqual(result.log[0].atkRolls, [5]);
});

test('nine lives revives only once and upgrades the fighter dice to D10', () => {
  const result = withRandom([], () => autoResolveMatch(
    makeFighter({
      id: 'cat',
      hp: 10,
      dicePool: [1],
      coreSkills: { positive: { id: 'nine_lives' }, negative: null },
    }),
    makeFighter({ id: 'executioner', hp: 100, dicePool: [20] }),
  ));

  assert.equal(result.log.filter(entry => entry.nineLivesP1).length, 1);
  const attackAfterRevival = result.log.find(entry => entry.attackerSide === 'p1' && entry.round > 2);
  assert.deepEqual(attackAfterRevival.atkRolls, [10]);
  assert.equal(result.winner, 2);
});

test('Mama mercy fixes damage at one against a target below twenty percent HP', () => {
  const result = withRandom([], () => autoResolveMatch(
    makeFighter({
      id: 'mama',
      hp: 30,
      dicePool: [10],
      coreSkills: { positive: null, negative: { id: 'mama_neg' } },
    }),
    makeFighter({ id: 'target', hp: 10, dicePool: [1] }),
  ));

  const mercyEntry = result.log.find(entry => entry.mamaMercy);
  assert.ok(mercyEntry);
  assert.equal(mercyEntry.damage, 1);
});

test('defense reroll penalty persists and accumulates during combat', () => {
  const result = withRandom([], () => autoResolveMatch(
    makeFighter({ id: 'attacker', hp: 20, dicePool: [6] }),
    makeFighter({
      id: 'tired-defender',
      hp: 20,
      dicePool: [4],
      coreSkills: { positive: { id: 'mama' }, negative: { id: 'reroll_penalty' } },
    }),
  ));

  const defenses = result.log.filter(entry => entry.defenderSide === 'p2');
  assert.ok(defenses.length >= 2);
  assert.equal(defenses[0].defenderRerolled, true);
  assert.equal(defenses[0].defTotal, 2);
  assert.equal(defenses[1].defTotal, 0);
});

test('Royal Etiquette self-KO stops the round before damage resolution', () => {
  const result = withRandom([], () => autoResolveMatch(
    makeFighter({
      id: 'royal',
      hp: 1,
      dicePool: [6],
      coreSkills: { positive: null, negative: { id: 'royal_etiquette' } },
    }),
    makeFighter({ id: 'target', hp: 20, dicePool: [6] }),
  ), 0);

  assert.equal(result.rounds, 1);
  assert.equal(result.winner, 2);
  assert.equal(result.finalHP.p2, 20);
  assert.equal(result.log[0].selfKill, 'p1');
  assert.equal(result.log[0].damage, undefined);
});

test('getRunView returns detached data and never exposes the character pool', () => {
  const run = withRandom([], () => createRun('player', '测试'));
  run.board.hexSlots.physics = { charId: 'char_6', star: 1 };
  run.investmentBuffs.push({ id: 'bargain', value: 1 });
  const view = getRunView(run);

  assert.equal(Object.hasOwn(view, 'pool'), false);
  view.board.hexSlots.physics.star = 3;
  view.investmentBuffs[0].value = 99;
  view.shop.length = 0;

  assert.equal(run.board.hexSlots.physics.star, 1);
  assert.equal(run.investmentBuffs[0].value, 1);
  assert.notEqual(run.shop.length, 0);
});

test('investment confirmation rejects forged options without mutating the run', () => {
  const run = withRandom([], () => createRun('player', '测试'));
  run.phase = 'event_choosing';
  run._eventOptions = [
    { id: 'bargain', name: '砍价高手', value: 1 },
    { id: 'lucky_dice', name: '幸运骰', value: 1 },
  ];

  const forged = confirmInvestment(run, 'forged', [{ id: 'forged' }]);
  assert.equal(forged.ok, false);
  assert.equal(forged.error, 'invalid_choice');
  assert.equal(run.phase, 'event_choosing');
  assert.deepEqual(run.investmentBuffs, []);
  assert.equal(run._eventOptions.length, 2);
});

test('a duplicate combat result cannot advance an autochess run twice', () => {
  const run = withRandom([], () => createRun('player', '测试'));
  run.phase = 'manual_combat';

  const first = processBattleResult(run, true, 5);
  const phaseAfterFirst = run.phase;
  const nodeAfterFirst = run.currentNode;
  const second = processBattleResult(run, true, 5);

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.error, 'invalid_phase');
  assert.equal(run.phase, phaseAfterFirst);
  assert.equal(run.currentNode, nodeAfterFirst);
  assert.equal(run.stats.roundsPlayed, 1);
  assert.equal(run.stats.totalDamage, 5);
});
