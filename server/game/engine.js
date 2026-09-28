export { confirmDefense } from './engine/defense.js';
import { confirmDefense } from './engine/defense.js';
export { resolvePhaseEnd } from './engine/phase.js';
import { resolvePhaseEnd } from './engine/phase.js';

import { calcTacticalCardEffects, applyOpponentAttackRollDebuffs, getTacticalOpponent, applyInstantCardEffect } from './engine/tactical-effects.js';
export { refreshDraftSlot, buyDraftCard, confirmDraftReady } from './engine/draft.js';

export { getCurrentAttackerId, getCurrentDefenderId, getStateView, getAttackConfirmationView } from './engine/state-view.js';

import { removePositiveSkill, reviveNineLives, resolvePositiveSkill, resolveNegativeSkill } from './engine/skills.js';
export { getEffectiveDicePool, getAllowedSlotCount } from './engine/dice.js';
import { getRollingPool, getAllowedSlotCount } from './engine/dice.js';
export { generateSchedule, createGame, selectCard, setReady, useReschedule } from './engine/preparation.js';

import { appendBattleLog } from './engine/battle-log.js';
import { rollDie, rollDiceGroup, invertDieValue, isDraftShopActive, canPlayBattleAction, getCourseMultiplier, areValidDiceIndices, cloneCard, findPlayer } from './engine/primitives.js';
import { TURN } from '../../shared/turn.js';
export { TURN } from '../../shared/turn.js';
import { ATTACK_TACTICAL_CARDS, DEFENSE_TACTICAL_CARDS, CLASH_TACTICAL_CARDS } from '../../shared/tactical-rules.js';
// ============================================================
// 校园战力党 — 核心对战引擎 (阶段制状态机)
// ============================================================
import { PHASE, GAME_MODE, IDENTITY } from '../../shared/rules.js';
import { SKILL } from '../../shared/characters.js';
import { cardMap, getRandomCard, CARD_TYPE } from '../../shared/cards.js';

// ── 创建游戏 ──

function finishSelfKill(state, player, winner, { cause = 'self_damage', selfDamage = 0 } = {}) {
  const attackerIdx = state.turnData?.attackerIdx ?? null;
  player.hp = 0;
  player.isDead = true;

  if (state.gameMode === GAME_MODE.MODE_FFA) {
    const phaseResolution = resolvePhaseEnd(state);
    if (phaseResolution.gameOver) state.endReason = cause;
    return {
      selfKill: true,
      ...phaseResolution,
      selfDamage,
      deathCause: cause,
      attackerIdx,
    };
  }

  state.phase = PHASE.GAME_OVER;
  state.winner = winner;
  state.endReason = cause;
  return {
    selfKill: true,
    gameOver: true,
    winner,
    selfDamage,
    deathCause: cause,
    attackerIdx,
  };
}

function resolveImmediateDeaths(state, {
  actor = null,
  cause = 'self_damage',
  penalizeLoyalistKill = false,
  allowRevive = true,
} = {}) {
  let nineLivesTriggered = false;
  const defeatedPlayers = [];

  state.players.forEach(player => {
    if (player.hp > 0 || player.isDead) return;
    if (allowRevive && reviveNineLives(player)) {
      nineLivesTriggered = true;
      return;
    }
    player.hp = 0;
    player.isDead = true;
    defeatedPlayers.push(player);
  });

  // A player eliminated while AoE defense is being prepared must not leave a
  // stale defense entry that can still be resolved later in the same attack.
  if (state.turnData?.isAoE && defeatedPlayers.length > 0) {
    for (const player of defeatedPlayers) {
      delete state.turnData.aoeDefenses?.[player.id];
    }
  }

  if (defeatedPlayers.length === 0) {
    return {
      gameOver: false,
      winner: null,
      nineLivesTriggered,
      defeatedIds: [],
      deathCause: null,
    };
  }

  if (penalizeLoyalistKill && state.gameMode === GAME_MODE.MODE_FFA && actor?.identity === IDENTITY.LORD) {
    defeatedPlayers.filter(player => player.identity === IDENTITY.LOYALIST).forEach(player => {
      removePositiveSkill(actor);
      appendBattleLog(state, {
        text: `【系统】主公 ${actor.nickname} 误杀忠臣，失去了正面技能！`,
        type: 'system',
        actorId: actor.id,
        targetId: player.id,
      });
    });
  }

  let gameOver = false;
  let winner = null;
  if (state.gameMode === GAME_MODE.MODE_1V1) {
    const [first, second] = state.players;
    gameOver = first.isDead || second.isDead;
    if (first.isDead && second.isDead) winner = 'draw';
    else if (second.isDead) winner = 0;
    else if (first.isDead) winner = 1;
  } else {
    const lord = state.players.find(player => player.identity === IDENTITY.LORD);
    if (lord?.isDead) {
      gameOver = true;
      const aliveSpies = state.players.filter(player => player.identity === IDENTITY.SPY && !player.isDead);
      const otherAlive = state.players.filter(player => player.identity !== IDENTITY.SPY && !player.isDead);
      winner = aliveSpies.length === 1 && otherAlive.length === 0 ? 'spy' : 'rebel';
    } else {
      const aliveBadGuys = state.players.filter(player => (
        player.identity === IDENTITY.REBEL || player.identity === IDENTITY.SPY
      ) && !player.isDead);
      if (aliveBadGuys.length === 0) {
        gameOver = true;
        winner = 'lord';
      }
    }
  }

  if (gameOver) {
    state.phase = PHASE.GAME_OVER;
    state.winner = winner;
    state.endReason = cause;
  }

  return {
    gameOver,
    winner,
    nineLivesTriggered,
    defeatedIds: defeatedPlayers.map(player => player.id),
    deathCause: gameOver ? cause : null,
  };
}

