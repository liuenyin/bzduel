import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, selectCard, setReady, confirmDefense, rerollDice, TURN,
} from '../server/game/engine.js';
import { rollDefense } from '../server/game/engine/defense-roll.js';
import { maximizeDieValue } from '../server/game/engine/primitives.js';
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

function resolveTarget(state, aoe) {
  let result = confirmDefense(state, 'p1', [0, 1, 2]);
  if (aoe) {
    result = confirmDefense(state, 'p2', [0, 1, 2]);
    assert.equal(result.ok, true);
    return result.aoeResults.find(target => target.playerId === 'p1');
  }
  assert.equal(result.ok, true);
  return result;
}

for (const aoe of [false, true]) {
  const mode = aoe ? 'AoE' : 'single';
  test(`permanent reduction determines no-damage rewards (${mode})`, () => {
    const state = defenseState(aoe);
    const [atk, def] = state.players;
    state.schedule[0] = 'chemistry';
    state.turnData.atkResult.finalAtk = 12;
    def.invertReduction = 3;
    def.tp = 0;
    def.playedTurnCards = [{ id: 'card_gen_14' }];
    atk.playedTurnCards = [{ id: 'card_gen_15' }];
    atk.activeBlessings = [{ id: 'card_che_1' }];
    atk.handCards = [];
    const result = resolveTarget(state, aoe);
    assert.equal(result.damage, 0);
    assert.equal(def.hp, 40);
    assert.equal(def.tp, 2);
    assert.equal(def.redHeat || 0, 0);
    assert.equal(atk.handCards.length, aoe ? 1 : 0);
  });

  test(`overflow healing combines biology and mama with HP cap (${mode})`, () => {
    const state = defenseState(aoe);
    const def = state.players[1];
    def.hp = 20;
    def.card.subjects = ['chinese'];
    def.card.positiveSkill = { id: SKILL.MAMA_HEAL };
    def.playedTurnCards = [{ id: 'card_bio_2' }];
    resolveTarget(state, aoe);
    assert.equal(def.hp, 30); // floor(3 * 1.5) + 3 * 2
  });

  test(`commander recruits even when an attack ignores defense (${mode})`, () => {
    const state = defenseState(aoe);
    state.turnData.atkResult.pierce = true;
    state.players[1].card.positiveSkill = { id: SKILL.COMMANDER_RECRUIT };
    resolveTarget(state, aoe);
    assert.equal(state.players[1].card.dicePool.length, 4);
  });

  test(`math ignores reduction but retains dice defense (${mode})`, () => {
    const state = defenseState(aoe);
    const [atk, def] = state.players;
    state.turnData.atkResult.finalAtk = 19;
    atk.playedTurnCards = [{ id: 'card_mat_3' }];
    def.playedTurnCards = [{ id: 'card_gen_05' }];
    def.invertReduction = 5;
    def.card.subjects = ['chinese'];
    def.card.positiveSkill = { id: SKILL.TALENTED };
    assert.equal(resolveTarget(state, aoe).damage, 10);
  });

  test(`politics caps opposing final damage after vulnerability (${mode})`, () => {
    const state = defenseState(aoe);
    state.turnData.atkResult.finalAtk = 30;
    state.players[1].playedTurnCards = [{ id: 'card_pol_3' }];
    state.players[1].card.neutralSkill = { id: SKILL.VULNERABLE };
    assert.equal(resolveTarget(state, aoe).damage, 8);
    const ownCard = defenseState(aoe);
    ownCard.turnData.atkResult.finalAtk = 30;
    ownCard.players[0].playedTurnCards = [{ id: 'card_pol_3' }];
    assert.equal(resolveTarget(ownCard, aoe).damage, 21);
  });

  test(`fixed true damage survives defense and reductions (${mode})`, () => {
    const state = defenseState(aoe);
    state.players[0].playedTurnCards = [{ id: 'card_phy_2' }];
    state.players[1].invertReduction = 20;
    state.players[1].card.positiveSkill = { id: SKILL.TALENTED };
    state.players[1].card.subjects = ['chinese'];
    assert.equal(resolveTarget(state, aoe).damage, 3);
  });

  test(`information ignores defense and subtracts five final damage (${mode})`, () => {
    const state = defenseState(aoe);
    state.players[0].playedTurnCards = [{ id: 'card_it_3' }];
    assert.equal(resolveTarget(state, aoe).damage, 1);
  });

  test(`dream clone grants no-damage reward and suppresses hit rewards (${mode})`, () => {
    const state = defenseState(aoe);
    const [atk, def] = state.players;
    state.turnData.atkResult.finalAtk = 20;
    def.card.positiveSkill = { id: SKILL.DREAM_KING };
    Object.assign(def, { inDreamState: true, dreamTargetChoice: 1, realTargetIdx: 0, tp: 0 });
    def.playedTurnCards = [{ id: 'card_gen_14' }];
    atk.playedTurnCards = [{ id: 'card_gen_15' }];
    atk.handCards = [];
    assert.equal(resolveTarget(state, aoe).damage, 0);
    assert.equal(def.tp, 2);
    // Other AoE targets may still grant the attacker's one draw.
    if (!aoe) assert.equal(atk.handCards.length, 0);
  });

  test(`self stickers explode for 35 percent of remaining HP (${mode})`, () => {
    const state = defenseState(aoe);
    const def = state.players[1];
    state.turnData.atkResult.finalAtk = 17;
    def.card.negativeSkill = { id: SKILL.STICKER_SELF };
    def.selfStickers = 1;
    resolveTarget(state, aoe);
    assert.equal(def.hp, 21); // 40 - 8 - floor(32 * 0.35)
    assert.equal(def.selfStickers, 0);
    assert.equal(def.redHeat, 3);
  });

  test(`successful hit draws only a subject card, once (${mode})`, () => {
    const state = defenseState(aoe);
    state.turnData.atkResult.finalAtk = 40;
    state.players[0].playedTurnCards = [{ id: 'card_gen_15' }];
    state.players[0].handCards = [];
    resolveTarget(state, aoe);
    assert.equal(state.players[0].handCards.length, 1);
    assert.notEqual(state.players[0].handCards[0].subject, 'universal');
  });

  test(`star showoff multiplies final damage after defense (${mode})`, () => {
    const state = defenseState(aoe);
    const atk = state.players[0];
    atk.card.subjects = ['chinese'];
    atk.card.positiveSkill = { id: SKILL.STAR_SHOWOFF };
    state.turnData.atkResult.finalAtk = 20;
    assert.equal(resolveTarget(state, aoe).damage, 27);
  });

  if (aoe) test('AoE secondary target scales the finished damage, not attack before defense', () => {
    const state = defenseState(true);
    state.players[0].card.subjects = ['chinese'];
    state.turnData.atkResult.finalAtk = 20;
    assert.equal(confirmDefense(state, 'p1', [0, 1, 2]).waitingForOthers, true);
    const result = confirmDefense(state, 'p2', [0, 1, 2]);
    assert.equal(result.ok, true);
    assert.equal(result.aoeResults.find(target => target.playerId === 'p2').damage, 7);
  });
}

