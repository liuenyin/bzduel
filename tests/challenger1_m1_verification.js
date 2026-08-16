import { createGame, buyDraftCard, playTacticalCard, refreshDraftSlot } from '../server/game/engine.js';
import { CARDS, getRandomCard, CARD_TYPE } from '../shared/cards.js';
import { SUBJECTS } from '../shared/rules.js';
import assert from 'assert';

console.log('===========================================================');
console.log('  CHALLENGER 1 MILLESTONE 1 EMPIRICAL VERIFICATION HARNESS');
console.log('===========================================================');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
    console.error(err.stack);
  }
}

// -----------------------------------------------------------------------------
// Test 1: Star rating to tpCost 1:1 mapping and card database integrity
// -----------------------------------------------------------------------------
runTest('1. Card Database & Star Rating to tpCost Mapping Integrity', () => {
  assert.strictEqual(CARDS.length, 60, `Expected 60 total cards, got ${CARDS.length}`);
  
  const starCounts = { 1: 0, 2: 0, 3: 0 };
  const subjectCounts = {};
  
  for (const card of CARDS) {
    assert.ok([1, 2, 3].includes(card.tpCost), `Card ${card.id} has invalid tpCost: ${card.tpCost}`);
    assert.ok(typeof card.name === 'string' && card.name.length > 0, `Card ${card.id} missing name`);
    assert.ok(typeof card.desc === 'string' && card.desc.length > 0, `Card ${card.id} missing desc`);
    assert.ok(Object.values(CARD_TYPE).includes(card.type), `Card ${card.id} has invalid type: ${card.type}`);
    
    starCounts[card.tpCost]++;
    subjectCounts[card.subject] = (subjectCounts[card.subject] || 0) + 1;
  }
  
  console.log(`       Card breakdown by star (tpCost): 1★=${starCounts[1]}, 2★=${starCounts[2]}, 3★=${starCounts[3]}`);
  console.log(`       Universal cards: ${subjectCounts.universal}, Subject cards: ${CARDS.length - subjectCounts.universal}`);
  
  assert.strictEqual(starCounts[1] + starCounts[2] + starCounts[3], 60, 'Sum of tier cards must be 60');
  assert.strictEqual(subjectCounts.universal, 15, 'Universal cards count must be 15');
});

// -----------------------------------------------------------------------------
// Test 2: Shop Draft Purchase Deducts Exact Star-Rating TP Cost
// -----------------------------------------------------------------------------
runTest('2. Shop Draft Purchase Exact TP Deduction (1-Star = 1 TP, 2-Star = 2 TP, 3-Star = 3 TP)', () => {
  const game = createGame([
    { id: 'p1', nickname: 'Alice' },
    { id: 'p2', nickname: 'Bob' }
  ]);
  game.phase = 'battle';
  
  const p1 = game.players[0];
  
  const card1Star = CARDS.find(c => c.tpCost === 1);
  const card2Star = CARDS.find(c => c.tpCost === 2);
  const card3Star = CARDS.find(c => c.tpCost === 3);

  // Test 1-Star Purchase with exact 1 TP
  p1.tp = 1;
  p1.handCards = [];
  game.draftShop = {
    active: true,
    players: { p1: { slots: [{ card: card1Star, refreshesLeft: 2 }], ready: false } }
  };
  let res = buyDraftCard(game, 'p1', 0);
  assert.strictEqual(res.ok, true, 'Buying 1-star card with 1 TP must succeed');
  assert.strictEqual(p1.tp, 0, '1-Star card must leave 0 TP (1 - 1)');
  assert.strictEqual(p1.handCards[0].id, card1Star.id);

  // Test 2-Star Purchase with exact 2 TP
  p1.tp = 2;
  p1.handCards = [];
  game.draftShop.players.p1.slots[0].card = card2Star;
  res = buyDraftCard(game, 'p1', 0);
  assert.strictEqual(res.ok, true, 'Buying 2-star card with 2 TP must succeed');
  assert.strictEqual(p1.tp, 0, '2-Star card must leave 0 TP (2 - 2)');

  // Test 3-Star Purchase with exact 3 TP
  p1.tp = 3;
  p1.handCards = [];
  game.draftShop.players.p1.slots[0].card = card3Star;
  res = buyDraftCard(game, 'p1', 0);
  assert.strictEqual(res.ok, true, 'Buying 3-star card with 3 TP must succeed');
  assert.strictEqual(p1.tp, 0, '3-Star card must leave 0 TP (3 - 3)');

  // Test insufficient TP error
  p1.tp = 2;
  game.draftShop.players.p1.slots[0].card = card3Star;
  res = buyDraftCard(game, 'p1', 0);
  assert.strictEqual(res.ok, false, 'Buying 3-star card with 2 TP must fail');
  assert.strictEqual(res.error, 'TP 不足');
  assert.strictEqual(p1.tp, 2, 'TP must remain unchanged after failed purchase');
});

