import http from 'http';
import net from 'net';
import { chromium } from 'playwright';

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runEmpiricalTests() {
  console.log(`📡 Connecting to running server at ${BASE_URL}...`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const viewports = [
    { name: 'iPhone SE (375px)', width: 375, height: 667 },
    { name: 'iPhone 12/13/14 (390px)', width: 390, height: 844 }
  ];

  const testResults = {
    statsMatrix: [],
    dreamTargetModal: [],
    gameOverScreen: [],
    classBanner: [],
    clippingAndReadability: []
  };

  for (const vp of viewports) {
    console.log(`\n====================================================`);
    console.log(`📱 Testing Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`====================================================`);

    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    page.on('pageerror', err => console.error('Page error:', err));

    await page.goto(BASE_URL);
    await page.waitForSelector('#nickname-input', { timeout: 10000 });

    // ----------------------------------------------------
    // TEST 1: Stats Matrix Scroll Wrapper & Mobile Width
    // ----------------------------------------------------
    console.log('\n--- Test 1: Stats Matrix Wrapper & Overflow ---');
    await page.click('#btn-stats');
    await page.waitForSelector('#stats-modal', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);

    const statsMetrics = await page.evaluate(() => {
      const modal = document.getElementById('stats-modal');
      const content = modal.querySelector('.modal-content');
      const wrap = modal.querySelector('.stats-matrix-wrap');
      const table = modal.querySelector('.stats-matrix');

      const bodyScrollWidth = document.documentElement.scrollWidth;
      const bodyClientWidth = document.documentElement.clientWidth;
      const wrapStyle = wrap ? window.getComputedStyle(wrap) : null;
      const tableStyle = table ? window.getComputedStyle(table) : null;
      const contentRect = content ? content.getBoundingClientRect() : null;

      return {
        modalVisible: modal && window.getComputedStyle(modal).display !== 'none',
        contentWidth: contentRect ? contentRect.width : 0,
        contentMaxWidth: content ? window.getComputedStyle(content).maxWidth : null,
        viewportWidth: window.innerWidth,
        wrapExists: !!wrap,
        wrapOverflowX: wrapStyle ? wrapStyle.overflowX : null,
        wrapScrollWidth: wrap ? wrap.scrollWidth : 0,
        wrapClientWidth: wrap ? wrap.clientWidth : 0,
        tableMinWidth: tableStyle ? tableStyle.minWidth : null,
        tableWidth: table ? table.getBoundingClientRect().width : 0,
        bodyHasOverflow: bodyScrollWidth > bodyClientWidth,
        bodyScrollWidth,
        bodyClientWidth
      };
    });

    console.log('Stats Matrix Metrics:', JSON.stringify(statsMetrics, null, 2));

    const passStatsWrapper = statsMetrics.wrapExists &&
      (statsMetrics.wrapOverflowX === 'auto' || statsMetrics.wrapOverflowX === 'scroll') &&
      statsMetrics.wrapScrollWidth >= statsMetrics.wrapClientWidth &&
      !statsMetrics.bodyHasOverflow &&
      statsMetrics.contentWidth <= vp.width;

    testResults.statsMatrix.push({
      viewport: vp.name,
      metrics: statsMetrics,
      pass: passStatsWrapper
    });

    await page.click('#btn-close-stats');
    await page.waitForTimeout(300);

    // ----------------------------------------------------
    // TEST 2: Dream Target Modal Panel
    // ----------------------------------------------------
    console.log('\n--- Test 2: Dream Target Modal Panel ---');
    await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.className = 'result-overlay';
      overlay.id = 'test-dream-target-modal';
      overlay.style.zIndex = '10000';
      overlay.innerHTML = `
        <div class="dream-target-modal-panel">
          <h2 style="color:var(--accent); margin-bottom:6px; font-size:1.35rem; font-family:var(--font-display);">梦境之王 - 盲选真身</h2>
          <p style="font-size:0.88rem; color:var(--text); margin-bottom:14px; line-height:1.4;">付修然展开了梦境领域！出现 1 个本体与 2 个分身，请盲选本节课的攻击目标：</p>
          <div class="dream-target-cards-container">
            <button class="dream-target-btn">目标 A</button>
            <button class="dream-target-btn">目标 B</button>
            <button class="dream-target-btn">目标 C</button>
          </div>
          <p style="font-size:0.75rem; color:var(--text-secondary);">* 选错分身：分身使用超强骰池 (D7+D9+D9+D9+D11) 且无法伤及本体！</p>
        </div>
      `;
      document.body.appendChild(overlay);
    });
    await page.waitForSelector('#test-dream-target-modal', { state: 'visible' });

    const dreamMetrics = await page.evaluate(() => {
      const panel = document.querySelector('.dream-target-modal-panel');
      const style = window.getComputedStyle(panel);
      const rect = panel.getBoundingClientRect();
      const bodyScrollWidth = document.documentElement.scrollWidth;
      const bodyClientWidth = document.documentElement.clientWidth;

      const fitsInViewportHorizontally = rect.left >= 0 && rect.right <= window.innerWidth;
      const fitsInViewportVertically = rect.top >= 0 && rect.bottom <= window.innerHeight;

      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        maxWidth: style.maxWidth,
        maxHeight: style.maxHeight,
        widthCss: style.width,
        padding: style.padding,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        fitsInViewportHorizontally,
        fitsInViewportVertically,
        bodyHasOverflow: bodyScrollWidth > bodyClientWidth
      };
    });

    console.log('Dream Target Modal Metrics:', JSON.stringify(dreamMetrics, null, 2));

    const passDreamModal = dreamMetrics.fitsInViewportHorizontally &&
      dreamMetrics.fitsInViewportVertically &&
      dreamMetrics.width <= vp.width &&
      !dreamMetrics.bodyHasOverflow;

    testResults.dreamTargetModal.push({
      viewport: vp.name,
      metrics: dreamMetrics,
      pass: passDreamModal
    });

    await page.evaluate(() => {
      document.getElementById('test-dream-target-modal')?.remove();
    });

    // ----------------------------------------------------
    // TEST 3: Game Over Screen
    // ----------------------------------------------------
    console.log('\n--- Test 3: Game Over Screen ---');
    await page.evaluate(() => {
      const o = document.createElement('div');
      o.className = 'game-over-screen';
      o.id = 'test-game-over-screen';
      o.innerHTML = `
        <div class="go-content win">
          <h1 class="go-title">胜 利</h1>
          <div class="go-stats">
            <div class="player-box me">
              <div class="avatar-area"><div class="avatar"></div></div>
              <div class="player-info">
                <div class="name-row"><span class="nickname">玩家1</span><span class="card-name">郭朋远</span></div>
                <div class="hp-container"><div class="hp-bar"><div class="hp-bar-fill" style="width:80%"></div></div><div class="hp-text">80 / 100</div></div>
              </div>
            </div>
            <div class="go-vs">VS</div>
            <div class="player-box op">
              <div class="avatar-area"><div class="avatar"></div></div>
              <div class="player-info">
                <div class="name-row"><span class="nickname">电脑</span><span class="card-name">付修然</span></div>
                <div class="hp-container"><div class="hp-bar"><div class="hp-bar-fill" style="width:0%"></div></div><div class="hp-text">0 / 100</div></div>
              </div>
            </div>
          </div>
          <div class="go-footer">
            <button class="btn btn-primary btn-lg" id="test-btn-back">返回大厅</button>
          </div>
        </div>
      `;
      document.body.appendChild(o);
    });
    await page.waitForSelector('#test-game-over-screen', { state: 'visible' });

    const gameOverMetrics = await page.evaluate(() => {
      const screen = document.getElementById('test-game-over-screen');
      const content = screen.querySelector('.go-content');
      const style = window.getComputedStyle(content);
      const rect = content.getBoundingClientRect();
      const bodyScrollWidth = document.documentElement.scrollWidth;
      const bodyClientWidth = document.documentElement.clientWidth;

      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        maxWidth: style.maxWidth,
        maxHeight: style.maxHeight,
        padding: style.padding,
        overflowY: style.overflowY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        fitsHorizontally: rect.left >= 0 && rect.right <= window.innerWidth,
        fitsVertically: rect.top >= 0 && rect.bottom <= window.innerHeight,
        bodyHasOverflow: bodyScrollWidth > bodyClientWidth
      };
    });

    console.log('Game Over Screen Metrics:', JSON.stringify(gameOverMetrics, null, 2));

    const passGameOver = gameOverMetrics.fitsHorizontally &&
      gameOverMetrics.fitsVertically &&
      !gameOverMetrics.bodyHasOverflow;

    testResults.gameOverScreen.push({
      viewport: vp.name,
      metrics: gameOverMetrics,
      pass: passGameOver
    });

    await page.evaluate(() => {
      document.getElementById('test-game-over-screen')?.remove();
    });

    // ----------------------------------------------------
    // TEST 4: Class Banner Scaling & Overflow
    // ----------------------------------------------------
    console.log('\n--- Test 4: Class Banner Scaling & Boundary ---');
    // Test with short text AND long text
    const bannerTexts = ['数学', '买水成功！当前蓄势: 2 层'];
    for (const text of bannerTexts) {
      await page.evaluate((t) => {
        const b = document.createElement('div');
        b.className = 'class-banner';
        b.id = 'test-class-banner';
        b.textContent = t;
        document.body.appendChild(b);
      }, text);
      await page.waitForSelector('#test-class-banner', { state: 'visible' });

      const bannerMetrics = await page.evaluate(() => {
        const banner = document.getElementById('test-class-banner');
        const style = window.getComputedStyle(banner);
        const rect = banner.getBoundingClientRect();
        const bodyScrollWidth = document.documentElement.scrollWidth;
        const bodyClientWidth = document.documentElement.clientWidth;

        return {
          text: banner.textContent,
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          maxWidth: style.maxWidth,
          maxHeight: style.maxHeight,
          padding: style.padding,
          fontSize: style.fontSize,
          viewportWidth: window.innerWidth,
          fitsHorizontally: rect.left >= 0 && rect.right <= window.innerWidth,
          overflowLeft: rect.left < 0,
          overflowRight: rect.right > window.innerWidth,
          bodyHasOverflow: bodyScrollWidth > bodyClientWidth
        };
      });

      console.log(`Class Banner Metrics ("${text}"):`, JSON.stringify(bannerMetrics, null, 2));

      const passClassBanner = bannerMetrics.fitsHorizontally &&
        !bannerMetrics.overflowLeft &&
        !bannerMetrics.overflowRight;

      testResults.classBanner.push({
        viewport: vp.name,
        text,
        metrics: bannerMetrics,
        pass: passClassBanner
      });

      await page.evaluate(() => {
        document.getElementById('test-class-banner')?.remove();
      });
    }

    // ----------------------------------------------------
    // TEST 5: Text Clipping & Readability Checks
    // ----------------------------------------------------
    console.log('\n--- Test 5: Text Clipping & Readability ---');
    const clippingMetrics = await page.evaluate(() => {
      const elementsToCheck = [
        '.title-main',
        '.title-sub',
        '#nickname-input',
        '#btn-pve',
        '#btn-match',
        '.info-title'
      ];
      const results = [];
      for (const sel of elementsToCheck) {
        const el = document.querySelector(sel);
        if (el) {
          const rect = el.getBoundingClientRect();
          const isClipped = el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
          results.push({ selector: sel, width: rect.width, height: rect.height, isClipped });
        }
      }
      return results;
    });

    console.log('Clipping Metrics:', JSON.stringify(clippingMetrics, null, 2));
    testResults.clippingAndReadability.push({
      viewport: vp.name,
      metrics: clippingMetrics,
      pass: clippingMetrics.every(m => !m.isClipped)
    });

    await context.close();
  }

  console.log('\n====================================================');
  console.log('📊 EMPIRICAL TEST SUMMARY RESULTS');
  console.log('====================================================');
  console.log(JSON.stringify(testResults, null, 2));

  await browser.close();
}

runEmpiricalTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
