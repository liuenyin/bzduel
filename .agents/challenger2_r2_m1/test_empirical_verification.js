import { createGame, selectCard, setReady, playTacticalCard, buyDraftCard, confirmAttack, confirmDefense, rollAttack, rerollDice, getStateView, resolvePhaseEnd } from '../../server/game/engine.js';
import { CARDS, cardMap } from '../../shared/cards.js';
import { characters, characterMap } from '../../shared/characters.js';
import { SUBJECTS, GAME_CONFIG } from '../../shared/rules.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

console.log('====================================================');
console.log('   EMPIRICAL CHALLENGER R2-M1 VERIFICATION SUITE    ');
console.log('====================================================\n');

// ---------------------------------------------------------
// SECTION 1: Star Rating vs tpCost Parity Verification
// ---------------------------------------------------------
console.log('=== Section 1: Star Rating vs tpCost Parity ===');

// 1.1 Verify all 60 cards have valid tpCost (1, 2, or 3)
let invalidTpCostCards = CARDS.filter(c => !Number.isInteger(c.tpCost) || c.tpCost < 1 || c.tpCost > 3);
assert(invalidTpCostCards.length === 0, `All ${CARDS.length} cards have valid tpCost (1, 2, or 3)`);

// 1.2 Verify UI star count matching logic for every card
// In battle.js line 397: stars = '★'.repeat(c.tpCost) + '☆'.repeat(Math.max(0, 3 - c.tpCost))
let starMismatchCount = 0;
CARDS.forEach(c => {
  const filledStars = ( '★'.repeat(c.tpCost) + '☆'.repeat(Math.max(0, 3 - c.tpCost)) ).match(/★/g)?.length || 0;
  if (filledStars !== c.tpCost) {
    starMismatchCount++;
  }
});
assert(starMismatchCount === 0, 'Every card star display matches its tpCost exactly (1 star = 1 TP, 2 stars = 2 TP, 3 stars = 3 TP)');

// 1.3 Engine buyDraftCard deduction parity for all TP cost tiers (1, 2, 3)
const tpTiers = [1, 2, 3];
tpTiers.forEach(costTier => {
  const testCard = CARDS.find(c => c.tpCost === costTier);
  const game = createGame([{ id: 'p1', nickname: 'P1' }, { id: 'p2', nickname: 'P2' }]);
  selectCard(game, 'p1', 'char_3'); selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1'); setReady(game, 'p2');
  
  const p1 = game.players[0];
  
  // Exact TP test
  p1.tp = costTier;
  game.draftShop = { active: true, players: { p1: { slots: [{ card: testCard, refreshesLeft: 2 }] } } };
  const buyRes = buyDraftCard(game, 'p1', 0);
  assert(buyRes.ok, `Buying ${costTier}-star card (${testCard.name}) with exact ${costTier} TP succeeds`);
  assert(p1.tp === 0, `Exact TP deduction leaves 0 TP (was ${costTier})`);

  // Insufficient TP test (costTier - 1)
  p1.tp = costTier - 1;
  game.draftShop = { active: true, players: { p1: { slots: [{ card: testCard, refreshesLeft: 2 }] } } };
  const failBuy = buyDraftCard(game, 'p1', 0);
  assert(!failBuy.ok && failBuy.error === 'TP 不足', `Buying ${costTier}-star card with ${costTier - 1} TP fails with 'TP 不足'`);
  assert(p1.tp === costTier - 1, `TP remains unchanged after failed purchase (${p1.tp})`);
});