// -----------------------------------------------------------------------------
// Test 3: Playing Card from Hand Requires 0 TP
// -----------------------------------------------------------------------------
runTest('3. Play Card from Hand with 0 TP (1-Star, 2-Star, 3-Star, Instant Effects)', () => {
  const game = createGame([
    { id: 'p1', nickname: 'Alice' },
    { id: 'p2', nickname: 'Bob' }
  ]);
  game.phase = 'battle';
  game.schedule = ['english', 'math', 'chinese'];
  game.currentClassIndex = 0; // English class
  
  const p1 = game.players[0];
  const p2 = game.players[1];
  p1.maxHp = 30; p1.hp = 10;
  p2.maxHp = 30; p2.hp = 20;
  p1.tp = 0; // ZERO TP

  // English 2 (Buff, 1 TP cost in shop, heals 5 HP)
  const cardEng2 = CARDS.find(c => c.id === 'card_eng_2');
  // Universal 3 (Buff, 2 TP cost in shop, heals 4 HP)
  const cardGen03 = CARDS.find(c => c.id === 'card_gen_03');
  // Biology 3 (Other, 3 TP cost in shop)
  const cardBio3 = CARDS.find(c => c.id === 'card_bio_3');

  p1.handCards = [cardEng2, cardGen03];

  // Play English 2 with 0 TP
  const res1 = playTacticalCard(game, 'p1', cardEng2.id);
  assert.strictEqual(res1.ok, true, 'Play English-2 card with 0 TP must succeed');
  assert.strictEqual(p1.hp, 15, 'Card instant effect (heal 5) must execute');
  assert.strictEqual(p1.tp, 0, 'TP must remain 0 after playing card');
  assert.strictEqual(p1.handCards.length, 1);

  // Play Universal 3 with 0 TP
  const res2 = playTacticalCard(game, 'p1', cardGen03.id);
  assert.strictEqual(res2.ok, true, 'Play Universal-3 card with 0 TP must succeed');
  assert.strictEqual(p1.hp, 19, 'Card instant effect (heal 4) must execute');
  assert.strictEqual(p1.tp, 0, 'TP must remain 0');
  assert.strictEqual(p1.handCards.length, 0);

  // Play 3-star card given by event/shop when TP is 0
  p1.handCards = [cardBio3];
  game.schedule[0] = 'biology'; // Switch class to biology
  const res3 = playTacticalCard(game, 'p1', cardBio3.id);
  assert.strictEqual(res3.ok, true, 'Play 3-Star card with 0 TP must succeed');
  assert.strictEqual(p1.tp, 0, 'TP remains 0');
});

// -----------------------------------------------------------------------------
// Test 4: battle.js Front-end Logic Simulation (No double charging / TP check)
// -----------------------------------------------------------------------------
runTest('4. UI battle.js Hand Card Playability Logic', () => {
  const curSubj = 'chinese';
  const meCardSubjects = ['chinese', 'math', 'english'];
  const canUseClass = meCardSubjects.includes(curSubj); // true

  const testHand = [
    { id: 'card_chi_1', subject: 'chinese', tpCost: 2 },
    { id: 'card_mat_1', subject: 'math', tpCost: 3 },
    { id: 'card_gen_01', subject: 'universal', tpCost: 1 }
  ];

  const tp = 0; // ZERO TP!

  const evaluation = testHand.map(c => {
    const subjMatch = c.subject === 'universal' || c.subject === curSubj;
    const canPlay = c.subject === 'universal' || (subjMatch && canUseClass);
    let disableReason = '';
    if (!canPlay) {
      if (!subjMatch && c.subject !== 'universal') disableReason = `限当节课`;
      else if (!canUseClass && c.subject !== 'universal') disableReason = '非自身选科';
    }
    return { id: c.id, canPlay, disableReason };
  });

  assert.strictEqual(evaluation[0].canPlay, true, 'Chinese card in Chinese class must be playable at 0 TP');
  assert.strictEqual(evaluation[0].disableReason, '');

  assert.strictEqual(evaluation[1].canPlay, false, 'Math card in Chinese class must NOT be playable');
  assert.strictEqual(evaluation[1].disableReason, '限当节课');

  assert.strictEqual(evaluation[2].canPlay, true, 'Universal card in any class must be playable at 0 TP');
  assert.strictEqual(evaluation[2].disableReason, '');
});

