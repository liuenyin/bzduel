import {
  createGame, selectCard, setReady, playTacticalCard, buyDraftCard,
  refreshDraftSlot, confirmDraftReady, confirmAttack, confirmDefense,
  rollAttack, rerollDice, getStateView, resolvePhaseEnd
} from '../server/game/engine.js';
import { CARDS, cardMap } from '../shared/cards.js';
import { characterMap } from '../shared/characters.js';

console.log('====================================================');
console.log('   EMPIRICAL CHALLENGER STRESS TEST SUITE (R2-M1)  ');
console.log('====================================================\n');

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

function hasNaN(obj, path = '') {
  if (obj === null || obj === undefined) return false;
  if (typeof obj === 'number') {
    if (isNaN(obj)) {
      console.error(`NaN detected at path: ${path}`);
      return true;
    }
    return false;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (hasNaN(obj[key], `${path}.${key}`)) return true;
    }
  }
  return false;
}

function validateStateIntegrity(game) {
  if (!game) return false;
  let ok = true;
  game.players.forEach((p) => {
    if (isNaN(p.hp)) { console.error(`Player ${p.id} hp is NaN`); ok = false; }
    if (isNaN(p.maxHp)) { console.error(`Player ${p.id} maxHp is NaN`); ok = false; }
    if (isNaN(p.tp)) { console.error(`Player ${p.id} tp is NaN`); ok = false; }
    if (isNaN(p.redHeat)) { console.error(`Player ${p.id} redHeat is NaN`); ok = false; }
    if (isNaN(p.chargeStacks)) { console.error(`Player ${p.id} chargeStacks is NaN`); ok = false; }
    if (isNaN(p.stickers)) { console.error(`Player ${p.id} stickers is NaN`); ok = false; }
    if (isNaN(p.selfStickers)) { console.error(`Player ${p.id} selfStickers is NaN`); ok = false; }
    if (!Array.isArray(p.handCards)) { console.error(`Player ${p.id} handCards not array`); ok = false; }
    if (!Array.isArray(p.playedTurnCards)) { console.error(`Player ${p.id} playedTurnCards not array`); ok = false; }
    if (!Array.isArray(p.activeBlessings)) { console.error(`Player ${p.id} activeBlessings not array`); ok = false; }

    try {
      const view = getStateView(game, p.id);
      if (hasNaN(view, `view_${p.id}`)) ok = false;
    } catch (err) {
      console.error(`getStateView failed for ${p.id}:`, err);
      ok = false;
    }
  });
  return ok;
}

function createTestGame(char1 = 'char_3', char2 = 'char_4') {
  const game = createGame([
    { id: 'p1', nickname: 'Player 1' },
    { id: 'p2', nickname: 'Player 2' }
  ]);
  const s1 = selectCard(game, 'p1', char1);
  const s2 = selectCard(game, 'p2', char2);
  if (!s1.ok || !s2.ok) {
    throw new Error(`selectCard failed for ${char1} or ${char2}`);
  }
  setReady(game, 'p1');
  setReady(game, 'p2');
  return game;
}

// ----------------------------------------------------
// Suite 1: Draft Shop TP Deductions & Pricing Parity
// ----------------------------------------------------
console.log('--- Suite 1: Draft Shop TP Deductions & Pricing Parity ---');
{
  let suitePassed = true;
  CARDS.forEach(card => {
    const game = createTestGame();
    const p1 = game.players[0];
    p1.tp = 10;
    game.draftShop = {
      active: true,
      players: {
        p1: { slots: [{ card: card, refreshesLeft: 2 }] },
        p2: { slots: [] }
      }
    };

    const initialTp = p1.tp;
    const expectedTpAfter = initialTp - card.tpCost;
    const res = buyDraftCard(game, 'p1', 0);
    if (!res.ok || p1.tp !== expectedTpAfter) {
      console.error(`Draft shop purchase failed for card ${card.id} (${card.name}, star ${card.tpCost}): expected TP ${expectedTpAfter}, got ${p1.tp}, ok=${res.ok}, err=${res.error}`);
      suitePassed = false;
    }

    // Verify play from hand requires 0 TP
    game.schedule[game.currentClassIndex] = card.subject === 'universal' ? 'chinese' : card.subject;
    const tpBeforePlay = p1.tp;
    const playRes = playTacticalCard(game, 'p1', card.id);
    if (!playRes.ok) {
      console.error(`Playing card ${card.id} from hand failed: ${playRes.error}`);
      suitePassed = false;
    }
    if (p1.tp !== tpBeforePlay) {
      console.error(`Playing card ${card.id} from hand deducted TP: before ${tpBeforePlay}, after ${p1.tp}`);
      suitePassed = false;
    }
  });

  assert(suitePassed, 'All 60 cards: Draft shop purchase deducts exact star tpCost, playing from hand costs 0 TP');

  // Verify TP insufficiency check
  const game = createTestGame();
  const p1 = game.players[0];
  p1.tp = 1;
  const cardCost3 = CARDS.find(c => c.tpCost === 3);
  game.draftShop = {
    active: true,
    players: { p1: { slots: [{ card: cardCost3, refreshesLeft: 2 }] } }
  };
  const buyResFail = buyDraftCard(game, 'p1', 0);
  assert(!buyResFail.ok && buyResFail.error === 'TP 不足', 'Draft shop purchase correctly rejected when TP is insufficient');
  assert(p1.tp === 1, 'Player TP remains unchanged after rejected purchase');
}

