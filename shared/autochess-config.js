// ============================================================
// 校园战力党 — 货币战争 (自走棋) 模式配置
// ============================================================

// ── 游戏常量 ──
export const AC = {
  PLANES_COUNT: 6,
  NODES_PER_PLANE: [3, 4, 4, 5, 5, 5],
  MAX_LEVEL: 7,
  LEVEL_XP: [0, 4, 8, 14, 22, 32, 44],
  BASE_INCOME: 5,
  INTEREST_PER_10: 1,
  MAX_INTEREST: 5,
  SHOP_REFRESH_COST: 2,
  XP_BUY_COST: 4,
  XP_BUY_AMOUNT: 4,
  XP_PER_BATTLE: 2,
  SHOP_SIZE: 5,
  INITIAL_HP: 100,
  LOSS_DMG_BASE: 3,
  LOSS_DMG_PER_PLANE: 2,
  STAR_UP_COUNT: 3,
  SELL_REFUND: { 1: 1, 2: 3, 3: 9 },
  POOL_SIZE: { 1: 30, 2: 20, 3: 15, 4: 10, 5: 5 },
};

export const SUBJECTS = [
  'chinese','math','english',
  'physics','chemistry','biology',
  'history','geography','politics'
];

/** 六芒星棋盘的 6 个辅阵位科目 */
export const HEX_SUBJECTS = [
  'physics','chemistry','biology',
  'history','geography','politics'
];

/** 等级→商店刷新各费用概率 (%) */
export const COST_PROB = {
  1: [100, 0,  0,  0,  0],
  2: [100, 0,  0,  0,  0],
  3: [70, 25,  5,  0,  0],
  4: [50, 30, 15,  5,  0],
  5: [35, 30, 20, 10,  5],
  6: [20, 25, 25, 20, 10],
  7: [10, 20, 25, 25, 20],
};

// ── 辅阵技类型 ──
export const SUPPORT_TYPE = {
  FLAT_REDUCTION:  'flat_reduction',   // 固定减伤
  FLAT_DEF:        'flat_def',         // 固定加防
  REROLL:          'reroll',           // 重投次数
  REDUCE_MAX_DIE:  'reduce_max_die',   // 削对方最大骰
  GROW_MIN_DIE:    'grow_min_die',     // 战后最小骰面+X
  RED_HEAT:        'red_heat',         // 叠红温
  HEAL_OVERFLOW:   'heal_overflow',    // 溢出回血
  ALL_ODD_ATK:     'all_odd_atk',     // 全奇数加攻
  FLAT_ATK_CHANCE: 'flat_atk_chance',  // 概率加攻
  REVIVE:          'revive',           // 复活
  STICKER:         'sticker',          // 贴画叠加
  COURSE_MULT:     'course_mult',      // 课程倍率加成
  MIN_DIE_BOOST:   'min_die_boost',    // 掷骰后最小骰+X
  LEGENDARY:       'legendary',        // 传说级效果
};

// ── 周煊声特殊商品 ──
export const BEVERAGES = [
  { id: 'iced_tea',     name: '冰红茶',  cost: 3, effect: 'maxHP',    value: 3,  desc: '指挥官最大HP+3' },
  { id: 'mizone',       name: '脉动',    cost: 4, effect: 'atkBonus',  value: 2,  desc: '阵眼攻击力+2（本位面）' },
  { id: 'popsicle',     name: '老冰棍',  cost: 2, effect: 'heal',      value: 10, desc: '回复10指挥官HP' },
  { id: 'palace_merch', name: '故宫文创', cost: 5, effect: 'gold',      value: 5,  desc: '下个节点额外+5金币' },
];

// ── 辅阵技数值表 ──
// 规则：
//   - 匹配位 (角色选科含该槽位科目) → 使用 normal 值
//   - 不匹配位 → 降一星 (1★不匹配=无效, 2★不匹配=1★normal, 3★不匹配=2★normal)
//   - 环境匹配 (当前位面=该槽位科目) → 使用 env 值
//   - 所有数值已应用 0.85x 削减 (整数向下取整, 浮点数保留2位)

