// ============================================================
// 校园战力党 — 核心对战引擎 (阶段制状态机)
// ============================================================
import {
  SUBJECTS, CORE_SUBJECTS, ELECTIVE_SUBJECTS, MINOR_SUBJECTS,
  GAME_CONFIG, PHASE, GAME_MODE, IDENTITY, getSkillMultiplier,
} from '../../shared/rules.js';
import { characterMap, SKILL } from '../../shared/characters.js';

// ── 回合子阶段 ──
export const TURN = {
  CHOOSE_TARGET: 'choose_target', // 大乱斗专属
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
export function createGame(playerList, gameMode = GAME_MODE.MODE_1V1) {
  return {
    phase: PHASE.PREPARATION,
    gameMode,
    players: playerList.map(p => makePlayer(p.id, p.nickname)),
    schedule: generateSchedule(),
    currentClassIndex: 0,
    firstAttacker: 0,
    currentSubRound: 0,
    totalRound: 1,
    turnPhase: gameMode === GAME_MODE.MODE_FFA ? TURN.CHOOSE_TARGET : TURN.WAITING_ATK,
    turnData: { attackerIdx: 0, defenderIdx: gameMode === GAME_MODE.MODE_FFA ? null : 1, attackRolls: null, defenseRolls: null, hasAttackerRerolled: false, hasDefenderRerolled: false },
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
    redHeat: 0, 
    chargeStacks: 0,
    firstBloodTriggered: false,
    hasTakenDamage: false,
    // 新角色状态
    stickers: 0,            // 谢睿琦: 对方身上的贴画数
    selfStickers: 0,         // 谢睿琦: 自身贴画数
    invertReduction: 0,      // 廖展韬: 永久减伤叠加
    nineLivesUsed: false,    // 张锦元: 是否已复活
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

    // ── SanGuoSha 身份分配 ──
    if (state.gameMode === GAME_MODE.MODE_FFA) {
      const n = state.players.length;
      let roles = [];
      if (n === 3) roles = [IDENTITY.LORD, IDENTITY.REBEL, IDENTITY.SPY];
      else if (n === 4) roles = [IDENTITY.LORD, IDENTITY.LOYALIST, IDENTITY.REBEL, IDENTITY.SPY];
      else if (n === 5) roles = [IDENTITY.LORD, IDENTITY.LOYALIST, IDENTITY.REBEL, IDENTITY.REBEL, IDENTITY.SPY];
      else if (n === 6) roles = [IDENTITY.LORD, IDENTITY.LOYALIST, IDENTITY.REBEL, IDENTITY.REBEL, IDENTITY.REBEL, IDENTITY.SPY];
      else if (n === 7) roles = [IDENTITY.LORD, IDENTITY.LOYALIST, IDENTITY.LOYALIST, IDENTITY.REBEL, IDENTITY.REBEL, IDENTITY.REBEL, IDENTITY.SPY];
      else if (n >= 8) roles = [IDENTITY.LORD, IDENTITY.LOYALIST, IDENTITY.LOYALIST, IDENTITY.REBEL, IDENTITY.REBEL, IDENTITY.REBEL, IDENTITY.REBEL, IDENTITY.SPY];
      
      roles = shuffle(roles.slice(0, n));
      for (let i = 0; i < n; i++) {
        state.players[i].identity = roles[i];
        if (roles[i] === IDENTITY.LORD) {
          state.players[i].hp += 2;
          state.players[i].maxHp += 2;
        }
      }
    }

    const atkIdx = 0;
    state.turnPhase = state.gameMode === GAME_MODE.MODE_FFA ? TURN.CHOOSE_TARGET : TURN.WAITING_ATK;
    state.turnData = { 
      attackerIdx: atkIdx, 
      defenderIdx: state.gameMode === GAME_MODE.MODE_FFA ? null : (1 - atkIdx), 
      attackRolls: null, defenseRolls: null, hasAttackerRerolled: false, hasDefenderRerolled: false 
    };
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

  // 红温伤害 (攻击回合开始时)
  if (atk.redHeat > 0) {
    atk.hp -= atk.redHeat;
    atk.redHeat = Math.max(0, atk.redHeat - 1);
    if (atk.hp < 0) atk.hp = 0;
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
    if (atk.card.positiveSkill?.id === 'nine_lives' && !atk.nineLivesUsed) {
      atk.nineLivesUsed = true;
      atk.hp = 9;
      atk.card.dicePool = atk.card.dicePool.map(() => 10);
    } else {
      state.phase = PHASE.GAME_OVER;
      state.winner = state.turnData.defenderIdx;
      return { ok: true, rolls: [], selfKill: true };
    }
  }

  // 记号: 攻击开始时获得 +1 重投
  if (atk.card.positiveSkill?.id === SKILL.NO_REROLL_BONUS) {
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

  // 周煊声: 蓄势消耗 (每层+1重投)
  let chargeConsumed = 0;
  if (atk.chargeStacks > 0 && atk.card.positiveSkill?.id === SKILL.BUY_WATER && !state.turnData.isExtraTurn) {
    chargeConsumed = atk.chargeStacks;
    atk.rerolls += chargeConsumed;
    state.turnData.chargeConsumed = chargeConsumed;
    atk.chargeStacks = 0;
  }

  // 张楚唯: 额外回合重投+2, 所有骰子面数临时+2
  let rollingPool = atk.card.dicePool;
  if (state.turnData.isExtraTurn && atk.card.positiveSkill?.id === SKILL.EXTRA_TURN) {
    atk.rerolls += 2;
    rollingPool = rollingPool.map(f => f + 2);
    state.turnData.extraTurnFaceBoost = 2; // 记录以便重投时也应用加成
  }

  const rolls = rollDiceGroup(rollingPool);

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
      rolls[minIdx] = face + 1 - minVal;
      invertTriggered = true;
      // 深度思考: 攻击阶段反转给对方永久减伤+1
      if (atk.card.negativeSkill?.id === SKILL.DEEP_THOUGHT) {
        const defIdx = state.turnData.defenderIdx;
        if (defIdx != null) {
          state.players[defIdx].invertReduction = (state.players[defIdx].invertReduction || 0) + 1;
        }
      }
    }
  }

  // 张锦元负面: 贪睡 — 前2回合攻击-3
  let sleepyAtkPenalty = 0;
  if (atk.card.negativeSkill?.id === SKILL.SLEEPY && state.totalRound <= 2) {
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
  const p = findPlayer(state, playerId);
  if (!p || p.rerolls <= 0) return { ok: false };
  if (!indices || indices.length === 0) return { ok: false };

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

  const faces = p.card.dicePool;

  // 王鹤迪 rerollAll: 重投时所有骰子均重投
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
      if (i < 0 || i >= rolls.length) return { ok: false };
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
      rolls[minIdx] = face + 1 - minVal;
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
  if (state.turnPhase !== TURN.ATK_ROLLED) return { ok: false };
  const atk = state.players[state.turnData.attackerIdx];

  if (!keepIndices || keepIndices.length === 0) return { ok: false, error: 'invalid_slots' };
  if (atk.card.atkSlots !== -1 && keepIndices.length !== atk.card.atkSlots) return { ok: false, error: 'invalid_slots' };
  
  const def = state.players[state.turnData.defenderIdx];
  const subj = state.schedule[state.currentClassIndex];
  const multi = getSkillMultiplier(atk.card.subjects, subj);

  const atkRolls = state.turnData.attackRolls;
  let keptRolls = keepIndices.map(i => atkRolls[i]);

  // 姜鹏泽正面: 骰子点数 × 课程倍率
  if (atk.card.positiveSkill?.id === SKILL.LIBERAL_ARTS) {
    keptRolls = keptRolls.map(v => Math.floor(v * multi));
  }

  const baseAtk = keptRolls.reduce((s, v) => s + v, 0);

  const pos = resolvePositiveSkill(atk.card.positiveSkill, multi, keptRolls, state.totalRound, state.turnData);
  const neg = resolveNegativeSkill(atk.card.negativeSkill, multi, keptRolls, state.totalRound);

  let finalBase = baseAtk;

  // 观星: 极差<=2 时伤害乘以 (0.5 + 课程倍率)
  if (pos.applyMultiplier) {
    finalBase = Math.floor(baseAtk * (0.5 + multi));
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

  state.turnData.atkResult = {
    baseAtk: finalBase, bonusDamage: pos.bonusDamage || 0, pierce: pos.pierce || false,
    selfDamage: neg.selfDamage || 0, finalAtk: finalBase + (pos.bonusDamage || 0),
    posTriggered: pos.triggered, posName: pos.triggered ? atk.card.positiveSkill.name : null,
    negTriggered: neg.triggered || state.turnData.allergyTriggered, 
    negName: state.turnData.allergyTriggered ? "过敏" : (neg.triggered ? atk.card.negativeSkill.name : null),
    keptIndices: keepIndices,
  };

  // 殷泽轩正面: 攻击力额外 +2 × 课程倍率
  if (atk.card.positiveSkill?.id === SKILL.STEALTH_STRIKE) {
    state.turnData.atkResult.bonusDamage += Math.floor(2 * multi);
    state.turnData.atkResult.finalAtk += Math.floor(2 * multi);
  }

  // 张楚唯: 额外回合 → 在 rollAttack 中处理 (+2重投, 面数临时+2)

  // 周煊声: 蓄势消耗 (每层+8伤害)
  if (state.turnData.chargeConsumed > 0) {
    const chargeBonus = state.turnData.chargeConsumed * 8;
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
    state.players.forEach(p => {
      if (!p.isDead && p.id !== atk.id) {
        const rolls = rollDiceGroup(p.card.dicePool);
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
    state.turnPhase = TURN.DEF_ROLLED;
    return { ok: true, atkResult: state.turnData.atkResult, aoeDefenseRolls: defenseRollsRecord };
  } else {
    state.turnData.isAoE = false;
    const defRolls = rollDiceGroup(def.card.dicePool);

    // 廖展韬正面附加: 对方骰子无法投出最大值
    if (atk.card.positiveSkill?.id === SKILL.INVERT_DIE) {
      for (let i = 0; i < defRolls.length; i++) {
        if (defRolls[i] >= def.card.dicePool[i]) defRolls[i] = def.card.dicePool[i] - 1;
      }
    }

    // 廖展韬正面: 字斟句酌 — 防御掷骰后反转最小骰子 (不叠加减伤)
    if (def.card.positiveSkill?.id === SKILL.INVERT_DIE) {
      let minVal = Infinity, minIdx = -1;
      for (let i = 0; i < defRolls.length; i++) {
        if (defRolls[i] < minVal) { minVal = defRolls[i]; minIdx = i; }
      }
      if (minIdx >= 0) {
        const face = def.card.dicePool[minIdx];
        defRolls[minIdx] = face + 1 - minVal;
      }
    }

    state.turnData.defenseRolls = defRolls;
    state.turnPhase = TURN.DEF_ROLLED;
    return { ok: true, atkResult: state.turnData.atkResult, defenseRolls: [...defRolls] };
  }
}

// ── 阶段4: 防守方确认 → 结算 → 伤害 → 推进回合 ──
export function confirmDefense(state, playerId, keepIndices, options = {}) {
  if (state.turnPhase !== TURN.DEF_ROLLED) return { ok: false };
  
  const atk = state.players[state.turnData.attackerIdx];
  const subj = state.schedule[state.currentClassIndex];
  const atkMulti = getSkillMultiplier(atk.card.subjects, subj);
  const ar = state.turnData.atkResult;
  let finalBaseAtk = ar.finalAtk;

  if (state.turnData.isAoE) {
    if (!state.turnData.aoeDefenses[playerId]) return { ok: false };
    const defState = state.turnData.aoeDefenses[playerId];
    if (defState.confirmed) return { ok: false };
    
    const def = findPlayer(state, playerId);
    if (!keepIndices || keepIndices.length !== def.card.defSlots) return { ok: false, error: 'invalid_slots' };

    defState.confirmed = true;
    defState.keepIndices = keepIndices;
    defState.options = options;

    // Check if everyone confirmed
    const allConfirmed = Object.values(state.turnData.aoeDefenses).every(d => d.confirmed);
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
    
    Object.keys(state.turnData.aoeDefenses).forEach(pid => {
      const p = findPlayer(state, pid);
      if (p.card.positiveSkill?.id === SKILL.EAT_IT) {
        // find max kept roll
        const atkRolls = state.turnData.attackRolls;
        const atkKeptIndices = ar.keptIndices;
        for (let idx of atkKeptIndices) {
          if (atkRolls[idx] > maxKeptRoll) maxKeptRoll = atkRolls[idx];
        }
        if (maxKeptRoll > 2) {
          globalAtkReduction = maxKeptRoll - 2;
          eatTriggeredBy = pid;
        }
      }
    });
    
    if (globalAtkReduction > 0) {
      finalBaseAtk -= globalAtkReduction;
    }

    // --- 2. Process each target ---
    Object.keys(state.turnData.aoeDefenses).forEach(pid => {
      const p = findPlayer(state, pid);
      const ds = state.turnData.aoeDefenses[pid];
      const pMulti = getSkillMultiplier(p.card.subjects, subj);
      const isPrimary = state.players[state.turnData.defenderIdx].id === pid;

      const pKeptRolls = ds.keepIndices.map(i => ds.rolls[i]);
      // 姜鹏泽正面: 防御骰子也乘以课程倍率
      const pAdjustedRolls = p.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? pKeptRolls.map(v => Math.floor(v * pMulti)) : pKeptRolls;
      const pBaseDef = pAdjustedRolls.reduce((s, v) => s + v, 0);
      
      const turnDataSimulated = { hasDefenderRerolled: ds.hasRerolled };
      const defNeg = resolveDefenderNegativeSkill(p.card.negativeSkill, pMulti, state.totalRound, turnDataSimulated);
      if (defNeg.addPermanentPenalty) p.permanentDefPenalty = (p.permanentDefPenalty || 0) + defNeg.addPermanentPenalty;
      const penalty = (defNeg.defensePenalty || 0) + (p.permanentDefPenalty || 0);
      const finalDef = Math.max(0, pBaseDef - penalty);

      // 李灿正面B: 献祭骰子回血
      let lcHealTriggered = false;
      let healAmount = 0;
      if (p.card.positiveSkill?.id === SKILL.GAL_PLAYER && ds.options.sacrificeIndex !== undefined) {
        const sIdx = ds.options.sacrificeIndex;
        if (ds.keepIndices.includes(sIdx)) {
          const orig = ds.rolls[sIdx];
          if (orig > 1) {
            healAmount = orig - 1;
            ds.rolls[sIdx] = 1;
            p.hp = Math.min(p.maxHp, p.hp + healAmount);
            lcHealTriggered = true;
          }
        }
      }

      const pFinalKeptRolls = ds.keepIndices.map(i => ds.rolls[i]);
      const pFinalAdjusted = p.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? pFinalKeptRolls.map(v => Math.floor(v * pMulti)) : pFinalKeptRolls;
      const pFinalBaseDef = pFinalAdjusted.reduce((s, v) => s + v, 0);
      let pFinalFinalDef = Math.max(0, pFinalBaseDef - penalty);

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

      // 殷泽轩负面: 受到伤害时，最终伤害额外 +2 × 倍率
      if (damage > 0 && p.card.negativeSkill?.id === SKILL.VULNERABLE) {
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

      p.hp = Math.max(0, p.hp - damage);
      if (damage === 0) noDamageCount++;

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

      if (damage > 0 && p.card.negativeSkill?.id === SKILL.FIRST_BLOOD && !p.hasTakenDamage) {
        p.hasTakenDamage = true;
        if (p.card.defSlots > 1) p.card.defSlots -= 1;
        firstBloodTriggeredGlobal = true;
      }

      let pExtraTurnTriggered = false;
      if (damage >= 8 && p.card.positiveSkill?.id === SKILL.EXTRA_TURN && p.hp > 0) {
        pExtraTurnTriggered = true;
        anyExtraTurnTriggered = true;
        extraTurnGainers.push(pid);
        if (p.card.negativeSkill?.id === SKILL.BACK_PAIN && p.card.defSlots > 1) p.card.defSlots -= 1;
      }

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

    const { gameOver, winner, classChanged, nextSubject } = resolvePhaseEnd(state);
    
    return {
      ok: true,
      isAoE: true,
      aoeResults,
      atkResult: ar,
      selfDamage,
      firstBloodTriggered: firstBloodTriggeredGlobal,
      extraTurnTriggered: anyExtraTurnTriggered,
      gameOver, winner, classChanged, nextSubject,
      attackerIdx: state.turnData.attackerIdx
    };

  } else {
    // 正常 1v1 防御逻辑
    const defIdx = state.turnData.defenderIdx;
    if (state.players[defIdx].id !== playerId) return { ok: false };
    const def = state.players[defIdx];
    
    if (!keepIndices || keepIndices.length !== def.card.defSlots) return { ok: false, error: 'invalid_slots' };

    // 曾无畏负面: 防御时只能选中一个 D10
    if (def.card.negativeSkill?.id === SKILL.D10_LIMIT) {
      const d10Count = keepIndices.filter(idx => def.card.dicePool[idx] === 10).length;
      if (d10Count > 1) return { ok: false, error: 'zww_d10_limit' };
    }
    
    const defMulti = getSkillMultiplier(def.card.subjects, subj);

    const defRolls = state.turnData.defenseRolls;
    const keptRolls = keepIndices.map(i => defRolls[i]);
    // 姜鹏泽正面: 防御骰子也乘以课程倍率
    const adjustedDefRolls = def.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? keptRolls.map(v => Math.floor(v * defMulti)) : keptRolls;
    const baseDef = adjustedDefRolls.reduce((s, v) => s + v, 0);
    const defNeg = resolveDefenderNegativeSkill(def.card.negativeSkill, defMulti, state.totalRound, state.turnData);
    
    if (defNeg.addPermanentPenalty) {
      def.permanentDefPenalty = (def.permanentDefPenalty || 0) + defNeg.addPermanentPenalty;
    }
    
    const penalty = (defNeg.defensePenalty || 0) + (def.permanentDefPenalty || 0);
    const finalDef = Math.max(0, baseDef - penalty);

    // 曾无畏正面: “吃掉!” 将对方选定的最大骰子改为 2
    let eatTriggered = false;
    if (def.card.positiveSkill?.id === SKILL.EAT_IT) {
      const atkRolls = state.turnData.attackRolls;
      const atkKeptIndices = ar.keptIndices;
      let maxVal = -1, maxIdx = -1;
      for (let idx of atkKeptIndices) {
        if (atkRolls[idx] > maxVal) { maxVal = atkRolls[idx]; maxIdx = idx; }
      }
      if (maxVal > 2) {
        finalBaseAtk = finalBaseAtk - maxVal + 2;
        eatTriggered = true;
      }
    }

    // 李灿正面B: 献祭骰子回血
    let lcHealTriggered = false;
    let healAmount = 0;
    if (def.card.positiveSkill?.id === SKILL.GAL_PLAYER && options.sacrificeIndex !== undefined) {
      const sIdx = options.sacrificeIndex;
      if (keepIndices.includes(sIdx)) {
        const orig = defRolls[sIdx];
        if (orig > 1) {
          healAmount = orig - 1;
          defRolls[sIdx] = 1; // 变为1
          def.hp = Math.min(def.maxHp, def.hp + healAmount);
          lcHealTriggered = true;
        }
      }
    }

    // 重新计算最终防御
    const finalKeptRolls = keepIndices.map(i => defRolls[i]);
    const finalAdjusted = def.card.positiveSkill?.id === SKILL.LIBERAL_ARTS ? finalKeptRolls.map(v => Math.floor(v * defMulti)) : finalKeptRolls;
    const finalBaseDef = finalAdjusted.reduce((s, v) => s + v, 0);
    let finalFinalDef = Math.max(0, finalBaseDef - penalty);

    // 周煊声: 蓄势爆发时对方防御力× 1/(1+层数)
    if (state.turnData.chargeConsumed > 0) {
      finalFinalDef = Math.floor(finalFinalDef / (1 + state.turnData.chargeConsumed));
    }

    let damage = ar.pierce ? finalBaseAtk : Math.max(0, finalBaseAtk - finalFinalDef);

  // 贪睡惩罚: 攻击-3, 防御-3 (前2回合)
  if (state.turnData.sleepyAtkPenalty > 0) {
    damage = Math.max(0, damage - state.turnData.sleepyAtkPenalty); // 简化: 直接减伤
  }
  let sleepyDefPenalty = 0;
  if (def.card.negativeSkill?.id === SKILL.SLEEPY && state.totalRound <= 2) {
    sleepyDefPenalty = 3;
    damage += sleepyDefPenalty; // 防御-3等于对方多造成3点伤害
  }

  // 廖展韬深度思考: 对方的永久减伤
  if (damage > 0 && (def.invertReduction || 0) > 0) {
    damage = Math.max(0, damage - def.invertReduction);
  }
  
  // 殖泽轩负面: 受到伤害时，最终伤害额外 +2 × 倍率
  if (damage > 0 && def.card.negativeSkill?.id === SKILL.VULNERABLE) {
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

  // 李灿正面A: 反击伤害
  let lcCounterTriggered = false;
  let lcCounterDamage = 0;
  if (def.card.positiveSkill?.id === SKILL.GAL_PLAYER && finalFinalDef > finalBaseAtk && !ar.pierce) {
    lcCounterDamage = finalFinalDef - finalBaseAtk;
    atk.hp = Math.max(0, atk.hp - lcCounterDamage);
    lcCounterTriggered = true;
  }

  // 杂鱼自残判定 (HJC: 攻击力 < 防御力 → 自身血量减半)
  let noobTriggered = false;
  if (ar.finalAtk < finalFinalDef && atk.card.negativeSkill?.id === 'hjc_neg') {
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

  // 应用伤害
  def.hp = Math.max(0, def.hp - damage);
  atk.hp = Math.max(0, atk.hp - ar.selfDamage);

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

  // 余汉负面: 操碎了心 — 对HP<20%目标伤害固定为1
  if (damage > 1 && atk.card.negativeSkill?.id === SKILL.MAMA_MERCY) {
    if (def.hp > 0 && def.hp + damage < def.maxHp * 0.2) {
      const refund = damage - 1;
      def.hp += refund;
      damage = 1;
    }
  }

  // 谢睿琦正面: 背后贴贴画 — 造成伤害时给对方贴贴画
  let stickerExploded = false;
  let stickerDamage = 0;
  if (damage > 0 && atk.card.positiveSkill?.id === SKILL.STICKER_BOMB) {
    def.stickers = (def.stickers || 0) + 1;
    if (def.stickers >= 3) {
      stickerDamage = Math.floor(def.hp * 0.3);
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
  let nineLivesTriggered = false;
  if (def.hp <= 0 && def.card.positiveSkill?.id === SKILL.NINE_LIVES && !def.nineLivesUsed) {
    def.nineLivesUsed = true;
    def.hp = 9;
    def.card.dicePool = def.card.dicePool.map(() => 10); // 全部升级为D10
    nineLivesTriggered = true;
  }
  if (atk.hp <= 0 && atk.card.positiveSkill?.id === SKILL.NINE_LIVES && !atk.nineLivesUsed) {
    atk.nineLivesUsed = true;
    atk.hp = 9;
    atk.card.dicePool = atk.card.dicePool.map(() => 10);
    nineLivesTriggered = true;
  }

  // Check game over & handle deaths
  let gameOver = false, winner = null, classChanged = false, nextSubject = null;
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
        atk.card.positiveSkill = null; // 主公误杀忠臣，失去正面技能
        state.log.push({ text: `【系统】主公 ${atk.nickname} 误杀忠臣，失去了正面技能！`, type: 'system' });
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

    const resPhase = resolvePhaseEnd(state);
    gameOver = resPhase.gameOver;
    winner = resPhase.winner;
    classChanged = resPhase.classChanged;
    nextSubject = resPhase.nextSubject;
    
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
      gameOver, winner, classChanged, nextSubject,
      attackerIdx: prevAttackerIdx,
    };
  }
}

// ── 技能结算 ──
function resolvePositiveSkill(skill, multi, rolls, totalRound, turnData) {
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

function resolveNegativeSkill(skill, multi, rolls, round) {
  if (!skill) return { triggered: false };
  switch (skill.id) {
    default: return { triggered: false };
  }
}

function resolveDefenderNegativeSkill(skill, multi, totalRound, turnData) {
  if (!skill) return { triggered: false };
  switch (skill.id) {
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
  if (state.turnData.defenderIdx === null) return null;
  return state.players[state.turnData.defenderIdx].id;
}

export function selectTarget(state, playerId, targetId) {
  if (state.gameMode !== GAME_MODE.MODE_FFA || state.phase !== PHASE.BATTLE || state.turnPhase !== TURN.CHOOSE_TARGET) return { ok: false };
  const pIdx = state.players.findIndex(p => p.id === playerId);
  if (pIdx === -1 || pIdx !== state.turnData.attackerIdx) return { ok: false };
  
  const tIdx = state.players.findIndex(p => p.id === targetId);
  if (tIdx === -1 || tIdx === pIdx || state.players[tIdx].isDead) return { ok: false };
  
  state.turnData.defenderIdx = tIdx;
  state.turnPhase = TURN.WAITING_ATK;
  return { ok: true };
}

export function getStateView(state, playerId) {
  const myIdx = state.players.findIndex(p => p.id === playerId);
  const isAtk = state.turnData?.attackerIdx === myIdx;

  const mapPlayerView = (p, pIdx) => {
    // 殷泽轩 (char_10) 技能：对方无法查看你的 HP 与掷骰点数
    const isYZX = p.cardId === 'char_10';
    const isMe = pIdx === myIdx;
    const hideHP = isYZX && !isMe && state.phase !== PHASE.GAME_OVER;
    
    // 身份隐藏逻辑 (大乱斗模式下，非主公且非自己的身份对他人隐藏)
    const hideIdentity = state.gameMode === GAME_MODE.MODE_FFA && !isMe && p.identity !== IDENTITY.LORD && !p.isDead && state.phase !== PHASE.GAME_OVER;
    
    return {
      id: p.id, nickname: p.nickname,
      cardId: (state.phase === PHASE.BATTLE || state.phase === PHASE.GAME_OVER) ? p.cardId : null,
      card: (state.phase === PHASE.BATTLE || state.phase === PHASE.GAME_OVER) ? p.card : null,
      hp: hideHP ? '??' : p.hp,
      maxHp: hideHP ? '??' : p.maxHp,
      ready: p.ready,
      hasReschedule: p.hasReschedule, rerolls: p.rerolls, buffs: p.buffs,
      permanentDefPenalty: p.permanentDefPenalty, redHeat: p.redHeat || 0,
      chargeStacks: p.chargeStacks || 0,
      isDead: !!p.isDead,
      identity: hideIdentity ? '?' : p.identity,
    };
  };

  const playersView = state.players.map(mapPlayerView);

  return {
    gameMode: state.gameMode,
    phase: state.phase, schedule: state.schedule,
    currentClassIndex: state.currentClassIndex,
    currentSubRound: state.currentSubRound,
    totalRound: state.totalRound,
    myIndex: myIdx,
    attackerIdx: state.turnData?.attackerIdx,
    defenderIdx: state.turnData?.defenderIdx,
    turnPhase: state.turnPhase,
    isMyAttackTurn: isAtk && (state.turnPhase === TURN.WAITING_ATK || state.turnPhase === TURN.ATK_ROLLED || state.turnPhase === TURN.CHOOSE_TARGET),
    isMyDefendTurn: !isAtk && state.turnPhase === TURN.DEF_ROLLED && (state.turnData?.isAoE ? !!state.turnData?.aoeDefenses[playerId] : state.turnData?.defenderIdx === myIdx),
    // 殷泽轩屏蔽点数逻辑：如果是 YZX 在掷骰且不是我，点数显示为 null
    attackRolls: (state.turnData?.attackRolls) ? (
      (state.players[state.turnData.attackerIdx].cardId === 'char_10' && state.turnData.attackerIdx !== myIdx && state.phase !== PHASE.GAME_OVER) 
      ? state.turnData.attackRolls.map(() => -1) 
      : [...state.turnData.attackRolls]
    ) : null,
    defenseRolls: state.turnData?.defenseRolls ? (
       (state.players[state.turnData.defenderIdx]?.cardId === 'char_10' && state.turnData.defenderIdx !== myIdx && state.phase !== PHASE.GAME_OVER)
       ? state.turnData.defenseRolls.map(() => -1)
       : [...state.turnData.defenseRolls]
    ) : null,
    aoeDefenses: state.turnData?.isAoE ? (
      Object.fromEntries(Object.entries(state.turnData.aoeDefenses).map(([pid, d]) => {
        const pIdx = state.players.findIndex(x => x.id === pid);
        const isTargetYZX = state.players[pIdx].cardId === 'char_10';
        const hideRolls = isTargetYZX && pid !== playerId && state.phase !== PHASE.GAME_OVER;
        return [
          pid, {
            confirmed: d.confirmed,
            hasRerolled: d.hasRerolled,
            rolls: (pid === playerId || (state.turnPhase !== TURN.DEF_ROLLED && !hideRolls)) ? [...d.rolls] : (hideRolls ? d.rolls.map(() => -1) : null)
          }
        ];
      }))
    ) : null,
    atkResult: (state.turnData?.atkResult) ? (
      (state.players[state.turnData.attackerIdx].cardId === 'char_10' && state.turnData.attackerIdx !== myIdx && state.phase !== PHASE.GAME_OVER)
      ? { ...state.turnData.atkResult, baseAtk: '??', finalAtk: '??' }
      : state.turnData.atkResult
    ) : null,
    allergyTriggered: state.turnData?.allergyTriggered || false,
    isExtraTurn: state.turnData?.isExtraTurn || false,
    extraTurnFaceBoost: state.turnData?.extraTurnFaceBoost || 0,
    hasAttackerRerolled: state.turnData?.hasAttackerRerolled || false,
    hasDefenderRerolled: state.turnData?.hasDefenderRerolled || false,
    players: playersView,
    winner: state.winner,
    me: playersView[myIdx],
    opponent: state.gameMode === GAME_MODE.MODE_1V1 ? playersView[1 - myIdx] : null,
  };
}

export function resolvePhaseEnd(state) {
  let gameOver = false, winner = null, classChanged = false, nextSubject = null;
  
  // Handle deaths
  state.players.forEach(p => {
    if (p.hp <= 0) {
      p.hp = 0;
      if (!p.isDead) {
        p.isDead = true;
        // Lord kills Loyalist penalty
        if (state.gameMode === GAME_MODE.MODE_FFA && state.players[state.turnData.attackerIdx].identity === IDENTITY.LORD && p.identity === IDENTITY.LOYALIST) {
          state.players[state.turnData.attackerIdx].card.positiveSkill = null;
          state.log.push({ text: `【系统】主公 ${state.players[state.turnData.attackerIdx].nickname} 误杀忠臣，失去了正面技能！`, type: 'system' });
        }
      }
    }
  });

  // 结算胜负
  if (state.gameMode === GAME_MODE.MODE_1V1) {
    const p0 = state.players[0], p1 = state.players[1];
    if (p0.hp <= 0 || p1.hp <= 0) {
      gameOver = true;
      state.phase = PHASE.GAME_OVER;
      if (p0.hp <= 0 && p1.hp <= 0) state.winner = 'draw';
      else if (p1.hp <= 0) state.winner = 0;
      else state.winner = 1;
      winner = state.winner;
    }
  } else if (state.gameMode === GAME_MODE.MODE_FFA) {
    // FFA 胜负
    const lord = state.players.find(p => p.identity === IDENTITY.LORD);
    if (lord && lord.hp <= 0) {
      gameOver = true;
      state.phase = PHASE.GAME_OVER;
      const aliveSpies = state.players.filter(p => p.identity === IDENTITY.SPY && p.hp > 0);
      const otherAlive = state.players.filter(p => p.identity !== IDENTITY.SPY && p.hp > 0);
      if (aliveSpies.length === 1 && otherAlive.length === 0) winner = 'spy';
      else winner = 'rebel';
      state.winner = winner;
    } else {
      const aliveBadGuys = state.players.filter(p => (p.identity === IDENTITY.REBEL || p.identity === IDENTITY.SPY) && p.hp > 0);
      if (aliveBadGuys.length === 0) {
        gameOver = true;
        state.phase = PHASE.GAME_OVER;
        winner = 'lord';
        state.winner = winner;
      }
    }
  }

  if (!gameOver) {
    let extraTurnSet = false;
    while (state.extraTurnQueue && state.extraTurnQueue.length > 0) {
      const nextExtra = state.extraTurnQueue.shift();
      const atkIdx = state.players.findIndex(p => p.id === nextExtra.attackerId);
      const defIdx = state.players.findIndex(p => p.id === nextExtra.targetId);
      if (atkIdx !== -1 && defIdx !== -1 && !state.players[atkIdx].isDead && !state.players[defIdx].isDead) {
        state.totalRound++;
        state.turnData = { 
          attackerIdx: atkIdx, 
          defenderIdx: defIdx, 
          attackRolls: null, defenseRolls: null, hasAttackerRerolled: false, hasDefenderRerolled: false, isExtraTurn: true 
        };
        state.turnPhase = TURN.WAITING_ATK; // Skip CHOOSE_TARGET since the target is locked
        extraTurnSet = true;
        break;
      }
    }

    if (!extraTurnSet) {
      state.totalRound++;
      state.currentSubRound++;
      if (state.currentSubRound >= GAME_CONFIG.SUBROUNDS_PER_CLASS) {
        state.currentSubRound = 0;
        state.currentClassIndex++;
        
        let nextFirst = (state.firstAttacker + 1) % state.players.length;
        while (state.players[nextFirst].isDead && nextFirst !== state.firstAttacker) {
          nextFirst = (nextFirst + 1) % state.players.length;
        }
        state.firstAttacker = nextFirst;
        
        classChanged = true;
        if (state.currentClassIndex >= GAME_CONFIG.CLASSES_PER_GAME) {
          gameOver = true;
          state.phase = PHASE.GAME_OVER;
          if (state.gameMode === GAME_MODE.MODE_1V1) {
            const h0 = state.players[0].hp, h1 = state.players[1].hp;
            state.winner = h0 > h1 ? 0 : (h1 > h0 ? 1 : 'draw');
          } else {
            state.winner = 'lord'; // Simplified timeout winner
          }
          winner = state.winner;
        } else {
          nextSubject = state.schedule[state.currentClassIndex];
        }
      }
      
      if (!gameOver) {
        let ni;
        if (state.gameMode === GAME_MODE.MODE_1V1) {
          ni = (state.firstAttacker + state.currentSubRound) % 2;
        } else {
          let offset = state.currentSubRound;
          ni = state.firstAttacker;
          while(offset > 0) {
            ni = (ni + 1) % state.players.length;
            if (!state.players[ni].isDead) offset--;
          }
        }
        
        state.turnData = { 
          attackerIdx: ni, 
          defenderIdx: state.gameMode === GAME_MODE.MODE_FFA ? null : (1 - ni), 
          attackRolls: null, defenseRolls: null, hasAttackerRerolled: false, hasDefenderRerolled: false 
        };
        state.turnPhase = state.gameMode === GAME_MODE.MODE_FFA ? TURN.CHOOSE_TARGET : TURN.WAITING_ATK;
      }
    }
  }

  return { gameOver, winner, classChanged, nextSubject };
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

function findPlayer(state, id) { return state.players.find(p => p.id === id); }