function resolveImmediateCardDeaths(state, actor, card) {
  const deathResolution = resolveImmediateDeaths(state, {
    actor,
    cause: 'tactical_card',
    penalizeLoyalistKill: true,
  });
  if (deathResolution.gameOver || deathResolution.defeatedIds.length === 0
    || state.gameMode !== GAME_MODE.MODE_FFA) {
    return { ...deathResolution, cardId: card?.id || null };
  }

  // A tactical card can eliminate the current attacker/defender before dice
  // resolution. In FFA that must consume the current subround and select the
  // next living attacker, otherwise the match remains stuck on a dead player.
  const phaseResolution = resolvePhaseEnd(state);
  return {
    ...deathResolution,
    ...phaseResolution,
    cardId: card?.id || null,
    deathCause: 'tactical_card',
  };
}

export function eliminateDisconnectedPlayer(state, playerId) {
  if (state?.phase !== PHASE.BATTLE) return { ok: false, error: 'invalid_phase' };
  const player = findPlayer(state, playerId);
  if (!player || player.isDead) return { ok: false, error: 'player_not_found' };

  const turnData = state.turnData || {};
  const playerIndex = state.players.indexOf(player);
  const wasAttacker = turnData.attackerIdx === playerIndex;
  const wasDefender = turnData.defenderIdx === playerIndex;
  const wasAoeDefender = !!(turnData.isAoE && turnData.aoeDefenses?.[playerId]);

  player.hp = 0;
  const deathResolution = resolveImmediateDeaths(state, {
    cause: 'disconnect',
    allowRevive: false,
  });
  const baseResult = {
    ok: true,
    ...deathResolution,
    deathCause: 'disconnect',
    disconnectedId: playerId,
    advanced: false,
  };
  if (deathResolution.gameOver) return baseResult;
  if (state.gameMode !== GAME_MODE.MODE_FFA) return baseResult;

  if (wasAoeDefender) {
    const aoeDefenses = turnData.aoeDefenses || {};
    const liveDefenses = Object.entries(aoeDefenses).filter(([id]) => {
      const candidate = findPlayer(state, id);
      return candidate && !candidate.isDead && candidate.hp > 0;
    });
    if (liveDefenses.some(([, defense]) => !defense?.confirmed)) {
      return { ...baseResult, waitingForOthers: true };
    }

    // Earlier confirmations only record choices; damage is resolved when the
    // final living defender confirms. Replaying one recorded confirmation is
    // therefore safe and lets a last-pending disconnect finish the AoE turn.
    const [candidateId, defense] = liveDefenses.find(([, entry]) => entry?.confirmed) || [];
    const candidate = candidateId ? findPlayer(state, candidateId) : null;
    const rolls = Array.isArray(defense?.rolls) ? defense.rolls : [];
    if (candidate?.card && rolls.length > 0) {
      const allowedSlots = getAllowedSlotCount(state, candidateId, 'defense');
      const requiredSlots = allowedSlots === -1 ? rolls.length : allowedSlots;
      const savedIndices = Array.isArray(defense.keepIndices) ? defense.keepIndices : [];
      const keepIndices = areValidDiceIndices(savedIndices, rolls.length, requiredSlots)
        ? savedIndices
        : Array.from({ length: requiredSlots }, (_, index) => index);
      if (areValidDiceIndices(keepIndices, rolls.length, requiredSlots)) {
        defense.confirmed = false;
        const turnResult = confirmDefense(state, candidateId, keepIndices, defense.options || {});
        if (turnResult.ok) return { ...baseResult, ...turnResult, advanced: true, deathCause: 'disconnect' };
      }
    }

    return { ...baseResult, ...resolvePhaseEnd(state), advanced: true, deathCause: 'disconnect' };
  }

  if (wasAttacker || wasDefender) {
    return { ...baseResult, ...resolvePhaseEnd(state), advanced: true, deathCause: 'disconnect' };
  }
  return baseResult;
}

