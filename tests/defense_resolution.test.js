import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, selectCard, setReady, confirmDefense, TURN,
} from '../server/game/engine.js';
import { SKILL } from '../shared/characters.js';
import { GAME_MODE, IDENTITY } from '../shared/rules.js';

function defenseState(aoe = false) {
  const players = Array.from({ length: aoe ? 3 : 2 }, (_, i) => ({ id: `p${i}`, nickname: `P${i}` }));
  const state = createGame(players, aoe ? GAME_MODE.MODE_FFA : GAME_MODE.MODE_1V1);
  for (const player of players) {
    selectCard(state, player.id, 'char_6');
    setReady(state, player.id);
  }
  state.schedule[0] = 'chinese';
  state.players.forEach((p, i) => {
    p.identity = [IDENTITY.LORD, IDENTITY.REBEL, IDENTITY.SPY][i];
    p.hp = p.maxHp = 40;
    p.card.positiveSkill = p.card.negativeSkill = p.card.neutralSkill = null;
    p.card.dicePool = [6, 6, 6];
    p.card.defSlots = 3;
  });
  state.turnPhase = TURN.DEF_ROLLED;
  state.turnData = {
    attackerIdx: 0, defenderIdx: 1, isAoE: aoe,
    attackRolls: [2, 2, 2], defenseRolls: [3, 3, 3],
    hasAttackerRerolled: false, hasDefenderRerolled: false,
    atkResult: { finalAtk: 6, selfDamage: 0, keptIndices: [0, 1, 2], faces: [2, 2, 2] },
  };
  if (aoe) state.turnData.aoeDefenses = {
    p1: { rolls: [3, 3, 3], confirmed: false, hasRerolled: false },
    p2: { rolls: [3, 3, 3], confirmed: false, hasRerolled: false },
  };
  return state;
}

for (const aoe of [false, true]) {
  test(`skill names survive mid-resolution sealing (${aoe ? 'AoE' : 'single'})`, () => {
    const state = defenseState(aoe);
    state.players[0].card.negativeSkill = { id: SKILL.ELEPHANT_CONDEMN, name: '小象的谴责' };
    state.players[1].hp = 1;
    state.players[1].card.negativeSkill = { id: SKILL.SLEEPY, name: '困倦' };
    state.turnData.atkResult.finalAtk = 0;
    let result = confirmDefense(state, 'p1', [0, 1, 2]);
    if (aoe) result = confirmDefense(state, 'p2', [0, 1, 2]);
    assert.equal(result.ok, true);
    assert.equal(state.players[1].skillsSealed, true);
    const targetResult = aoe ? result.aoeResults.find(p => p.playerId === 'p1') : result;
    assert.equal(targetResult.defNegName, '困倦');
    assert.equal(state.log.filter(entry => entry.type === 'turn').length, 1);
  });
}

test('AoE D10 restriction is validated before storing a confirmation', () => {
  const state = defenseState(true);
  state.players[1].card.neutralSkill = { id: SKILL.D10_LIMIT };
  state.players[1].card.dicePool = [10, 10, 6];
  state.players[1].card.defSlots = 2;
  const before = structuredClone(state);
  assert.deepEqual(confirmDefense(state, 'p1', [0, 1]), { ok: false, error: 'zww_d10_limit' });
  assert.deepEqual(state, before);
  assert.equal(confirmDefense(state, 'p1', [0, 2]).waitingForOthers, true);
});

test('AoE pending confirmations are detached, duplicate-safe, and keep the resolved attacker', () => {
  const state = defenseState(true);
  const indices = [0, 1, 2];
  const options = { sacrificeIndex: 0 };
  assert.equal(confirmDefense(state, 'p1', indices, options).waitingForOthers, true);
  indices[0] = 99;
  options.sacrificeIndex = 99;
  assert.deepEqual(state.turnData.aoeDefenses.p1.keepIndices, [0, 1, 2]);
  assert.equal(state.turnData.aoeDefenses.p1.options.sacrificeIndex, 0);
  const pending = structuredClone(state);
  assert.equal(confirmDefense(state, 'p1', [0, 1, 2]).ok, false);
  assert.deepEqual(state, pending);
  const result = confirmDefense(state, 'p2', [0, 1, 2]);
  assert.equal(result.ok, true);
  assert.equal(result.attackerIdx, 0);
  assert.notEqual(state.turnData.attackerIdx, 0);
  assert.equal(confirmDefense(state, 'p2', [0, 1, 2]).ok, false);
  assert.equal(state.log.filter(entry => entry.type === 'turn').length, 1);
});

test('lethal counterattack revives the attacker before winner determination', () => {
  const state = defenseState();
  state.players[0].hp = 1;
  state.players[0].card.positiveSkill = { id: SKILL.NINE_LIVES };
  state.players[1].card.positiveSkill = { id: SKILL.GAL_PLAYER };
  const result = confirmDefense(state, 'p1', [0, 1, 2]);
  assert.equal(result.lcCounterDamage, 3);
  assert.equal(result.nineLivesTriggered, true);
  assert.equal(result.gameOver, false);
  assert.equal(state.players[0].hp, 9);
  assert.equal(state.players[0].isDead, false);
});

test('simultaneous lethal direct and self damage settles as a draw', () => {
  const state = defenseState();
  state.players[0].hp = state.players[1].hp = 1;
  state.turnData.atkResult.finalAtk = 10;
  state.turnData.atkResult.selfDamage = 1;
  const result = confirmDefense(state, 'p1', [0, 1, 2]);
  assert.equal(result.gameOver, true);
  assert.equal(result.winner, 'draw');
});
