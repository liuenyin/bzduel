import { createGame, selectCard, setReady, playTacticalCard, buyDraftCard, confirmAttack, confirmDefense, rollAttack, rerollDice, getStateView, resolvePhaseEnd } from '../server/game/engine.js';
import { CARDS } from '../shared/cards.js';

console.log('=== Starting Hardened R2-M1 Integration Verification ===\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failCount++;
  }
}

function createTestGame(mode = '1v1') {
  const game = createGame([
    { id: 'p1', nickname: 'Player 1' },
    { id: 'p2', nickname: 'Player 2' }
  ], mode);
  selectCard(game, 'p1', 'char_3'); // atkSlots: 3, defSlots: 2, dicePool: [6, 6, 6, 8]
  selectCard(game, 'p2', 'char_4'); // atkSlots: 4, defSlots: 3, dicePool: [4, 4, 4, 6, 6]
  setReady(game, 'p1');
  setReady(game, 'p2');
  return game;
}

// Test 1: Pricing Parity - 1-star card costs 1 TP to buy, 0 TP to play from hand
console.log('--- Test 1: Pricing Parity ---');
{
  const game = createTestGame();
  const p1 = game.players[0];
  p1.tp = 5;
  const oneStarCard = CARDS.find(c => c.tpCost === 1);
  game.draftShop = {
    active: true,
    players: {
      p1: { slots: [{ card: oneStarCard, refreshesLeft: 2 }] }
    }
  };
  const buyRes = buyDraftCard(game, 'p1', 0);
  assert(buyRes.ok, 'Buying 1-star card succeeded');
  assert(p1.tp === 4, `TP deducted exactly 1: expected 4, got ${p1.tp}`);
  
  // Play from hand requires 0 TP
  game.schedule[game.currentClassIndex] = oneStarCard.subject === 'universal' ? 'chinese' : oneStarCard.subject;
  const initialTpBeforePlay = p1.tp;
  const playRes = playTacticalCard(game, 'p1', oneStarCard.id);
  assert(playRes.ok, `Playing card ${oneStarCard.id} from hand succeeded without errors`);
  assert(p1.tp === initialTpBeforePlay, `Playing card from hand required 0 TP (remains ${p1.tp})`);
}

// Test 2: Fix card_chi_2 (confirmDefense Recalculation Bypass for defender)
console.log('\n--- Test 2: card_chi_2 Defense Recalculation ---');
{
  const game = createTestGame();
  const p1 = game.players[0];
  const p2 = game.players[1];
  game.schedule[game.currentClassIndex] = 'chinese';

  const cardChi2 = CARDS.find(c => c.id === 'card_chi_2');
  p2.handCards.push(cardChi2);
  playTacticalCard(game, 'p2', 'card_chi_2');

  rollAttack(game);
  game.turnData.attackRolls = [2, 2, 4, 4];
  confirmAttack(game, [0, 1, 2]); // char_3 atkSlots: 3, finalAtk = 8

  // For p2 (char_4), defSlots is 3. Slots [3, 4, 0] has max face 6 for die index 3 (first kept die)
  game.turnData.defenseRolls = [1, 1, 1, 1, 1];
  const atkDamageBefore = game.turnData.atkResult.finalAtk;
  const p2HpBefore = p2.hp;

  const defRes = confirmDefense(game, 'p2', [3, 4, 0]); // char_4 defSlots: 3, index 3 max face is 6
  assert(defRes.ok, 'confirmDefense succeeded');
  
  // min die (1) at index 3 becomes 6 -> [6, 1, 1] sum 8
  assert(defRes.baseDef === 8, `card_chi_2 modified baseDef to 8 (actual: ${defRes.baseDef})`);
  assert(defRes.finalDef === 8, `card_chi_2 modified finalDef to 8 (actual: ${defRes.finalDef})`);
  const expectedDamage = Math.max(0, atkDamageBefore - 8);
  assert(defRes.damage === expectedDamage, `Combat damage calculated using card_chi_2 defense 8: expected ${expectedDamage}, got ${defRes.damage}`);
  assert(p2.hp === p2HpBefore - expectedDamage, `Defender HP accurately updated: expected ${p2HpBefore - expectedDamage}, got ${p2.hp}`);
}

// Test 3: Fix card_chi_3 (confirmDefense Recalculation for attacker debuff)
console.log('\n--- Test 3: card_chi_3 Attacker Debuff on Defense ---');
{
  const game = createTestGame();
  const p1 = game.players[0];
  const p2 = game.players[1];
  game.schedule[game.currentClassIndex] = 'chinese';

  const cardChi3 = CARDS.find(c => c.id === 'card_chi_3');
  p1.handCards.push(cardChi3);
  playTacticalCard(game, 'p1', 'card_chi_3');

  rollAttack(game);
  confirmAttack(game, [0, 1, 2]);

  // Force defender dice to [6, 6, 6, 6, 6]
  game.turnData.defenseRolls = [6, 6, 6, 6, 6];
  const defRes = confirmDefense(game, 'p2', [0, 1, 2]);
  assert(defRes.ok, 'confirmDefense succeeded with card_chi_3');
  // max die (6) in [6, 6, 6] becomes 2 -> [2, 6, 6] sum 14 (instead of 18)
  assert(defRes.baseDef === 14, `card_chi_3 reduced defender max roll to 2, baseDef = 14 (actual: ${defRes.baseDef})`);
}

