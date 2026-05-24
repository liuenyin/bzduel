// ============================================================
// 校园战力党 — 货币战争 Run 状态机
// ============================================================
import {
  AC, SUBJECTS, HEX_SUBJECTS, AC_CHARS, AC_CHAR_MAP,
  getSupportValue, SUPPORT_TYPE, BEVERAGES, STAR_SCALE,
} from '../../shared/autochess-config.js';
import { createPool, refreshShop, scaleCharStats } from './shop.js';

// ── 节点类型 ──
const NODE = { NORMAL: 'normal', ELITE: 'elite', BOSS: 'boss', EVENT: 'event' };

/**
 * 创建新的 Run
 * @param {string} playerId
 * @param {string} nickname
 * @returns {object} 完整的 run 状态
 */
export function createRun(playerId, nickname) {
  // 生成 6 个位面的课程环境
  const planeEnvs = [];
  const available = [...SUBJECTS];
  for (let i = 0; i < AC.PLANES_COUNT; i++) {
    const idx = Math.floor(Math.random() * available.length);
    planeEnvs.push(available[idx]);
    // 允许重复但尽量分散（不移除，保持随机性）
  }

  // 生成每个位面的节点类型列表
  const nodeTypes = [];
  for (let p = 0; p < AC.PLANES_COUNT; p++) {
    const count = AC.NODES_PER_PLANE[p];
    const nodes = [];
    // 最后一个节点一定是 Boss
    for (let n = 0; n < count - 1; n++) {
      if (p < 3 && n === 1 && count >= 3) {
        nodes.push(NODE.EVENT); // 位面 1-3 的第 2 个节点为事件
      } else if (n === count - 2 && p >= 2) {
        nodes.push(NODE.ELITE); // 精英战在倒数第二个位置
      } else {
        nodes.push(NODE.NORMAL);
      }
    }
    nodes.push(NODE.BOSS);
    nodeTypes.push(nodes);
  }

  const pool = createPool();
  const shop = refreshShop(pool, 1);

  return {
    playerId, nickname,
    gold: 5, level: 1, xp: 0,
    commanderHP: AC.INITIAL_HP,
    maxCommanderHP: AC.INITIAL_HP,
    currentPlane: 0, currentNode: 0,
    planeEnvironments: planeEnvs,
    board: {
      core: null,
      hexSlots: Object.fromEntries(HEX_SUBJECTS.map(s => [s, null])),
    },
    bench: [],
    shop,
    phase: 'shop', // 'shop' | 'combat' | 'event' | 'victory' | 'defeat'
    winStreak: 0, loseStreak: 0,
    investmentBuffs: [],
    nodeTypes,
    stats: { totalDamage: 0, totalGold: 0, battlesWon: 0, roundsPlayed: 0 },
    pool,
    hasBeverageShop: false,
    beveragePurchasedThisNode: false,
    nextNodeGoldBonus: 0, // 故宫文创效果
    atkBonusThisPlane: 0,  // 脉动效果
  };
}

/**
 * 放置角色到棋盘
 */
export function placeCharacter(run, benchIndex, slot) {
  if (benchIndex < 0 || benchIndex >= run.bench.length) return { ok: false, error: 'invalid_bench' };

  // 计算当前棋盘人数
  const boardCount = getBoardCount(run);
  if (boardCount >= run.level) return { ok: false, error: 'level_limit' };

  const char = run.bench[benchIndex];

  if (slot === 'core') {
    if (run.board.core) return { ok: false, error: 'slot_occupied' };
    run.board.core = char;
  } else if (HEX_SUBJECTS.includes(slot)) {
    if (run.board.hexSlots[slot]) return { ok: false, error: 'slot_occupied' };
    run.board.hexSlots[slot] = char;
  } else {
    return { ok: false, error: 'invalid_slot' };
  }

  run.bench.splice(benchIndex, 1);
  checkBeverageShop(run);
  return { ok: true };
}

/**
 * 从棋盘移回备战席
 */
