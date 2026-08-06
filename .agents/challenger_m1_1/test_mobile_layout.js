import { chromium } from 'playwright';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');

async function runTests() {
  console.log('Starting Empirical Mobile Layout Test Suite...');

  // Start static file server serving dist/
  const app = express();
  app.use(express.static(join(projectRoot, 'dist')));
  app.get('*', (req, res) => res.sendFile(join(projectRoot, 'dist', 'index.html')));
  
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(3456, resolve));
  console.log('Test server running at http://localhost:3456');

  const browser = await chromium.launch({ headless: true });
  let hasFailures = false;
  const testResults = [];

  const viewports = [
    { name: 'iPhone SE / Mobile Small', width: 375, height: 667, mobile: true },
    { name: 'iPhone 12/13/14 / Mobile Standard', width: 390, height: 844, mobile: true },
    { name: 'Mobile Mid Breakpoint', width: 480, height: 800, mobile: true },
    { name: 'Mobile Edge Breakpoint', width: 679, height: 900, mobile: true },
    { name: 'Desktop Standard', width: 1024, height: 768, mobile: false },
    { name: 'Desktop Large', width: 1280, height: 800, mobile: false },
  ];

  for (const vp of viewports) {
    console.log(`\n--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto('http://localhost:3456');
    await page.waitForLoadState('networkidle');

    // Make sure global chat widget is visible for testing (simulate showGlobalChat)
    await page.evaluate(() => {
      const widget = document.querySelector('.chat-widget');
      if (widget) widget.style.display = 'flex';
    });

    // Also render battle page structure with FAB to test positioning
    await page.evaluate(() => {
      const appContainer = document.getElementById('app');
      appContainer.innerHTML = `
        <div class="arena">
          <aside class="sidebar sidebar-left" id="sidebar-schedule">
            <div class="sidebar-title">课程表</div>
            <div class="sch-item active"><span class="icon">📖</span><span class="sch-label">语文</span></div>
          </aside>

          <main class="arena-center">
            <div class="card-row">
              <div class="battle-card-wrap" id="card-op">
                <div class="battle-card"><div class="bc-name">对手</div></div>
              </div>
              <div class="battle-card-wrap self-side" id="card-me">
                <div class="battle-card"><div class="bc-name">玩家</div></div>
              </div>
            </div>
            <div class="dice-area" id="dice-area"></div>
            <div class="action-bar"><button class="btn btn-primary">掷骰</button></div>
            <div class="stats-matrix-wrap">
              <table class="stats-matrix">
                <thead><tr><th>科目</th><th>胜率</th><th>对局数</th><th>得点</th><th>失点</th></tr></thead>
                <tbody><tr><td>语文</td><td>75%</td><td>12</td><td>120</td><td>40</td></tr></tbody>
              </table>
            </div>
            <div class="hand-fab-container">
              <button class="hand-fab" id="hand-fab">
                <span class="fab-icon">🃏</span> 
                <span class="fab-count">2/3</span>
                <span class="fab-tp">⚡5</span>
              </button>
              <div class="hand-fan-container" id="hand-fan-container"></div>
            </div>
          </main>
        </div>
      `;
    });

    // Wait 100ms for layout render
    await page.waitForTimeout(100);

    // TEST 1 & 2: FAB vs Chat Widget Positioning
    const chatBox = await page.evaluate(() => {
      const el = document.querySelector('.chat-widget');
      const header = document.querySelector('.chat-header');
      if (!el || !header) return null;
      const rect = el.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        headerTop: headerRect.top,
        headerBottom: headerRect.bottom,
        headerHeight: headerRect.height,
        zIndex: parseInt(style.zIndex),
        collapsed: el.classList.contains('collapsed')
      };
    });

    const fabBox = await page.evaluate(() => {
      const el = document.querySelector('.hand-fab-container');
      const fabBtn = document.querySelector('.hand-fab');
      if (!el || !fabBtn) return null;
      const rect = el.getBoundingClientRect();
      const btnRect = fabBtn.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        containerLeft: rect.left,
        containerRight: rect.right,
        containerTop: rect.top,
        containerBottom: rect.bottom,
        btnLeft: btnRect.left,
        btnRight: btnRect.right,
        btnTop: btnRect.top,
        btnBottom: btnRect.bottom,
        btnWidth: btnRect.width,
        btnHeight: btnRect.height,
        zIndex: parseInt(style.zIndex)
      };
    });

    console.log('Chat Box Layout:', chatBox);
    console.log('FAB Box Layout:', fabBox);

    if (vp.mobile) {
      // Mobile positioning checks
      // 1. Chat widget full width at bottom (left=0, right=vp.width, width=vp.width)
      const chatFullWidth = Math.abs(chatBox.width - vp.width) <= 1;
      const chatAtBottom = Math.abs(chatBox.bottom - vp.height) <= 2;
      // 2. FAB bottom gap: chat header top - fab btn bottom
      // Note: chat header is at bottom of screen when collapsed: headerTop = vp.height - 48
      // fab bottom = vp.height - 58
      // gap = headerTop - fabBottom = (vp.height - 48) - (vp.height - 58) = 10px
      const gap = chatBox.headerTop - fabBox.btnBottom;
      const fabAboveChatHeader = Math.abs(gap - 10) <= 2;
      const fabZIndexHigher = fabBox.zIndex > chatBox.zIndex; // 9000 > 8500

      // Check hit testing: point at center of FAB btn
      const fabCenterX = fabBox.btnLeft + fabBox.btnWidth / 2;
      const fabCenterY = fabBox.btnTop + fabBox.btnHeight / 2;
      const fabHitElement = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.className : 'null';
      }, { x: fabCenterX, y: fabCenterY });

      // Check hit testing: point at center of Chat Header
      const chatHeaderCenterX = chatBox.left + chatBox.width / 2;
      const chatHeaderCenterY = chatBox.headerTop + chatBox.headerHeight / 2;
      const chatHitElement = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? el.className : 'null';
      }, { x: chatHeaderCenterX, y: chatHeaderCenterY });

      const passMobilePos = chatFullWidth && chatAtBottom && fabAboveChatHeader && fabZIndexHigher;
      
      console.log(`[Mobile FAB Gap Check]: calculated gap = ${gap.toFixed(2)}px (Expected ~10px) -> ${fabAboveChatHeader ? 'PASS' : 'FAIL'}`);
      console.log(`[Mobile Chat Full Width]: width = ${chatBox.width}px vs ${vp.width}px -> ${chatFullWidth ? 'PASS' : 'FAIL'}`);
      console.log(`[Mobile Z-Index Order]: FAB (${fabBox.zIndex}) > Chat (${chatBox.zIndex}) -> ${fabZIndexHigher ? 'PASS' : 'FAIL'}`);
      console.log(`[Mobile FAB Hit Test]: point (${fabCenterX}, ${fabCenterY}) hit className = "${fabHitElement}"`);
      console.log(`[Mobile Chat Header Hit Test]: point (${chatHeaderCenterX}, ${chatHeaderCenterY}) hit className = "${chatHitElement}"`);

      testResults.push({
        test: `Mobile FAB vs Chat Header Positioning (${vp.name})`,
        passed: passMobilePos,
        details: `gap=${gap.toFixed(2)}px, fabZIndex=${fabBox.zIndex}, chatZIndex=${chatBox.zIndex}, fabHit=${fabHitElement}, chatHit=${chatHitElement}`
      });
      if (!passMobilePos) hasFailures = true;

    } else {
      // Desktop positioning checks
      // .chat-widget at right: 90px, width: 300px -> right edge = vp.width - 90, left edge = vp.width - 390
      // .hand-fab-container at right: 20px, width: 60px -> right edge = vp.width - 20, left edge = vp.width - 80
      const chatRightMargin = vp.width - chatBox.right; // expected ~90
      const fabRightMargin = vp.width - fabBox.containerRight; // expected ~20
      const desktopGap = (vp.width - chatRightMargin - chatBox.width) - fabBox.containerRight; // gap between chat left and fab right? No, chat is at right: 90px (390px to 90px from screen right edge), fab is at right: 20px (80px to 20px from screen right edge). Gap between fab left edge (vp.width - 80) and chat right edge (vp.width - 90) = 10px.
      const chatRightEdgeDistance = vp.width - chatBox.right; // 90px
      const fabLeftEdgeDistance = vp.width - fabBox.btnLeft; // 80px
      const desktopOverlapGap = chatRightEdgeDistance - fabLeftEdgeDistance; // 90 - 80 = 10px gap

      const passDesktopPos = Math.abs(chatRightMargin - 90) <= 2 && Math.abs(fabRightMargin - 20) <= 2 && desktopOverlapGap >= 5;

      console.log(`[Desktop Chat Right Margin]: ${chatRightMargin.toFixed(2)}px (Expected 90px) -> ${Math.abs(chatRightMargin - 90) <= 2 ? 'PASS' : 'FAIL'}`);
      console.log(`[Desktop FAB Right Margin]: ${fabRightMargin.toFixed(2)}px (Expected 20px) -> ${Math.abs(fabRightMargin - 20) <= 2 ? 'PASS' : 'FAIL'}`);
      console.log(`[Desktop Horizontal Gap]: ${desktopOverlapGap.toFixed(2)}px (Expected ~10px) -> ${desktopOverlapGap >= 5 ? 'PASS' : 'FAIL'}`);

      testResults.push({
        test: `Desktop Layout Positioning (${vp.name})`,
        passed: passDesktopPos,
        details: `chatRightMargin=${chatRightMargin.toFixed(2)}px, fabRightMargin=${fabRightMargin.toFixed(2)}px, gap=${desktopOverlapGap.toFixed(2)}px`
      });
      if (!passDesktopPos) hasFailures = true;
    }

    // TEST 3: Zero Horizontal Overflow Check
    const overflowCheck = await page.evaluate(() => {
      const docEl = document.documentElement;
      const bodyEl = document.body;
      const appEl = document.getElementById('app');
      
      const docScrollWidth = docEl.scrollWidth;
      const docClientWidth = docEl.clientWidth;
      const bodyScrollWidth = bodyEl.scrollWidth;
      const bodyClientWidth = bodyEl.clientWidth;

      // Find any element overflowing viewport
      const allElements = Array.from(document.body.getElementsByTagName('*'));
      const overflowingElements = [];
      for (const el of allElements) {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth + 1 || rect.left < -1) {
          // ignore fixed/absolute overlays that handle overflow or animations
          const style = window.getComputedStyle(el);
          if (style.overflowX !== 'hidden' && style.position !== 'fixed') {
            overflowingElements.push({
              tag: el.tagName,
              class: el.className,
              id: el.id,
              right: rect.right,
              width: rect.width,
              windowWidth: window.innerWidth
            });
          }
        }
      }

      return {
        docScrollWidth,
        docClientWidth,
        bodyScrollWidth,
        bodyClientWidth,
        hasBodyOverflow: docScrollWidth > docClientWidth || bodyScrollWidth > bodyClientWidth,
        overflowingElements
      };
    });

    console.log(`[Horizontal Overflow Check]: docScrollWidth=${overflowCheck.docScrollWidth}, docClientWidth=${overflowCheck.docClientWidth}, bodyScrollWidth=${overflowCheck.bodyScrollWidth}, bodyClientWidth=${overflowCheck.bodyClientWidth}`);
    if (overflowCheck.overflowingElements.length > 0) {
      console.log('Overflowing Elements:', overflowCheck.overflowingElements);
    }

    const passOverflow = !overflowCheck.hasBodyOverflow;
    testResults.push({
      test: `Zero Horizontal Overflow (${vp.name})`,
      passed: passOverflow,
      details: `docScrollWidth=${overflowCheck.docScrollWidth}, docClientWidth=${overflowCheck.docClientWidth}, overflowingCount=${overflowCheck.overflowingElements.length}`
    });
    if (!passOverflow) hasFailures = true;

    await page.close();
  }

  await browser.close();
  server.close();

  console.log('\n================ TEST SUMMARY ================');
  for (const res of testResults) {
    console.log(`${res.passed ? '✅ PASS' : '❌ FAIL'}: ${res.test} (${res.details})`);
  }
  console.log('==============================================');

  return !hasFailures;
}

runTests().then(success => {
  if (success) {
    console.log('ALL EMPIRICAL TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('SOME EMPIRICAL TESTS FAILED!');
    process.exit(1);
  }
}).catch(err => {
  console.error('Test runner crashed with error:', err);
  process.exit(1);
});
