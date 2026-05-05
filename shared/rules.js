// ============================================================
// 校园战力党 — 共享常量与规则
// ============================================================

/**
 * 全部具体科目 (15门)
 * 键 = 内部 ID，值 = { label, icon, category }
 */
export const SUBJECTS = {
  // ── 主科 (CORE) ──
  chinese:    { label: '语文', icon: '📚', category: 'core' },
  math:       { label: '数学', icon: '📐', category: 'core' },
  english:    { label: '英语', icon: '🔤', category: 'core' },
  // ── 选科 (ELECTIVE) ──
  physics:    { label: '物理', icon: '⚡', category: 'elective' },
  chemistry:  { label: '化学', icon: '🧪', category: 'elective' },
  biology:    { label: '生物', icon: '🧬', category: 'elective' },
  politics:   { label: '政治', icon: '⚖️', category: 'elective' },
  history:    { label: '历史', icon: '📜', category: 'elective' },
  geography:  { label: '地理', icon: '🌍', category: 'elective' },
  // ── 副科 (MINOR) ──
  music:      { label: '音乐', icon: '🎵', category: 'minor' },
  art:        { label: '美术', icon: '🎨', category: 'minor' },
  it:         { label: '信息', icon: '💻', category: 'minor' },
  tech:       { label: '通技', icon: '🔧', category: 'minor' },
  pe:         { label: '体育', icon: '🏃', category: 'minor' },
  study:      { label: '自习', icon: '📖', category: 'minor' },
};

/** 所有主科 ID */
export const CORE_SUBJECTS = Object.entries(SUBJECTS)
  .filter(([, v]) => v.category === 'core').map(([k]) => k);

/** 所有选科 ID */
export const ELECTIVE_SUBJECTS = Object.entries(SUBJECTS)
  .filter(([, v]) => v.category === 'elective').map(([k]) => k);

/** 所有副科 ID */
export const MINOR_SUBJECTS = Object.entries(SUBJECTS)
  .filter(([, v]) => v.category === 'minor').map(([k]) => k);

/** 游戏阶段 */
export const PHASE = {
  WAITING: 'waiting',
  PREPARATION: 'preparation',
  BATTLE: 'battle',
  GAME_OVER: 'game_over',
};

/** 游戏模式 */
export const GAME_MODE = {
  MODE_1V1: '1v1',
  MODE_FFA: 'sanguosha',
};

/** 身份 (SanGuoSha FFA 模式专属) */
export const IDENTITY = {
  LORD: 'lord',         // 主公
  LOYALIST: 'loyalist', // 忠臣
  SPY: 'spy',           // 内奸
  REBEL: 'rebel',       // 反贼
};

/** 固定配置 */
export const GAME_CONFIG = {
  CLASSES_PER_GAME: 6,
  SUBROUNDS_PER_CLASS: 2,
  REROLLS_PER_GAME: 3,
};

/**
 * 计算技能倍率
 *
 * @param {string[]} subjects  角色的完整课表 (含语数英 + 3选科)
 * @param {string}   subject   当前这节课的科目 ID
 * @returns {number} 2 = 主场, 1 = 中立(副科), 0.5 = 客场
 */
export function getSkillMultiplier(subjects, subject) {
  if (!subjects || !subject) return 1;
  const info = SUBJECTS[subject];
  if (!info) return 1;
  // 副科永远 ×1
  if (info.category === 'minor') return 1;
  // 如果这门课在角色的 subjects 里 → 主场
  if (subjects.includes(subject)) return 2;
  // 否则 → 客场
  return 0.5;
}

/**
 * 获取科目的显示文本
 */
export function getSubjectLabel(subjectId) {
  const s = SUBJECTS[subjectId];
  return s ? `${s.icon} ${s.label}` : subjectId;
}

/**
 * 获取科目的 emoji 图标
 */
export function getSubjectIcon(subjectId) {
  const s = SUBJECTS[subjectId];
  return s ? s.icon : '📝';
}

/** 骰子颜色映射 (按面数) */
export const DICE_COLORS = {
  4:  { border: '#38b2ac', bg: '#e6fffa', label: '4' },
  6:  { border: '#4299e1', bg: '#ebf8ff', label: '6' },
  8:  { border: '#9f7aea', bg: '#faf5ff', label: '8' },
  10: { border: '#ed8936', bg: '#fffaf0', label: '10' },
  12: { border: '#ecc94b', bg: '#fffff0', label: '12' },
  14: { border: '#e53e3e', bg: '#fff5f5', label: '14' },
  16: { border: '#dd6b20', bg: '#fffff0', label: '16' },
  18: { border: '#3182ce', bg: '#ebf8ff', label: '18' },
  20: { border: '#805ad5', bg: '#faf5ff', label: '20' },
};
