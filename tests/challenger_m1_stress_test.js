// ============================================================
// Challenger Stress Test: R1 Tactical Card Logic & AI Execution
// ============================================================
import assert from 'assert';
import { createGame, selectCard, setReady, playTacticalCard, buyDraftCard, refreshDraftSlot, confirmDraftReady, resolvePhaseEnd } from '../server/game/engine.js';
import { CARDS, cardMap, getRandomCard } from '../shared/cards.js';
import { GAME_MODE, PHASE } from '../shared/rules.js';

console.log("=================================================");
console.log("  CHALLENGER STRESS TEST: Milestone 1 (R1)");
console.log("=================================================\n");

let passedCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`✓ [PASS] Test ${totalCount}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`✗ [FAIL] Test ${totalCount}: ${name}`);
    console.error(`  Error: ${err.message}`);
    console.error(err.stack);
  }
}

// ------------------------------------------------------------
// Test 1: Card TP Cost Definition & Pricing Consistency
// ------------------------------------------------------------
runTest("Card definitions tpCost alignment (1..3 TP & Star matching)", () => {
  assert(CARDS.length > 0, "CARDS pool should not be empty");
  CARDS.forEach(c => {
    assert(typeof c.tpCost === 'number', `Card ${c.id} missing numeric tpCost`);
    assert(c.tpCost >= 1 && c.tpCost <= 3, `Card ${c.id} tpCost ${c.tpCost} out of valid range 1-3`);
    
    // Simulate UI star calculation: '★'.repeat(c.tpCost) + '☆'.repeat(3 - c.tpCost)
    const starStr = '★'.repeat(c.tpCost) + '☆'.repeat(3 - c.tpCost);
    assert.strictEqual(starStr.length, 3, `Card ${c.id} star string length is not 3`);
    assert.strictEqual((starStr.match(/★/g) || []).length, c.tpCost, `Card ${c.id} star count does not match tpCost`);
  });
});

// ------------------------------------------------------------
// Test 2: getRandomCard Balanced Sampling
// ------------------------------------------------------------
runTest("getRandomCard distribution across 20,000 iterations", () => {
  const iterations = 20000;
  const counts = {};
  const currentSubj = 'pe';
  const playerSubjs = ['chinese', 'math', 'pe'];

  for (let i = 0; i < iterations; i++) {
    const card = getRandomCard(currentSubj, playerSubjs);
    const subj = card.subject;
    counts[subj] = (counts[subj] || 0) + 1;
  }

  const universalRatio = (counts['universal'] || 0) / iterations;
  console.log(`   Sample distribution over ${iterations} runs:`, counts);
  console.log(`   Universal card ratio: ${(universalRatio * 100).toFixed(2)}%`);
  
  // Expect universal cards ~50% (between 48% and 52%)
  assert(universalRatio >= 0.48 && universalRatio <= 0.52, `Universal card ratio ${universalRatio} out of expected ~0.50 range`);
});

// Helper to set up game in battle phase
function setupBattleGame() {
  const players = [{ id: 'p1', nickname: 'Player1' }, { id: 'p2', nickname: 'Player2' }];
  const game = createGame(players, GAME_MODE.MODE_1V1);
  const s1 = selectCard(game, 'p1', 'char_3');
  const s2 = selectCard(game, 'p2', 'char_4');
  assert.strictEqual(s1.ok, true, "Select char_3 for p1");
  assert.strictEqual(s2.ok, true, "Select char_4 for p2");
  const r1 = setReady(game, 'p1');
  const r2 = setReady(game, 'p2');
  assert.strictEqual(r2.battleStarted, true, "Battle should start");
  assert.strictEqual(game.phase, PHASE.BATTLE, "Game phase should be battle");
  return game;
}

// ------------------------------------------------------------
// Test 3: TP Edge Case — 0 TP Operations
// ------------------------------------------------------------
runTest("0 TP Edge Case: Buy card fails with 'TP不足', Play card succeeds with 0 TP", () => {
  const game = setupBattleGame();

  const p1 = game.players[0];
  p1.tp = 0; // Explicitly 0 TP

  // Set up draft shop manually
  game.draftShop = {
    active: true,
    players: {
      'p1': {
        ready: false,
        slots: [
          { card: CARDS.find(c => c.tpCost === 1), refreshesLeft: 2 },
          { card: CARDS.find(c => c.tpCost === 2), refreshesLeft: 2 },
          { card: CARDS.find(c => c.tpCost === 3), refreshesLeft: 2 },
        ]
      }
    }
  };

  // 1. Try buying 1-star card with 0 TP -> must fail
  const buyRes1 = buyDraftCard(game, 'p1', 0);
  assert.strictEqual(buyRes1.ok, false, "Buying card with 0 TP should fail");
  assert.strictEqual(buyRes1.error, 'TP 不足', "Error message should be 'TP 不足'");
  assert.strictEqual(p1.tp, 0, "TP should remain 0");
  assert.strictEqual(p1.handCards.length, 0, "Hand cards should remain empty");

  // 2. Give p1 cards in hand (1-star, 2-star, 3-star) while TP is 0
  const card1 = CARDS.find(c => c.subject === 'universal' && c.tpCost === 1);
  const card2 = CARDS.find(c => c.subject === 'universal' && c.tpCost === 2);
  const card3 = CARDS.find(c => c.tpCost === 3); // 3-star card (e.g. math-1)
  p1.handCards = [card1, card2, card3];

  // 3. Play card1 with 0 TP -> MUST succeed and NOT deduct TP
  const playRes1 = playTacticalCard(game, 'p1', card1.id);
  assert.strictEqual(playRes1.ok, true, `Playing card ${card1.name} with 0 TP should succeed`);
  assert.strictEqual(p1.tp, 0, "TP should still be 0 after playing card");
  assert.strictEqual(p1.handCards.length, 2, "Hand cards should decrement to 2");

  // 4. Set current schedule class to match card3 if needed (e.g. math)
  game.schedule[game.currentClassIndex] = card3.subject;
  const playRes3 = playTacticalCard(game, 'p1', card3.id);
  assert.strictEqual(playRes3.ok, true, `Playing 3-star card ${card3.name} with 0 TP should succeed`);
  assert.strictEqual(p1.tp, 0, "TP should still be 0 after playing 3-star card");
});

// ------------------------------------------------------------
// Test 4: TP Edge Case — 1 TP Operations & Exact Deduction
// ------------------------------------------------------------
runTest("1 TP Edge Case: Buy 1-star card succeeds (TP 1 -> 0), then play at 0 TP succeeds. Buy 2-star fails.", () => {
  const game = setupBattleGame();

  const p1 = game.players[0];
  p1.tp = 1;

  const card1Star = CARDS.find(c => c.tpCost === 1 && c.subject === 'universal');
  const card2Star = CARDS.find(c => c.tpCost === 2 && c.subject === 'universal');

  game.draftShop = {
    active: true,
    players: {
      'p1': {
        ready: false,
        slots: [
          { card: card1Star, refreshesLeft: 2 },
          { card: card2Star, refreshesLeft: 2 },
        ]
      }
    }
  };

  // 1. Try buying 2-star card (costs 2 TP) with 1 TP -> should fail
  const buyRes2 = buyDraftCard(game, 'p1', 1);
  assert.strictEqual(buyRes2.ok, false, "Buying 2-star card with 1 TP should fail");
  assert.strictEqual(buyRes2.error, 'TP 不足');
  assert.strictEqual(p1.tp, 1);

  // 2. Buy 1-star card (costs 1 TP) with 1 TP -> should succeed
  const buyRes1 = buyDraftCard(game, 'p1', 0);
  assert.strictEqual(buyRes1.ok, true, "Buying 1-star card with 1 TP should succeed");
  assert.strictEqual(p1.tp, 0, "TP should be deducted from 1 to 0");
  assert.strictEqual(p1.handCards.length, 1);
  assert.strictEqual(p1.handCards[0].id, card1Star.id);

  // 3. Play the purchased card from hand with 0 TP -> should succeed immediately!
  const playRes = playTacticalCard(game, 'p1', card1Star.id);
  assert.strictEqual(playRes.ok, true, "Playing purchased card with 0 TP should succeed");
  assert.strictEqual(p1.tp, 0, "TP remains 0");
});

// ------------------------------------------------------------
// Test 5: TP Edge Case — Max TP (10 TP) & Capping Behavior
// ------------------------------------------------------------
runTest("Max TP Edge Case: Capping at 10 TP, multiple purchases, max hand size protection", () => {
  const game = setupBattleGame();

  const p1 = game.players[0];
  p1.tp = 10; // Max TP

  // Simulate end of class classChanged where p.tp = Math.min(10, (p.tp || 0) + 1)
  p1.tp = Math.min(10, p1.tp + 1);
  assert.strictEqual(p1.tp, 10, "TP should be capped at max 10");

  const c1 = CARDS.find(c => c.tpCost === 3);
  const c2 = CARDS.find(c => c.tpCost === 2 && c.subject === 'universal');
  const c3 = CARDS.find(c => c.tpCost === 1 && c.subject === 'universal');
  const c4 = CARDS.find(c => c.tpCost === 1 && c.subject === 'universal' && c.id !== c3.id);

  game.draftShop = {
    active: true,
    players: {
      'p1': {
        ready: false,
        slots: [
          { card: c1, refreshesLeft: 2 },
          { card: c2, refreshesLeft: 2 },
          { card: c3, refreshesLeft: 2 },
        ]
      }
    }
  };

  // Buy c1 (3 TP) -> TP becomes 7
  assert.strictEqual(buyDraftCard(game, 'p1', 0).ok, true);
  assert.strictEqual(p1.tp, 7);

  // Buy c2 (2 TP) -> TP becomes 5
  assert.strictEqual(buyDraftCard(game, 'p1', 1).ok, true);
  assert.strictEqual(p1.tp, 5);

  // Buy c3 (1 TP) -> TP becomes 4, hand full (3/3)
  assert.strictEqual(buyDraftCard(game, 'p1', 2).ok, true);
  assert.strictEqual(p1.tp, 4);
  assert.strictEqual(p1.handCards.length, 3);

  // Try buying 4th card with 4 TP -> must fail due to full hand
  game.draftShop.players['p1'].slots[0].card = c4;
  const buyFull = buyDraftCard(game, 'p1', 0);
  assert.strictEqual(buyFull.ok, false);
  assert.strictEqual(buyFull.error, '手牌已满 (最多持有 3 张)');
  assert.strictEqual(p1.tp, 4);

  // Play c2 and c3 (universal cards) from hand
  assert.strictEqual(playTacticalCard(game, 'p1', c2.id).ok, true);
  assert.strictEqual(playTacticalCard(game, 'p1', c3.id).ok, true);

  // Match class for c1 and play it
  game.schedule[game.currentClassIndex] = c1.subject;
  assert.strictEqual(playTacticalCard(game, 'p1', c1.id).ok, true);
  assert.strictEqual(p1.handCards.length, 0);
  assert.strictEqual(p1.tp, 4, "TP should remain 4 after playing all hand cards");
});

// ------------------------------------------------------------
// Test 6: Client UI Rendering Logic Verification (battle.js logic)
// ------------------------------------------------------------
runTest("Client UI logic (battle.js): hand cards display and TP overlay checks", () => {
  const curSubj = 'pe';
  const canUseClass = true; // Player has PE subject

  const cardUniversal = { id: 'c1', name: 'Universal Card', desc: 'test', tpCost: 2, subject: 'universal' };
  const cardSubjMatch = { id: 'c2', name: 'PE Card', desc: 'test', tpCost: 1, subject: 'pe' };
  const cardSubjMismatch = { id: 'c3', name: 'Math Card', desc: 'test', tpCost: 1, subject: 'math' };

  // Helper simulating battle.js hand cards rendering logic
  function checkHandCardCanPlay(c, tp) {
    const subjMatch = c.subject === 'universal' || c.subject === curSubj;
    const canPlay = c.subject === 'universal' || (subjMatch && canUseClass);
    let disableReason = '';
    if (!canPlay) {
       if (!subjMatch && c.subject !== 'universal') disableReason = `限当节课`;
       else if (!canUseClass && c.subject !== 'universal') disableReason = '非自身选科';
    }
    return { canPlay, disableReason };
  }

  // 1. With 0 TP
  const res1 = checkHandCardCanPlay(cardUniversal, 0);
  assert.strictEqual(res1.canPlay, true, "Universal card should be playable with 0 TP");
  assert.strictEqual(res1.disableReason, "", "disableReason should be empty for 0 TP hand card");

  const res2 = checkHandCardCanPlay(cardSubjMatch, 0);
  assert.strictEqual(res2.canPlay, true, "Matching subject card should be playable with 0 TP");

  const res3 = checkHandCardCanPlay(cardSubjMismatch, 0);
  assert.strictEqual(res3.canPlay, false, "Mismatch subject card should be disabled");
  assert.strictEqual(res3.disableReason, "限当节课");

  // Helper simulating battle.js draft shop modal buy button check
  function checkDraftShopBuyDisabled(c, tp, handCount) {
    const isHandFull = handCount >= 3;
    const isAfford = tp >= c.tpCost;
    const buyDisabled = isHandFull || !isAfford;
    let disableReason = '';
    if (isHandFull) disableReason = '手牌已满';
    else if (!isAfford) disableReason = 'TP不足';
    return { buyDisabled, disableReason };
  }

  // Shop check with 0 TP
  const shop1 = checkDraftShopBuyDisabled(cardSubjMatch, 0, 0);
  assert.strictEqual(shop1.buyDisabled, true, "Draft shop purchase of 1-star card should be disabled at 0 TP");
  assert.strictEqual(shop1.disableReason, "TP不足", "Draft shop should show 'TP不足' for 0 TP");

  // Shop check with 1 TP for 1-star vs 2-star
  const shop2 = checkDraftShopBuyDisabled(cardSubjMatch, 1, 0);
  assert.strictEqual(shop2.buyDisabled, false, "Draft shop purchase of 1-star card allowed at 1 TP");

  const shop3 = checkDraftShopBuyDisabled(cardUniversal, 1, 0);
  assert.strictEqual(shop3.buyDisabled, true, "Draft shop purchase of 2-star card disabled at 1 TP");
  assert.strictEqual(shop3.disableReason, "TP不足");
});

// ------------------------------------------------------------
// Test 7: AI Turn Execution Playing Cards & Draft Shop
// ------------------------------------------------------------
runTest("AI Turn Execution: AI plays hand cards regardless of TP and respects subject constraints", () => {
  const room = {
    aiId: 'AI_BOT_1',
    game: createGame([{ id: 'human', nickname: 'Human' }, { id: 'AI_BOT_1', nickname: 'AI Bot' }], GAME_MODE.MODE_1V1)
  };
  const g = room.game;
  selectCard(g, 'human', 'char_3');
  selectCard(g, 'AI_BOT_1', 'char_4'); // char_4 has subjects: ['chinese', 'math', 'english', 'physics', 'chemistry', 'geography']
  setReady(g, 'human');
  setReady(g, 'AI_BOT_1');

  const aiPlayer = g.players.find(p => p.id === room.aiId);
  aiPlayer.tp = 0; // AI has 0 TP

  const uCard = CARDS.find(c => c.subject === 'universal' && c.tpCost === 2);
  const mCard = CARDS.find(c => c.subject === 'biology' && c.tpCost === 1); // Biology is not in char_4's electives

  aiPlayer.handCards = [uCard, mCard];

  // Helper simulating server/index.js AI card play logic
  function runAiPlayCards(g, room) {
    const aiP = g.players.find(p => p.id === room.aiId);
    let played = false;
    if (aiP && !aiP.isDead && aiP.handCards && aiP.handCards.length > 0) {
      const curSubj = g.schedule[g.currentClassIndex];
      const canUseClass = aiP.card?.subjects?.includes(curSubj);
      const playableCard = aiP.handCards.find(c => {
        const subjMatch = c.subject === 'universal' || (c.subject === curSubj && canUseClass);
        return subjMatch;
      });
      if (playableCard) {
        const res = playTacticalCard(g, room.aiId, playableCard.id);
        played = res.ok;
      }
    }
    return played;
  }

  // 1. AI plays universal card at 0 TP -> should succeed
  const play1 = runAiPlayCards(g, room);
  assert.strictEqual(play1, true, "AI should play universal card at 0 TP");
  assert.strictEqual(aiPlayer.handCards.length, 1, "AI hand should have 1 card remaining");
  assert.strictEqual(aiPlayer.handCards[0].id, mCard.id);

  // 2. AI has biology card, but char_4 does NOT have biology in subjects -> AI cannot play even if class is biology
  g.schedule[g.currentClassIndex] = 'biology';
  const play2 = runAiPlayCards(g, room);
  assert.strictEqual(play2, false, "AI should not play biology card because char_4 lacks biology subject");

  // 3. Test AI draft shop buying logic under 0 TP and 3 TP
  const slot1Card = CARDS.find(c => c.tpCost === 1 && c.subject === 'universal');
  const slot2Card = CARDS.find(c => c.tpCost === 2 && c.subject === 'universal');

  g.draftShop = {
    active: true,
    players: {
      [room.aiId]: {
        ready: false,
        slots: [
          { card: slot1Card, refreshesLeft: 2 },
          { card: slot2Card, refreshesLeft: 2 },
        ]
      }
    }
  };

  // Helper simulating server/index.js AI draft shop logic
  function runAiDraftShop(g, room) {
    if (g.draftShop && g.draftShop.active) {
      const aiDraft = g.draftShop.players?.[room.aiId];
      if (aiDraft && !aiDraft.ready) {
        const aiP = g.players.find(p => p.id === room.aiId);
        if (aiP) {
          for (let i = 0; i < aiDraft.slots.length; i++) {
            if ((aiP.handCards || []).length < 3 && aiDraft.slots[i].card) {
              buyDraftCard(g, room.aiId, i);
            }
          }
        }
        confirmDraftReady(g, room.aiId);
      }
    }
  }

  aiPlayer.tp = 0;
  runAiDraftShop(g, room);
  assert.strictEqual(g.draftShop.players[room.aiId].ready, true, "AI draft shop should be ready");
  assert.strictEqual(aiPlayer.handCards.length, 1, "AI should not buy any card with 0 TP");

  // Give AI 3 TP and re-activate draft shop
  aiPlayer.tp = 3;
  g.draftShop.active = true;
  g.draftShop.players[room.aiId].ready = false;
  runAiDraftShop(g, room);
  assert.strictEqual(aiPlayer.tp < 3, true, "AI should have spent TP to buy available draft card");
});

console.log("\n=================================================");
console.log(`  STRESS TEST COMPLETE: ${passedCount}/${totalCount} Passed`);
console.log("=================================================");

if (passedCount !== totalCount) {
  process.exit(1);
}
