import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cssPath = path.resolve(__dirname, '../src/style/index.css');
let cssContent = fs.readFileSync(cssPath, 'utf-8');
// Strip remote @import to prevent page crash on network font load
cssContent = cssContent.replace(/@import\s+url\([^)]+\);?/g, '');

console.log('===========================================================');
console.log('  R2-M2 Anti-Overlap UI Layout Empirical Verification');
console.log('===========================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function assert(condition, testName, detail = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName} - ${detail}`);
    failureDetails.push({ testName, detail });
  }
}

// Card Test Cases
const testCases = [
  {
    id: 'case_normal',
    label: 'Standard Card Content',
    typeLabel: '通用',
    typeClass: 'buff',
    tpCost: 1,
    name: '物理反弹',
    desc: '在本节课中，受到伤害的 50% 将反弹给攻击者。',
    disabled: false,
    disableReason: ''
  },
  {
    id: 'case_max_name',
    label: 'Max-Length Card Name (50+ Chars)',
    typeLabel: '语文',
    typeClass: 'blessing',
    tpCost: 3,
    name: '【超长战术卡名称测试文本超长连击超级无敌至尊霸王究极必杀卡】',
    desc: '常规效果描述。',
    disabled: false,
    disableReason: ''
  },
  {
    id: 'case_max_desc',
    label: 'Max-Length Description (300+ Chars)',
    typeLabel: '数学',
    typeClass: 'debuff',
    tpCost: 2,
    name: '极速冲刺',
    desc: '【超长描述测试】当本节课触发暴击时，立即恢复自身 50 点 HP，并且重置所有骰子，获得 10 层蓄势状态，且对方下一轮攻击伤害降低 80%，同时抽 3 张战术卡，并在下三节课内获得全科目加成 +100%。如果当前处于梦境状态，则额外造成 999 点真实伤害并直接击飞对手！',
    disabled: false,
    disableReason: ''
  },
  {
    id: 'case_long_disable',
    label: 'Long Disable Reason',
    typeLabel: '英语',
    typeClass: 'other',
    tpCost: 2,
    name: '战术防御',
    desc: '常规防御效果。',
    disabled: true,
    disableReason: '【超长禁用原因：当前战术点数严重不足且非适用科目】'
  },
  {
    id: 'case_extreme_combo',
    label: 'Extreme Multi-Element Combo (Max Name + Max Desc + Long Disable + Long Tag)',
    typeLabel: '【超长科目类型标签名称】',
    typeClass: 'blessing',
    tpCost: 3,
    name: '【超长战术卡名称测试文本超长连击超级无敌至尊霸王究极必杀卡】',
    desc: '【超长描述测试】当本节课触发暴击时，立即恢复自身 50 点 HP，并且重置所有骰子，获得 10 层蓄势状态，且对方下一轮攻击伤害降低 80%，同时抽 3 张战术卡，并在下三节课内获得全科目加成 +100%。',
    disabled: true,
    disableReason: '【超长禁用原因：当前战术点数严重不足且非适用科目】'
  }
];

