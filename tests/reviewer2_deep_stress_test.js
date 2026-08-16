import { 
  createGame, selectCard, setReady, playTacticalCard, buyDraftCard, 
  confirmAttack, confirmDefense, rollAttack, rerollDice, getStateView, resolvePhaseEnd, selectTarget 
} from '../server/game/engine.js';
import { GAME_MODE } from '../shared/rules.js';
import { CARDS } from '../shared/cards.js';

console.log('=== Reviewer 2 Independent Deep Stress Test Suite ===\n');

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

// Helper to advance game until a specific player is attacker
function advanceUntilAttacker(game, targetPlayerIdx) {
  let safety = 0;
  while (game.turnData.attackerIdx !== targetPlayerIdx && safety < 10) {
    const atkIdx = game.turnData.attackerIdx;
    const defIdx = 1 - atkIdx;
    const atkP = game.players[atkIdx];
    const defP = game.players[defIdx];

    rollAttack(game);
    const atkSlots = atkP.card.atkSlots === -1 ? atkP.card.dicePool.length : atkP.card.atkSlots;
    confirmAttack(game, Array.from({ length: atkSlots }, (_, i) => i));
    const defSlots = defP.card.defSlots;
    confirmDefense(game, defP.id, Array.from({ length: defSlots }, (_, i) => i));
    safety++;
  }
}

// 1. Defect 1: confirmDefense recalculation (1v1 and AoE)
console.log('--- 1. Testing confirmDefense recalculation (card_chi_2 & card_chi_3) ---');
{
  // 1v1 dual card test
  const game = createGame([
    { id: 'p1', nickname: 'P1' },
    { id: 'p2', nickname: 'P2' }
  ], GAME_MODE.MODE_1V1);
  selectCard(game, 'p1', 'char_3'); // dicePool: [6,6,6,8]
  selectCard(game, 'p2', 'char_4'); // dicePool: [4,4,4,6,6]
  setReady(game, 'p1');
  setReady(game, 'p2');
  game.schedule[game.currentClassIndex] = 'chinese';

  // P1 plays card_chi_3 (debuff opponent max die to 2)
  const chi3 = CARDS.find(c => c.id === 'card_chi_3');
  game.players[0].handCards.push(chi3);
  playTacticalCard(game, 'p1', 'card_chi_3');

  // P2 plays card_chi_2 (buff min die to max face)
  const chi2 = CARDS.find(c => c.id === 'card_chi_2');
  game.players[1].handCards.push(chi2);
  playTacticalCard(game, 'p2', 'card_chi_2');

  rollAttack(game);
  game.turnData.attackRolls = [5, 5, 5, 5];
  confirmAttack(game, [0, 1, 2]); // atk = 15

  // P2 defRolls = [1, 5, 1, 1, 1], defSlots = 3 -> keepIndices [0, 1, 2] -> rolls [1, 5, 1]
  // card_chi_2 changes min (1 at index 0) to maxFace (4 for index 0) -> [4, 5, 1]
  // card_chi_3 changes max (5 at index 1) to 2 -> [4, 2, 1] -> sum = 7
  game.turnData.defenseRolls = [1, 5, 1, 1, 1];
  const defRes = confirmDefense(game, 'p2', [0, 1, 2]);
  assert(defRes.ok, 'confirmDefense with dual cards succeeded');
  assert(defRes.baseDef === 7, `Base defense recalculated to 7 (actual: ${defRes.baseDef})`);
  assert(defRes.finalDef === 7, `Final defense recalculated to 7 (actual: ${defRes.finalDef})`);
  assert(defRes.damage === 8, `Damage calculated using 15 - 7 = 8 (actual: ${defRes.damage})`);
  assert(game.players[1].hp === game.players[1].maxHp - 8, `P2 HP properly deducted 8 (actual HP: ${game.players[1].hp})`);
}

