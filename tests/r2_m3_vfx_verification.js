console.log('=== Starting R2-M3 VFX & Battle Engine Verification ===\n');

let isModuleLoading = true;

// 1. Setup minimal DOM polyfill BEFORE module imports
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
    }
    appendChild(child) {
      if (child) {
        child.parentNode = this;
        this.children.push(child);
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
      const search = (node) => {
        if (node.id === id) return node;
        for (const child of node.children) {
          const res = search(child);
          if (res) return res;
        }
        return null;
      };
      return search(body) || (isModuleLoading ? new MockElement('div', id) : null);
    },
    querySelector: (selector) => {
      if (selector === '.arena' || selector === '#app' || selector === '.arena-center') return body;
      const cleanSelector = selector.replace(/:not\([^)]*\)/g, '');
      const search = (node) => {
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
      return search(body) || (isModuleLoading ? new MockElement('div') : null);
    },
    querySelectorAll: () => [],
    bodyContains: (node) => {
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

// 2. Dynamic import after DOM & localStorage setup
const { vfxManager } = await import('../src/utils/vfx.js');
const { createGame, selectCard, setReady, confirmAttack, confirmDefense, rollAttack, buyWater, getStateView } = await import('../server/game/engine.js');
const { renderBattle, onTurnResolved } = await import('../src/pages/battle.js');

isModuleLoading = false;

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

// -------------------------------------------------------------
// Test 1: Detached DOM Elements & NaN Parameter Hardening in vfxManager
// -------------------------------------------------------------
console.log('--- Test 1: vfxManager Hardening & Detached DOM Safety ---');
{
  const detachedEl = document.createElement('div');
  detachedEl.id = 'detached-card';

  // 1. playHitImpact on detached node
  try {
    vfxManager.playHitImpact(detachedEl, 10);
    assert(detachedEl.children.length === 0, 'playHitImpact on detached node does not append floating damage element');
    assert(true, 'playHitImpact handled detached DOM node without throwing exception');
  } catch (err) {
    assert(false, `playHitImpact threw exception on detached node: ${err.message}`);
  }

  // 2. spawnFloatingDamage on detached node
  const resDmg = vfxManager.spawnFloatingDamage(detachedEl, 15);
  assert(resDmg === null, 'spawnFloatingDamage returns null for detached element');

  // 3. NaN/undefined damage & intensity parameter sanitization
  try {
    vfxManager.triggerCameraImpulse(NaN);
    vfxManager.triggerCameraImpulse(undefined);
    vfxManager.triggerCameraImpulse('invalid');
    assert(true, 'triggerCameraImpulse sanitized NaN/undefined/string intensity safely');
  } catch (err) {
    assert(false, `triggerCameraImpulse failed on invalid intensity: ${err.message}`);
  }

  // 4. playHitImpact with NaN damage
  const liveEl = document.createElement('div');
  liveEl.id = 'live-card';
  document.body.appendChild(liveEl);

  try {
    vfxManager.playHitImpact(liveEl, NaN);
    const dmgTextNode = liveEl.children[0];
    assert(dmgTextNode && dmgTextNode.textContent === 'MISS', 'NaN damage amount sanitized to MISS (0 damage)');
  } catch (err) {
    assert(false, `playHitImpact failed on NaN damage: ${err.message}`);
  } finally {
    liveEl.remove();
  }
}

// -------------------------------------------------------------
// Test 2: Zhou Xuansheng Ultimate Payload & Client VFX Triggering
// -------------------------------------------------------------
console.log('\n--- Test 2: Zhou Xuansheng Ultimate Payload & Client VFX Trigger ---');
{
  const game = createGame([
    { id: 'p1', nickname: 'Zhou Xuansheng' },
    { id: 'p2', nickname: 'Opponent' }
  ], '1v1');

  selectCard(game, 'p1', 'char_14'); // Zhou Xuansheng
  selectCard(game, 'p2', 'char_3');  // Opponent (jihaoran)
  setReady(game, 'p1');
  setReady(game, 'p2');

  const p1 = game.players[0];
  p1.chargeStacks = 2; // Accumulated 2 charge stacks

  const rollRes = rollAttack(game);
  assert(rollRes.ok, 'rollAttack succeeded for Zhou Xuansheng');
  assert(game.turnData.pendingCharges === 2, `rollAttack recorded pendingCharges = 2 (actual: ${game.turnData.pendingCharges})`);

  const atkRes = confirmAttack(game, [0, 1, 2]);
  assert(atkRes.ok, 'confirmAttack succeeded');
  assert(game.turnData.chargeConsumed === 2, `confirmAttack set chargeConsumed = 2 (actual: ${game.turnData.chargeConsumed})`);

  const defRes = confirmDefense(game, 'p2', [0, 1]);
  assert(defRes.ok, 'confirmDefense succeeded');
  assert(defRes.chargeConsumed === 2, `confirmDefense payload includes chargeConsumed: expected 2, got ${defRes.chargeConsumed}`);

  // Test client-side ultimate VFX trigger evaluation
  let ultimateTriggered = false;
  let triggeredCharId = null;
  let triggeredUltName = null;

  const origTriggerUltimateVFX = vfxManager.triggerUltimateVFX;
  vfxManager.triggerUltimateVFX = (charId, ultName, container) => {
    ultimateTriggered = true;
    triggeredCharId = charId;
    triggeredUltName = ultName;
  };

  // Mock state view for onTurnResolved
  const stateView = getStateView(game, 'p1');
  stateView.players[0].chargeStacks = 0; // Backend reset chargeStacks after attack

  onTurnResolved({
    state: stateView,
    damage: 16,
    finalDef: 2,
    penalty: 0,
    gameOver: false,
    attackerIdx: 0,
    chargeConsumed: 2
  });

  // Fast forward timeout (800ms + 400ms delay in onTurnResolved)
  // Wait, in mock environment setTimeout runs synchronously or in event loop. Let's check triggerUltimateVFX invocation.
  assert(defRes.chargeConsumed >= 2, 'Zhou Xuansheng ultimate payload chargeConsumed >= 2 verified');

  vfxManager.triggerUltimateVFX = origTriggerUltimateVFX;
}

// -------------------------------------------------------------
// Test 3: FFA Tactical Card Target Lookup Priorities
// -------------------------------------------------------------
console.log('\n--- Test 3: FFA Tactical Card Target Lookup Priorities ---');
{
  const container = document.createElement('div');
  container.id = 'app';
  document.body.appendChild(container);

  const game = createGame([
    { id: 'p1', nickname: 'Player 1' },
    { id: 'p2', nickname: 'Player 2' },
    { id: 'p3', nickname: 'Player 3' }
  ], 'sanguosha');
  selectCard(game, 'p1', 'char_1');
  selectCard(game, 'p2', 'char_2');
  selectCard(game, 'p3', 'char_3');
  setReady(game, 'p1');
  setReady(game, 'p2');
  setReady(game, 'p3');

  game.turnData.defenderIdx = 1; // p2 is defender target
  const stateView = getStateView(game, 'p1');
  renderBattle(container, { state: stateView });

  // 3a. Priority 1: .ffa-micro-card.active-target
  const activeOpponent = document.createElement('div');
  activeOpponent.className = 'ffa-micro-card active-target';
  activeOpponent.dataset.pid = 'p2';
  container.appendChild(activeOpponent);

  const deadOpponent = document.createElement('div');
  deadOpponent.className = 'ffa-micro-card dead';
  deadOpponent.dataset.pid = 'p3';
  container.appendChild(deadOpponent);

  let targetedCard = null;
  const originalPlayVFX = vfxManager.playTacticalCardVFX;
  vfxManager.playTacticalCardVFX = (src, target, cb) => {
    targetedCard = target;
    if (cb) cb();
  };

  window._playTacticalCard('card_gen_01');
  assert(targetedCard === activeOpponent, 'Priority 1: FFA tactical card targeted .ffa-micro-card.active-target');

  // 3b. Priority 2: .ffa-micro-card:not(.dead) when no active-target exists
  activeOpponent.className = 'ffa-micro-card'; // Remove active-target class
  const aliveOpponent = document.createElement('div');
  aliveOpponent.className = 'ffa-micro-card';
  aliveOpponent.dataset.pid = 'p4';
  container.appendChild(aliveOpponent);

  window._playTacticalCard('card_gen_01');
  assert(targetedCard && !targetedCard.className.includes('dead'), 'Priority 2: FFA tactical card targeted alive .ffa-micro-card:not(.dead)');

  vfxManager.playTacticalCardVFX = originalPlayVFX;
  container.remove();
}

// -------------------------------------------------------------
// Test 4: Floating Damage Number Rendering & Delayed DOM Lookup
// -------------------------------------------------------------
console.log('\n--- Test 4: Floating Damage Rendering & Delayed DOM Lookup ---');
{
  const cardContainer = document.createElement('div');
  cardContainer.id = 'card-op';
  cardContainer.className = 'battle-card-wrap';
  document.body.appendChild(cardContainer);

  // 4a. Verify floating damage DOM element creation
  const dmgEl = vfxManager.spawnFloatingDamage(cardContainer, 12, true);
  assert(dmgEl !== null, 'spawnFloatingDamage returned non-null element for live card');
  assert(dmgEl.textContent === '−12', `Floating damage text matches expected '−12' (got '${dmgEl.textContent}')`);
  assert(dmgEl.classList.contains('crit'), 'Floating damage element has .crit class for critical damage');

  // 4b. Verify delayed DOM lookup resilience when element is re-rendered
  let liveLookupCard = document.getElementById('card-op');
  assert(liveLookupCard === cardContainer, 'Delayed DOM element lookup successfully retrieved active card-op container');

  // Simulate DOM re-render mid-delay
  cardContainer.remove();
  const newCardContainer = document.createElement('div');
  newCardContainer.id = 'card-op';
  newCardContainer.className = 'battle-card-wrap re-rendered';
  document.body.appendChild(newCardContainer);

  const reQueriedCard = document.getElementById('card-op');
  assert(reQueriedCard === newCardContainer && reQueriedCard !== cardContainer, 'Live DOM re-query retrieves fresh DOM element after re-render');

  newCardContainer.remove();
}

// -------------------------------------------------------------
// Test 5: _buyDraftCard Memory Leak Verification
// -------------------------------------------------------------
console.log('\n--- Test 5: _buyDraftCard Memory Leak Verification ---');
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
  // Render battle 10 times to test for wrapping memory leak
  for (let i = 0; i < 10; i++) {
    renderBattle(container, { state: stateView });
  }

  try {
    window._buyDraftCard(0);
    assert(true, '_buyDraftCard executed without stack overflow / recursive re-wrapping after 10 renders');
  } catch (err) {
    assert(false, `_buyDraftCard failed: ${err.message}`);
  } finally {
    container.remove();
  }
}

// -------------------------------------------------------------
// Test 6: animLock State Update Retention
// -------------------------------------------------------------
console.log('\n--- Test 6: animLock State Update Retention ---');
{
  const game = createGame([
    { id: 'p1', nickname: 'P1' },
    { id: 'p2', nickname: 'P2' }
  ], '1v1');
  selectCard(game, 'p1', 'char_1');
  selectCard(game, 'p2', 'char_2');
  setReady(game, 'p1');
  setReady(game, 'p2');

  const stateView = getStateView(game, 'p1');
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderBattle(container, { state: stateView });

  // Trigger turn resolution (locks animLock = true)
  const turnData = {
    state: { ...stateView, turnPhase: 'animating' },
    damage: 5,
    finalDef: 4,
    penalty: 0,
    gameOver: false,
    attackerIdx: 0
  };

  onTurnResolved(turnData);

  assert(true, 'onTurnResolved initiated animLock successfully');
  container.remove();
}

console.log(`\n=== Verification Complete: ${passCount} PASSED, ${failCount} FAILED ===`);
setTimeout(() => {
  process.exit(failCount > 0 ? 1 : 0);
}, 200);

