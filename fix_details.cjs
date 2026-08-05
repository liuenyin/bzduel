const fs = require('fs');
let code = fs.readFileSync('src/pages/battle.js', 'utf8');

// Remove misplaced </details>
code = code.replace(/<\/div>\s*<\/details>` : ''\}/g, "</div>` : ''}");

// Add correct </details> after the </div> of .skill-desc-box
// We have two instances of skill-desc-box (op and me)
// The structure is:
//               </div>
//               <div class="bc-buffs" id="buffs-op">${buffIcons(op)}</div>

code = code.replace(/              <\/div>\n              <div class="bc-buffs"/g, 
`              </div>
              </details>
              <div class="bc-buffs"`);

fs.writeFileSync('src/pages/battle.js', code);
console.log('Fixed details tags in battle.js');
