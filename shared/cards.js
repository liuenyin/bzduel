// ============================================================
// 校园战力党 — 战术卡牌数据定义 (共 60 张)
// 包含 45 张学科卡 (15科目×3) + 15 张通用卡
// ============================================================

export const CARD_TYPE = {
  BLESSING: 'blessing', // 祝福 (当天生效)
  BUFF: 'buff',         // 增益 (本回合生效)
  DEBUFF: 'debuff',     // 减益 (本回合生效)
  OTHER: 'other',       // 其他 (本回合生效)
};

export const CARD_TYPE_LABELS = {
  blessing: '祝福',
  buff: '增益',
  debuff: '减益',
  other: '其他',
};

/**
 * 战术卡牌库
 */
export const CARDS = [
  // ── 语文 (chinese) ──
  { id: 'card_chi_1', name: '语文-祝福', subject: 'chinese', type: CARD_TYPE.BLESSING, tpCost: 2, desc: '当天语文课：掷骰点数和+2，选中的奇数骰减伤+1' },
  { id: 'card_chi_2', name: '语文-增益', subject: 'chinese', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：选中的点数最小骰子自动变为最大面值' },
  { id: 'card_chi_3', name: '语文-减益', subject: 'chinese', type: CARD_TYPE.DEBUFF, tpCost: 2, desc: '本回合：对方投出点数最大的骰子强制变为 2 点' },

  // ── 数学 (math) ──
  { id: 'card_mat_1', name: '数学-祝福', subject: 'math', type: CARD_TYPE.BLESSING, tpCost: 3, desc: '当天数学课：若选中的数字全为质数，跳过对方下一个攻击回合(每节课限1次)' },
  { id: 'card_mat_2', name: '数学-增益', subject: 'math', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：攻击/防御选中的骰子点数总和额外+3' },
  { id: 'card_mat_3', name: '数学-减益', subject: 'math', type: CARD_TYPE.DEBUFF, tpCost: 2, desc: '本回合：对方无法重投，我方攻击无视对方减伤' },

  // ── 英语 (english) ──
  { id: 'card_eng_1', name: '英语-祝福', subject: 'english', type: CARD_TYPE.BLESSING, tpCost: 2, desc: '当天英语课：重投次数上限+2，且重投不触发负面效果' },
  { id: 'card_eng_2', name: '英语-增益', subject: 'english', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：回复自身 5 点生命值' },
  { id: 'card_eng_3', name: '英语-其他', subject: 'english', type: CARD_TYPE.OTHER, tpCost: 1, desc: '本回合：重置当前投出我方与对方的所有骰子' },

  // ── 物理 (physics) ──
  { id: 'card_phy_1', name: '物理-祝福', subject: 'physics', type: CARD_TYPE.BLESSING, tpCost: 2, desc: '当天物理课：选中的偶数骰子点数+2' },
  { id: 'card_phy_2', name: '物理-增益', subject: 'physics', type: CARD_TYPE.BUFF, tpCost: 2, desc: '本回合：造成的伤害附加 3 点固定真实伤害(无视防守)' },
  { id: 'card_phy_3', name: '物理-减益', subject: 'physics', type: CARD_TYPE.DEBUFF, tpCost: 1, desc: '本回合：使对方防御力临时削减 30%' },

  // ── 化学 (chemistry) ──
  { id: 'card_che_1', name: '化学-祝福', subject: 'chemistry', type: CARD_TYPE.BLESSING, tpCost: 2, desc: '当天化学课：给对方造成伤害时，额外叠加 3 层红温' },
  { id: 'card_che_2', name: '化学-增益', subject: 'chemistry', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：清空我方所有负面效果' },
  { id: 'card_che_3', name: '化学-减益', subject: 'chemistry', type: CARD_TYPE.DEBUFF, tpCost: 2, desc: '本回合：引爆对方身上的红温层数' },

  // ── 生物 (biology) ──
  { id: 'card_bio_1', name: '生物-祝福', subject: 'biology', type: CARD_TYPE.BLESSING, tpCost: 2, desc: '当天生物课：受到的伤害减少 3 点(最低为 0)' },
  { id: 'card_bio_2', name: '生物-增益', subject: 'biology', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：防守溢出数值×1.5转化为生命回复' },
  { id: 'card_bio_3', name: '生物-其他', subject: 'biology', type: CARD_TYPE.OTHER, tpCost: 3, desc: '本回合：消耗当前30%生命，造成等量真实伤害(最高10)' },

  // ── 政治 (politics) ──
  { id: 'card_pol_1', name: '政治-祝福', subject: 'politics', type: CARD_TYPE.BLESSING, tpCost: 2, desc: '当天政治课：双方固定加成强制归零，仅结算纯骰点' },
  { id: 'card_pol_2', name: '政治-增益', subject: 'politics', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：防御结算+3' },
  { id: 'card_pol_3', name: '政治-减益', subject: 'politics', type: CARD_TYPE.DEBUFF, tpCost: 2, desc: '本回合：锁定对方本轮输出上限不超过 8 点' },

  // ── 历史 (history) ──
  { id: 'card_his_1', name: '历史-祝福', subject: 'history', type: CARD_TYPE.BLESSING, tpCost: 2, desc: '当天历史课：第一次受到的伤害减半' },
  { id: 'card_his_2', name: '历史-增益', subject: 'history', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：继承上一轮未使用的骰点作为附加输出' },
  { id: 'card_his_3', name: '历史-其他', subject: 'history', type: CARD_TYPE.OTHER, tpCost: 3, desc: '本回合：恢复生命差值至上一轮状态(最高10点)' },

  // ── 地理 (geography) ──
  { id: 'card_geo_1', name: '地理-祝福', subject: 'geography', type: CARD_TYPE.BLESSING, tpCost: 3, desc: '当天地理课：主场倍率提升至×3(附加伤害最高+12)' },
  { id: 'card_geo_2', name: '地理-增益', subject: 'geography', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：所有骰子面数临时+2' },
  { id: 'card_geo_3', name: '地理-减益', subject: 'geography', type: CARD_TYPE.DEBUFF, tpCost: 1, desc: '本回合：对方所有骰子面数临时-2(最低减少至4)' },

  // ── 音乐 (music) ──
  { id: 'card_mus_1', name: '音乐-祝福', subject: 'music', type: CARD_TYPE.BLESSING, tpCost: 1, desc: '当天音乐课：若攻击选中骰极差≤2，伤害提高 30%' },
  { id: 'card_mus_2', name: '音乐-增益', subject: 'music', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：掷出对子(2个相同)时，总输出+4' },
  { id: 'card_mus_3', name: '音乐-其他', subject: 'music', type: CARD_TYPE.OTHER, tpCost: 1, desc: '本回合：将随机一颗骰子强制替换为 D8' },

  // ── 美术 (art) ──
  { id: 'card_art_1', name: '美术-祝福', subject: 'art', type: CARD_TYPE.BLESSING, tpCost: 1, desc: '当天美术课：选骰槽位+1' },
  { id: 'card_art_2', name: '美术-增益', subject: 'art', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：复制对方上一轮投出的最大骰点' },
  { id: 'card_art_3', name: '美术-减益', subject: 'art', type: CARD_TYPE.DEBUFF, tpCost: 1, desc: '本回合：隐藏自身投掷的点数 1 轮' },

  // ── 信息 (it) ──
  { id: 'card_it_1', name: '信息-祝福', subject: 'it', type: CARD_TYPE.BLESSING, tpCost: 2, desc: '当天信息课：选择复制对方的正面技能 1 节课' },
  { id: 'card_it_2', name: '信息-增益', subject: 'it', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：偷取对方 1 点 TP' },
  { id: 'card_it_3', name: '信息-其他', subject: 'it', type: CARD_TYPE.OTHER, tpCost: 1, desc: '本回合：攻击造成伤害-5，无视对方防御' },

  // ── 通技 (tech) ──
  { id: 'card_tec_1', name: '通技-祝福', subject: 'tech', type: CARD_TYPE.BLESSING, tpCost: 1, desc: '当天通技课：固定护甲+2' },
  { id: 'card_tec_2', name: '通技-增益', subject: 'tech', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：最小面数骰子+2' },
  { id: 'card_tec_3', name: '通技-其他', subject: 'tech', type: CARD_TYPE.OTHER, tpCost: 1, desc: '本回合：获得 1 层蓄势' },

  // ── 体育 (pe) ──
  { id: 'card_pe_1', name: '体育-祝福', subject: 'pe', type: CARD_TYPE.BLESSING, tpCost: 3, desc: '当天体育课：选中至少三个奇数时得额外攻击回合(限1次)' },
  { id: 'card_pe_2', name: '体育-增益', subject: 'pe', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：攻击力额外+4' },
  { id: 'card_pe_3', name: '体育-减益', subject: 'pe', type: CARD_TYPE.DEBUFF, tpCost: 1, desc: '本回合：对方永久防御力-2' },

  // ── 自习 (study) ──
  { id: 'card_stu_1', name: '自习-祝福', subject: 'study', type: CARD_TYPE.BLESSING, tpCost: 1, desc: '当天自习课：攻击回合结束后随机获得 1 张战术卡' },
  { id: 'card_stu_2', name: '自习-增益', subject: 'study', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合：无视自己的负面技能' },
  { id: 'card_stu_3', name: '自习-其他', subject: 'study', type: CARD_TYPE.OTHER, tpCost: 1, desc: '本回合：随机获得 1 张战术卡' },

  // ── 通用卡 (15 张) ──
  { id: 'card_gen_01', name: '通用-增益', subject: 'universal', type: CARD_TYPE.BUFF, tpCost: 1, desc: '强行重投指定 1 颗骰子(可指定敌我)' },
  { id: 'card_gen_02', name: '通用-增益', subject: 'universal', type: CARD_TYPE.BUFF, tpCost: 1, desc: '本回合基础攻击/防御总和+2' },
  { id: 'card_gen_03', name: '通用-增益', subject: 'universal', type: CARD_TYPE.BUFF, tpCost: 2, desc: '立刻回复自身 4 点生命值' },
  { id: 'card_gen_04', name: '通用-增益', subject: 'universal', type: CARD_TYPE.BUFF, tpCost: 2, desc: '本回合攻击附带 2 点穿透伤害' },
  { id: 'card_gen_05', name: '通用-增益', subject: 'universal', type: CARD_TYPE.BUFF, tpCost: 2, desc: '本回合防御固定减伤+3' },
  { id: 'card_gen_06', name: '通用-减益', subject: 'universal', type: CARD_TYPE.DEBUFF, tpCost: 1, desc: '使对方本轮最大骰子点数-2' },
  { id: 'card_gen_07', name: '通用-减益', subject: 'universal', type: CARD_TYPE.DEBUFF, tpCost: 2, desc: '扣除对方 1 点 TP' },
  { id: 'card_gen_08', name: '通用-减益', subject: 'universal', type: CARD_TYPE.DEBUFF, tpCost: 2, desc: '使对方本轮防御结算额外受到 2 点伤害' },
  { id: 'card_gen_09', name: '通用-减益', subject: 'universal', type: CARD_TYPE.DEBUFF, tpCost: 1, desc: '使对方本轮无法使用重投' },
  { id: 'card_gen_10', name: '通用-减益', subject: 'universal', type: CARD_TYPE.DEBUFF, tpCost: 2, desc: '给对方施加 2 层红温' },
  { id: 'card_gen_11', name: '通用-其他', subject: 'universal', type: CARD_TYPE.OTHER, tpCost: 1, desc: '弃置手牌中 1 张卡牌，并随机补 1 张卡' },
  { id: 'card_gen_12', name: '通用-其他', subject: 'universal', type: CARD_TYPE.OTHER, tpCost: 1, desc: '获得 1 轮隐蔽(对方看自己的骰子为?)' },
  { id: 'card_gen_13', name: '通用-其他', subject: 'universal', type: CARD_TYPE.OTHER, tpCost: 2, desc: '将本节课选骰槽位临时+1' },
  { id: 'card_gen_14', name: '通用-其他', subject: 'universal', type: CARD_TYPE.OTHER, tpCost: 1, desc: '本轮如果防守无伤，获得 2 TP' },
  { id: 'card_gen_15', name: '通用-其他', subject: 'universal', type: CARD_TYPE.OTHER, tpCost: 2, desc: '本轮如果攻击造成伤害，抽 1 张学科战术卡' },
];

/** 按 ID 快速查找卡牌 */
export const cardMap = Object.fromEntries(CARDS.map(c => [c.id, c]));

/** 抽卡辅助库 */
export function getRandomCard(currentSubject, playerSubjects = []) {
  // 过滤出通用卡 + 当前学科卡
  const pool = CARDS.filter(c => {
    if (c.subject === 'universal') return true;
    if (c.subject === currentSubject && playerSubjects.includes(currentSubject)) return true;
    return false;
  });
  if (pool.length === 0) return CARDS.find(c => c.subject === 'universal');
  return pool[Math.floor(Math.random() * pool.length)];
}
