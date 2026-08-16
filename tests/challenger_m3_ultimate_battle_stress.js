import { JSDOM } from 'jsdom';

// ----------------------------------------------------
// Setup JSDOM Environment for Challenger M3 Stress Test
// ----------------------------------------------------
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head><title>Challenger M3 Ultimate & Battle Stress</title></head>
<body>
  <div id="app">
    <div class="arena">
      <div class="arena-center"></div>
      <div id="card-me" class="battle-card"></div>
      <div id="card-op" class="battle-card"></div>
      <div id="ffa-grid-container"></div>
      <div id="dice-container">
        <div class="die">1</div>
        <div class="die">2</div>
        <div class="die">3</div>
      </div>
    </div>
  </div>
  <div id="sandbox"></div>
</body>
</html>
`, { url: 'http://localhost/' });

global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
global.HTMLElement = dom.window.HTMLElement;
global.NodeList = dom.window.NodeList;
global.Element = dom.window.Element;
global.getComputedStyle = dom.window.getComputedStyle;
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

console.log('====================================================');
console.log('⚡ EMPIRICAL CHALLENGER M3: ULTIMATE & BATTLE STRESS');
console.log('====================================================\n');

const { vfxManager, rollDice, playHitImpact, triggerUltimateVFX, showSkillBanner } = await import('../src/utils/vfx.js');
const { onTurnResolved, renderBattle, refreshAll } = await import('../src/pages/battle.js');

let testCount = 0;
let passedCount = 0;
let failedCount = 0;

function assertTest(name, fn) {
  testCount++;
  console.log(`[Test ${testCount}] ${name}`);
  try {
    fn();
    passedCount++;
    console.log(`  └─ ✅ PASS`);
  } catch (err) {
    failedCount++;
    console.error(`  └─ ❌ FAIL Exception:`, err.stack || err.message);
    uncaughtExceptions.push(err);
  }
}

async function assertAsyncTest(name, fn) {
  testCount++;
  console.log(`[Test ${testCount}] ${name}`);
  try {
    await fn();
    passedCount++;
    console.log(`  └─ ✅ PASS`);
  } catch (err) {
    failedCount++;
    console.error(`  └─ ❌ FAIL Exception:`, err.stack || err.message);
    uncaughtExceptions.push(err);
  }
}

// ----------------------------------------------------
// 1. Ultimate Triggers Stress (500 Rapid Calls)
// ----------------------------------------------------
assertTest('500 Rapid Interleaved Ultimate Skill Triggers', () => {
  const characters = [
    { id: 'char_fxr', ult: 'DREAM_KING' },
    { id: 'char_fxr', ult: 'FXR_DOMAIN' },
    { id: 'lgpyForm', ult: 'DREAM_KING_RAGE' },
    { id: 'char_19', ult: 'TIMELESS_GRACE' },
    { id: 'char_4', ult: 'STAR_SHOWOFF' },
    { id: 'char_14', ult: 'BUY_WATER' },
    { id: 'char_unknown', ult: 'CUSTOM_ULT' },
    { id: null, ult: null },
    { id: undefined, ult: undefined }
  ];

  for (let i = 0; i < 500; i++) {
    const c = characters[i % characters.length];
    triggerUltimateVFX(c.id, c.ult, document.body);
  }
});

// ----------------------------------------------------
// 2. Physics Dice Roll Stress
// ----------------------------------------------------
assertTest('Physics Dice Rolling Edge Cases & Stress', () => {
  const dice = document.querySelectorAll('.die');
  
  // Normal roll
  rollDice(dice, [6, 6, 6]);
  
  // Array roll
  rollDice(Array.from(dice), [1, 2, 3]);

  // Invalid / null / empty inputs
  rollDice(null);
  rollDice(undefined);
  rollDice([]);
  rollDice([null, undefined, document.createElement('div')]);

  // Rapid 100x roll spam
  for (let i = 0; i < 100; i++) {
    rollDice(dice);
  }
});

// ----------------------------------------------------
// 3. Hit Impact & Floating Damage Stress
// ----------------------------------------------------
assertTest('Hit Impact & Floating Damage Stress (200 Calls)', () => {
  const targetMe = document.getElementById('card-me');
  const targetOp = document.getElementById('card-op');

  for (let i = 0; i < 200; i++) {
    const target = i % 2 === 0 ? targetMe : targetOp;
    const dmg = (i * 7) % 30;
    playHitImpact(target, dmg, {
      isCrit: i % 3 === 0,
      isHeavy: i % 5 === 0,
      nineLivesTriggered: i % 7 === 0,
      pierce: i % 4 === 0
    });
  }
});

// ----------------------------------------------------
// 4. Battle Loop Simulation: 100 Consecutive 1v1 Turn Resolutions
// ----------------------------------------------------
await assertAsyncTest('100 Consecutive 1v1 Turn Resolutions with Ultimates & Hit Impacts', async () => {
  const state1v1 = {
    gameMode: '1v1',
    myIndex: 0,
    attackerIdx: 0,
    defenderIdx: 1,
    schedule: ['math', 'chinese', 'english', 'physics'],
    currentClassIndex: 0,
    me: { id: 'p1', hp: 30, maxHp: 30, card: { name: 'Player 1' }, rerolls: 2 },
    opponent: { id: 'p2', hp: 30, maxHp: 30, card: { name: 'Player 2' } },
    players: [
      { id: 'p1', cardId: 'char_fxr', inDreamState: false, hp: 30, maxHp: 30 },
      { id: 'p2', cardId: 'char_19', hp: 30, maxHp: 30 }
    ]
  };

  renderBattle(document.getElementById('app'), { state: state1v1 });

  for (let t = 0; t < 100; t++) {
    const atkIdx = t % 2;
    const charList = ['char_fxr', 'lgpyForm', 'char_19', 'char_4', 'char_14'];
    const attackerChar = charList[t % charList.length];

    state1v1.attackerIdx = atkIdx;
    state1v1.defenderIdx = 1 - atkIdx;
    state1v1.players[atkIdx].cardId = attackerChar;
    if (attackerChar === 'lgpyForm') {
      state1v1.players[atkIdx].lgpyForm = true;
    } else {
      delete state1v1.players[atkIdx].lgpyForm;
    }
    if (attackerChar === 'char_14') {
      state1v1.players[atkIdx].chargeStacks = 2;
    }

    onTurnResolved({
      isAoE: false,
      state: state1v1,
      damage: (t * 3) % 20,
      attackerIdx: atkIdx,
      nineLivesTriggered: t % 10 === 0,
      pierce: t % 5 === 0,
      atkResult: { posTriggered: true, pierce: true }
    });
  }

  // Brief wait for turn timeouts
  await new Promise(r => setTimeout(r, 1200));
});

// ----------------------------------------------------
// 5. Battle Loop Simulation: 50 Consecutive FFA Group Damage Resolutions
// ----------------------------------------------------
await assertAsyncTest('50 Consecutive 4-Player FFA Group Damage (AoE) Resolutions', async () => {
  const ffaState = {
    gameMode: 'sanguosha',
    myIndex: 0,
    attackerIdx: 0,
    defenderIdx: null,
    schedule: ['math', 'chinese'],
    currentClassIndex: 0,
    me: { id: 'p1', hp: 30, maxHp: 30, rerolls: 3 },
    players: [
      { id: 'p1', nickname: 'P1', hp: 30, maxHp: 30, cardId: 'char_fxr' },
      { id: 'p2', nickname: 'P2', hp: 25, maxHp: 30, cardId: 'char_19' },
      { id: 'p3', nickname: 'P3', hp: 20, maxHp: 30, cardId: 'char_14', chargeStacks: 2 },
      { id: 'p4', nickname: 'P4', hp: 15, maxHp: 30, cardId: 'char_4' }
    ]
  };

  renderBattle(document.getElementById('app'), { state: ffaState });

  for (let turn = 0; turn < 50; turn++) {
    const atkIdx = turn % 4;
    ffaState.attackerIdx = atkIdx;

    onTurnResolved({
      isAoE: true,
      aoeResults: [
        { playerId: 'p1', damage: (turn * 2) % 15, nineLivesTriggered: turn % 8 === 0 },
        { playerId: 'p2', damage: (turn * 3) % 18, nineLivesTriggered: false },
        { playerId: 'p3', damage: (turn * 4) % 22, nineLivesTriggered: false },
        { playerId: 'p4', damage: (turn * 5) % 25, nineLivesTriggered: false }
      ],
      state: ffaState,
      damage: 0,
      attackerIdx: atkIdx,
      atkResult: { posTriggered: true, pierce: true }
    });
  }

  await new Promise(r => setTimeout(r, 1200));
});

// ----------------------------------------------------
// 6. DOM Mutation / Unmount during Active VFX Timelines
// ----------------------------------------------------
await assertAsyncTest('DOM Mutation & Element Unmounting during Active VFX', async () => {
  const tempArena = document.createElement('div');
  tempArena.className = 'temp-arena';
  document.body.appendChild(tempArena);

  // Trigger all ultimates in temp container
  triggerUltimateVFX('char_fxr', 'DREAM_KING', tempArena);
  triggerUltimateVFX('lgpyForm', 'DREAM_KING_RAGE', tempArena);
  triggerUltimateVFX('char_19', 'TIMELESS_GRACE', tempArena);
  triggerUltimateVFX('char_4', 'STAR_SHOWOFF', tempArena);
  triggerUltimateVFX('char_14', 'BUY_WATER', tempArena);

  // Immediately destroy temp container
  tempArena.remove();

  // Trigger floating damage and immediately remove target card
  const tempCard = document.createElement('div');
  document.body.appendChild(tempCard);
  playHitImpact(tempCard, 15, { isHeavy: true });
  tempCard.remove();

  await new Promise(r => setTimeout(r, 1000));
});

// ----------------------------------------------------
// 7. DOM Cleanup & Memory Leak Verification
// ----------------------------------------------------
await assertAsyncTest('DOM Cleanup & Element Removal Verification', async () => {
  console.log('  Waiting 3500ms for GSAP timelines to finalize and cleanup DOM overlays...');
  await new Promise(r => setTimeout(r, 3500));

  // Check if temporary overlays were removed
  const overlays = document.querySelectorAll('.fxr-domain-overlay, .redheat-vignette, .gold-beam-sweep, .star-constellation-overlay, .azure-water-wave, .skill-glass-banner');
  console.log(`  Active Overlay Count in DOM after cleanup: ${overlays.length}`);
  if (overlays.length > 0) {
    throw new Error(`DOM leak detected: ${overlays.length} overlay elements remained un-removed.`);
  }
});

// ----------------------------------------------------
// SUMMARY & VERDICT
// ----------------------------------------------------
setTimeout(() => {
  console.log('\n====================================================');
  console.log(`SUMMARY: Total: ${testCount} | Passed: ${passedCount} | Failed: ${failedCount}`);
  console.log(`Uncaught JS Exceptions: ${uncaughtExceptions.length}`);
  console.log('====================================================\n');

  if (failedCount === 0 && uncaughtExceptions.length === 0) {
    console.log('EMPIRICAL CHALLENGER VERDICT: PASS');
    process.exit(0);
  } else {
    console.log('EMPIRICAL CHALLENGER VERDICT: FAIL');
    process.exit(1);
  }
}, 4000);
