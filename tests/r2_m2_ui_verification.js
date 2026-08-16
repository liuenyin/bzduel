import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Starting Milestone R2-M2 UI/UX Layout Verification ===\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${message}`);
    failCount++;
  }
}

const cssPath = path.join(__dirname, '../src/style/index.css');
const battleJsPath = path.join(__dirname, '../src/pages/battle.js');

const cssContent = fs.readFileSync(cssPath, 'utf-8');
const battleJsContent = fs.readFileSync(battleJsPath, 'utf-8');

// Helper to extract CSS rules for a selector or block
function hasCSSRule(css, selectorPattern, propertyPattern) {
  const regex = new RegExp(selectorPattern + '\\s*\\{[^\\}]*' + propertyPattern + '[^\\}]*\\}', 'i');
  return regex.test(css);
}

// Section 1: Container layout rules
console.log('--- Test 1: Container Flex Architecture ---');
assert(
  /\.hand-card-kards\s*\{[^}]*justify-content:\s*flex-start/i.test(cssContent),
  '.hand-card-kards uses justify-content: flex-start'
);
assert(
  /\.hand-card-kards\s*\{[^}]*gap:\s*3px/i.test(cssContent),
  '.hand-card-kards sets gap: 3px'
);
assert(
  /\.hand-card-kards\s*\{[^}]*overflow:\s*hidden/i.test(cssContent),
  '.hand-card-kards sets overflow: hidden'
);
assert(
  /\.draft-slot-card\s*\{[^}]*justify-content:\s*flex-start/i.test(cssContent),
  '.draft-slot-card uses justify-content: flex-start'
);
assert(
  /\.draft-slot-card\s*\{[^}]*gap:\s*3px/i.test(cssContent),
  '.draft-slot-card sets gap: 3px'
);

// Section 2: Single-Line Title Truncation
console.log('\n--- Test 2: Card Title Single-Line Truncation ---');
assert(
  /\.card-title-text\s*\{[^}]*white-space:\s*nowrap/i.test(cssContent),
  '.card-title-text sets white-space: nowrap'
);
assert(
  /\.card-title-text\s*\{[^}]*overflow:\s*hidden/i.test(cssContent),
  '.card-title-text sets overflow: hidden'
);
assert(
  /\.card-title-text\s*\{[^}]*text-overflow:\s*ellipsis/i.test(cssContent),
  '.card-title-text sets text-overflow: ellipsis'
);
assert(
  /\.card-title-text\s*\{[^}]*flex-shrink:\s*0/i.test(cssContent),
  '.card-title-text sets flex-shrink: 0'
);
assert(
  /\.draft-card-title\s*\{[^}]*white-space:\s*nowrap/i.test(cssContent),
  '.draft-card-title sets white-space: nowrap'
);
assert(
  /\.draft-card-title\s*\{[^}]*overflow:\s*hidden/i.test(cssContent),
  '.draft-card-title sets overflow: hidden'
);
assert(
  /\.draft-card-title\s*\{[^}]*text-overflow:\s*ellipsis/i.test(cssContent),
  '.draft-card-title sets text-overflow: ellipsis'
);
assert(
  /\.draft-card-title\s*\{[^}]*flex-shrink:\s*0/i.test(cssContent),
  '.draft-card-title sets flex-shrink: 0'
);

// Section 3: Description Flex Shrink & Line-Clamping
console.log('\n--- Test 3: Card Description Flex Shrink & Clamping ---');
assert(
  /\.card-desc-text\s*\{[^}]*min-height:\s*0/i.test(cssContent),
  '.card-desc-text sets min-height: 0'
);
assert(
  /\.card-desc-text\s*\{[^}]*-webkit-line-clamp:\s*3/i.test(cssContent),
  '.card-desc-text sets -webkit-line-clamp: 3'
);
assert(
  /\.card-desc-text\s*\{[^}]*flex:\s*1/i.test(cssContent),
  '.card-desc-text sets flex: 1'
);
assert(
  /\.draft-card-desc\s*\{[^}]*min-height:\s*0/i.test(cssContent),
  '.draft-card-desc sets min-height: 0'
);
assert(
  /\.draft-card-desc\s*\{[^}]*-webkit-line-clamp:\s*3/i.test(cssContent),
  '.draft-card-desc sets -webkit-line-clamp: 3'
);
assert(
  /\.draft-card-desc\s*\{[^}]*flex:\s*1/i.test(cssContent),
  '.draft-card-desc sets flex: 1'
);

// Section 4: Tag Row & Badge Constraints
console.log('\n--- Test 4: Tag Row & Badge Constraints ---');
assert(
  /\.card-tag-row\s*\{[^}]*flex-shrink:\s*0/i.test(cssContent),
  '.card-tag-row sets flex-shrink: 0'
);
assert(
  /\.card-tag-type\s*\{[^}]*max-width:\s*65%/i.test(cssContent),
  '.card-tag-type sets max-width: 65%'
);
assert(
  /\.card-tag-type\s*\{[^}]*overflow:\s*hidden/i.test(cssContent),
  '.card-tag-type sets overflow: hidden'
);
assert(
  /\.card-tag-type\s*\{[^}]*text-overflow:\s*ellipsis/i.test(cssContent),
  '.card-tag-type sets text-overflow: ellipsis'
);
assert(
  /\.card-tag-type\s*\{[^}]*flex-shrink:\s*1/i.test(cssContent),
  '.card-tag-type sets flex-shrink: 1'
);

// Section 5: Disable Overlay Perfect Alignment
console.log('\n--- Test 5: Disable Overlay Perfect Alignment ---');
assert(
  /\.card-disable-overlay\s*\{[^}]*position:\s*absolute/i.test(cssContent),
  '.card-disable-overlay sets position: absolute'
);
assert(
  /\.card-disable-overlay\s*\{[^}]*inset:\s*0/i.test(cssContent),
  '.card-disable-overlay sets inset: 0'
);
assert(
  /\.card-disable-overlay\s*\{[^}]*border-radius:\s*inherit/i.test(cssContent),
  '.card-disable-overlay sets border-radius: inherit'
);
assert(
  /\.card-disable-overlay\s*\{[^}]*pointer-events:\s*none/i.test(cssContent),
  '.card-disable-overlay sets pointer-events: none'
);
assert(
  /\.card-disable-overlay\s*\{[^}]*z-index:\s*10/i.test(cssContent),
  '.card-disable-overlay sets z-index: 10'
);
assert(
  /\.card-disable-badge\s*\{[^}]*max-width:\s*90%/i.test(cssContent),
  '.card-disable-badge sets max-width: 90%'
);
assert(
  /\.card-disable-badge\s*\{[^}]*overflow:\s*hidden/i.test(cssContent),
  '.card-disable-badge sets overflow: hidden'
);
assert(
  /\.card-disable-badge\s*\{[^}]*text-overflow:\s*ellipsis/i.test(cssContent),
  '.card-disable-badge sets text-overflow: ellipsis'
);
assert(
  /\.card-disable-badge\s*\{[^}]*white-space:\s*nowrap/i.test(cssContent),
  '.card-disable-badge sets white-space: nowrap'
);

// Section 6: Mobile Breakpoint Hardening (@media (max-width: 480px))
console.log('\n--- Test 6: Mobile Breakpoint Hardening (@media (max-width: 480px)) ---');
function extractMediaBlock(css, query) {
  let searchPos = 0;
  let blocks = [];
  while (true) {
    const startIndex = css.indexOf(query, searchPos);
    if (startIndex === -1) break;
    const openBrace = css.indexOf('{', startIndex);
    if (openBrace === -1) break;
    let depth = 1;
    let curr = openBrace + 1;
    while (curr < css.length && depth > 0) {
      if (css[curr] === '{') depth++;
      else if (css[curr] === '}') depth--;
      curr++;
    }
    blocks.push(css.substring(openBrace + 1, curr - 1));
    searchPos = curr;
  }
  return blocks.length > 0 ? blocks.join('\n') : null;
}

const mobileCss = extractMediaBlock(cssContent, '@media (max-width: 480px)');
assert(mobileCss !== null, '@media (max-width: 480px) block exists in CSS');

if (mobileCss) {
  assert(
    /\.hand-card-kards\s*\.card-title-text\s*\{[^}]*white-space:\s*nowrap/i.test(mobileCss),
    'Mobile card title enforces white-space: nowrap'
  );
  assert(
    /\.hand-card-kards\s*\.card-title-text\s*\{[^}]*text-overflow:\s*ellipsis/i.test(mobileCss),
    'Mobile card title enforces text-overflow: ellipsis'
  );
  assert(
    /\.hand-card-kards\s*\.card-desc-text\s*\{[^}]*min-height:\s*0/i.test(mobileCss),
    'Mobile card desc enforces min-height: 0'
  );
  assert(
    /\.hand-card-kards\s*\.card-desc-text\s*\{[^}]*-webkit-line-clamp:\s*3/i.test(mobileCss),
    'Mobile card desc enforces -webkit-line-clamp: 3'
  );
}

// Section 7: HTML Rendering Structure in battle.js
console.log('\n--- Test 7: HTML Rendering Structure in battle.js ---');
assert(
  battleJsContent.includes('class="hand-card-kards') && battleJsContent.includes('class="card-title-text"'),
  'battle.js renders hand cards with .hand-card-kards and .card-title-text'
);
assert(
  battleJsContent.includes('class="card-desc-text"'),
  'battle.js renders hand cards with .card-desc-text'
);
assert(
  battleJsContent.includes('class="card-disable-overlay"'),
  'battle.js renders .card-disable-overlay for disabled cards'
);
assert(
  battleJsContent.includes('class="card-disable-badge"'),
  'battle.js renders .card-disable-badge inside disable overlay'
);
assert(
  battleJsContent.includes('class="draft-slot-card') && battleJsContent.includes('class="draft-card-title"'),
  'battle.js renders draft shop slots with .draft-slot-card and .draft-card-title'
);

console.log('\n==================================================');
console.log(`Verification Complete: ${passCount} Passed, ${failCount} Failed.`);
console.log('==================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
