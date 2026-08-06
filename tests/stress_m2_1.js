import { JSDOM } from 'jsdom';

// Initialize JSDOM environment BEFORE importing module under test
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"><div class="arena"><div id="dice-area"></div><div id="card-me"></div><div id="card-op"></div><div id="action-bar"></div><div id="reroll-count"></div><div id="reroll-hint"></div><button id="btn-reroll"></button></div></div></body></html>', {
  url: 'http://localhost/'
});

global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
global.HTMLElement = dom.window.HTMLElement;
global.NodeList = dom.window.NodeList;
global.Element = dom.window.Element;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.getComputedStyle = (el) => dom.window.getComputedStyle(el);

// Dynamically import vfxManager, battle module, and gameSocket
const { vfxManager, rollDice, triggerCameraImpulse } = await import('../src/utils/vfx.js');
const battleModule = await import('../src/pages/battle.js');
const { gameSocket } = await import('../src/net/socket.js');

async function runStressTests() {
  console.log('====================================================');
  console.log('🧪 EMPIRICAL STRESS TEST SUITE: vfx.js & battle.js');
  console.log('====================================================\n');

  const results = {
    rollDice: [],
    triggerCameraImpulse: [],
    renderDice: [],
    overallVerdict: 'PASS'
  };

  function recordResult(category, testName, pass, details) {
    const entry = { testName, pass, details };
    results[category].push(entry);
    if (!pass) results.overallVerdict = 'FAIL';
    const statusSymbol = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`[${category}] ${statusSymbol}: ${testName} -> ${JSON.stringify(details)}`);
  }

  function emitServerStateUpdate(state) {
    // Trigger socket listeners registered on gameSocket.socket
    if (gameSocket.socket && gameSocket.socket._callbacks) {
      const cbs = gameSocket.socket._callbacks['$state_update'] || [];
      cbs.forEach(fn => fn(state));
    } else if (gameSocket.socket && typeof gameSocket.socket.emit === 'function') {
      // In socket.io-client / mock, call directly
      gameSocket.socket.listeners('state_update').forEach(fn => fn(state));
    }
  }

  // Helper to set up global game state for renderDice tests
  function setupState(overrides = {}) {
    const defaultState = {
      gameMode: '1v1',
      myIndex: 0,
      attackerIdx: 0,
      defenderIdx: 1,
      turnPhase: 'atk_rolled',
      isMyAttackTurn: true,
      isMyDefendTurn: false,
      attackRolls: [4, 5, 6],
      defenseRolls: [2, 3],
      me: {
        id: 'p1',
        hp: 100,
        maxHp: 100,
        rerolls: 2,
        card: { name: 'Player 1', dicePool: [6, 6, 6], atkSlots: 2, defSlots: 2 }
      },
      opponent: {
        id: 'p2',
        hp: 100,
        maxHp: 100,
        rerolls: 2,
        card: { name: 'Player 2', dicePool: [6, 6, 6], atkSlots: 2, defSlots: 2 }
      },
      players: [],
      schedule: ['math'],
      currentClassIndex: 0,
      ...overrides
    };
    defaultState.players = [defaultState.me, defaultState.opponent];
    return defaultState;
  }

  // =========================================================================
  // SECTION 1: rollDice STRESS TESTS
  // =========================================================================
  console.log('--- SECTION 1: vfxManager.rollDice STRESS TESTS ---');

  // Test 1.1: Empty arrays & falsy inputs
  try {
    let cbFiredCount = 0;
    const resEmptyArr = rollDice([], [], () => { cbFiredCount++; });
    const resNull = rollDice(null, [], () => { cbFiredCount++; });
    const resUndef = rollDice(undefined, [], () => { cbFiredCount++; });

    const pass = resEmptyArr === undefined && resNull === undefined && resUndef === undefined && cbFiredCount === 3;
    recordResult('rollDice', 'Empty arrays & falsy inputs handling', pass, {
      cbFiredCount,
      resEmptyArr,
      resNull,
      resUndef
    });
  } catch (err) {
    recordResult('rollDice', 'Empty arrays & falsy inputs handling', false, { error: err.message });
  }

  // Test 1.2: Callback execution with valid elements & non-function callbacks
  try {
    const diceContainer = document.createElement('div');
    const die1 = document.createElement('div');
    die1.className = 'die';
    const die2 = document.createElement('div');
    die2.className = 'die';
    diceContainer.appendChild(die1);
    diceContainer.appendChild(die2);
    document.body.appendChild(diceContainer);

    let callbackExecuted = false;
    const tl = rollDice([die1, die2], [3, 6], () => {
      callbackExecuted = true;
    });

    const passReturnsTl = tl && typeof tl.then === 'function';

    // Test non-function callbacks (should not crash)
    let nonFnPass = true;
    try {
      rollDice([], [], "invalid_callback_string");
      rollDice([], [], { invalid: 'object' });
      rollDice([], [], 12345);
    } catch (e) {
      nonFnPass = false;
    }

    recordResult('rollDice', 'Callback execution & return timeline', passReturnsTl && nonFnPass, {
      returnsTimeline: passReturnsTl,
      nonFunctionCallbacksHandled: nonFnPass
    });
  } catch (err) {
    recordResult('rollDice', 'Callback execution & return timeline', false, { error: err.message });
  }

  // Test 1.3: Array containing null/undefined elements (Vulnerability Mining)
  try {
    let caughtError = null;
    try {
      const validDie = document.createElement('div');
      rollDice([validDie, null, undefined]);
    } catch (err) {
      caughtError = err;
    }

    // Checking whether rollDice handles null/undefined elements gracefully inside array
    const pass = caughtError === null;
    recordResult('rollDice', 'Array containing null/undefined DOM elements', pass, {
      thrownError: caughtError ? caughtError.message : 'None (Handled safely)'
    });
  } catch (err) {
    recordResult('rollDice', 'Array containing null/undefined DOM elements', false, { error: err.message });
  }

  // Test 1.4: High values & extreme parameters in finalValues
  try {
    const die = document.createElement('div');
    die.className = 'die';
    document.body.appendChild(die);

    let noException = true;
    try {
      rollDice([die], [999999999999, -99999999, NaN, Infinity, -Infinity]);
    } catch (e) {
      noException = false;
    }

    recordResult('rollDice', 'Extreme numeric values in finalValues', noException, {
      noException
    });
  } catch (err) {
    recordResult('rollDice', 'Extreme numeric values in finalValues', false, { error: err.message });
  }

  // Test 1.5: Rapid consecutive dice rolls (500 iterations)
  try {
    const diceEls = [document.createElement('div'), document.createElement('div')];
    diceEls.forEach(d => { d.className = 'die'; document.body.appendChild(d); });

    let rapidSuccessCount = 0;
    let rapidCbFired = 0;

    for (let i = 0; i < 500; i++) {
      const tl = rollDice(diceEls, [i % 6, (i + 1) % 6], () => { rapidCbFired++; });
      if (tl) rapidSuccessCount++;
    }

    const pass = rapidSuccessCount === 500;
    recordResult('rollDice', 'Rapid consecutive rolls (500 iterations)', pass, {
      rapidSuccessCount,
      rapidCbFired
    });
  } catch (err) {
    recordResult('rollDice', 'Rapid consecutive rolls (500 iterations)', false, { error: err.message });
  }

  // =========================================================================
  // SECTION 2: triggerCameraImpulse STRESS TESTS
  // =========================================================================
  console.log('\n--- SECTION 2: vfxManager.triggerCameraImpulse STRESS TESTS ---');

  // Test 2.1: Missing specific target elements (fallback to body)
  try {
    // Remove .arena and #app temporarily
    const arenaEl = document.querySelector('.arena');
    const appEl = document.querySelector('#app');
    if (arenaEl) arenaEl.remove();
    if (appEl) appEl.remove();

    const tlFallback = triggerCameraImpulse(1.0);
    const passFallback = !!tlFallback;

    // Restore DOM
    document.body.innerHTML = '<div id="app"><div class="arena"><div id="dice-area"></div></div></div>';

    recordResult('triggerCameraImpulse', 'Fallback target resolution', passFallback, {
      returnedTimeline: passFallback
    });
  } catch (err) {
    recordResult('triggerCameraImpulse', 'Fallback target resolution', false, { error: err.message });
  }

  // Test 2.2: Extreme intensity values
  try {
    const intensities = [0, -10, 1.0, 100, 1e10, NaN, Infinity, -Infinity, null, undefined];
    let passAllIntensities = true;
    const intensityResults = [];

    for (const val of intensities) {
      try {
        const tl = triggerCameraImpulse(val);
        intensityResults.push({ val: String(val), status: 'OK', hasTl: !!tl });
      } catch (e) {
        passAllIntensities = false;
        intensityResults.push({ val: String(val), status: 'ERROR', error: e.message });
      }
    }

    recordResult('triggerCameraImpulse', 'Extreme intensity input values', passAllIntensities, {
      intensityResults
    });
  } catch (err) {
    recordResult('triggerCameraImpulse', 'Extreme intensity input values', false, { error: err.message });
  }

  // Test 2.3: Rapid consecutive impulses (200 iterations)
  try {
    let impulseSuccessCount = 0;
    for (let i = 0; i < 200; i++) {
      const tl = triggerCameraImpulse(1.5);
      if (tl) impulseSuccessCount++;
    }

    const pass = impulseSuccessCount === 200;
    recordResult('triggerCameraImpulse', 'Rapid consecutive impulses (200 iterations)', pass, {
      impulseSuccessCount
    });
  } catch (err) {
    recordResult('triggerCameraImpulse', 'Rapid consecutive impulses (200 iterations)', false, { error: err.message });
  }

  // =========================================================================
  // SECTION 3: renderDice STRESS TESTS
  // =========================================================================
  console.log('\n--- SECTION 3: battle.js renderDice STRESS TESTS ---');

  // Test 3.1: Missing #dice-area DOM element
  try {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const state = setupState();
    battleModule.renderBattle(container, { state });

    const diceArea = document.getElementById('dice-area');
    if (diceArea) diceArea.remove();

    let renderWithoutDiceAreaPassed = true;
    try {
      emitServerStateUpdate(setupState());
    } catch (e) {
      renderWithoutDiceAreaPassed = false;
    }

    recordResult('renderDice', 'Missing #dice-area DOM element handling', renderWithoutDiceAreaPassed, {
      renderWithoutDiceAreaPassed
    });
  } catch (err) {
    recordResult('renderDice', 'Missing #dice-area DOM element handling', false, { error: err.message });
  }

  // Test 3.2: Render dice with empty arrays and missing pools
  try {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const emptyState = setupState({
      attackRolls: [],
      defenseRolls: [],
      atkResult: null,
      me: { id: 'p1', hp: 100, maxHp: 100, rerolls: 0, card: { dicePool: [] } },
      opponent: { id: 'p2', hp: 100, maxHp: 100, rerolls: 0, card: { dicePool: [] } }
    });

    battleModule.renderBattle(container, { state: emptyState });
    emitServerStateUpdate(emptyState);

    const diceArea = document.getElementById('dice-area');
    const diceCount = diceArea ? diceArea.querySelectorAll('.die').length : -1;

    const pass = diceCount === 0;
    recordResult('renderDice', 'Empty rolls & empty dicePool rendering', pass, {
      diceCount
    });
  } catch (err) {
    recordResult('renderDice', 'Empty rolls & empty dicePool rendering', false, { error: err.message });
  }

  // Test 3.3: High values & extreme numbers in attackRolls / defenseRolls
  try {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const extremeState = setupState({
      attackRolls: [999999999, -1, 0, 1000],
      defenseRolls: [-999999, 888888],
      extraTurnFaceBoost: 500000
    });

    battleModule.renderBattle(container, { state: extremeState });
    emitServerStateUpdate(extremeState);

    const diceArea = document.getElementById('dice-area');
    const diceEls = diceArea ? diceArea.querySelectorAll('.die') : [];

    const passCount = diceEls.length === 6; // 4 attack + 2 defense
    recordResult('renderDice', 'Extreme numeric values in attack/defense rolls', passCount, {
      renderedDiceCount: diceEls.length
    });
  } catch (err) {
    recordResult('renderDice', 'Extreme numeric values in attack/defense rolls', false, { error: err.message });
  }

  // Test 3.4: Rapid consecutive state updates & re-renders (200 calls)
  try {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const baseState = setupState();
    battleModule.renderBattle(container, { state: baseState });

    let rapidCallsOk = true;
    for (let i = 0; i < 200; i++) {
      try {
        const stateIter = setupState({
          attackRolls: [(i % 6) + 1, ((i + 1) % 6) + 1],
          defenseRolls: [(i % 6) + 1]
        });
        emitServerStateUpdate(stateIter);
      } catch (e) {
        rapidCallsOk = false;
        break;
      }
    }

    recordResult('renderDice', 'Rapid consecutive state updates & re-renders (200 calls)', rapidCallsOk, {
      rapidCallsOk
    });
  } catch (err) {
    recordResult('renderDice', 'Rapid consecutive state updates & re-renders (200 calls)', false, { error: err.message });
  }

  // Test 3.5: Event listener accumulation check on selectable dice
  try {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const selState = setupState({ turnPhase: 'atk_rolled', isMyAttackTurn: true });
    battleModule.renderBattle(container, { state: selState });
    emitServerStateUpdate(selState);

    const dieEl = document.querySelector('.die.selectable');
    let clickCount = 0;
    if (dieEl) {
      dieEl.click();
      if (dieEl.classList.contains('selected')) clickCount++;
      dieEl.click();
      if (!dieEl.classList.contains('selected')) clickCount++;
    }

    const passToggle = clickCount === 2;
    recordResult('renderDice', 'Selectable die toggle click behavior', passToggle, {
      clickCount,
      passToggle
    });
  } catch (err) {
    recordResult('renderDice', 'Selectable die toggle click behavior', false, { error: err.message });
  }

  // =========================================================================
  // SUMMARY REPORT
  // =========================================================================
  console.log('\n====================================================');
  console.log(`📊 FINAL STRESS TEST VERDICT: ${results.overallVerdict}`);
  console.log('====================================================\n');
  console.log(JSON.stringify(results, null, 2));

  process.exit(results.overallVerdict === 'PASS' ? 0 : 1);
}

runStressTests().catch(err => {
  console.error('Fatal Test Runner Exception:', err);
  process.exit(1);
});