// 1b. AoE Mode confirmDefense recalculation
{
  const game = createGame([
    { id: 'p1', nickname: 'P1' },
    { id: 'p2', nickname: 'P2' },
    { id: 'p3', nickname: 'P3' }
  ], GAME_MODE.MODE_FFA);
  selectCard(game, 'p1', 'char_13'); // char_13 (Rapper) trigger AoE
  selectCard(game, 'p2', 'char_4');  // defSlots = 3
  selectCard(game, 'p3', 'char_3');  // defSlots = 2
  setReady(game, 'p1'); setReady(game, 'p2'); setReady(game, 'p3');
  game.schedule[game.currentClassIndex] = 'chinese';

  // P2 plays card_chi_2
  const chi2 = CARDS.find(c => c.id === 'card_chi_2');
  game.players[1].handCards.push(chi2);
  playTacticalCard(game, 'p2', 'card_chi_2');

  // Select target in FFA
  const targetRes = selectTarget(game, 'p1', 'p2');
  assert(targetRes.ok, 'Target selected in FFA mode');

  const atkRollRes = rollAttack(game);
  assert(atkRollRes.ok, 'rollAttack succeeded in FFA mode');
  confirmAttack(game, [0, 1, 2]);

  // Set P2 defense rolls to [1, 1, 1, 1, 1] -> slots [0, 1, 2] -> min die index 0 becomes maxFace 4 -> [4, 1, 1] sum = 6
  game.turnData.aoeDefenses['p2'].rolls = [1, 1, 1, 1, 1];
  game.turnData.aoeDefenses['p3'].rolls = [2, 2, 2, 2];

  confirmDefense(game, 'p2', [0, 1, 2]);
  const aoeRes = confirmDefense(game, 'p3', [0, 1]); // char_3 defSlots = 2
  assert(aoeRes.ok && aoeRes.isAoE, 'AoE confirmDefense succeeded');
  const p2Result = aoeRes.aoeResults.find(r => r.playerId === 'p2');
  assert(p2Result.baseDef === 6, `AoE P2 baseDef recalculated with card_chi_2 to 6 (actual: ${p2Result.baseDef})`);
  assert(p2Result.finalDef === 6, `AoE P2 finalDef recalculated to 6 (actual: ${p2Result.finalDef})`);
}

// 2. Defect 2: card_eng_1 +2 rerolls & immunity
console.log('\n--- 2. Testing card_eng_1 +2 rerolls & immunity ---');
{
  const game = createGame([
    { id: 'p1', nickname: 'P1' },
    { id: 'p2', nickname: 'P2' }
  ], GAME_MODE.MODE_1V1);
  selectCard(game, 'p1', 'char_19'); // YZM (char_19, has negative skill ROYAL_ETIQUETTE: self-damage on rolling 1)
  selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1'); setReady(game, 'p2');
  game.schedule[game.currentClassIndex] = 'english';

  const initialRerolls = game.players[0].rerolls;
  const eng1 = CARDS.find(c => c.id === 'card_eng_1');
  game.players[0].handCards.push(eng1);

  playTacticalCard(game, 'p1', 'card_eng_1');
  assert(game.players[0].rerolls === initialRerolls + 2, `card_eng_1 granted +2 rerolls: ${initialRerolls} -> ${game.players[0].rerolls}`);

  rollAttack(game);
  game.turnData.attackRolls = [1, 5, 5, 5, 5];
  const hpBefore = game.players[0].hp;
  // Reroll index 0 to 1 -> normally triggers ROYAL_ETIQUETTE self-damage, but card_eng_1 immune
  const rerollRes = rerollDice(game, 'p1', [0]);
  assert(rerollRes.ok, 'Reroll succeeded under card_eng_1');
  assert(game.players[0].hp === hpBefore, `Immune to ROYAL_ETIQUETTE self-damage: HP remained ${hpBefore}`);
}