// Test 4: card_eng_1 Rerolls
console.log('\n--- Test 4: card_eng_1 Rerolls Boost ---');
{
  const game = createTestGame();
  const p1 = game.players[0];
  game.schedule[game.currentClassIndex] = 'english';
  
  const initialRerolls = p1.rerolls;
  const eng1Card = CARDS.find(c => c.id === 'card_eng_1');
  p1.handCards.push(eng1Card);
  
  const playRes = playTacticalCard(game, 'p1', 'card_eng_1');
  assert(playRes.ok, 'played card_eng_1 in english class');
  assert(p1.rerolls === initialRerolls + 2, `card_eng_1 granted +2 rerolls: expected ${initialRerolls + 2}, got ${p1.rerolls}`);
}

// Test 5: card_his_2 Round Timing
console.log('\n--- Test 5: card_his_2 Previous Round Dice Timing ---');
{
  const game = createTestGame();
  const p1 = game.players[0];
  const p2 = game.players[1];
  game.schedule[0] = 'history';
  game.schedule[1] = 'history';

  // Sub-round 0: p1 attacks
  rollAttack(game);
  game.turnData.attackRolls = [2, 5, 6, 7]; // keep [1, 2, 3] -> 5, 6, 7 kept. Unused index 0 = 2.
  const atk1Res = confirmAttack(game, [1, 2, 3]);
  assert(atk1Res.ok, 'Sub-round 0 confirmAttack succeeded');
  const def1Res = confirmDefense(game, 'p2', [0, 1, 2]); // char_4 defSlots: 3
  assert(def1Res.ok, 'Sub-round 0 confirmDefense succeeded');

  assert(p1.prevUnusedDiceSum === 2, `prevUnusedDiceSum saved from Sub-round 0: expected 2, got ${p1.prevUnusedDiceSum}`);

  // Sub-round 1 (Class 0 turn 1): p2 attacks
  rollAttack(game);
  confirmAttack(game, [0, 1, 2, 3]);
  confirmDefense(game, 'p1', [0, 1]);

  // Sub-round 2 (Class 1 turn 0): p2 attacks (firstAttacker rotated to p2)
  rollAttack(game);
  confirmAttack(game, [0, 1, 2, 3]);
  confirmDefense(game, 'p1', [0, 1]);

  // Sub-round 3 (Class 1 turn 1): p1 attacks!
  const his2Card = CARDS.find(c => c.id === 'card_his_2');
  p1.handCards.push(his2Card);
  const cardRes = playTacticalCard(game, 'p1', 'card_his_2');
  assert(cardRes.ok, 'p1 played card_his_2 in history class');

  rollAttack(game);
  game.turnData.attackRolls = [4, 4, 4, 4];
  const atkRes = confirmAttack(game, [0, 1, 2]);
  assert(atkRes.ok, 'confirmAttack succeeded when p1 attacks');
  assert(atkRes.atkResult.bonusDamage >= 2, `card_his_2 added previous round unused dice sum (+2) to bonus damage (actual bonus: ${atkRes.atkResult.bonusDamage})`);
}

// Test 6: card_it_1 Blessing Execution
console.log('\n--- Test 6: card_it_1 Blessing Skill Copy ---');
{
  const game = createTestGame();
  const p1 = game.players[0];
  const p2 = game.players[1];
  game.schedule[game.currentClassIndex] = 'it';

  p1.card.positiveSkill = { id: 'star_showoff', name: '明星拉踩' };
  const it1Card = CARDS.find(c => c.id === 'card_it_1');
  p2.handCards.push(it1Card);

  const playRes = playTacticalCard(game, 'p2', 'card_it_1');
  assert(playRes.ok, 'p2 played card_it_1 blessing in IT class');
  assert(p2.card.positiveSkill?.id === 'star_showoff', `card_it_1 blessing copied p1 positive skill: expected star_showoff, got ${p2.card.positiveSkill?.id}`);
}

// Test 7: card_bio_3 Self and Opponent Real Damage
console.log('\n--- Test 7: card_bio_3 Self and Opponent Real Damage ---');
{
  const game = createTestGame();
  const p1 = game.players[0];
  const p2 = game.players[1];
  p1.hp = 30;
  p2.hp = 30;
  game.schedule[game.currentClassIndex] = 'biology';

  const bio3Card = CARDS.find(c => c.id === 'card_bio_3');
  p1.handCards.push(bio3Card);

  const playRes = playTacticalCard(game, 'p1', 'card_bio_3');
  assert(playRes.ok, 'p1 played card_bio_3');
  // 30% of 30 is 9. Self hp = 21, opponent hp = 21.
  assert(p1.hp === 21, `p1 self HP cost 30%: expected 21, got ${p1.hp}`);
  assert(p2.hp === 21, `p2 opponent took equal real damage: expected 21, got ${p2.hp}`);
}