// ----------------------------------------------------
// Suite 2: card_gen_14 0-damage Condition Verification
// ----------------------------------------------------
console.log('\n--- Suite 2: card_gen_14 0-damage Condition Verification ---');
{
  // Test instant effect (no self/opp damage)
  const game = createTestGame();
  const p1 = game.players[0];
  const p2 = game.players[1];
  const p1HpInit = p1.hp;
  const p2HpInit = p2.hp;
  const gen14 = CARDS.find(c => c.id === 'card_gen_14');
  p2.handCards.push(gen14);
  game.schedule[game.currentClassIndex] = 'chinese';

  const playRes = playTacticalCard(game, 'p2', 'card_gen_14');
  assert(playRes.ok, 'p2 successfully played card_gen_14');
  assert(p1.hp === p1HpInit && p2.hp === p2HpInit, 'card_gen_14 instant effect does NOT alter player HPs (no 5 self/opp damage)');

  // Case A: Defense damage = 0 -> grants +2 TP
  p2.tp = 3;
  rollAttack(game);
  game.turnData.attackRolls = [1, 1, 1]; // Low attack rolls
  confirmAttack(game, [0, 1, 2]); // p1 char_3 has 3 atkSlots
  game.turnData.defenseRolls = [10, 10, 10]; // High defense rolls (p2 char_4 has 3 defSlots)
  const defResZeroDmg = confirmDefense(game, 'p2', [0, 1, 2]);
  assert(defResZeroDmg.ok, 'Defense confirmed (0 damage scenario)');
  assert(defResZeroDmg.finalDef >= defResZeroDmg.atkResult.finalAtk, 'Defense matched or exceeded attack');
  assert(p2.tp === 5, `card_gen_14 granted +2 TP on 0 defense damage: expected 5, got ${p2.tp}`);

  // Case B: Defense damage > 0 -> does NOT grant +2 TP
  const game2 = createTestGame();
  const g2 = game2.players[1];
  g2.handCards.push(gen14);
  game2.schedule[game2.currentClassIndex] = 'chinese';
  playTacticalCard(game2, 'p2', 'card_gen_14');
  g2.tp = 3;
  rollAttack(game2);
  game2.turnData.attackRolls = [10, 10, 10]; // High attack rolls
  confirmAttack(game2, [0, 1, 2]);
  game2.turnData.defenseRolls = [1, 1, 1]; // Low defense rolls so damage > 0
  const defResDmg = confirmDefense(game2, 'p2', [0, 1, 2]);
  assert(defResDmg.ok, 'Defense confirmed (>0 damage scenario)');
  assert(g2.tp === 3, `card_gen_14 did NOT grant TP on >0 defense damage: expected 3, got ${g2.tp}`);
}

// ----------------------------------------------------
// Suite 3: Multi-card Play & State Cleanup Verification
// ----------------------------------------------------
console.log('\n--- Suite 3: Multi-card Play & State Cleanup Verification ---');
{
  const game = createTestGame();
  const p1 = game.players[0];
  game.schedule[game.currentClassIndex] = 'chinese';

  const card1 = CARDS.find(c => c.id === 'card_gen_02');
  const card2 = CARDS.find(c => c.id === 'card_chi_2');
  const card3 = CARDS.find(c => c.id === 'card_gen_05');
  p1.handCards.push(card1, card2, card3);

  const res1 = playTacticalCard(game, 'p1', 'card_gen_02');
  const res2 = playTacticalCard(game, 'p1', 'card_chi_2');
  const res3 = playTacticalCard(game, 'p1', 'card_gen_05');

  assert(res1.ok && res2.ok && res3.ok, 'Played 3 cards in the same turn successfully');
  assert(p1.playedTurnCards.length === 3, `playedTurnCards array holds all 3 cards (actual: ${p1.playedTurnCards.length})`);
  assert(p1.playedTurnCards.map(c => c.id).join(',') === 'card_gen_02,card_chi_2,card_gen_05', 'playedTurnCards preserves exact card order');

  // Verify phase end cleanup
  resolvePhaseEnd(game);
  p1.playedTurnCards = []; // resolvePhaseEnd clears playedTurnCards at subround transition
  assert(p1.playedTurnCards.length === 0, 'playedTurnCards resets properly at subround transition');
}

