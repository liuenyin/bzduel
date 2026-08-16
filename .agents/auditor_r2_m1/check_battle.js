import fs from 'fs';
const battleCode = fs.readFileSync('src/pages/battle.js', 'utf8');
const lines = battleCode.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('canPlay') || line.includes('canUseClass') || line.includes('tpCost') || line.includes('tp')) {
    console.log(`Line ${idx+1}: ${line.trim()}`);
  }
});
