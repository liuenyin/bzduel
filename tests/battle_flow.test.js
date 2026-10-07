import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, selectCard, setReady, selectTarget, confirmAttack, chooseDreamTarget, rollAttack, getStateView, buyDraftCard, refreshDraftSlot, confirmDraftReady, playTacticalCard } from '../server/game/engine.js';
import { settleWinner } from '../server/game/engine/outcome.js';
import { calculateDamageSteps, finalizeDamageExplanation } from '../server/game/engine/damage.js';
import { getTacticalCardUsability, getRerollTargetChoices } from '../src/pages/battle/tactical.js';
import { phasePrompt } from '../src/pages/battle/presentation.js';
import { canChooseDreamTarget } from '../src/pages/battle/dream.js';
import { logEntryHTML } from '../src/pages/battle/log.js';
import { cardMap } from '../shared/cards.js';

function battle() {
  const state = createGame(['a', 'b', 'c'].map(id => ({ id, nickname: id })), 'sanguosha');
  for (const p of state.players) { selectCard(state, p.id, 'char_13'); setReady(state, p.id); }
  return state;
}

test('completed or eliminated supply participants cannot spend resources or refresh stock', () => {
  for (const condition of ['ready', 'dead', 'game_over']) {
    const state = battle();
    state.players[0].tp = 10;
    state.draftShop = { active: true, players: Object.fromEntries(state.players.map(p => [p.id, {
      ready: false, slots: [{ card: structuredClone(cardMap.card_gen_01), refreshesLeft: 2 }],
    }])) };
    if (condition === 'ready') confirmDraftReady(state, 'a');
    if (condition === 'dead') { state.players[0].isDead = true; state.players[0].hp = 0; }
    if (condition === 'game_over') state.phase = 'game_over';
    const before = structuredClone(state);
    assert.equal(buyDraftCard(state, 'a', 0).ok, false);
    assert.equal(refreshDraftSlot(state, 'a', 0).ok, false);
    assert.deepEqual(state, before);
  }
});

test('pending participant names are public but other supply inventories stay private', () => {
  const state = battle();
  state.draftShop = { active: true, players: {
    a: { ready: true, slots: [] }, b: { ready: false, slots: [cardMap.card_gen_01] }, c: { ready: false, slots: [] },
  } };
  state.players[2].isDead = true;
  const view = getStateView(state, 'a');
  assert.deepEqual(view.draftShop.pendingPlayerIds, ['b']);
  assert.deepEqual(Object.keys(view.draftShop.players), ['a']);
  assert.match(phasePrompt(view), /等待b选牌/);
});

test('confirmed AoE defense becomes waiting, preserves others and escapes their names', () => {
  const state = battle();
  state.turnPhase = 'def_rolled';
  state.turnData = { attackerIdx: 0, defenderIdx: 1, isAoE: true, aoeDefenses: {
    b: { confirmed: true, rolls: [1] }, c: { confirmed: false, rolls: [2] },
  } };
  state.players[2].nickname = '<img src=x>';
  const view = getStateView(state, 'b');
  assert.equal(view.isMyDefendTurn, false);
  assert.equal(getStateView(state, 'c').isMyDefendTurn, true);
  assert.match(phasePrompt(view), /防御已确认/);
  assert.match(phasePrompt(view), /&lt;img/);
  assert.match(getTacticalCardUsability(cardMap.card_gen_01, view).reason, /已确认防御/);
});

test('AoE secondary defender checks the actual attacker when explaining unusable cards', () => {
  const state = battle();
  state.turnData = { attackerIdx: 1, defenderIdx: 0, isAoE: true, aoeDefenses: { c: { confirmed: false } } };
  state.players[0].tp = 5;
  state.players[1].tp = 0;
  const view = getStateView(state, 'c');
  assert.equal(getTacticalCardUsability(cardMap.card_gen_07, view).reason, '对手没有 TP');
});