export function removeFromBoard(run, slot) {
  let char;
  if (slot === 'core') {
    if (!run.board.core) return { ok: false };
    char = run.board.core;
    run.board.core = null;
  } else if (HEX_SUBJECTS.includes(slot)) {
    if (!run.board.hexSlots[slot]) return { ok: false };
    char = run.board.hexSlots[slot];
    run.board.hexSlots[slot] = null;
  } else {
    return { ok: false };
  }
  run.bench.push(char);
  checkBeverageShop(run);
  return { ok: true };
}

/**
 * 购买经验
 */
export function buyXP(run) {
  if (run.gold < AC.XP_BUY_COST) return { ok: false, error: 'no_gold' };
  if (run.level >= AC.MAX_LEVEL) return { ok: false, error: 'max_level' };

  run.gold -= AC.XP_BUY_COST;
  run.xp += AC.XP_BUY_AMOUNT;

  const result = { ok: true, leveledUp: false };
  // 检查升级
  while (run.level < AC.MAX_LEVEL && run.xp >= AC.LEVEL_XP[run.level - 1]) {
    run.xp -= AC.LEVEL_XP[run.level - 1];
    run.level++;
    result.leveledUp = true;
    result.newLevel = run.level;
  }
  return result;
}

/**
 * 计算所有辅阵位的增益总和
 */
export function calculateSupportBuffs(run) {
  const env = run.planeEnvironments[run.currentPlane];
  const buffs = {
    flatReduction: 0,
    flatDef: 0,
    extraRerolls: 0,
    reduceMaxDie: 0,
    growMinDie: 0,
    redHeatPerHit: 0,
    redHeatNoDmg: false,
    healOnOverflow: 0,
    allOddAtkBonus: 0,
    flatAtkChance: { chance: 0, value: 0 },
    revive: null, // { hp, diceBoost?, diceCount? }
    sticker: null, // { threshold, pct }
    courseMult: 0,
    minDieBoost: 0,
    legendary: [], // 传说级效果数组
  };

  for (const slot of HEX_SUBJECTS) {
    const entry = run.board.hexSlots[slot];
    if (!entry) continue;

    const charCfg = AC_CHAR_MAP[entry.charId];
    if (!charCfg?.support) continue;

    const val = getSupportValue(charCfg, entry.star, slot, env);
    if (val == null) continue;

    const type = charCfg.support.type;
    switch (type) {
      case SUPPORT_TYPE.FLAT_REDUCTION:
        buffs.flatReduction += val; break;
      case SUPPORT_TYPE.FLAT_DEF:
        buffs.flatDef += val; break;
      case SUPPORT_TYPE.REROLL:
        buffs.extraRerolls += val; break;
      case SUPPORT_TYPE.REDUCE_MAX_DIE:
        buffs.reduceMaxDie += val; break;
      case SUPPORT_TYPE.GROW_MIN_DIE:
        buffs.growMinDie += val; break;
      case SUPPORT_TYPE.RED_HEAT:
        buffs.redHeatPerHit += val;
        if (charCfg.support.special?.star3NoDmgRequired && entry.star >= 3) {
          buffs.redHeatNoDmg = true;
        }
        break;
      case SUPPORT_TYPE.HEAL_OVERFLOW:
        buffs.healOnOverflow += val; break;
      case SUPPORT_TYPE.ALL_ODD_ATK:
        buffs.allOddAtkBonus += val; break;
      case SUPPORT_TYPE.FLAT_ATK_CHANCE: {
        const chance = charCfg.support.special?.triggerChance || 0.5;
        if (Math.random() < chance) buffs.flatAtkChance.value += val;
        break;
      }
      case SUPPORT_TYPE.REVIVE: {
        const reviveHP = val;
        const existing = buffs.revive?.hp || 0;
        buffs.revive = { hp: Math.max(existing, reviveHP) };
        // 3★特殊：复活后骰面提升
        if (entry.star >= 3 && charCfg.support.special?.star3DiceBoost) {
          const boost = charCfg.electives.includes(slot) && env === slot
            ? charCfg.support.special.star3DiceBoost.e
            : charCfg.support.special.star3DiceBoost.n;
          buffs.revive.diceBoost = boost;
          buffs.revive.diceCount = charCfg.support.special.star3DiceCount || 2;
        }
        break;
      }
      case SUPPORT_TYPE.STICKER: {
        if (!buffs.sticker || val.pct > buffs.sticker.pct) {
          buffs.sticker = { threshold: val.threshold, pct: val.pct };
        }
        break;
      }
      case SUPPORT_TYPE.COURSE_MULT:
        buffs.courseMult += val; break;
      case SUPPORT_TYPE.MIN_DIE_BOOST:
        buffs.minDieBoost += val; break;
      case SUPPORT_TYPE.LEGENDARY:
        buffs.legendary.push({ charId: entry.charId, star: entry.star, effect: val });
        break;
    }
  }

  return buffs;
}

