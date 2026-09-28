import { SKILL } from '../../../shared/characters.js';

export function sealPlayerSkills(player, state) {
  if (!player?.card) return;
  if (!player.skillsSealed) {
    player.sealedSkills = {
      positiveSkill: player.card.positiveSkill || null,
      neutralSkill: player.card.neutralSkill || null,
      negativeSkill: player.card.negativeSkill || null,
    };
    player.card.positiveSkill = null;
    player.card.neutralSkill = null;
    player.card.negativeSkill = null;
  }
  player.skillsSealed = true;
  player.skillsSealedTurnsLeft = 1;
  player.skillsSealedAtRound = state.totalRound;
}

export function restorePlayerSkills(player) {
  if (!player?.skillsSealed) return;
  if (player.card && player.sealedSkills) {
    player.card.positiveSkill = player.sealedSkills.positiveSkill;
    player.card.neutralSkill = player.sealedSkills.neutralSkill;
    player.card.negativeSkill = player.sealedSkills.negativeSkill;
  }
  player.skillsSealed = false;
  player.skillsSealedTurnsLeft = 0;
  player.skillsSealedAtRound = null;
  player.sealedSkills = null;
}

export function removePositiveSkill(player) {
  if (!player?.card) return;
  player.card.positiveSkill = null;
  if (player.sealedSkills) player.sealedSkills.positiveSkill = null;
}

export function reviveNineLives(player) {
  if (player?.hp > 0 || player?.card?.positiveSkill?.id !== SKILL.NINE_LIVES || player.nineLivesUsed) return false;
  player.nineLivesUsed = true;
  player.isDead = false;
  player.hp = 9;
  player.card.dicePool = player.card.dicePool.map(() => 10);
  return true;
}

export function resolvePositiveSkill(skill, multi, rolls, totalRound, turnData) {
  if (!skill) return { triggered: false };
  switch (skill.id) {
    case SKILL.NO_REROLL_BONUS: {
      // 计浩然: 选择的点数全为奇数
      if (rolls && rolls.length > 0 && rolls.every(v => v % 2 !== 0)) {
        return { triggered: true, upgradeDice: true };
      }
      return { triggered: false };
    }
    case SKILL.STAR_SHOWOFF: {
      const max = Math.max(...rolls);
      const min = Math.min(...rolls);
      if (max - min <= 2) {
        return { triggered: true, applyMultiplier: true };
      }
      return { triggered: false };
    }
    default: return { triggered: false };
  }
}

export function resolveNegativeSkill(skill, multi, rolls, round) {
  if (!skill) return { triggered: false };
  switch (skill.id) {
    default: return { triggered: false };
  }
}

export function resolveDefenderNegativeSkill(skill, multi, totalRound, turnData) {
  if (!skill) return { triggered: false };
  switch (skill.id) {
    case SKILL.SLEEPY: {
      if (totalRound <= 1) return { triggered: true, defensePenalty: 3 };
      return { triggered: false };
    }
    case SKILL.REROLL_PENALTY: {
      if (turnData && turnData.hasDefenderRerolled) return { triggered: true, addPermanentPenalty: skill.baseValue };
      return { triggered: false };
    }
    default: return { triggered: false };
  }
}