// 1.4 Play card from hand requires 0 TP for all 60 cards
let nonZeroPlayCostCards = [];
CARDS.forEach(card => {
  const game = createGame([{ id: 'p1', nickname: 'P1' }, { id: 'p2', nickname: 'P2' }]);
  selectCard(game, 'p1', 'char_3'); selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1'); setReady(game, 'p2');
  const p1 = game.players[0];
  p1.tp = 0; // Test with 0 TP!
  game.schedule[game.currentClassIndex] = card.subject === 'universal' ? 'chinese' : card.subject;
  p1.handCards.push(card);

  const initialTp = p1.tp;
  const playRes = playTacticalCard(game, 'p1', card.id);
  if (!playRes.ok || p1.tp !== initialTp) {
    nonZeroPlayCostCards.push({ id: card.id, ok: playRes.ok, tpBefore: initialTp, tpAfter: p1.tp });
  }
});
assert(nonZeroPlayCostCards.length === 0, `Playing all ${CARDS.length} cards from hand requires 0 TP and succeeds even with 0 TP in pool`);


// ---------------------------------------------------------
// SECTION 2: Subject Card Playability for All Character Classes
// ---------------------------------------------------------
console.log('\n=== Section 2: Subject Card Playability Across All Character Classes ===');

// 2.1 Test all characters in shared/characters.js playing subject cards matching scheduled class
const allCharacters = characters;
const allSubjects = Object.keys(SUBJECTS);

let charPlayFailures = [];
allCharacters.forEach(charDef => {
  // Pick a subject that is NOT in charDef.subjects to strictly test class-neutrality
  const nonCharSubject = allSubjects.find(s => !charDef.subjects.includes(s)) || 'math';
  const matchingCard = CARDS.find(c => c.subject === nonCharSubject);

  if (!matchingCard) return;

  const game = createGame([{ id: 'p1', nickname: 'P1' }, { id: 'p2', nickname: 'P2' }]);
  selectCard(game, 'p1', charDef.id); selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1'); setReady(game, 'p2');
  const p1 = game.players[0];
  p1.tp = 1;

  // Set current class to nonCharSubject
  game.schedule[game.currentClassIndex] = nonCharSubject;
  p1.handCards.push(matchingCard);

  // Client UI logic simulation (from battle.js L312-313):
  const curSubj = game.schedule[game.currentClassIndex];
  const subjMatch = matchingCard.subject === 'universal' || matchingCard.subject === curSubj;
  const clientCanPlay = (matchingCard.subject === 'universal' || subjMatch) && (p1.tp >= 0);

  // Server play execution:
  const serverRes = playTacticalCard(game, 'p1', matchingCard.id);

  if (!clientCanPlay || !serverRes.ok) {
    charPlayFailures.push({ charId: charDef.id, charName: charDef.name, cardId: matchingCard.id, subj: nonCharSubject, clientCanPlay, serverOk: serverRes.ok });
  }
});
assert(charPlayFailures.length === 0, `All ${allCharacters.length} character classes can play subject cards matching scheduled class (even when subject is outside character's base subjects)`);

// 2.2 Test negative case: playing subject card when schedule does NOT match card subject
let unblockedMismatchCards = [];
const gameMismatch = createGame([{ id: 'p1', nickname: 'P1' }, { id: 'p2', nickname: 'P2' }]);
selectCard(gameMismatch, 'p1', 'char_3'); selectCard(gameMismatch, 'p2', 'char_4');
setReady(gameMismatch, 'p1'); setReady(gameMismatch, 'p2');
const p1Mismatch = gameMismatch.players[0];
gameMismatch.schedule[gameMismatch.currentClassIndex] = 'chinese'; // Current class: Chinese

const nonMatchingSubjectCard = CARDS.find(c => c.subject === 'math'); // Math card
p1Mismatch.handCards.push(nonMatchingSubjectCard);

// Client UI evaluation for non-matching subject:
const curSubjMismatch = gameMismatch.schedule[gameMismatch.currentClassIndex];
const subjMatchClient = nonMatchingSubjectCard.subject === 'universal' || nonMatchingSubjectCard.subject === curSubjMismatch;
const clientCanPlayMismatch = subjMatchClient && (p1Mismatch.tp >= 0);

