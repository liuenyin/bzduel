console.log('=== Starting R2-M3 VFX & Battle Engine Stress Test Suite ===\n');

// 0. Filter GSAP missing plugin warnings in node environment
const origError = console.error;
const origWarn = console.warn;
console.error = (...args) => {
  const msg = args.map(a => String(a)).join(' ');
  if (msg.includes('Missing plugin?')) return;
  origError.apply(console, args);
};
console.warn = (...args) => {
  const msg = args.map(a => String(a)).join(' ');
  if (msg.includes('Missing plugin?')) return;
  origWarn.apply(console, args);
};

let isModuleLoading = true;

// 1. Setup DOM polyfill BEFORE module imports
if (typeof global.document === 'undefined') {
  class MockElement {
    constructor(tagName, id = '', className = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.className = className;
      this.children = [];
      this.style = {};
      this.dataset = {};
      this.classList = {
        add: (c) => { if (!this.className.includes(c)) this.className += ' ' + c; },
        remove: (c) => { this.className = this.className.replace(c, '').trim(); },
        contains: (c) => this.className.includes(c),
        toggle: (c) => { if (this.classList.contains(c)) this.classList.remove(c); else this.classList.add(c); }
      };
      this.parentNode = null;
      this.textContent = '';
      this.innerHTML = '';
    }
    appendChild(child) {
      if (child && typeof child === 'object' && child.tagName) {
        child.parentNode = this;
        this.children.push(child);
      }
      return child;
    }
    prepend(child) {
      if (child && typeof child === 'object' && child.tagName) {
        child.parentNode = this;
        this.children.unshift(child);
      }
      return child;
    }
    remove() {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx >= 0) this.parentNode.children.splice(idx, 1);
        this.parentNode = null;
      }
    }
    addEventListener() {}
    removeEventListener() {}
    getBoundingClientRect() {
      return { left: 100, top: 100, width: 200, height: 300, right: 300, bottom: 400 };
    }
    querySelector(selector) {
      const cleanSelector = selector.replace(/:not\([^)]*\)/g, '');
      const search = (node) => {
        if (!node || !node.children) return null;
        if (cleanSelector.startsWith('#') && node.id === cleanSelector.slice(1)) return node;
        if (cleanSelector.startsWith('.')) {
          const classes = cleanSelector.slice(1).split('[')[0].split('.').filter(Boolean);
          const matchAll = classes.every(c => node.className && node.className.includes(c));
          if (matchAll) return node;
        }
        for (const child of node.children) {
          const res = search(child);
          if (res) return res;
        }
        return null;
      };
      return search(this);
    }
    querySelectorAll() {
      return [];
    }
  }

  const body = new MockElement('body');
  const app = new MockElement('div', 'app');
  body.appendChild(app);

  const elementRegistry = new Map();
  elementRegistry.set('body', body);
  elementRegistry.set('app', app);

  const localStorageStore = new Map();
  const mockLocalStorage = {
    getItem: (key) => localStorageStore.get(key) || null,
    setItem: (key, val) => localStorageStore.set(key, String(val)),
    removeItem: (key) => localStorageStore.delete(key),
    clear: () => localStorageStore.clear()
  };

  global.localStorage = mockLocalStorage;
  global.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    localStorage: mockLocalStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { reload: () => {} }
  };
  global.document = {
    body,
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => {
      let registered = elementRegistry.get(id);
      if (registered) return registered;
      const search = (node) => {
        if (!node || !node.children) return null;
        if (node.id === id) return node;
        for (const child of node.children) {
          const res = search(child);
          if (res) return res;
        }
        return null;
      };
      const found = search(body);
      if (found) return found;
      const newEl = new MockElement('div', id);
      elementRegistry.set(id, newEl);
      body.appendChild(newEl);
      return newEl;
    },
    querySelector: (selector) => {
      if (selector === '.arena' || selector === '#app' || selector === '.arena-center') return body;
      const search = (node) => {
        if (!node || !node.children) return null;
        if (selector.startsWith('#') && node.id === selector.slice(1)) return node;
        if (selector.startsWith('.')) {
          const classes = selector.slice(1).split('[')[0].split('.').filter(Boolean);
          const matchAll = classes.every(c => node.className && node.className.includes(c));
          if (matchAll) return node;
        }
        for (const child of node.children) {
          const res = search(child);
          if (res) return res;
        }
        return null;
      };
      return search(body) || (isModuleLoading ? new MockElement('div') : null);
    },
    querySelectorAll: () => [],
    bodyContains: (node) => {
      if (!node || typeof node !== 'object' || !node.tagName) return false;
      let curr = node;
      while (curr) {
        if (curr === body) return true;
        curr = curr.parentNode;
      }
      return false;
    }
  };
  global.document.body.contains = (node) => global.document.bodyContains(node);
}

