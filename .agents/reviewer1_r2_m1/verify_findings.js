import { createGame, selectCard, setReady, playTacticalCard, confirmAttack, confirmDefense, rollAttack } from '../../server/game/engine.js';
import { CARDS } from '../../shared/cards.js';

console.log('=== Reviewer 1 Independent Verification ===\n');

// Issue 1: card_it_1 is a blessing, applyInstantCardEffect is never called, effect is dead code
{
  console.log('--- Checking card_it_1 ---');
  const game = createGame([{id:'p1',nickname:'P1'},{id:'p2',nickname:'P2'}]);
  selectCard(game, 'p1', 'char_3'); // Skill: 记号
  selectCard(game, 'p2', 'char_4'); // Skill: 观星 & 显眼包
  setReady(game, 'p1');
  setReady(game, 'p2');
  game.schedule[0] = 'it';
  
  const p1 = game.players[0];
  const p2 = game.players[1];
  p1.handCards.push({ id: 'card_it_1', name: '信息-祝福', subject: 'it', type: 'blessing', tpCost: 2 });
  
  const p1SkillBefore = p1.card.positiveSkill.name;
  playTacticalCard(game, 'p1', 'card_it_1');
  const p1SkillAfter = p1.card.positiveSkill.name;
  
  console.log(`p1 skill before: ${p1SkillBefore}`);
  console.log(`p1 skill after: ${p1SkillAfter} (Expected: ${p2.card.positiveSkill.name})`);
  console.log(`[BUG CONFIRMED] card_it_1 effect failed to copy opponent skill: ${p1SkillBefore === p1SkillAfter}\n`);
}

// Issue 2: card_bio_3 deals 0 damage to opponent
{
  console.log('--- Checking card_bio_3 ---');
  const game = createGame([{id:'p1',nickname:'P1'},{id:'p2',nickname:'P2'}]);
  selectCard(game, 'p1', 'char_3');
  selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1');
  setReady(game, 'p2');
  game.schedule[0] = 'biology';
  
  const p1 = game.players[0];
  const p2 = game.players[1];
  p1.hp = 30; p2.hp = 30;
  p1.handCards.push({ id: 'card_bio_3', name: '生物-其他', subject: 'biology', type: 'other', tpCost: 3 });
  
  playTacticalCard(game, 'p1', 'card_bio_3');
  console.log(`p1 hp: ${p1.hp} (lost 9 hp)`);
  console.log(`p2 hp: ${p2.hp} (expected: lost 9 hp, actual: lost 0)`);
  console.log(`[BUG CONFIRMED] card_bio_3 dealt 0 damage to opponent: ${p2.hp === 30}\n`);
}

// Issue 3: playedTurnCards array leaks turn cards across multiple sub-rounds
{
  console.log('--- Checking playedTurnCards lifecycle ---');
  const game = createGame([{id:'p1',nickname:'P1'},{id:'p2',nickname:'P2'}]);
  selectCard(game, 'p1', 'char_3');
  selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1');
  setReady(game, 'p2');
  game.schedule[0] = 'pe';
  
  const p1 = game.players[0];
  p1.handCards.push({ id: 'card_pe_2', name: '体育-增益', subject: 'pe', type: 'buff', tpCost: 1 });
  
  playTacticalCard(game, 'p1', 'card_pe_2');
  console.log(`Turn 1 playedTurnCards: ${p1.playedTurnCards.map(c=>c.id)}`);
  
  rollAttack(game);
  confirmAttack(game, [0, 1, 2]);
  confirmDefense(game, 'p2', [0, 1, 2]);
  
  console.log(`Turn 2 playedTurnCards still contains card_pe_2: ${p1.playedTurnCards.map(c=>c.id)}`);
  console.log(`[BUG CONFIRMED] playedTurnCards not cleared after turn: ${p1.playedTurnCards.length > 0}\n`);
}
