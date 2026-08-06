import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');

console.log('=== Running Playwright Headless CSS Verification ===');

const cssPath = path.join(rootDir, 'src/style/index.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

async function run() {
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'Mobile 375px (iPhone SE)', width: 375, height: 667 },
    { name: 'Mobile 390px (iPhone 12/13/14)', width: 390, height: 844 },
    { name: 'Desktop 1024px', width: 1024, height: 768 }
  ];

  let passCount = 0;
  let failCount = 0;

  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    const testHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${cssContent}</style>
      </head>
      <body>
        <div id="app">
          <div class="arena">
            <div class="sidebar sidebar-left"></div>
            <div class="arena-center">
              <div class="panel">Panel content</div>
            </div>
            <div class="sidebar sidebar-right"></div>
          </div>
          <div id="stats-modal" class="modal-overlay stats-modal">
            <div class="stats-matrix-wrap">
              <div class="stats-matrix">Matrix</div>
            </div>
          </div>
          <div class="hand-fab-container">
            <div class="hand-fab">FAB</div>
          </div>
        </div>
      </body>
      </html>
    `;

    await page.setContent(testHtml);

    // 1. Horizontal overflow test
    const metrics = await page.evaluate(() => {
      return {
        docWidth: document.documentElement.clientWidth,
        docScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth
      };
    });

    console.log(`\nMetrics for ${vp.name}: clientWidth=${metrics.docWidth}, docScrollWidth=${metrics.docScrollWidth}, bodyScrollWidth=${metrics.bodyScrollWidth}`);
    if (metrics.docScrollWidth <= metrics.docWidth && metrics.bodyScrollWidth <= metrics.docWidth) {
      console.log(`[PASS] Zero horizontal overflow on ${vp.name}`);
      passCount++;
    } else {
      console.error(`[FAIL] Horizontal overflow detected on ${vp.name}`);
      failCount++;
    }

    // 2. Computed styles for .hand-fab-container
    const fabStyle = await page.evaluate(() => {
      const el = document.querySelector('.hand-fab-container');
      const style = window.getComputedStyle(el);
      return {
        bottom: style.bottom,
        right: style.right,
        zIndex: style.zIndex,
        position: style.position
      };
    });

    console.log(`Computed styles for .hand-fab-container on ${vp.name}:`, fabStyle);
    if (vp.width <= 680) {
      if (fabStyle.bottom === '58px' && fabStyle.right === '16px' && fabStyle.zIndex === '9000') {
        console.log(`[PASS] .hand-fab-container correctly computes (bottom: 58px, right: 16px, z-index: 9000) on ${vp.name}`);
        passCount++;
      } else {
        console.error(`[FAIL] .hand-fab-container failed computed style check on ${vp.name}`);
        failCount++;
      }
    } else {
      if (fabStyle.bottom === '20px' && fabStyle.right === '20px' && fabStyle.zIndex === '1000') {
        console.log(`[PASS] .hand-fab-container computes default base styles (bottom: 20px, right: 20px, z-index: 1000) on ${vp.name}`);
        passCount++;
      } else {
        console.error(`[FAIL] .hand-fab-container desktop base style check failed on ${vp.name}`);
        failCount++;
      }
    }

    // 3. Computed flex child styles
    const flexStyles = await page.evaluate(() => {
      const arenaCenter = window.getComputedStyle(document.querySelector('.arena-center'));
      const panel = window.getComputedStyle(document.querySelector('.panel'));
      const statsModal = window.getComputedStyle(document.querySelector('.stats-modal'));
      const statsMatrixWrap = window.getComputedStyle(document.querySelector('.stats-matrix-wrap'));

      return {
        arenaCenterMinW: arenaCenter.minWidth,
        arenaCenterMaxW: arenaCenter.maxWidth,
        panelMinW: panel.minWidth,
        panelMaxW: panel.maxWidth,
        statsModalMinW: statsModal.minWidth,
        statsModalMaxW: statsModal.maxWidth,
        statsMatrixWrapMinW: statsMatrixWrap.minWidth,
        statsMatrixWrapMaxW: statsMatrixWrap.maxWidth,
      };
    });

    console.log(`Flex children computed styles on ${vp.name}:`, flexStyles);
    if (flexStyles.arenaCenterMinW === '0px' && flexStyles.panelMinW === '0px' && flexStyles.statsModalMinW === '0px' && flexStyles.statsMatrixWrapMinW === '0px') {
      console.log(`[PASS] All flex children computed min-width: 0px on ${vp.name}`);
      passCount++;
    } else {
      console.error(`[FAIL] Flex children min-width check failed on ${vp.name}`);
      failCount++;
    }

    await context.close();
  }

  await browser.close();
  console.log(`\nPlaywright Headless CSS Verification Finished: ${passCount} PASSED, ${failCount} FAILED.`);
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