/**
 * 处理战斗结果
 */
export function processBattleResult(run, won, damageDealt = 0) {
  run.stats.roundsPlayed++;
  run.stats.totalDamage += damageDealt;

  // 连胜/连败
  if (won) {
    run.winStreak++; run.loseStreak = 0;
    run.stats.battlesWon++;
  } else {
    run.loseStreak++; run.winStreak = 0;
  }

  // 收入计算
  let goldEarned = AC.BASE_INCOME;
  if (won) goldEarned += 1;

  // 连胜/连败奖金
  const streak = Math.max(run.winStreak, run.loseStreak);
  if (streak >= 4) goldEarned += 3;
  else if (streak >= 3) goldEarned += 2;
  else if (streak >= 2) goldEarned += 1;

  // 利息
  let maxInterest = AC.MAX_INTEREST;
  const compoundBuff = run.investmentBuffs.filter(b => b.id === 'compound_interest');
  if (compoundBuff.length > 0) maxInterest += compoundBuff.reduce((s, b) => s + b.value, 0);
  const interest = Math.min(Math.floor(run.gold / 10) * AC.INTEREST_PER_10, maxInterest);
  goldEarned += interest;

  // 故宫文创效果
  if (run.nextNodeGoldBonus > 0) {
    goldEarned += run.nextNodeGoldBonus;
    run.nextNodeGoldBonus = 0;
  }

  run.gold += goldEarned;
  run.stats.totalGold += goldEarned;

  // 经验
  let xpEarned = AC.XP_PER_BATTLE;
  const fastLearner = run.investmentBuffs.filter(b => b.id === 'fast_learner');
  if (fastLearner.length > 0) xpEarned += fastLearner.reduce((s, b) => s + b.value, 0);
  run.xp += xpEarned;
  let leveledUp = false;
  while (run.level < AC.MAX_LEVEL && run.xp >= AC.LEVEL_XP[run.level - 1]) {
    run.xp -= AC.LEVEL_XP[run.level - 1];
    run.level++;
    leveledUp = true;
  }

  // 战败扣血
  let commanderDamage = 0;
  if (!won) {
    commanderDamage = AC.LOSS_DMG_BASE + AC.LOSS_DMG_PER_PLANE * (run.currentPlane + 1);
    run.commanderHP = Math.max(0, run.commanderHP - commanderDamage);
  }

  const advanceRes = advanceNode(run);

  return {
    goldEarned, interest, xpEarned, leveledUp,
    commanderDamage,
    ...advanceRes
  };
}

/**
 * 推进到下一个节点，处理位面通关和游戏结束逻辑
 */
