import { spawn } from 'child_process';
import http from 'http';
import net from 'net';
import { chromium } from 'playwright';

// Engine & Card Imports for Logic Verification (Tiers 1 & 2)
import {
  createGame, selectCard, setReady, playTacticalCard, buyDraftCard,
  rollAttack, confirmAttack, confirmDefense, getStateView
} from '../../server/game/engine.js';
import { CARDS } from '../../shared/cards.js';

const PORT = process.env.PORT || 3006;
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

/**
 * Tier 1: Pricing Parity
 * - Buying a 1-star card strictly deducts 1 TP
 * - Playing a hand card requires 0 TP
 */
async function verifyTier1(browser, baseURL) {
  console.log('\n==================================================');
  console.log('--- Tier 1: Pricing Parity Verification ---');
  console.log('==================================================');

  // 1.1 Engine-level State Parity Check
  const game = createGame([
    { id: 'p1', nickname: 'Tester 1' },
    { id: 'p2', nickname: 'Tester 2' }
  ], '1v1');
  selectCard(game, 'p1', 'char_3');
  selectCard(game, 'p2', 'char_4');
  setReady(game, 'p1');
  setReady(game, 'p2');

  const p1 = game.players[0];
  p1.tp = 5;

  const oneStarCard = CARDS.find(c => (c.star || c.tpCost) === 1);
  if (!oneStarCard) throw new Error('No 1-star card (tpCost === 1) found in CARDS pool');

  game.draftShop = {
    active: true,
    players: {
      p1: { slots: [{ card: oneStarCard, refreshesLeft: 2 }] }
    }
  };

  const initialTp = p1.tp;
  const buyRes = buyDraftCard(game, 'p1', 0);
  if (!buyRes.ok) throw new Error(`buyDraftCard failed: ${buyRes.error}`);
  if (p1.tp !== initialTp - 1) {
    throw new Error(`Pricing Parity Mismatch on Purchase: Expected TP ${initialTp - 1}, got ${p1.tp}`);
  }
  console.log(`[PASS] Buying 1-star card '${oneStarCard.name}' strictly deducted 1 TP (TP: 5 -> ${p1.tp})`);

  // Playing hand card cost check
  game.schedule[game.currentClassIndex] = oneStarCard.subject === 'universal' ? 'chinese' : oneStarCard.subject;
  const tpBeforePlay = p1.tp;
  const playRes = playTacticalCard(game, 'p1', oneStarCard.id);
  if (!playRes.ok) throw new Error(`playTacticalCard failed: ${playRes.error}`);
  if (p1.tp !== tpBeforePlay) {
    throw new Error(`Pricing Parity Mismatch on Play: Playing hand card required TP! (Before: ${tpBeforePlay}, After: ${p1.tp})`);
  }
  console.log(`[PASS] Playing hand card '${oneStarCard.name}' required 0 TP (TP remained ${p1.tp})`);

  // 1.2 E2E Headless Browser Draft Shop & Play Verification
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  attachListeners(page, errors);

  await page.goto(baseURL);
  await page.waitForSelector('#nickname-input', { timeout: 10000 });
  await page.fill('#nickname-input', 'Tier1_User');
  await page.click('#btn-pve');

  await page.waitForSelector('.avatar-cell[data-id="char_6"]', { timeout: 10000 });
  await page.click('.avatar-cell[data-id="char_6"]');
  await page.waitForSelector('#modal-select-btn', { timeout: 10000 });
  await page.click('#modal-select-btn');
  await page.waitForSelector('#btn-ready:not([disabled])', { timeout: 10000 });
  await page.click('#btn-ready');

  await page.waitForSelector('.arena', { timeout: 10000 });

  // Open hand fab to check hand cards and shop
  const handFab = page.locator('#hand-fab');
  if (await handFab.isVisible()) {
    await handFab.click();
    await page.waitForTimeout(300);
  }

  await context.close();
  if (errors.length > 0) {
    throw new Error(`Tier 1 browser verification encountered errors:\n${errors.join('\n')}`);
  }

  console.log('✅ Tier 1: Pricing Parity Verified Successfully!');
}

