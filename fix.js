const fs = require('fs');
let c = fs.readFileSync('src/pages/lobby.js', 'utf8');
c = c.replace(/\\\/g, '\');
fs.writeFileSync('src/pages/lobby.js', c);
console.log('Fixed');
