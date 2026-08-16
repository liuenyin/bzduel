import fs from 'fs';
import { CARDS } from '../../shared/cards.js';

const engineCode = fs.readFileSync('server/game/engine.js', 'utf8');
const lines = engineCode.split('\n');

CARDS.forEach(c => {
  console.log(`=== Card: ${c.id} | ${c.name} | ${c.subject} | Cost:${c.tpCost} ===`);
  console.log(`Desc: ${c.desc}`);
  const matches = [];
  lines.forEach((line, idx) => {
    if (line.includes(c.id)) {
      matches.push({ lineNum: idx + 1, content: line.trim() });
    }
  });
  matches.forEach(m => {
    console.log(`  Line ${m.lineNum}: ${m.content}`);
  });
  console.log('');
});
