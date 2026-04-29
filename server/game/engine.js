// ============================================================
// 校园战力党 — 核心对战引擎 (阶段制状态机)
// ============================================================
import {
  SUBJECTS, CORE_SUBJECTS, ELECTIVE_SUBJECTS, MINOR_SUBJECTS,
  GAME_CONFIG, PHASE, getSkillMultiplier,
} from '../../shared/rules.js';
import { characterMap, SKILL } from '../../shared/characters.js';

// ── 回合子阶段 ──
export const TURN = {
  WAITING_ATK: 'waiting_atk',
  ATK_ROLLED: 'atk_rolled',
  DEF_ROLLED: 'def_rolled',
};

// ── 工具函数 ──
function rollDie(faces) { return Math.floor(Math.random() * faces) + 1; }
function rollDiceGroup(arr) { return arr.map(f => rollDie(f)); }
function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function pickRandom(arr, n) { return shuffle(arr).slice(0, n); }

export function generateSchedule() {
  return shuffle([
    ...pickRandom(CORE_SUBJECTS, 2),
    ...pickRandom(ELECTIVE_SUBJECTS, 2),
    ...pickRandom(MINOR_SUBJECTS, 2),
  ]);
}

// ── 创建游戏 ──
export function createGame(p1Id, p1Name, p2Id, p2Name) {
  return {
    phase: PHASE.PREPARATION,
    players: [makePlayer(p1Id, p1Name), makePlayer(p2Id, p2Name)],
    schedule: generateSchedule(),
    currentClassIndex: 0,
    firstAttacker: 0,
    currentSubRound: 0,
    totalRound: 1,
    turnPhase: TURN.WAITING_ATK,
    turnData: { attackerIdx: 0, defenderIdx: 1, attackRolls: null, defenseRolls: null, hasAttackerRerolled: false, hasDefenderRerolled: false },
    log: [],
    winner: null,
  };
}

function makePlayer(id, name) {
  return {
    id, nickname: name, cardId: null, card: null,
    hp: 0, maxHp: 0, ready: false,
    hasReschedule: true,
    rerolls: GAME_CONFIG.REROLLS_PER_GAME,
    buffs: [],
  };
}

// ── 准备阶段 ──
export function selectCard(state, playerId, cardId) {
  const p = findPlayer(state, playerId);
  if (!p || state.phase !== PHASE.PREPARATION) return { ok: false };
  const def = characterMap[cardId];
  if (!def) return { ok: false };
  p.cardId = cardId;
  p.card = JSON.parse(JSON.stringify(def));
  p.hp = def.hp; p.maxHp = def.hp; p.ready = false;
  return { ok: true };
}

export function setReady(state, playerId) {
  const p = findPlayer(state, playerId);
  if (!p || !p.cardId) return { ok: false };
  p.ready = true;
  if (state.players.every(pl => pl.ready)) {
    state.phase = PHASE.BATTLE;
    state.currentClassIndex = 0;
    state.currentSubRound = 0;
    state.firstAttacker = 0;
    state.totalRound = 1;
    const atkIdx = 0;
    state.turnPhase = TURN.WAITING_ATK;
    state.turnData = { attackerIdx: atkIdx, defenderIdx: 1 - atkIdx, attackRolls: null, defenseRolls: null, hasAttackerRerolled: false, hasDefenderRerolled: false };
    return { ok: true, battleStarted: true };
  }
  return { ok: true, battleStarted: false };
}

export function useReschedule(state, playerId, classIndex, newSubject) {
  const p = findPlayer(state, playerId);
  if (!p || !p.hasReschedule) return { ok: false };
  if (classIndex < state.currentClassIndex || classIndex >= GAME_CONFIG.CLASSES_PER_GAME) return { ok: false };
  if (!SUBJECTS[newSubject]) return { ok: false };
  state.schedule[classIndex] = newSubject;
  p.hasReschedule = false;
  return { ok: true };
}

