// ============================================================
// 校园战力党 — 货币战争 商店与角色池管理
// ============================================================
import { AC, AC_CHARS, AC_CHARS_BY_COST, COST_PROB, STAR_SCALE } from '../../shared/autochess-config.js';

/**
 * 创建共享角色池
 * @returns {{ [charId: string]: number }} 角色ID→剩余数量
 */
export function createPool() {
  const pool = {};
  AC_CHARS.forEach(c => {
    pool[c.id] = AC.POOL_SIZE[c.cost] || 10;
  });
  return pool;
}

/**
 * 刷新商店（抽取 5 个角色）
 * @param {{ [charId:string]: number }} pool
 * @param {number} level - 玩家等级 (1-7)
 * @returns {Array<{ charId:string, cost:number }|null>} 5 个商店位
 */
export function refreshShop(pool, level) {
  const probs = COST_PROB[level] || COST_PROB[1];
  const shop = [];

  for (let i = 0; i < AC.SHOP_SIZE; i++) {
    // 按概率选费用档
    const roll = Math.random() * 100;
    let cumulative = 0;
    let cost = 1;
    for (let c = 0; c < probs.length; c++) {
      cumulative += probs[c];
      if (roll < cumulative) { cost = c + 1; break; }
    }

    // 从该费用档中随机选一个有库存的角色
    const candidates = (AC_CHARS_BY_COST[cost] || []).filter(ch => (pool[ch.id] || 0) > 0);
    if (candidates.length === 0) {
      // 该费用档无库存，尝试降档
      let found = null;
      for (let fallback = cost - 1; fallback >= 1; fallback--) {
        const fb = (AC_CHARS_BY_COST[fallback] || []).filter(ch => (pool[ch.id] || 0) > 0);
        if (fb.length > 0) { found = fb[Math.floor(Math.random() * fb.length)]; break; }
      }
      shop.push(found ? { charId: found.id, cost: found.cost } : null);
    } else {
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      shop.push({ charId: picked.id, cost: picked.cost });
    }
  }
  return shop;
}

/**
 * 购买角色
 * @param {object} run - Run 状态
 * @param {number} shopIdx - 商店位索引 (0-4)
 * @returns {{ ok:boolean, error?:string, starUps?:Array }}
 */
export function buyCharacter(run, shopIdx) {
  if (shopIdx < 0 || shopIdx >= run.shop.length) return { ok: false, error: 'invalid_index' };
  const item = run.shop[shopIdx];
  if (!item) return { ok: false, error: 'empty_slot' };
  if (run.gold < item.cost) return { ok: false, error: 'no_gold' };

  // 扣金币，从池中取出
  run.gold -= item.cost;
  run.pool[item.charId] = Math.max(0, (run.pool[item.charId] || 0) - 1);

  // 加入备战席
  run.bench.push({ charId: item.charId, star: 1 });

  // 清除商店位
  run.shop[shopIdx] = null;

  // 检查升星
  const starUps = checkAndDoStarUp(run);

  return { ok: true, starUps };
}

/**
 * 卖出角色（从备战席或棋盘）
 * @param {object} run
 * @param {'bench'|'board'} from
 * @param {number|string} index - bench索引 或 board slot名
 * @returns {{ ok:boolean, refund?:number }}
 */
export function sellCharacter(run, from, index) {
  let char;
  if (from === 'bench') {
    if (index < 0 || index >= run.bench.length) return { ok: false };
    char = run.bench.splice(index, 1)[0];
  } else if (from === 'board') {
    if (index === 'core') {
      if (!run.board.core) return { ok: false };
      char = run.board.core;
      run.board.core = null;
    } else {
      if (!run.board.hexSlots[index]) return { ok: false };
      char = run.board.hexSlots[index];
      run.board.hexSlots[index] = null;
    }
  } else {
    return { ok: false };
  }

  // 退还金币
  const cfg = AC_CHARS.find(c => c.id === char.charId);
  const refund = (cfg?.cost || 1) * (AC.SELL_REFUND[char.star] || 1);
  run.gold += refund;

  // 归还池
  const returnCount = Math.pow(AC.STAR_UP_COUNT, char.star - 1); // 1★=1, 2★=3, 3★=9
  run.pool[char.charId] = (run.pool[char.charId] || 0) + returnCount;

  return { ok: true, refund };
}

/**
 * 检查并执行升星（3 连合成）
 * @param {object} run
 * @returns {Array<{ charId:string, fromStar:number, toStar:number }>}
 */
export function checkAndDoStarUp(run) {
  const ups = [];
  let changed = true;

  while (changed) {
    changed = false;

    // 统计备战席 + 棋盘上所有角色
    const allChars = getAllChars(run);
    const grouped = {};
    allChars.forEach(entry => {
      const key = `${entry.char.charId}_${entry.char.star}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(entry);
    });

    for (const [key, entries] of Object.entries(grouped)) {
      if (entries.length >= AC.STAR_UP_COUNT) {
        const { charId, star } = entries[0].char;
        if (star >= 3) continue; // 已满星

        // 移除 3 个，保留第一个的位置升星
        const first = entries[0];
        const toRemove = entries.slice(1, AC.STAR_UP_COUNT);

        // 从各位置移除
        toRemove.forEach(e => removeCharEntry(run, e));

        // 升级第一个
        first.char.star = star + 1;
        ups.push({ charId, fromStar: star, toStar: star + 1 });
        changed = true;
        break; // 重新检查
      }
    }
  }

  return ups;
}

/** 获取所有角色（含位置信息） */
function getAllChars(run) {
  const result = [];
  run.bench.forEach((c, i) => result.push({ char: c, loc: 'bench', idx: i }));
  if (run.board.core) result.push({ char: run.board.core, loc: 'core' });
  for (const [slot, c] of Object.entries(run.board.hexSlots)) {
    if (c) result.push({ char: c, loc: 'hex', slot });
  }
  return result;
}

/** 从 run 中移除一个角色条目 */
function removeCharEntry(run, entry) {
  if (entry.loc === 'bench') {
    const i = run.bench.indexOf(entry.char);
    if (i >= 0) run.bench.splice(i, 1);
  } else if (entry.loc === 'core') {
    run.board.core = null;
  } else if (entry.loc === 'hex') {
    run.board.hexSlots[entry.slot] = null;
  }
}

/**
 * 根据星级缩放角色战斗属性
 * @param {object} charConfig - AC_CHARS 中的角色配置
 * @param {number} star - 星级 1/2/3
 * @returns {{ hp:number, dicePool:number[], atkSlots:number, defSlots:number }}
 */
export function scaleCharStats(charConfig, star) {
  const hpMult = STAR_SCALE.hp[star] || 1;
  const diceBoost = STAR_SCALE.dice[star] || 0;
  return {
    hp: Math.floor(charConfig.baseHP * hpMult),
    dicePool: charConfig.baseDice.map(face => face + diceBoost),
    atkSlots: charConfig.atkSlots,
    defSlots: charConfig.defSlots,
  };
}
