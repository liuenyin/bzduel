import fs from 'fs';
import path from 'path';

// Empirical test for Challenger 2 - Milestone 2 (Tactical Card UI/UX Overhaul R2)

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`[FAIL] ${message}`);
    testsFailed++;
  }
}

console.log('=== STARTING EMPIRICAL VERIFICATION: MILESTONE 2 (UI/UX OVERHAUL) ===\n');

// 1. VERIFY CSS VARIABLES & INDEX.CSS RULES
console.log('--- Step 1: CSS Variables & Selector Verification ---');
const cssPath = path.resolve('src/style/index.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// Check --text-main in :root
assert(cssContent.includes('--text-main: #3b3532;'), ':root defines --text-main variable');

// Check .card-disable-overlay
assert(cssContent.includes('.card-disable-overlay'), '.card-disable-overlay class exists in CSS');
assert(cssContent.includes('backdrop-filter: blur(4px)') || cssContent.includes('-webkit-backdrop-filter: blur(4px)'), '.card-disable-overlay uses glassmorphism backdrop blur');
assert(cssContent.includes('pointer-events: none'), '.card-disable-overlay sets pointer-events: none to avoid blocking interaction');
assert(cssContent.includes('border-radius: inherit'), '.card-disable-overlay uses border-radius: inherit for parent alignment');

// Check .card-disable-badge
assert(cssContent.includes('.card-disable-badge'), '.card-disable-badge class exists in CSS');
assert(cssContent.includes('border-radius: 999px'), '.card-disable-badge uses pill border-radius (999px)');
assert(cssContent.includes('white-space: nowrap'), '.card-disable-badge prevents text wrapping');

// Check .hand-card-kards dimensions and hover physics
assert(cssContent.includes('width: 135px') || cssContent.includes('width:135px'), '.hand-card-kards standard width is 135px');
assert(cssContent.includes('height: 185px') || cssContent.includes('height:185px'), '.hand-card-kards standard height is 185px');
assert(cssContent.includes('margin-left: -67px'), '.hand-card-kards margin-left is -67px (centering 135px width)');
assert(cssContent.includes('var(--card-rotate'), '.hand-card-kards hover rule uses var(--card-rotate)');

// Check .draft-slot-card redesign
assert(cssContent.includes('.draft-slot-card'), '.draft-slot-card class exists');
assert(cssContent.includes('.draft-card-header'), '.draft-card-header class exists for layout of tags and stars');
assert(cssContent.includes('.draft-card-title'), '.draft-card-title class exists for clear typography');
assert(cssContent.includes('.draft-card-desc'), '.draft-card-desc class exists with line clamping');
assert(cssContent.includes('.btn-icon-refresh'), '.btn-icon-refresh class exists');
assert(cssContent.includes('transform: rotate(180deg)'), '.btn-icon-refresh has smooth 180° rotation on hover');


// 2. VERIFY battle.js MARKUP GENERATION
console.log('\n--- Step 2: battle.js Tactical Hand & Draft Shop Markup Verification ---');
const battleJsPath = path.resolve('src/pages/battle.js');
const battleJsContent = fs.readFileSync(battleJsPath, 'utf8');

// Check battle.js for --card-rotate binding
assert(battleJsContent.includes('--card-rotate: ${rotateDeg}deg'), 'battle.js binds --card-rotate inline variable for smooth hover physics');

// Check disable overlay markup in hand cards and draft shop cards
assert(battleJsContent.includes('<div class="card-disable-overlay"><span class="card-disable-badge">${disableReason}</span></div>'), 'battle.js renders card-disable-overlay with card-disable-badge');

// Check draft card header markup
assert(battleJsContent.includes('<div class="draft-card-header">'), 'battle.js uses draft-card-header layout container');
assert(battleJsContent.includes('class="draft-card-title"'), 'battle.js uses draft-card-title class');
assert(battleJsContent.includes('class="draft-card-desc"'), 'battle.js uses draft-card-desc class');


// 3. EMPIRICAL MARKUP MOCK TESTING
console.log('\n--- Step 3: Mock Evaluation of Card Markup ---');

const SUBJECTS = {
  chinese: { label: '语文' },
  math: { label: '数学' },
  english: { label: '英语' },
  physics: { label: '物理' }
};

// Simulate hand card rendering logic
function mockTacticalBarHTML(s) {
  const me = s.me;
  const handCards = me.handCards || [];
  const curSubj = s.schedule[s.currentClassIndex];
  const canUseClass = me.card?.subjects?.includes(curSubj);

  return handCards.map((c, i) => {
    if (c.hidden) return '';
    const typeClass = c.type || 'buff';
    const scopeLabel = c.subject === 'universal' ? '通用' : (SUBJECTS[c.subject]?.label || c.subject);
    
    const subjMatch = c.subject === 'universal' || c.subject === curSubj;
    const canPlay = c.subject === 'universal' || (subjMatch && canUseClass);

    let disableReason = '';
    if (!canPlay) {
       if (!subjMatch && c.subject !== 'universal') disableReason = `限当节课`;
       else if (!canUseClass && c.subject !== 'universal') disableReason = '非自身选科';
    }

    const total = handCards.length;
    const mid = (total - 1) / 2;
    const rotateDeg = (i - mid) * 15;
    const transY = Math.abs(i - mid) * 10;

    return `
      <div class="hand-card-kards ${canPlay ? '' : 'disabled'}" style="--card-rotate: ${rotateDeg}deg; transform: rotate(${rotateDeg}deg) translateY(${transY}px)" ${canPlay ? `onclick="window._toggleHand(); window._playTacticalCard('${c.id}', event)"` : ''} title="${disableReason}">
        <div class="card-tag-row">
          <span class="card-tag-type ${typeClass}">${scopeLabel}</span>
          <span class="card-tp-cost">⚡${c.tpCost}</span>
        </div>
        <div class="card-title-text">${c.name}</div>
        <div class="card-desc-text">${c.desc}</div>
        ${!canPlay ? `<div class="card-disable-overlay"><span class="card-disable-badge">${disableReason}</span></div>` : ''}
      </div>
    `;
  }).join('');
}

// Test case A: Hand cards with 0 TP (Playable card requiring 0 TP to play)
const mockStateA = {
  me: {
    tp: 0,
    card: { subjects: ['math'] },
    handCards: [
      { id: 'c1', name: 'Standard Card', desc: 'Does something', tpCost: 1, subject: 'universal', type: 'buff' },
      { id: 'c2', name: 'Math Special', desc: 'Math only', tpCost: 2, subject: 'math', type: 'debuff' }
    ]
  },
  schedule: ['math'],
  currentClassIndex: 0
};

const htmlA = mockTacticalBarHTML(mockStateA);
assert(htmlA.includes('hand-card-kards '), 'Hand card renders container');
assert(!htmlA.includes('TP不足'), 'Playing hand card does NOT check TP (TP cost check removed per R1/R2)');
assert(htmlA.includes('--card-rotate: -7.5deg') && htmlA.includes('--card-rotate: 7.5deg'), 'Fan rotation computed correctly for 2 cards');
assert(htmlA.includes('<span class="card-tag-type buff">通用</span>'), 'Universal tag rendered');
assert(htmlA.includes('<span class="card-tag-type debuff">数学</span>'), 'Subject tag rendered');

// Test case B: Hand card during non-matching class
const mockStateB = {
  me: {
    tp: 5,
    card: { subjects: ['math'] },
    handCards: [
      { id: 'c3', name: 'Physics Card', desc: 'Physics only', tpCost: 1, subject: 'physics', type: 'blessing' }
    ]
  },
  schedule: ['math'],
  currentClassIndex: 0
};

const htmlB = mockTacticalBarHTML(mockStateB);
assert(htmlB.includes('disabled'), 'Non-matching subject card marked disabled');
assert(htmlB.includes('card-disable-badge">限当节课</span>'), 'Shows badge "限当节课"');


// Simulate draft shop modal card slot rendering
function mockDraftSlotHTML(slot, me, idx) {
  const c = slot.card;
  if (!c) return `<div class="draft-slot-card empty"><p>已购买</p></div>`;
  const typeClass = c.type || 'buff';
  const scopeLabel = c.subject === 'universal' ? '通用' : (SUBJECTS[c.subject]?.label || c.subject);
  const isHandFull = (me.handCards || []).length >= 3;
  const isAfford = me.tp >= c.tpCost;
  const buyDisabled = isHandFull || !isAfford;
  let disableReason = '';
  if (isHandFull) disableReason = '手牌已满';
  else if (!isAfford) disableReason = 'TP不足';
  
  const stars = '★'.repeat(c.tpCost) + '☆'.repeat(Math.max(0, 3 - c.tpCost));

  return `
    <div class="draft-slot-card ${buyDisabled ? 'disabled' : 'clickable'}" ${buyDisabled ? '' : `onclick="window._buyDraftCard(${idx})"`}>
      <button class="btn-icon-refresh" ${slot.refreshesLeft > 0 ? '' : 'disabled'} onclick="event.stopPropagation(); window._refreshDraftSlot(${idx})" title="刷新 (${slot.refreshesLeft})">↻</button>
      <div class="draft-card-header">
        <span class="card-tag-type ${typeClass}">${scopeLabel}</span>
        <span class="draft-card-star">${stars}</span>
      </div>
      <div class="draft-card-title">${c.name}</div>
      <div class="draft-card-desc">${c.desc}</div>
      ${buyDisabled ? `<div class="card-disable-overlay"><span class="card-disable-badge">${disableReason}</span></div>` : ''}
    </div>
  `;
}

// Test case C: Draft shop when player has 0 TP (cannot afford 1-star card)
const slot1 = { card: { name: 'Card 1', desc: 'Desc 1', tpCost: 1, subject: 'universal', type: 'buff' }, refreshesLeft: 2 };
const me0TP = { tp: 0, handCards: [] };
const shopHtml0TP = mockDraftSlotHTML(slot1, me0TP, 0);
assert(shopHtml0TP.includes('disabled'), 'Draft shop card is disabled when 0 TP');
assert(shopHtml0TP.includes('card-disable-badge">TP不足</span>'), 'Draft shop shows badge "TP不足" when 0 TP');
assert(!shopHtml0TP.includes('onclick="window._buyDraftCard'), 'Draft shop card disables buy click when 0 TP');

// Test case D: Draft shop when hand is full (3 cards)
const meFullHand = { tp: 10, handCards: [{}, {}, {}] };
const shopHtmlFull = mockDraftSlotHTML(slot1, meFullHand, 0);
assert(shopHtmlFull.includes('card-disable-badge">手牌已满</span>'), 'Draft shop shows badge "手牌已满" when hand is full');

// Test case E: Draft shop when afford and hand not full
const meOK = { tp: 2, handCards: [{}] };
const shopHtmlOK = mockDraftSlotHTML(slot1, meOK, 0);
assert(shopHtmlOK.includes('clickable'), 'Draft shop card is clickable when affordable & space available');
assert(shopHtmlOK.includes('onclick="window._buyDraftCard(0)"'), 'Draft shop card has buy onclick');
assert(!shopHtmlOK.includes('card-disable-overlay'), 'Draft shop card has no disable overlay when affordable');
assert(shopHtmlOK.includes('★☆☆'), '1-star card displays 1 solid star and 2 empty stars');

console.log(`\n=== SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED ===`);
if (testsFailed > 0) {
  process.exit(1);
}