// Imports
const gsap = (await import('gsap')).default;
gsap.config({ nullTargetWarn: false });

const { vfxManager } = await import('../src/utils/vfx.js');
const { createGame, selectCard, setReady, getStateView } = await import('../server/game/engine.js');
const { renderBattle, onTurnResolved } = await import('../src/pages/battle.js');
const { gameSocket } = await import('../src/net/socket.js');

isModuleLoading = false;

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.log(`[FAIL] ${message}`);
    failCount++;
  }
}

// -------------------------------------------------------------
// STRESS TEST 1: Granular vfxManager methods stress test
// -------------------------------------------------------------
console.log('--- STRESS TEST 1: Granular vfxManager Method Stress Tests ---');
{
  const detachedEl = document.createElement('div');
  detachedEl.className = 'detached-test';

  const invalidInputs = [
    null,
    undefined,
    detachedEl,
    {},
    123,
    "invalid_element_string"
  ];

  // 1.1 rollDice
  let rollDiceErrors = 0;
  for (let i = 0; i < 100; i++) {
    const input = invalidInputs[i % invalidInputs.length];
    try {
      vfxManager.rollDice(Array.isArray(input) ? input : [input], [1, 2, 3]);
    } catch (err) {
      rollDiceErrors++;
    }
  }
  assert(rollDiceErrors === 0, `vfxManager.rollDice handled 100 invalid/detached calls with ${rollDiceErrors} exceptions`);

  // 1.2 playHitImpact
  let playHitImpactErrors = 0;
  for (let i = 0; i < 100; i++) {
    const input = invalidInputs[i % invalidInputs.length];
    try {
      vfxManager.playHitImpact(input, i % 2 === 0 ? NaN : i, { isCrit: true });
    } catch (err) {
      playHitImpactErrors++;
    }
  }
  assert(playHitImpactErrors === 0, `vfxManager.playHitImpact handled 100 invalid/detached calls with ${playHitImpactErrors} exceptions`);

  // 1.3 triggerCameraImpulse
  let impulseErrors = 0;
  for (let i = 0; i < 100; i++) {
    try {
      vfxManager.triggerCameraImpulse(i % 2 === 0 ? NaN : (i % 3 === 0 ? undefined : "invalid"));
    } catch (err) {
      impulseErrors++;
    }
  }
  assert(impulseErrors === 0, `vfxManager.triggerCameraImpulse handled 100 invalid calls with ${impulseErrors} exceptions`);

  // 1.4 spawnFloatingDamage
  let floatingDmgErrors = 0;
  for (let i = 0; i < 100; i++) {
    const input = invalidInputs[i % invalidInputs.length];
    try {
      vfxManager.spawnFloatingDamage(input, 15, true);
    } catch (err) {
      floatingDmgErrors++;
    }
  }
  assert(floatingDmgErrors === 0, `vfxManager.spawnFloatingDamage handled 100 invalid calls with ${floatingDmgErrors} exceptions`);

  // 1.5 triggerUltimateVFX & Detached container check
  let ultErrors = 0;
  const detachedContainer = document.createElement('div');
  detachedContainer.className = 'detached-ult-container';
  for (let i = 0; i < 50; i++) {
    try {
      vfxManager.triggerUltimateVFX('char_fxr', 'DREAM_KING', detachedContainer);
      vfxManager.triggerUltimateVFX('char_14', 'BUY_WATER', null);
      vfxManager.triggerUltimateVFX('lgpyForm', 'DREAM_KING_RAGE', undefined);
    } catch (err) {
      ultErrors++;
    }
  }
  assert(ultErrors === 0, `vfxManager.triggerUltimateVFX handled 150 invalid/null/detached calls with ${ultErrors} exceptions`);
  assert(detachedContainer.children.length === 0, `triggerUltimateVFX on detached container does not pollute detached element (children count: ${detachedContainer.children.length})`);
}