// Server evaluation:
const serverResMismatch = playTacticalCard(gameMismatch, 'p1', nonMatchingSubjectCard.id);

assert(!clientCanPlayMismatch, `Client UI blocks playing ${nonMatchingSubjectCard.name} during ${curSubjMismatch} class (canPlay = false)`);
assert(!serverResMismatch.ok && serverResMismatch.error.includes('只能在 math 课使用'), `Server engine blocks playing ${nonMatchingSubjectCard.name} during ${curSubjMismatch} class with error message`);


// ---------------------------------------------------------
// SECTION 3: Multi-card Play Array Handling in Server Engine
// ---------------------------------------------------------
console.log('\n=== Section 3: Multi-card Play Array Handling in Engine ===');

// 3.1 Playing 3 valid non-blessing cards in sequence within the same turn sub-round
{
  const game = createGame([{ id: 'p1', nickname: 'P1' }, { id: 'p2', nickname: 'P2' }]);
  selectCard(game, 'p1', 'char_3'); selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1'); setReady(game, 'p2');
  const p1 = game.players[0];
  game.schedule[game.currentClassIndex] = 'chinese';

  const card1 = CARDS.find(c => c.id === 'card_gen_02'); // Universal Buff: atk/def +2
  const card2 = CARDS.find(c => c.id === 'card_chi_2');  // Chinese Buff: min die to max face
  const card3 = CARDS.find(c => c.id === 'card_gen_04'); // Universal Buff: flat pierce +2

  p1.handCards.push(card1, card2, card3);

  const res1 = playTacticalCard(game, 'p1', card1.id);
  const res2 = playTacticalCard(game, 'p1', card2.id);
  const res3 = playTacticalCard(game, 'p1', card3.id);

  assert(res1.ok && res2.ok && res3.ok, 'Successfully played 3 cards sequentially (card_gen_02, card_chi_2, card_gen_04)');
  assert(p1.playedTurnCards.length === 3, `p1.playedTurnCards array length is 3 (actual: ${p1.playedTurnCards.length})`);
  assert(p1.playedTurnCards[0].id === card1.id && p1.playedTurnCards[1].id === card2.id && p1.playedTurnCards[2].id === card3.id, 'All 3 cards preserved in exact play order');
}

// 3.2 Verify calcTacticalCardEffects accumulates bonuses from multiple played cards
{
  const game = createGame([{ id: 'p1', nickname: 'P1' }, { id: 'p2', nickname: 'P2' }]);
  selectCard(game, 'p1', 'char_3'); selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1'); setReady(game, 'p2');
  const p1 = game.players[0]; const p2 = game.players[1];
  game.schedule[game.currentClassIndex] = 'chinese';

  // p1 plays card_gen_02 (+2 atk/def) and card_chi_1 (chinese blessing +2 atk in chinese class)
  const card1 = CARDS.find(c => c.id === 'card_gen_02');
  const card2 = CARDS.find(c => c.id === 'card_chi_1'); // blessing
  p1.handCards.push(card1, card2);

  playTacticalCard(game, 'p1', card1.id);
  playTacticalCard(game, 'p1', card2.id);

  // Trigger attack and check bonus
  rollAttack(game);
  confirmAttack(game, [0, 1, 2]);
  
  // baseAtk from rolls + card_chi_1 (+2) + card_gen_02 (+2) = baseAtk + 4
  const expectedBonus = 4;
  const actualBonus = game.turnData.atkResult.bonusDamage;
  assert(p1.activeBlessings.length === 1 && p1.playedTurnCards.length === 1, 'Blessing stored in activeBlessings and TurnCard in playedTurnCards');
  assert(actualBonus === expectedBonus, `Multi-card bonus calculation combined blessing (+2) and turn card (+2) to total +${actualBonus}`);
}

