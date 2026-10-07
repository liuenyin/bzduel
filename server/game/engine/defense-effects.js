import { checkElephantCondemn } from './turn-state.js';
import { appendBattleLog } from './battle-log.js';
import { SKILL } from '../../../shared/characters.js';
import { getRandomSubjectCard } from '../../../shared/cards.js';
import { hasNegativeImmunity } from './skills.js';

function geographyExtraDamageCap(state, atk, ar, finalBaseAtk, finalFinalDef, isPierce, tac, damage) {
  const subject = state.schedule?.[state.currentClassIndex];
  const hasBlessing = (atk.activeBlessings || []).some(card => card.id === 'card_geo_1');
  if (subject !== 'geography' || !hasBlessing || !atk.card?.subjects?.includes('geography')) return damage;

  // 地理祝福的 +12 只允许额外固定/机制伤害使用；纯骰部分仍按原结算。
  const recordedBaseAtk = Number.isFinite(ar?.baseAtk) ? ar.baseAtk : finalBaseAtk;
  const recordedFinalAtk = Number.isFinite(ar?.finalAtk) ? ar.finalAtk : finalBaseAtk;
  const attackExtra = Math.max(0, recordedFinalAtk - recordedBaseAtk);
  const pureAttack = Math.max(0, finalBaseAtk - attackExtra);
  const pureDamage = isPierce ? pureAttack : Math.max(0, pureAttack - finalFinalDef);
  const multiplier = Number.isFinite(tac?.damageMultiplier) ? tac.damageMultiplier : 1;
  return Math.min(damage, Math.floor(pureDamage * multiplier) + 12);
}

