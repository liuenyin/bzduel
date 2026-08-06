import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="sandbox"></div></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);

const { onTurnResolved, renderBattle } = await import('../src/pages/battle.js');

console.log('Testing edge cases in battle.js...');

const sandbox = document.getElementById('sandbox');

// Test Case 4: isAoE = true but S.players is [] (uninitialized/empty)
const aoeStateNoPlayers = {
  gameMode: 'sanguosha',
  myIndex: 0,
  attackerIdx: 0,
  defenderIdx: null,
  schedule: ['math'],
  currentClassIndex: 0,
  me: { id: 'p1', hp: 30, maxHp: 30 },
  players: [] // EMPTY PLAYERS ARRAY
};

try {
  renderBattle(sandbox, { state: aoeStateNoPlayers });
  onTurnResolved({
    isAoE: true,
    aoeResults: [
      { playerId: 'p1', damage: 5, nineLivesTriggered: false }
    ],
    state: aoeStateNoPlayers,
    damage: 0,
    finalDef: 0,
    attackerIdx: 0
  });
  console.log('Test Case 4 (isAoE with S.players=[]): initial call succeeded');
} catch (e) {
  console.error('Test Case 4 EXCEPTION on init:', e.message);
}

await new Promise(r => setTimeout(r, 2000));
console.log('Test Case 4 completed.');