// 3. Defect 3: card_his_2 prevUnusedDiceSum timing across multiple sub-rounds
console.log('\n--- 3. Testing card_his_2 prevUnusedDiceSum timing ---');
{
  const game = createGame([
    { id: 'p1', nickname: 'P1' },
    { id: 'p2', nickname: 'P2' }
  ], GAME_MODE.MODE_1V1);
  selectCard(game, 'p1', 'char_3'); // 4 dice
  selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1'); setReady(game, 'p2');
  game.schedule[0] = 'history';
  game.schedule[1] = 'history';

  // Subround 0: P1 attacks, rolls [2, 5, 6, 7], keeps [1, 2, 3] -> unused index 0 = 2
  rollAttack(game);
  game.turnData.attackRolls = [2, 5, 6, 7];
  confirmAttack(game, [1, 2, 3]);
  confirmDefense(game, 'p2', [0, 1, 2]);

  assert(game.players[0].prevUnusedDiceSum === 2, `prevUnusedDiceSum preserved after Subround 0: ${game.players[0].prevUnusedDiceSum}`);

  // Subround 1: P2 attacks, P1 defends with rolls [1, 1, 5, 5], keeps [0, 1] -> unused dice [2, 3] sum 10
  rollAttack(game);
  confirmAttack(game, [0, 1, 2, 3]);
  game.turnData.defenseRolls = [1, 1, 5, 5];
  confirmDefense(game, 'p1', [0, 1]); // char_3 defSlots = 2

  assert(game.players[0].prevUnusedDiceSum === 10, `prevUnusedDiceSum updated after Subround 1 defense: ${game.players[0].prevUnusedDiceSum}`);

  // Subround 2: Class rotated to Class 1 turn 0 (P2 attacks). P1 defends with rolls [1, 1, 4, 4], keeps [0, 1] -> unused dice [2, 3] sum 8
  rollAttack(game);
  confirmAttack(game, [0, 1, 2, 3]);
  game.turnData.defenseRolls = [1, 1, 4, 4];
  confirmDefense(game, 'p1', [0, 1]);

  assert(game.players[0].prevUnusedDiceSum === 8, `prevUnusedDiceSum updated after Subround 2 defense: ${game.players[0].prevUnusedDiceSum}`);

  // Subround 3: P1 attacks with card_his_2
  const his2 = CARDS.find(c => c.id === 'card_his_2');
  game.players[0].handCards.push(his2);
  playTacticalCard(game, 'p1', 'card_his_2');

  rollAttack(game);
  game.turnData.attackRolls = [3, 3, 3, 3]; // keeps [0, 1, 2] -> current unused sum is 3
  const atkRes = confirmAttack(game, [0, 1, 2]);
  assert(atkRes.ok, 'P1 confirmAttack with card_his_2 succeeded');
  // Bonus damage MUST use prevUnusedDiceSum (8), NOT current unused sum (3)
  assert(atkRes.atkResult.bonusDamage === 8, `card_his_2 used prevUnusedDiceSum (8), bonusDamage = ${atkRes.atkResult.bonusDamage}`);
}

// 4. Defect 4: card_it_1 blessing execution
console.log('\n--- 4. Testing card_it_1 blessing execution ---');
{
  const game = createGame([
    { id: 'p1', nickname: 'P1' },
    { id: 'p2', nickname: 'P2' }
  ], GAME_MODE.MODE_1V1);
  selectCard(game, 'p1', 'char_4'); // WHD (char_4, star_showoff skill, dicePool [4,4,4,6,6])
  selectCard(game, 'p2', 'char_11');
  setReady(game, 'p1'); setReady(game, 'p2');
  game.schedule[game.currentClassIndex] = 'it';

  const it1 = CARDS.find(c => c.id === 'card_it_1');
  game.players[1].handCards.push(it1);

  const playRes = playTacticalCard(game, 'p2', 'card_it_1');
  assert(playRes.ok, 'P2 played card_it_1 blessing');
  assert(game.players[1].activeBlessings.some(c => c.id === 'card_it_1'), 'card_it_1 added to activeBlessings');
  assert(game.players[1].card.positiveSkill?.id === 'star_showoff', `Copied positiveSkill: ${game.players[1].card.positiveSkill?.id}`);
  assert(JSON.stringify(game.players[1].card.dicePool) === JSON.stringify([4,4,4,6,6]), `Copied dicePool: ${JSON.stringify(game.players[1].card.dicePool)}`);
}