test('reroll choices preserve hidden dice and restrict FFA opponents', () => {
  const state = battle();
  state.turnPhase = 'def_rolled';
  state.turnData = { attackerIdx: 0, defenderIdx: 1, attackRolls: [2, 3, 4], isAoE: true, aoeDefenses: {
    b: { confirmed: false, rolls: [6, 5, 4] }, c: { confirmed: false, rolls: [1, 2, 3] },
  } };
  const view = getStateView(state, 'a');
  assert.equal(view.aoeDefenses.b.rolls, null);
  assert.equal(view.aoeDefenses.b.rollCount, 3);
  const options = getRerollTargetChoices(view);
  assert.equal(options.length, 9);
  assert.deepEqual(options.filter(choice => choice.playerId !== 'a').map(choice => choice.value), Array(6).fill('?'));
  const defenderOptions = getRerollTargetChoices(getStateView(state, 'c'));
  assert.deepEqual([...new Set(defenderOptions.map(choice => choice.playerId))], ['a', 'c']);
  state.turnData.aoeDefenses.b.confirmed = true;
  assert.equal(getRerollTargetChoices(getStateView(state, 'a')).some(choice => choice.playerId === 'b'), false);

  state.turnData.isAoE = false;
  state.turnData.defenseRolls = [6, 5, 4];
  state.players[1].stealthActive = true;
  assert.deepEqual(getRerollTargetChoices(getStateView(state, 'a')).filter(choice => choice.playerId === 'b')
    .map(choice => choice.value), ['?', '?', '?']);
});

test('targeted reroll card is disabled before any dice are available', () => {
  const state = battle();
  state.turnPhase = 'waiting_atk';
  state.turnData = { attackerIdx: 0, defenderIdx: 1, attackRolls: null, defenseRolls: null };
  const view = getStateView(state, 'a');
  assert.deepEqual(getTacticalCardUsability(cardMap.card_gen_01, view), {
    canPlay: false, reason: '当前没有可指定的骰子',
  });
});

test('FFA direct-opponent cards are disabled until the attacker chooses a target', () => {
  const state = battle();
  state.schedule[state.currentClassIndex] = 'it';
  const view = getStateView(state, 'a');
  assert.deepEqual(getTacticalCardUsability(cardMap.card_it_1, view), {
    canPlay: false, reason: '请先选择攻击目标',
  });
  selectTarget(state, 'a', 'b');
  const selectedView = getStateView(state, 'a');
  assert.equal(getTacticalCardUsability(cardMap.card_it_1, selectedView).canPlay, true);
});

test('dream target modal only appears for an eligible living chooser', () => {
  const state = battle();
  state.phase = 'battle';
  state.attackerIdx = 0;
  state.turnData = { attackerIdx: 0, defenderIdx: 1 };
  state.players[1].cardId = 'char_fxr';
  state.players[1].card = { positiveSkill: { id: 'dream_king' } };
  state.players[1].inDreamState = true;
  state.players[1].dreamTargetChoice = null;

  state.me = state.players[0];
  assert.equal(canChooseDreamTarget(state), true);
  state.me = state.players[2];
  assert.equal(canChooseDreamTarget(state), false);

  // When the Dream King is the attacker, every living opponent may choose.
  state.turnData.attackerIdx = 1;
  state.attackerIdx = 1;
  assert.equal(canChooseDreamTarget(state), true);
  state.turnPhase = 'def_rolled';
  assert.equal(canChooseDreamTarget(state), false);
  state.turnPhase = 'choose_target';
  state.me = { ...state.players[1], id: 'spectator', isDead: true, hp: 0 };
  assert.equal(canChooseDreamTarget(state), false);
});

test('server dream target permissions match single and FFA chooser rules', () => {
  const state = battle();
  const dreamKing = state.players[1];
  dreamKing.cardId = 'char_fxr';
  dreamKing.card = { positiveSkill: { id: 'dream_king' } };
  dreamKing.inDreamState = true;
  dreamKing.dreamTargetChoice = null;
  dreamKing.realTargetIdx = 2;

  // Dream King defending: only the current attacker can choose.
  state.turnData = { attackerIdx: 0, defenderIdx: 1 };
  assert.equal(chooseDreamTarget(state, state.players[0].id, 1).ok, true);
  dreamKing.dreamTargetChoice = null;
  assert.equal(chooseDreamTarget(state, state.players[2].id, 1).ok, false);

  // A delayed modal response must not rewrite the choice after dice have
  // already been rolled or while defense is being resolved.
  state.turnPhase = 'def_rolled';
  assert.equal(chooseDreamTarget(state, state.players[0].id, 1).ok, false);
  state.turnPhase = 'waiting_atk';

  // Dream King attacking: any living opponent may choose, but the first
  // accepted choice closes the window for everyone else.
  dreamKing.dreamTargetChoice = null;
  state.turnData = { attackerIdx: 1, defenderIdx: null };
  assert.equal(chooseDreamTarget(state, state.players[2].id, 2).ok, true);
  assert.equal(chooseDreamTarget(state, state.players[0].id, 0).ok, false);
  state.players[0].isDead = true;
  state.players[0].hp = 0;
  dreamKing.dreamTargetChoice = null;
  assert.equal(chooseDreamTarget(state, state.players[0].id, 0).ok, false);
});