/**
 * 角色池（货币战争专用）
 * 每个角色：
 *   id, name, title, cost, electives,
 *   baseHP, baseDice, atkSlots, defSlots,
 *   corePositive: { id, name, desc },
 *   coreNegative: { id, name, desc } | null,
 *   support: { id, name, type, desc, values: { star1:{n,e}, star2:{n,e}, star3:{n,e} }, special? }
 */
export const AC_CHARS = [

  // ════════ 1 费 ════════
  {
    id: 'char_6', name: '黄佳程', title: '+*', cost: 1,
    electives: ['physics','chemistry','biology'],
    baseHP: 22, baseDice: [6,8,10,12], atkSlots: 3, defSlots: 3,
    corePositive: { id: 'talented', name: '天赋怪', desc: '受到的最终伤害按课程倍率减免（×1/0.75/0.5）' },
    coreNegative: { id: 'hjc_neg', name: '过敏 & 杂鱼', desc: '攻击10%概率锁定低伤害；攻<防时自身HP减半' },
    support: {
      id: 'sp_shield', name: '天赋护盾', type: SUPPORT_TYPE.FLAT_REDUCTION,
      desc: '阵眼受到的最终伤害减少',
      values: {
        star1: { n: 1, e: 2 },
        star2: { n: 2, e: 3 },
        star3: { n: 3, e: 6 },
      }
    }
  },
  {
    id: 'char_8', name: '李灿', title: '玩gal玩的', cost: 1,
    electives: ['physics','chemistry','biology'],
    baseHP: 27, baseDice: [6,6,6,8], atkSlots: 2, defSlots: 4,
    corePositive: { id: 'gal_player', name: '休眠火山', desc: '防御>攻击时反击差值伤害；可献祭骰子回血' },
    coreNegative: null,
    support: {
      id: 'sp_def', name: '休眠火山', type: SUPPORT_TYPE.FLAT_DEF,
      desc: '阵眼防御力增加',
      values: {
        star1: { n: 2, e: 3 },
        star2: { n: 3, e: 6 },
        star3: { n: 6, e: 13 },
      }
    }
  },

  // ════════ 2 费 ════════
  {
    id: 'char_4', name: '王鹤迪', title: '显眼包', cost: 2,
    electives: ['physics','chemistry','geography'],
    baseHP: 30, baseDice: [4,4,4,6,6], atkSlots: 4, defSlots: 3,
    corePositive: { id: 'star_showoff', name: '观星 & 显眼包', desc: '攻击+2重投；4骰极差≤2时伤害×(0.5+课程倍率)' },
    coreNegative: { id: 'sugar_crash', name: '犯糖 & 全投', desc: '受伤≥8获得犯糖状态；重投时全部重投' },
    support: {
      id: 'sp_reroll', name: '场外应援', type: SUPPORT_TYPE.REROLL,
      desc: '阵眼每场战斗额外重投次数',
      values: {
        star1: { n: 1, e: 2 },
        star2: { n: 2, e: 3 },
        star3: { n: 3, e: 5 },
      }
    }
  },
  {
    id: 'char_9', name: '曾无畏', title: '吃掉!', cost: 2,
    electives: ['physics','chemistry','biology'],
    baseHP: 31, baseDice: [6,10,10], atkSlots: 3, defSlots: 2,
    corePositive: { id: 'eat_it', name: '吃掉!', desc: '防御时将对方最大骰子强制变为2点' },
    coreNegative: { id: 'd10_limit', name: '???', desc: '防御时最多选中1个D10骰子' },
    support: {
      id: 'sp_eat', name: '嘴下留情', type: SUPPORT_TYPE.REDUCE_MAX_DIE,
      desc: '阵眼防御时，对方最大攻击骰子点数减少',
      values: {
        star1: { n: 1, e: 2 },
        star2: { n: 2, e: 3 },
        star3: { n: 3, e: 4 },
      }
    }
  },
  {
    id: 'char_5', name: '赵恩培', title: '团长', cost: 2,
    electives: ['physics','chemistry','biology'],
    baseHP: 40, baseDice: [4,4,4,4], atkSlots: -1, defSlots: 4,
    corePositive: { id: 'commander_recruit', name: '团长大人！', desc: '防御未重投时永久加入一枚骰子(D4/D6/D8)' },
    coreNegative: { id: 'unsustainable', name: '不可持续发展', desc: '攻击回合开始受到2×课程倍率伤害' },
    support: {
      id: 'sp_grow', name: '团长招兵', type: SUPPORT_TYPE.GROW_MIN_DIE,
      desc: '每场战斗后，阵眼骰池最小骰面数永久增加',
      values: {
        star1: { n: 1, e: 2 },
        star2: { n: 2, e: 3 },
        star3: { n: 3, e: 5 },
      }
    }
  },
  {
    id: 'char_7', name: '王钰程', title: '红温', cost: 2,
    electives: ['physics','chemistry','biology'],
    baseHP: 32, baseDice: [4,4,6,6,6], atkSlots: 3, defSlots: 3,
    corePositive: { id: 'red_heat_apply', name: '玩（）玩的', desc: '攻击造伤时叠红温 1+2×课程倍率 层' },
    coreNegative: { id: 'red_heat_detonate', name: '你怎么急了', desc: '攻≤防时引爆对方全部红温' },
    support: {
      id: 'sp_heat', name: '红温传导', type: SUPPORT_TYPE.RED_HEAT,
      desc: '阵眼每次攻击给对方叠红温',
      values: {
        star1: { n: 1, e: 2 },
        star2: { n: 2, e: 3 },
        star3: { n: 3, e: 5 },
      },
      special: { star3NoDmgRequired: true } // 3★不造伤也叠
    }
  },
  {
    id: 'char_15', name: '余汉', title: '妈妈', cost: 2,
    electives: ['physics','chemistry','biology'],
    baseHP: 35, baseDice: [4,6,6,8], atkSlots: 2, defSlots: 3,
    corePositive: { id: 'mama', name: '妈!', desc: '防御溢出时，溢出值×课程倍率转化为治疗量回复自身HP' },
    coreNegative: { id: 'mama_neg', name: '操碎了心', desc: '对HP低于20%的目标造成的伤害固定为1' },
    support: {
      id: 'sp_mama', name: '妈!', type: SUPPORT_TYPE.HEAL_OVERFLOW,
      desc: '阵眼防御溢出时额外回复HP',
      values: {
        star1: { n: 2, e: 3 },
        star2: { n: 3, e: 6 },
        star3: { n: 6, e: 13 },
      }
    }
  },

  // ════════ 3 费 ════════
  {
    id: 'char_3', name: '计浩然', title: '体委', cost: 3,
    electives: ['physics','chemistry','biology'],
    baseHP: 33, baseDice: [6,6,6,8], atkSlots: 3, defSlots: 2,
    corePositive: { id: 'no_reroll_bonus', name: '记号', desc: '攻击+1重投；选中骰全奇数时参与骰面永久+2' },
    coreNegative: { id: 'reroll_penalty', name: '体力透支', desc: '防御重投后防御力永久-2' },
    support: {
      id: 'sp_odd', name: '体委督促', type: SUPPORT_TYPE.ALL_ODD_ATK,
      desc: '阵眼攻击选中的骰子全为奇数时，攻击力额外增加',
      values: {
        star1: { n: 3, e: 6 },
        star2: { n: 6, e: 13 },
        star3: { n: 10, e: 20 },
      }
    }
  },
  {
    id: 'char_10', name: '殷泽轩', title: '隐藏者', cost: 3,
    electives: ['physics','chemistry','geography'],
    baseHP: 33, baseDice: [8,8,8,8], atkSlots: 3, defSlots: 3,
    corePositive: { id: 'stealth_strike', name: '隐藏信息', desc: '对方无法查看HP与掷骰；攻击力+2×课程倍率' },
    coreNegative: { id: 'vulnerable', name: '???', desc: '受到伤害时额外+2×课程倍率' },
    support: {
      id: 'sp_stealth', name: '暗影加持', type: SUPPORT_TYPE.FLAT_ATK_CHANCE,
      desc: '每回合50%概率：阵眼攻击力增加',
      values: {
        star1: { n: 2, e: 3 },
        star2: { n: 3, e: 5 },
        star3: { n: 4, e: 8 },
      },
      special: { triggerChance: 0.5 }
    }
  },
  {
    id: 'char_16', name: '张锦元', title: '喵', cost: 3,
    electives: ['physics','chemistry','biology'],
    baseHP: 25, baseDice: [6,6,8,10], atkSlots: 2, defSlots: 3,
    corePositive: { id: 'nine_lives', name: '九条命', desc: '首次HP归零时复活，恢复9HP，骰池全部升级为D10' },
    coreNegative: { id: 'sleepy', name: '贪睡', desc: '战斗前2回合攻防各-3' },
    support: {
      id: 'sp_revive', name: '九条命', type: SUPPORT_TYPE.REVIVE,
      desc: '阵眼首次HP归零时复活',
      values: {
        star1: { n: 4, e: 8 },
        star2: { n: 8, e: 17 },
        star3: { n: 12, e: 25 },
      },
      special: { star3DiceBoost: { n: 2, e: 8 }, star3DiceCount: 2 }
      // 3★复活后随机2颗骰子面数+2(normal)/+8(env)
    }
  },
  {
    id: 'char_17', name: '谢睿琦', title: '贴纸狂魔', cost: 3,
    electives: ['physics','chemistry','biology'],
    baseHP: 33, baseDice: [6,6,6,8], atkSlots: 3, defSlots: 2,
    corePositive: { id: 'sticker', name: '背后贴贴画', desc: '每次造伤贴1张贴画，3张引爆（30%当前HP + 3层红温）' },
    coreNegative: { id: 'sticker_neg', name: '被发现了!', desc: '受伤≥10时自己也被贴1张，3张引爆自身' },
    support: {
      id: 'sp_sticker', name: '背后贴贴画', type: SUPPORT_TYPE.STICKER,
      desc: '阵眼造成伤害时给对方贴贴画，达到阈值引爆',
      values: {
        star1: { n: { threshold: 4, pct: 12 }, e: { threshold: 3, pct: 25 } },
        star2: { n: { threshold: 3, pct: 17 }, e: { threshold: 3, pct: 34 } },
        star3: { n: { threshold: 3, pct: 25 }, e: { threshold: 2, pct: 34 } },
      }
    }
  },

  // ════════ 4 费 ════════
  {
    id: 'char_11', name: '姜鹏泽', title: '文科之光', cost: 4,
    electives: ['politics','history','geography'],
    baseHP: 28, baseDice: [4,4,6,6], atkSlots: 3, defSlots: 3,
    corePositive: { id: 'liberal_arts', name: '文科之光', desc: '骰子点数始终乘以课程倍率' },
    coreNegative: { id: 'first_blood', name: '偏科', desc: '首次受伤后防御选骰永久-1' },
    support: {
      id: 'sp_arts', name: '文科光环', type: SUPPORT_TYPE.COURSE_MULT,
      desc: '阵眼的课程倍率增加',
      values: {
        star1: { n: 0.32, e: 0.64 },
        star2: { n: 0.43, e: 0.85 },
        star3: { n: 0.43, e: 1.28 },
      }
    }
  },
  {
    id: 'char_18', name: '廖展韬', title: '大文豪', cost: 4,
    electives: ['physics','chemistry','geography'],
    baseHP: 34, baseDice: [8,8,8,8], atkSlots: 3, defSlots: 2,
    corePositive: { id: 'invert_die', name: '字斟句酌', desc: '每次掷骰后，自动将最小骰子点数反转（新=面值+1-旧）' },
    coreNegative: { id: 'deep_thought', name: '深度思考', desc: '每次反转后，对方永久获得+1固定减伤（无上限累加）' },
    support: {
      id: 'sp_invert', name: '字斟句酌', type: SUPPORT_TYPE.MIN_DIE_BOOST,
      desc: '阵眼每次掷骰后，最小骰子点数增加',
      values: {
        star1: { n: 2, e: 3 },
        star2: { n: 3, e: 5 },
        star3: { n: 4, e: 8 },
      }
    }
  },

  // ════════ 5 费 ════════
  {
    id: 'char_12', name: '张楚唯', title: 'hammer', cost: 5,
    electives: ['physics','chemistry','biology'],
    baseHP: 37, baseDice: [6,6,6,6,8], atkSlots: 3, defSlots: 3,
    corePositive: { id: 'extra_turn', name: '死磕', desc: '防御受伤≥8时获得额外攻击回合（重投+2，骰面+2）' },
    coreNegative: { id: 'back_pain', name: '腰疼？', desc: '每次死磕后防御选骰永久-1' },
    support: {
      id: 'sp_zcw', name: '???', type: SUPPORT_TYPE.LEGENDARY,
      desc: '传说级辅阵技',
      values: {
        star1: {
          n: { type: 'xp_and_env_override', xpPerNode: 8, envOverride: true },
          e: { type: 'xp_and_env_override', xpPerNode: 8, envOverride: true, bonusRerolls: 2 },
        },
        star2: {
          n: { type: 'grant_chars', maxCost: 2, grantStar: 2, enableBeverageShop: true },
          e: { type: 'grant_chars', maxCost: 2, grantStar: 2, enableBeverageShop: true, xpPerNode: 8 },
        },
        star3: {
          n: { type: 'copy_supports', electiveFilter: ['physics','chemistry','biology'], copyStar: 1, autoMaxLevel: true },
          e: { type: 'copy_supports', electiveFilter: ['physics','chemistry','biology'], copyStar: 3, autoMaxLevel: true },
        },
      }
    }
  },
  {
    id: 'char_14', name: '周煊声', title: '天子', cost: 5,
    electives: ['physics','chemistry','biology'],
    baseHP: 30, baseDice: [4,6,6,8], atkSlots: 3, defSlots: 3,
    corePositive: { id: 'buy_water', name: '买水', desc: '跳过攻击获得蓄势（最多2层），爆发时每层+8伤害+破防' },
    coreNegative: { id: 'caught', name: '被发现', desc: '每层蓄势使防御受伤额外+3' },
    support: {
      id: 'sp_zxs', name: '太上皇!', type: SUPPORT_TYPE.LEGENDARY,
      desc: '传说级辅阵技',
      values: {
        star1: {
          n: { type: 'gold_on_acquire', gold: 5, chargeEvery: 3 },
          e: { type: 'gold_on_acquire', gold: 5, chargeEvery: 2 },
        },
        star2: {
          n: { type: 'grant_chars', maxCost: 2, grantStar: 2, enableBeverageShop: true, beverageChance: 0.1 },
          e: { type: 'grant_chars', maxCost: 2, grantStar: 2, enableBeverageShop: true, beverageChance: 0.1, chargeEvery: 1 },
        },
        star3: {
          n: { type: 'ultimate', gold: 50, grantAllMaxCost: 3, grantStar: 3 },
          e: { type: 'ultimate', gold: 50, grantAllMaxCost: 3, grantStar: 3, doubleSupports: true },
        },
      }
    }
  },
];

