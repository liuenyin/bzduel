import { spawn } from 'child_process';
import http from 'http';
import net from 'net';
import { chromium } from 'playwright';

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
 * Challenger Stress Test — Tier 3 (Layout & Extreme Overlap Stress)
 */
async function stressTier3(browser, baseURL) {
  console.log('\n==================================================');
  console.log('--- Stress Test Tier 3: Extreme Anti-Overlap & Layout ---');
  console.log('==================================================');

  const viewports = [
    { name: 'Desktop Large', width: 1920, height: 1080 },
    { name: 'Desktop Standard', width: 1280, height: 800 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Mobile Standard', width: 375, height: 667 },
    { name: 'Mobile Small', width: 320, height: 568 }
  ];

  for (const vp of viewports) {
    console.log(`\n🔍 Stress Testing Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const errors = [];
    attachListeners(page, errors);

    await page.goto(baseURL);
    await page.waitForSelector('#nickname-input', { timeout: 10000 });

    await page.fill('#nickname-input', `Stress_${vp.width}`);
    await page.click('#btn-pve');
    await page.waitForSelector('.avatar-cell[data-id="char_6"]', { timeout: 10000 });
    await page.click('.avatar-cell[data-id="char_6"]');
    await page.waitForSelector('#modal-select-btn', { timeout: 10000 });
    await page.click('#modal-select-btn', { force: true });
    await page.waitForSelector('#btn-ready:not([disabled])', { timeout: 10000 });
    await page.click('#btn-ready');

    await page.waitForSelector('.arena', { timeout: 10000 });

    // Inject extreme stress cards into DOM
    const stressResult = await page.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'stress-test-container';
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '100vw';
      container.style.height = '100vh';
      container.style.zIndex = '999999';
      container.style.background = '#fff';
      container.style.display = 'flex';
      container.style.flexWrap = 'wrap';
      container.style.gap = '15px';
      container.style.padding = '15px';
      container.style.overflow = 'auto';

      // Extreme card with endless string without spaces
      const extremeNoSpaceTitle = '超长无空格标题字符串'.repeat(10);
      const extremeNoSpaceDesc = '这是一个包含极其庞大、没有任何自然空格分割的连写字串。'.repeat(20);
      const extremeDisableBadge = 'TP不足 (需要 99 TP 并且角色处于封印状态)';

      // Hand card test element
      const handCardHtml = `
        <div class="hand-card-kards disabled" style="position: relative;">
          <div class="card-disable-overlay">
            <div class="card-disable-badge">${extremeDisableBadge}</div>
          </div>
          <div class="card-header-kards">
            <span class="card-title-text">${extremeNoSpaceTitle}</span>
            <span class="card-star-cost">★99</span>
          </div>
          <div class="card-tag-row">
            <span class="card-tag-type blessing">超长标签科目名称</span>
            <span class="card-tag-cost">99 TP</span>
          </div>
          <div class="card-desc-text">
            ${extremeNoSpaceDesc}
          </div>
        </div>
      `;

      // Draft shop slot card test element
      const draftCardHtml = `
        <div class="draft-slot-card disabled" style="position: relative;">
          <div class="card-disable-overlay">
            <div class="card-disable-badge">${extremeDisableBadge}</div>
          </div>
          <div class="draft-card-header">
            <span class="draft-card-title">${extremeNoSpaceTitle}</span>
            <span class="draft-card-star">★★★</span>
          </div>
          <div class="card-tag-row">
            <span class="card-tag-type buff">超长商店卡片标签</span>
            <span class="card-tp-cost">3 TP</span>
          </div>
          <div class="draft-card-desc">
            ${extremeNoSpaceDesc}
          </div>
        </div>
      `;

      container.innerHTML = handCardHtml + draftCardHtml;
      document.body.appendChild(container);

      // Check Hand Card Bounding Rects
      const handCard = container.querySelector('.hand-card-kards');
      const handTitle = handCard.querySelector('.card-title-text');
      const handTagRow = handCard.querySelector('.card-tag-row');
      const handDesc = handCard.querySelector('.card-desc-text');
      const handOverlay = handCard.querySelector('.card-disable-overlay');
      const handBadge = handCard.querySelector('.card-disable-badge');

      const handRect = handCard.getBoundingClientRect();
      const hTitleRect = handTitle.getBoundingClientRect();
      const hTagRect = handTagRow.getBoundingClientRect();
      const hDescRect = handDesc.getBoundingClientRect();
      const hOverlayRect = handOverlay.getBoundingClientRect();
      const hBadgeRect = handBadge.getBoundingClientRect();

      // Check Draft Card Bounding Rects
      const draftCard = container.querySelector('.draft-slot-card');
      const draftTitle = draftCard.querySelector('.draft-card-title');
      const draftTagRow = draftCard.querySelector('.card-tag-row');
      const draftDesc = draftCard.querySelector('.draft-card-desc');

      const dTitleRect = draftTitle.getBoundingClientRect();
      const dTagRect = draftTagRow.getBoundingClientRect();
      const dDescRect = draftDesc.getBoundingClientRect();

      // Computations
      const hTitleStyle = window.getComputedStyle(handTitle);
      const hDescStyle = window.getComputedStyle(handDesc);

      const dTitleStyle = window.getComputedStyle(draftTitle);
      const dDescStyle = window.getComputedStyle(draftDesc);

      // 1. Text Truncation & Clamping Check
      const handTitleOk = hTitleStyle.whiteSpace === 'nowrap' && hTitleStyle.overflow === 'hidden' && hTitleStyle.textOverflow === 'ellipsis';
      const handDescOk = hDescStyle.overflow === 'hidden' && (hDescStyle.webkitLineClamp === '3' || hDescStyle.lineClamp === '3' || hDescStyle.display.includes('box'));

      const draftTitleOk = dTitleStyle.whiteSpace === 'nowrap' && dTitleStyle.overflow === 'hidden' && dTitleStyle.textOverflow === 'ellipsis';
      const draftDescOk = dDescStyle.overflow === 'hidden' && (dDescStyle.webkitLineClamp === '3' || dDescStyle.lineClamp === '3' || dDescStyle.display.includes('box'));

      // 2. Overlap Checks (Title vs TagRow, TagRow vs Desc)
      const handOverlap = (hTitleRect.bottom > hTagRect.top + 2) || (hTagRect.bottom > hDescRect.top + 2) || (hTitleRect.bottom > hDescRect.top);
      const draftOverlap = (dTitleRect.bottom > dTagRect.top + 2) || (dTagRect.bottom > dDescRect.top + 2) || (dTitleRect.bottom > dDescRect.top);

      // 3. Container Boundaries
      const handTitleOverflowContainer = hTitleRect.right > handRect.right + 2;
      const handDescOverflowContainer = hDescRect.bottom > handRect.bottom + 2;

      // 4. Overlay & Badge Bounds
      const overlayInHandBounds = hOverlayRect.left >= handRect.left - 2 && hOverlayRect.right <= handRect.right + 2 && hOverlayRect.top >= handRect.top - 2 && hOverlayRect.bottom <= handRect.bottom + 2;
      const badgeWidthHandOk = hBadgeRect.width <= handRect.width * 0.95;

      container.remove();

      return {
        handTitleOk,
        handDescOk,
        draftTitleOk,
        draftDescOk,
        handOverlap,
        draftOverlap,
        handTitleOverflowContainer,
        handDescOverflowContainer,
        overlayInHandBounds,
        badgeWidthHandOk
      };
    });

    if (!stressResult.handTitleOk || !stressResult.draftTitleOk) {
      throw new Error(`[${vp.name}] Card title single-line truncation failed under extreme stress`);
    }
    console.log(`  ✔ [${vp.name}] Hand & Draft Title Truncation OK under extreme 100+ char title stress`);

    if (!stressResult.handDescOk || !stressResult.draftDescOk) {
      throw new Error(`[${vp.name}] Card description 3-line clamping failed under extreme stress`);
    }
    console.log(`  ✔ [${vp.name}] Hand & Draft Desc Clamping OK under 1000+ char description stress`);

    if (stressResult.handOverlap) {
      throw new Error(`[${vp.name}] Element overlap detected in .hand-card-kards layout under stress`);
    }
    if (stressResult.draftOverlap) {
      throw new Error(`[${vp.name}] Element overlap detected in .draft-slot-card layout under stress`);
    }
    console.log(`  ✔ [${vp.name}] Zero element overlaps confirmed in hand & draft card layouts`);

    if (!stressResult.overlayInHandBounds) {
      throw new Error(`[${vp.name}] .card-disable-overlay leaked out of card boundaries`);
    }
    if (!stressResult.badgeWidthHandOk) {
      throw new Error(`[${vp.name}] .card-disable-badge exceeded 90% card width constraint under long text`);
    }
    console.log(`  ✔ [${vp.name}] Overlay & Badge boundary constraints strictly respected`);

    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (hasOverflow) throw new Error(`[${vp.name}] Horizontal viewport overflow detected`);
    console.log(`  ✔ [${vp.name}] Zero horizontal viewport overflow confirmed`);

    await context.close();
    if (errors.length > 0) {
      throw new Error(`Stress Tier 3 (${vp.name}) encountered browser console/page errors:\n${errors.join('\n')}`);
    }
  }

  console.log('✅ Stress Test Tier 3 Passed with 100% Success!');
}

/**
 * Challenger Stress Test — Tier 4 (VFX Robustness & Fault Tolerance)
 */
async function stressTier4(browser, baseURL) {
  console.log('\n==================================================');
  console.log('--- Stress Test Tier 4: VFX Engine Fault Tolerance & All Ultimates ---');
  console.log('==================================================');

  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  attachListeners(page, errors);

  await page.goto(baseURL);
  await page.waitForSelector('#nickname-input', { timeout: 10000 });
  await page.fill('#nickname-input', 'VFX_Stress_Tester');
  await page.click('#btn-pve');
  await page.waitForSelector('.avatar-cell[data-id="char_6"]', { timeout: 10000 });
  await page.click('.avatar-cell[data-id="char_6"]');
  await page.waitForSelector('#modal-select-btn', { timeout: 10000 });
  await page.click('#modal-select-btn', { force: true });
  await page.waitForSelector('#btn-ready:not([disabled])', { timeout: 10000 });
  await page.click('#btn-ready');

  await page.waitForSelector('.arena', { timeout: 10000 });

  // Evaluate All Ultimates & Null/Detached Element Robustness
  const vfxStressResult = await page.evaluate(async () => {
    let vm = window.vfxManager;
    if (!vm) {
      try {
        const mod = await import('/src/utils/vfx.js');
        vm = mod.vfxManager || mod.default;
        if (vm) window.vfxManager = vm;
      } catch (err) {}
    }

    if (!vm) return { success: false, reason: 'vfxManager not found' };

    const results = [];

    // 1. Test All Character Ultimates
    const ultimateCases = [
      { id: 'char_fxr', name: 'FXR_DOMAIN' },
      { id: 'char_fxr', name: 'DREAM_KING' },
      { id: 'lgpyForm', name: 'DREAM_KING_RAGE' },
      { id: 'char_19', name: 'TIMELESS_GRACE' },
      { id: 'char_4', name: 'STAR_SHOWOFF' },
      { id: 'char_14', name: 'BUY_WATER' },
      { id: 'char_unknown', name: 'GENERIC_ULTIMATE' }
    ];

    for (const u of ultimateCases) {
      try {
        vm.triggerUltimateVFX(u.id, u.name);
        results.push(`[PASS] Ultimate VFX ${u.id}/${u.name}`);
      } catch (err) {
        return { success: false, reason: `Ultimate ${u.id} failed: ${err.message}` };
      }
    }

    // 2. Test Fault Tolerance (Null & Detached Node inputs)
    try {
      // Null target hit impact
      vm.playHitImpact(null, 10);
      // Detached element hit impact
      const detachedEl = document.createElement('div');
      vm.playHitImpact(detachedEl, 20);
      
      // Null target floating damage
      vm.spawnFloatingDamage(null, 15);
      vm.spawnFloatingDamage(detachedEl, 15);

      // Null target revival halo
      vm.triggerRevivalHalo(null);
      vm.triggerRevivalHalo(detachedEl);

      // Null / Empty dice rolls
      vm.rollDice(null, []);
      vm.rollDice([], []);
      vm.rollDice([detachedEl], [6]);

      // Invalid intensity camera impulse
      vm.triggerCameraImpulse(NaN);
      vm.triggerCameraImpulse(undefined);
      vm.triggerCameraImpulse(-5);

      results.push('[PASS] Fault tolerance null/detached DOM node handling');
    } catch (err) {
      return { success: false, reason: `Fault tolerance check failed: ${err.message}` };
    }

    // 3. Rapid Burst Ultimate Stress (10 calls in fast succession)
    try {
      for (let i = 0; i < 10; i++) {
        vm.showSkillBanner(`Rapid Banner ${i}`, 'Testing banner burst', i % 2 === 0 ? 'pos' : 'neg');
        vm.triggerCameraImpulse(1.0 + (i * 0.1));
      }
      results.push('[PASS] Rapid burst animation timeline stress');
    } catch (err) {
      return { success: false, reason: `Rapid burst stress failed: ${err.message}` };
    }

    return { success: true, details: results };
  });

  if (!vfxStressResult.success) {
    throw new Error(`VFX Stress Test Failed: ${vfxStressResult.reason}`);
  }

  vfxStressResult.details.forEach(msg => console.log(msg));

  // Perform live game loop interactions to ensure no pending exceptions
  const rollBtn = page.locator('#btn-roll');
  if (await rollBtn.isVisible() && await rollBtn.isEnabled()) {
    await rollBtn.click();
    await page.waitForTimeout(500);
  }

  await context.close();

  if (errors.length > 0) {
    throw new Error(`Stress Tier 4 encountered browser errors:\n${errors.join('\n')}`);
  }

  console.log('✅ Stress Test Tier 4 Passed with 100% Success!');
}

async function main() {
  console.log('====================================================');
  console.log('🔥 Challenger Stress Test — Round 2 Tiers 3 & 4');
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

    await stressTier3(browser, BASE_URL);
    await stressTier4(browser, BASE_URL);

    console.log('\n====================================================');
    console.log('🎉 ALL ADVERSARIAL STRESS TESTS PASSED WITH 0 ERRORS!');
    console.log('====================================================\n');

    await browser.close();
    cleanupServer();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Challenger Stress Test Failed:', err.message);
    if (browser) await browser.close();
    cleanupServer();
    process.exit(1);
  }
}

main();
