const fs = require('fs');
let code = fs.readFileSync('src/pages/battle.js', 'utf8');
code = code.replace(/const isYzx = p\.cardId === 'char_10' && \!isMe;/g, "const isYzx = (p.cardId === 'char_10' || p.stealth) && !isMe;");
code = code.replace(/const isYzx = v === -1;/g, 'const isYzx = v === -1 || p.stealth;');
fs.writeFileSync('src/pages/battle.js', code);