// 5. Defect 5: card_bio_3 opponent damage with various HP levels
console.log('\n--- 5. Testing card_bio_3 opponent damage ---');
{
  const hpTests = [
    { p1Hp: 40, p2Hp: 30, expectedCost: 12, expectedRealDmg: 10 }, // 30% of 40 = 12, capped at 10
    { p1Hp: 20, p2Hp: 30, expectedCost: 6, expectedRealDmg: 6 },   // 30% of 20 = 6
    { p1Hp: 5, p2Hp: 30, expectedCost: 1, expectedRealDmg: 1 },    // 30% of 5 = 1
  ];

  hpTests.forEach(({ p1Hp, p2Hp, expectedCost, expectedRealDmg }) => {
    const game = createGame([
      { id: 'p1', nickname: 'P1' },
      { id: 'p2', nickname: 'P2' }
    ], GAME_MODE.MODE_1V1);
    selectCard(game, 'p1', 'char_3'); selectCard(game, 'p2', 'char_4');
    setReady(game, 'p1'); setReady(game, 'p2');
    game.schedule[game.currentClassIndex] = 'biology';

    game.players[0].hp = p1Hp;
    game.players[1].hp = p2Hp;
    const bio3 = CARDS.find(c => c.id === 'card_bio_3');
    game.players[0].handCards.push(bio3);

    playTacticalCard(game, 'p1', 'card_bio_3');
    assert(game.players[0].hp === p1Hp - expectedCost, `P1 HP cost: ${p1Hp} -> ${game.players[0].hp} (expected ${p1Hp - expectedCost})`);
    assert(game.players[1].hp === p2Hp - expectedRealDmg, `P2 HP damage: ${p2Hp} -> ${game.players[1].hp} (expected ${p2Hp - expectedRealDmg})`);
  });
}

// 6. Defect 6: card_gen_15 damage-triggered draw (1v1 and AoE)
console.log('\n--- 6. Testing card_gen_15 damage-triggered draw ---');
{
  // 1v1: 0 damage vs >0 damage
  const game = createGame([
    { id: 'p1', nickname: 'P1' },
    { id: 'p2', nickname: 'P2' }
  ], GAME_MODE.MODE_1V1);
  selectCard(game, 'p1', 'char_3'); selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1'); setReady(game, 'p2');
  game.schedule[game.currentClassIndex] = 'chinese';

  const gen15 = CARDS.find(c => c.id === 'card_gen_15');
  game.players[0].handCards = [gen15];

  playTacticalCard(game, 'p1', 'card_gen_15');
  assert(game.players[0].handCards.length === 0, 'No card drawn immediately on play');

  rollAttack(game);
  confirmAttack(game, [0, 1, 2]);

  // Case A: Defense absorbs all damage -> 0 damage
  game.turnData.defenseRolls = [10, 10, 10, 10, 10];
  confirmDefense(game, 'p2', [0, 1, 2]);
  assert(game.players[0].handCards.length === 0, 'No card drawn when combat damage is 0');

  // Advance turns until P1 is attacker again:
  advanceUntilAttacker(game, 0);

  // Now turn is P1's turn again. P1 plays card_gen_15 and attacks with damage > 0:
  game.players[0].handCards.push(gen15);
  playTacticalCard(game, 'p1', 'card_gen_15');
  rollAttack(game);
  confirmAttack(game, [0, 1, 2]);
  game.turnData.defenseRolls = [1, 1, 1, 1, 1];
  confirmDefense(game, 'p2', [0, 1, 2]);
  assert(game.players[0].handCards.length === 1, 'Card drawn when combat damage > 0');
}

