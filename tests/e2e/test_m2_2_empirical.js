import { spawn } from 'child_process';
import http from 'http';
import net from 'net';
import { chromium } from 'playwright';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function isPortOpen(port, host = 'localhost') {
  return new Promise((resolve) => {
    const socket = net.connect(port, host, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
  });
}

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      }).on('error', () => {
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server at ${url} did not respond within ${timeoutMs}ms`));
      } else {
        setTimeout(check, 300);
      }
    };
    check();
  });
}

async function runEmpiricalStressSuite(browser, baseURL) {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (err) => {
    pageErrors.push(err.message || err.toString());
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('Failed to load resource') && !text.includes('WebSocket closed without opened')) {
        consoleErrors.push(text);
      }
    }
  });

  console.log('🌐 Loading application page for module access...');
  await page.goto(baseURL);
  await page.waitForSelector('#nickname-input', { timeout: 10000 });

  console.log('\n====================================================');
  console.log('🔥 RUNNING COMPREHENSIVE EMPIRICAL STRESS TEST SUITE M2.2');
  console.log('====================================================\n');

  // Execute stress suite in browser context
  const testResults = await page.evaluate(async () => {
    const results = [];
    const logResult = (name, pass, details) => {
      results.push({ name, pass, details });
    };

    // Import target modules dynamically
    let vfxManager, onTurnResolved, renderBattle;
    try {
      const vfxModule = await import('/src/utils/vfx.js');
      vfxManager = vfxModule.vfxManager;
      const battleModule = await import('/src/pages/battle.js');
      onTurnResolved = battleModule.onTurnResolved;
      renderBattle = battleModule.renderBattle;
    } catch (err) {
      return [{ name: 'Module Import', pass: false, details: `Failed to import modules: ${err.stack || err.message}` }];
    }

    // Helper: create sandbox container
    const sandbox = document.createElement('div');
    sandbox.id = 'stress-sandbox';
    document.body.appendChild(sandbox);

    // ----------------------------------------------------
    // TEST 1: vfx.js - spawnFloatingDamage Edge Cases & Rapid Spawn Cleanup
    // ----------------------------------------------------
    try {
      const targetDiv = document.createElement('div');
      targetDiv.className = 'test-card-target';
      sandbox.appendChild(targetDiv);

      // Null target test
      const nullRes = vfxManager.spawnFloatingDamage(null, 10);
      const passNull = nullRes === null;

      // Invalid damage values test
      const invalidValues = [NaN, null, undefined, -15, Infinity, 'invalid', '100', 0, 5];
      let invalidTextPass = true;
      for (const val of invalidValues) {
        const el = vfxManager.spawnFloatingDamage(targetDiv, val);
        if (!el) invalidTextPass = false;
      }

      // High load spawn & DOM cleanup check
      const spawnCount = 200;
      for (let i = 0; i < spawnCount; i++) {
        vfxManager.spawnFloatingDamage(targetDiv, i % 20);
      }

      // Wait for GSAP timeline completion (0.3s + 0.35s + 0.5s = 1.15s)
      await new Promise(r => setTimeout(r, 1400));
      const remainingFloatEls = targetDiv.querySelectorAll('.floating-damage');
      const passCleanup = remainingFloatEls.length === 0;

      logResult('vfx.spawnFloatingDamage Edge Cases & Cleanup', passNull && invalidTextPass && passCleanup, 
        `nullTarget: ${passNull}, invalidValues: ${invalidTextPass}, floatCleanup (remaining: ${remainingFloatEls.length}/${spawnCount}): ${passCleanup}`);
    } catch (e) {
      logResult('vfx.spawnFloatingDamage Edge Cases & Cleanup', false, `Exception: ${e.stack || e.message}`);
    }

    // ----------------------------------------------------
    // TEST 2: vfx.js - spawnParticles Heavy Load & Cleanup
    // ----------------------------------------------------
    try {
      // 2a. count = 0 (empty timeline cleanup check)
      vfxManager.spawnParticles(100, 100, 0);
      await new Promise(r => setTimeout(r, 100));

      // 2b. Invalid coordinates (NaN, null, undefined)
      vfxManager.spawnParticles(NaN, NaN, 10);
      vfxManager.spawnParticles(null, null, 10);
      vfxManager.spawnParticles(undefined, undefined, 10);

      // 2c. Heavy particle load (50 bursts of 20 particles = 1000 particles)
      const bursts = 50;
      for (let i = 0; i < bursts; i++) {
        vfxManager.spawnParticles(200 + (i * 2), 200 + (i * 2), 20, '#ff0000');
      }

      // Wait for particle timelines to finish (~0.7s duration + buffer)
      await new Promise(r => setTimeout(r, 1200));

      // Check if any leftover particle containers remain on document.body
      const orphanedContainers = document.querySelectorAll('body > div[style*="position: fixed"][style*="z-index: 9999"]');
      const passParticleCleanup = orphanedContainers.length === 0;

      logResult('vfx.spawnParticles Heavy Load & DOM Cleanup', passParticleCleanup,
        `Orphaned particle containers remaining: ${orphanedContainers.length}`);
    } catch (e) {
      logResult('vfx.spawnParticles Heavy Load & DOM Cleanup', false, `Exception: ${e.stack || e.message}`);
    }

    // ----------------------------------------------------
    // TEST 3: vfx.js - playHitImpact Null/Invalid Inputs & Callbacks
    // ----------------------------------------------------
    try {
      let hitCompleted = false;

      // Null target element
      vfxManager.playHitImpact(null, 10, {}, () => { hitCompleted = true; });

      // Valid card target element
      const cardEl = document.createElement('div');
      cardEl.className = 'battle-card';
      sandbox.appendChild(cardEl);

      let cardHitCompleted = false;
      vfxManager.playHitImpact(cardEl, NaN, { isCrit: true, isHeavy: true, nineLivesTriggered: true }, () => { cardHitCompleted = true; });
      vfxManager.playHitImpact(cardEl, null, { isCrit: false });
      vfxManager.playHitImpact(cardEl, undefined);
      vfxManager.playHitImpact(cardEl, -100);
      vfxManager.playHitImpact(cardEl, Infinity);

      await new Promise(r => setTimeout(r, 600));

      logResult('vfx.playHitImpact Null/Invalid Inputs', hitCompleted && cardHitCompleted,
        `Null target callback fired: ${hitCompleted}, Card target callback fired: ${cardHitCompleted}`);
    } catch (e) {
      logResult('vfx.playHitImpact Null/Invalid Inputs', false, `Exception: ${e.stack || e.message}`);
    }

    // ----------------------------------------------------
    // TEST 4: battle.js - onTurnResolved Empty/Uninitialized State Handling
    // ----------------------------------------------------
    try {
      // Data with empty state
      const mockDataMissingState = {
        state: {
          gameMode: '1v1',
          myIndex: 0,
          attackerIdx: 0,
          defenderIdx: 1,
          me: { hp: 20, maxHp: 30 },
          opponent: { hp: 15, maxHp: 30 },
          schedule: ['math'],
          currentClassIndex: 0,
          players: []
        },
        damage: 10,
        finalDef: 5,
        penalty: 0,
        gameOver: false,
        attackerIdx: 0
      };

      let threwError = false;
      let errorMsg = '';
      try {
        onTurnResolved(mockDataMissingState);
      } catch (err) {
        threwError = true;
        errorMsg = err.message || err.toString();
      }

      await new Promise(r => setTimeout(r, 1600));

      logResult('battle.onTurnResolved Uninitialized Module State Test', !threwError,
        threwError ? `THREW EXCEPTION: ${errorMsg}` : 'Handled without throwing exception');
    } catch (e) {
      logResult('battle.onTurnResolved Uninitialized Module State Test', false, `Exception: ${e.stack || e.message}`);
    }

    // ----------------------------------------------------
    // TEST 5: battle.js - onTurnResolved defenderIdx=undefined & out-of-bounds Test
    // ----------------------------------------------------
    try {
      const mockState1v1 = {
        gameMode: 'sanguosha', // FFA mode
        myIndex: 0,
        attackerIdx: 0,
        defenderIdx: undefined, // UNDEFINED DEFENDER INDEX!
        schedule: ['math'],
        currentClassIndex: 0,
        me: { id: 'p1', hp: 20, maxHp: 30, card: { name: 'P1' } },
        opponent: { id: 'p2', hp: 15, maxHp: 30, card: { name: 'P2' } },
        players: [
          { id: 'p1', nickname: 'P1', hp: 20, maxHp: 30 },
          { id: 'p2', nickname: 'P2', hp: 15, maxHp: 30 }
        ]
      };

      sandbox.innerHTML = `
        <div class="arena">
          <div id="phase-text"></div>
          <div id="card-me" class="battle-card-wrap"><div class="hp-bar-h" id="hp-me"></div><span id="hp-me-t">20</span></div>
          <div id="dice-area"></div>
        </div>
      `;

      renderBattle(sandbox, { state: mockState1v1 });

      const dataUndefinedDef = {
        state: mockState1v1,
        damage: 8,
        finalDef: 4,
        penalty: 0,
        gameOver: false,
        attackerIdx: 0
      };

      let threwUndefError = false;
      let undefErrorMsg = '';
      try {
        onTurnResolved(dataUndefinedDef);
      } catch (err) {
        threwUndefError = true;
        undefErrorMsg = err.message || err.toString();
      }

      await new Promise(r => setTimeout(r, 1600));

      logResult('battle.onTurnResolved defenderIdx=undefined Handling', !threwUndefError,
        threwUndefError ? `THREW EXCEPTION: ${undefErrorMsg}` : 'Handled defenderIdx=undefined safely');
    } catch (e) {
      logResult('battle.onTurnResolved defenderIdx=undefined Handling', false, `Exception: ${e.stack || e.message}`);
    }

    // ----------------------------------------------------
    // TEST 6: battle.js - Rapid Event Flood & Race Conditions
    // ----------------------------------------------------
    try {
      const mockStateBase = {
        gameMode: '1v1',
        myIndex: 0,
        attackerIdx: 0,
        defenderIdx: 1,
        schedule: ['math'],
        currentClassIndex: 0,
        me: { id: 'p1', hp: 30, maxHp: 30, card: { name: 'Player 1' } },
        opponent: { id: 'p2', hp: 30, maxHp: 30, card: { name: 'Player 2' } },
        players: [
          { id: 'p1', nickname: 'P1', hp: 30, maxHp: 30 },
          { id: 'p2', nickname: 'P2', hp: 30, maxHp: 30 }
        ]
      };

      renderBattle(sandbox, { state: mockStateBase });

      let raceExceptionCount = 0;
      for (let i = 0; i < 15; i++) {
        const turnData = {
          state: {
            ...mockStateBase,
            me: { ...mockStateBase.me, hp: 30 - i },
            opponent: { ...mockStateBase.opponent, hp: 30 - i * 2 }
          },
          damage: 5 + i,
          finalDef: 3,
          penalty: 0,
          gameOver: i === 14,
          attackerIdx: i % 2
        };

        try {
          onTurnResolved(turnData);
        } catch (err) {
          raceExceptionCount++;
        }
        await new Promise(r => setTimeout(r, 10));
      }

      await new Promise(r => setTimeout(r, 2600));
      const gameOverScreens = document.querySelectorAll('.game-over-screen');

      logResult('battle.onTurnResolved Rapid Event Flood & Race Conditions', raceExceptionCount === 0,
        `Exceptions during rapid flood: ${raceExceptionCount}. GameOver screens rendered: ${gameOverScreens.length}`);
    } catch (e) {
      logResult('battle.onTurnResolved Rapid Event Flood & Race Conditions', false, `Exception: ${e.stack || e.message}`);
    }

    // ----------------------------------------------------
    // TEST 7: battle.js - AoE Damage Loops & Null aoeResults
    // ----------------------------------------------------
    try {
      const mockStateFFA = {
        gameMode: 'sanguosha',
        myIndex: 0,
        attackerIdx: 0,
        defenderIdx: null,
        schedule: ['math'],
        currentClassIndex: 0,
        me: { id: 'p1', hp: 30, maxHp: 30, card: { name: 'P1' } },
        opponent: { id: 'p2', hp: 30, maxHp: 30, card: { name: 'P2' } },
        players: [
          { id: 'p1', nickname: 'P1', hp: 30, maxHp: 30 },
          { id: 'p2', nickname: 'P2', hp: 30, maxHp: 30 },
          { id: 'p3', nickname: 'P3', hp: 30, maxHp: 30 },
          { id: 'p4', nickname: 'P4', hp: 30, maxHp: 30 }
        ]
      };

      renderBattle(sandbox, { state: mockStateFFA });

      // Test 7a: Null aoeResults when isAoE is true
      const nullAoEData = {
        isAoE: true,
        aoeResults: null, // NULL AOE RESULTS
        state: mockStateFFA,
        damage: 10,
        finalDef: 0,
        attackerIdx: 0
      };

      let threwNullAoE = false;
      let nullAoEError = '';
      try {
        onTurnResolved(nullAoEData);
      } catch (err) {
        threwNullAoE = true;
        nullAoEError = err.message || err.toString();
      }

      await new Promise(r => setTimeout(r, 1600));

      // Test 7b: Valid multi-target AoE loop
      const validAoEData = {
        isAoE: true,
        aoeResults: [
          { playerId: 'p1', damage: 5, nineLivesTriggered: false },
          { playerId: 'p2', damage: 12, nineLivesTriggered: false },
          { playerId: 'p3', damage: 20, nineLivesTriggered: true },
          { playerId: 'p4', damage: 0, nineLivesTriggered: false }
        ],
        state: mockStateFFA,
        damage: 0,
        finalDef: 0,
        attackerIdx: 0
      };

      let threwValidAoE = false;
      try {
        onTurnResolved(validAoEData);
      } catch (err) {
        threwValidAoE = true;
      }

      await new Promise(r => setTimeout(r, 2600));

      logResult('battle.onTurnResolved AoE Damage Loops & Null aoeResults', !threwNullAoE && !threwValidAoE,
        `Null aoeResults threw exception: ${threwNullAoE} (${nullAoEError}), Valid AoE loop threw: ${threwValidAoE}`);
    } catch (e) {
      logResult('battle.onTurnResolved AoE Damage Loops & Null aoeResults', false, `Exception: ${e.stack || e.message}`);
    }

    // ----------------------------------------------------
    // TEST 8: battle.js - Invalid Damage Values (NaN, null, undef, neg, Inf, string)
    // ----------------------------------------------------
    try {
      const mockStateBase = {
        gameMode: '1v1',
        myIndex: 0,
        attackerIdx: 0,
        defenderIdx: 1,
        schedule: ['math'],
        currentClassIndex: 0,
        me: { id: 'p1', hp: 30, maxHp: 30, card: { name: 'P1' } },
        opponent: { id: 'p2', hp: 30, maxHp: 30, card: { name: 'P2' } },
        players: [
          { id: 'p1', nickname: 'P1', hp: 30, maxHp: 30 },
          { id: 'p2', nickname: 'P2', hp: 30, maxHp: 30 }
        ]
      };

      renderBattle(sandbox, { state: mockStateBase });

      const invalidDamageCases = [NaN, null, undefined, -99, Infinity, 'invalid_str'];
      let invalidDamageExceptions = 0;

      for (const dmgVal of invalidDamageCases) {
        try {
          onTurnResolved({
            state: mockStateBase,
            damage: dmgVal,
            finalDef: dmgVal,
            penalty: dmgVal,
            gameOver: false,
            attackerIdx: 0
          });
        } catch (err) {
          invalidDamageExceptions++;
        }
        await new Promise(r => setTimeout(r, 100));
      }

      await new Promise(r => setTimeout(r, 1800));

      logResult('battle.onTurnResolved Invalid Damage Values', invalidDamageExceptions === 0,
        `Exceptions thrown during invalid damage tests: ${invalidDamageExceptions}/${invalidDamageCases.length}`);
    } catch (e) {
      logResult('battle.onTurnResolved Invalid Damage Values', false, `Exception: ${e.stack || e.message}`);
    }

    // Clean up sandbox
    sandbox.remove();

    return results;
  });

  console.log('====================================================');
  console.log('📊 COMPREHENSIVE EMPIRICAL STRESS TEST RESULTS');
  console.log('====================================================');

  let overallPass = true;
  for (const res of testResults) {
    const symbol = res.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${symbol} | ${res.name}`);
    console.log(`   Details: ${res.details}`);
    if (!res.pass) overallPass = false;
  }

  console.log('\n----------------------------------------------------');
  console.log(`Page JS Errors Captured: ${pageErrors.length}`);
  if (pageErrors.length > 0) {
    console.log('Page Errors:', pageErrors);
    overallPass = false;
  }

  console.log(`Console Errors Captured: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log('Console Errors:', consoleErrors);
    overallPass = false;
  }
  console.log('----------------------------------------------------\n');

  await page.close();

  return { overallPass, testResults, pageErrors, consoleErrors };
}

async function main() {
  let serverProcess = null;
  const isServerRunning = await isPortOpen(PORT);

  if (!isServerRunning) {
    console.log(`🌐 Server not detected on port ${PORT}. Spawning node server/index.js...`);
    serverProcess = spawn('node', ['server/index.js'], {
      cwd: process.cwd(),
      stdio: 'pipe',
    });

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('http://localhost:3000')) {
        console.log(`📡 [Server Output]: ${msg.trim()}`);
      }
    });

    await waitForServer(BASE_URL, 15000);
    console.log('✅ Server is ready.');
  }

  const cleanup = () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      serverProcess = null;
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(1); });
  process.on('SIGTERM', () => { cleanup(); process.exit(1); });

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const { overallPass, testResults, pageErrors, consoleErrors } = await runEmpiricalStressSuite(browser, BASE_URL);

    await browser.close();
    cleanup();

    if (overallPass) {
      console.log('🎉 ALL STRESS TESTS PASSED!');
      process.exit(0);
    } else {
      console.error('❌ STRESS TESTS FAILED!');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Fatal error running stress test suite:', err);
    if (browser) await browser.close();
    cleanup();
    process.exit(1);
  }
}

main();
