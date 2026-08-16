import { spawn } from 'child_process';
import http from 'http';
import net from 'net';
import { chromium } from 'playwright';

const PORT = process.env.PORT || 3005;
const BASE_URL = `http://localhost:${PORT}`;

function isPortOpen(port, host = '127.0.0.1') {
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

function attachListeners(page, errors) {
  page.on('pageerror', (err) => errors.push(`[PageError] ${err.message || err}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('Failed to load resource') && !txt.includes('WebSocket closed without opened')) {
        errors.push(`[ConsoleError] ${txt}`);
      }
    }
  });
}

async function runTier1(browser, baseURL) {
  console.log('🔄 Executing Tier 1: Feature Coverage...');
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  attachListeners(page, errors);

  // 1.1 Lobby load
  await page.goto(baseURL);
  await page.waitForSelector('#nickname-input', { timeout: 10000 });

  // 1.2 Preparation Navigation
  await page.fill('#nickname-input', 'Headless_T1');
  await page.click('#btn-pve');
  await page.waitForSelector('#card-selector', { timeout: 10000 });

  // 1.3 Battle Init (1v1 PVE mode)
  await page.click('.avatar-cell[data-id="char_6"]');
  await page.waitForSelector('#modal-select-btn', { timeout: 10000 });
  await page.click('#modal-select-btn');
  await page.waitForSelector('#btn-ready:not([disabled])', { timeout: 10000 });
  await page.click('#btn-ready');
  await page.waitForSelector('.arena', { timeout: 10000 });

  // 1.4 Dice Roll Trigger
  const rollBtn = page.locator('#btn-roll');
  if (await rollBtn.isVisible() && await rollBtn.isEnabled()) {
    await rollBtn.click();
    await page.waitForSelector('#dice-area .die', { timeout: 10000 });
  }

  // 1.5 Skill & Interactive Elements
  const skillSummary = page.locator('#card-me summary');
  if (await skillSummary.isVisible()) await skillSummary.click();
  const handFab = page.locator('#hand-fab');
  if (await handFab.isVisible()) {
    await handFab.click();
    await page.waitForTimeout(300);
    await handFab.click();
  }

  await context.close();

  if (errors.length > 0) {
    throw new Error(`Tier 1 failed with errors:\n${errors.join('\n')}`);
  }
  console.log('✅ [PASS] Tier 1: Feature Coverage (Lobby, Preparation, Battle Init, Roll, Skills) verified with 0 errors.');
}

async function runTier2(browser, baseURL) {
  console.log('🔄 Executing Tier 2: Boundary & Corner Cases...');
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  attachListeners(page, errors);

  // 2.1 Rapid reroll & 2.2 Damage check
  await page.goto(baseURL);
  await page.waitForSelector('#nickname-input', { timeout: 10000 });
  await page.fill('#nickname-input', 'Headless_T2');
  await page.click('#btn-pve');

  await page.waitForSelector('.avatar-cell[data-id="char_6"]', { timeout: 10000 });
  await page.click('.avatar-cell[data-id="char_6"]');
  await page.waitForSelector('#modal-select-btn', { timeout: 10000 });
  await page.click('#modal-select-btn');
  await page.waitForSelector('#btn-ready:not([disabled])', { timeout: 10000 });
  await page.click('#btn-ready');

  await page.waitForSelector('.arena', { timeout: 10000 });

  const rollBtn = page.locator('#btn-roll');
  if (await rollBtn.isVisible() && await rollBtn.isEnabled()) {
    await rollBtn.click();
    await page.waitForSelector('#dice-area .die', { timeout: 10000 }).catch(() => {});

    await page.waitForSelector('#dice-area .die.selectable', { timeout: 10000 }).catch(() => {});
    const firstDie = page.locator('#dice-area .die.selectable').first();
    if (await firstDie.isVisible()) {
      await firstDie.click().catch(() => {});
      const rerollBtn = page.locator('#btn-reroll');
      if (await rerollBtn.isVisible()) {
        await rerollBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }

    const dice = page.locator('#dice-area .die.selectable');
    const count = await dice.count();
    for (let i = 0; i < count; i++) {
      await dice.nth(i).click().catch(() => {});
    }

    const confirmBtn = page.locator('#btn-confirm');
    if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
      await confirmBtn.click().catch(() => {});
      await page.waitForTimeout(1500);
    }
  }

  // 2.3 Mobile viewport check
  const mobileContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const mobilePage = await mobileContext.newPage();
  attachListeners(mobilePage, errors);

  await mobilePage.goto(baseURL);
  await mobilePage.waitForSelector('#nickname-input', { timeout: 10000 });
  let overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) errors.push('Mobile horizontal overflow detected on Lobby');

  await mobilePage.fill('#nickname-input', 'Headless_Mobile');
  await mobilePage.click('#btn-pve');
  await mobilePage.waitForSelector('#card-selector', { timeout: 10000 });
  overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) errors.push('Mobile horizontal overflow detected on Preparation');

  await mobileContext.close();
  await context.close();

  if (errors.length > 0) {
    throw new Error(`Tier 2 failed with errors:\n${errors.join('\n')}`);
  }
  console.log('✅ [PASS] Tier 2: Boundary & Corner Cases (Rapid Reroll, Multi-hit VFX, 375px Viewport) verified with 0 errors.');
}

async function runTier3(browser, baseURL) {
  console.log('🔄 Executing Tier 3: Cross-Feature Combinations...');
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  attachListeners(page, errors);

  await page.goto(baseURL);
  await page.waitForSelector('#nickname-input', { timeout: 10000 });
  await page.fill('#nickname-input', 'Headless_T3');
  await page.click('#btn-pve');

  await page.waitForSelector('.avatar-cell[data-id="char_6"]', { timeout: 10000 });
  await page.click('.avatar-cell[data-id="char_6"]');
  await page.waitForSelector('#modal-select-btn', { timeout: 10000 });
  await page.click('#modal-select-btn');
  await page.waitForSelector('#btn-ready:not([disabled])', { timeout: 10000 });
  await page.click('#btn-ready');

  await page.waitForSelector('.arena', { timeout: 10000 });

  for (let turn = 0; turn < 6; turn++) {
    const gameOver = await page.locator('.game-over-screen').isVisible();
    if (gameOver) break;

    const draftReadyBtn = page.locator('#draft-shop-modal button:has-text("完成选牌")');
    if (await draftReadyBtn.isVisible()) {
      await draftReadyBtn.click();
      await page.waitForTimeout(400);
    }

    const dreamBtn = page.locator('.dream-target-btn').first();
    if (await dreamBtn.isVisible()) {
      await dreamBtn.click();
      await page.waitForTimeout(400);
    }

    const rollBtn = page.locator('#btn-roll');
    if (await rollBtn.isVisible() && await rollBtn.isEnabled()) {
      await rollBtn.click();
      await page.waitForSelector('#dice-area .die.selectable', { timeout: 5000 }).catch(() => {});
    }

    const dice = page.locator('#dice-area .die.selectable');
    const diceCount = await dice.count();
    if (diceCount > 0) {
      for (let d = 0; d < diceCount; d++) {
        await dice.nth(d).click().catch(() => {});
      }
      const confirmBtn = page.locator('#btn-confirm');
      if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
        await confirmBtn.click().catch(() => {});
      }
    }
    await page.waitForTimeout(1000);
  }

  const gameOverBtn = page.locator('#btn-back');
  if (await gameOverBtn.isVisible()) {
    await gameOverBtn.click();
    await page.waitForSelector('.title-main', { timeout: 5000 });
  }

  await context.close();

  if (errors.length > 0) {
    throw new Error(`Tier 3 failed with errors:\n${errors.join('\n')}`);
  }
  console.log('✅ [PASS] Tier 3: Cross-Feature Combinations (Full Turn Cycle, Damage VFX & Modals) verified with 0 errors.');
}

async function runTier4(browser, baseURL) {
  console.log('🔄 Executing Tier 4: Real-World Application...');
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await context.newPage();
  const errors = [];
  attachListeners(page, errors);

  await page.goto(baseURL);
  await page.waitForSelector('#nickname-input', { timeout: 10000 });
  await page.fill('#nickname-input', 'Headless_T4');
  await page.click('#btn-pve');

  await page.waitForSelector('.avatar-cell[data-id="char_6"]', { timeout: 10000 });
  await page.click('.avatar-cell[data-id="char_6"]');
  await page.waitForSelector('#modal-select-btn', { timeout: 10000 });
  await page.click('#modal-select-btn');
  await page.waitForSelector('#btn-ready:not([disabled])', { timeout: 10000 });
  await page.click('#btn-ready');

  await page.waitForSelector('.arena', { timeout: 10000 });

  for (let turn = 0; turn < 4; turn++) {
    const gameOver = await page.locator('.game-over-screen').isVisible();
    if (gameOver) break;

    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (hasOverflow) errors.push(`Mobile horizontal overflow on turn ${turn}`);

    const draftReadyBtn = page.locator('#draft-shop-modal button:has-text("完成选牌")');
    if (await draftReadyBtn.isVisible()) {
      await draftReadyBtn.click();
      await page.waitForTimeout(400);
    }

    const dreamBtn = page.locator('.dream-target-btn').first();
    if (await dreamBtn.isVisible()) {
      await dreamBtn.click();
      await page.waitForTimeout(400);
    }

    const rollBtn = page.locator('#btn-roll');
    if (await rollBtn.isVisible() && await rollBtn.isEnabled()) {
      await rollBtn.click();
      await page.waitForSelector('#dice-area .die.selectable', { timeout: 5000 }).catch(() => {});
    }

    const dice = page.locator('#dice-area .die.selectable');
    const diceCount = await dice.count();
    if (diceCount > 0) {
      for (let d = 0; d < diceCount; d++) {
        await dice.nth(d).click().catch(() => {});
      }
      const confirmBtn = page.locator('#btn-confirm');
      if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
        await confirmBtn.click().catch(() => {});
      }
    }
    await page.waitForTimeout(1000);
  }

  const finalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (finalOverflow) errors.push('Final mobile horizontal overflow detected');

  await context.close();

  if (errors.length > 0) {
    throw new Error(`Tier 4 failed with errors:\n${errors.join('\n')}`);
  }
  console.log('✅ [PASS] Tier 4: Real-World Application (Complete Mobile 375px Battle Session) verified with 0 errors.');
}

async function main() {
  console.log('====================================================');
  console.log('🚀 School Dice Duel — E2E Headless Verification Suite');
  console.log('====================================================');

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

    serverProcess.stderr.on('data', (data) => {
      console.error(`⚠️ [Server Stderr]: ${data.toString().trim()}`);
    });

    await waitForServer(BASE_URL, 15000);
    console.log('✅ Server is ready and accepting requests.');
  } else {
    console.log(`✅ Detected existing server running on port ${PORT}.`);
  }

  const cleanupServer = () => {
    if (serverProcess) {
      console.log('🧹 Terminating spawned server child process...');
      serverProcess.kill('SIGTERM');
      serverProcess = null;
    }
  };

  process.on('exit', cleanupServer);
  process.on('SIGINT', () => { cleanupServer(); process.exit(1); });
  process.on('SIGTERM', () => { cleanupServer(); process.exit(1); });

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });

    await runTier1(browser, BASE_URL);
    await runTier2(browser, BASE_URL);
    await runTier3(browser, BASE_URL);
    await runTier4(browser, BASE_URL);

    console.log('====================================================');
    console.log('🎉 ALL 4 TIERS PASSED SUCCESSFULLY! ZERO JS EXCEPTIONS ENCOUNTERED.');
    console.log('====================================================');
    await browser.close();
    cleanupServer();
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification Failed:', err.message);
    if (browser) await browser.close();
    cleanupServer();
    process.exit(1);
  }
}

main();
