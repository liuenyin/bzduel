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
      desc: '攻击开始时+1重投。若选择点数全为奇数，参与骰子永久+2面，无上限',
    },
    negativeSkill: {
      id: SKILL.REROLL_PENALTY,
      name: '体力透支',
      desc: '若防御时使用了重投，防御力永久 -2',
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
    rerollAll: true, // 重投时所有骰子均重投
    positiveSkill: {
      id: SKILL.STAR_SHOWOFF,
      name: '观星 & 显眼包',
      desc: '攻击回合开始时+2次重投。若选取的4个骰子极差<=2，最终伤害乘以课程倍率',
    },
    negativeSkill: {
      id: SKILL.SUGAR_CRASH,
      name: '犯糖 & 全投',
      desc: '受伤>=8时获得1轮[犯糖]；重投时所有骰子均会重投',
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
      desc: '防御时未重投，将一枚 4/6/8 面骰子永久加入骰池（面数取决于课程倍率）',
    },
    negativeSkill: {
      id: SKILL.UNSUSTAINABLE,
      name: '不可持续发展',
      desc: '每次攻击回合开始时，立刻受到 2 × 当前课程倍率 的伤害',
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
      desc: '受到的最终伤害变为原来的 1 / 0.75 / 0.5 倍 (随课程倍率决定)',
    },
    negativeSkill: {
      id: 'hjc_neg',
      name: '过敏 & 杂鱼',
      desc: '过敏: 攻击开始有10%概率锁定伤害为 2/4/8; 杂鱼: 若攻击力 < 对方防御力，自身血量减半',
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
      desc: '攻击造成伤害时，对对方施加 1+2×课程倍率 层[红温]；红温: 攻击回合开始受等同层数伤害，然后减2层',
    },
    negativeSkill: {
      id: SKILL.RED_HEAT_DETONATE,
      name: '你怎么急了',
      desc: '若攻击≤对方防御，立刻对对方造成等同于其红温层数的伤害，然后红温归零',
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
      name: '玩gal玩的',
      desc: '防御时若防守>攻击，反伤差值。防御确认前可点[献祭]将一颗骰子变1，回复等额HP',
    },
    negativeSkill: null,
  },
  {
    id: 'char_9',
    name: '曾无畏',
    title: '吃掉!',
    subjects: ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology'],
    electives: ['physics', 'chemistry', 'biology'],
    image: '/photos/zww.jpg',
    hp: 31,
    dicePool: [6, 10, 10],
    atkSlots: 3,
    defSlots: 2,
    positiveSkill: {
      id: SKILL.EAT_IT,
      name: '吃掉!',
      desc: '防御时，将对方选定的最大骰子强制变为 2',
    },
    negativeSkill: {
      id: SKILL.D10_LIMIT,
      name: '???',
      desc: '防御时，最多只能选中一个 D10 骰子',
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
      desc: '对方无法查看你的HP和掷骰点数；攻击力额外 +2 × 课程倍率',
    },
    negativeSkill: {
      id: SKILL.VULNERABLE,
      name: '???',
      desc: '受到伤害时，最终伤害额外 +2 × 课程倍率',
    },
  },
];
/** 按 ID 快速查找角色 */
export const characterMap = Object.fromEntries(
  characters.map((c) => [c.id, c])
);