// -------------------------------------------------------------
// STRESS TEST 2: Repeated draft shop card purchases (_buyDraftCard)
// -------------------------------------------------------------
console.log('\n--- STRESS TEST 2: Draft Shop Purchases Memory Leak & Stack Overflow Verification ---');
{
  const container = document.createElement('div');
  document.body.appendChild(container);

  const game = createGame([
    { id: 'p1', nickname: 'P1' },
    { id: 'p2', nickname: 'P2' }
  ], '1v1');
  selectCard(game, 'p1', 'char_1');
  selectCard(game, 'p2', 'char_2');
  setReady(game, 'p1');
  setReady(game, 'p2');

  const stateView = getStateView(game, 'p1');

  let buyDraftCardCallCount = 0;
  gameSocket.buyDraftCard = () => {
    buyDraftCardCallCount++;
  };

  const rendersCount = 200;
  let stackOverflowError = null;
  try {
    for (let i = 0; i < rendersCount; i++) {
      renderBattle(container, { state: stateView });
      window._buyDraftCard(0);
    }
  } catch (err) {
    stackOverflowError = err;
  }

  assert(stackOverflowError === null, `Rendered battle UI ${rendersCount} times and invoked _buyDraftCard without stack overflow`);
  assert(buyDraftCardCallCount === rendersCount, `_buyDraftCard dispatched exactly ${rendersCount} socket requests (actual: ${buyDraftCardCallCount})`);

  const fnString = window._buyDraftCard.toString();
  const isWrapped = fnString.includes('originalBuy');
  assert(!isWrapped, '_buyDraftCard is clean single-function assignment, not a recursive wrapper');

  container.remove();
}

// -------------------------------------------------------------
// STRESS TEST 3: Rapid state updates received while animLock is active
// -------------------------------------------------------------
console.log('\n--- STRESS TEST 3: Rapid State Updates During animLock Verification ---');
{
  const container = document.createElement('div');
  container.id = 'app';
  document.body.appendChild(container);

  const game = createGame([
    { id: 'p1', nickname: 'P1' },
    { id: 'p2', nickname: 'P2' }
  ], '1v1');
  selectCard(game, 'p1', 'char_1');
  selectCard(game, 'p2', 'char_2');
  setReady(game, 'p1');
  setReady(game, 'p2');

  const stateView = getStateView(game, 'p1');

  let socketStateUpdateListener = null;
  const originalOn = gameSocket.on;
  gameSocket.on = (evt, cb) => {
    if (evt === 'state_update') {
      socketStateUpdateListener = cb;
    }
    if (gameSocket.socket) gameSocket.socket.on(evt, cb);
  };

  renderBattle(container, { state: stateView });
  assert(typeof socketStateUpdateListener === 'function', 'Captured state_update socket listener successfully');

  const hpMeLabel = document.getElementById('hp-me-t');

  const turnData = {
    state: { ...stateView, turnPhase: 'animating', me: { ...stateView.me, hp: 100 } },
    damage: 10,
    finalDef: 2,
    penalty: 0,
    gameOver: false,
    attackerIdx: 0,
    classChanged: false
  };

  onTurnResolved(turnData);

  // Send 30 rapid state updates while animLock is true
  const totalStateUpdates = 30;
  for (let i = 1; i <= totalStateUpdates; i++) {
    const rapidState = {
      ...stateView,
      version: i,
      me: { ...stateView.me, hp: 100 - i }
    };
    socketStateUpdateListener(rapidState);
  }

  console.log(`[INFO] HP text during animLock: ${hpMeLabel.textContent}`);

  // Now wait for animation timeouts to complete (800ms + 1500ms + 500ms = 2800ms, wait 3500ms)
  await new Promise(resolve => setTimeout(resolve, 3500));

  console.log(`[INFO] HP text after animLock released: ${hpMeLabel.textContent}`);

  assert(String(hpMeLabel.textContent) === String(100 - totalStateUpdates), `After animLock released, final pending state version was applied: HP is ${hpMeLabel.textContent} (expected ${100 - totalStateUpdates})`);

  container.remove();
  gameSocket.on = originalOn;
}

console.log(`\n=== Stress Verification Complete: ${passCount} PASSED, ${failCount} FAILED ===`);
setTimeout(() => {
  process.exit(failCount > 0 ? 1 : 0);
}, 200);