// ── 阶段1: 攻击方掷骰 ──
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
  const fxrP = state.players.find(p => p?.card?.positiveSkill?.id === SKILL.DREAM_KING && p.inDreamState && !p.lgpyForm);
  if (fxrP && fxrP.dreamTargetChoice === null) {
    return { ok: false, error: 'dream_target_required' };
  }
  const subj = state.schedule[state.currentClassIndex];
  let multi = getCourseMultiplier(atk, state);
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
  if (atk.buffs.find(b => b.id === SKILL.SUGAR_CRASH)) {
    atk.hp -= Math.floor(4 * multi);
    if (atk.hp < 0) atk.hp = 0;
  }

  // 不可持续发展自伤
  if (atk.card.negativeSkill?.id === SKILL.UNSUSTAINABLE) {
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
  if (atk.card.negativeSkill?.id === SKILL.ROYAL_ETIQUETTE) {
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

  // 廖展韬正面: 字斟句酌 — 攻击掷骰后反转最小骰子
  let invertTriggered = false;
  if (atk.card.positiveSkill?.id === SKILL.INVERT_DIE) {
    let minVal = Infinity, minIdx = -1;
    for (let i = 0; i < rolls.length; i++) {
      if (rolls[i] < minVal) { minVal = rolls[i]; minIdx = i; }
    }
    if (minIdx >= 0) {
      const face = rollingPool[minIdx];
      rolls[minIdx] = invertDieValue(rolls[minIdx], face);
      invertTriggered = true;
      // 深度思考: 初始掷骰不触发，仅重投时触发（见 rerollDice）
    }
  }

  // 张锦元负面: 贪睡 — 前1回合攻击-3
  let sleepyAtkPenalty = 0;
  if (atk.card.negativeSkill?.id === SKILL.SLEEPY && state.totalRound <= 1) {
    sleepyAtkPenalty = 3;
  }

  state.turnData.attackRolls = rolls;
  state.turnData.allergyTriggered = allergyTriggered;
  state.turnData.invertTriggered = invertTriggered;
  state.turnData.sleepyAtkPenalty = sleepyAtkPenalty;
  state.turnPhase = TURN.ATK_ROLLED;
  return { ok: true, rolls: [...rolls], invertTriggered };
}

// ── 阶段2: 重投骰子 (攻击或防御阶段通用) ──
export function rerollDice(state, playerId, indices) {
  if (!canPlayBattleAction(state)) return { ok: false, error: '非战斗阶段' };
  const p = findPlayer(state, playerId);
  if (!p?.card || p.isDead || p.hp <= 0 || p.rerolls <= 0) return { ok: false };
  const opp = state.players.find(x => x.id !== playerId && !x.isDead);
  const oppTurnCards = opp ? (opp.playedTurnCards || (opp.playedTurnCard ? [opp.playedTurnCard] : [])) : [];
  if (oppTurnCards.some(c => c.id === 'card_gen_09')) return { ok: false, error: '对方使用了【重投锁死】，无法重投！' };
  if (oppTurnCards.some(c => c.id === 'card_mat_3')) return { ok: false, error: '对方使用了【数学-减益】，无法重投！' };

  // 检查是否被禁锢重投 (需校验 buff 是否过期)
  if (p.buffs) {
    p.buffs = p.buffs.filter(b => b.expireRound > state.totalRound);
    if (p.buffs.find(b => b.id === SKILL.SUGAR_CRASH)) return { ok: false, error: 'sugar_crash_locked' };
  }

  let rolls;
  if (state.turnPhase === TURN.ATK_ROLLED) {
    if (state.players[state.turnData.attackerIdx].id !== playerId) return { ok: false };
    rolls = state.turnData.attackRolls;
  } else if (state.turnPhase === TURN.DEF_ROLLED) {
    if (state.turnData.isAoE) {
      if (!state.turnData.aoeDefenses[playerId] || state.turnData.aoeDefenses[playerId].confirmed) return { ok: false };
      rolls = state.turnData.aoeDefenses[playerId].rolls;
    } else {
      if (state.players[state.turnData.defenderIdx].id !== playerId) return { ok: false };
      rolls = state.turnData.defenseRolls;
    }
  } else {
    return { ok: false };
  }

  if (!areValidDiceIndices(indices, rolls.length)) return { ok: false, error: 'invalid_indices' };

  const faces = getRollingPool(p, state);

  // 王鹤迪 rerollAll: 重投时所有骰子均重投
  const rolledIndices = p.card.rerollAll
    ? rolls.map((_, index) => index)
    : indices;
  if (p.card.rerollAll) {
    for (let i = 0; i < rolls.length; i++) {
      let face = faces[i];
      if (state.turnData.isExtraTurn && p.card.positiveSkill?.id === SKILL.EXTRA_TURN && state.turnData.extraTurnFaceBoost) {
        face += state.turnData.extraTurnFaceBoost;
      }
      rolls[i] = rollDie(face);
    }
  } else {
    for (const i of indices) {
      let face = faces[i];
      if (state.turnData.isExtraTurn && p.card.positiveSkill?.id === SKILL.EXTRA_TURN && state.turnData.extraTurnFaceBoost) {
        face += state.turnData.extraTurnFaceBoost;
      }
      rolls[i] = rollDie(face);
    }
  }

  // 廖展韬: 重投后重新反转最小骰子
  if (p.card.positiveSkill?.id === SKILL.INVERT_DIE) {
    let minVal = Infinity, minIdx = -1;
    for (let i = 0; i < rolls.length; i++) {
      if (rolls[i] < minVal) { minVal = rolls[i]; minIdx = i; }
    }
    if (minIdx >= 0) {
      let face = faces[minIdx];
      if (state.turnData.isExtraTurn && p.card.positiveSkill?.id === SKILL.EXTRA_TURN && state.turnData.extraTurnFaceBoost) {
        face += state.turnData.extraTurnFaceBoost;
      }
      rolls[minIdx] = invertDieValue(rolls[minIdx], face);
      // 深度思考: 仅攻击阶段反转给对方+1永久减伤
      if (p.card.negativeSkill?.id === SKILL.DEEP_THOUGHT && state.turnPhase === TURN.ATK_ROLLED) {
        const defIdx = state.turnData.defenderIdx;
        if (defIdx != null) {
          state.players[defIdx].invertReduction = (state.players[defIdx].invertReduction || 0) + 1;
        }
      }
    }
  }

  // 廖展韬正面附加: 对方骰子无法投出最大值
  {
    let opp = null;
    if (state.turnPhase === TURN.ATK_ROLLED) {
      opp = state.players[state.turnData.defenderIdx];
    } else if (state.turnPhase === TURN.DEF_ROLLED && !state.turnData.isAoE) {
      opp = state.players[state.turnData.attackerIdx];
    }
    if (opp?.card.positiveSkill?.id === SKILL.INVERT_DIE) {
      for (let i = 0; i < rolls.length; i++) {
        let face = faces[i];
        if (state.turnData.isExtraTurn && p.card.positiveSkill?.id === SKILL.EXTRA_TURN && state.turnData.extraTurnFaceBoost) {
          face += state.turnData.extraTurnFaceBoost;
        }
        if (rolls[i] >= face) rolls[i] = face - 1;
      }
    }
  }

  // 闫紫铭负面: Inelegant! 重投出1自伤 (英语-祝福 card_eng_1 / 自习-增益 card_stu_2 可免疫)
  const curSubjReroll = state.schedule[state.currentClassIndex];
  const hasEng1 = curSubjReroll === 'english' && (p.activeBlessings || []).some(c => c.id === 'card_eng_1');
  const hasStu2 = (p.playedTurnCards || (p.playedTurnCard ? [p.playedTurnCard] : [])).some(c => c.id === 'card_stu_2');
  if (p.card.negativeSkill?.id === SKILL.ROYAL_ETIQUETTE && !hasEng1 && !hasStu2) {
    const newlyRolledOnes = rolledIndices.map(idx => rolls[idx]).filter(r => r === 1).length;
    if (newlyRolledOnes > 0) {
      p.hp -= newlyRolledOnes;
      if (p.hp <= 0) {
        if (!reviveNineLives(p)) {
          const winner = state.turnPhase === TURN.ATK_ROLLED ? state.turnData.defenderIdx : state.turnData.attackerIdx;
          const resolution = finishSelfKill(state, p, winner, {
            cause: 'dice_self_damage',
            selfDamage: newlyRolledOnes,
          });
          return { ok: true, rolls: [...rolls], remaining: p.rerolls, ...resolution };
        }
      }
    }
  }

  p.rerolls--;
  if (state.turnPhase === TURN.ATK_ROLLED) {
    state.turnData.hasAttackerRerolled = true;
  } else if (state.turnPhase === TURN.DEF_ROLLED) {
    if (state.turnData.isAoE) {
      state.turnData.aoeDefenses[playerId].hasRerolled = true;
    } else {
      state.turnData.hasDefenderRerolled = true;
    }
  }
  return { ok: true, rolls: [...rolls], remaining: p.rerolls };
}

// ── 阶段3: 攻击方确认 → 结算攻击技能 → 自动掷防御骰 ──
export function confirmAttack(state, keepIndices) {
  if (!canPlayBattleAction(state) || state.turnPhase !== TURN.ATK_ROLLED) return { ok: false };
  const atk = state.players[state.turnData.attackerIdx];
  if (!atk?.card || atk.isDead || atk.hp <= 0) return { ok: false, error: 'player_defeated' };
  
  const def = state.players[state.turnData.defenderIdx];
  if (!def?.card || def.isDead || def.hp <= 0) return { ok: false, error: 'player_defeated' };
  const subj = state.schedule[state.currentClassIndex];
  const multi = getCourseMultiplier(atk, state);

  const allowedAtkSlots = getAllowedSlotCount(state, atk.id, 'attack');

  const atkRolls = state.turnData.attackRolls;
  const expectedSlots = atk.card.atkSlots === -1 ? null : allowedAtkSlots;
  if (!areValidDiceIndices(keepIndices, atkRolls?.length, expectedSlots)) {
    return { ok: false, error: 'invalid_slots' };
  }

  applyOpponentAttackRollDebuffs(state, atk);
  let keptRolls = keepIndices.map(i => atkRolls[i]);

  atk.lastMaxRoll = Math.max(...atkRolls);
  atk.unusedDiceSum = atkRolls.filter((_, i) => !keepIndices.includes(i)).reduce((a, b) => a + b, 0);

  // 语文-增益 (card_chi_2): 选中的点数最小骰子自动变为最大面值
  const atkTurnCards = atk.playedTurnCards || (atk.playedTurnCard ? [atk.playedTurnCard] : []);
  if (atkTurnCards.some(c => c.id === 'card_chi_2') && keptRolls.length > 0) {
    let minVal = Math.min(...keptRolls);
    let minIdx = keptRolls.indexOf(minVal);
    if (minIdx !== -1) {
      const origDieIdx = keepIndices[minIdx];
      const maxFace = getRollingPool(atk, state)[origDieIdx] || 6;
      keptRolls[minIdx] = maxFace;
    }
  }

  // 数学-祝福 (card_mat_1): 全质数时跳过目标的下一次普通攻击
  if (subj === 'math') {
    const mat1 = (atk.activeBlessings || []).find(c => c.id === 'card_mat_1');
    if (mat1 && !mat1.usedInClass) {
      const primes = [2, 3, 5, 7, 11];
      if (keptRolls.length > 0 && keptRolls.every(v => primes.includes(v))) {
        mat1.usedInClass = true;
        def.skipAttackCount = (def.skipAttackCount || 0) + 1;
        appendBattleLog(state, { text: `【数学-祝福】${atk.nickname} 选中的骰点全为质数，${def.nickname} 的下一次普通攻击将被跳过！`, type: 'skill', actorId: atk.id, targetId: def.id });
      }
    }
  }

  // 体育-祝福 (card_pe_1): 选中至少3个奇数得额外攻击回合
  if (subj === 'pe') {
    const pe1 = (atk.activeBlessings || []).find(c => c.id === 'card_pe_1');
    if (pe1 && !pe1.usedInClass) {
      const odds = keptRolls.filter(r => r % 2 !== 0).length;
      if (odds >= 3) {
        pe1.usedInClass = true;
        if (!state.extraTurnQueue) state.extraTurnQueue = [];
        state.extraTurnQueue.push({ attackerId: atk.id, targetId: def?.id });
        appendBattleLog(state, { text: `【体育-祝福】${atk.nickname} 选中3个奇数，触发额外攻击回合！`, type: 'skill', actorId: atk.id, targetId: def?.id });
      }
    }
  }

  // 自习-祝福 (card_stu_1): 攻击回合结束后随机获得 1 张战术卡
  if (subj === 'study' && (atk.activeBlessings || []).some(c => c.id === 'card_stu_1')) {
    if ((atk.handCards || []).length < 3) {
      atk.handCards.push(getRandomCard(subj, atk.card?.subjects || []));
    }
  }

  // 姜鹏泽正面: 骰子点数 × 课程倍率
  if (atk.card.positiveSkill?.id === SKILL.LIBERAL_ARTS) {
    keptRolls = keptRolls.map(v => Math.floor(v * multi));
  }

  const baseAtk = keptRolls.reduce((s, v) => s + v, 0);

  const hasStu2 = atkTurnCards.some(c => c.id === 'card_stu_2');
  const pos = resolvePositiveSkill(atk.card.positiveSkill, multi, keptRolls, state.totalRound, state.turnData);
  const neg = hasStu2 ? { triggered: false } : resolveNegativeSkill(atk.card.negativeSkill, multi, keptRolls, state.totalRound);

  let finalBase = baseAtk;

  // 观星: 极差<=2 时伤害乘以 (0.5 + 课程倍率)
  if (pos.applyMultiplier) {
    finalBase = Math.floor(baseAtk * (0.5 + multi));
  }

  // 贪睡惩罚
  if (state.turnData.sleepyAtkPenalty > 0) {
    finalBase = Math.max(0, finalBase - state.turnData.sleepyAtkPenalty);
  }

  // 黄佳程过敏处理: 强制锁定攻击力
  if (state.turnData.allergyTriggered) {
    finalBase = Math.floor(4 * multi);
  }

  // 记号: 若选中骰子全为奇数，参与骰子永久面数+2，无上限
  if (pos.upgradeDice) {
    let pool = atk.card.dicePool;
    for (let i of keepIndices) {
      if (i < pool.length) {
        pool[i] += 2;
      }
    }
  }

  // 付修然正面: 攻击选中的骰点数和 >= 15 记一次梦境
  if (atk.card.positiveSkill?.id === SKILL.DREAM_KING) {
    const sumChosen = keptRolls.reduce((s, v) => s + v, 0);
    if (sumChosen >= 15) {
      if ((atk.dreamStacks || 0) < 3) atk.rerolls = (atk.rerolls || 0) + 1;
      atk.dreamStacks = Math.min(3, (atk.dreamStacks || 0) + 1);
      if (atk.dreamStacks >= 3 && !atk.inDreamState && !atk.pendingDreamState) {
        atk.pendingDreamState = true;
      }
    }
  }

  state.turnData.atkResult = {
    baseAtk: finalBase, bonusDamage: pos.bonusDamage || 0, pierce: pos.pierce || false,
    selfDamage: neg.selfDamage || 0, finalAtk: finalBase + (pos.bonusDamage || 0),
    posTriggered: pos.triggered, posName: pos.triggered ? atk.card.positiveSkill.name : null,
    negTriggered: neg.triggered || state.turnData.allergyTriggered, 
    negName: state.turnData.allergyTriggered ? "过敏" : (neg.triggered ? atk.card.negativeSkill.name : null),
    keptIndices: keepIndices,
    faces: keptRolls,
  };

  // 战术卡攻击攻击力/加成计算
  if (def) {
    const tac = calcTacticalCardEffects(state, atk, def, keptRolls);
    if (!tac.isNoFixedBonus && tac.atkBonus !== 0) {
      state.turnData.atkResult.bonusDamage += tac.atkBonus;
      state.turnData.atkResult.finalAtk += tac.atkBonus;
    }
  }

  // 殷泽轩正面: 攻击力额外 +2 × 课程倍率
  if (atk.card.positiveSkill?.id === SKILL.STEALTH_STRIKE) {
    state.turnData.atkResult.bonusDamage += Math.floor(2 * multi);
    state.turnData.atkResult.finalAtk += Math.floor(2 * multi);
  }

  // 张楚唯: 额外回合 → 在 rollAttack 中处理 (+2重投, 面数临时+2)

  // 周煊声: 蓄势真正消耗（从 rollAttack 延迟到此处）
  if (state.turnData.pendingCharges > 0) {
    const chargeConsumed = state.turnData.pendingCharges;
    atk.chargeStacks = 0;
    state.turnData.chargeConsumed = chargeConsumed;
    const chargeBonus = chargeConsumed * 8;
    state.turnData.atkResult.bonusDamage += chargeBonus;
    state.turnData.atkResult.finalAtk += chargeBonus;
    state.turnData.atkResult.posTriggered = true;
    state.turnData.atkResult.posName = '蓄势爆发';
  }

  // Auto-roll defense using pool
  if (state.gameMode === GAME_MODE.MODE_FFA && atk.card.positiveSkill?.id === SKILL.RAPPER) {
    state.turnData.isAoE = true;
    state.turnData.aoeDefenses = {};
    let defenseRollsRecord = {};
    let rollSelfDamage = 0;
    state.players.forEach(p => {
      if (!p.isDead && p.id !== atk.id) {
        const rolls = rollDiceGroup(getRollingPool(p, state));
        
        // 闫紫铭负面: Inelegant! AoE防守时
        if (p.card.negativeSkill?.id === SKILL.ROYAL_ETIQUETTE) {
          const ones = rolls.filter(r => r === 1).length;
          if (ones > 0) {
            p.hp = Math.max(0, p.hp - ones);
            rollSelfDamage += ones;
          }
        }
        
        state.turnData.aoeDefenses[p.id] = {
          rolls,
          confirmed: false,
          keepIndices: null,
          options: null,
          hasRerolled: false
        };
        defenseRollsRecord[p.id] = [...rolls];
      }
    });

    const deathResolution = resolveImmediateDeaths(state, { cause: 'dice_self_damage' });
    deathResolution.defeatedIds.forEach(playerId => {
      delete state.turnData.aoeDefenses[playerId];
      delete defenseRollsRecord[playerId];
    });

    if (deathResolution.gameOver) {
      return {
        ok: true,
        atkResult: state.turnData.atkResult,
        aoeDefenseRolls: defenseRollsRecord,
        selfKill: true,
        selfDamage: rollSelfDamage,
        attackerIdx: state.turnData.attackerIdx,
        ...deathResolution,
      };
    }

    state.turnPhase = TURN.DEF_ROLLED;
    return {
      ok: true,
      atkResult: state.turnData.atkResult,
      aoeDefenseRolls: defenseRollsRecord,
      selfDamage: rollSelfDamage,
      nineLivesTriggered: deathResolution.nineLivesTriggered,
      defeatedIds: deathResolution.defeatedIds,
    };
  } else {
    state.turnData.isAoE = false;
    const defRolls = rollDiceGroup(getRollingPool(def, state));

    // 闫紫铭负面: Inelegant! 1v1防守时
    if (def.card.negativeSkill?.id === SKILL.ROYAL_ETIQUETTE) {
      const ones = defRolls.filter(r => r === 1).length;
      if (ones > 0) {
        def.hp -= ones;
        if (def.hp <= 0) {
          if (!reviveNineLives(def)) {
            const resolution = finishSelfKill(state, def, state.turnData.attackerIdx, {
              cause: 'dice_self_damage',
              selfDamage: ones,
            });
            return { ok: true, atkResult: state.turnData.atkResult, defenseRolls: [...defRolls], ...resolution };
          }
        }
      }
    }

    // 廖展韬正面附加: 对方骰子无法投出最大值
    if (atk.card.positiveSkill?.id === SKILL.INVERT_DIE) {
      const effectivePool = getRollingPool(def, state);
      for (let i = 0; i < defRolls.length; i++) {
        if (defRolls[i] >= effectivePool[i]) defRolls[i] = Math.max(1, effectivePool[i] - 1);
      }
    }

    // 廖展韬正面: 字斟句酌 — 防御掷骰后反转最小骰子 (不叠加减伤)
    if (def.card.positiveSkill?.id === SKILL.INVERT_DIE) {
      let minVal = Infinity, minIdx = -1;
      for (let i = 0; i < defRolls.length; i++) {
        if (defRolls[i] < minVal) { minVal = defRolls[i]; minIdx = i; }
      }
      if (minIdx >= 0) {
        const effectivePool = getRollingPool(def, state);
        defRolls[minIdx] = invertDieValue(defRolls[minIdx], effectivePool[minIdx]);
      }
    }

    // 余汉正面: 防御时+1重投
    if (def.card.positiveSkill?.id === SKILL.MAMA_HEAL) {
      def.rerolls += 1;
    }

    state.turnData.defenseRolls = defRolls;
    state.turnPhase = TURN.DEF_ROLLED;
    return { ok: true, atkResult: state.turnData.atkResult, defenseRolls: [...defRolls] };
  }
}

// ── 查询 ──

export function chooseDreamTarget(state, playerId, targetIndex) {
  if (!canPlayBattleAction(state)) return { ok: false };
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > 2) {
    return { ok: false, error: 'invalid_index' };
  }
  const fxr = state.players.find(p => p.card?.positiveSkill?.id === SKILL.DREAM_KING);
  const attacker = state.players[state.turnData?.attackerIdx];
  if (!fxr || fxr.isDead || fxr.hp <= 0 || !fxr.inDreamState || fxr.lgpyForm) return { ok: false };
  const canChoose = attacker?.id === playerId && !attacker.isDead && attacker.hp > 0 && attacker.id !== fxr.id;
  const fxrIsAttacker = attacker?.id === fxr.id;
  const isLivingOpponent = playerId !== fxr.id && state.players.some(player => (
    player.id === playerId && !player.isDead && player.hp > 0
  ));
  if ((!canChoose && !fxrIsAttacker) || (fxrIsAttacker && !isLivingOpponent)) return { ok: false };
  if (fxr.dreamTargetChoice !== null && fxr.dreamTargetChoice !== undefined) return { ok: false, error: 'already_chosen' };
  if (!Number.isInteger(fxr.realTargetIdx) || fxr.realTargetIdx < 0 || fxr.realTargetIdx > 2) return { ok: false };

  fxr.dreamTargetChoice = targetIndex;
  const isReal = targetIndex === fxr.realTargetIdx;
  return { ok: true, isReal };
}