// ── 阶段1: 攻击方掷骰 ──
export function rollAttack(state) {
  if (state.phase !== PHASE.BATTLE || state.turnPhase !== TURN.WAITING_ATK) return { ok: false };
  const atk = state.players[state.turnData.attackerIdx];
  const subj = state.schedule[state.currentClassIndex];
  const multi = getSkillMultiplier(atk.card.subjects, subj);

  // 清理过期 buff
  if (!atk.buffs) atk.buffs = [];
  atk.buffs = atk.buffs.filter(b => b.expireRound > state.totalRound);

  // 结算回合开始效果
  if (atk.buffs.find(b => b.id === SKILL.SUGAR_CRASH)) {
    atk.hp -= Math.floor(4 * multi);
    if (atk.hp < 0) atk.hp = 0;
  }
  if (atk.card.negativeSkill?.id === SKILL.UNSUSTAINABLE) {
    atk.hp -= Math.floor(2 * multi);
    if (atk.hp < 0) atk.hp = 0;
  }

  // 如果自伤致死，立刻判定游戏结束
  if (atk.hp <= 0) {
    state.phase = PHASE.GAME_OVER;
    state.winner = state.turnData.defenderIdx;
    return { ok: true, rolls: [], selfKill: true };
  }

  if (atk.card.positiveSkill?.id === SKILL.STAR_SHOWOFF) {
    atk.rerolls += 2;
  }

  // 黄佳程过敏判定 (10% 概率)
  let allergyTriggered = false;
  if (atk.card.negativeSkill?.id === 'hjc_neg' && Math.random() < 0.1) {
    allergyTriggered = true;
  }

  const rolls = rollDiceGroup(atk.card.dicePool);
  state.turnData.attackRolls = rolls;
  state.turnData.allergyTriggered = allergyTriggered;
  state.turnPhase = TURN.ATK_ROLLED;
  return { ok: true, rolls: [...rolls] };
}

// ── 阶段2: 重投骰子 (攻击或防御阶段通用) ──
export function rerollDice(state, playerId, indices) {
  const p = findPlayer(state, playerId);
  if (!p || p.rerolls <= 0) return { ok: false };
  if (!indices || indices.length === 0) return { ok: false };

  // 检查是否被禁锢重投
  if (p.buffs && p.buffs.find(b => b.id === SKILL.SUGAR_CRASH)) return { ok: false, error: 'sugar_crash_locked' };

  let rolls;
  if (state.turnPhase === TURN.ATK_ROLLED) {
    if (state.players[state.turnData.attackerIdx].id !== playerId) return { ok: false };
    rolls = state.turnData.attackRolls;
  } else if (state.turnPhase === TURN.DEF_ROLLED) {
    if (state.players[state.turnData.defenderIdx].id !== playerId) return { ok: false };
    rolls = state.turnData.defenseRolls;
  } else {
    return { ok: false };
  }

  const faces = p.card.dicePool;
  for (const i of indices) {
    if (i < 0 || i >= rolls.length) return { ok: false };
    rolls[i] = rollDie(faces[i]);
  }
  p.rerolls--;
  if (state.turnPhase === TURN.ATK_ROLLED) {
    state.turnData.hasAttackerRerolled = true;
  } else if (state.turnPhase === TURN.DEF_ROLLED) {
    state.turnData.hasDefenderRerolled = true;
  }
  return { ok: true, rolls: [...rolls], remaining: p.rerolls };
}