export function advanceNode(run) {
  run.currentNode++;
  const planeNodes = run.nodeTypes[run.currentPlane];
  let planeComplete = false;

  if (run.currentNode >= planeNodes.length) {
    // 完成当前位面
    planeComplete = true;
    run.currentPlane++;
    run.currentNode = 0;
    run.beveragePurchasedThisNode = false;
    run.atkBonusThisPlane = 0;
    // 厚积薄发: 通关位面时加HP
    const thickSkin = run.investmentBuffs.filter(b => b.id === 'thick_skin');
    if (thickSkin.length > 0) {
      const bonus = thickSkin.reduce((s, b) => s + b.value, 0);
      run.maxCommanderHP += bonus;
      run.commanderHP += bonus;
    }
  }

  // 检查游戏结束
  const gameOver = run.commanderHP <= 0 || run.currentPlane >= AC.PLANES_COUNT;
  const victory = run.currentPlane >= AC.PLANES_COUNT && run.commanderHP > 0;

  if (gameOver) {
    run.phase = victory ? 'victory' : 'defeat';
  } else {
    run.beveragePurchasedThisNode = false;
    const nextType = getCurrentNodeType(run);
    run.phase = nextType === NODE.EVENT ? 'event' : 'shop';
    // 刷新商店
    run.shop = refreshShop(run.pool, run.level);
  }

  return { planeComplete, gameOver, victory, nextNodeType: gameOver ? null : getCurrentNodeType(run) };
}

/**
 * 获取当前节点类型
 */
export function getCurrentNodeType(run) {
  if (run.currentPlane >= AC.PLANES_COUNT) return null;
  return run.nodeTypes[run.currentPlane]?.[run.currentNode] || NODE.NORMAL;
}

/**
 * 处理事件节点选择
 * @param {object} run
 */
export function chooseEvent(run) {
  if (run.phase !== 'event') return { ok: false };

  const isInvestment = Math.random() < 0.5;

  if (isInvestment) {
    // 投资策略：随机3选1
    const allBuffs = [
      { id: 'compound_interest', name: '利滚利', desc: '利息上限+2', effect: 'maxInterest', value: 2 },
      { id: 'scholar_aura', name: '学霸光环', desc: '主场科目伤害+4', effect: 'homeDmg', value: 4 },
      { id: 'thick_skin', name: '厚积薄发', desc: '每通关一个位面，阵眼最大HP+5', effect: 'hpPerPlane', value: 5 },
      { id: 'fast_learner', name: '速成班', desc: '每场战斗额外+1经验', effect: 'bonusXP', value: 1 },
      { id: 'lucky_dice', name: '幸运骰', desc: '阵眼所有骰子面数+1', effect: 'diceBoost', value: 1 },
      { id: 'bargain', name: '砍价高手', desc: '商店刷新费用-1（最低0）', effect: 'refreshDiscount', value: 1 },
    ];
    // 随机选 3 个
    const shuffled = allBuffs.sort(() => Math.random() - 0.5);
    const options = shuffled.slice(0, 3);
    run.phase = 'event_choosing';
    return { ok: true, choice: 'investment', options };
  } else {
    // 金矿
    run.phase = 'shop'; // 转入shop阶段以便玩家可以开始战斗
    return { ok: true, choice: 'goldmine' };
  }
}

/**
 * 确认投资策略选择
 */
export function confirmInvestment(run, buffId, options) {
  const buff = options.find(b => b.id === buffId);
  if (!buff) return { ok: false };
  run.investmentBuffs.push(buff);
  // 推进到下一节点 (复用相同的安全切图逻辑)
  advanceNode(run);
  return { ok: true, buff };
}

/**
 * 生成当前节点的 AI 对手
 */
export function generateAIOpponent(run) {
  const nodeType = getCurrentNodeType(run);
  const plane = run.currentPlane;
  const node = run.currentNode;

  // 从角色池中随机选一个作为 AI 主C
  const aiCharIdx = Math.floor(Math.random() * AC_CHARS.length);
  const aiCharCfg = AC_CHARS[aiCharIdx];

  // 根据位面和节点类型缩放难度
  let hpMult = 1.0, dicePlus = 0, aiStar = 1;
  switch (nodeType) {
    case NODE.NORMAL:
      hpMult = 0.8 + plane * 0.15 + node * 0.05;
      dicePlus = Math.floor(plane * 0.8);
      aiStar = plane >= 3 ? 2 : 1;
      break;
    case NODE.ELITE:
      hpMult = 1.2 + plane * 0.2;
      dicePlus = Math.floor(plane * 1.2) + 1;
      aiStar = Math.min(3, Math.floor(plane / 2) + 2);
      break;
    case NODE.BOSS:
      hpMult = 1.8 + plane * 0.3;
      dicePlus = Math.floor(plane * 1.5) + 2;
      aiStar = Math.min(3, Math.floor(plane / 2) + 2);
      break;
  }

  const baseStats = scaleCharStats(aiCharCfg, aiStar);
  return {
    charId: aiCharCfg.id,
    name: `${nodeType === NODE.BOSS ? '💀 ' : nodeType === NODE.ELITE ? '⭐ ' : ''}${aiCharCfg.name}`,
    hp: Math.floor(baseStats.hp * hpMult),
    dicePool: baseStats.dicePool.map(f => f + dicePlus),
    atkSlots: baseStats.atkSlots === -1 ? -1 : baseStats.atkSlots,
    defSlots: baseStats.defSlots,
    star: aiStar,
    nodeType,
    coreSkills: { positive: aiCharCfg.corePositive, negative: aiCharCfg.coreNegative },
  };
}

