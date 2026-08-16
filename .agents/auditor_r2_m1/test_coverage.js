import fs from 'fs';
import { CARDS } from '../../shared/cards.js';

const engineCode = fs.readFileSync('server/game/engine.js', 'utf8');

console.log('Total cards in CARDS:', CARDS.length);

const handled = [];
const unhandled = [];

CARDS.forEach(c => {
  if (engineCode.includes(c.id)) {
    handled.push(c);
  } else {
    unhandled.push(c);
  }
});

console.log(`Handled count: ${handled.length}`);
console.log(`Unhandled count: ${unhandled.length}`);
if (unhandled.length > 0) {
  console.log('Unhandled cards:', unhandled.map(c => `${c.id} (${c.name}: ${c.desc})`));
}