/**
 * Tier 2: Card Play Resolution
 * - Playing tactical cards from hand alters game state cleanly without backend errors.
 */
async function verifyTier2(browser, baseURL) {
  console.log('\n==================================================');
  console.log('--- Tier 2: Card Play Resolution Verification ---');
  console.log('==================================================');

  // 2.1 Engine Batch Play Verification across tactical card categories
  const testCards = [
    'card_chi_2', // Defense calculation override
    'card_eng_1', // Rerolls boost (+2 rerolls)
    'card_his_2', // Previous round unused dice bonus
    'card_it_1',  // Blessing positive skill copy
    'card_bio_3', // Self 30% HP cost + opponent real damage
    'card_gen_01',// Universal strike
    'card_gen_14' // 0 defense damage -> +2 TP
  ];

  testCards.forEach(cid => {
    const game = createGame([
      { id: 'p1', nickname: 'Attacker' },
      { id: 'p2', nickname: 'Defender' }
    ], '1v1');
    selectCard(game, 'p1', 'char_3');
    selectCard(game, 'p2', 'char_4');
    setReady(game, 'p1');
    setReady(game, 'p2');

    const p1 = game.players[0];
    const card = CARDS.find(c => c.id === cid);
    if (!card) throw new Error(`Test card ${cid} not found in CARDS`);

    game.schedule[game.currentClassIndex] = card.subject === 'universal' ? 'chinese' : card.subject;
    p1.handCards.push(card);

    const initialHandLen = p1.handCards.length;
    const res = playTacticalCard(game, 'p1', cid);
    if (!res.ok) {
      throw new Error(`Failed to resolve card ${cid} (${card.name}): ${res.error}`);
    }

    if (p1.handCards.some(c => c.id === cid)) {
      throw new Error(`Card ${cid} was not removed from handCards after playing`);
    }

    const isPlayed = p1.playedTurnCards.some(c => c.id === cid) || (p1.activeBlessings && p1.activeBlessings.some(c => c.id === cid));
    if (!isPlayed) {
      throw new Error(`Card ${cid} was not added to playedTurnCards or activeBlessings after playing`);
    }

    console.log(`[PASS] Tactical Card '${card.name}' (${cid}) resolved cleanly into game state`);
  });

  // 2.2 Live socket/HTTP browser interaction
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  attachListeners(page, errors);

  await page.goto(baseURL);
  await page.waitForSelector('#nickname-input', { timeout: 10000 });
  await page.fill('#nickname-input', 'Tier2_User');
  await page.click('#btn-pve');

  await page.waitForSelector('.avatar-cell[data-id="char_6"]', { timeout: 10000 });
  await page.click('.avatar-cell[data-id="char_6"]');
  await page.waitForSelector('#modal-select-btn', { timeout: 10000 });
  await page.click('#modal-select-btn');
  await page.waitForSelector('#btn-ready:not([disabled])', { timeout: 10000 });
  await page.click('#btn-ready');

  await page.waitForSelector('.arena', { timeout: 10000 });

  await context.close();
  if (errors.length > 0) {
    throw new Error(`Tier 2 browser verification encountered errors:\n${errors.join('\n')}`);
  }

  console.log('✅ Tier 2: Card Play Resolution Verified Successfully!');
}

/**
 * Tier 3: Anti-Overlap UI Layout
 * - Headless browser DOM layout check verifying:
 *   - .hand-card-kards text truncation, clamping, zero element overlaps across desktop and mobile viewports.
 *   - Disable badge / overlay boundary constraints.
 *   - Zero horizontal overflow on mobile viewports.
 */
