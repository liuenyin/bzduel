import { resolvePhaseEnd } from './phase.js';
import { reviveNineLives, hasNegativeImmunity } from './skills.js';
import { getRollingPool } from './dice.js';
import { appendBattleLog } from './battle-log.js';
import { rollDiceGroup, maximizeDieValue, canPlayBattleAction, getCourseMultiplier } from './primitives.js';
import { TURN } from '../../../shared/turn.js';
import { SKILL } from '../../../shared/characters.js';
import { finishSelfKill } from './immediate-deaths.js';

export function rollAttack(state) {
  if (!canPlayBattleAction(state) || state.turnPhase !== TURN.WAITING_ATK) return { ok: false };

  const atk = state.players[state.turnData.attackerIdx];
  if (!atk?.card || atk.isDead || atk.hp <= 0) return { ok: false, error: 'player_defeated' };

  // 数学祝福只跳过下一次普通攻击；额外攻击不受影响。跳过仍然
  // 消耗一个正常子回合，从而继续推进课程、日期和补给站。
  if (!state.turnData.isExtraTurn && (atk.skipAttackCount || 0) > 0) {
    atk.skipAttackCount -= 1;
    const attackerIdx = state.turnData.attackerIdx;
    appendBattleLog(state, {
      text: `【数学-祝福】${atk.nickname} 的本次攻击回合被跳过！`,
      type: 'skill',
      actorId: atk.id,
    });
    return { ok: true, skipped: true, attackerIdx, ...resolvePhaseEnd(state) };
  }

  // 梦境前置检查：如果场上有 FXR 在梦境中，必须先完成盲选
  const fxrP = state.players.find(p => p?.card?.positiveSkill?.id === SKILL.DREAM_KING
    && !p.isDead && p.hp > 0 && p.inDreamState && !p.lgpyForm);
  if (fxrP && fxrP.dreamTargetChoice == null) {
    return { ok: false, error: 'dream_target_required' };
  }
  const subj = state.schedule[state.currentClassIndex];
  let multi = getCourseMultiplier(atk, state);
  // “上一轮”以本次攻击开始时的生命为基准，供历史-其他恢复使用。
  state.players.forEach(player => { player.hpLastRound = player.hp; });
  const hpBeforeTurnDamage = atk.hp;
  let redHeatDamage = 0;
  let redHeatKilled = false;

  // 清理过期 buff
  if (!atk.buffs) atk.buffs = [];
  atk.buffs = atk.buffs.filter(b => b.expireRound > state.totalRound);

  // 红温伤害 (攻击回合开始时)
  if (atk.redHeat > 0) {
    const heatStacks = atk.redHeat;
    redHeatDamage = Math.min(atk.hp, heatStacks);
    atk.hp -= heatStacks;
    atk.redHeat = Math.max(0, atk.redHeat - 1);
    if (atk.hp < 0) atk.hp = 0;
    redHeatKilled = atk.hp <= 0;
    appendBattleLog(state, {
      text: `【红温】${atk.nickname} 受到 ${redHeatDamage} 点伤害${redHeatKilled ? '并倒下' : ''}`,
      type: 'status',
      actorId: atk.id,
      details: { redHeatDamage, remainingRedHeat: atk.redHeat, lethal: redHeatKilled },
    });
  }

  // 犯糖自伤
  if (atk.buffs.find(b => b.id === SKILL.SUGAR_CRASH) && !hasNegativeImmunity(atk)) {
    atk.hp -= Math.floor(4 * multi);
    if (atk.hp < 0) atk.hp = 0;
  }

  // 不可持续发展自伤
  if (atk.card.negativeSkill?.id === SKILL.UNSUSTAINABLE && !hasNegativeImmunity(atk)) {
    atk.hp -= Math.floor(2 * multi);
    if (atk.hp < 0) atk.hp = 0;
  }

  // 如果自伤致死，立刻判定游戏结束
  if (atk.hp <= 0) {
    if (!reviveNineLives(atk)) {
      const resolution = finishSelfKill(state, atk, state.turnData.defenderIdx, {
        cause: redHeatKilled ? 'red_heat' : 'self_damage',
        selfDamage: Math.max(0, hpBeforeTurnDamage - atk.hp),
      });
      return {
        ok: true,
        rolls: [],
        ...resolution,
      };
    }
  }

  // 记号: 攻击开始时获得 +1 重投
  if (atk.card.positiveSkill?.id === SKILL.NO_REROLL_BONUS) {
    atk.rerolls += 1;
  }

  // 廖展韬: 攻击开始时获得 +1 重投
  if (atk.card.positiveSkill?.id === SKILL.INVERT_DIE) {
    atk.rerolls += 1;
  }

  // 王鹤迪: 攻击回合开始时+2次重投 (在下方 L159 处理)

  // 黄佳程过敏判定 (10% 概率)
  let allergyTriggered = false;
  if (atk.card.negativeSkill?.id === 'hjc_neg' && Math.random() < 0.1) {
    allergyTriggered = true;
  }

  // 王鹤迪: 攻击回合开始时+2次重投
  if (atk.card.positiveSkill?.id === SKILL.STAR_SHOWOFF) {
    atk.rerolls += 2;
  }

  // 周煊声: 蓄势提供额外重投（不在此消耗，消耗在 confirmAttack 中进行）
  if (atk.chargeStacks > 0 && atk.card.positiveSkill?.id === SKILL.BUY_WATER && !state.turnData.isExtraTurn) {
    atk.rerolls += atk.chargeStacks;
    state.turnData.pendingCharges = atk.chargeStacks;
  }

  // 张楚唯: 额外回合重投+2, 所有骰子面数临时+2
  let rollingPool = getRollingPool(atk, state);
  if (state.turnData.isExtraTurn && atk.card.positiveSkill?.id === SKILL.EXTRA_TURN) {
    atk.rerolls += 2;
    rollingPool = rollingPool.map(f => f + 2);
    state.turnData.extraTurnFaceBoost = 2; // 记录以便重投时也应用加成
  }

  const rolls = rollDiceGroup(rollingPool);

  // 闫紫铭负面: Inelegant! 掷骰出1自伤
  if (atk.card.negativeSkill?.id === SKILL.ROYAL_ETIQUETTE && !hasNegativeImmunity(atk)) {
    const ones = rolls.filter(r => r === 1).length;
    if (ones > 0) {
      atk.hp -= ones;
      if (atk.hp <= 0) {
        if (!reviveNineLives(atk)) {
        const resolution = finishSelfKill(state, atk, state.turnData.defenderIdx, {
            cause: 'dice_self_damage',
            selfDamage: ones,
          });
          return { ok: true, rolls: [...rolls], ...resolution };
        }
      }
    }
  }

  // 廖展韬正面附加: 对方骰子无法投出最大值
  const defPlayer = state.players[state.turnData.defenderIdx];
  if (defPlayer?.card.positiveSkill?.id === SKILL.INVERT_DIE) {
    for (let i = 0; i < rolls.length; i++) {
      if (rolls[i] >= rollingPool[i]) rolls[i] = rollingPool[i] - 1;
    }
  }

  // 廖展韬正面: 字斟句酌 — 攻击掷骰后将最小骰子变为最大值
  let invertTriggered = false;
  if (atk.card.positiveSkill?.id === SKILL.INVERT_DIE) {
    let minVal = Infinity, minIdx = -1;
    for (let i = 0; i < rolls.length; i++) {
      if (rolls[i] < minVal) { minVal = rolls[i]; minIdx = i; }
    }
    if (minIdx >= 0) {
      const face = rollingPool[minIdx];
      rolls[minIdx] = maximizeDieValue(rolls[minIdx], face);
      invertTriggered = true;
      // 深度思考: 初始掷骰不触发，仅重投时触发（见 rerollDice）
    }
  }

  // 张锦元负面: 贪睡 — 前1回合攻击-3
  let sleepyAtkPenalty = 0;
  if (atk.card.negativeSkill?.id === SKILL.SLEEPY && state.totalRound <= 1 && !hasNegativeImmunity(atk)) {
    sleepyAtkPenalty = 3;
  }

  state.turnData.attackRolls = rolls;
  state.turnData.allergyTriggered = allergyTriggered;
  state.turnData.invertTriggered = invertTriggered;
  state.turnData.sleepyAtkPenalty = sleepyAtkPenalty;
  state.turnPhase = TURN.ATK_ROLLED;
  return { ok: true, rolls: [...rolls], invertTriggered };
}