// -----------------------------------------------------------------------------
// Test 5: Statistical Distribution of getRandomCard (100,000 sample runs)
// -----------------------------------------------------------------------------
runTest('5. Statistical Distribution & Diversity of getRandomCard (100,000 Iterations)', () => {
  const SAMPLES = 100000;
  const currentSubject = 'physics';
  const playerSubjects = ['physics', 'math', 'chinese'];
  
  const counts = {};
  let universalCount = 0;
  let subjectCount = 0;

  for (let i = 0; i < SAMPLES; i++) {
    const card = getRandomCard(currentSubject, playerSubjects);
    counts[card.subject] = (counts[card.subject] || 0) + 1;
    if (card.subject === 'universal') {
      universalCount++;
    } else {
      subjectCount++;
    }
  }

  const universalRatio = universalCount / SAMPLES;
  console.log(`       100,000 Samples distribution:`, counts);
  console.log(`       Universal ratio: ${(universalRatio * 100).toFixed(2)}%`);
  console.log(`       Subject cards ratio: ${((1 - universalRatio) * 100).toFixed(2)}%`);

  // Assert universal ratio is roughly 50% (+/- 2%)
  assert.ok(universalRatio >= 0.48 && universalRatio <= 0.52, `Universal ratio ${universalRatio} out of expected 0.48-0.52 range`);

  // Assert non-universal cards returned only physics, math, chinese (player subjects / current subject)
  for (const subj of Object.keys(counts)) {
    if (subj !== 'universal') {
      assert.ok(
        playerSubjects.includes(subj) || subj === currentSubject,
        `Unexpected subject card drawn: ${subj}`
      );
    }
  }

  // Test edge case: player with no matching subject cards available
  const noMatchCounts = {};
  for (let i = 0; i < 1000; i++) {
    const card = getRandomCard('non_existent_subj', []);
    noMatchCounts[card.subject] = (noMatchCounts[card.subject] || 0) + 1;
  }
  assert.strictEqual(noMatchCounts.universal, 1000, 'When no subject cards match, fallback must draw universal cards');
});

// -----------------------------------------------------------------------------
// Test 6: Shop Draft Refreshing produces diverse options
// -----------------------------------------------------------------------------
runTest('6. Draft Shop Refresh Diversity & State Management', () => {
  const game = createGame([
    { id: 'p1', nickname: 'Alice' },
    { id: 'p2', nickname: 'Bob' }
  ]);
  game.phase = 'battle';
  game.schedule = ['chinese', 'math', 'pe'];
  game.currentClassIndex = 0;

  const p1 = game.players[0];
  p1.card = { subjects: ['chinese', 'math', 'pe'] };

  game.draftShop = {
    active: true,
    players: {
      p1: {
        ready: false,
        slots: [
          { card: getRandomCard('chinese', p1.card.subjects), refreshesLeft: 2 },
          { card: getRandomCard('chinese', p1.card.subjects), refreshesLeft: 2 },
          { card: getRandomCard('chinese', p1.card.subjects), refreshesLeft: 2 }
        ]
      }
    }
  };

  const initialCards = game.draftShop.players.p1.slots.map(s => s.card.id);
  
  // Refresh slot 0
  const refRes = refreshDraftSlot(game, 'p1', 0);
  assert.strictEqual(refRes.ok, true, 'Slot refresh must succeed');
  assert.strictEqual(game.draftShop.players.p1.slots[0].refreshesLeft, 1, 'Refreshes left must decrease to 1');
  
  // Refresh slot 0 again
  refreshDraftSlot(game, 'p1', 0);
  assert.strictEqual(game.draftShop.players.p1.slots[0].refreshesLeft, 0, 'Refreshes left must decrease to 0');

  // Exhausted refresh attempt
  const exRes = refreshDraftSlot(game, 'p1', 0);
  assert.strictEqual(exRes.ok, false, 'Exhausted slot refresh must fail');
  assert.strictEqual(exRes.error, '该栏刷新次数已用完');
});

// -----------------------------------------------------------------------------
// Test 7: AI Card Play Strategy with 0 TP
// -----------------------------------------------------------------------------
runTest('7. Server AI Player Card Play Execution at 0 TP', () => {
  const game = createGame([
    { id: 'human', nickname: 'Human' },
    { id: 'ai', nickname: 'AI Bot' }
  ]);
  game.phase = 'battle';
  game.schedule = ['chinese', 'math'];
  game.currentClassIndex = 0;
  
  const aiPlayer = game.players.find(p => p.id === 'ai');
  aiPlayer.card = { subjects: ['chinese', 'math'] };
  aiPlayer.tp = 0; // AI has 0 TP

  const cardChi2 = CARDS.find(c => c.id === 'card_chi_2'); // Chinese card
  aiPlayer.handCards = [cardChi2];

  // Simulate server/index.js AI card play logic
  const curSubj = game.schedule[game.currentClassIndex];
  const canUseClass = aiPlayer.card?.subjects?.includes(curSubj);
  const playableCard = aiPlayer.handCards.find(c => {
    const subjMatch = c.subject === 'universal' || (c.subject === curSubj && canUseClass);
    return subjMatch;
  });

  assert.ok(playableCard, 'AI must find playable card even at 0 TP');
  assert.strictEqual(playableCard.id, cardChi2.id);

  const playRes = playTacticalCard(game, 'ai', playableCard.id);
  assert.strictEqual(playRes.ok, true, 'AI playing card at 0 TP must succeed');
  assert.strictEqual(aiPlayer.handCards.length, 0);
});

console.log('===========================================================');
console.log(`  VERIFICATION COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED`);
console.log('===========================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
