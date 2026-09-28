import test from 'node:test';
import assert from 'node:assert/strict';
import { createLifecycle } from '../src/utils/lifecycle.js';
import { getTacticalCardUsability } from '../src/pages/battle/tactical.js';
import { cardMap } from '../shared/cards.js';

test('disposing a page cancels pending and nested UI work', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const scope = createLifecycle();
  let calls = 0;
  scope.delay(() => {
    calls++;
    scope.delay(() => calls++, 100);
  }, 10);
  context.mock.timers.tick(10);
  assert.equal(calls, 1);
  scope.dispose();
  scope.delay(() => calls++, 1);
  context.mock.timers.tick(1000);
  assert.equal(calls, 1);
});

test('FFA spectators and confirmed AoE defenders see cards as unavailable', () => {
  const state = {
    phase: 'battle', schedule: ['chinese'], currentClassIndex: 0,
    me: { id: 'c', hp: 5, maxHp: 10 }, myIndex: 2,
    attackerIdx: 0, defenderIdx: 1,
  };
  assert.equal(getTacticalCardUsability(cardMap.card_gen_03, state).canPlay, false);
  state.aoeDefenses = { c: { confirmed: false } };
  assert.equal(getTacticalCardUsability(cardMap.card_gen_03, state).canPlay, true);
  state.aoeDefenses.c.confirmed = true;
  assert.equal(getTacticalCardUsability(cardMap.card_gen_03, state).canPlay, false);
});