export function selectTarget(state, playerId, targetId) {
  if (state.gameMode !== GAME_MODE.MODE_FFA || !canPlayBattleAction(state) || state.turnPhase !== TURN.CHOOSE_TARGET) return { ok: false };
  const pIdx = state.players.findIndex(p => p.id === playerId);
  if (pIdx === -1 || pIdx !== state.turnData.attackerIdx || state.players[pIdx].isDead || state.players[pIdx].hp <= 0) return { ok: false };
  
  const tIdx = state.players.findIndex(p => p.id === targetId);
  if (tIdx === -1 || tIdx === pIdx || state.players[tIdx].isDead || state.players[tIdx].hp <= 0) return { ok: false };
  
  state.turnData.defenderIdx = tIdx;
  state.turnPhase = TURN.WAITING_ATK;
  return { ok: true };
}

// ── 周煊声: 买水 (跳过攻击，获得蓄势) ──
export function buyWater(state, playerId) {
  if (state.phase !== PHASE.BATTLE || state.turnPhase !== TURN.ATK_ROLLED) return { ok: false };
  const atk = state.players[state.turnData.attackerIdx];
  if (atk.id !== playerId) return { ok: false };
  if (atk.card.positiveSkill?.id !== SKILL.BUY_WATER) return { ok: false };
  if (state.turnData.hasAttackerRerolled) return { ok: false, error: 'already_rerolled' };
  if (atk.chargeStacks >= 2) return { ok: false, error: 'max_charges' };

  atk.chargeStacks = (atk.chargeStacks || 0) + 1;

  // Skip attack and advance turn
  const phaseEnd = resolvePhaseEnd(state);
  return { ok: true, chargeStacks: atk.chargeStacks, ...phaseEnd };
}

