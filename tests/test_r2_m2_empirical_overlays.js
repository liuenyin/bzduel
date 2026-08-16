import { spawn } from 'child_process';
import http from 'http';
import net from 'net';
import { chromium } from 'playwright';

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

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

async function runEmpiricalOverlayTests(browser, baseURL) {
  console.log('\n====================================================');
  console.log('🧪 EMPIRICAL VERIFICATION: R2-M2 DISABLE OVERLAY & RESPONSIVENESS');
  console.log('====================================================\n');

  const viewports = [
    { name: 'Desktop (1280x800)', width: 1280, height: 800 },
    { name: 'Tablet (600x800)', width: 600, height: 800 },
    { name: 'Mobile (375x667)', width: 375, height: 667 },
  ];

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failureDetails = [];

  function logTest(name, pass, details = '') {
    totalTests++;
    if (pass) {
      passedTests++;
      console.log(`  ✅ [PASS] ${name}`);
      if (details) console.log(`     Details: ${details}`);
    } else {
      failedTests++;
      console.log(`  ❌ [FAIL] ${name}`);
      console.log(`     Details: ${details}`);
      failureDetails.push(`${name}: ${details}`);
    }
  }

  for (const vp of viewports) {
    console.log(`\n----------------------------------------------------`);
    console.log(`📱 Testing Viewport: ${vp.name}`);
    console.log(`----------------------------------------------------`);

    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto(baseURL);
    await page.waitForSelector('#nickname-input', { timeout: 10000 });

    const vpResults = await page.evaluate(async (vpInfo) => {
      const results = [];
      const record = (name, pass, details) => results.push({ name, pass, details });

      // Load battle module & css
      let battleModule;
      try {
        battleModule = await import('/src/pages/battle.js');
      } catch (err) {
        return [{ name: 'Module Import', pass: false, details: err.message }];
      }

      // Create test container
      const container = document.createElement('div');
      container.id = 'empirical-test-container';
      document.body.appendChild(container);

      // Mock Battle State with Hand Cards & Shop Cards in Various Disabled States
      const mockState = {
        gameMode: '1v1',
        myIndex: 0,
        attackerIdx: 0,
        defenderIdx: 1,
        schedule: ['math', 'english', 'physics'],
        currentClassIndex: 0,
        me: {
          id: 'p1',
          hp: 30,
          maxHp: 30,
          tp: 1, // 1 TP -> 2 TP cards disabled due to TP不足
          card: { name: '测试选手', subjects: ['math'] }, // 选科仅数学
          handCards: [
            { id: 'c1', name: '数学公式推导', type: 'buff', subject: 'math', tpCost: 1, desc: '通用数学加速技能，短描述。' },
            { id: 'c2', name: '英语语法突击', type: 'debuff', subject: 'english', tpCost: 1, desc: '限当节课：英语课可用。' },
            { id: 'c3', name: '物理实验爆发', type: 'blessing', subject: 'physics', tpCost: 3, desc: '非自身选科/限当节课且TP不足。' }
          ],
          activeBlessings: []
        },
        opponent: { id: 'p2', hp: 30, maxHp: 30, card: { name: '对手' } },
        players: [{ id: 'p1', hp: 30 }, { id: 'p2', hp: 30 }],
        draftShop: {
          active: true,
          players: {
            'p1': {
              ready: false,
              slots: [
                { card: { id: 's1', name: '基础复习', type: 'buff', subject: 'universal', tpCost: 1, desc: '购买1星卡' } }, // Affordable
                { card: { id: 's2', name: '高级模拟考', type: 'blessing', subject: 'universal', tpCost: 2, desc: 'TP不足 (需要2TP，当前1TP)' } }, // TP不足
                { card: { id: 's3', name: '冲刺训练', type: 'debuff', subject: 'math', tpCost: 3, desc: 'TP不足 (需要3TP，当前1TP)' } }  // TP不足
              ]
            }
          }
        }
      };

      try {
        battleModule.renderBattle(container, { state: mockState });
      } catch (err) {
        record('renderBattle execution', false, err.message);
        container.remove();
        return results;
      }

      // Open hand fan container if present
      const fab = document.getElementById('hand-fab');
      const fanContainer = document.getElementById('hand-fan-container');
      if (fab && fanContainer) {
        fanContainer.classList.add('expanded');
      }

      // ----------------------------------------------------
      // TEST 1: Hand Cards Disable Overlays
      // Disable reasons: 限当节课, TP不足, 非自身选科
      // ----------------------------------------------------
      const handCards = container.querySelectorAll('.hand-card-kards');
      record('Hand cards count rendered', handCards.length === 3, `Expected 3 hand cards, found ${handCards.length}`);

      if (handCards.length >= 3) {
        // Card 1: playable (no disable overlay)
        const c1Overlay = handCards[0].querySelector('.card-disable-overlay');
        record('Playable card has no overlay', c1Overlay === null, 'Hand card 1 should not have disable overlay');

        // Card 2: disabled (限当节课)
        const c2Overlay = handCards[1].querySelector('.card-disable-overlay');
        const c2Badge = handCards[1].querySelector('.card-disable-badge');
        record('Hand card 2 disabled overlay exists', c2Overlay !== null, 'Hand card 2 should have disable overlay');
        record('Hand card 2 badge text ("限当节课")', c2Badge && c2Badge.textContent.trim() === '限当节课', `Actual text: ${c2Badge?.textContent.trim()}`);

        // Card 3: disabled (限当节课)
        const c3Overlay = handCards[2].querySelector('.card-disable-overlay');
        const c3Badge = handCards[2].querySelector('.card-disable-badge');
        record('Hand card 3 disabled overlay exists', c3Overlay !== null, 'Hand card 3 should have disable overlay');
        record('Hand card 3 badge text ("限当节课")', c3Badge && c3Badge.textContent.trim() === '限当节课', `Actual text: ${c3Badge?.textContent.trim()}`);
      }

      // ----------------------------------------------------
      // TEST 2: Hand Cards Overlay Geometry & Coverage
      // ----------------------------------------------------
      handCards.forEach((card, idx) => {
        const overlay = card.querySelector('.card-disable-overlay');
        if (!overlay) return;

        const cardRect = card.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();

        const xDiff = Math.abs(cardRect.left - overlayRect.left);
        const yDiff = Math.abs(cardRect.top - overlayRect.top);
        const wDiff = Math.abs(cardRect.width - overlayRect.width);
        const hDiff = Math.abs(cardRect.height - overlayRect.height);

        const perfectCoverage = xDiff <= 1 && yDiff <= 1 && wDiff <= 1 && hDiff <= 1;
        record(`Hand Card ${idx+1} overlay 100% bounding coverage`, perfectCoverage,
          `Card: ${cardRect.width.toFixed(1)}x${cardRect.height.toFixed(1)} at (${cardRect.left.toFixed(1)}, ${cardRect.top.toFixed(1)}) | Overlay: ${overlayRect.width.toFixed(1)}x${overlayRect.height.toFixed(1)} at (${overlayRect.left.toFixed(1)}, ${overlayRect.top.toFixed(1)})`);

        const cardStyle = window.getComputedStyle(card);
        const overlayStyle = window.getComputedStyle(overlay);

        record(`Hand Card ${idx+1} card has overflow: hidden`, cardStyle.overflow === 'hidden', `Actual: ${cardStyle.overflow}`);
        record(`Hand Card ${idx+1} overlay has position: absolute`, overlayStyle.position === 'absolute', `Actual: ${overlayStyle.position}`);
        record(`Hand Card ${idx+1} overlay pointer-events: none`, overlayStyle.pointerEvents === 'none', `Actual: ${overlayStyle.pointerEvents}`);
      });

      // ----------------------------------------------------
      // TEST 3: Draft Shop Cards Disable Overlays (TP不足 & 手牌已满)
      // ----------------------------------------------------
      const shopSlots = document.querySelectorAll('#draft-shop-modal .draft-slot-card');
      record('Draft shop slots rendered', shopSlots.length === 3, `Expected 3 draft shop slots, found ${shopSlots.length}`);

      if (shopSlots.length >= 3) {
        // Slot 1: 1 TP (affordable, no overlay)
        const s1Overlay = shopSlots[0].querySelector('.card-disable-overlay');
        record('Draft shop slot 1 affordable has no overlay', s1Overlay === null, 'Slot 1 should not be disabled');

        // Slot 2: 2 TP (TP不足)
        const s2Overlay = shopSlots[1].querySelector('.card-disable-overlay');
        const s2Badge = shopSlots[1].querySelector('.card-disable-badge');
        record('Draft shop slot 2 TP不足 overlay exists', s2Overlay !== null, 'Slot 2 should have disable overlay');
        record('Draft shop slot 2 badge text ("TP不足")', s2Badge && s2Badge.textContent.trim() === 'TP不足', `Actual: ${s2Badge?.textContent.trim()}`);

        // Slot 3: 3 TP (TP不足)
        const s3Overlay = shopSlots[2].querySelector('.card-disable-overlay');
        const s3Badge = shopSlots[2].querySelector('.card-disable-badge');
        record('Draft shop slot 3 TP不足 overlay exists', s3Overlay !== null, 'Slot 3 should have disable overlay');
        record('Draft shop slot 3 badge text ("TP不足")', s3Badge && s3Badge.textContent.trim() === 'TP不足', `Actual: ${s3Badge?.textContent.trim()}`);
      }

      // Test Shop Slot Disable Overlay Geometry & Coverage
      shopSlots.forEach((slot, idx) => {
        const overlay = slot.querySelector('.card-disable-overlay');
        if (!overlay) return;

        const slotRect = slot.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();

        const xDiff = Math.abs(slotRect.left - overlayRect.left);
        const yDiff = Math.abs(slotRect.top - overlayRect.top);
        const wDiff = Math.abs(slotRect.width - overlayRect.width);
        const hDiff = Math.abs(slotRect.height - overlayRect.height);

        const perfectCoverage = xDiff <= 1 && yDiff <= 1 && wDiff <= 1 && hDiff <= 1;
        record(`Draft Shop Slot ${idx+1} overlay 100% bounding coverage`, perfectCoverage,
          `Slot: ${slotRect.width.toFixed(1)}x${slotRect.height.toFixed(1)} at (${slotRect.left.toFixed(1)}, ${slotRect.top.toFixed(1)}) | Overlay: ${overlayRect.width.toFixed(1)}x${overlayRect.height.toFixed(1)} at (${overlayRect.left.toFixed(1)}, ${overlayRect.top.toFixed(1)})`);

        const slotStyle = window.getComputedStyle(slot);
        const overlayStyle = window.getComputedStyle(overlay);

        record(`Draft Shop Slot ${idx+1} card has overflow: hidden`, slotStyle.overflow === 'hidden', `Actual: ${slotStyle.overflow}`);
        record(`Draft Shop Slot ${idx+1} overlay has position: absolute`, overlayStyle.position === 'absolute', `Actual: ${overlayStyle.position}`);
      });

      // ----------------------------------------------------
      // TEST 4: Zero Layout Shift Test (Dynamic Toggle of Overlay)
      // ----------------------------------------------------
      const testCard = document.createElement('div');
      testCard.className = 'hand-card-kards';
      testCard.style.position = 'relative';
      testCard.innerHTML = `
        <div class="card-tag-row">
          <span class="card-tag-type buff">通用</span>
          <span class="card-tp-cost">⚡1</span>
        </div>
        <div class="card-title-text">布局位移测试卡牌</div>
        <div class="card-desc-text">测试在动态添加和移除禁用遮罩层时，卡牌及内部元素的尺寸和位置是否保持100%不变。</div>
      `;
      container.appendChild(testCard);

      const beforeCardRect = testCard.getBoundingClientRect();
      const beforeTitleRect = testCard.querySelector('.card-title-text').getBoundingClientRect();
      const beforeDescRect = testCard.querySelector('.card-desc-text').getBoundingClientRect();

      // Inject disable overlay dynamically
      const overlayEl = document.createElement('div');
      overlayEl.className = 'card-disable-overlay';
      overlayEl.innerHTML = `<span class="card-disable-badge">非自身选科</span>`;
      testCard.appendChild(overlayEl);
      testCard.classList.add('disabled');

      const afterCardRect = testCard.getBoundingClientRect();
      const afterTitleRect = testCard.querySelector('.card-title-text').getBoundingClientRect();
      const afterDescRect = testCard.querySelector('.card-desc-text').getBoundingClientRect();

      const cardShift = Math.abs(beforeCardRect.width - afterCardRect.width) +
                        Math.abs(beforeCardRect.height - afterCardRect.height) +
                        Math.abs(beforeCardRect.left - afterCardRect.left) +
                        Math.abs(beforeCardRect.top - afterCardRect.top);

      const titleShift = Math.abs(beforeTitleRect.left - afterTitleRect.left) +
                         Math.abs(beforeTitleRect.top - afterTitleRect.top);

      const descShift = Math.abs(beforeDescRect.left - afterDescRect.left) +
                        Math.abs(beforeDescRect.top - afterDescRect.top);

      record('Zero Layout Shift on card when overlay toggled', cardShift === 0, `Total card Shift: ${cardShift}px`);
      record('Zero Layout Shift on internal title when overlay toggled', titleShift === 0, `Title Shift: ${titleShift}px`);
      record('Zero Layout Shift on internal desc when overlay toggled', descShift === 0, `Desc Shift: ${descShift}px`);

      // ----------------------------------------------------
      // TEST 5: Hand Cards & Shop Cards "手牌已满" Overlay Test
      // ----------------------------------------------------
      const fullHandState = {
        ...mockState,
        me: {
          ...mockState.me,
          tp: 10, // Plenty TP, but 3 hand cards
          handCards: [
            { id: 'c1', name: '卡牌1', type: 'buff', subject: 'universal', tpCost: 1, desc: '描述1' },
            { id: 'c2', name: '卡牌2', type: 'buff', subject: 'universal', tpCost: 1, desc: '描述2' },
            { id: 'c3', name: '卡牌3', type: 'buff', subject: 'universal', tpCost: 1, desc: '描述3' }
          ]
        }
      };

      battleModule.renderBattle(container, { state: fullHandState });
      const fullShopSlots = document.querySelectorAll('#draft-shop-modal .draft-slot-card');
      let fullHandOverlayCount = 0;
      let fullHandBadgeTextCorrect = true;

      fullShopSlots.forEach(slot => {
        const ov = slot.querySelector('.card-disable-overlay');
        const badge = slot.querySelector('.card-disable-badge');
        if (ov && badge) {
          fullHandOverlayCount++;
          if (badge.textContent.trim() !== '手牌已满') fullHandBadgeTextCorrect = false;
        }
      });

      record('Shop slots disabled when hand is full (3/3)', fullHandOverlayCount === 3, `Slots with overlay: ${fullHandOverlayCount}/3`);
      record('Shop slots badge text ("手牌已满")', fullHandBadgeTextCorrect, 'Badge text should be "手牌已满"');

      // ----------------------------------------------------
      // TEST 6: Mobile Responsiveness & No Horizontal Window Overflow
      // ----------------------------------------------------
      const docScrollWidth = document.documentElement.scrollWidth;
      const windowInnerWidth = window.innerWidth;
      const noHorizontalOverflow = docScrollWidth <= windowInnerWidth;
      record(`No horizontal page overflow at viewport width ${windowInnerWidth}px`, noHorizontalOverflow,
        `scrollWidth: ${docScrollWidth}px, windowWidth: ${windowInnerWidth}px`);

      // Cleanup
      container.remove();
      const shopModal = document.getElementById('draft-shop-modal');
      if (shopModal) shopModal.remove();

      return results;
    }, { viewportName: vp.name });

    for (const r of vpResults) {
      logTest(`[${vp.name}] ${r.name}`, r.pass, r.details);
    }

    if (pageErrors.length > 0) {
      logTest(`[${vp.name}] Page Errors check`, false, `JS page errors captured: ${pageErrors.join(', ')}`);
    } else {
      logTest(`[${vp.name}] Page Errors check`, true, 'Zero JS page errors');
    }

    await page.close();
    await context.close();
  }

  console.log('\n====================================================');
  console.log(`📊 SUMMARY OF EMPIRICAL VERIFICATION`);
  console.log(`   Total Tests Executed: ${totalTests}`);
  console.log(`   Passed: ${passedTests}`);
  console.log(`   Failed: ${failedTests}`);
  console.log('====================================================\n');

  return { totalTests, passedTests, failedTests, failureDetails };
}

async function main() {
  let serverProcess = null;
  const isRunning = await isPortOpen(PORT);

  if (!isRunning) {
    console.log(`🌐 Server not running on port ${PORT}. Starting server...`);
    serverProcess = spawn('node', ['server/index.js'], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'pipe'
    });
    serverProcess.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('http://localhost:3000')) console.log(`📡 [Server Ready]: ${msg.trim()}`);
    });
    await waitForServer(BASE_URL, 15000);
    console.log('✅ Server online.');
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
    const res = await runEmpiricalOverlayTests(browser, BASE_URL);
    await browser.close();
    cleanup();

    if (res.failedTests === 0) {
      console.log('🎉 VERIFICATION SUCCESS: All empirical tests passed perfectly!');
      process.exit(0);
    } else {
      console.error('❌ VERIFICATION FAILURE: Some tests failed. Details:');
      console.error(res.failureDetails.join('\n'));
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Unexpected runner error:', err);
    if (browser) await browser.close();
    cleanup();
    process.exit(1);
  }
}

main();
