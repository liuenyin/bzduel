import { JSDOM } from 'jsdom';

// 1. Setup DOM environment
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head><title>M3 VFX Stress Test</title></head>
<body>
  <div id="app">
    <div class="arena">
      <div class="arena-center"></div>
      <div class="player-card battle-card" id="card-p1"></div>
      <div class="enemy-card battle-card" id="card-p2"></div>
    </div>
  </div>
</body>
</html>
`, { url: 'http://localhost/' });

global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
try {
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
} catch (e) {}
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

let uncaughtExceptions = [];
dom.window.addEventListener('error', (event) => {
  console.error('JSDOM Window Error:', event.error || event.message);
  uncaughtExceptions.push(event.error || event.message);
});

process.on('uncaughtException', (err) => {
  console.error('Process Uncaught Exception:', err);
  uncaughtExceptions.push(err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Process Unhandled Rejection:', reason);
  uncaughtExceptions.push(reason);
});

console.log('--- STARTING MILESTONE 3 EMPIRICAL STRESS TESTS ---');

const { vfxManager, triggerUltimateVFX, showSkillBanner } = await import('../src/utils/vfx.js');

let testCount = 0;
let passedCount = 0;
let failedCount = 0;

function runTestCase(name, fn) {
  testCount++;
  console.log(`\n[Test ${testCount}] ${name}`);
  try {
    fn();
    passedCount++;
    console.log(`  └─ PASS`);
  } catch (err) {
    failedCount++;
    console.error(`  └─ FAIL Exception:`, err.message);
    uncaughtExceptions.push(err);
  }
}

// ----------------------------------------------------
// TEST SUITE 1: All Character Ultimate Triggers
// ----------------------------------------------------

runTestCase('Fu Xiuran Domain Expansion (char_fxr / DREAM_KING / FXR_DOMAIN)', () => {
  triggerUltimateVFX('char_fxr', 'DREAM_KING');
  triggerUltimateVFX('char_fxr', 'FXR_DOMAIN');
  triggerUltimateVFX('other_id', 'DREAM_KING');
});

runTestCase('Dream King Rage Form (lgpyForm / DREAM_KING_RAGE)', () => {
  triggerUltimateVFX('lgpyForm', 'DREAM_KING_RAGE');
  triggerUltimateVFX('lgpyForm', 'SOME_NAME');
  triggerUltimateVFX('other_id', 'DREAM_KING_RAGE');
});

runTestCase('Yan Ziming Timeless Grace (char_19 / TIMELESS_GRACE)', () => {
  triggerUltimateVFX('char_19', 'TIMELESS_GRACE');
  triggerUltimateVFX('char_19', 'OTHER');
  triggerUltimateVFX('other', 'TIMELESS_GRACE');
});

runTestCase('Wang Hedi Star Showoff (char_4 / STAR_SHOWOFF)', () => {
  triggerUltimateVFX('char_4', 'STAR_SHOWOFF');
  triggerUltimateVFX('char_4', 'OTHER');
  triggerUltimateVFX('other', 'STAR_SHOWOFF');
});

runTestCase('Zhou Xuansheng Buy Water (char_14 / BUY_WATER)', () => {
  triggerUltimateVFX('char_14', 'BUY_WATER');
  triggerUltimateVFX('char_14', 'OTHER');
  triggerUltimateVFX('other', 'BUY_WATER');
});

runTestCase('showSkillBanner with all theme types and parameters', () => {
  showSkillBanner('Title Only');
  showSkillBanner('Title & Sub', 'Subtitle Text');
  showSkillBanner('Positive', 'Desc', 'pos');
  showSkillBanner('Negative', 'Desc', 'neg');
  showSkillBanner('Neutral', 'Desc', 'neu');
  showSkillBanner('Gold', 'Desc', 'gold');
  showSkillBanner('Crimson', 'Desc', 'crimson');
  showSkillBanner('Azure', 'Desc', 'azure');
  showSkillBanner('CustomType', 'Desc', 'custom');
});

// ----------------------------------------------------
// TEST SUITE 2: Edge Cases - Missing Container Elements
// ----------------------------------------------------

runTestCase('Missing container: containerElement is null', () => {
  triggerUltimateVFX('char_fxr', 'DREAM_KING', null);
  triggerUltimateVFX('lgpyForm', 'DREAM_KING_RAGE', null);
  triggerUltimateVFX('char_19', 'TIMELESS_GRACE', null);
  triggerUltimateVFX('char_4', 'STAR_SHOWOFF', null);
  triggerUltimateVFX('char_14', 'BUY_WATER', null);
  triggerUltimateVFX(null, null, null);
});

runTestCase('Missing container: containerElement is undefined', () => {
  triggerUltimateVFX('char_fxr', 'DREAM_KING', undefined);
  triggerUltimateVFX('lgpyForm', 'DREAM_KING_RAGE', undefined);
  triggerUltimateVFX('char_19', 'TIMELESS_GRACE', undefined);
  triggerUltimateVFX(undefined, undefined, undefined);
});

runTestCase('Missing DOM elements: .arena and .arena-center removed from document', () => {
  const arena = document.querySelector('.arena');
  const arenaCenter = document.querySelector('.arena-center');
  if (arena) arena.remove();
  if (arenaCenter) arenaCenter.remove();

  triggerUltimateVFX('char_fxr', 'DREAM_KING');
  triggerUltimateVFX('lgpyForm', 'DREAM_KING_RAGE');
  triggerUltimateVFX('char_19', 'TIMELESS_GRACE');
  triggerUltimateVFX('char_4', 'STAR_SHOWOFF');
  triggerUltimateVFX('char_14', 'BUY_WATER');
  showSkillBanner('No Arena Banner', 'Sub');

  // Re-attach for subsequent tests
  document.body.innerHTML = `
    <div id="app">
      <div class="arena">
        <div class="arena-center"></div>
      </div>
    </div>
  `;
});

// ----------------------------------------------------
// TEST SUITE 3: Edge Cases - Null / Invalid Character IDs & Names
// ----------------------------------------------------

runTestCase('Null / Undefined character IDs and ultimate names', () => {
  triggerUltimateVFX(null, null);
  triggerUltimateVFX(undefined, undefined);
  triggerUltimateVFX('', '');
  triggerUltimateVFX(0, 0);
  triggerUltimateVFX(false, false);
  triggerUltimateVFX({}, []);
  showSkillBanner(null, null, null);
  showSkillBanner(undefined, undefined, undefined);
  showSkillBanner('', '', '');
});

runTestCase('Unknown character ID and unknown ultimate name', () => {
  triggerUltimateVFX('char_nonexistent', 'UNKNOWN_ULTIMATE');
  triggerUltimateVFX('random_999', 'FOO_BAR');
});

// ----------------------------------------------------
// TEST SUITE 4: Edge Cases - Rapid Repeated Triggers (50+ iterations)
// ----------------------------------------------------

runTestCase('Rapid repeated ultimate triggers: 60 iterations across all characters', () => {
  const characters = [
    { id: 'char_fxr', ult: 'DREAM_KING' },
    { id: 'lgpyForm', ult: 'DREAM_KING_RAGE' },
    { id: 'char_19', ult: 'TIMELESS_GRACE' },
    { id: 'char_4', ult: 'STAR_SHOWOFF' },
    { id: 'char_14', ult: 'BUY_WATER' },
    { id: null, ult: null }
  ];

  for (let i = 0; i < 60; i++) {
    const char = characters[i % characters.length];
    triggerUltimateVFX(char.id, char.ult);
  }
});

runTestCase('Rapid repeated skill banners: 60 iterations', () => {
  for (let i = 0; i < 60; i++) {
    showSkillBanner(`Rapid Banner #${i}`, `Subtitle #${i}`, i % 2 === 0 ? 'pos' : 'crimson');
  }
});

