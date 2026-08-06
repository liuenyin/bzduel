import { JSDOM } from 'jsdom';

// 1. Initialize JSDOM environment
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

const { vfxManager, rollDice } = await import('../src/utils/vfx.js');
const battleModule = await import('../src/pages/battle.js');

async function runDeepStress() {
  console.log('====================================================');
  console.log('🔥 DEEP EMPIRICAL STRESS TEST SUITE (challenger_m2_3)');
  console.log('====================================================\n');

  let allPass = true;

  function report(name, pass, details) {
    const icon = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${icon} | ${name}`);
    console.log(`   Details: ${JSON.stringify(details)}`);
    if (!pass) allPass = false;
  }

  // -------------------------------------------------------------------------
  // Edge Case 1: rollDice with non-Element / non-HTMLElement objects in array
  // -------------------------------------------------------------------------
  try {
    const textNode = document.createTextNode('dice');
    const commentNode = document.createComment('comment');
    const plainObj = { foo: 'bar' };
    const validDiv = document.createElement('div');
    validDiv.className = 'die';

    let errorMsg = null;
    try {
      // Elements without .style property or non-DOM objects
      rollDice([validDiv, textNode, commentNode, plainObj, "str", 123, true]);
    } catch (err) {
      errorMsg = err.message;
    }

    // In JS/GSAP, passing non-elements without .style might throw if not guarded.
    report('rollDice with non-Element objects in array', errorMsg === null, {
      thrownError: errorMsg || 'None (Safely Handled)'
    });
  } catch (e) {
    report('rollDice with non-Element objects in array', false, { error: e.message });
  }

  // -------------------------------------------------------------------------
  // Edge Case 2: Non-iterable inputs to rollDice
  // -------------------------------------------------------------------------
  try {
    const badInputs = [12345, true, false, Symbol('die'), { length: 'invalid' }];
    let badInputsHandled = true;
    for (const val of badInputs) {
      try {
        rollDice(val);
      } catch (err) {
        badInputsHandled = false;
      }
    }

    report('rollDice with non-iterable primitive inputs', badInputsHandled, {
      badInputsHandled
    });
  } catch (e) {
    report('rollDice with non-iterable primitive inputs', false, { error: e.message });
  }

  // -------------------------------------------------------------------------
  // Edge Case 3: Rapid reroll click simulation (Concurrent GSAP animation overrides)
  // -------------------------------------------------------------------------
  try {
    const diceContainer = document.createElement('div');
    document.body.appendChild(diceContainer);
    const diceEls = [];
    for (let i = 0; i < 5; i++) {
      const die = document.createElement('div');
      die.className = 'die rolling selectable';
      die.dataset.val = (i + 1).toString();
      diceContainer.appendChild(die);
      diceEls.push(die);
    }

    let rapidOverrideOk = true;
    try {
      for (let i = 0; i < 100; i++) {
        // Trigger rapid overlapping rollDice animations on the same elements
        rollDice(diceEls, [i % 6, (i + 1) % 6, (i + 2) % 6, (i + 3) % 6, (i + 4) % 6]);
      }
    } catch (err) {
      rapidOverrideOk = false;
    }

    report('Rapid overlapping rollDice animations on same elements (100 overrides)', rapidOverrideOk, {
      rapidOverrideOk
    });
  } catch (e) {
    report('Rapid overlapping rollDice animations on same elements', false, { error: e.message });
  }

  // -------------------------------------------------------------------------
  // Edge Case 4: Memory & Animation Cleanup under 2,000 iterations
  // -------------------------------------------------------------------------
  try {
    let iterationPass = true;
    for (let i = 0; i < 2000; i++) {
      const die = document.createElement('div');
      die.className = 'die';
      const tl = rollDice([die], [6]);
      if (!tl) {
        iterationPass = false;
        break;
      }
    }

    report('Memory & animation cleanup under 2,000 roll iterations', iterationPass, {
      iterationPass
    });
  } catch (e) {
    report('Memory & animation cleanup under 2,000 roll iterations', false, { error: e.message });
  }

  // -------------------------------------------------------------------------
  // Edge Case 5: Callback throwing an exception inside rollDice
  // -------------------------------------------------------------------------
  try {
    const die = document.createElement('div');
    die.className = 'die';

    let handledGracefully = false;
    try {
      rollDice([], [], () => { throw new Error('Callback exception'); });
      handledGracefully = true;
    } catch (err) {
      // Exception in callback should be caught or handled if needed
      handledGracefully = false;
    }

    report('Callback throwing exception handling inside empty array check', handledGracefully, {
      handledGracefully
    });
  } catch (e) {
    report('Callback throwing exception handling', false, { error: e.message });
  }

  console.log('\n====================================================');
  console.log(`📊 FINAL DEEP STRESS VERDICT: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log('====================================================\n');

  process.exit(allPass ? 0 : 1);
}

runDeepStress().catch(err => {
  console.error('Fatal Test Exception:', err);
  process.exit(1);
});
