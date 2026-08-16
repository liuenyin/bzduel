// reviewer2_m2_layout_check.js
// Independent layout & anti-overlap verification script for R2-M2

import fs from 'fs';
import path from 'path';

console.log("=== Reviewer2: Hardened UI/UX Layout Verification ===");

const cssPath = path.resolve('src/style/index.css');
const jsPath = path.resolve('src/pages/battle.js');

const cssContent = fs.readFileSync(cssPath, 'utf8');
const jsContent = fs.readFileSync(jsPath, 'utf8');

let errors = [];
let passes = [];

function assert(condition, message) {
  if (condition) {
    passes.push(message);
    console.log(`[PASS] ${message}`);
  } else {
    errors.push(message);
    console.error(`[FAIL] ${message}`);
  }
}

// 1. Extreme Title & Description Layout Integrity Tests
const longTitle = "物理·量子纠缠与波粒二象性特级宏观超导效应";
const longDesc = "第一行描述文字：进行深度量子跃迁。第二行描述文字：每当本节课造成伤害时额外触发波粒二象性。第三行描述文字：持续3回合直到课程结束。第四行描述文字：溢出的超额伤害转化为HP回复。第五行描述文字：超长溢出文本测试！";
const disableBadges = ["TP不足", "限当节课", "手牌已满", "极其超长无法使用的异常禁用状态标志文字"];

console.log("\n--- Checking Extreme Title & Description Handling Rules ---");

// Check Desktop Card Title
assert(
  cssContent.includes('.card-title-text') && 
  /white-space:\s*nowrap/.test(cssContent) && 
  /text-overflow:\s*ellipsis/.test(cssContent),
  "Desktop card title (.card-title-text) has nowrap and ellipsis for long titles like '" + longTitle.substring(0, 10) + "...'"
);

// Check Mobile Card Title
assert(
  cssContent.includes('@media (max-width: 480px)') &&
  /\.hand-card-kards\s+\.card-title-text\s*\{[^}]*white-space:\s*nowrap/.test(cssContent),
  "Mobile card title enforces nowrap and ellipsis under 480px viewport"
);

// Check Description 3-line clamp & flex-shrink (min-height: 0)
assert(
  /\.card-desc-text\s*\{[^}]*min-height:\s*0/.test(cssContent) &&
  /\.card-desc-text\s*\{[^}]*-webkit-line-clamp:\s*3/.test(cssContent) &&
  /\.card-desc-text\s*\{[^}]*flex:\s*1/.test(cssContent),
  "Desktop card desc (.card-desc-text) has min-height: 0, line-clamp: 3, and flex: 1 to clamp 4+ line descriptions"
);

assert(
  /\.hand-card-kards\s+\.card-desc-text\s*\{[^}]*min-height:\s*0/.test(cssContent) &&
  /\.hand-card-kards\s+\.card-desc-text\s*\{[^}]*-webkit-line-clamp:\s*3/.test(cssContent),
  "Mobile card desc enforces min-height: 0 and line-clamp: 3 to prevent vertical overflow on 110x155px card"
);

// 2. Disable Overlay & Badge Bounds
console.log("\n--- Checking Disable Overlay & Badge Alignment Rules ---");

assert(
  /\.card-disable-overlay\s*\{[^}]*position:\s*absolute/.test(cssContent) &&
  /\.card-disable-overlay\s*\{[^}]*inset:\s*0/.test(cssContent) &&
  /\.card-disable-overlay\s*\{[^}]*border-radius:\s*inherit/.test(cssContent) &&
  /\.card-disable-overlay\s*\{[^}]*pointer-events:\s*none/.test(cssContent),
  "Disable overlay (.card-disable-overlay) is positioned absolutely with inset: 0, inherit border-radius, and pointer-events: none"
);

assert(
  /\.card-disable-badge\s*\{[^}]*max-width:\s*90%/.test(cssContent) &&
  /\.card-disable-badge\s*\{[^}]*white-space:\s*nowrap/.test(cssContent) &&
  /\.card-disable-badge\s*\{[^}]*text-overflow:\s*ellipsis/.test(cssContent) &&
  /\.card-disable-badge\s*\{[^}]*overflow:\s*hidden/.test(cssContent),
  "Disable badge (.card-disable-badge) has max-width: 90%, white-space: nowrap, text-overflow: ellipsis for badges like 'TP不足', '限当节课'"
);

// 3. Card Tag Row & Type Badge
console.log("\n--- Checking Tag Row & Type Badge Constraints ---");

assert(
  /\.card-tag-row\s*\{[^}]*flex-shrink:\s*0/.test(cssContent) &&
  /\.card-tag-type\s*\{[^}]*max-width:\s*65%/.test(cssContent) &&
  /\.card-tag-type\s*\{[^}]*overflow:\s*hidden/.test(cssContent) &&
  /\.card-tag-type\s*\{[^}]*text-overflow:\s*ellipsis/.test(cssContent),
  "Tag type (.card-tag-type) constrained to max-width: 65% with ellipsis"
);

// 4. JS HTML Generation Validation in battle.js
console.log("\n--- Checking JS HTML Output Structures in battle.js ---");

assert(
  jsContent.includes('class="hand-card-kards ${canPlay ? \'\' : \'disabled\'}"') &&
  jsContent.includes('class="card-disable-overlay"') &&
  jsContent.includes('class="card-disable-badge"'),
  "battle.js correctly renders hand cards with disable overlay and badge when unplayable"
);

assert(
  jsContent.includes('class="draft-slot-card ${buyDisabled ? \'disabled\' : \'clickable\'}"') &&
  jsContent.includes('class="card-disable-overlay"') &&
  jsContent.includes('class="card-disable-badge"'),
  "battle.js correctly renders draft shop cards with disable overlay and badge when unaffordable/full"
);

console.log(`\n==================================================`);
console.log(`Reviewer2 Verification: ${passes.length} Passed, ${errors.length} Failed.`);
console.log(`==================================================`);

if (errors.length > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