runTestCase('Rapid repeated mixed VFX calls: 100 iterations', () => {
  const container = document.body;
  for (let i = 0; i < 100; i++) {
    vfxManager.triggerCameraImpulse(1.5);
    triggerUltimateVFX('char_fxr', 'DREAM_KING', container);
    showSkillBanner(`Mixed Banner #${i}`, 'Detail');
    vfxManager.spawnParticles(100, 100, 15, '#ff0000');
  }
});

// ----------------------------------------------------
// TEST SUITE 5: Edge Cases - Unmounted DOM Nodes
// ----------------------------------------------------

runTestCase('Detached container element passed to triggerUltimateVFX', () => {
  const detachedDiv = document.createElement('div');
  detachedDiv.className = 'detached-container';

  triggerUltimateVFX('char_fxr', 'DREAM_KING', detachedDiv);
  triggerUltimateVFX('lgpyForm', 'DREAM_KING_RAGE', detachedDiv);
  triggerUltimateVFX('char_19', 'TIMELESS_GRACE', detachedDiv);
  triggerUltimateVFX('char_4', 'STAR_SHOWOFF', detachedDiv);
  triggerUltimateVFX('char_14', 'BUY_WATER', detachedDiv);
  triggerUltimateVFX(null, null, detachedDiv);
});

runTestCase('Container element unmounted immediately after trigger', () => {
  const tempContainer = document.createElement('div');
  document.body.appendChild(tempContainer);

  triggerUltimateVFX('char_fxr', 'DREAM_KING', tempContainer);
  triggerUltimateVFX('lgpyForm', 'DREAM_KING_RAGE', tempContainer);

  // Immediately remove container from DOM
  tempContainer.remove();
});

runTestCase('.arena-center unmounted during active banners', () => {
  const arenaCenter = document.querySelector('.arena-center');
  showSkillBanner('Banner Before Removal', 'Testing unmount');
  if (arenaCenter) arenaCenter.remove();
  showSkillBanner('Banner After Removal', 'Testing fallback to body');
});

// ----------------------------------------------------
// TEST SUITE 6: Asynchronous Timers & Cleanup Verification
// ----------------------------------------------------

runTestCase('Awaiting asynchronous animation completions & GSAP cleanup', async () => {
  console.log('  Waiting 3000ms for GSAP timelines and onComplete cleanup...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log('  Async wait finished.');
});

// ----------------------------------------------------
// FINAL VERDICT EVALUATION
// ----------------------------------------------------

setTimeout(() => {
  console.log('\n====================================================');
  console.log(`TEST SUMMARY: Total: ${testCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log(`Uncaught Exceptions Count: ${uncaughtExceptions.length}`);
  if (uncaughtExceptions.length > 0) {
    console.log('Uncaught Exceptions:', uncaughtExceptions);
  }
  console.log('====================================================\n');

  if (failedCount === 0 && uncaughtExceptions.length === 0) {
    console.log('VERDICT: PASS');
    process.exit(0);
  } else {
    console.log('VERDICT: FAIL');
    process.exit(1);
  }
}, 3200);
