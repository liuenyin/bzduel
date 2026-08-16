import { createGame, buyDraftCard, playTacticalCard } from '../server/game/engine.js';
import { CARDS, getRandomCard } from '../shared/cards.js';
import assert from 'assert';

console.log('=== Running R1 Tactical Card Logic Verification Tests ===');

// 1. Verify card definitions & pricing alignment
console.log('1. Verifying star ratings & tpCost alignment...');
let star1Count = 0;
let star2Count = 0;
let star3Count = 0;

CARDS.forEach(card => {
  assert.ok([1, 2, 3].includes(card.tpCost), `Card ${card.id} has invalid tpCost ${card.tpCost}`);
  if (card.tpCost === 1) star1Count++;
  if (card.tpCost === 2) star2Count++;
  if (card.tpCost === 3) star3Count++;
});
console.log(`✓ Card tier counts: 1-star=${star1Count}, 2-star=${star2Count}, 3-star=${star3Count}`);

// 2. Verify getRandomCard sampling
console.log('2. Verifying getRandomCard balanced sampling...');
const playerSubjects = ['chinese', 'math', 'physics'];
const sampleCounts = {};
const TOTAL_SAMPLES = 10000;

for (let i = 0; i < TOTAL_SAMPLES; i++) {
  const card = getRandomCard('pe', playerSubjects);
  sampleCounts[card.subject] = (sampleCounts[card.subject] || 0) + 1;
}

console.log('  Sample distribution in PE class:', sampleCounts);
const universalRatio = sampleCounts.universal / TOTAL_SAMPLES;
console.log(`  Universal card ratio: ${(universalRatio * 100).toFixed(2)}% (Expected ~50%)`);

assert.ok(universalRatio > 0.40 && universalRatio < 0.60, 'Universal card ratio must be ~50%');
assert.ok((sampleCounts.chinese || 0) > 0, 'Must include Chinese cards');
assert.ok((sampleCounts.math || 0) > 0, 'Must include Math cards');
assert.ok((sampleCounts.physics || 0) > 0, 'Must include Physics cards');
console.log('✓ getRandomCard sampling verified successfully!');

// 3. Verify Buy Draft Card (1-star = 1 TP) & Play Card with 0 TP
console.log('3. Verifying Buy 1-Star card (1 TP) & Play from hand with 0 TP...');
const state = createGame([
  { id: 'player1', nickname: 'Alice' },
  { id: 'player2', nickname: 'Bob' }
]);

state.phase = 'battle';
state.schedule = ['chinese', 'math', 'english'];
state.currentClassIndex = 0;

const p1 = state.players.find(p => p.id === 'player1');
p1.tp = 1; // Exactly 1 TP
p1.handCards = [];

const card1Star = CARDS.find(c => c.tpCost === 1 && c.subject === 'chinese');
assert.ok(card1Star, '1-star Chinese card must exist');

state.draftShop = {
  active: true,
  players: {
    player1: {
      slots: [
        { card: card1Star, refreshesLeft: 2 }
      ],
      ready: false
    }
  }
};

// Purchase 1-star card
const buyRes = buyDraftCard(state, 'player1', 0);
assert.strictEqual(buyRes.ok, true, 'Buy draft card should succeed');
assert.strictEqual(p1.tp, 0, 'TP after buying 1-star card must be 0');
assert.strictEqual(p1.handCards.length, 1, 'Hand must contain 1 card');
assert.strictEqual(p1.handCards[0].id, card1Star.id, 'Hand card ID must match purchased card');
console.log('✓ 1-Star card purchased for 1 TP. Remaining TP: 0');

// Play card from hand with 0 TP
const playRes = playTacticalCard(state, 'player1', card1Star.id);
assert.strictEqual(playRes.ok, true, 'Play card from hand with 0 TP must succeed');
assert.strictEqual(p1.handCards.length, 0, 'Hand must be empty after playing card');
console.log('✓ Card played from hand with 0 TP successfully!');

console.log('=== All R1 Tactical Card Logic Verification Tests PASSED! ===');
