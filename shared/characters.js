// ============================================================
// 校园战力党 — 角色卡定义
// ============================================================

/**
 * 技能 ID 常量
 * 引擎 (engine.js) 中会根据这些 ID 做具体的判定和效果结算
 */
export const SKILL = {
  // 正面技能
  ALL_EVEN_BONUS: 'all_even_bonus',        // 攻击骰全偶数时加伤害
  SAME_FACE_PIERCE: 'same_face_pierce',    // 攻击骰点数相同时穿透
  NO_REROLL_BONUS: 'no_reroll_bonus',      // 未重投时加伤害
  STAR_SHOWOFF: 'star_showoff',            // 观星 & 显眼包复合技能
  COMMANDER_RECRUIT: 'commander_recruit',  // 团长大人！防守成功拉人

  // 负面技能
  PERIODIC_DEF_LOSS: 'periodic_def_loss',  // 每 N 回合扣防御
  LOW_ROLL_SELF_DMG: 'low_roll_self_dmg',  // 攻击骰总和过低时自伤
  REROLL_PENALTY: 'reroll_penalty',        // 攻击时重投导致防御降低
  SUGAR_CRASH: 'sugar_crash',              // 犯糖 (受大伤后获得负面状态)
  UNSUSTAINABLE: 'unsustainable',          // 不可持续发展
  TALENTED: 'talented',                    // 天赋怪 (受到伤害减免)
  ALLERGY: 'allergy',                      // 过敏 (概率攻击锁定)
  NOOB: 'noob',                            // 杂鱼 (攻击被防住反噬)
};

/**
 * 角色卡列表（初始 2 张测试卡）
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
 *   atkSlots     攻击时可选择的骰子数
 *   defSlots     防御时可选择的骰子数
 *   positiveSkill  正面技能 { id, name, desc, baseValue }
 *   negativeSkill  负面技能 { id, name, desc, baseValue, interval?, threshold? }
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
    dicePool: [4, 4, 6, 6],
    atkSlots: 3,
    defSlots: 2,
    positiveSkill: {
      id: SKILL.NO_REROLL_BONUS,
      name: '记号',
      desc: '本轮未重投，则本局中两颗随机骰子的最高面数永久+2',
      baseValue: 2,
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
    subjects: ['physics', 'chemistry', 'geography'],
    electives: ['physics', 'chemistry', 'geography'],
    image: '/photos/whd.jpg',
    hp: 30,
    dicePool: [4, 4, 4, 6, 6],
    atkSlots: 4,
    defSlots: 3,
    positiveSkill: {
      id: SKILL.STAR_SHOWOFF,
      name: '观星 & 显眼包',
      desc: '攻击回合开始时+2次重投。若攻击确认时选取的4个骰子极差<=2，最终伤害乘以 (0.5+课程倍率)',
    },
    negativeSkill: {
      id: SKILL.SUGAR_CRASH,
      name: '犯糖',
      desc: '单次受防守伤害>=8时，获得1整轮[犯糖]：禁止重投，且下个攻击回合开始时自伤 4×倍率',
    },
  },
  {
    id: 'char_5',
    name: '赵恩培',
    title: '团长',
    subjects: ['physics', 'chemistry', 'biology'],
    electives: ['physics', 'chemistry', 'biology'],
    image: '/photos/zep.jpg',
    hp: 28,
    dicePool: [4, 4, 4, 4],
    atkSlots: -1, // -1 代表无上限
    defSlots: 4,
    positiveSkill: {
      id: SKILL.COMMANDER_RECRUIT,
      name: '团长大人！',
      desc: '若防御点数 > 对方攻击点数，立刻将一枚 4/6/8 面骰子永久加入骰池（面数取决于当前课程倍率）',
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
    subjects: ['physics', 'chemistry', 'biology'],
    electives: ['physics', 'chemistry', 'biology'],
    image: '/photos/hjc.png',
    hp: 22,
    dicePool: [8, 10, 10, 12],
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
      desc: '过敏: 攻击开始有10%概率锁定伤害为 2/4/8; 杂鱼: 若攻击力 < 对方防御力，自身血量减半 (向上取整)',
    },
  },
];
/** 按 ID 快速查找角色 */
export const characterMap = Object.fromEntries(
  characters.map((c) => [c.id, c])
);
