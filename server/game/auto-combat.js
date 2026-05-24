// ============================================================
// 校园战力党 — 货币战争 自动战斗封装
// 将现有的手动 1v1 引擎转化为全自动快速对决
// ============================================================

/**
 * 自动战斗不直接复用 engine.js（因为那套状态机需要 socket 交互）。
 * 而是提取核心掷骰逻辑，独立实现一个纯计算版本。
 * 输出一份战斗录像 (combat log) 供前端 2 倍速播放。
 */

// ── 基础工具 ──
function rollDie(faces) { return Math.floor(Math.random() * faces) + 1; }
function rollDice(pool) { return pool.map(f => rollDie(f)); }
function topN(arr, n) {
  if (n <= 0 || n >= arr.length) return [...arr];
  return [...arr].sort((a, b) => b - a).slice(0, n);
}

/**
 * 执行一场完整的自动战斗
 * @param {object} fighter1 - 阵眼角色 (玩家)
 * @param {object} fighter2 - AI 对手
 * @param {object} buffs - 辅阵增益 (来自 calculateSupportBuffs)
 * @param {object} opts - 额外选项 { investmentBuffs, courseMultiplier, subject }
 * @returns {{ log: Array, winner: 1|2, totalDamageByP1: number }}
 */
export function autoResolveMatch(fighter1, fighter2, buffs = {}, opts = {}) {
  // 构建战斗状态
  const p1 = buildFighter(fighter1, buffs, opts);
  const p2 = buildFighter(fighter2, {}, {});

  const log = [];
  let round = 0;
  const MAX_ROUNDS = 50; // 防止无限循环

  // 交替攻防：先手固定为 p1
  let attacker = p1, defender = p2;

  while (p1.hp > 0 && p2.hp > 0 && round < MAX_ROUNDS) {
    round++;
    const entry = { round, attacker: attacker.name, defender: defender.name };

    // ── 攻击阶段 ──
    const atkRolls = rollDice(attacker.dicePool);
    const atkSlots = attacker.atkSlots === -1 ? atkRolls.length : attacker.atkSlots;
    let keptAtk = topN(atkRolls, atkSlots);

    // 自动重投（重投最小的骰子）
    let rerolls = attacker.rerolls;
    if (rerolls > 0 && atkRolls.length > 0) {
      rerolls--;
      // 找最小的骰子，重投一次
      const minIdx = atkRolls.indexOf(Math.min(...atkRolls));
      const rerolled = rollDie(attacker.dicePool[minIdx]);
      atkRolls[minIdx] = rerolled;
      keptAtk = topN(atkRolls, atkSlots);
    }

    let atkTotal = keptAtk.reduce((s, v) => s + v, 0);

    // 辅阵增益：全奇数加攻
    if (attacker === p1 && buffs.allOddAtkBonus > 0) {
      if (keptAtk.every(v => v % 2 === 1)) {
        atkTotal += buffs.allOddAtkBonus;
        entry.oddBonus = buffs.allOddAtkBonus;
      }
    }

    // 辅阵增益：概率加攻
    if (attacker === p1 && buffs.flatAtkChance?.value > 0) {
      atkTotal += buffs.flatAtkChance.value;
    }

    // 辅阵增益：最小骰子提升
    if (attacker === p1 && buffs.minDieBoost > 0) {
      const minVal = Math.min(...keptAtk);
      const boost = buffs.minDieBoost;
      atkTotal += boost; // 简化：直接加到总攻击力
      entry.minDieBoost = boost;
    }

    // 脉动效果
    if (attacker === p1 && (opts.atkBonusThisPlane || 0) > 0) {
      atkTotal += opts.atkBonusThisPlane;
    }

    // Boss 狂暴: 随着回合数增加攻击力
    if (attacker === p2 && p2.nodeType === 'boss') {
      atkTotal += round; // 每回合 +1 攻击
      entry.bossRage = round;
    }

    entry.atkRolls = [...atkRolls];
    entry.atkKept = [...keptAtk];
    entry.atkTotal = atkTotal;

    // ── 防御阶段 ──
    const defRolls = rollDice(defender.dicePool);
    const defSlots = defender.defSlots;
    let keptDef = topN(defRolls, defSlots);
    let defTotal = keptDef.reduce((s, v) => s + v, 0);

    // 辅阵增益：加防
    if (defender === p1 && buffs.flatDef > 0) {
      defTotal += buffs.flatDef;
    }

    // 辅阵增益：削对方最大骰
    if (attacker !== p1 && buffs.reduceMaxDie > 0) {
      // 对方攻击我时，削对方最大骰
      atkTotal = Math.max(0, atkTotal - buffs.reduceMaxDie);
    }

    // Boss 护甲: 固定 +5 防御
    if (defender === p2 && p2.nodeType === 'boss') {
      defTotal += 5;
      entry.bossArmor = 5;
    }

    entry.defRolls = [...defRolls];
    entry.defKept = [...keptDef];
    entry.defTotal = defTotal;

    // ── 伤害结算 ──
    let rawDamage = Math.max(0, atkTotal - defTotal);

    // 辅阵增益：固定减伤
    if (defender === p1 && buffs.flatReduction > 0) {
      rawDamage = Math.max(0, rawDamage - buffs.flatReduction);
    }

    // 辅阵增益：溢出回血
    if (defender === p1 && defTotal > atkTotal && buffs.healOnOverflow > 0) {
      const overflow = defTotal - atkTotal;
      const heal = Math.min(overflow, buffs.healOnOverflow);
      p1.hp = Math.min(p1.maxHp, p1.hp + heal);
      entry.healed = heal;
    }

    defender.hp = Math.max(0, defender.hp - rawDamage);
    entry.damage = rawDamage;
    entry.p1HP = p1.hp;
    entry.p2HP = p2.hp;

    // 辅阵增益：红温叠加
    if (attacker === p1 && buffs.redHeatPerHit > 0) {
      if (rawDamage > 0 || buffs.redHeatNoDmg) {
        p2.redHeat = (p2.redHeat || 0) + buffs.redHeatPerHit;
        entry.redHeatApplied = buffs.redHeatPerHit;
      }
    }

    // 红温伤害（攻击者回合开始时受红温伤害）
    if (attacker.redHeat > 0) {
      attacker.hp = Math.max(0, attacker.hp - attacker.redHeat);
      entry.redHeatDmg = attacker.redHeat;
      attacker.redHeat = Math.max(0, attacker.redHeat - 1);
    }

    // 辅阵增益：贴画
    if (attacker === p1 && buffs.sticker && rawDamage > 0) {
      p2.stickers = (p2.stickers || 0) + 1;
      if (p2.stickers >= buffs.sticker.threshold) {
        const stickerDmg = Math.floor(p2.hp * buffs.sticker.pct / 100);
        p2.hp = Math.max(0, p2.hp - stickerDmg);
        p2.stickers = 0;
        entry.stickerExplode = stickerDmg;
      }
    }

    // 辅阵增益：复活检查
    if (p1.hp <= 0 && buffs.revive && !p1.hasRevived) {
      p1.hp = buffs.revive.hp;
      p1.hasRevived = true;
      entry.revived = buffs.revive.hp;
      // 3★ 骰面提升
      if (buffs.revive.diceBoost) {
        const count = buffs.revive.diceCount || 2;
        const boost = buffs.revive.diceBoost;
        for (let i=0; i<Math.min(count, p1.dicePool.length); i++) {
          p1.dicePool[i] += boost;
        }
      }
    }

    // 阵眼/核心技能：九条命 (首次HP归零时复活，HP回9，骰子全变10)
    if (p1.hp <= 0 && p1.coreSkills?.positive?.id === 'nine_lives' && !p1.nineLivesUsed) {
      p1.nineLivesUsed = true;
      p1.hp = 9;
      p1.dicePool = p1.dicePool.map(() => 10);
      entry.nineLivesP1 = true;
    }
    if (p2.hp <= 0 && p2.coreSkills?.positive?.id === 'nine_lives' && !p2.nineLivesUsed) {
      p2.nineLivesUsed = true;
      p2.hp = 9;
      p2.dicePool = p2.dicePool.map(() => 10);
      entry.nineLivesP2 = true;
    }

    log.push(entry);

    // 检查死亡
    if (p1.hp <= 0 || p2.hp <= 0) break;

    // 交换攻防
    [attacker, defender] = [defender, attacker];
  }

  // 辅阵增益：战后骰面成长
  // (由调用方处理，这里只返回结果)

  const winner = p1.hp > 0 ? 1 : (p2.hp > 0 ? 2 : 0);
  const totalDamageByP1 = log.reduce((s, e) => {
    if (e.attacker === p1.name) return s + (e.damage || 0) + (e.stickerExplode || 0);
    return s;
  }, 0);

  return { log, winner, totalDamageByP1, finalHP: { p1: p1.hp, p2: p2.hp }, rounds: round };
}

/**
 * 构建战斗用的角色对象
 */
function buildFighter(config, buffs, opts) {
  return {
    name: config.name || '未知',
    hp: config.hp,
    maxHp: config.hp,
    dicePool: [...config.dicePool],
    atkSlots: config.atkSlots,
    defSlots: config.defSlots,
    rerolls: (buffs.extraRerolls || 0) + 1, // 基础 1 次重投 + 辅阵加成
    redHeat: 0,
    stickers: 0,
    hasRevived: false,
    nodeType: config.nodeType || 'normal',
  };
}

/**
 * 生成金矿战斗（对方 1 HP）
 */
export function createGoldMineBattle() {
  return {
    name: '💰 金矿守卫',
    hp: 1,
    dicePool: [4],
    atkSlots: 1,
    defSlots: 1,
  };
}
