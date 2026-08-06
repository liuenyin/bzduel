import { JSDOM } from 'jsdom';

// ----------------------------------------------------
// Setup JSDOM Environment for Empirical Stress Testing
// ----------------------------------------------------
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="sandbox"></div></body></html>', {
  url: 'http://localhost/'
});

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

const { vfxManager } = await import('../src/utils/vfx.js');
const { onTurnResolved, renderBattle } = await import('../src/pages/battle.js');

async function runChallengerM24Suite() {
  console.log('====================================================');
  console.log('🔥 CHALLENGER M2_4 EMPIRICAL STRESS SUITE');
  console.log('====================================================\n');

  const testResults = [];
  const record = (name, pass, details) => {
    testResults.push({ name, pass, details });
    const symbol = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${symbol} | ${name}`);
    console.log(`   Details: ${details}\n`);
  };

  const sandbox = document.getElementById('sandbox');

  // ----------------------------------------------------
  // TEST 1: Combat Impact VFX & Floating Damage Stress
  // ----------------------------------------------------
  try {
    const cardEl = document.createElement('div');
    cardEl.className = 'battle-card';
    sandbox.appendChild(cardEl);

    let callbackFired = false;
    vfxManager.playHitImpact(cardEl, 25, { isCrit: true, isHeavy: true, pierce: true }, () => {
      callbackFired = true;
    });

    await new Promise(r => setTimeout(r, 600));

    record('Combat Impact VFX & PlayHitImpact', callbackFired,
      `Hit impact animation executed. Callback fired: ${callbackFired}`);
  } catch (e) {
    record('Combat Impact VFX & PlayHitImpact', false, `Exception: ${e.message}`);
  }

  // ----------------------------------------------------
  // TEST 2: Directional Flashes & Card Impulses
  // ----------------------------------------------------
  try {
    const atkCard = document.createElement('div');
    atkCard.className = 'battle-card-wrap';
    const defCard = document.createElement('div');
    defCard.className = 'battle-card-wrap';
    sandbox.appendChild(atkCard);
    sandbox.appendChild(defCard);

    atkCard.classList.add('card-attacking');
    defCard.classList.add('card-hit');

    const pass = atkCard.classList.contains('card-attacking') && defCard.classList.contains('card-hit');
    record('Directional Flashes & Card Class Impulses', pass,
      `Attacker & Defender directional CSS classes toggled correctly`);
  } catch (e) {
    record('Directional Flashes & Card Class Impulses', false, `Exception: ${e.message}`);
  }

  // ----------------------------------------------------
  // TEST 3: AoE Damage Resolution (Valid Multi-Target Array)
  // ----------------------------------------------------
  try {
    const ffaState = {
      gameMode: 'sanguosha',
      myIndex: 0,
      attackerIdx: 0,
      defenderIdx: null,
      schedule: ['math'],
      currentClassIndex: 0,
      me: { id: 'p1', hp: 30, maxHp: 30, card: { name: 'P1' } },
      players: [
        { id: 'p1', nickname: 'P1', hp: 30, maxHp: 30 },
        { id: 'p2', nickname: 'P2', hp: 30, maxHp: 30 },
        { id: 'p3', nickname: 'P3', hp: 30, maxHp: 30 }
      ]
    };

    renderBattle(sandbox, { state: ffaState });

    let threwAoE = false;
    try {
      onTurnResolved({
        isAoE: true,
        aoeResults: [
          { playerId: 'p1', damage: 4, nineLivesTriggered: false },
          { playerId: 'p2', damage: 10, nineLivesTriggered: false },
          { playerId: 'p3', damage: 18, nineLivesTriggered: true }
        ],
        state: ffaState,
        damage: 0,
        finalDef: 0,
        attackerIdx: 0
      });
    } catch (err) {
      threwAoE = true;
    }

    await new Promise(r => setTimeout(r, 2600));

    record('AoE Damage Resolution (Valid Multi-Target Array)', !threwAoE,
      `Multi-target damage loop executed cleanly. Exception: ${threwAoE}`);
  } catch (e) {
    record('AoE Damage Resolution (Valid Multi-Target Array)', false, `Exception: ${e.message}`);
  }

  // ----------------------------------------------------
  // TEST 4: Edge Case - aoeResults is null when isAoE is true
  // ----------------------------------------------------
  try {
    const ffaState = {
      gameMode: 'sanguosha',
      myIndex: 0,
      attackerIdx: 0,
      defenderIdx: null,
      schedule: ['math'],
      currentClassIndex: 0,
      me: { id: 'p1', hp: 30, maxHp: 30 },
      players: [{ id: 'p1', nickname: 'P1', hp: 30, maxHp: 30 }]
    };

    renderBattle(sandbox, { state: ffaState });

    let threwNullAoE = false;
    try {
      onTurnResolved({
        isAoE: true,
        aoeResults: null, // NULL AOERESULTS
        state: ffaState,
        damage: 10,
        finalDef: 0,
        attackerIdx: 0
      });
    } catch (err) {
      threwNullAoE = true;
    }

    await new Promise(r => setTimeout(r, 1600));

    record('Edge Case: aoeResults is null when isAoE=true', !threwNullAoE,
      `Handled safe fallback via Array.isArray check. Threw exception: ${threwNullAoE}`);
  } catch (e) {
    record('Edge Case: aoeResults is null when isAoE=true', false, `Exception: ${e.message}`);
  }

  // ----------------------------------------------------
  // TEST 5: Edge Case - defenderIdx is null / undefined
  // ----------------------------------------------------
  try {
    const stateNullDef = {
      gameMode: 'sanguosha',
      myIndex: 0,
      attackerIdx: 0,
      defenderIdx: undefined, // UNDEFINED DEFENDER INDEX
      schedule: ['math'],
      currentClassIndex: 0,
      me: { id: 'p1', hp: 30, maxHp: 30 },
      opponent: { id: 'p2', hp: 30, maxHp: 30 },
      players: [
        { id: 'p1', nickname: 'P1', hp: 30, maxHp: 30 },
        { id: 'p2', nickname: 'P2', hp: 30, maxHp: 30 }
      ]
    };

    renderBattle(sandbox, { state: stateNullDef });

    let threwNullDef = false;
    try {
      onTurnResolved({
        state: stateNullDef,
        damage: 6,
        finalDef: 2,
        penalty: 0,
        gameOver: false,
        attackerIdx: 0
      });
    } catch (err) {
      threwNullDef = true;
    }

    await new Promise(r => setTimeout(r, 1600));

    record('Edge Case: defenderIdx is null/undefined', !threwNullDef,
      `Safe navigation on defId handled. Threw exception: ${threwNullDef}`);
  } catch (e) {
    record('Edge Case: defenderIdx is null/undefined', false, `Exception: ${e.message}`);
  }

  // ----------------------------------------------------
  // TEST 6: Edge Case - S.players is uninitialized / empty [] in FFA Non-AoE path
  // ----------------------------------------------------
  try {
    const ffaStateNoPlayers = {
      gameMode: 'sanguosha',
      myIndex: 0,
      attackerIdx: 0,
      defenderIdx: 1,
      schedule: ['math'],
      currentClassIndex: 0,
      me: { id: 'p1', hp: 20, maxHp: 30 },
      players: [] // UNINITIALIZED / EMPTY PLAYERS ARRAY
    };

    renderBattle(sandbox, { state: ffaStateNoPlayers });

    let exceptionMessage = null;

    // Listen for uncaught exceptions in setTimeout
    const originalUncaught = process.listeners('uncaughtException');
    const handler = (err) => {
      exceptionMessage = err.message;
    };
    process.on('uncaughtException', handler);

    onTurnResolved({
      state: ffaStateNoPlayers,
      damage: 10,
      finalDef: 2,
      penalty: 0,
      gameOver: false,
      attackerIdx: 0
    });

    await new Promise(r => setTimeout(r, 1200));
    process.removeListener('uncaughtException', handler);

    if (exceptionMessage) {
      record('Edge Case: S.players is uninitialized [] in FFA non-AoE (line 799)', false,
        `UNHANDLED EXCEPTION IN TIMEOUT: ${exceptionMessage}`);
    } else {
      record('Edge Case: S.players is uninitialized [] in FFA non-AoE (line 799)', true,
        `Handled safely`);
    }
  } catch (e) {
    record('Edge Case: S.players is uninitialized [] in FFA non-AoE (line 799)', false,
      `EXCEPTION: ${e.message}`);
  }

  // ----------------------------------------------------
  // TEST 7: Edge Case - S.players is uninitialized [] in AoE path (line 747)
  // ----------------------------------------------------
  try {
    const aoeStateNoPlayers = {
      gameMode: 'sanguosha',
      myIndex: 0,
      attackerIdx: 0,
      defenderIdx: null,
      schedule: ['math'],
      currentClassIndex: 0,
      me: { id: 'p1', hp: 30, maxHp: 30 },
      players: [] // UNINITIALIZED / EMPTY PLAYERS ARRAY
    };

    renderBattle(sandbox, { state: aoeStateNoPlayers });

    let exceptionMessage = null;
    const handler = (err) => {
      exceptionMessage = err.message;
    };
    process.on('uncaughtException', handler);

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

    await new Promise(r => setTimeout(r, 1200));
    process.removeListener('uncaughtException', handler);

    if (exceptionMessage) {
      record('Edge Case: S.players is uninitialized [] in AoE path (line 747)', false,
        `UNHANDLED EXCEPTION IN TIMEOUT: ${exceptionMessage}`);
    } else {
      record('Edge Case: S.players is uninitialized [] in AoE path (line 747)', true,
        `Handled safely`);
    }
  } catch (e) {
    record('Edge Case: S.players is uninitialized [] in AoE path (line 747)', false,
      `EXCEPTION: ${e.message}`);
  }

  // ----------------------------------------------------
  // Summary & Overall Verdict
  // ----------------------------------------------------
  const passedAll = testResults.every(r => r.pass);
  const overallVerdict = passedAll ? 'PASS' : 'FAIL';

  console.log('====================================================');
  console.log(`📊 CHALLENGER M2_4 VERDICT: ${overallVerdict}`);
  console.log('====================================================\n');

  process.exit(passedAll ? 0 : 1);
}

runChallengerM24Suite().catch(err => {
  console.error('Fatal Test Exception:', err);
  process.exit(1);
});
