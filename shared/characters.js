// ============================================================
// 校园战力党 — 角色卡定义
// ============================================================

/**
 * 技能 ID 常量
 * 引擎 (engine.js) 中会根据这些 ID 做具体的判定和效果结算
 */
export const SKILL = {
  // 正面技能
  NO_REROLL_BONUS: 'no_reroll_bonus',      // 记号 (未重投时选中骰+2)
  STAR_SHOWOFF: 'star_showoff',            // 观星 & 显眼包复合技能
  COMMANDER_RECRUIT: 'commander_recruit',  // 团长大人！未重投时拉人
  TALENTED: 'talented',                    // 天赋怪 (受到伤害减免)
  RED_HEAT_APPLY: 'red_heat_apply',        // 玩战雷玩的 (叠红温)

  // 负面技能
  REROLL_PENALTY: 'reroll_penalty',        // 体力透支 (重投永久扣防)
  SUGAR_CRASH: 'sugar_crash',              // 犯糖 (受大伤后获得负面状态)
  UNSUSTAINABLE: 'unsustainable',          // 不可持续发展
  RED_HEAT_DETONATE: 'red_heat_detonate',  // 你怎么急了 (引爆红温)

  // 新角色技能
  GAL_PLAYER: 'gal_player',                // 玩gal玩的 (李灿: 反击 + 献祭回血)
  EAT_IT: 'eat_it',                        // 吃掉! (曾无畏: 将对方最大骰子改为2)
  STEALTH_STRIKE: 'stealth_strike',        // 对方无法得知信息 + 攻击加成 (殷泽轩)
  VULNERABLE: 'vulnerable',                // 受到伤害增加 (殷泽轩)
  D10_LIMIT: 'd10_limit',                  // 防御时只能选一个D10 (曾无畏)
  LIBERAL_ARTS: 'liberal_arts',              // 文科之光 (姜鹏泽: 骰子点数×课程倍率)
  FIRST_BLOOD: 'first_blood',               // 偏科 (姜鹏泽: 首次掉血后防御选骰-1)
  EXTRA_TURN: 'extra_turn',                  // 逆袭 (张楚唯: 受重伤后获得额外攻击回合)
  BACK_PAIN: 'back_pain',                    // 腰疼？ (张楚唯: 触发额外回合后防御-1)
  
  // 大乱斗特供
  RAPPER: 'rapper',                          // rapper (刘奕辰: 群攻AOE)
  FORGET_LYRICS: 'forget_lyrics',            // 忘词 (刘奕辰: 重投后根据未受伤害人数扣血)
};

/**
 * 角色卡列表
 *
 * 字段说明：
 *   id           唯一标识
 *   name         显示名称
 *   title        称号（二级标题）
 *   subjects     该角色的完整课表 (语数英 + 3门选科)
 *   electives    仅用于展示的选科标签 (不含语数英)
 *   image        角色头像路径
 *   hp           生命值
 *   dicePool     骰池 [面数, ...]
 *   atkSlots     攻击时可选择的骰子数 (-1=无上限)
 *   defSlots     防御时可选择的骰子数
 *   rerollAll    若为 true, 重投时所有骰子均参与
 *   positiveSkill  正面技能
 *   negativeSkill  负面技能
 */
