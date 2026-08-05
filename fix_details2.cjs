const fs = require('fs');
let code = fs.readFileSync('src/pages/battle.js', 'utf8');

code = code.replace(/<\/div>\s*<div class="bc-buffs"/g, `</div>\n              </details>\n              <div class="bc-buffs"`);

fs.writeFileSync('src/pages/battle.js', code);
console.log('Fixed details tags properly in battle.js');