/** 按 ID 查角色 */
export const AC_CHAR_MAP = Object.fromEntries(AC_CHARS.map(c => [c.id, c]));

/** 按费用分组 */
export const AC_CHARS_BY_COST = {};
for (let cost = 1; cost <= 5; cost++) {
  AC_CHARS_BY_COST[cost] = AC_CHARS.filter(c => c.cost === cost);
}

/** 升星时属性缩放 */
export const STAR_SCALE = {
  hp:   { 1: 1.0, 2: 1.8, 3: 3.2 },
  dice: { 1: 0,   2: 2,   3: 4   }, // 每颗骰子面数 +X
};

/**
 * 计算辅阵技实际数值
 * @param {object} char - 角色配置
 * @param {number} star - 当前星级 (1/2/3)
 * @param {string} slot - 放置的辅阵位科目
 * @param {string} planeEnv - 当前位面的课程环境
 * @returns {object|null} 有效的辅阵数值，null表示无效果
 */
export function getSupportValue(char, star, slot, planeEnv) {
  if (!char?.support) return null;
  const matched = char.electives.includes(slot);
  const envMatch = planeEnv === slot;

  if (envMatch && matched) {
    // 200% — 使用 env 值
    return char.support.values[`star${star}`]?.e ?? null;
  } else if (matched) {
    // 100% — 使用 normal 值
    return char.support.values[`star${star}`]?.n ?? null;
  } else {
    // 降一星
    if (star <= 1) return null; // 1★不匹配=无效果
    return char.support.values[`star${star - 1}`]?.n ?? null;
  }
}