/**
 * 购买饮料
 */
export function buyBeverage(run, beverageId) {
  if (!run.hasBeverageShop) return { ok: false, error: 'no_shop' };
  if (run.beveragePurchasedThisNode) return { ok: false, error: 'already_bought' };
  const bev = BEVERAGES.find(b => b.id === beverageId);
  if (!bev) return { ok: false, error: 'invalid' };
  if (run.gold < bev.cost) return { ok: false, error: 'no_gold' };

  run.gold -= bev.cost;
  run.beveragePurchasedThisNode = true;

  switch (bev.effect) {
    case 'maxHP':
      run.maxCommanderHP += bev.value;
      run.commanderHP = Math.min(run.commanderHP + bev.value, run.maxCommanderHP);
      break;
    case 'atkBonus':
      run.atkBonusThisPlane += bev.value;
      break;
    case 'heal':
      run.commanderHP = Math.min(run.commanderHP + bev.value, run.maxCommanderHP);
      break;
    case 'gold':
      run.nextNodeGoldBonus += bev.value;
      break;
  }
  return { ok: true, beverage: bev };
}

/**
 * 获取 run 的客户端视图（隐藏池信息）
 */
export function getRunView(run) {
  return {
    gold: run.gold, level: run.level, xp: run.xp,
    xpToNext: run.level < AC.MAX_LEVEL ? AC.LEVEL_XP[run.level - 1] : 0,
    commanderHP: run.commanderHP, maxCommanderHP: run.maxCommanderHP,
    currentPlane: run.currentPlane, currentNode: run.currentNode,
    planeEnvironments: run.planeEnvironments,
    board: run.board, bench: run.bench, shop: run.shop,
    phase: run.phase,
    winStreak: run.winStreak, loseStreak: run.loseStreak,
    investmentBuffs: run.investmentBuffs,
    nodeTypes: run.nodeTypes,
    stats: run.stats,
    hasBeverageShop: run.hasBeverageShop,
    beveragePurchasedThisNode: run.beveragePurchasedThisNode,
    currentNodeType: getCurrentNodeType(run),
    interest: Math.min(Math.floor(run.gold / 10), AC.MAX_INTEREST),
  };
}

// ── 辅助函数 ──
function getBoardCount(run) {
  let count = run.board.core ? 1 : 0;
  for (const c of Object.values(run.board.hexSlots)) { if (c) count++; }
  return count;
}

/** 检测是否有周煊声 2★+ 辅阵位触发饮料商店 */
function checkBeverageShop(run) {
  run.hasBeverageShop = false;
  for (const slot of HEX_SUBJECTS) {
    const entry = run.board.hexSlots[slot];
    if (!entry) continue;
    const cfg = AC_CHAR_MAP[entry.charId];
    if (cfg?.support?.type === SUPPORT_TYPE.LEGENDARY && entry.star >= 2) {
      const starKey = `star${entry.star}`;
      const val = cfg.support.values[starKey];
      if (val?.n?.enableBeverageShop || val?.e?.enableBeverageShop) {
        run.hasBeverageShop = true;
        return;
      }
    }
  }
}
