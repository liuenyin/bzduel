import { resolvePhaseEnd } from './phase.js';
import { advanceAttackerTimedStates, checkElephantCondemn } from './turn-state.js';
import { calcTacticalCardEffects } from './tactical-effects.js';
import { removePositiveSkill, reviveNineLives, resolveDefenderNegativeSkill } from './skills.js';
import { getRollingPool, getAllowedSlotCount } from './dice.js';
import { appendBattleLog } from './battle-log.js';
import { canPlayBattleAction, getCourseMultiplier, areValidDiceIndices, findPlayer } from './primitives.js';
import { TURN } from '../../../shared/turn.js';
import { PHASE, GAME_MODE, IDENTITY } from '../../../shared/rules.js';
import { SKILL } from '../../../shared/characters.js';
import { getRandomCard } from '../../../shared/cards.js';

export function confirmDefense(state, playerId, keepIndices, options = {}) {
  if (!canPlayBattleAction(state) || state.turnPhase !== TURN.DEF_ROLLED) return { ok: false };
  if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};
  
  const atk = state.players[state.turnData.attackerIdx];
  if (!atk?.card || atk.isDead || atk.hp <= 0) return { ok: false, error: 'player_defeated' };
  const subj = state.schedule[state.currentClassIndex];
  let atkMulti = getCourseMultiplier(atk, state);
  const ar = state.turnData.atkResult;
  if (!ar || !Number.isFinite(ar.finalAtk)) return { ok: false, error: 'invalid_turn_state' };
  let finalBaseAtk = ar.finalAtk;

  if (state.turnData.isAoE) {
    const aoeDefenses = state.turnData.aoeDefenses;
    if (!aoeDefenses || typeof aoeDefenses !== 'object' || !aoeDefenses[playerId]) return { ok: false };
    const defState = aoeDefenses[playerId];
    if (defState.confirmed) return { ok: false };

    const def = findPlayer(state, playerId);
    if (!def || def.isDead || def.hp <= 0) return { ok: false, error: 'player_defeated' };
    const allowedDefSlots = getAllowedSlotCount(state, def.id, 'defense');
    if (!areValidDiceIndices(keepIndices, defState.rolls?.length, allowedDefSlots)) {
      return { ok: false, error: 'invalid_slots' };
    }

    defState.confirmed = true;
    defState.keepIndices = keepIndices;
    defState.options = options;

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
    const atk = state.players[state.turnData.attackerIdx];
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
    Object.keys(aoeDefenses).forEach(pid => {
      const p = findPlayer(state, pid);
      const ds = aoeDefenses[pid];
      if (!p || p.isDead || p.hp <= 0 || !ds.confirmed) return;
      const defenseRolls = Array.isArray(ds.rolls) ? ds.rolls : [];
      const defenseKeepIndices = Array.isArray(ds.keepIndices) ? ds.keepIndices : [];
      let pMulti = getCourseMultiplier(p, state);
      const primaryDefender = Number.isInteger(state.turnData.defenderIdx)
        ? state.players[state.turnData.defenderIdx]
        : null;
      const isPrimary = primaryDefender?.id === pid;
      const pKeptRolls = defenseKeepIndices.map(i => defenseRolls[i]);
      
      // 语文-增益 (card_chi_2): 选中的点数最小骰子自动变为最大面值
      const defTurnCards = p.playedTurnCards || (p.playedTurnCard ? [p.playedTurnCard] : []);
      if (defTurnCards.some(c => c.id === 'card_chi_2') && pKeptRolls.length > 0) {
        let minVal = Math.min(...pKeptRolls);
        let minIdx = pKeptRolls.indexOf(minVal);
        if (minIdx !== -1) {
          const origDieIdx = defenseKeepIndices[minIdx];
          const maxFace = getRollingPool(p, state)[origDieIdx] || 6;
          pKeptRolls[minIdx] = maxFace;
        }
      }

      // 语文-减益 (card_chi_3): 对方 (攻击者) 投出的最大骰子变为 2
      const atkTurnCards = atk.playedTurnCards || (atk.playedTurnCard ? [atk.playedTurnCard] : []);
      if (atkTurnCards.some(c => c.id === 'card_chi_3') && pKeptRolls.length > 0) {
        let maxVal = Math.max(...pKeptRolls);
        let maxIdx = pKeptRolls.indexOf(maxVal);
        if (maxIdx !== -1) pKeptRolls[maxIdx] = 2;
      }
      if (atkTurnCards.some(c => c.id === 'card_gen_06') && pKeptRolls.length > 0) {
        const maxIdx = pKeptRolls.indexOf(Math.max(...pKeptRolls));
        if (maxIdx !== -1) pKeptRolls[maxIdx] = Math.max(1, pKeptRolls[maxIdx] - 2);
      }

      // 姜鹏泽正面: 防御骰子也乘以课程倍率
      const pAdjustedRolls = p.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? pKeptRolls.map(v => Math.floor(v * pMulti)) : pKeptRolls;
      const pBaseDef = pAdjustedRolls.reduce((s, v) => s + v, 0);
      
      const turnDataSimulated = { hasDefenderRerolled: ds.hasRerolled };
      const defNeg = resolveDefenderNegativeSkill(p.card.negativeSkill, pMulti, state.totalRound, turnDataSimulated);
      if (defNeg.addPermanentPenalty) p.permanentDefPenalty = (p.permanentDefPenalty || 0) + defNeg.addPermanentPenalty;
      
      const tac = calcTacticalCardEffects(state, atk, p, selectedAttackFaces, pKeptRolls);
      let appliedDefBonus = tac.isNoFixedBonus ? 0 : tac.defBonus;
      
      const penalty = (defNeg.defensePenalty || 0) + (p.permanentDefPenalty || 0) - appliedDefBonus;
      const finalDef = Math.max(0, pBaseDef - penalty);

      // 李灿正面B: 献祭骰子回血
      let lcHealTriggered = false;
      let healAmount = 0;
      if (p.card.positiveSkill?.id === SKILL.GAL_PLAYER && ds.options?.sacrificeIndex !== undefined) {
        const sIdx = ds.options.sacrificeIndex;
        if (defenseKeepIndices.includes(sIdx)) {
          const kIdx = defenseKeepIndices.indexOf(sIdx);
          const orig = pKeptRolls[kIdx];
          if (orig > 1) {
            healAmount = orig - 1;
            pKeptRolls[kIdx] = 1;
            defenseRolls[sIdx] = 1;
            p.hp = Math.min(p.maxHp, p.hp + healAmount);
            lcHealTriggered = true;
          }
        }
      }

      const pFinalKeptRolls = pKeptRolls;
      const pFinalAdjusted = p.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? pFinalKeptRolls.map(v => Math.floor(v * pMulti)) : pFinalKeptRolls;
      const pFinalBaseDef = pFinalAdjusted.reduce((s, v) => s + v, 0);
      let pFinalFinalDef = Math.max(0, pFinalBaseDef - penalty);
      pFinalFinalDef = Math.floor(pFinalFinalDef * tac.defMultiplier);

      // 周煊声: 蓄势爆发时对方防御力× 1/(1+层数)
      if (state.turnData.chargeConsumed > 0) {
        pFinalFinalDef = Math.floor(pFinalFinalDef / (1 + state.turnData.chargeConsumed));
      }

      let targetFinalBaseAtk = finalBaseAtk;
      if (!isPrimary) {
        if (atkMulti === 0.5) targetFinalBaseAtk = Math.floor(finalBaseAtk * 0.33);
        else if (atkMulti === 1) targetFinalBaseAtk = Math.floor(finalBaseAtk * 0.5);
        else if (atkMulti === 2) targetFinalBaseAtk = Math.floor(finalBaseAtk * 0.66);
      }

      let damage = ar.pierce ? targetFinalBaseAtk : Math.max(0, targetFinalBaseAtk - pFinalFinalDef);
      if (!tac.isNoFixedBonus) damage += tac.flatPierce;
      damage = Math.floor(damage * tac.damageMultiplier);
      if (damage > tac.maxDmgCap) damage = tac.maxDmgCap;
      if (!tac.isNoFixedBonus) {
        damage += tac.finalBonusDamage;
        damage -= tac.finalDamageReduction;
      }
      damage = Math.max(0, damage);

      // 殷泽轩负面: 受到伤害时，最终伤害额外 +2 × 倍率
      if (damage > 0 && p.card.neutralSkill?.id === SKILL.VULNERABLE) {
        damage += Math.floor(2 * pMulti);
      }

      // 黄佳程正面: 天赋怪 (减伤)
      let talentTriggered = false;
      if (damage > 0 && p.card.positiveSkill?.id === SKILL.TALENTED) {
        const ratioCaught = pMulti === 2 ? 0.5 : (pMulti === 1 ? 0.75 : 1);
        if (ratioCaught < 1) {
          damage = Math.floor(damage * ratioCaught);
          talentTriggered = true;
        }
      }

      // 周煊声负面: 被发现 (每层蓄势+3伤害)
      if (damage > 0 && p.card.negativeSkill?.id === SKILL.CAUGHT && p.chargeStacks > 0) {
        damage += p.chargeStacks * 3;
      }

      if (damage > 0 && tac.halveFirstDamage) {
        damage = Math.floor(damage * 0.5);
        const historyBlessing = (p.activeBlessings || []).find(card => card.id === 'card_his_1');
        if (historyBlessing) historyBlessing.usedInClass = true;
      }

      // 李灿正面A: 反击伤害
      let lcCounterTriggered = false;
      let lcCounterDamage = 0;
      if (p.card.positiveSkill?.id === SKILL.GAL_PLAYER && pFinalFinalDef > targetFinalBaseAtk && !ar.pierce) {
        lcCounterDamage = pFinalFinalDef - targetFinalBaseAtk;
        atk.hp = Math.max(0, atk.hp - lcCounterDamage);
        lcCounterTriggered = true;
      }

      // 团长大人！触发：防守时未重投 → 获得骰子
      let commanderTriggered = false;
      if (!ds.hasRerolled && p.card.positiveSkill?.id === SKILL.COMMANDER_RECRUIT && !ar.pierce) {
        const newFace = pMulti === 0.5 ? 4 : (pMulti === 1 ? 6 : 8);
        p.card.dicePool.push(newFace);
        commanderTriggered = true;
      }

      // 杂鱼自残判定 (HJC: 攻击力 < 防御力 → 自身血量减半)
      let noobTriggered = false;
      if (targetFinalBaseAtk < pFinalFinalDef && atk.card.negativeSkill?.id === 'hjc_neg') {
        atk.hp -= Math.floor(atk.hp / 2);
        noobTriggered = true;
      }

      // 红温引爆 (WYC负面: 攻击≤防御时引爆对方红温)
      let detonateTriggered = false;
      let detonateDamage = 0;
      if (targetFinalBaseAtk <= pFinalFinalDef && atk.card.negativeSkill?.id === SKILL.RED_HEAT_DETONATE) {
        const opHeat = p.redHeat || 0;
        if (opHeat > 0) {
          detonateDamage = opHeat;
          // 天赋怪减伤也适用于红温引爆
          if (p.card.positiveSkill?.id === SKILL.TALENTED) {
            const dRatio = pMulti === 2 ? 0.5 : (pMulti === 1 ? 0.75 : 1);
            if (dRatio < 1) detonateDamage = Math.floor(detonateDamage * dRatio);
          }
          damage += detonateDamage;
          p.redHeat = 0;
          detonateTriggered = true;
        }
      }

      // 余汉负面: 操碎了心 — 目标当前低于20%时，本次直接伤害固定为1。
      if (damage > 1 && atk.card.negativeSkill?.id === SKILL.MAMA_MERCY
        && p.hp > 0 && p.hp < p.maxHp * 0.2) {
        damage = 1;
      }

      p.hp = Math.max(0, p.hp - damage);
      if (damage === 0) noDamageCount++;

      // 通用-其他 (card_gen_14): 本轮如果防守无伤，获得 2 TP
      const pTurnCards = p.playedTurnCards || (p.playedTurnCard ? [p.playedTurnCard] : []);
      if (pTurnCards.some(c => c.id === 'card_gen_14') && damage === 0) {
        p.tp = Math.min(10, (p.tp || 0) + 2);
        appendBattleLog(state, { text: `【通用-其他】${p.nickname} 防守无伤，获得 2 TP！`, type: 'skill', actorId: p.id, targetId: atk.id });
      }

      // 通用-其他 (card_gen_15): 本轮如果攻击造成伤害，抽 1 张学科战术卡
      const atkTurnCardsAoE = atk.playedTurnCards || (atk.playedTurnCard ? [atk.playedTurnCard] : []);
      if (atkTurnCardsAoE.some(c => c.id === 'card_gen_15') && damage > 0 && !state.turnData.gen15Drawn) {
        state.turnData.gen15Drawn = true;
        if ((atk.handCards || []).length < 3) {
          atk.handCards.push(getRandomCard(subj, atk.card?.subjects || []));
          appendBattleLog(state, { text: `【通用-其他】${atk.nickname} 攻击造成伤害，抽 1 张战术卡！`, type: 'skill', actorId: atk.id, targetId: p.id });
        }
      }

      // 红温叠加 (WYC正面: 造成伤害时给对方叠红温)
      let redHeatApplied = 0;
      if (damage > 0 && atk.card.positiveSkill?.id === SKILL.RED_HEAT_APPLY) {
        redHeatApplied = 1 + Math.floor(2 * atkMulti);
        p.redHeat = (p.redHeat || 0) + redHeatApplied;
      }

      // 触发 SUGAR_CRASH 负面效果
      if (damage >= 8 && p.card.negativeSkill?.id === SKILL.SUGAR_CRASH) {
        if (!p.buffs) p.buffs = [];
        p.buffs.push({ id: SKILL.SUGAR_CRASH, expireRound: state.totalRound + 2 });
      }

      let pFirstBloodTriggered = false;
      if (damage > 0 && p.card.negativeSkill?.id === SKILL.FIRST_BLOOD && !p.hasTakenDamage) {
        p.hasTakenDamage = true;
        if (p.card.defSlots > 1) p.card.defSlots -= 1;
        firstBloodTriggeredGlobal = true;
        pFirstBloodTriggered = true;
      }

      const pNineLivesTriggered = reviveNineLives(p);
      let pExtraTurnTriggered = false;
      if (damage >= 8 && p.card.positiveSkill?.id === SKILL.EXTRA_TURN && p.hp > 0) {
        pExtraTurnTriggered = true;
        anyExtraTurnTriggered = true;
        extraTurnGainers.push(pid);
        if (p.card.negativeSkill?.id === SKILL.BACK_PAIN && p.card.defSlots > 1) p.card.defSlots -= 1;
      }

      checkElephantCondemn(state, atk, p);
      checkElephantCondemn(state, p, atk);

      let pEatTriggered = eatTriggeredBy === pid;

      aoeResults.push({
        playerId: pid,
        damage, finalDef: pFinalFinalDef, penalty, baseDef: pBaseDef,
        defNegTriggered: defNeg.triggered, 
        defNegName: defNeg.triggered ? p.card.negativeSkill.name : null,
        defPosTriggered: lcHealTriggered || pExtraTurnTriggered || pEatTriggered || talentTriggered || lcCounterTriggered || commanderTriggered,
        defPosName: talentTriggered ? "天赋怪" : (commanderTriggered ? "团长大人!" : (pEatTriggered ? "吃掉!" : (lcHealTriggered ? "献祭" : (lcCounterTriggered ? "反击" : (pExtraTurnTriggered ? "死磕" : null))))),
        lcHealTriggered, healAmount, 
        eatTriggered: pEatTriggered,
        extraTurnTriggered: pExtraTurnTriggered,
        lcCounterDamage, lcCounterTriggered,
        noobTriggered,
        detonateTriggered, detonateDamage,
        redHeatApplied,
        firstBloodTriggered: pFirstBloodTriggered,
        nineLivesTriggered: pNineLivesTriggered
      });
    });

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
      attackerIdx: state.turnData.attackerIdx
    };

  } else {
    // 正常 1v1 防御逻辑
    const defIdx = state.turnData.defenderIdx;
    const def = state.players[defIdx];
    if (!def?.card || def.isDead || def.hp <= 0 || def.id !== playerId) return { ok: false };
    
    const allowedDefSlots = getAllowedSlotCount(state, def.id, 'defense');

    const defRolls = state.turnData.defenseRolls;
    if (!areValidDiceIndices(keepIndices, defRolls?.length, allowedDefSlots)) {
      return { ok: false, error: 'invalid_slots' };
    }

    // 曾无畏负面: 防御时只能选中一个 D10
    if (def.card.neutralSkill?.id === SKILL.D10_LIMIT) {
      const effectivePool = getRollingPool(def, state);
      const d10Count = keepIndices.filter(idx => effectivePool[idx] === 10).length;
      if (d10Count > 1) return { ok: false, error: 'zww_d10_limit' };
    }
    
    let defMulti = getCourseMultiplier(def, state);

    def.lastMaxRoll = Math.max(...defRolls);
    def.unusedDiceSum = defRolls.filter((_, i) => !keepIndices.includes(i)).reduce((a, b) => a + b, 0);

    let keptRolls = keepIndices.map(i => defRolls[i]);

    // 语文-增益 (card_chi_2): 选中的点数最小骰子自动变为最大面值
    const defTurnCards = def.playedTurnCards || (def.playedTurnCard ? [def.playedTurnCard] : []);
    if (defTurnCards.some(c => c.id === 'card_chi_2') && keptRolls.length > 0) {
      let minVal = Math.min(...keptRolls);
      let minIdx = keptRolls.indexOf(minVal);
      if (minIdx !== -1) {
        const origDieIdx = keepIndices[minIdx];
        const maxFace = getRollingPool(def, state)[origDieIdx] || 6;
        keptRolls[minIdx] = maxFace;
      }
    }

    // 语文-减益 (card_chi_3): 对方 (攻击者) 投出的最大骰子变为 2
    const atkTurnCards = atk.playedTurnCards || (atk.playedTurnCard ? [atk.playedTurnCard] : []);
    if (atkTurnCards.some(c => c.id === 'card_chi_3') && keptRolls.length > 0) {
      let maxVal = Math.max(...keptRolls);
      let maxIdx = keptRolls.indexOf(maxVal);
      if (maxIdx !== -1) keptRolls[maxIdx] = 2;
    }
    if (atkTurnCards.some(c => c.id === 'card_gen_06') && keptRolls.length > 0) {
      const maxIdx = keptRolls.indexOf(Math.max(...keptRolls));
      if (maxIdx !== -1) keptRolls[maxIdx] = Math.max(1, keptRolls[maxIdx] - 2);
    }

    // 姜鹏泽正面: 防御骰子也乘以课程倍率
    const adjustedDefRolls = def.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? keptRolls.map(v => Math.floor(v * defMulti)) : keptRolls;
    const baseDef = adjustedDefRolls.reduce((s, v) => s + v, 0);

    const hasStu2Def = defTurnCards.some(c => c.id === 'card_stu_2');
    const defNeg = hasStu2Def ? { triggered: false } : resolveDefenderNegativeSkill(def.card.negativeSkill, defMulti, state.totalRound, state.turnData);
    
    if (defNeg.addPermanentPenalty) {
      def.permanentDefPenalty = (def.permanentDefPenalty || 0) + defNeg.addPermanentPenalty;
    }
    
    const attackRolls = Array.isArray(state.turnData.attackRolls) ? state.turnData.attackRolls : [];
    const attackKeepIndices = Array.isArray(ar.keptIndices) ? ar.keptIndices : [];
    const selectedAttackFaces = attackKeepIndices.map(index => Number(attackRolls[index]) || 0);
    if (!Array.isArray(ar.faces) || ar.faces.length !== selectedAttackFaces.length) {
      ar.faces = [...selectedAttackFaces];
    }
    const tac = calcTacticalCardEffects(state, atk, def, selectedAttackFaces, keptRolls);

    let appliedDefBonus = tac.isNoFixedBonus ? 0 : tac.defBonus;
    
    const penalty = (defNeg.defensePenalty || 0) + (def.permanentDefPenalty || 0) - appliedDefBonus;
    const finalDef = Math.floor(Math.max(0, baseDef - penalty) * tac.defMultiplier);

    // 曾无畏正面: “吃掉!” 将对方选定的最大骰子改为 2
    let eatTriggered = false;
    if (def.card.positiveSkill?.id === SKILL.EAT_IT) {
      let maxVal = -1, maxIdx = -1;
      for (let index = 0; index < selectedAttackFaces.length; index++) {
        if (selectedAttackFaces[index] > maxVal) {
          maxVal = selectedAttackFaces[index];
          maxIdx = index;
        }
      }
      if (maxVal > 2) {
        finalBaseAtk = Math.max(0, finalBaseAtk - maxVal + 2);
        eatTriggered = true;
        if (maxIdx !== -1) ar.faces[maxIdx] = 2;
        ar.finalAtk = finalBaseAtk;
      }
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
        if (!state.extraTurnQueue) state.extraTurnQueue = [];
        state.extraTurnQueue.push({ attackerId: atk.id, targetId: def.id });
      }
    }

    // 李灿正面B: 献祭骰子回血
    let lcHealTriggered = false;
    let healAmount = 0;
    if (def.card.positiveSkill?.id === SKILL.GAL_PLAYER && options.sacrificeIndex !== undefined) {
      const sIdx = options.sacrificeIndex;
      if (keepIndices.includes(sIdx)) {
        const kIdx = keepIndices.indexOf(sIdx);
        const orig = keptRolls[kIdx];
        if (orig > 1) {
          healAmount = orig - 1;
          keptRolls[kIdx] = 1;
          defRolls[sIdx] = 1; // 变为1
          def.hp = Math.min(def.maxHp, def.hp + healAmount);
          lcHealTriggered = true;
        }
      }
    }

    // 重新计算最终防御
    const finalKeptRolls = keptRolls;
    const finalAdjusted = def.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? finalKeptRolls.map(v => Math.floor(v * defMulti)) : finalKeptRolls;
    const finalBaseDef = finalAdjusted.reduce((s, v) => s + v, 0);
    let finalFinalDef = Math.floor(Math.max(0, finalBaseDef - penalty) * tac.defMultiplier);

    // 周煊声: 蓄势爆发时对方防御力× 1/(1+层数)
    if (state.turnData.chargeConsumed > 0) {
      finalFinalDef = Math.floor(finalFinalDef / (1 + state.turnData.chargeConsumed));
    }

    let isPierce = ar.pierce || atkTurnCards.some(c => c.id === 'card_mat_3' || c.id === 'card_it_3');
    let damage = isPierce ? finalBaseAtk : Math.max(0, finalBaseAtk - finalFinalDef);
    if (!tac.isNoFixedBonus) damage += tac.flatPierce;
    damage = Math.floor(damage * tac.damageMultiplier);
    if (damage > tac.maxDmgCap) damage = tac.maxDmgCap;
    if (!tac.isNoFixedBonus) {
      damage += tac.finalBonusDamage;
      damage -= tac.finalDamageReduction;
    }
    damage = Math.max(0, damage);

    // 生物-增益 (card_bio_2): 防守溢出数值×1.5转化为生命回复
    if (defTurnCards.some(c => c.id === 'card_bio_2') && finalFinalDef > finalBaseAtk && !isPierce) {
      const overflow = finalFinalDef - finalBaseAtk;
      const bioHeal = Math.floor(overflow * 1.5);
      if (bioHeal > 0) {
        def.hp = Math.min(def.maxHp, def.hp + bioHeal);
      }
    }

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
    if (atkTurnCards.some(c => c.id === 'card_gen_15') && damage > 0) {
      if ((atk.handCards || []).length < 3) {
        atk.handCards.push(getRandomCard(subj, atk.card?.subjects || []));
        appendBattleLog(state, { text: `【通用-其他】${atk.nickname} 攻击造成伤害，抽 1 张战术卡！`, type: 'skill', actorId: atk.id, targetId: def.id });
      }
    }

  // 廖展韬深度思考: 对方的永久减伤
  if (damage > 0 && (def.invertReduction || 0) > 0) {
    damage = Math.max(0, damage - def.invertReduction);
  }
  
  // 殷泽轩负面: 受到伤害时，最终伤害额外 +2 × 倍率
  if (damage > 0 && def.card.neutralSkill?.id === SKILL.VULNERABLE) {
    damage += Math.floor(2 * defMulti);
  }

  // 黄佳程正面: 天赋怪 (减伤)
  let talentTriggered = false;
  if (damage > 0 && def.card.positiveSkill?.id === SKILL.TALENTED) {
    const ratio = defMulti === 2 ? 0.5 : (defMulti === 1 ? 0.75 : 1);
    if (ratio < 1) {
      damage = Math.floor(damage * ratio);
      talentTriggered = true;
    }
  }

  // 周煊声负面: 被发现 (每层蓄势+3伤害)
  if (damage > 0 && def.card.negativeSkill?.id === SKILL.CAUGHT && def.chargeStacks > 0) {
    damage += def.chargeStacks * 3;
  }

  if (damage > 0 && tac.halveFirstDamage) {
    damage = Math.floor(damage * 0.5);
    const historyBlessing = (def.activeBlessings || []).find(card => card.id === 'card_his_1');
    if (historyBlessing) historyBlessing.usedInClass = true;
  }

  // 付修然正面: 防御选中的骰点数和 >= 15 记一次梦境
  if (def.card.positiveSkill?.id === SKILL.DREAM_KING) {
    const sumChosen = keptRolls.reduce((s, v) => s + v, 0);
    if (sumChosen >= 15) {
      if ((def.dreamStacks || 0) < 3) def.rerolls = (def.rerolls || 0) + 1;
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
  if (def.card.positiveSkill?.id === SKILL.GAL_PLAYER && finalFinalDef > finalBaseAtk && !ar.pierce) {
    lcCounterDamage = finalFinalDef - finalBaseAtk;
    atk.hp = Math.max(0, atk.hp - lcCounterDamage);
    lcCounterTriggered = true;
  }

  // 杂鱼自残判定 (HJC: 最终攻击力 < 防御力 → 自身血量减半)
  let noobTriggered = false;
  if (finalBaseAtk < finalFinalDef && atk.card.negativeSkill?.id === 'hjc_neg') {
    atk.hp -= Math.floor(atk.hp / 2);
    noobTriggered = true;
  }

  // 团长大人！触发：防守时未重投 → 获得骰子
  let commanderTriggered = false;
  if (!state.turnData.hasDefenderRerolled && def.card.positiveSkill?.id === SKILL.COMMANDER_RECRUIT && !ar.pierce) {
    const newFace = defMulti === 0.5 ? 4 : (defMulti === 1 ? 6 : 8);
    def.card.dicePool.push(newFace);
    commanderTriggered = true;
  }

  // 余汉负面: 操碎了心 — 在扣血前判断目标是否已低于20%。
  if (damage > 1 && atk.card.negativeSkill?.id === SKILL.MAMA_MERCY
    && def.hp > 0 && def.hp < def.maxHp * 0.2) {
    damage = 1;
  }

  // 应用伤害
  def.hp = Math.max(0, def.hp - damage);
  atk.hp = Math.max(0, atk.hp - ar.selfDamage);

  // 付修然负面: 小象的谴责
  checkElephantCondemn(state, atk, def);
  checkElephantCondemn(state, def, atk);

  // 余汉正面: 妈! — 防御溢出回血
  let mamaHealTriggered = false;
  let mamaHealAmount = 0;
  if (def.card.positiveSkill?.id === SKILL.MAMA_HEAL && finalFinalDef > finalBaseAtk && !ar.pierce) {
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
  if (damage >= 8 && def.card.negativeSkill?.id === SKILL.STICKER_SELF) {
    def.selfStickers = (def.selfStickers || 0) + 1;
    if (def.selfStickers >= 2) {
      selfStickerDamage = Math.floor(def.hp * 0.3);
      def.hp = Math.max(0, def.hp - selfStickerDamage);
      def.redHeat = (def.redHeat || 0) + 3;
      def.selfStickers = 0;
      selfStickerExploded = true;
    }
  }

  // 姜鹏泽负面: 首次受伤时防御选骰数 -1
  let firstBloodTriggeredThisTurn = false;
  if (damage > 0 && def.card.negativeSkill?.id === SKILL.FIRST_BLOOD && !def.hasTakenDamage) {
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
  if (finalBaseAtk <= finalFinalDef && atk.card.negativeSkill?.id === SKILL.RED_HEAT_DETONATE) {
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
  if (damage >= 8 && def.card.negativeSkill?.id === SKILL.SUGAR_CRASH) {
    if (!def.buffs) def.buffs = [];
    def.buffs.push({ id: SKILL.SUGAR_CRASH, expireRound: state.totalRound + 2 });
  }

  // 张锦元正面: 九条命 — 首次HP归零时复活
  const defenderNineLivesTriggered = reviveNineLives(def);
  const attackerNineLivesTriggered = reviveNineLives(atk);
  const nineLivesTriggered = defenderNineLivesTriggered || attackerNineLivesTriggered;

  // Check game over & handle deaths
  let gameOver = false, winner = null, classChanged = false, nextSubject = null;
  let dayChanged = false, currentDay = state.currentDay || 1;
  const prevAttackerIdx = state.turnData.attackerIdx;
  
  if (atk.hp <= 0) {
    atk.hp = 0;
    if (!atk.isDead) {
      atk.isDead = true;
      // atk caused their own death
    }
  }
  if (def.hp <= 0) {
    def.hp = 0;
    if (!def.isDead) {
      def.isDead = true;
      // Lord kills Loyalist penalty
      if (state.gameMode === GAME_MODE.MODE_FFA && atk.identity === IDENTITY.LORD && def.identity === IDENTITY.LOYALIST) {
        removePositiveSkill(atk); // 主公误杀忠臣，失去正面技能
        appendBattleLog(state, { text: `【系统】主公 ${atk.nickname} 误杀忠臣，失去了正面技能！`, type: 'system', actorId: atk.id, targetId: def.id });
      }
    }
  }

  // 结算胜负
  if (state.gameMode === GAME_MODE.MODE_1V1) {
    if (atk.isDead || def.isDead) {
      gameOver = true;
      if (atk.isDead && def.isDead) winner = 'draw';
      else if (def.isDead) winner = state.turnData.attackerIdx;
      else winner = state.turnData.defenderIdx;
      state.phase = PHASE.GAME_OVER;
      state.winner = winner;
    }
  } else {
    // FFA 胜负
    const lord = state.players.find(p => p.identity === IDENTITY.LORD);
    if (lord && lord.isDead) {
      gameOver = true;
      state.phase = PHASE.GAME_OVER;
      const aliveSpies = state.players.filter(p => p.identity === IDENTITY.SPY && !p.isDead);
      const otherAlive = state.players.filter(p => p.identity !== IDENTITY.SPY && !p.isDead);
      if (aliveSpies.length === 1 && otherAlive.length === 0) {
        winner = 'spy';
      } else {
        winner = 'rebel';
      }
      state.winner = winner;
    } else {
      const aliveBadGuys = state.players.filter(p => (p.identity === IDENTITY.REBEL || p.identity === IDENTITY.SPY) && !p.isDead);
      if (aliveBadGuys.length === 0) {
        gameOver = true;
        state.phase = PHASE.GAME_OVER;
        winner = 'lord';
        state.winner = winner;
      }
    }
  }

  // 张楚唯正面: 逆袭 — 受到 >=8 伤害时获得额外攻击回合
  let extraTurnTriggered = false;
  if (damage >= 8 && def.card.positiveSkill?.id === SKILL.EXTRA_TURN && !gameOver && def.hp > 0) {
    extraTurnTriggered = true;
    if (!state.extraTurnQueue) state.extraTurnQueue = [];
    state.extraTurnQueue.push({ attackerId: def.id, targetId: atk.id });
    // 张楚唯负面: 腰疼？ — 每次逆袭后防御选骰 -1
    if (def.card.negativeSkill?.id === SKILL.BACK_PAIN && def.card.defSlots > 1) {
      def.card.defSlots -= 1;
    }
  }

  appendBattleLog(state, {
    type: 'turn',
    actorId: atk.id,
    targetId: def.id,
    text: damage > 0
      ? `${atk.nickname} 对 ${def.nickname} 造成 ${damage} 点伤害`
      : `${def.nickname} 完成防守，未受到伤害`,
    details: {
      actorName: atk.nickname,
      targetName: def.nickname,
      damage,
      selfDamage: ar.selfDamage || 0,
      pierce: !!isPierce,
      counterDamage: lcCounterDamage || 0,
      healAmount: healAmount || 0,
    },
  });
  advanceAttackerTimedStates(state, atk);

  const chargeConsumed = state.turnData?.chargeConsumed || 0;
  const resPhase = resolvePhaseEnd(state);
  gameOver = resPhase.gameOver;
  winner = resPhase.winner;
  classChanged = resPhase.classChanged;
  nextSubject = resPhase.nextSubject;
  dayChanged = resPhase.dayChanged;
  currentDay = resPhase.currentDay;
  
  return {
    ok: true, baseDef, finalDef, penalty, keptIndices: keepIndices,
    atkResult: ar,
    defNegTriggered: defNeg.triggered,
    defNegName: defNeg.triggered ? def.card.negativeSkill.name : null,
    defPosTriggered: commanderTriggered || talentTriggered || eatTriggered || lcHealTriggered || lcCounterTriggered || extraTurnTriggered,
    defPosName: talentTriggered ? "天赋怪" : (commanderTriggered ? "团长大人!" : (eatTriggered ? "吃掉!" : (lcHealTriggered ? "献祭" : (lcCounterTriggered ? "反击" : (extraTurnTriggered ? "死磕" : null))))),
    noobTriggered, detonateTriggered, detonateDamage, redHeatApplied,
    damage, selfDamage: ar.selfDamage, pierce: ar.pierce,
    lcCounterDamage, healAmount, lcHealTriggered, eatTriggered,
    extraTurnTriggered,
    firstBloodTriggered: firstBloodTriggeredThisTurn,
    nineLivesTriggered,
    chargeConsumed,
    gameOver, winner, classChanged, nextSubject, dayChanged, currentDay,
    attackerIdx: prevAttackerIdx,
  };
  }
}

