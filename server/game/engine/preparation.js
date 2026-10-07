import { shuffle, pickRandom, findPlayer } from './primitives.js';
import { TURN } from '../../../shared/turn.js';
import { SUBJECTS, CORE_SUBJECTS, ELECTIVE_SUBJECTS, MINOR_SUBJECTS, GAME_CONFIG, PHASE, GAME_MODE, IDENTITY } from '../../../shared/rules.js';
import { characterMap } from '../../../shared/characters.js';

export function generateSchedule() {
  return shuffle([
    ...pickRandom(CORE_SUBJECTS, 2),
    ...pickRandom(ELECTIVE_SUBJECTS, 2),
    ...pickRandom(MINOR_SUBJECTS, 2),
  ]);
}

export function createGame(playerList, gameMode = GAME_MODE.MODE_1V1) {
  return {
    phase: PHASE.PREPARATION,
    gameMode,
    players: playerList.map(p => makePlayer(p.id, p.nickname)),
    schedule: generateSchedule(),
    currentDay: 1,
    currentClassIndex: 0,
    firstAttacker: 0,
    currentSubRound: 0,
    totalRound: 1,
    turnPhase: gameMode === GAME_MODE.MODE_FFA ? TURN.CHOOSE_TARGET : TURN.WAITING_ATK,
    turnData: { attackerIdx: 0, defenderIdx: gameMode === GAME_MODE.MODE_FFA ? null : 1, attackRolls: null, defenseRolls: null, hasAttackerRerolled: false, hasDefenderRerolled: false },
    log: [],
    logSequence: 0,
    winner: null,
  };
}

export function makePlayer(id, name) {
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
    // 战术卡与 TP 系统
    tp: 0,
    handCards: [],
    activeBlessings: [],
    playedTurnCard: null,
    playedTurnCards: [],
    unusedDiceSum: 0,
    hpLastRound: 0,
    lastMaxRoll: 0,
    tempSlotBonus: 0,
    stealthActive: false,
    copiedPositiveSkill: null,
    // 新角色状态
    stickers: 0,            // 谢睿琦: 对方身上的贴画数
    selfStickers: 0,         // 谢睿琦: 自身贴画数
    invertReduction: 0,      // 廖展韬: 永久减伤叠加
    nineLivesUsed: false,    // 张锦元: 是否已复活
    skipAttackCount: 0,       // 数学祝福：跳过对手的下一次普通攻击
    // 付修然 (fxr) 状态
    dreamStacks: 0,          // 梦境层数 (0-3)
    inDreamState: false,      // 是否处于“梦境之王”状态
    pendingDreamState: false, // 满3次记录，下一节课进入梦境
    dreamTargetChoice: null,  // 对手本节课盲选的目标 (0, 1, 2)
    realTargetIdx: null,      // 本节课哪个是本体 (0, 1, 2)
    lgpyForm: false,          // 是否处于 lgpy 斩杀形态
    lgpyTurnsLeft: 0,         // lgpy 形态剩余攻击回合
    lgpyActivatedAtRound: null,
    lgpyClassIndex: null,
    lgpyTriggered: false,     // 是否已触发过 lgpy 形态
    skillsSealed: false,
    skillsSealedTurnsLeft: 0,
    skillsSealedAtRound: null,
    skillsSealedClassIndex: null,
    sealedSkills: null,
  };
}

export function selectCard(state, playerId, cardId) {
  const p = findPlayer(state, playerId);
  if (!p || state.phase !== PHASE.PREPARATION) return { ok: false };
  const def = characterMap[cardId];
  if (!def) return { ok: false };
  if (def.ffaOnly && state.gameMode !== GAME_MODE.MODE_FFA) {
    return { ok: false, error: 'ffa_only' };
  }
  p.cardId = cardId;
  p.card = JSON.parse(JSON.stringify(def));
  p.hp = def.hp; p.maxHp = def.hp; p.hpLastRound = def.hp; p.ready = false;
  
  return { ok: true };
}

export function setReady(state, playerId) {
  const p = findPlayer(state, playerId);
  if (state.phase !== PHASE.PREPARATION) return { ok: false, error: 'invalid_phase' };
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
  if (state.phase !== PHASE.BATTLE) return { ok: false, error: 'invalid_phase' };
  if (!Number.isInteger(classIndex) || typeof newSubject !== 'string') return { ok: false, error: 'invalid_schedule' };
  if (classIndex < state.currentClassIndex || classIndex >= GAME_CONFIG.CLASSES_PER_GAME) return { ok: false };
  if (!SUBJECTS[newSubject]) return { ok: false };
  state.schedule[classIndex] = newSubject;
  p.hasReschedule = false;
  return { ok: true };
}