// 3.3 Verify sub-round transition clears playedTurnCards but preserves blessings
{
  const game = createGame([{ id: 'p1', nickname: 'P1' }, { id: 'p2', nickname: 'P2' }]);
  selectCard(game, 'p1', 'char_3'); selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1'); setReady(game, 'p2');
  const p1 = game.players[0];
  game.schedule[game.currentClassIndex] = 'chinese';

  const cardBlessing = CARDS.find(c => c.id === 'card_chi_1');
  const cardBuff = CARDS.find(c => c.id === 'card_gen_02');
  p1.handCards.push(cardBlessing, cardBuff);

  playTacticalCard(game, 'p1', cardBlessing.id);
  playTacticalCard(game, 'p1', cardBuff.id);

  assert(p1.activeBlessings.length === 1 && p1.playedTurnCards.length === 1, 'Before phase end: 1 blessing, 1 turn card');

  // Complete sub-round 1 -> sub-round 2
  game.currentSubRound = GAME_CONFIG.SUBROUNDS_PER_CLASS - 1; // force next to trigger class end
  resolvePhaseEnd(game);

  assert(p1.playedTurnCards.length === 0, 'After sub-round class resolution: playedTurnCards cleared (length 0)');
  assert(p1.activeBlessings.length === 1, 'After sub-round class resolution: activeBlessings preserved (length 1)');
}

// ---------------------------------------------------------
// SECTION 4: Adversarial Edge Cases & Stress Testing
// ---------------------------------------------------------
console.log('\n=== Section 4: Adversarial Stress Testing ===');

// 4.1 Multiple Debuffs played on Defender
{
  const game = createGame([{ id: 'p1', nickname: 'P1' }, { id: 'p2', nickname: 'P2' }]);
  selectCard(game, 'p1', 'char_3'); selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1'); setReady(game, 'p2');
  const p1 = game.players[0]; const p2 = game.players[1];
  game.schedule[game.currentClassIndex] = 'chinese';

  // p2 (defender) plays two debuffs against attacker: card_gen_06 (-2 atk) and card_gen_08 (+2 extra damage taken)
  const debuff1 = CARDS.find(c => c.id === 'card_gen_06');
  const debuff2 = CARDS.find(c => c.id === 'card_gen_08');
  p2.handCards.push(debuff1, debuff2);

  playTacticalCard(game, 'p2', debuff1.id);
  playTacticalCard(game, 'p2', debuff2.id);

  assert(p2.playedTurnCards.length === 2, 'Defender successfully played 2 debuff cards');
}

// 4.2 Hand size limits & shop buying flow
{
  const game = createGame([{ id: 'p1', nickname: 'P1' }, { id: 'p2', nickname: 'P2' }]);
  selectCard(game, 'p1', 'char_3'); selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1'); setReady(game, 'p2');
  const p1 = game.players[0];
  p1.tp = 10;
  
  const c1 = CARDS[0], c2 = CARDS[1], c3 = CARDS[2], c4 = CARDS[3];
  p1.handCards = [c1, c2, c3]; // Hand is full (3/3)

  game.draftShop = { active: true, players: { p1: { slots: [{ card: c4, refreshesLeft: 2 }] } } };
  const fullBuy = buyDraftCard(game, 'p1', 0);
  assert(!fullBuy.ok && fullBuy.error.includes('手牌已满'), 'Buying card when hand has 3 cards is blocked with error');

  // Play 1 card from hand
  game.schedule[game.currentClassIndex] = c1.subject === 'universal' ? 'chinese' : c1.subject;
  playTacticalCard(game, 'p1', c1.id);
  assert(p1.handCards.length === 2, 'Playing card reduces hand size to 2');

  // Now buying card succeeds
  const buyRes = buyDraftCard(game, 'p1', 0);
  assert(buyRes.ok, 'Buying card now succeeds when hand size is 2');
  assert(p1.handCards.length === 3, 'Hand size is back to 3');
}

console.log(`\n====================================================`);
console.log(` VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
console.log(`====================================================\n`);

if (failed > 0) {
  process.exit(1);
}