// 7. Defect 7: playedTurnCards subround reset
console.log('\n--- 7. Testing playedTurnCards subround reset ---');
{
  const game = createGame([
    { id: 'p1', nickname: 'P1' },
    { id: 'p2', nickname: 'P2' }
  ], GAME_MODE.MODE_1V1);
  selectCard(game, 'p1', 'char_3'); // defSlots = 2
  selectCard(game, 'p2', 'char_4'); // defSlots = 3
  setReady(game, 'p1'); setReady(game, 'p2');
  game.schedule[game.currentClassIndex] = 'chinese';

  for (let sr = 0; sr < 3; sr++) {
    const card = CARDS.find(c => c.id === 'card_gen_02');
    const activePlayerIdx = game.turnData.attackerIdx;
    const activeP = game.players[activePlayerIdx];
    activeP.handCards.push(card);
    playTacticalCard(game, activeP.id, 'card_gen_02');

    assert(activeP.playedTurnCards.length === 1, `Subround ${sr}: playedTurnCards has 1 card before resolution`);

    rollAttack(game);
    const atkSlots = activeP.card.atkSlots === -1 ? activeP.card.dicePool.length : activeP.card.atkSlots;
    confirmAttack(game, Array.from({ length: atkSlots }, (_, i) => i));

    const defP = game.players[1 - activePlayerIdx];
    const defSlots = defP.card.defSlots;
    confirmDefense(game, defP.id, Array.from({ length: defSlots }, (_, i) => i));

    assert(activeP.playedTurnCards.length === 0, `Subround ${sr}: playedTurnCards reset to 0 after resolution`);
    assert(activeP.playedTurnCard === null, `Subround ${sr}: playedTurnCard reset to null after resolution`);
  }
}

// 8. Defect 8: card_gen_14 AoE mode support (+2 TP on 0 defense damage)
console.log('\n--- 8. Testing card_gen_14 AoE mode support ---');
{
  const game = createGame([
    { id: 'p1', nickname: 'P1' },
    { id: 'p2', nickname: 'P2' },
    { id: 'p3', nickname: 'P3' }
  ], GAME_MODE.MODE_FFA);
  selectCard(game, 'p1', 'char_13'); // Rapper (AoE)
  selectCard(game, 'p2', 'char_4');  // defSlots = 3
  selectCard(game, 'p3', 'char_3');  // defSlots = 2
  setReady(game, 'p1'); setReady(game, 'p2'); setReady(game, 'p3');
  game.schedule[game.currentClassIndex] = 'chinese';

  game.players[1].tp = 0; // P2
  game.players[2].tp = 0; // P3

  // P2 plays card_gen_14
  const gen14 = CARDS.find(c => c.id === 'card_gen_14');
  game.players[1].handCards.push(gen14);
  playTacticalCard(game, 'p2', 'card_gen_14');

  selectTarget(game, 'p1', 'p2');

  rollAttack(game);
  confirmAttack(game, [0, 1, 2]);

  // P2 defRolls = [10, 10, 10, 10] -> damage 0
  // P3 defRolls = [1, 1, 1, 1] -> damage > 0
  game.turnData.aoeDefenses['p2'].rolls = [10, 10, 10, 10];
  game.turnData.aoeDefenses['p3'].rolls = [1, 1, 1, 1];

  confirmDefense(game, 'p2', [0, 1, 2]);
  confirmDefense(game, 'p3', [0, 1]); // char_3 defSlots = 2

  assert(game.players[1].tp === 2, `P2 with card_gen_14 and 0 damage gained +2 TP in AoE mode (actual TP: ${game.players[1].tp})`);
  assert(game.players[2].tp === 0, `P3 without card_gen_14 stayed at 0 TP (actual TP: ${game.players[2].tp})`);
}

console.log(`\n=== Deep Stress Test Complete: ${passCount} PASSED, ${failCount} FAILED ===`);
if (failCount > 0) {
  process.exit(1);
}