export const characters = [
  {
    id: 'char_3',
    name: '计浩然',
    title: '体委',
    subjects: ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology'],
    electives: ['physics', 'chemistry', 'biology'],
    image: '/photos/jihaoran.png',
    hp: 33,
    dicePool: [6, 6, 6, 8],
    atkSlots: 3,
    defSlots: 2,
    positiveSkill: {
      id: SKILL.NO_REROLL_BONUS,
      name: '记号',
      desc: '<ul><li>攻击开始时，获得 <span style="color:var(--rose-gold)">+1</span> 次重投机会</li><li>若选择防守的点数全为奇数，参与的骰子面数永久 <span style="color:var(--rose-gold)">+2</span> (无上限)</li></ul>',
    },
    negativeSkill: {
      id: SKILL.REROLL_PENALTY,
      name: '体力透支',
      desc: '<ul><li>若防御时使用了重投，防御力永久 <span style="color:var(--rose-gold)">-2</span></li></ul>',
      baseValue: 2,
    },
  },
  {
    id: 'char_4',
    name: '王鹤迪',
    title: '那个显眼包',
    subjects: ['chinese', 'math', 'english', 'physics', 'chemistry', 'geography'],
    electives: ['physics', 'chemistry', 'geography'],
    image: '/photos/whd.jpg',
    hp: 30,
    dicePool: [4, 4, 4, 6, 6],
    atkSlots: 4,
    defSlots: 3,
    rerollAll: true,
    positiveSkill: {
      id: SKILL.STAR_SHOWOFF,
      name: '观星 & 显眼包',
      desc: '<ul><li>攻击回合开始时，获得 <span style="color:var(--rose-gold)">+2</span> 次重投机会</li><li>若选取的4个骰子极差 ≤ 2，最终伤害乘以 <span style="color:var(--rose-gold)">(0.5 + 课程倍率)</span></li></ul>',
    },
    negativeSkill: {
      id: SKILL.SUGAR_CRASH,
      name: '犯糖 & 全投',
      desc: '<ul><li>受到最终伤害 ≥ 8 时，获得1轮【犯糖】状态</li><li>【犯糖】：期间无法重投，且回合开始时直接受到 <span style="color:var(--rose-gold)">4 × 课程倍率</span> 的伤害</li><li>重投时，必须重投所有骰子</li></ul>',
    },
  },
  {
    id: 'char_5',
    name: '赵恩培',
    title: '团长',
    subjects: ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology'],
    electives: ['physics', 'chemistry', 'biology'],
    image: '/photos/zep.jpg',
    hp: 40,
    dicePool: [4, 4, 4, 4],
    atkSlots: -1,
    defSlots: 4,
    positiveSkill: {
      id: SKILL.COMMANDER_RECRUIT,
      name: '团长大人！',
      desc: '<ul><li>防御时若未重投，将一枚 <span style="color:var(--rose-gold)">4/6/8</span> 面骰子永久加入骰池（面数由课程倍率 0.5/1/2 决定）</li></ul>',
    },
    negativeSkill: {
      id: SKILL.UNSUSTAINABLE,
      name: '不可持续发展',
      desc: '<ul><li>每次攻击回合开始时，立刻受到 <span style="color:var(--rose-gold)">2 × 课程倍率</span> 的伤害</li></ul>',
    },
  },
  {
    id: 'char_6',
    name: '黄佳程',
    title: '+*',
    subjects: ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology'],
    electives: ['physics', 'chemistry', 'biology'],
    image: '/photos/hjc.jpg',
    hp: 22,
    dicePool: [6, 8, 10, 12],
    atkSlots: 3,
    defSlots: 3,
    positiveSkill: {
      id: SKILL.TALENTED,
      name: '天赋怪',
      desc: '<ul><li>受到的最终伤害按比例减免，变为原伤害的 <span style="color:var(--rose-gold)">1 / 0.75 / 0.5</span> 倍（由课程倍率 0.5/1/2 决定）</li></ul>',
    },
    negativeSkill: {
      id: 'hjc_neg',
      name: '过敏 & 杂鱼',
      desc: '<ul><li>【过敏】：攻击开始时，有 10% 概率锁定攻击力为 <span style="color:var(--rose-gold)">2/4/8</span>（由课程倍率 0.5/1/2 决定）</li><li>【杂鱼】：若攻击力 < 对方防御力，自身当前 HP 减半</li></ul>',
    },
  },
  {
    id: 'char_7',
    name: '王钰程',
    title: '不知道称号',
    subjects: ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology'],
    electives: ['physics', 'chemistry', 'biology'],
    image: '/photos/wyc.jpg',
    hp: 32,
    dicePool: [4, 4, 6, 6, 6],
    atkSlots: 3,
    defSlots: 3,
    positiveSkill: {
      id: SKILL.RED_HEAT_APPLY,
      name: '玩（）玩的',
      desc: '<ul><li>攻击造成伤害时，对对方施加 <span style="color:var(--rose-gold)">1 + 2×课程倍率</span> 层【红温】</li><li>【红温】：携带者攻击回合开始时受到等同层数的伤害，随后层数 -2</li></ul>',
    },
    negativeSkill: {
      id: SKILL.RED_HEAT_DETONATE,
      name: '你怎么急了',
      desc: '<ul><li>若攻击力 ≤ 对方防御力，立刻对对方造成等同于其当前【红温】层数的伤害，随后对方【红温】归零</li></ul>',
    },
  },
  {
    id: 'char_8',
    name: '李灿',
    title: '玩gal玩的',
    subjects: ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology'],
    electives: ['physics', 'chemistry', 'biology'],
    image: '/photos/lc.jpg',
    hp: 27,
    dicePool: [6, 6, 6, 8],
    atkSlots: 2,
    defSlots: 4,
    positiveSkill: {
      id: SKILL.GAL_PLAYER,
      name: '休眠火山',
      desc: '<ul><li>防御时，若防御力 > 对方攻击力（且对方未穿透），立刻对对方造成差值的反击伤害</li><li>确认防御前，可点击【献祭】将其中一颗防守骰子变为1点，并回复其原点数 <span style="color:var(--rose-gold)">-1</span> 的 HP</li></ul>',
    },
    negativeSkill: null,
  },
  {
    id: 'char_9',
    name: '曾无畏',
    title: '吃掉!',
    subjects: ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology'],
    electives: ['physics', 'chemistry', 'biology'],
    image: '/photos/zww.png',
    hp: 31,
    dicePool: [6, 10, 10],
    atkSlots: 3,
    defSlots: 2,
    positiveSkill: {
      id: SKILL.EAT_IT,
      name: '吃掉!',
      desc: '<ul><li>防御时，将对方保留的最大骰子强制变为 <span style="color:var(--rose-gold)">2</span> 点</li></ul>',
    },
    negativeSkill: {
      id: SKILL.D10_LIMIT,
      name: '???',
      desc: '<ul><li>防御时，最多只能选中保留 <span style="color:var(--rose-gold)">1</span> 个 D10 骰子</li></ul>',
    },
  },
  {
    id: 'char_10',
    name: '殷泽轩',
    title: '隐藏者',
    subjects: ['chinese', 'math', 'english', 'physics', 'chemistry', 'geography'],
    electives: ['physics', 'chemistry', 'geography'],
    image: '/photos/yzx.jpg',
    hp: 33,
    dicePool: [8, 8, 8, 8],
    atkSlots: 3,
    defSlots: 3,
    positiveSkill: {
      id: SKILL.STEALTH_STRIKE,
      name: '隐藏信息',
      desc: '<ul><li>对方无法查看你的 HP 与掷骰点数</li><li>攻击力额外 <span style="color:var(--rose-gold)">+ 2 × 课程倍率</span></li></ul>',
    },
    negativeSkill: {
      id: SKILL.VULNERABLE,
      name: '???',
      desc: '<ul><li>受到最终伤害时（即伤害 > 0），伤害值额外 <span style="color:var(--rose-gold)">+ 2 × 课程倍率</span></li></ul>',
    },
  },
  {
    id: 'char_11',
    name: '姜鹏泽',
    title: '文科之光',
    subjects: ['chinese', 'math', 'english', 'politics', 'history', 'geography'],
    electives: ['politics', 'history', 'geography'],
    image: '/photos/jpz.jpg',
    hp: 28,
    dicePool: [4, 4, 6, 6],
    atkSlots: 3,
    defSlots: 3,
    positiveSkill: {
      id: SKILL.LIBERAL_ARTS,
      name: '文科之光',
      desc: '<ul><li>你的骰子点数始终乘以 <span style="color:var(--rose-gold)">课程倍率</span>（主场 ×2，中立 ×1，客场 ×0.5）</li></ul>',
    },
    negativeSkill: {
      id: SKILL.FIRST_BLOOD,
      name: '偏科',
      desc: '<ul><li>首次受到最终伤害时，防御能保留的骰子数永久 <span style="color:var(--rose-gold)">-1</span></li></ul>',
    },
  },
  {
    id: 'char_12',
    name: '张楚唯',
    title: 'hammer',
    subjects: ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology'],
    electives: ['physics', 'chemistry', 'biology'],
    image: '/photos/zcw.jpg',
    hp: 37,
    dicePool: [6, 6, 6, 6, 8],
    atkSlots: 3,
    defSlots: 3,
    positiveSkill: {
      id: SKILL.EXTRA_TURN,
      name: '死磕',
      desc: '<ul><li>防御时若受到 ≥ 8 点的最终伤害，立刻获得一个额外攻击回合</li><li>额外回合中：重投次数 <span style="color:var(--rose-gold)">+2</span>，所有骰子面数临时 <span style="color:var(--rose-gold)">+2</span></li></ul>',
    },
    negativeSkill: {
      id: SKILL.BACK_PAIN,
      name: '腰疼？',
      desc: '<ul><li>每次触发【死磕】获得额外回合后，防御能保留的骰子数永久 <span style="color:var(--rose-gold)">-1</span></li></ul>',
    },
  },
  {
    id: 'char_13',
    name: '[十班] 刘奕辰',
    title: 'Rapper',
    subjects: ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology'],
    electives: ['physics', 'chemistry', 'biology'],
    image: '/photos/lyc.jpg', // 需补充图片
    hp: 36,
    dicePool: [4, 8, 12],
    atkSlots: 3,
    defSlots: 1,
    ffaOnly: true, // 仅限三国杀大乱斗模式
    positiveSkill: {
      id: SKILL.RAPPER,
      name: 'rapper',
      desc: '<ul><li>攻击阶段，指定的主目标承受 <span style="color:var(--rose-gold)">100%</span> 伤害</li><li>其余所有存活玩家成为副目标，强制进行防守，并承受 <span style="color:var(--rose-gold)">33% / 50% / 66%</span>（由课程倍率 0.5/1/2 决定）的伤害</li></ul>',
    },
    negativeSkill: {
      id: SKILL.FORGET_LYRICS,
      name: '忘词',
      desc: '<ul><li>如果攻击时使用了重投，结算时每有一个目标（含主副）未受到伤害，自身扣除 <span style="color:var(--rose-gold)">2 × 课程倍率</span> 的 HP</li></ul>',
    },
  },
];
/** 按 ID 快速查找角色 */
export const characterMap = Object.fromEntries(
  characters.map((c) => [c.id, c])
);