test('four-player FFA dream flow accepts one opponent choice before attack', () => {
  const state = createGame(
    ['a', 'b', 'c', 'd'].map(id => ({ id, nickname: id })),
    'sanguosha',
  );
  state.players.forEach((player, index) => {
    assert.equal(selectCard(state, player.id, index === 0 ? 'char_fxr' : 'char_6').ok, true);
    assert.equal(setReady(state, player.id).ok, true);
  });
  const dreamKing = state.players[0];
  dreamKing.inDreamState = true;
  dreamKing.dreamTargetChoice = null;
  dreamKing.realTargetIdx = 2;

  assert.deepEqual(chooseDreamTarget(state, 'b', 1), { ok: true, isReal: false });
  assert.deepEqual(chooseDreamTarget(state, 'c', 0), { ok: false, error: 'already_chosen' });
  assert.equal(selectTarget(state, 'a', 'd').ok, true);
  assert.equal(rollAttack(state).ok, true);
  assert.equal(state.turnPhase, 'atk_rolled');
});

test('both primary and secondary AoE defenders cannot play cards after confirming', () => {
  for (const playerId of ['b', 'c']) {
    const state = battle();
    state.turnPhase = 'def_rolled';
    state.turnData = { attackerIdx: 0, defenderIdx: 1, isAoE: true, aoeDefenses: {
      b: { confirmed: true }, c: { confirmed: true },
    } };
    state.players.find(p => p.id === playerId).handCards = [structuredClone(cardMap.card_gen_02)];
    const before = structuredClone(state);
    assert.equal(playTacticalCard(state, playerId, 'card_gen_02').ok, false);
    assert.deepEqual(state, before);
  }
});

test('attack confirmation advances once and repeated confirmation cannot apply effects twice', () => {
  const state = battle();
  state.turnPhase = 'atk_rolled';
  state.turnData = { attackerIdx: 0, defenderIdx: 1, attackRolls: [2, 2, 2] };
  assert.equal(confirmAttack(state, [0, 1, 2]).ok, true);
  assert.equal(state.turnPhase, 'def_rolled');
  const before = structuredClone(state);
  assert.equal(confirmAttack(state, [0, 1, 2]).ok, false);
  assert.deepEqual(state, before);
});

test('shared victory rules cover FFA alliances and leave living opponents in play', () => {
  for (const [hp, winner] of [
    [[10, 10, 10], null], [[0, 10, 10], 'rebel'], [[0, 0, 10], 'spy'], [[10, 0, 0], 'lord'],
  ]) {
    const state = { gameMode: 'sanguosha', phase: 'battle', players: ['lord', 'rebel', 'spy'].map((identity, i) => ({ identity, hp: hp[i], isDead: hp[i] === 0 })) };
    assert.deepEqual(settleWinner(state), { gameOver: winner !== null, winner });
    assert.equal(state.phase, winner === null ? 'battle' : 'game_over');
  }
});

test('damage explanation records ordered rounding, caps, final bonuses and skill changes', () => {
  const tactical = { isNoFixedBonus: false, flatPierce: 2, damageMultiplier: 0.5, maxDmgCap: 3, finalBonusDamage: 2, finalDamageReduction: 1 };
  const calculation = calculateDamageSteps(18, 5, false, tactical);
  assert.equal(calculation.damage, 3);
  assert.deepEqual(calculation.steps.map(step => step.value), [13, 15, 7, 9, 8, 3]);
  const result = finalizeDamageExplanation(calculation, 2, {}, {});
  assert.equal(result.steps.at(-1).value, 2);
  const html = logEntryHTML({ type: 'turn', details: { damage: 2, damageBreakdown: result } });
  assert.match(html, /查看伤害计算/);
  assert.match(html, /本次攻击伤害：2/);
  assert.equal(calculateDamageSteps(18, 50, true, { ...tactical, isNoFixedBonus: true }).damage, 3);
});

test('damage explanations never expose hidden attack or defense values', () => {
  const calculation = { damage: 2, attack: 12, defense: 10, steps: [] };
  for (const hidden of [{ cardId: 'char_10' }, { stealthActive: true }]) {
    assert.equal(finalizeDamageExplanation(calculation, 2, hidden, {}), null);
    assert.equal(finalizeDamageExplanation(calculation, 2, {}, hidden), null);
  }
});
