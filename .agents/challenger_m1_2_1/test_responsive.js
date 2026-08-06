import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');

console.log('=== Running Empirical Verification for challenger_m1_2_1 ===');

let passCount = 0;
let failCount = 0;

function assert(condition, description) {
  if (condition) {
    console.log(`[PASS] ${description}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${description}`);
    failCount++;
  }
}

// 1. CSS Rule Ordering in src/style/index.css
const cssPath = path.join(rootDir, 'src/style/index.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

const baseFabMatch = cssContent.match(/\.hand-fab-container\s*\{[^}]*\}/g);
const baseFabIndex = cssContent.indexOf('.hand-fab-container {');
const lastMedia680Index = cssContent.lastIndexOf('@media (max-width: 680px)');
const mediaFabIndex = cssContent.lastIndexOf('.hand-fab-container');

assert(baseFabIndex !== -1, 'Base .hand-fab-container rule found');
assert(lastMedia680Index !== -1, '@media (max-width: 680px) rule found');
assert(mediaFabIndex > baseFabIndex, 'Mobile @media override for .hand-fab-container appears AFTER base selector');
assert(lastMedia680Index > baseFabIndex, '@media (max-width: 680px) is placed after base rules');

// Check contents of media override
const mediaBlock = cssContent.slice(lastMedia680Index);
assert(mediaBlock.includes('bottom: 58px;') || mediaBlock.includes('bottom:58px;'), '.hand-fab-container on mobile has bottom: 58px');
assert(mediaBlock.includes('right: 16px;') || mediaBlock.includes('right:16px;'), '.hand-fab-container on mobile has right: 16px');
assert(mediaBlock.includes('z-index: 9000;') || mediaBlock.includes('z-index:9000;'), '.hand-fab-container on mobile has z-index: 9000');

// 2. Zero Horizontal Overflow Rules
assert(/html\s*,\s*body\s*\{[^}]*overflow-x:\s*hidden/.test(cssContent), 'html, body has overflow-x: hidden');
assert(/\.panel\s*\{[^}]*min-width:\s*0/.test(cssContent) && /\.panel\s*\{[^}]*max-width:\s*100%/.test(cssContent), '.panel has min-width: 0 and max-width: 100%');
assert(/\.arena-center\s*\{[^}]*min-width:\s*0/.test(cssContent) && /\.arena-center\s*\{[^}]*max-width:\s*100%/.test(cssContent), '.arena-center has min-width: 0 and max-width: 100%');
assert(/\.stats-modal\s*\{[^}]*min-width:\s*0/.test(cssContent) && /\.stats-modal\s*\{[^}]*max-width:\s*100%/.test(cssContent), '.stats-modal has min-width: 0 and max-width: 100%');
assert(/\.stats-matrix-wrap\s*\{[^}]*min-width:\s*0/.test(cssContent) && /\.stats-matrix-wrap\s*\{[^}]*max-width:\s*100%/.test(cssContent), '.stats-matrix-wrap has min-width: 0 and max-width: 100%');

// 3. Lobby Modal Inline Styles
const lobbyPath = path.join(rootDir, 'src/pages/lobby.js');
const lobbyContent = fs.readFileSync(lobbyPath, 'utf8');

const statsModalLine = lobbyContent.split('\n').find(line => line.includes('id="stats-modal"'));
assert(statsModalLine !== undefined, '#stats-modal found in lobby.js');
assert(!statsModalLine.includes('background:rgba(0,0,0,0.6)'), '#stats-modal does not have dark inline background');
assert(!statsModalLine.includes('box-shadow:0 10px 30px rgba(0,0,0,0.5)'), '#stats-modal does not have dark inline box shadow');
assert(statsModalLine.includes('class="modal-overlay stats-modal"'), '#stats-modal uses modal-overlay class');

// 4. Draft Shop Panel color rule
const draftShopMatch = cssContent.match(/\.draft-shop-panel\s*\{[^}]*\}/);
assert(draftShopMatch && (draftShopMatch[0].includes('color:var(--text)') || draftShopMatch[0].includes('color: var(--text)')), '.draft-shop-panel uses color: var(--text)');

console.log(`\nResults: ${passCount} PASSED, ${failCount} FAILED.`);
if (failCount > 0) {
  process.exit(1);
}
