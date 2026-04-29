// ============================================================
// 校园战力党 — PVE AI 对手
// ============================================================
import { characters } from '../../shared/characters.js';
import { getSkillMultiplier } from '../../shared/rules.js';

/**
 * AI 选卡策略：根据课程表选择亲和度最高的角色
 */
export function aiSelectCard(schedule) {
  let bestId = characters[0].id;
  let bestScore = -Infinity;

  for (const char of characters) {
    let score = 0;
    for (const subject of schedule) {
      score += getSkillMultiplier(char.subjects, subject);
    }
    // 加一点随机性
    score += Math.random() * 0.5;

    if (score > bestScore) {
      bestScore = score;
      bestId = char.id;
    }
  }

  return bestId;
}