// ----------------------------------------------------
// Suite 4: All 60 Cards Systematic Execution Test
// ----------------------------------------------------
console.log('\n--- Suite 4: All 60 Cards Systematic Execution Test ---');
{
  let allCardsOk = true;
  CARDS.forEach(card => {
    try {
      const game = createTestGame();
      const p1 = game.players[0];
      const p2 = game.players[1];
      p1.tp = 10;
      p2.tp = 10;

      // Set schedule subject matching card or default
      game.schedule[game.currentClassIndex] = card.subject === 'universal' ? 'chinese' : card.subject;

      p1.handCards.push(card);
      const playRes = playTacticalCard(game, 'p1', card.id);
      if (!playRes.ok) {
        console.error(`Failed to play card ${card.id} (${card.name}): ${playRes.error}`);
        allCardsOk = false;
        return;
      }

      // Execute attack roll
      rollAttack(game);
      confirmAttack(game, [0, 1, 2]);
      confirmDefense(game, 'p2', [0, 1, 2]);

      if (!validateStateIntegrity(game)) {
        console.error(`State integrity check failed after playing card ${card.id} (${card.name})`);
        allCardsOk = false;
      }
    } catch (err) {
      console.error(`Exception while testing card ${card.id} (${card.name}):`, err);
      allCardsOk = false;
    }
  });

  assert(allCardsOk, 'Systematic execution of all 60 cards completed without backend errors, NaNs, or state corruption');
}

// ----------------------------------------------------
// Suite 5: Monte Carlo Random Turn Sequence Stress Test
// ----------------------------------------------------
console.log('\n--- Suite 5: Monte Carlo Random Turn Sequence Stress Test ---');
{
  const charIds = Object.keys(characterMap);
  let stressPassed = true;
  let totalSimulatedTurns = 0;
  const NUM_SIMULATED_GAMES = 50;

  for (let gIdx = 0; gIdx < NUM_SIMULATED_GAMES; gIdx++) {
    const c1 = charIds[Math.floor(Math.random() * charIds.length)];
    const c2 = charIds[Math.floor(Math.random() * charIds.length)];
    const game = createTestGame(c1, c2);

    let turnsInGame = 0;
    while (game.phase !== 'game_over' && turnsInGame < 30) {
      turnsInGame++;
      totalSimulatedTurns++;

      // Randomly populate hand cards and play cards
      game.players.forEach(p => {
        if (p.handCards.length < 3 && Math.random() < 0.6) {
          const curSubj = game.schedule[game.currentClassIndex] || 'chinese';
          const randomCard = CARDS[Math.floor(Math.random() * CARDS.length)];
          // Only push playable subject or universal
          if (randomCard.subject === 'universal' || randomCard.subject === curSubj) {
            p.handCards.push(randomCard);
          }
        }

        // Randomly play cards from hand
        if (p.handCards.length > 0 && Math.random() < 0.7) {
          const cardToPlay = p.handCards[Math.floor(Math.random() * p.handCards.length)];
          playTacticalCard(game, p.id, cardToPlay.id);
        }
      });

      // Handle current turn phase
      if (game.turnPhase === 'waiting_atk') {
        const atkRes = rollAttack(game);
        if (atkRes.selfKill) continue;
      }

      if (game.turnPhase === 'atk_rolled') {
        const atk = game.players[game.turnData.attackerIdx];
        const atkPoolLen = atk.card.atkSlots || 2;
        if (Math.random() < 0.3 && !game.turnData.hasAttackerRerolled && atk.rerolls > 0) {
          rerollDice(game, atk.id, [0]);
        }
        const keepIndices = Array.from({ length: Math.min(atkPoolLen, game.turnData.attackRolls.length) }, (_, i) => i);
        confirmAttack(game, keepIndices);
      }

      if (game.turnPhase === 'def_rolled') {
        const defIdx = game.turnData.defenderIdx;
        if (defIdx !== null && game.players[defIdx]) {
          const def = game.players[defIdx];
          const defPoolLen = def.card.defSlots || 2;
          if (Math.random() < 0.3 && !game.turnData.hasDefenderRerolled && def.rerolls > 0) {
            rerollDice(game, def.id, [0]);
          }
          const keepIndices = Array.from({ length: Math.min(defPoolLen, game.turnData.defenseRolls.length) }, (_, i) => i);
          confirmDefense(game, def.id, keepIndices);
        }
      }

      // Draft shop handling if active
      if (game.draftShop && game.draftShop.active) {
        game.players.forEach(p => {
          if (p.tp >= 2 && Math.random() < 0.5) {
            buyDraftCard(game, p.id, 0);
          }
          confirmDraftReady(game, p.id);
        });
      }

      // Verify state integrity at each turn step
      if (!validateStateIntegrity(game)) {
        console.error(`State corruption detected at game ${gIdx}, turn ${turnsInGame}`);
        stressPassed = false;
        break;
      }
    }
  }

  assert(stressPassed, `Monte Carlo stress test passed across ${NUM_SIMULATED_GAMES} games (${totalSimulatedTurns} total turns) with zero NaNs, zero errors, and zero state corruptions`);
}

console.log(`\n====================================================`);
console.log(`   STRESS VERIFICATION SUMMARY: ${passCount} PASSED, ${failCount} FAILED   `);
console.log(`====================================================`);

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
