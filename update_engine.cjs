const fs = require('fs');

let code = fs.readFileSync('server/game/engine.js', 'utf8');

// 1. Add instant card effects
code = code.replace(/case 'card_gen_10':/g, 
`case 'card_gen_11':
        if (p.handCards && p.handCards.length > 0) {
          p.handCards.splice(Math.floor(Math.random() * p.handCards.length), 1);
        }
        p.handCards.push(getRandomCard(state.schedule[state.currentClassIndex] || 'chinese', p.card?.subjects || []));
        break;
      case 'card_gen_12':
        p.stealthActive = true;
        break;
      case 'card_gen_14':
        p.hp = Math.max(0, p.hp - 5);
        if (opp) opp.hp = Math.max(0, opp.hp - 5);
        break;
      case 'card_gen_10':`);

// 2. Add reroll block for card_gen_09
code = code.replace(/export function rerollDice\(state, playerId, indices\) {([^]*?)const p = findPlayer\(state, playerId\);/m, 
`export function rerollDice(state, playerId, indices) {
  if (state.phase !== PHASE.BATTLE) return { ok: false, error: '非战斗阶段' };
  const p = findPlayer(state, playerId);
  const opp = state.players.find(x => x.id !== playerId && !x.isDead);
  if (opp && opp.playedTurnCard?.id === 'card_gen_09') return { ok: false, error: '对方使用了【重投锁死】，无法重投！' };`);

// 3. Add tactical effects to calcTacticalCardEffects
code = code.replace(/case 'card_gen_02': atkBonus \+= 2; break;/g, 
`case 'card_gen_01': atkBonus += 8; break; // 必定最大值，给个高额攻击加成
        case 'card_gen_02': atkBonus += 2; break;
        case 'card_gen_06': defBonus -= 2; break; // 压制对方点数
        case 'card_gen_08': defBonus -= 2; break; // 创伤加深`);

code = code.replace(/case 'card_gen_05': defBonus \+= 3; break;/g, 
`case 'card_gen_01': defBonus -= 99; break; // 无法防御
        case 'card_gen_05': defBonus += 3; break;
        case 'card_gen_06': atkBonus -= 2; break;
        case 'card_gen_08': atkBonus += 2; break; // 防御结算额外受2伤害
        case 'card_gen_13': defBonus += Math.floor((atk.keptRolls ? atk.keptRolls.reduce((a,b)=>a+b,0) : 10) * 0.5); break;`);

// 4. Handle stealth in getStateView
code = code.replace(/stealth: \!\!p\.stealth/g, 'stealth: !!p.stealth || !!p.stealthActive');

fs.writeFileSync('server/game/engine.js', code);
console.log('engine.js updated');