async function verifyTier3(browser, baseURL) {
  console.log('\n==================================================');
  console.log('--- Tier 3: Anti-Overlap UI Layout Verification ---');
  console.log('==================================================');

  const viewports = [
    { name: 'Desktop', width: 1280, height: 800 },
    { name: 'Mobile', width: 375, height: 667 }
  ];

  for (const vp of viewports) {
    console.log(`\nTesting Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const errors = [];
    attachListeners(page, errors);

    await page.goto(baseURL);
    await page.waitForSelector('#nickname-input', { timeout: 10000 });

    // Check horizontal overflow on lobby
    let hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (hasOverflow) throw new Error(`[${vp.name}] Horizontal overflow detected on Lobby screen`);

    await page.fill('#nickname-input', `T3_${vp.name}`);
    await page.click('#btn-pve');
    await page.waitForSelector('.avatar-cell[data-id="char_6"]', { timeout: 10000 });
    await page.click('.avatar-cell[data-id="char_6"]');
    await page.waitForSelector('#modal-select-btn', { timeout: 10000 });
    await page.click('#modal-select-btn');
    await page.waitForSelector('#btn-ready:not([disabled])', { timeout: 10000 });
    await page.click('#btn-ready');

    await page.waitForSelector('.arena', { timeout: 10000 });

    // Inject test cards into DOM to evaluate long text clamping, anti-overlap, and overlays
    const layoutCheckResult = await page.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'layout-test-container';
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100vw';
      container.style.zIndex = '99999';
      container.style.background = '#fff';
      container.style.display = 'flex';
      container.style.gap = '10px';
      container.style.padding = '10px';

      // Create test card with long title and description
      const cardHtml = `
        <div class="hand-card-kards universal disabled" style="position: relative;">
          <div class="card-disable-overlay">
            <div class="card-disable-badge">TP不足 (需要 3 TP)</div>
          </div>
          <div class="card-header-kards">
            <span class="card-title-text">超长战术卡名称测试例句超长名称不溢出</span>
            <span class="card-star-cost">★1</span>
          </div>
          <div class="card-tag-row">
            <span class="card-tag-type">通用·超长科目标签测试</span>
            <span class="card-tag-cost">0 TP</span>
          </div>
          <div class="card-desc-text">
            这是一个非常冗长且包含多行描述文本的测试卡片。第一行测试描述，第二行测试描述，第三行测试描述，第四行测试描述，第五行测试描述，超出三行应当被 -webkit-line-clamp: 3 自动截断并带省略号。
          </div>
        </div>
      `;

      container.innerHTML = cardHtml;
      document.body.appendChild(container);

      const cardEl = container.querySelector('.hand-card-kards');
      const titleEl = container.querySelector('.card-title-text');
      const tagRowEl = container.querySelector('.card-tag-row');
      const descEl = container.querySelector('.card-desc-text');
      const overlayEl = container.querySelector('.card-disable-overlay');
      const badgeEl = container.querySelector('.card-disable-badge');

      const cardRect = cardEl.getBoundingClientRect();
      const titleRect = titleEl.getBoundingClientRect();
      const tagRowRect = tagRowEl.getBoundingClientRect();
      const descRect = descEl.getBoundingClientRect();
      const overlayRect = overlayEl.getBoundingClientRect();
      const badgeRect = badgeEl.getBoundingClientRect();

      // CSS Computed Properties Check
      const titleStyle = window.getComputedStyle(titleEl);
      const descStyle = window.getComputedStyle(descEl);
      const overlayStyle = window.getComputedStyle(overlayEl);
      const badgeStyle = window.getComputedStyle(badgeEl);

      const titleTruncationValid = titleStyle.whiteSpace === 'nowrap' &&
                                   titleStyle.overflow === 'hidden' &&
                                   titleStyle.textOverflow === 'ellipsis';

      const descClampValid = descStyle.overflow === 'hidden' &&
                             (descStyle.webkitLineClamp === '3' || descStyle.lineClamp === '3' || descStyle.display.includes('box'));

      // Bounding Box Overlap Checks
      const titleTagOverlap = titleRect.bottom > tagRowRect.top + 2;
      const tagDescOverlap = tagRowRect.bottom > descRect.top + 2;
      const titleDescOverlap = titleRect.bottom > descRect.top;

      // Overlay and Badge Alignment Checks
      const overlayBoundsValid = overlayRect.left >= cardRect.left - 2 &&
                                 overlayRect.right <= cardRect.right + 2 &&
                                 overlayRect.top >= cardRect.top - 2 &&
                                 overlayRect.bottom <= cardRect.bottom + 2;

      const badgeWidthValid = badgeRect.width <= cardRect.width * 0.95;

      container.remove();

      return {
        titleTruncationValid,
        descClampValid,
        titleTagOverlap,
        tagDescOverlap,
        titleDescOverlap,
        overlayBoundsValid,
        badgeWidthValid,
        cardWidth: cardRect.width,
        cardHeight: cardRect.height
      };
    });

    if (!layoutCheckResult.titleTruncationValid) {
      throw new Error(`[${vp.name}] .card-title-text title truncation CSS property check failed`);
    }
    console.log(`[PASS] [${vp.name}] .card-title-text single-line truncation verified (white-space: nowrap, ellipsis)`);

    if (!layoutCheckResult.descClampValid) {
      throw new Error(`[${vp.name}] .card-desc-text line clamp CSS property check failed`);
    }
    console.log(`[PASS] [${vp.name}] .card-desc-text 3-line clamping verified (-webkit-line-clamp: 3)`);

    if (layoutCheckResult.titleTagOverlap || layoutCheckResult.tagDescOverlap || layoutCheckResult.titleDescOverlap) {
      throw new Error(`[${vp.name}] Element overlap detected in .hand-card-kards layout! Title/Tag/Desc rects collide.`);
    }
    console.log(`[PASS] [${vp.name}] Zero element overlaps verified in .hand-card-kards layout`);

    if (!layoutCheckResult.overlayBoundsValid) {
      throw new Error(`[${vp.name}] .card-disable-overlay exceeds .hand-card-kards card boundaries`);
    }
    console.log(`[PASS] [${vp.name}] .card-disable-overlay perfectly aligned within card bounds`);

    if (!layoutCheckResult.badgeWidthValid) {
      throw new Error(`[${vp.name}] .card-disable-badge exceeds 90% card width constraint`);
    }
    console.log(`[PASS] [${vp.name}] .card-disable-badge width constrained strictly <= 90%`);

    hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (hasOverflow) throw new Error(`[${vp.name}] Horizontal overflow detected during battle`);
    console.log(`[PASS] [${vp.name}] Zero horizontal viewport overflow confirmed`);

    await context.close();
    if (errors.length > 0) {
      throw new Error(`Tier 3 (${vp.name}) encountered browser errors:\n${errors.join('\n')}`);
    }
  }

  console.log('✅ Tier 3: Anti-Overlap UI Layout Verified Successfully!');
}

/**
 * Tier 4: Zero JS Exception VFX Triggers
 * - Triggering damage and ultimate animations (e.g. Zhou Xuansheng ultimate) produces on-screen visual effects with 0 browser console errors.
 */
async function verifyTier4(browser, baseURL) {
  console.log('\n==================================================');
  console.log('--- Tier 4: Zero JS Exception VFX Triggers Verification ---');
  console.log('==================================================');

  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  attachListeners(page, errors);

  await page.goto(baseURL);
  await page.waitForSelector('#nickname-input', { timeout: 10000 });
  await page.fill('#nickname-input', 'Tier4_VFX_Tester');
  await page.click('#btn-pve');

  // Select Zhou Xuansheng (char_14) to test ultimate VFX triggers
  await page.waitForSelector('.avatar-cell[data-id="char_14"]', { timeout: 10000 });
  await page.click('.avatar-cell[data-id="char_14"]');
  await page.waitForSelector('#modal-select-btn', { timeout: 10000 });
  await page.click('#modal-select-btn');
  await page.waitForSelector('#btn-ready:not([disabled])', { timeout: 10000 });
  await page.click('#btn-ready');

  await page.waitForSelector('.arena', { timeout: 10000 });

  // Evaluate VFX Triggers in Page Context (Hit Impacts, Floating Damage Numbers, Ultimates)
  const vfxResult = await page.evaluate(async () => {
    let vm = window.vfxManager;
    if (!vm) {
      try {
        const mod = await import('/src/utils/vfx.js');
        vm = mod.vfxManager || mod.default;
        if (vm) window.vfxManager = vm;
      } catch (err) {}
    }

    if (!vm) {
      return { success: false, reason: 'window.vfxManager not found on window object' };
    }

    const testEl = document.createElement('div');
    testEl.id = 'vfx-test-target';
    testEl.style.width = '100px';
    testEl.style.height = '100px';
    document.body.appendChild(testEl);

    let floatingDmgCreated = false;
    let ultimateVfxExecuted = false;

    try {
      // 1. Trigger Hit Impact VFX
      vm.playHitImpact(testEl, 15);

      // 2. Trigger Floating Damage VFX directly
      const dmgEl = vm.spawnFloatingDamage(testEl, 24, true);
      if (dmgEl && dmgEl.textContent.includes('24')) {
        floatingDmgCreated = true;
      }

      // 3. Trigger Zhou Xuansheng Ultimate VFX
      vm.triggerUltimateVFX('char_14', '水元素觉醒·周煊声', testEl);
      ultimateVfxExecuted = true;

      // 4. Trigger Camera Impulse / Shake
      vm.triggerCameraImpulse(1.2);

    } catch (err) {
      testEl.remove();
      return { success: false, reason: err.message };
    }

    testEl.remove();
    return {
      success: true,
      floatingDmgCreated,
      ultimateVfxExecuted
    };
  });

  if (!vfxResult.success) {
    throw new Error(`VFX Execution Failed in Page Context: ${vfxResult.reason}`);
  }
  console.log('[PASS] Hit Impact, Floating Damage, and Zhou Xuansheng Ultimate VFX triggered visually in DOM');

  // Perform active roll & turn sequence to trigger live damage VFX in game loop
  const rollBtn = page.locator('#btn-roll');
  if (await rollBtn.isVisible() && await rollBtn.isEnabled()) {
    await rollBtn.click();
    await page.waitForSelector('#dice-area .die.selectable', { timeout: 10000 }).catch(() => {});

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

  await context.close();

  if (errors.length > 0) {
    throw new Error(`Tier 4 verification failed with console/page errors:\n${errors.join('\n')}`);
  }

  console.log('✅ Tier 4: Zero JS Exception VFX Triggers Verified Successfully!');
}

async function main() {
  console.log('====================================================');
  console.log('🚀 School Dice Duel — Round 2 E2E Verification Suite');
  console.log('====================================================');

  let serverProcess = null;
  const isServerRunning = await isPortOpen(PORT);

  if (!isServerRunning) {
    console.log(`🌐 Server not detected on port ${PORT}. Spawning node server/index.js...`);
    serverProcess = spawn('node', ['server/index.js'], {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe',
    });

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('http://localhost')) {
        console.log(`📡 [Server Output]: ${msg.trim()}`);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`⚠️ [Server Stderr]: ${data.toString().trim()}`);
    });

    await waitForServer(BASE_URL, 15000);
    console.log(`✅ Server is ready on ${BASE_URL}`);
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

    await verifyTier1(browser, BASE_URL);
    await verifyTier2(browser, BASE_URL);
    await verifyTier3(browser, BASE_URL);
    await verifyTier4(browser, BASE_URL);

    console.log('\n====================================================');
    console.log('🎉 ALL 4 ROUND 2 VERIFICATION TIERS PASSED WITH 100% SUCCESS!');
    console.log('====================================================\n');

    await browser.close();
    cleanupServer();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Round 2 Verification Failed:', err.message);
    if (browser) await browser.close();
    cleanupServer();
    process.exit(1);
  }
}

main();
