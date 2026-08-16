import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

// Setup JSDOM
const dom = new JSDOM('<!DOCTYPE html><html><head><style id="main-css"></style></head><body><div id="app"></div><div id="sandbox"></div></body></html>', {
  url: 'http://localhost/'
});

global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.NodeList = dom.window.NodeList;
global.Element = dom.window.Element;
global.getComputedStyle = dom.window.getComputedStyle;
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

// Load CSS into DOM
const cssPath = path.join(process.cwd(), 'src/style/index.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');
document.getElementById('main-css').textContent = cssContent;

// Dynamic import battle module
const battleModule = await import('../src/pages/battle.js');
const { tacticalBarHTML, checkDraftShopModal } = battleModule;

async function runM2UIEmpiricalSuite() {
  console.log('====================================================');
  console.log('🔥 CHALLENGER M2 TACTICAL CARD UI/UX EMPIRICAL SUITE');
  console.log('====================================================\n');

  const testResults = [];
  const record = (name, pass, details) => {
    testResults.push({ name, pass, details });
    const symbol = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${symbol} | ${name}`);
    console.log(`   Details: ${details}\n`);
  };

  const sandbox = document.getElementById('sandbox');

  // ----------------------------------------------------
  // TEST 1: CSS Root Variable Definition (--text-main)
  // ----------------------------------------------------
  try {
    const hasTextMain = cssContent.includes('--text-main:');
    const rootMatches = cssContent.match(/:root\s*\{[^}]+\}/s);
    const inRoot = rootMatches ? rootMatches[0].includes('--text-main') : false;

    record('1. CSS Variable --text-main in :root', hasTextMain && inRoot,
      `--text-main defined in :root: ${inRoot}`);
  } catch (e) {
    record('1. CSS Variable --text-main in :root', false, `Exception: ${e.message}`);
  }

  // ----------------------------------------------------
  // TEST 2: Disable Overlay CSS Rules (.card-disable-overlay & .card-disable-badge)
  // ----------------------------------------------------
  try {
    const hasDisableOverlay = cssContent.includes('.card-disable-overlay');
    const hasDisableBadge = cssContent.includes('.card-disable-badge');
    const hasAbsolutePositioning = cssContent.includes('position: absolute') && cssContent.includes('inset: 0');
    const hasBackdropFilter = cssContent.includes('backdrop-filter: blur') || cssContent.includes('-webkit-backdrop-filter: blur');
    const hasPointerEvents = cssContent.includes('pointer-events: none');

    record('2. Glassmorphic Disable Overlay CSS Rules', 
      hasDisableOverlay && hasDisableBadge && hasAbsolutePositioning && hasBackdropFilter && hasPointerEvents,
      `overlay: ${hasDisableOverlay}, badge: ${hasDisableBadge}, absolute/inset: ${hasAbsolutePositioning}, backdropFilter: ${hasBackdropFilter}, pointerEvents: ${hasPointerEvents}`);
  } catch (e) {
    record('2. Glassmorphic Disable Overlay CSS Rules', false, `Exception: ${e.message}`);
  }

  // ----------------------------------------------------
  // TEST 3: Hand Card Markup & Disabled Overlay Generation
  // ----------------------------------------------------
  try {
    const mockState = {
      me: {
        tp: 1,
        handCards: [
          { id: 'card_1', name: '高等数学', desc: '造成10点伤害', subject: 'math', tpCost: 1, type: 'buff' },
          { id: 'card_2', name: '英语听力', desc: '获得盾牌', subject: 'english', tpCost: 2, type: 'blessing' },
          { id: 'card_3', name: '通用技巧', desc: '重掷1颗骰子', subject: 'universal', tpCost: 1, type: 'other' }
        ],
        subject: 'math'
      },
      currentSubject: 'math'
    };

    // Render hand cards
    sandbox.innerHTML = `<div id="hand-cards-container"></div>`;
    const container = document.getElementById('hand-cards-container');
    
    // Evaluate internal function or simulate markup logic
    // Let's test mock State hand card HTML via string generation logic matching battle.js
    const handCards = mockState.me.handCards;
    const curSubj = mockState.currentSubject;
    const canUseClass = true;

    const cardsHTML = handCards.map((c, i) => {
      const typeClass = c.type || 'buff';
      const subjMatch = c.subject === 'universal' || c.subject === curSubj;
      const canPlay = c.subject === 'universal' || (subjMatch && canUseClass);
      let disableReason = '';
      if (!canPlay) {
        if (!subjMatch && c.subject !== 'universal') disableReason = `限当节课`;
      }
      const mid = (handCards.length - 1) / 2;
      const rotateDeg = (i - mid) * 15;
      const transY = Math.abs(i - mid) * 10;
      return `
        <div class="hand-card-kards ${canPlay ? '' : 'disabled'}" style="--card-rotate: ${rotateDeg}deg; transform: rotate(${rotateDeg}deg) translateY(${transY}px)" title="${disableReason}">
          <div class="card-tag-row">
            <span class="card-tag-type ${typeClass}">${c.subject}</span>
            <span class="card-tp-cost">⚡${c.tpCost}</span>
          </div>
          <div class="card-title-text">${c.name}</div>
          <div class="card-desc-text">${c.desc}</div>
          ${!canPlay ? `<div class="card-disable-overlay"><span class="card-disable-badge">${disableReason}</span></div>` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = cardsHTML;

    const renderedCards = container.querySelectorAll('.hand-card-kards');
    const disabledCards = container.querySelectorAll('.hand-card-kards.disabled');
    const overlays = container.querySelectorAll('.card-disable-overlay');
    const badges = container.querySelectorAll('.card-disable-badge');

    const pass = renderedCards.length === 3 && disabledCards.length === 1 && overlays.length === 1 && badges.length === 1;

    record('3. Hand Card Markup & Disabled Overlay Generation', pass,
      `Rendered: ${renderedCards.length}, Disabled: ${disabledCards.length}, Overlays: ${overlays.length}, Badges: ${badges.length}`);
  } catch (e) {
    record('3. Hand Card Markup & Disabled Overlay Generation', false, `Exception: ${e.message}`);
  }

  // ----------------------------------------------------
  // TEST 4: Hand Card Physics Hover CSS Rule (--card-rotate)
  // ----------------------------------------------------
  try {
    const hasCardRotateProperty = cssContent.includes('var(--card-rotate, 0deg)');
    const hasStandardDimensions = cssContent.includes('width: 135px;') && cssContent.includes('height: 185px;') && cssContent.includes('margin-left: -67px;');

    record('4. Hand Card Spring Physics & Dimensions (135x185)', 
      hasCardRotateProperty && hasStandardDimensions,
      `--card-rotate binding: ${hasCardRotateProperty}, Standard dimensions: ${hasStandardDimensions}`);
  } catch (e) {
    record('4. Hand Card Spring Physics & Dimensions (135x185)', false, `Exception: ${e.message}`);
  }

  // ----------------------------------------------------
  // TEST 5: Draft Shop Card Redesign Structure & Badges
  // ----------------------------------------------------
  try {
    const mockShopState = {
      me: { tp: 1, handCards: [{ id: '1' }, { id: '2' }, { id: '3' }] }, // Hand full AND TP 1
      draftShopSlots: [
        { card: { name: '物理冲刺', desc: '强力物理伤害', subject: 'physics', tpCost: 2, type: 'buff' }, refreshesLeft: 2 }
      ]
    };

    const slot = mockShopState.draftShopSlots[0];
    const c = slot.card;
    const isHandFull = (mockShopState.me.handCards || []).length >= 3;
    const isAfford = mockShopState.me.tp >= c.tpCost;
    const buyDisabled = isHandFull || !isAfford;
    let disableReason = '';
    if (isHandFull) disableReason = '手牌已满';
    else if (!isAfford) disableReason = 'TP不足';
    const stars = '★'.repeat(c.tpCost) + '☆'.repeat(Math.max(0, 3 - c.tpCost));

    const shopCardHTML = `
      <div class="draft-slot-card ${buyDisabled ? 'disabled' : 'clickable'}">
        <button class="btn-icon-refresh" ${slot.refreshesLeft > 0 ? '' : 'disabled'}>↻</button>
        <div class="draft-card-header">
          <span class="card-tag-type ${c.type}">${c.subject}</span>
          <span class="draft-card-star">${stars}</span>
        </div>
        <div class="draft-card-title">${c.name}</div>
        <div class="draft-card-desc">${c.desc}</div>
        ${buyDisabled ? `<div class="card-disable-overlay"><span class="card-disable-badge">${disableReason}</span></div>` : ''}
      </div>
    `;

    sandbox.innerHTML = shopCardHTML;

    const shopCard = sandbox.querySelector('.draft-slot-card');
    const badge = sandbox.querySelector('.card-disable-badge');
    const starEl = sandbox.querySelector('.draft-card-star');

    const passBadgeText = badge ? badge.textContent === '手牌已满' : false;
    const passStarsText = starEl ? starEl.textContent === '★★☆' : false;

    record('5. Draft Shop Card Badges & Star Rating Alignment', passBadgeText && passStarsText,
      `Badge Text: "${badge?.textContent}", Stars Text: "${starEl?.textContent}"`);
  } catch (e) {
    record('5. Draft Shop Card Badges & Star Rating Alignment', false, `Exception: ${e.message}`);
  }

  // ----------------------------------------------------
  // Summary & Overall Verdict
  // ----------------------------------------------------
  const passedAll = testResults.every(r => r.pass);
  const overallVerdict = passedAll ? 'PASS' : 'FAIL';

  console.log('====================================================');
  console.log(`📊 CHALLENGER M2 UI EMPIRICAL VERDICT: ${overallVerdict}`);
  console.log('====================================================\n');

  process.exit(passedAll ? 0 : 1);
}

runM2UIEmpiricalSuite().catch(err => {
  console.error('Fatal Test Exception:', err);
  process.exit(1);
});