// ── 阶段3: 攻击方确认 → 结算攻击技能 → 自动掷防御骰 ──
export function confirmAttack(state, keepIndices) {
  if (state.turnPhase !== TURN.ATK_ROLLED) return { ok: false };
  const atk = state.players[state.turnData.attackerIdx];

  if (!keepIndices || keepIndices.length === 0) return { ok: false, error: 'invalid_slots' };
  if (atk.card.atkSlots !== -1 && keepIndices.length !== atk.card.atkSlots) return { ok: false, error: 'invalid_slots' };
  
  const def = state.players[state.turnData.defenderIdx];
  const subj = state.schedule[state.currentClassIndex];
  const multi = getSkillMultiplier(atk.card.subjects, subj);

  const atkRolls = state.turnData.attackRolls;
  const keptRolls = keepIndices.map(i => atkRolls[i]);
  const baseAtk = keptRolls.reduce((s, v) => s + v, 0);

  const pos = resolvePositiveSkill(atk.card.positiveSkill, multi, keptRolls, state.totalRound, state.turnData);
  const neg = resolveNegativeSkill(atk.card.negativeSkill, multi, keptRolls, state.totalRound);

  // Apply composite multiplier from STAR_SHOWOFF
  let finalBase = baseAtk;
  if (pos.multiplierBonus) {
    finalBase = Math.floor(baseAtk * (pos.multiplierBonus + multi));
  }

  // 黄佳程过敏处理: 强制锁定攻击力
  let allergyNote = null;
  if (state.turnData.allergyTriggered) {
    finalBase = 4 * multi;
    allergyNote = '过敏触发';
  }

  // Apply permanent dice upgrade
  if (pos.upgradeDice) {
    let pool = atk.card.dicePool;
    // pick 2 different random indices
    let idxs = pool.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, 2);
    for (let i of idxs) {
      if (pool[i] < 12) pool[i] = Math.min(12, pool[i] + (pos.upgradeAmount || 2));
    }
  }

  state.turnData.atkResult = {
    baseAtk: finalBase, bonusDamage: pos.bonusDamage || 0, pierce: pos.pierce || false,
    selfDamage: neg.selfDamage || 0, finalAtk: finalBase + (pos.bonusDamage || 0),
    posTriggered: pos.triggered, posName: pos.triggered ? atk.card.positiveSkill.name : null,
    negTriggered: neg.triggered || state.turnData.allergyTriggered, 
    negName: state.turnData.allergyTriggered ? "过敏" : (neg.triggered ? atk.card.negativeSkill.name : null),
    keptIndices: keepIndices,
  };

  // Auto-roll defense using pool
  const defRolls = rollDiceGroup(def.card.dicePool);
  state.turnData.defenseRolls = defRolls;
  state.turnPhase = TURN.DEF_ROLLED;

  return { ok: true, atkResult: state.turnData.atkResult, defenseRolls: [...defRolls] };
}