// ── 战术卡打出与操作 ──
export function playTacticalCard(state, playerId, cardId) {
  if (state.phase !== PHASE.BATTLE) return { ok: false, error: '非战斗阶段' };
  if (isDraftShopActive(state)) return { ok: false, error: '请先完成补给' };
  const p = findPlayer(state, playerId);
  if (!p || p.isDead) return { ok: false, error: '玩家不存在或已阵亡' };
  if (typeof cardId !== 'string') return { ok: false, error: '无效卡牌' };

  const canonicalCard = cardMap[cardId];
  if (!canonicalCard) return { ok: false, error: '无效卡牌' };
  const cIdx = (p.handCards || []).findIndex(c => c.id === cardId);
  if (cIdx === -1) return { ok: false, error: '手牌中无此卡牌' };
  const card = cloneCard(canonicalCard);

  const curSubj = state.schedule[state.currentClassIndex];

  // 校验学科限制（学科卡只能在对应课程使用）
  if (card.subject !== 'universal' && card.subject !== curSubj) {
    return { ok: false, error: `【${card.name}】只能在 ${card.subject} 课使用！` };
  }

  const attacker = state.players[state.turnData?.attackerIdx];
  const defender = state.turnData?.defenderIdx == null
    ? null
    : state.players[state.turnData.defenderIdx];
  const isAttacker = attacker?.id === p.id;
  const isDefender = defender?.id === p.id
    || (state.turnData?.isAoE && !!state.turnData.aoeDefenses?.[p.id]
      && !state.turnData.aoeDefenses[p.id].confirmed);
  if (!isAttacker && !isDefender) {
    return { ok: false, error: '仅当前交锋玩家可使用' };
  }
  if (ATTACK_TACTICAL_CARDS.has(card.id) && !isAttacker) {
    return { ok: false, error: '仅攻击方可在此时使用' };
  }
  if (DEFENSE_TACTICAL_CARDS.has(card.id) && !isDefender) {
    return { ok: false, error: '仅防守方可在此时使用' };
  }
  if (CLASH_TACTICAL_CARDS.has(card.id) && !isAttacker && !isDefender) {
    return { ok: false, error: '仅交锋中的玩家可使用' };
  }
  if (card.type === CARD_TYPE.BLESSING && (p.activeBlessings || []).some(active => active.id === card.id)) {
    return { ok: false, error: '本节课已激活此祝福' };
  }
  if (card.type !== CARD_TYPE.BLESSING && (p.playedTurnCards || []).some(active => active.id === card.id)) {
    return { ok: false, error: '同类效果已生效' };
  }

  p.handCards.splice(cIdx, 1);

  if (card.type === CARD_TYPE.BLESSING) {
    if (!p.activeBlessings) p.activeBlessings = [];
    p.activeBlessings.push(card);
    appendBattleLog(state, {
      text: `【祝福】${p.nickname} 激活了【${card.name}】！`,
      type: 'tactical',
      actorId: p.id,
      details: { cardId: card.id, cardName: card.name, cardType: card.type },
    });
    if (card.id === 'card_eng_1') {
      p.rerolls += 2;
    } else if (card.id === 'card_it_1') {
      const opp = getTacticalOpponent(state, p);
      if (opp && opp.card) {
        p.copiedPositiveSkill = { original: cloneCard(p.card.positiveSkill) };
        if (opp.card.positiveSkill) {
          p.card.positiveSkill = cloneCard(opp.card.positiveSkill);
        }
      }
    }
  } else {
    if (!p.playedTurnCards) p.playedTurnCards = [];
    p.playedTurnCards.push(card);
    p.playedTurnCard = card;
    appendBattleLog(state, {
      text: `【战术】${p.nickname} 使用了【${card.name}】！`,
      type: 'tactical',
      actorId: p.id,
      details: { cardId: card.id, cardName: card.name, cardType: card.type },
    });
    applyInstantCardEffect(state, p, card);
  }

  const deathResolution = state.players.some(player => player.hp <= 0)
    ? resolveImmediateCardDeaths(state, p, card)
    : { gameOver: false, winner: null, nineLivesTriggered: false, defeatedIds: [] };

  return { ok: true, card, ...deathResolution };
}

// ── 三选一战术卡商店操作 ──