export function applyDefenseEffects(state, {
  atk, def, ar, subj, atkMulti, defMulti, keptRolls, finalFinalDef,
  finalBaseAtk, isPierce, tac, defTurnCards, atkTurnCards, damage,
  hasDefenderRerolled = state.turnData.hasDefenderRerolled, selfDamage = ar.selfDamage || 0,
}) {
  const attackerNegative = hasNegativeImmunity(atk) ? null : atk.card.negativeSkill?.id;
  const defenderNegative = hasNegativeImmunity(def) ? null : def.card.negativeSkill?.id;

  // 生物-增益 (card_bio_2): 防守溢出数值×1.5转化为生命回复
  if (defTurnCards.some(c => c.id === 'card_bio_2') && finalFinalDef > finalBaseAtk && !isPierce) {
    const overflow = finalFinalDef - finalBaseAtk;
    const bioHeal = Math.floor(overflow * 1.5);
    if (bioHeal > 0) {
      def.hp = Math.min(def.maxHp, def.hp + bioHeal);
    }
  }

  // 廖展韬深度思考: 对方的永久减伤
  if (!tac.ignoreReduction && damage > 0 && (def.invertReduction || 0) > 0) {
    damage = Math.max(0, damage - def.invertReduction);
  }

  // 殷泽轩负面: 受到伤害时，最终伤害额外 +2 × 倍率
  if (damage > 0 && def.card.neutralSkill?.id === SKILL.VULNERABLE) {
    damage += Math.floor(2 * defMulti);
  }

  // 黄佳程正面: 天赋怪 (减伤)
  let talentTriggered = false;
  if (!tac.ignoreReduction && damage > 0 && def.card.positiveSkill?.id === SKILL.TALENTED) {
    const ratio = defMulti === 2 ? 0.5 : (defMulti === 1 ? 0.75 : 1);
    if (ratio < 1) {
      damage = Math.floor(damage * ratio);
      talentTriggered = true;
    }
  }

  // 周煊声负面: 被发现 (每层蓄势+3伤害)
  if (damage > 0 && defenderNegative === SKILL.CAUGHT && def.chargeStacks > 0) {
    damage += def.chargeStacks * 3;
  }

  if (!tac.ignoreReduction && damage > 0 && tac.halveFirstDamage) {
    damage = Math.floor(damage * 0.5);
    const historyBlessing = (def.activeBlessings || []).find(card => card.id === 'card_his_1');
    if (historyBlessing) historyBlessing.usedInClass = true;
  }

  if (!tac.isNoFixedBonus) damage += tac.trueDamage || 0;

  // 付修然正面: 防御选中的骰点数和 >= 15 记一次梦境
  if (def.card.positiveSkill?.id === SKILL.DREAM_KING) {
    const sumChosen = keptRolls.reduce((s, v) => s + v, 0);
    if (sumChosen >= 15) {
      def.dreamStacks = Math.min(3, (def.dreamStacks || 0) + 1);
      if (def.dreamStacks >= 3 && !def.inDreamState && !def.pendingDreamState) {
        def.pendingDreamState = true;
      }
    }
  }

  // 付修然梦境判定 (分身无伤害 / 本体锁血3)
  if (def.card.positiveSkill?.id === SKILL.DREAM_KING && def.inDreamState && !def.lgpyForm) {
    if (def.dreamTargetChoice !== null && def.dreamTargetChoice !== def.realTargetIdx) {
      // 选中分身: 本体不受伤害
      damage = 0;
    } else if (def.dreamTargetChoice === def.realTargetIdx) {
      // 选中本体: 致命伤害强制锁血为 3
      if (def.hp - damage < 3) {
        damage = Math.max(0, def.hp - 3);
      }
    }
  }

  // 李灿正面A: 反击伤害
  let lcCounterTriggered = false;
  let lcCounterDamage = 0;
  if (def.card.positiveSkill?.id === SKILL.GAL_PLAYER && finalFinalDef > finalBaseAtk && !isPierce) {
    lcCounterDamage = finalFinalDef - finalBaseAtk;
    atk.hp = Math.max(0, atk.hp - lcCounterDamage);
    lcCounterTriggered = true;
  }

  // 杂鱼自残判定 (HJC: 最终攻击力 < 防御力 → 自身血量减半)
  let noobTriggered = false;
  if (finalBaseAtk < finalFinalDef && attackerNegative === 'hjc_neg') {
    atk.hp -= Math.floor(atk.hp / 2);
    noobTriggered = true;
  }

  // 团长大人！触发：防守时未重投 → 获得骰子
  let commanderTriggered = false;
  if (!hasDefenderRerolled && def.card.positiveSkill?.id === SKILL.COMMANDER_RECRUIT) {
    const newFace = defMulti === 0.5 ? 4 : (defMulti === 1 ? 6 : 8);
    def.card.dicePool.push(newFace);
    commanderTriggered = true;
  }

  // 余汉负面: 操碎了心 — 在扣血前判断目标是否已低于20%。
  if (damage > 1 && attackerNegative === SKILL.MAMA_MERCY
    && def.hp > 0 && def.hp < def.maxHp * 0.2) {
    damage = 1;
  }

  damage = geographyExtraDamageCap(state, atk, ar, finalBaseAtk, finalFinalDef, isPierce, tac, damage);
  damage = Math.min(damage, tac.maxDmgCap);

  // 化学-祝福 (card_che_1): 当天化学课造成伤害时，额外叠加 3 层红温
  if (subj === 'chemistry' && damage > 0 && (atk.activeBlessings || []).some(c => c.id === 'card_che_1')) {
    def.redHeat = (def.redHeat || 0) + 3;
  }

  // 通用-其他 (card_gen_14): 本轮如果防守无伤，获得 2 TP
  if (defTurnCards.some(c => c.id === 'card_gen_14') && damage === 0) {
    def.tp = Math.min(10, (def.tp || 0) + 2);
    appendBattleLog(state, { text: `【通用-其他】${def.nickname} 防守无伤，获得 2 TP！`, type: 'skill', actorId: def.id, targetId: atk.id });
  }

  // 通用-其他 (card_gen_15): 本轮如果攻击造成伤害，抽 1 张学科战术卡
  if (atkTurnCards.some(c => c.id === 'card_gen_15') && damage > 0 && !state.turnData.gen15Drawn) {
    state.turnData.gen15Drawn = true;
    if ((atk.handCards || []).length < 3) {
      atk.handCards.push(getRandomSubjectCard(subj, atk.card?.subjects || []));
      appendBattleLog(state, { text: `【通用-其他】${atk.nickname} 攻击造成伤害，抽 1 张战术卡！`, type: 'skill', actorId: atk.id, targetId: def.id });
    }
  }

  // 应用伤害
  def.hp = Math.max(0, def.hp - damage);
  atk.hp = Math.max(0, atk.hp - selfDamage);

  // 付修然负面: 小象的谴责
  if (attackerNegative === SKILL.ELEPHANT_CONDEMN) checkElephantCondemn(state, atk, def);
  if (defenderNegative === SKILL.ELEPHANT_CONDEMN) checkElephantCondemn(state, def, atk);

  // 余汉正面: 妈! — 防御溢出回血
  let mamaHealTriggered = false;
  let mamaHealAmount = 0;
  if (def.card.positiveSkill?.id === SKILL.MAMA_HEAL && finalFinalDef > finalBaseAtk && !isPierce) {
    const overflow = finalFinalDef - finalBaseAtk;
    mamaHealAmount = Math.floor(overflow * defMulti);
    if (mamaHealAmount > 0) {
      def.hp = Math.min(def.maxHp, def.hp + mamaHealAmount);
      mamaHealTriggered = true;
    }
  }

  // 谢睿琦正面: 背后贴贴画 — 造成伤害时给对方贴贴画
  let stickerExploded = false;
  let stickerDamage = 0;
  if (damage > 0 && atk.card.positiveSkill?.id === SKILL.STICKER_BOMB) {
    def.stickers = (def.stickers || 0) + 1;
    if (def.stickers >= 2) {
      stickerDamage = Math.floor(def.hp * 0.35);
      def.hp = Math.max(0, def.hp - stickerDamage);
      def.redHeat = (def.redHeat || 0) + 3;
      def.stickers = 0;
      stickerExploded = true;
    }
  }

  // 谢睿琦负面: 被发现了! — 受伤≥8时自己被贴贴画，2张引爆
  let selfStickerExploded = false;
  let selfStickerDamage = 0;
  if (damage >= 8 && defenderNegative === SKILL.STICKER_SELF) {
    def.selfStickers = (def.selfStickers || 0) + 1;
    if (def.selfStickers >= 2) {
      selfStickerDamage = Math.floor(def.hp * 0.35);
      def.hp = Math.max(0, def.hp - selfStickerDamage);
      def.redHeat = (def.redHeat || 0) + 3;
      def.selfStickers = 0;
      selfStickerExploded = true;
    }
  }

  // 姜鹏泽负面: 首次受伤时防御选骰数 -1
  let firstBloodTriggeredThisTurn = false;
  if (damage > 0 && defenderNegative === SKILL.FIRST_BLOOD && !def.hasTakenDamage) {
    def.hasTakenDamage = true;
    firstBloodTriggeredThisTurn = true;
    if (def.card.defSlots > 1) def.card.defSlots -= 1;
  }

  // 红温叠加 (WYC正面: 造成伤害时给对方叠红温)
  let redHeatApplied = 0;
  if (damage > 0 && atk.card.positiveSkill?.id === SKILL.RED_HEAT_APPLY) {
    redHeatApplied = 1 + Math.floor(2 * atkMulti);
    def.redHeat = (def.redHeat || 0) + redHeatApplied;
  }

  // 红温引爆 (WYC负面: 攻击≤防御时引爆对方红温)
  let detonateTriggered = false;
  let detonateDamage = 0;
  if (finalBaseAtk <= finalFinalDef && attackerNegative === SKILL.RED_HEAT_DETONATE) {
    const opHeat = def.redHeat || 0;
    if (opHeat > 0) {
      detonateDamage = opHeat;
      // 天赋怪减伤也适用于红温引爆
      if (def.card.positiveSkill?.id === SKILL.TALENTED) {
        const dRatio = defMulti === 2 ? 0.5 : (defMulti === 1 ? 0.75 : 1);
        if (dRatio < 1) detonateDamage = Math.floor(detonateDamage * dRatio);
      }
      def.hp = Math.max(0, def.hp - detonateDamage);
      def.redHeat = 0;
      detonateTriggered = true;
    }
  }

  // 触发 SUGAR_CRASH 负面效果 (expireRound +2 修复)
  if (damage >= 8 && defenderNegative === SKILL.SUGAR_CRASH) {
    if (!def.buffs) def.buffs = [];
    def.buffs.push({ id: SKILL.SUGAR_CRASH, expireRound: state.totalRound + 2 });
  }

  return { damage, talentTriggered, lcCounterTriggered, lcCounterDamage, noobTriggered,
    commanderTriggered, mamaHealTriggered, mamaHealAmount, firstBloodTriggeredThisTurn, redHeatApplied, detonateTriggered, detonateDamage };
}