// ── 阶段4: 防守方确认 → 结算 → 伤害 → 推进回合 ──
export function confirmDefense(state, keepIndices) {
  if (state.turnPhase !== TURN.DEF_ROLLED) return { ok: false };
  const def = state.players[state.turnData.defenderIdx];
  
  if (!keepIndices || keepIndices.length !== def.card.defSlots) return { ok: false, error: 'invalid_slots' };
  
  const atk = state.players[state.turnData.attackerIdx];
  const subj = state.schedule[state.currentClassIndex];
  const defMulti = getSkillMultiplier(def.card.subjects, subj);

  const defRolls = state.turnData.defenseRolls;
  const keptRolls = keepIndices.map(i => defRolls[i]);
  const baseDef = keptRolls.reduce((s, v) => s + v, 0);
  const defNeg = resolveDefenderNegativeSkill(def.card.negativeSkill, defMulti, state.totalRound, state.turnData);
  
  if (defNeg.addPermanentPenalty) {
    def.permanentDefPenalty = (def.permanentDefPenalty || 0) + defNeg.addPermanentPenalty;
  }
  
  const penalty = (defNeg.defensePenalty || 0) + (def.permanentDefPenalty || 0);
  const finalDef = Math.max(0, baseDef - penalty);

  const ar = state.turnData.atkResult;
  let damage = ar.pierce ? ar.finalAtk : Math.max(0, ar.finalAtk - finalDef);
  
  // 天赋怪减伤判定
  let talentTriggered = false;
  if (def.card.positiveSkill?.id === SKILL.TALENTED) {
    const reductionMulti = defMulti === 0.5 ? 1 : (defMulti === 1 ? 0.75 : 0.5);
    damage = Math.round(damage * reductionMulti);
    talentTriggered = true;
  }

  // 杂鱼自残判定
  let noobTriggered = false;
  if (ar.finalAtk < finalDef && atk.card.negativeSkill?.id === 'hjc_neg') {
    atk.hp -= Math.floor(atk.hp / 2);
    noobTriggered = true;
  }

  // 团长大人！触发：防守点数 > 攻击点数
  let commanderTriggered = false;
  if (finalDef > ar.finalAtk && def.card.positiveSkill?.id === SKILL.COMMANDER_RECRUIT && !ar.pierce) {
    const newFace = defMulti === 0.5 ? 4 : (defMulti === 1 ? 6 : 8);
    def.card.dicePool.push(newFace);
    commanderTriggered = true;
  }

  def.hp = Math.max(0, def.hp - damage);
  atk.hp = Math.max(0, atk.hp - ar.selfDamage);

  // 触发 SUGAR_CRASH 负面效果
  if (damage >= 8 && def.card.negativeSkill?.id === SKILL.SUGAR_CRASH) {
    if (!def.buffs) def.buffs = [];
    def.buffs.push({ id: SKILL.SUGAR_CRASH, expireRound: state.totalRound + 1 });
  }

  // Check game over
  let gameOver = false, winner = null, classChanged = false, nextSubject = null;
  const prevAttackerIdx = state.turnData.attackerIdx;
  if (atk.hp <= 0 || def.hp <= 0) {
    gameOver = true;
    if (atk.hp <= 0 && def.hp <= 0) winner = 'draw';
    else if (def.hp <= 0) winner = state.turnData.attackerIdx;
    else winner = state.turnData.defenderIdx;
    state.phase = PHASE.GAME_OVER;
    state.winner = winner;
  }

  if (!gameOver) {
    state.totalRound++;
    state.currentSubRound++;
    if (state.currentSubRound >= GAME_CONFIG.SUBROUNDS_PER_CLASS) {
      state.currentSubRound = 0;
      state.currentClassIndex++;
      state.firstAttacker = 1 - state.firstAttacker;
      classChanged = true;
      if (state.currentClassIndex >= GAME_CONFIG.CLASSES_PER_GAME) {
        gameOver = true;
        const h0 = state.players[0].hp, h1 = state.players[1].hp;
        state.winner = h0 > h1 ? 0 : h1 > h0 ? 1 : 'draw';
        state.phase = PHASE.GAME_OVER;
        winner = state.winner;
      } else {
        nextSubject = state.schedule[state.currentClassIndex];
      }
    }
    if (!gameOver) {
      const ni = (state.firstAttacker + state.currentSubRound) % 2;
      state.turnData = { attackerIdx: ni, defenderIdx: 1 - ni, attackRolls: null, defenseRolls: null, hasAttackerRerolled: false, hasDefenderRerolled: false };
      state.turnPhase = TURN.WAITING_ATK;
    }
  }

  return {
    ok: true, baseDef, finalDef, penalty, keptIndices: keepIndices,
    defNegTriggered: defNeg.triggered,
    defNegName: defNeg.triggered ? def.card.negativeSkill.name : null,
    defPosTriggered: commanderTriggered || talentTriggered,
    defPosName: talentTriggered ? "天赋怪" : (commanderTriggered ? def.card.positiveSkill.name : null),
    noobTriggered: noobTriggered,
    damage, selfDamage: ar.selfDamage, pierce: ar.pierce,
    gameOver, winner, classChanged, nextSubject,
    attackerIdx: prevAttackerIdx,
  };
}

// ── 技能结算 ──
function resolvePositiveSkill(skill, multi, rolls, totalRound, turnData) {
  if (!skill) return { triggered: false };
  switch (skill.id) {
    case SKILL.ALL_EVEN_BONUS: {
      if (rolls.every(v => v % 2 === 0)) return { triggered: true, bonusDamage: Math.floor(skill.baseValue * multi) };
      return { triggered: false };
    }
    case SKILL.SAME_FACE_PIERCE: {
      if (new Set(rolls).size === 1) return { triggered: true, pierce: true, bonusDamage: multi > 1 ? 5 : 0 };
      return { triggered: false };
    }
    case SKILL.NO_REROLL_BONUS: {
      if (turnData && !turnData.hasAttackerRerolled) return { triggered: true, upgradeDice: true, upgradeAmount: skill.baseValue };
      return { triggered: false };
    }
    case SKILL.STAR_SHOWOFF: {
      const max = Math.max(...rolls);
      const min = Math.min(...rolls);
      if (max - min <= 2) {
        return { triggered: true, multiplierBonus: 0.5 };
      }
      return { triggered: false };
    }
    default: return { triggered: false };
  }
}

