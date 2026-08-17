import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aiChooseDraftSlot,
  aiChooseKeepIndices,
  aiChooseRerollIndices,
  aiChooseTacticalCard,
} from '../server/game/ai.js';
import { SKILL } from '../shared/characters.js';
import { cardMap } from '../shared/cards.js';

function makePlayer(overrides = {}) {
  return {
    id: 'ai',
    hp: 20,
    maxHp: 30,
    tp: 3,
    rerolls: 1,
    handCards: [],
    buffs: [],
    redHeat: 0,
    stickers: 0,
    selfStickers: 0,
    permanentDefPenalty: 0,
    card: {
      positiveSkill: null,
      neutralSkill: null,
      negativeSkill: null,
    },
    ...overrides,
  };
}

function makeState(ai, opponent, overrides = {}) {
  return {
    schedule: ['english'],
    currentClassIndex: 0,
    currentSubRound: 0,
    turnPhase: 'atk_rolled',
    turnData: { attackerIdx: 0, defenderIdx: 1 },
    players: [ai, opponent],
    draftShop: null,
    ...overrides,
  };
}

test('AI keep choices contain unique in-range dice indices', () => {
  const indices = aiChooseKeepIndices({ rolls: [2, 8, 5, 7], faces: [8, 8, 8, 8], slots: 3 });
  assert.equal(indices.length, 3);
  assert.equal(new Set(indices).size, indices.length);
  assert.ok(indices.every(index => index >= 0 && index < 4));
});

test('D10 limit keeps at most one D10 die', () => {
  const indices = aiChooseKeepIndices({
    rolls: [9, 8, 5],
    faces: [10, 10, 6],
    slots: 2,
    phase: 'defense',
    skillId: SKILL.D10_LIMIT,
  });
  assert.equal(indices.length, 2);
  assert.ok(indices.filter(index => [10, 10, 6][index] === 10).length <= 1);
});

test('star showoff prefers a tight range over a single high outlier', () => {
  const indices = aiChooseKeepIndices({
    rolls: [12, 8, 7, 7],
    faces: [12, 8, 8, 8],
    slots: 3,
    phase: 'attack',
    skillId: SKILL.STAR_SHOWOFF,
  });
  assert.deepEqual(indices.sort((a, b) => a - b), [1, 2, 3]);
});

test('AI does not reroll when its kept defense already covers the attack', () => {
  const player = makePlayer();
  const indices = aiChooseRerollIndices({
    player,
    rolls: [8, 7, 1],
    faces: [10, 10, 10],
    slots: 2,
    phase: 'defense',
    targetValue: 14,
  });
  assert.deepEqual(indices, []);
});

test('low-health AI prioritizes an available healing card', () => {
  const ai = makePlayer({ hp: 12, handCards: [cardMap.card_eng_3, cardMap.card_eng_2] });
  const opponent = makePlayer({ id: 'human', hp: 30, maxHp: 30 });
  const state = makeState(ai, opponent);
  assert.equal(aiChooseTacticalCard(state, ai.id)?.id, 'card_eng_2');
});

test('AI prioritizes detonating an opponent with red heat', () => {
  const ai = makePlayer({ handCards: [cardMap.card_che_2, cardMap.card_che_3] });
  const opponent = makePlayer({ id: 'human', redHeat: 5 });
  const state = makeState(ai, opponent, { schedule: ['chemistry'] });
  assert.equal(aiChooseTacticalCard(state, ai.id)?.id, 'card_che_3');
});

test('draft strategy skips unaffordable and currently useless cards', () => {
  const ai = makePlayer({ hp: 30, maxHp: 30, tp: 2, handCards: [] });
  const opponent = makePlayer({ id: 'human' });
  const state = makeState(ai, opponent, {
    draftShop: {
      players: {
        ai: {
          slots: [
            { card: cardMap.card_bio_3 },
            { card: cardMap.card_gen_03 },
          ],
        },
      },
    },
  });
  assert.equal(aiChooseDraftSlot(state, ai.id), null);
});
