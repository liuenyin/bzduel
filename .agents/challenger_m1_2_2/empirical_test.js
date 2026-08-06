import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../../dist');

function startServer(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/') reqPath = '/index.html';
      const filePath = path.join(distDir, reqPath);

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        let contentType = 'text/html';
        if (filePath.endsWith('.css')) contentType = 'text/css';
        if (filePath.endsWith('.js')) contentType = 'application/javascript';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`Test server running at http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}

async function runEmpiricalStressTest() {
  const PORT = 3900 + Math.floor(Math.random() * 100);
  const server = await startServer(PORT);
  
  await new Promise(r => setTimeout(r, 500));

  const browser = await chromium.launch({ headless: true });

  const testResults = {
    requirement1: { passed: false, details: [] },
    requirement2: { passed: false, details: [] },
    requirement3: { passed: false, details: [] }
  };

  try {
    const page = await browser.newPage();

    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') pageErrors.push(msg.text());
    });

    await page.goto(`http://127.0.0.1:${PORT}`, { waitUntil: 'domcontentloaded' });

    // Inject/render both .chat-widget and .hand-fab-container as they appear during battle
    await page.evaluate(() => {
      let chat = document.querySelector('.chat-widget');
      if (chat) {
        chat.style.display = 'flex';
      } else {
        chat = document.createElement('div');
        chat.className = 'chat-widget collapsed';
        chat.style.display = 'flex';
        document.body.appendChild(chat);
      }

      let fab = document.querySelector('.hand-fab-container');
      if (!fab) {
        fab = document.createElement('div');
        fab.className = 'hand-fab-container';
        fab.innerHTML = '<div class="hand-fab">FAB</div>';
        document.body.appendChild(fab);
      }
    });

    console.log('\n--- TEST 1: Mobile hand-fab-container positioning & chat widget collision ---');
    const viewports = [375, 390, 480, 600, 679, 700, 1024];
    let req1Pass = true;

    for (const width of viewports) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(100);

      const fabMetrics = await page.evaluate(() => {
        const fab = document.querySelector('.hand-fab-container');
        const chat = document.querySelector('.chat-widget');
        if (!fab || !chat) return null;
        const fabStyle = window.getComputedStyle(fab);
        const chatStyle = window.getComputedStyle(chat);
        const fabRect = fab.getBoundingClientRect();
        const chatRect = chat.getBoundingClientRect();
        return {
          fab: {
            bottom: fabStyle.bottom,
            right: fabStyle.right,
            zIndex: fabStyle.zIndex,
            rect: { top: fabRect.top, bottom: fabRect.bottom, left: fabRect.left, right: fabRect.right }
          },
          chat: {
            bottom: chatStyle.bottom,
            right: chatStyle.right,
            zIndex: chatStyle.zIndex,
            rect: { top: chatRect.top, bottom: chatRect.bottom, left: chatRect.left, right: chatRect.right }
          }
        };
      });

      if (!fabMetrics) {
        testResults.requirement1.details.push({ width, status: 'FAIL', reason: 'Elements not found in DOM' });
        req1Pass = false;
        continue;
      }

      const isMobile = width < 680;
      if (isMobile) {
        const expectedBottom = '58px';
        const expectedRight = '16px';
        const expectedZIndex = '9000';
        const expectedChatZIndex = '8500';

        const bottomOk = fabMetrics.fab.bottom === expectedBottom;
        const rightOk = fabMetrics.fab.right === expectedRight;
        const zIndexOk = fabMetrics.fab.zIndex === expectedZIndex;
        const chatZIndexOk = fabMetrics.chat.zIndex === expectedChatZIndex;
        const fabAboveChatZIndex = parseInt(fabMetrics.fab.zIndex) > parseInt(fabMetrics.chat.zIndex);

        if (bottomOk && rightOk && zIndexOk && chatZIndexOk && fabAboveChatZIndex) {
          testResults.requirement1.details.push({
            width,
            status: 'PASS',
            fabBottom: fabMetrics.fab.bottom,
            fabRight: fabMetrics.fab.right,
            fabZIndex: fabMetrics.fab.zIndex,
            chatZIndex: fabMetrics.chat.zIndex
          });
        } else {
          req1Pass = false;
          testResults.requirement1.details.push({
            width,
            status: 'FAIL',
            actualFab: fabMetrics.fab,
            actualChat: fabMetrics.chat
          });
        }
      } else {
        testResults.requirement1.details.push({
          width,
          status: 'PASS (Desktop baseline)',
          fabBottom: fabMetrics.fab.bottom,
          fabRight: fabMetrics.fab.right,
          fabZIndex: fabMetrics.fab.zIndex
        });
      }
    }
    testResults.requirement1.passed = req1Pass;

    console.log('--- TEST 2: Mobile Viewport Flex Scaling & Body Scroll Overflow (scrollWidth) ---');
    const mobileWidths = [375, 390];
    let req2Pass = true;

    for (const width of mobileWidths) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(100);

      const overflowMetrics = await page.evaluate(() => {
        const bodyScrollWidth = document.body.scrollWidth;
        const clientWidth = document.documentElement.clientWidth;
        const htmlScrollWidth = document.documentElement.scrollWidth;

        const arenaCenter = document.querySelector('.arena-center');
        const panel = document.querySelector('.panel');
        const statsModal = document.querySelector('.stats-modal');
        const statsMatrixWrap = document.querySelector('.stats-matrix-wrap');

        const getFlexProps = (el) => {
          if (!el) return null;
          const s = window.getComputedStyle(el);
          return { minWidth: s.minWidth, maxWidth: s.maxWidth, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
        };

        return {
          bodyScrollWidth,
          htmlScrollWidth,
          clientWidth,
          hasOverflow: bodyScrollWidth > clientWidth || htmlScrollWidth > clientWidth,
          flexElements: {
            arenaCenter: getFlexProps(arenaCenter),
            panel: getFlexProps(panel),
            statsModal: getFlexProps(statsModal),
            statsMatrixWrap: getFlexProps(statsMatrixWrap)
          }
        };
      });

      if (overflowMetrics.hasOverflow) {
        req2Pass = false;
        testResults.requirement2.details.push({
          width,
          status: 'FAIL',
          reason: `Horizontal overflow detected: body scrollWidth (${overflowMetrics.bodyScrollWidth}px) exceeds clientWidth (${overflowMetrics.clientWidth}px)`
        });
      } else {
        testResults.requirement2.details.push({
          width,
          status: 'PASS',
          bodyScrollWidth: overflowMetrics.bodyScrollWidth,
          clientWidth: overflowMetrics.clientWidth,
          flexElements: overflowMetrics.flexElements
        });
      }
    }

    // Dynamic component rendering check
    await page.evaluate(() => {
      const app = document.getElementById('app');
      if (app) {
        app.innerHTML += `
          <div class="arena-center" style="display:flex">
            <div class="panel">Arena Panel</div>
          </div>
          <div class="stats-modal">
            <div class="stats-matrix-wrap">
              <table class="stats-matrix"><tr><td>Test Table</td></tr></table>
            </div>
          </div>
        `;
      }
    });

    for (const width of mobileWidths) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(100);

      const overflowMetrics = await page.evaluate(() => {
        const bodyScrollWidth = document.body.scrollWidth;
        const clientWidth = document.documentElement.clientWidth;
        return { bodyScrollWidth, clientWidth, hasOverflow: bodyScrollWidth > clientWidth };
      });

      if (overflowMetrics.hasOverflow) {
        req2Pass = false;
        testResults.requirement2.details.push({
          width,
          status: 'FAIL (With dynamic elements)',
          bodyScrollWidth: overflowMetrics.bodyScrollWidth,
          clientWidth: overflowMetrics.clientWidth
        });
      } else {
        testResults.requirement2.details.push({
          width,
          status: 'PASS (With dynamic elements)',
          bodyScrollWidth: overflowMetrics.bodyScrollWidth,
          clientWidth: overflowMetrics.clientWidth
        });
      }
    }
    testResults.requirement2.passed = req2Pass;

    console.log('--- TEST 3: .draft-shop-panel Color Theme Consistency ---');
    await page.evaluate(() => {
      const panel = document.createElement('div');
      panel.className = 'draft-shop-panel';
      panel.id = 'test-draft-shop-panel';
      panel.textContent = 'Draft Shop Panel Test';
      document.body.appendChild(panel);
    });

    const shopColorMetrics = await page.evaluate(() => {
      const el = document.getElementById('test-draft-shop-panel');
      const computedStyle = window.getComputedStyle(el);
      
      const temp = document.createElement('div');
      temp.style.color = 'var(--text)';
      document.body.appendChild(temp);
      const expectedColor = window.getComputedStyle(temp).color;
      document.body.removeChild(temp);

      return {
        computedColor: computedStyle.color,
        expectedColor: expectedColor
      };
    });

    const isColorConsistent = shopColorMetrics.computedColor === shopColorMetrics.expectedColor;

    if (isColorConsistent) {
      testResults.requirement3.passed = true;
      testResults.requirement3.details.push({
        status: 'PASS',
        computedColor: shopColorMetrics.computedColor,
        expectedColor: shopColorMetrics.expectedColor
      });
    } else {
      testResults.requirement3.passed = false;
      testResults.requirement3.details.push({
        status: 'FAIL',
        computedColor: shopColorMetrics.computedColor,
        expectedColor: shopColorMetrics.expectedColor
      });
    }

    console.log('\n==========================================');
    console.log('            EMPIRICAL TEST DETAILS        ');
    console.log('==========================================');
    console.log(JSON.stringify(testResults, null, 2));

    fs.writeFileSync(
      path.resolve(__dirname, 'test_output.json'),
      JSON.stringify({ testResults, pageErrors }, null, 2)
    );

  } finally {
    await browser.close();
    server.close();
  }
}

runEmpiricalStressTest().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
