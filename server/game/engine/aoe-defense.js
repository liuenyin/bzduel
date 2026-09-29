import { resolvePhaseEnd } from './phase.js';
import { advanceAttackerTimedStates } from './turn-state.js';
import { validateDefenseSelection } from './defense-dice.js';
import { appendBattleLog } from './battle-log.js';
import { findPlayer } from './primitives.js';
import { SKILL } from '../../../shared/characters.js';
import { resolveAoeTarget } from './aoe-target.js';

export function resolveAoeDefense(state, playerId, keepIndices, options, { atk, subj, atkMulti, ar, finalBaseAtk }) {
  const aoeDefenses = state.turnData.aoeDefenses;
  if (!aoeDefenses || typeof aoeDefenses !== 'object' || !aoeDefenses[playerId]) return { ok: false };
  const defState = aoeDefenses[playerId];
  if (defState.confirmed) return { ok: false };

  const def = findPlayer(state, playerId);
  if (!def || def.isDead || def.hp <= 0) return { ok: false, error: 'player_defeated' };
  const validation = validateDefenseSelection(state, def, defState.rolls, keepIndices);
  if (!validation.ok) return validation;

  defState.confirmed = true;
  defState.keepIndices = [...keepIndices];
  defState.options = { ...options };

  // Check if all alive, non-disconnected target players confirmed
  const allConfirmed = Object.entries(aoeDefenses).every(([pid, d]) => {
    const p = findPlayer(state, pid);
    if (!p || p.isDead || p.hp <= 0) return true; // Dead players do not block round completion
    return d.confirmed;
  });
  if (!allConfirmed) {
    return { ok: true, waitingForOthers: true };
  }

  // Everyone confirmed, process AoE damage
  let aoeResults = [];
  let noDamageCount = 0;
  let extraTurnGainers = [];
  let firstBloodTriggeredGlobal = false;
  let anyExtraTurnTriggered = false;

  // --- 1. ZWW "Eat it!" Global Reduction ---
  let eatTriggeredBy = null;
  let maxKeptRoll = -1;
  let globalAtkReduction = 0;

  const atkRolls = Array.isArray(state.turnData.attackRolls) ? state.turnData.attackRolls : [];
  const atkKeptIndices = Array.isArray(ar.keptIndices) ? ar.keptIndices : [];
  const selectedAttackFaces = atkKeptIndices.map(index => Number(atkRolls[index]) || 0);
  if (!Array.isArray(ar.faces) || ar.faces.length !== selectedAttackFaces.length) {
    ar.faces = [...selectedAttackFaces];
  }
  eatTriggeredBy = Object.keys(aoeDefenses).find(pid => (
    findPlayer(state, pid)?.card?.positiveSkill?.id === SKILL.EAT_IT
  )) || null;
  if (eatTriggeredBy && selectedAttackFaces.length > 0) {
    maxKeptRoll = Math.max(...selectedAttackFaces);
    if (maxKeptRoll > 2) {
      globalAtkReduction = maxKeptRoll - 2;
      const selectedIndex = selectedAttackFaces.indexOf(maxKeptRoll);
      ar.faces[selectedIndex] = 2;
    }
  }

  if (globalAtkReduction > 0) {
    finalBaseAtk = Math.max(0, finalBaseAtk - globalAtkReduction);
    ar.finalAtk = finalBaseAtk;
  }

  // 闫紫铭正面: Timeless Grace 延后到攻击发动时结算
  if (atk.card.positiveSkill?.id === SKILL.TIMELESS_GRACE) {
    const freq = {};
    for (let face of ar.faces) {
      freq[face] = (freq[face] || 0) + 1;
    }
    const maxFreq = Math.max(...Object.values(freq));
    if (maxFreq >= 3) {
      atk.rerolls += 1;
    }
    if (maxFreq >= 4) {
      ar.pierce = true;
    }
    if (maxFreq >= 5) {
      // 大乱斗 AoE 模式下，如果触发额外回合，随便选一个存活的目标
      const aliveOthers = state.players.filter((p, i) => i !== state.turnData.attackerIdx && !p.isDead);
      if (aliveOthers.length > 0) {
        if (!state.extraTurnQueue) state.extraTurnQueue = [];
        state.extraTurnQueue.push({ attackerId: atk.id, targetId: aliveOthers[0].id });
      }
    }
  }

  // --- 2. Process each target ---
  for (const pid of Object.keys(aoeDefenses)) {
    const result = resolveAoeTarget(state, pid, { atk, ar, atkMulti, selectedAttackFaces, finalBaseAtk, eatTriggeredBy });
    if (!result) continue;
    aoeResults.push(result);
    if (result.damage === 0) noDamageCount++;
    if (result.firstBloodTriggered) firstBloodTriggeredGlobal = true;
    if (result.extraTurnTriggered) {
      anyExtraTurnTriggered = true;
      extraTurnGainers.push(pid);
    }
  }

  // 忘词惩罚
  let selfDamage = ar.selfDamage || 0;
  if (atk.card.negativeSkill?.id === SKILL.FORGET_LYRICS && state.turnData.hasAttackerRerolled && noDamageCount > 0) {
    const fd = noDamageCount * 2 * atkMulti;
    selfDamage += fd;
    atk.hp = Math.max(0, atk.hp - fd);
  }

  // Add extraTurnGainers to queue
  if (extraTurnGainers.length > 0) {
    if (!state.extraTurnQueue) state.extraTurnQueue = [];
    extraTurnGainers.forEach(pid => {
      state.extraTurnQueue.push({ attackerId: pid, targetId: atk.id });
    });
  }

  appendBattleLog(state, {
    type: 'turn',
    actorId: atk.id,
    text: `${atk.nickname} 发动群体攻击，结算 ${aoeResults.length} 名目标`,
    details: {
      actorName: atk.nickname,
      pierce: !!ar.pierce,
      selfDamage,
      targets: aoeResults.map(result => {
        const target = findPlayer(state, result.playerId);
        return {
          playerId: result.playerId,
          targetName: target?.nickname || '未知目标',
          damage: result.damage || 0,
          counterDamage: result.lcCounterDamage || 0,
          healAmount: result.healAmount || 0,
        };
      }),
    },
  });
  advanceAttackerTimedStates(state, atk);

  const attackerIdx = state.turnData.attackerIdx;
  const { gameOver, winner, classChanged, nextSubject, dayChanged, currentDay } = resolvePhaseEnd(state);

  return {
    ok: true,
    isAoE: true,
    aoeResults,
    atkResult: ar,
    selfDamage,
    firstBloodTriggered: firstBloodTriggeredGlobal,
    extraTurnTriggered: anyExtraTurnTriggered,
    gameOver, winner, classChanged, nextSubject, dayChanged, currentDay,
    attackerIdx
  };

}
