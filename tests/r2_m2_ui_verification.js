import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = ['src/style/tactical.css', 'src/style/battle-interaction.css', 'src/style/effects.css', 'src/style/card-details.css']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const handSource = fs.readFileSync(path.join(root, 'src/pages/battle/arena.js'), 'utf8');
const draftSource = fs.readFileSync(path.join(root, 'src/pages/battle/draft-shop.js'), 'utf8');

let passed = 0;
let failed = 0;
function check(condition, message) {
  if (condition) { console.log(`[PASS] ${message}`); passed++; }
  else { console.error(`[FAIL] ${message}`); failed++; }
}
function declaration(selector, property, value) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escapedSelector}[^{}]*\\{[^{}]*${property}\\s*:\\s*${escapedValue}`, 'i').test(css);
}

console.log('=== Current battle card layout verification ===\n');
check(declaration('.hand-card-kards', 'display', 'flex'), 'hand cards use flex layout');
check(declaration('.hand-card-kards', 'flex-direction', 'column'), 'hand cards use a vertical flex column');
check(declaration('.hand-card-kards', 'overflow', 'hidden'), 'hand cards clip overflowing content');
check(declaration('.draft-slot-card', 'display', 'flex'), 'draft cards use flex layout');
check(declaration('.draft-slot-card', 'flex-direction', 'column'), 'draft cards use a vertical flex column');
check(declaration('.draft-slot-card', 'overflow', 'hidden'), 'draft cards clip overflowing content');
check(declaration('.card-title-text', 'white-space', 'nowrap'), 'hand titles stay on one line');
check(declaration('.card-title-text', 'text-overflow', 'ellipsis'), 'hand titles use ellipsis');
check(declaration('.card-title-text', 'overflow', 'hidden'), 'hand titles clip overflow');
check(declaration('.draft-card-title', 'white-space', 'nowrap'), 'draft titles stay on one line');
check(declaration('.draft-card-title', 'text-overflow', 'ellipsis'), 'draft titles use ellipsis');
check(declaration('.draft-card-title', 'overflow', 'hidden'), 'draft titles clip overflow');
check(declaration('.card-desc-text', 'min-height', '0'), 'hand descriptions can shrink');
check(declaration('.card-desc-text', '-webkit-line-clamp', '3'), 'hand descriptions clamp to three lines');
check(declaration('.card-desc-text', 'flex', '1'), 'hand descriptions fill remaining card space');
check(declaration('.draft-card-desc', 'min-height', '0'), 'draft descriptions can shrink');
check(declaration('.draft-card-desc', '-webkit-line-clamp', '3'), 'draft descriptions clamp to three lines');
check(declaration('.draft-card-desc', 'flex', '1'), 'draft descriptions fill remaining card space');
check(declaration('.card-tag-row', 'flex-shrink', '0'), 'card tag rows never collapse');
check(declaration('.card-tag-type', 'overflow', 'hidden'), 'card type tags clip overflow');
check(declaration('.card-tag-type', 'text-overflow', 'ellipsis'), 'card type tags use ellipsis');
check(declaration('.card-tag-type', 'white-space', 'nowrap'), 'card type tags stay on one line');
check(declaration('.card-disable-overlay', 'position', 'absolute'), 'disabled overlay is positioned over its card');
check(declaration('.card-disable-overlay', 'inset', '0'), 'disabled overlay covers the full card');
check(declaration('.card-disable-overlay', 'pointer-events', 'none'), 'disabled overlay does not steal events');
check(declaration('.card-disable-badge', 'max-width', '90%'), 'disabled badge stays inside the card');
check(declaration('.card-disable-badge', 'text-overflow', 'ellipsis'), 'disabled badge truncates cleanly');
check(/@media\s*\(max-width:\s*680px\)/i.test(css), 'mobile card layout has a narrow viewport override');
check(/\.hand-card-kards\.disabled[^{}]*,?[^{}]*\.hand-card-kards:disabled/i.test(css), 'disabled hand cards have a readable state');
check(handSource.includes('class="hand-card-kards') && handSource.includes('class="card-title-text"'), 'battle arena renders hand card titles');
check(handSource.includes('class="card-desc-text"'), 'battle arena renders hand card descriptions');
check(handSource.includes('class="card-disable-overlay"') && handSource.includes('class="card-disable-badge"'), 'battle arena renders disabled-card explanation overlays');
check(handSource.includes('cardDetailsButton') && handSource.includes("'hand'"), 'battle arena exposes full card explanation inspection');
check(draftSource.includes('class="draft-slot-card') && draftSource.includes('class="draft-card-title"'), 'draft shop renders supply card titles');
check(draftSource.includes('class="card-disable-overlay"') && draftSource.includes('class="card-disable-badge"'), 'draft shop renders disabled-card explanation overlays');
check(draftSource.includes('data-battle-action="buyDraftCard"'), 'draft shop uses delegated buy actions');
check(draftSource.includes('cardDetailsButton') && draftSource.includes("'draft'"), 'draft shop exposes full card explanation inspection');
check(css.includes('.card-details-dialog') && css.includes('.card-details-button'), 'full card explanation dialog has dedicated responsive styles');
check(/\.card-details-dialog[^{}]*\{[^{}]*transition\s*:/i.test(css), 'card explanation dialog has a restrained entrance transition');
check(/prefers-reduced-motion[^{}]*\{[^{}]*\.card-details-dialog/i.test(css), 'card explanation dialog respects reduced-motion preferences');

console.log(`\nVerification complete: ${passed} passed, ${failed} failed.`);
process.exitCode = failed ? 1 : 0;