test('FFA reroll lock reads the actual attacker, not an unrelated living player', () => {
  const state = defenseState(true);
  state.turnData.attackerIdx = 2;
  state.turnData.defenderIdx = 1;
  state.players[1].rerolls = 2;
  state.players[0].playedTurnCards = [{ id: 'card_gen_09' }];
  assert.equal(rerollDice(state, 'p1', [0]).ok, true);
  state.players[2].playedTurnCards = [{ id: 'card_gen_09' }];
  assert.equal(rerollDice(state, 'p1', [0]).ok, false);
  assert.equal(state.players[1].rerolls, 1);
});

test('AoE initial defense grants mama reroll and maximizes the smallest invert die', () => {
  const state = defenseState(true);
  state.players[0].card.positiveSkill = { id: SKILL.RAPPER };
  state.players[1].card.positiveSkill = { id: SKILL.MAMA_HEAL };
  state.players[1].rerolls = 0;
  state.players[2].card.positiveSkill = { id: SKILL.INVERT_DIE };
  const result = rollDefense(state, state.players[0], state.players[1]);
  assert.equal(result.ok, true);
  assert.equal(state.players[1].rerolls, 1);
  assert.ok(state.turnData.aoeDefenses.p2.rolls.includes(6));
  assert.equal(maximizeDieValue(3, 8), 8);
});