function buildHTML(cards) {
  const handCardsHTML = cards.map(c => `
    <div class="hand-card-kards ${c.disabled ? 'disabled' : ''}" id="hand_${c.id}" data-testid="hand_${c.id}">
      <div class="card-tag-row">
        <span class="card-tag-type ${c.typeClass}">${c.typeLabel}</span>
        <span class="card-tp-cost">⚡${c.tpCost}</span>
      </div>
      <div class="card-title-text">${c.name}</div>
      <div class="card-desc-text">${c.desc}</div>
      ${c.disabled ? `<div class="card-disable-overlay"><span class="card-disable-badge">${c.disableReason}</span></div>` : ''}
    </div>
  `).join('');

  const draftCardsHTML = cards.map(c => `
    <div class="draft-slot-card ${c.disabled ? 'disabled' : 'clickable'}" id="draft_${c.id}" data-testid="draft_${c.id}">
      <button class="btn-icon-refresh">↻</button>
      <div class="draft-card-header">
        <span class="card-tag-type ${c.typeClass}">${c.typeLabel}</span>
        <span class="draft-card-star">${'★'.repeat(c.tpCost)}</span>
      </div>
      <div class="draft-card-title">${c.name}</div>
      <div class="draft-card-desc">${c.desc}</div>
      ${c.disabled ? `<div class="card-disable-overlay"><span class="card-disable-badge">${c.disableReason}</span></div>` : ''}
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>R2-M2 Empirical Layout Verification</title>
      <style>${cssContent}</style>
      <style>
        body { padding: 20px; background: #faf8f5; }
        .test-section { margin-bottom: 30px; }
        .hand-test-container {
          position: relative;
          width: 320px;
          height: 220px;
          border: 1px dashed #ccc;
          margin-bottom: 20px;
        }
        .draft-test-container {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
        }
      </style>
    </head>
    <body>
      <div class="test-section">
        <h2>Hand Cards Layout</h2>
        <div class="hand-test-container" id="hand-cards-container">
          ${handCardsHTML}
        </div>
      </div>
      <div class="test-section">
        <h2>Draft Shop Cards Layout</h2>
        <div class="draft-test-container" id="draft-cards-container">
          ${draftCardsHTML}
        </div>
      </div>
    </body>
    </html>
  `;
}

async function runEmpiricalVerification() {
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'Desktop (135x185px card)', width: 1280, height: 800, expectedHandWidth: 135, expectedHandHeight: 185 },
    { name: 'Mobile (110x155px card)', width: 375, height: 667, expectedHandWidth: 110, expectedHandHeight: 155 }
  ];

  for (const vp of viewports) {
    console.log(`\n===========================================================`);
    console.log(` Viewport: ${vp.name} [${vp.width}x${vp.height}]`);
    console.log(`===========================================================`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }
    });
    const page = await context.newPage();

    const html = buildHTML(testCases);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    // Evaluate in browser context
    for (const c of testCases) {
      console.log(`\n--- Inspecting Hand Card: [${c.id}] ${c.label} ---`);

      const handMetrics = await page.evaluate((cId) => {
        const card = document.getElementById(`hand_${cId}`);
        if (!card) return null;

        const cardRect = card.getBoundingClientRect();
        const style = window.getComputedStyle(card);

        // Check children containment
        const children = Array.from(card.children);
        const childMetrics = children.map(child => {
          const r = child.getBoundingClientRect();
          const s = window.getComputedStyle(child);
          return {
            tagName: child.tagName,
            className: child.className,
            rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
            style: {
              whiteSpace: s.whiteSpace,
              overflow: s.overflow,
              textOverflow: s.textOverflow,
              webkitLineClamp: s.webkitLineClamp || s['-webkit-line-clamp']
            }
          };
        });

        // Specific sub-elements
        const titleEl = card.querySelector('.card-title-text');
        const descEl = card.querySelector('.card-desc-text');
        const overlayEl = card.querySelector('.card-disable-overlay');
        const badgeEl = card.querySelector('.card-disable-badge');
        const tagTypeEl = card.querySelector('.card-tag-type');

        const titleRect = titleEl ? titleEl.getBoundingClientRect() : null;
        const descRect = descEl ? descEl.getBoundingClientRect() : null;
        const overlayRect = overlayEl ? overlayEl.getBoundingClientRect() : null;
        const badgeRect = badgeEl ? badgeEl.getBoundingClientRect() : null;
        const tagTypeRect = tagTypeEl ? tagTypeEl.getBoundingClientRect() : null;

        return {
          cardRect: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom, width: cardRect.width, height: cardRect.height },
          scrollWidth: card.scrollWidth,
          clientWidth: card.clientWidth,
          offsetWidth: card.offsetWidth,
          scrollHeight: card.scrollHeight,
          clientHeight: card.clientHeight,
          offsetHeight: card.offsetHeight,
          overflowCSS: style.overflow,
          flexDirection: style.flexDirection,
          justifyContent: style.justifyContent,
          childMetrics,
          titleRect,
          descRect,
          overlayRect,
          badgeRect,
          tagTypeRect
        };
      }, c.id);

      // Assertions for Hand Card
      assert(handMetrics !== null, `Hand Card [${c.id}] exists in DOM`);
      
      // 1. Dimensions check
      assert(
        Math.abs(handMetrics.cardRect.width - vp.expectedHandWidth) <= 2,
        `Hand Card [${c.id}] width matches target (${handMetrics.cardRect.width}px vs ${vp.expectedHandWidth}px)`,
        `Actual: ${handMetrics.cardRect.width}px`
      );
      assert(
        Math.abs(handMetrics.cardRect.height - vp.expectedHandHeight) <= 2,
        `Hand Card [${c.id}] height matches target (${handMetrics.cardRect.height}px vs ${vp.expectedHandHeight}px)`,
        `Actual: ${handMetrics.cardRect.height}px`
      );

      // 2. Zero Scrollbar Overflow check
      assert(
        handMetrics.scrollWidth <= handMetrics.clientWidth,
        `Hand Card [${c.id}] zero horizontal scroll overflow (scrollWidth ${handMetrics.scrollWidth}px <= clientWidth ${handMetrics.clientWidth}px)`
      );
      assert(
        handMetrics.scrollHeight <= handMetrics.clientHeight,
        `Hand Card [${c.id}] zero vertical scroll overflow (scrollHeight ${handMetrics.scrollHeight}px <= clientHeight ${handMetrics.clientHeight}px)`
      );
      assert(
        handMetrics.overflowCSS === 'hidden',
        `Hand Card [${c.id}] overflow CSS is 'hidden'`
      );

      // 3. Child Element Containment inside Card Bounding Box
      let allChildrenContained = true;
      for (const child of handMetrics.childMetrics) {
        if (child.className === 'card-disable-overlay') continue; // Overlay uses absolute inset 0
        const isWithinX = child.rect.left >= handMetrics.cardRect.left - 1 && child.rect.right <= handMetrics.cardRect.right + 1;
        const isWithinY = child.rect.top >= handMetrics.cardRect.top - 1 && child.rect.bottom <= handMetrics.cardRect.bottom + 1;
        if (!isWithinX || !isWithinY) {
          allChildrenContained = false;
          console.error(`    -> Child ${child.className} out of bounds: child rect ${JSON.stringify(child.rect)}, card rect ${JSON.stringify(handMetrics.cardRect)}`);
        }
      }
      assert(
        allChildrenContained,
        `Hand Card [${c.id}] all children strictly contained within card bounding box`
      );

      // 4. Vertical Collision Check: Title vs Desc
      if (handMetrics.titleRect && handMetrics.descRect) {
        const noOverlapY = handMetrics.titleRect.bottom <= handMetrics.descRect.top + 1;
        assert(
          noOverlapY,
          `Hand Card [${c.id}] zero vertical collision between Title bottom (${handMetrics.titleRect.bottom.toFixed(1)}px) and Description top (${handMetrics.descRect.top.toFixed(1)}px)`
        );
      }

      // 5. Title Truncation Single Line
      if (handMetrics.titleRect) {
        const titleSingleLine = handMetrics.titleRect.height <= 25;
        assert(
          titleSingleLine,
          `Hand Card [${c.id}] Title single-line height constraint (${handMetrics.titleRect.height.toFixed(1)}px <= 25px)`
        );
      }

      // 6. Disable Overlay Alignment & Badge Bounds
      if (c.disabled && handMetrics.overlayRect && handMetrics.badgeRect) {
        const overlayMatchesCard = Math.abs(handMetrics.overlayRect.width - handMetrics.cardRect.width) <= 2 &&
                                   Math.abs(handMetrics.overlayRect.height - handMetrics.cardRect.height) <= 2;
        assert(
          overlayMatchesCard,
          `Hand Card [${c.id}] Disable overlay matches card bounds perfectly (${handMetrics.overlayRect.width}x${handMetrics.overlayRect.height})`
        );

        const badgeContained = handMetrics.badgeRect.left >= handMetrics.cardRect.left - 1 &&
                               handMetrics.badgeRect.right <= handMetrics.cardRect.right + 1;
        assert(
          badgeContained,
          `Hand Card [${c.id}] Disable badge stays strictly inside card bounds (${handMetrics.badgeRect.left.toFixed(1)} >= ${handMetrics.cardRect.left.toFixed(1)} && ${handMetrics.badgeRect.right.toFixed(1)} <= ${handMetrics.cardRect.right.toFixed(1)})`
        );
      }

      // Inspect Draft Shop Slot Card
      console.log(`\n--- Inspecting Draft Shop Card: [${c.id}] ${c.label} ---`);

      const draftMetrics = await page.evaluate((cId) => {
        const card = document.getElementById(`draft_${cId}`);
        if (!card) return null;

        const cardRect = card.getBoundingClientRect();
        const style = window.getComputedStyle(card);

        const titleEl = card.querySelector('.draft-card-title');
        const descEl = card.querySelector('.draft-card-desc');
        const overlayEl = card.querySelector('.card-disable-overlay');
        const badgeEl = card.querySelector('.card-disable-badge');

        return {
          cardRect: { left: cardRect.left, top: cardRect.top, right: cardRect.right, bottom: cardRect.bottom, width: cardRect.width, height: cardRect.height },
          scrollWidth: card.scrollWidth,
          clientWidth: card.clientWidth,
          scrollHeight: card.scrollHeight,
          clientHeight: card.clientHeight,
          overflowCSS: style.overflow,
          titleRect: titleEl ? titleEl.getBoundingClientRect() : null,
          descRect: descEl ? descEl.getBoundingClientRect() : null,
          overlayRect: overlayEl ? overlayEl.getBoundingClientRect() : null,
          badgeRect: badgeEl ? badgeEl.getBoundingClientRect() : null
        };
      }, c.id);

      assert(draftMetrics !== null, `Draft Card [${c.id}] exists in DOM`);
      assert(
        draftMetrics.scrollWidth <= draftMetrics.clientWidth,
        `Draft Card [${c.id}] zero horizontal scroll overflow (${draftMetrics.scrollWidth}px <= ${draftMetrics.clientWidth}px)`
      );
      assert(
        draftMetrics.scrollHeight <= draftMetrics.clientHeight,
        `Draft Card [${c.id}] zero vertical scroll overflow (${draftMetrics.scrollHeight}px <= ${draftMetrics.clientHeight}px)`
      );
      assert(
        draftMetrics.overflowCSS === 'hidden',
        `Draft Card [${c.id}] overflow CSS is 'hidden'`
      );

      if (draftMetrics.titleRect && draftMetrics.descRect) {
        assert(
          draftMetrics.titleRect.bottom <= draftMetrics.descRect.top + 1,
          `Draft Card [${c.id}] Title and Description do NOT collide vertically`
        );
      }

      if (c.disabled && draftMetrics.badgeRect) {
        assert(
          draftMetrics.badgeRect.left >= draftMetrics.cardRect.left - 1 &&
          draftMetrics.badgeRect.right <= draftMetrics.cardRect.right + 1,
          `Draft Card [${c.id}] Disable badge contained within card bounds`
        );
      }
    }

    await context.close();
  }

  await browser.close();

  console.log(`\n===========================================================`);
  console.log(` Empirical Verification Results:`);
  console.log(` Total Checks: ${totalTests}`);
  console.log(` Passed:       ${passedTests}`);
  console.log(` Failed:       ${failedTests}`);
  console.log(`===========================================================\n`);

  if (failedTests > 0) {
    console.error('Failures encountered:');
    failureDetails.forEach(f => console.error(` - ${f.testName}: ${f.detail}`));
    process.exit(1);
  } else {
    console.log('ALL EMPIRICAL TESTS PASSED PERFECTLY!');
    process.exit(0);
  }
}

runEmpiricalVerification().catch(err => {
  console.error('Verification script crashed:', err);
  process.exit(1);
});