function resolveNegativeSkill(skill, multi, rolls, round) {
  if (!skill) return { triggered: false };
  switch (skill.id) {
    case SKILL.PERIODIC_DEF_LOSS: return { triggered: false };
    case SKILL.LOW_ROLL_SELF_DMG: {
      const sum = rolls.reduce((s, v) => s + v, 0);
      if (sum < (skill.threshold || 8)) return { triggered: true, selfDamage: Math.floor(skill.baseValue * multi) };
      return { triggered: false };
    }
    default: return { triggered: false };
  }
}

function resolveDefenderNegativeSkill(skill, multi, totalRound, turnData) {
  if (!skill) return { triggered: false };
  switch (skill.id) {
    case SKILL.PERIODIC_DEF_LOSS: {
      const interval = skill.interval || 2;
      if (totalRound > 0 && totalRound % interval === 0) return { triggered: true, defensePenalty: Math.floor(skill.baseValue * multi) };
      return { triggered: false };
    }
    case SKILL.REROLL_PENALTY: {
      if (turnData && turnData.hasDefenderRerolled) return { triggered: true, addPermanentPenalty: skill.baseValue };
      return { triggered: false };
    }
    default: return { triggered: false };
  }
}

// ── 查询 ──
export function getCurrentAttackerId(state) {
  if (state.phase !== PHASE.BATTLE) return null;
  return state.players[state.turnData.attackerIdx].id;
}

export function getCurrentDefenderId(state) {
  if (state.phase !== PHASE.BATTLE) return null;
  return state.players[state.turnData.defenderIdx].id;
}

export function getStateView(state, playerId) {
  const myIdx = state.players.findIndex(p => p.id === playerId);
  const opIdx = 1 - myIdx;
  const me = state.players[myIdx], op = state.players[opIdx];
  const isAtk = state.turnData?.attackerIdx === myIdx;

  return {
    phase: state.phase, schedule: state.schedule,
    currentClassIndex: state.currentClassIndex,
    currentSubRound: state.currentSubRound,
    totalRound: state.totalRound,
    myIndex: myIdx,
    turnPhase: state.turnPhase,
    isMyAttackTurn: isAtk && (state.turnPhase === TURN.WAITING_ATK || state.turnPhase === TURN.ATK_ROLLED),
    isMyDefendTurn: !isAtk && state.turnPhase === TURN.DEF_ROLLED,
    attackRolls: state.turnData?.attackRolls ? [...state.turnData.attackRolls] : null,
    defenseRolls: state.turnData?.defenseRolls ? [...state.turnData.defenseRolls] : null,
    atkResult: state.turnData?.atkResult || null,
    me: {
      nickname: me.nickname, cardId: me.cardId, card: me.card,
      hp: me.hp, maxHp: me.maxHp, ready: me.ready,
      hasReschedule: me.hasReschedule, rerolls: me.rerolls, buffs: me.buffs,
      permanentDefPenalty: me.permanentDefPenalty,
    },
    opponent: {
      nickname: op.nickname,
      cardId: state.phase === PHASE.BATTLE ? op.cardId : null,
      card: state.phase === PHASE.BATTLE ? op.card : null,
      hp: op.hp, maxHp: op.maxHp, ready: op.ready,
      hasReschedule: op.hasReschedule, rerolls: op.rerolls, buffs: op.buffs,
      permanentDefPenalty: op.permanentDefPenalty,
    },
    winner: state.winner,
  };
}

function findPlayer(state, id) { return state.players.find(p => p.id === id); }