// Test 8: card_gen_14 logic (grants 2 TP on 0 defense damage)
console.log('\n--- Test 8: card_gen_14 Defense 0 Damage TP Gain ---');
{
  const game = createTestGame();
  const p1 = game.players[0];
  const p2 = game.players[1];
  p2.tp = 2;
  
  const gen14Card = CARDS.find(c => c.id === 'card_gen_14');
  p2.handCards.push(gen14Card);
  
  game.schedule[game.currentClassIndex] = 'chinese';
  playTacticalCard(game, 'p2', 'card_gen_14');

  rollAttack(game);
  confirmAttack(game, [0, 1, 2]);
  
  // Force high defense so damage is 0
  game.turnData.defenseRolls = [10, 10, 10, 10, 10];
  const defRes = confirmDefense(game, 'p2', [0, 1, 2]);
  assert(defRes.ok, 'Defense confirmed');
  assert(defRes.damage === 0, `Damage taken is 0 (actual: ${defRes.damage})`);
  assert(p2.tp === 4, `p2 granted +2 TP for 0 defense damage: expected 4, got ${p2.tp}`);
}

// Test 9: card_gen_15 Damage-Triggered Card Draw
console.log('\n--- Test 9: card_gen_15 Damage-Triggered Draw ---');
{
  const game = createTestGame();
  const p1 = game.players[0];
  const p2 = game.players[1];
  game.schedule[game.currentClassIndex] = 'chinese';

  const gen15Card = CARDS.find(c => c.id === 'card_gen_15');
  p1.handCards = [gen15Card]; // 1 card in hand

  playTacticalCard(game, 'p1', 'card_gen_15');
  assert(p1.handCards.length === 0, `card_gen_15 did NOT instantly draw a card on play (handCards length: 0)`);

  // Attack with damage > 0
  rollAttack(game);
  confirmAttack(game, [0, 1, 2]);
  game.turnData.defenseRolls = [1, 1, 1, 1, 1]; // Low defense -> damage > 0
  confirmDefense(game, 'p2', [0, 1, 2]);

  assert(p1.handCards.length === 1, `card_gen_15 drew 1 card after dealing combat damage: expected 1 card in hand, got ${p1.handCards.length}`);
}

// Test 10: playedTurnCards Lifecycle (cleared every turn resolution)
console.log('\n--- Test 10: playedTurnCards Lifecycle ---');
{
  const game = createTestGame();
  const p1 = game.players[0];
  game.schedule[game.currentClassIndex] = 'chinese';

  const card1 = CARDS.find(c => c.id === 'card_gen_02');
  p1.handCards.push(card1);
  playTacticalCard(game, 'p1', 'card_gen_02');
  assert(p1.playedTurnCards.length === 1, 'playedTurnCards has 1 card during active turn');

  // Complete sub-round 0 turn
  rollAttack(game);
  confirmAttack(game, [0, 1, 2]);
  confirmDefense(game, 'p2', [0, 1, 2]);

  assert(p1.playedTurnCards.length === 0, `playedTurnCards cleared at sub-round turn resolution: expected 0, got ${p1.playedTurnCards.length}`);
}

// Test 11: All 26 tactical cards playable without JS exceptions
console.log('\n--- Test 11: Verify 26 tactical cards playable ---');
{
  const unhandled26 = [
    'card_chi_2', 'card_chi_3', 'card_mat_1', 'card_mat_3', 'card_eng_1', 'card_eng_3',
    'card_phy_3', 'card_che_1', 'card_bio_2', 'card_his_2', 'card_his_3', 'card_geo_3',
    'card_mus_3', 'card_art_1', 'card_art_2', 'card_art_3', 'card_it_1', 'card_it_3',
    'card_tec_2', 'card_tec_3', 'card_pe_1', 'card_pe_3', 'card_stu_1', 'card_stu_2',
    'card_gen_01', 'card_gen_13'
  ];

  unhandled26.forEach(cid => {
    const game = createTestGame();
    const p1 = game.players[0];
    const card = CARDS.find(c => c.id === cid);
    game.schedule[game.currentClassIndex] = card.subject === 'universal' ? 'chinese' : card.subject;
    p1.handCards.push(card);
    const res = playTacticalCard(game, 'p1', cid);
    assert(res.ok, `Card ${cid} (${card.name}) played without errors`);
  });
}

console.log(`\n=== Verification Complete: ${passCount} PASSED, ${failCount} FAILED ===`);
if (failCount > 0) {
  process.exit(1);
}
