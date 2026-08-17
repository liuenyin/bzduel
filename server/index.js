// ============================================================
// 校园战力党 — 服务端入口
// ============================================================
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  createGame, selectCard, setReady, useReschedule,
  rollAttack, rerollDice, confirmAttack, confirmDefense, selectTarget, buyWater, chooseDreamTarget,
  playTacticalCard, refreshDraftSlot, buyDraftCard, confirmDraftReady,
  getCurrentAttackerId, getCurrentDefenderId, getStateView, getAttackConfirmationView,
  getEffectiveDicePool, getAllowedSlotCount, TURN,
} from './game/engine.js';
import {
  aiSelectCard,
  aiChooseKeepIndices,
  aiChooseRerollIndices,
  aiChooseTacticalCard,
  aiChooseDraftSlot,
} from './game/ai.js';
import { SKILL, characterMap } from '../shared/characters.js';
import {
  createRun, placeCharacter, removeFromBoard, buyXP,
  calculateSupportBuffs, processBattleResult, getCurrentNodeType,
  generateAIOpponent, chooseEvent, confirmInvestment, buyBeverage, getRunView,
} from './game/autobattler.js';
import { buyCharacter, sellCharacter, refreshShop as shopRefresh, scaleCharStats } from './game/shop.js';
import { autoResolveMatch, createGoldMineBattle } from './game/auto-combat.js';
import { AC_CHAR_MAP, AC } from '../shared/autochess-config.js';
import { recordMatch, getStats } from './statsManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

const app = express();
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/api/stats', (req, res) => res.json(getStats()));
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' }, pingTimeout: 30000, pingInterval: 10000 });

if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(join(__dirname, '..', 'dist')));
  app.get('*', (req, res) => res.sendFile(join(__dirname, '..', 'dist', 'index.html')));
}

const rooms = new Map();
const matchQueue = [];
const socketToRoom = new Map();
const activeSockets = new Map();
const acRuns = new Map(); // socketId -> autochess run
const reconnectGraceMs = Math.max(1000, Number(process.env.RECONNECT_GRACE_MS) || 60000);
const finishedRoomRetentionMs = Math.max(30000, Number(process.env.FINISHED_ROOM_RETENTION_MS) || 300000);
let roomCounter = 1000;
function newRoomId() { return String(++roomCounter); }

// ── Socket.IO ──
io.on('connection', (socket) => {
  const playerId = getPersistentPlayerId(socket);
  const previousSocketId = activeSockets.get(playerId);
  activeSockets.set(playerId, socket.id);
  socket.data.playerId = playerId;
  socket.join(playerId);

  if (previousSocketId && previousSocketId !== socket.id) {
    io.sockets.sockets.get(previousSocketId)?.disconnect(true);
  }

  console.log(`[连接] ${socket.id} (${playerId})`);

  socket.on('error', (err) => {
    console.error(`[Socket Error ${socket.id}]:`, err);
  });

  // ── PVE ──
  socket.on('start_pve', ({ nickname, aiCardId = null } = {}) => {
    const requestedAiCard = typeof aiCardId === 'string' ? characterMap[aiCardId] : null;
    if (aiCardId && (!requestedAiCard || requestedAiCard.ffaOnly)) {
      socket.emit('error_msg', { message: '无法使用该角色作为人机对手' });
      return;
    }

    const roomId = newRoomId();
    const aiId = 'AI_' + roomId;
    const game = createGame([
      { id: playerId, nickname },
      { id: aiId, nickname: '🤖 电脑' }
    ]);
    rooms.set(roomId, {
      game,
      playerSockets: [playerId, null],
      isAI: true,
      aiId,
      aiCardId: requestedAiCard?.id || null,
    });
    socketToRoom.set(playerId, roomId);
    socket.emit('match_found', {
      roomId, opponent: '🤖 电脑',
      schedule: game.schedule,
      state: getStateView(game, playerId),
      aiOpponentCardId: requestedAiCard?.id || null,
    });
    console.log(`[PVE] 房间 ${roomId} 已创建, AI: ${aiId}, 指定角色: ${requestedAiCard?.id || '自动选择'}`);

    scheduleAiSelection(roomId, playerId);
  });

  // ── 创建房间 ──
  socket.on('create_room', ({ nickname }) => {
    const roomId = newRoomId();
    rooms.set(roomId, {
      game: { pending: true, creatorId: playerId, creatorName: nickname, mode: '1v1' },
      playerSockets: [playerId, null], isAI: false,
    });
    socketToRoom.set(playerId, roomId);
    socket.join(roomId);
    socket.emit('room_created', { roomId, mode: '1v1' });
  });

  // ── 加入房间 ──
  socket.on('join_room', ({ nickname, roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.game.pending || room.game.mode !== '1v1') {
      socket.emit('error_msg', { message: '房间不存在或已开始' }); return;
    }
    const game = createGame([
      { id: room.game.creatorId, nickname: room.game.creatorName },
      { id: playerId, nickname }
    ]);
    room.game = game; room.playerSockets[1] = playerId;
    socketToRoom.set(playerId, roomId);
    socket.join(roomId);
    for (const pid of [game.players[0].id, game.players[1].id]) {
      io.to(pid).emit('match_found', {
        roomId, opponent: game.players.find(p => p.id !== pid).nickname,
        schedule: game.schedule, state: getStateView(game, pid),
      });
    }
  });

  // ── 匹配 ──
  socket.on('join_matchmaking', ({ nickname }) => {
    if (matchQueue.length > 0) {
      const idx = matchQueue.findIndex(p => p.playerId !== playerId);
      if (idx === -1) {
        if (!matchQueue.some(p => p.playerId === playerId)) {
          matchQueue.push({ playerId, nickname });
        }
        return;
      }
      const other = matchQueue.splice(idx, 1)[0];
      const roomId = newRoomId();
      const game = createGame([
        { id: other.playerId, nickname: other.nickname },
        { id: playerId, nickname }
      ]);
      rooms.set(roomId, { game, playerSockets: [other.playerId, playerId], isAI: false });
      socketToRoom.set(playerId, roomId);
      socketToRoom.set(other.playerId, roomId);
      socket.join(roomId);
      const otherSocketId = activeSockets.get(other.playerId);
      if (otherSocketId) io.sockets.sockets.get(otherSocketId)?.join(roomId);
      for (const pid of [other.playerId, playerId]) {
        io.to(pid).emit('match_found', {
          roomId,
          opponent: game.players.find(p => p.id !== pid)?.nickname || "未知对手",
          schedule: game.schedule,
          state: getStateView(game, pid),
        });
      }
    } else {
      matchQueue.push({ playerId, nickname });
      socket.emit('matchmaking_waiting');
    }
  });

  socket.on('cancel_matchmaking', () => {
    const idx = matchQueue.findIndex(p => p.playerId === playerId);
    if (idx !== -1) matchQueue.splice(idx, 1);
  });

  // ── FFA 大乱斗房间 ──
  socket.on('create_ffa_room', ({ nickname }) => {
    const roomId = newRoomId();
    rooms.set(roomId, {
      game: { pending: true, mode: 'sanguosha', players: [{ id: playerId, nickname }] },
      playerSockets: [playerId], isAI: false,
    });
    socketToRoom.set(playerId, roomId);
    socket.join(roomId);
    socket.emit('room_created', { roomId, mode: 'sanguosha' });
    io.to(roomId).emit('ffa_room_update', { players: [{ id: playerId, nickname }] });
  });

  socket.on('join_ffa_room', ({ nickname, roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.game.pending || room.game.mode !== 'sanguosha') {
      socket.emit('error_msg', { message: '房间不存在或已开始' }); return;
    }
    if (room.game.players.length >= 8) {
      socket.emit('error_msg', { message: '房间已满 (最多8人)' }); return;
    }
    room.game.players.push({ id: playerId, nickname });
    room.playerSockets.push(playerId);
    socketToRoom.set(playerId, roomId);
    socket.join(roomId);

    // 通知所有人更新房间玩家列表
    io.to(roomId).emit('ffa_room_update', { players: room.game.players });
  });

  socket.on('start_ffa_game', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.game.pending || room.game.mode !== 'sanguosha') return;
    // 只有房主可以开始
    if (room.game.players[0].id !== playerId) return;
    if (room.game.players.length < 3) {
      socket.emit('error_msg', { message: '大乱斗至少需要 3 名玩家' }); return;
    }

    const game = createGame(room.game.players, 'sanguosha');
    room.game = game;

    for (const pid of room.playerSockets) {
      io.to(pid).emit('match_found', {
        roomId,
        opponent: '大乱斗模式', // placeholder
        schedule: game.schedule,
        state: getStateView(game, pid),
      });
    }
  });

  // ── 战斗内交互 ──
  socket.on('select_target', ({ targetId }) => {
    const room = getRoom(playerId); if (!room) return;
    if (selectTarget(room.game, playerId, targetId).ok) {
      room.playerSockets.forEach(pid => {
        io.to(pid).emit('state_update', getStateView(room.game, pid));
      });
    }
  });

  socket.on('choose_dream_target', ({ targetIndex }) => {
    const room = getRoom(playerId); if (!room) return;
    const res = chooseDreamTarget(room.game, playerId, targetIndex);
    if (res.ok) {
      emitStateToAll(room);
    }
  });

  socket.on('select_card', ({ cardId }) => {
    const room = getRoom(playerId); if (!room) return;
    if (selectCard(room.game, playerId, cardId).ok) {
      socket.emit('state_update', getStateView(room.game, playerId));
      broadcastToOpponent(room, playerId, 'opponent_selected');
    }
  });

  // ── 准备 ──
  socket.on('ready', () => {
    const room = getRoom(playerId); if (!room) return;
    const res = setReady(room.game, playerId);
    if (!res.ok) return;
    if (room.isAI && !res.battleStarted) {
      const aiCardId = room.game.players[1].cardId || room.aiCardId || aiSelectCard(room.game.schedule);
      if (!room.game.players[1].cardId) selectCard(room.game, room.aiId, aiCardId);
      const aiRes = setReady(room.game, room.aiId);
      if (aiRes.battleStarted) res.battleStarted = true;
      console.log(`[PVE] AI ${room.aiId} 准备完毕, 战斗开始: ${res.battleStarted}`);
    }
    const roomId = socketToRoom.get(playerId);
    if (res.battleStarted) {
      emitStateToAll(room);
      triggerAiPhase(roomId);
    } else {
      socket.emit('state_update', getStateView(room.game, playerId));
      broadcastToOpponent(room, playerId, 'opponent_ready');
    }
  });

  // ── 调课权 ──
  socket.on('use_reschedule', ({ classIndex, newType }) => {
    const room = getRoom(playerId); if (!room) return;
    if (useReschedule(room.game, playerId, classIndex, newType).ok) {
      emitStateToAll(room);
    }
  });

  // ── 掷攻击骰 ──
  socket.on('roll_dice', () => {
    const room = getRoom(playerId); if (!room) return;
    const g = room.game;
    if (getCurrentAttackerId(g) !== playerId) return;
    const res = rollAttack(g);
    if (!res.ok) {
      if (res.error === 'dream_target_required') {
        socket.emit('error_msg', { message: '梦境盲选尚未完成，请等待对手选择目标。' });
      }
      return;
    }
      emitStateToAll(room);
      if (res.selfKill) {
        emitToAll(room, 'turn_resolved', (pid) => ({
          damage: 0, selfDamage: res.selfDamage || 0, pierce: false, finalDef: 0, penalty: 0,
          defNegTriggered: false, defNegName: null, defPosTriggered: false, defPosName: null,
          noobTriggered: false, gameOver: res.gameOver ?? true, winner: res.winner ?? g.winner,
          deathCause: res.deathCause || 'self_damage',
          attackerIdx: g.turnData.attackerIdx,
          state: getStateView(g, pid),
        }));
        scheduleFinishedRoomCleanup(room);
      }
  });

  // ── 重投骰子 ──
  socket.on('reroll_dice', ({ indices } = {}) => {
    const room = getRoom(playerId); if (!room) return;
    const res = rerollDice(room.game, playerId, indices);
    if (res.ok) emitStateToAll(room);
  });

  // ── 周煊声: 买水 (跳过攻击，蓄势) ──
  socket.on('buy_water', () => {
    const room = getRoom(playerId); if (!room) return;
    const g = room.game;
    const res = buyWater(g, playerId);
    if (!res.ok) {
      if (res.error === 'already_rerolled') socket.emit('error_msg', { message: '已经重投过了，无法买水！' });
      else if (res.error === 'max_charges') socket.emit('error_msg', { message: '蓄势已满（最多2层）！' });
      return;
    }
    emitToAll(room, 'buy_water_result', (pid) => ({
      chargeStacks: res.chargeStacks,
      state: getStateView(g, pid),
    }));
    const roomId = socketToRoom.get(playerId);
    if (res.classChanged) {
      emitToAll(room, 'class_change', () => ({
        subject: res.nextSubject,
        index: g.currentClassIndex,
        day: res.currentDay || g.currentDay || 1,
        dayChanged: !!res.dayChanged,
      }));
      setTimeout(() => triggerAiPhase(roomId), 5000);
    } else {
      triggerAiPhase(roomId);
    }
  });

  // ── 确认骰子 ──
  socket.on('confirm_dice', ({ indices, options = {} } = {}) => {
    const roomId = socketToRoom.get(playerId);
    const room = getRoom(playerId); if (!room) return;
    const g = room.game;

    if (g.turnPhase === TURN.ATK_ROLLED && getCurrentAttackerId(g) === playerId) {
      const res = confirmAttack(g, indices);
      if (!res.ok) return;
      emitToAll(room, 'atk_confirmed', (pid) => getAttackConfirmationView(g, pid));
      triggerAiPhase(roomId);

    } else if (g.turnPhase === TURN.DEF_ROLLED) {
      if (g.turnData.isAoE) {
        if (!g.turnData.aoeDefenses[playerId]) return;
      } else {
        if (getCurrentDefenderId(g) !== playerId) return;
      }

      // Save defender info before confirmDefense modifies state
      const preDefIdx = g.turnData.defenderIdx;
      const preDefId = preDefIdx !== null ? g.players[preDefIdx]?.id : null;
      const preDefCardId = preDefIdx !== null ? g.players[preDefIdx]?.cardId : null;

      // Save attacker info before confirmDefense modifies state
      const preAtkIdx = g.turnData.attackerIdx;
      const preAtkId = g.players[preAtkIdx]?.id;
      const preAtkCardId = g.players[preAtkIdx]?.cardId;

      const res = confirmDefense(g, playerId, indices, options);
      if (!res.ok) {
        if (res.error === 'zww_d10_limit') {
          socket.emit('error_msg', { message: '曾无畏的限制：防御时最多只能选中一个 D10 骰子！' });
        } else {
          socket.emit('error_msg', { message: '无效的选骰' });
        }
        return;
      }

      if (res.waitingForOthers) {
        emitStateToAll(room);
        return;
      }

      // YZX masking: hide defense/attack stats from opponents when YZX is involved
      emitToAll(room, 'turn_resolved', (pid) => {
        const data = { ...res, state: getStateView(g, pid) };
        // Defender is YZX: hide defense info from non-YZX players
        if (preDefCardId === 'char_10' && pid !== preDefId && !res.gameOver) {
          data.baseDef = '??';
          data.finalDef = '??';
          data.damage = '??';
          data.penalty = '??';
        }
        // Attacker is YZX: hide attack info from non-YZX players
        if (preAtkCardId === 'char_10' && pid !== preAtkId && !res.gameOver) {
          data.atkResult = { ...data.atkResult, baseAtk: '??', finalAtk: '??' };
        }
        return data;
      });
      const roomId = socketToRoom.get(playerId);
      if (res.gameOver) {
        if (g.gameMode === '1v1' && g.winner !== null && g.winner !== 'draw') {
          const winnerCardId = g.players[g.winner].cardId;
          const loserIdx = g.winner === 0 ? 1 : 0;
          const loserCardId = g.players[loserIdx].cardId;
          const isPvE = g.players[0].id.startsWith('AI_') || g.players[1].id.startsWith('AI_');
          recordMatch(winnerCardId, loserCardId, isPvE);
        }
        scheduleFinishedRoomCleanup(room);
      } else if (res.classChanged) {
        emitToAll(room, 'class_change', () => ({
          subject: res.nextSubject,
          index: g.currentClassIndex,
          day: res.currentDay || g.currentDay || 1,
          dayChanged: !!res.dayChanged,
        }));
        setTimeout(() => triggerAiPhase(roomId), 5000);
      } else {
        triggerAiPhase(roomId);
      }
    }
  });

  // ── 请求状态 (断线重连) ──
  socket.on('request_state', () => {
    const room = getRoom(playerId);
    if (room && room.game.players) {
      socket.emit('state_update', getStateView(room.game, playerId));
    }
  });

  socket.on('resume_session', (_payload = {}, acknowledge) => {
    const result = resumePlayerSession(socket, playerId);
    if (typeof acknowledge === 'function') acknowledge(result);
    if (result.ok && result.state) socket.emit('state_update', result.state);
  });

  // ── 战术卡与商店 ──
  socket.on('play_tactical_card', ({ cardId } = {}, acknowledge) => {
    const room = getRoom(playerId);
    if (!room || !room.game) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: '对局不存在' });
      return;
    }
    const res = playTacticalCard(room.game, playerId, cardId);
    if (!res.ok) {
      const error = res.error || '无法打出此战术卡';
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error });
      else socket.emit('error_msg', { message: error });
      return;
    }
    if (typeof acknowledge === 'function') acknowledge({ ok: true, card: res.card });
    emitToAll(room, 'tactical_card_played', { playerId, card: res.card });
    emitStateToAll(room);
  });

  socket.on('refresh_draft_slot', ({ slotIndex }) => {
    const room = getRoom(playerId);
    if (!room || !room.game) return;
    const res = refreshDraftSlot(room.game, playerId, slotIndex);
    if (!res.ok) {
      socket.emit('error_msg', { message: res.error || '无法刷新' });
      return;
    }
    emitStateToAll(room);
  });

  socket.on('buy_draft_card', ({ slotIndex } = {}, acknowledge) => {
    const room = getRoom(playerId);
    if (!room || !room.game) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: '对局不存在' });
      return;
    }
    const res = buyDraftCard(room.game, playerId, slotIndex);
    if (!res.ok) {
      const error = res.error || '购买失败';
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error });
      else socket.emit('error_msg', { message: error });
      return;
    }
    if (typeof acknowledge === 'function') acknowledge({ ok: true });
    emitStateToAll(room);
  });

  socket.on('draft_ready', () => {
    const room = getRoom(playerId);
    if (!room || !room.game) return;
    confirmDraftReady(room.game, playerId);
    emitStateToAll(room);
  });

  socket.on('surrender', (_payload = {}, acknowledge) => {
    const room = getRoom(playerId);
    const result = surrenderGame(room, playerId);
    if (typeof acknowledge === 'function') acknowledge(result);
  });

  socket.on('request_rematch', (_payload = {}, acknowledge) => {
    const roomId = socketToRoom.get(playerId);
    const room = roomId ? rooms.get(roomId) : null;
    const result = requestRoomRematch(roomId, room, playerId);
    if (typeof acknowledge === 'function') acknowledge(result);
  });

  socket.on('leave_room', (_payload = {}, acknowledge) => {
    const result = leavePlayerRoom(socket, playerId);
    if (typeof acknowledge === 'function') acknowledge(result);
  });

  // ── 断线 ──
  // ── 聊天系统 ──
  socket.on('chat_msg', ({ roomId, sender, msg }) => {
    if (!roomId) return;
    io.to(roomId).emit('chat_msg_receive', { sender, msg, time: new Date().toLocaleTimeString('en-US', { hour12: false }) });
  });

  socket.on('disconnect', () => {
    const idx = matchQueue.findIndex(q => q.playerId === playerId);
    if (idx >= 0) matchQueue.splice(idx, 1);

    if (activeSockets.get(playerId) !== socket.id) return;
    activeSockets.delete(playerId);

    const roomId = socketToRoom.get(playerId);
    const room = roomId ? rooms.get(roomId) : null;
    if (room) schedulePlayerDisconnect(roomId, room, playerId);
  });
});

// ── AI 阶段自动处理 ──
function scheduleAiAction(room, key, delay, action) {
  if (!room || room.aiActionKey === key) return;
  if (room.aiActionTimer) clearTimeout(room.aiActionTimer);
  room.aiActionKey = key;
  room.aiActionTimer = setTimeout(() => {
    room.aiActionTimer = null;
    room.aiActionKey = null;
    action();
  }, delay);
}

function triggerAiPhase(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.isAI || room.game.phase !== 'battle') return;
  const g = room.game;

  // AI 自动盲选目标（梦境）
  const fxr = g.players.find(p => p.card?.positiveSkill?.id === SKILL.DREAM_KING);
  if (fxr && fxr.inDreamState && !fxr.lgpyForm && fxr.dreamTargetChoice === null) {
    // 找到非 FXR 的 AI 玩家来盲选
    const nonFxrAi = fxr.id === room.aiId ? null : room.aiId;
    if (nonFxrAi) {
      const aiTargetIdx = Math.floor(Math.random() * 3);
      chooseDreamTarget(g, nonFxrAi, aiTargetIdx);
      emitStateToAll(room);
    }
  }

  // AI 选卡商店自动补牌与确认
  if (g.draftShop && g.draftShop.active) {
    const aiDraft = g.draftShop.players?.[room.aiId];
    if (aiDraft && !aiDraft.ready) {
      const aiPlayer = g.players.find(p => p.id === room.aiId);
      if (aiPlayer) {
        let slotIndex = aiChooseDraftSlot(g, room.aiId);
        while (slotIndex !== null && (aiPlayer.handCards || []).length < 3) {
          const result = buyDraftCard(g, room.aiId, slotIndex);
          if (!result.ok) break;
          slotIndex = aiChooseDraftSlot(g, room.aiId);
        }
      }
      confirmDraftReady(g, room.aiId);
      emitStateToAll(room);
    }
  }

  // AI 打出战术卡策略 (在自己攻防回合自动打出可用卡)
  const aiPlayer = g.players.find(p => p.id === room.aiId);
  if (aiPlayer && !aiPlayer.isDead && aiPlayer.handCards && aiPlayer.handCards.length > 0) {
    const playableCard = aiChooseTacticalCard(g, room.aiId);
    if (playableCard) {
      const result = playTacticalCard(g, room.aiId, playableCard.id);
      if (result.ok) {
        emitToAll(room, 'tactical_card_played', () => ({ playerId: room.aiId, card: result.card }));
        emitStateToAll(room);
      }
    }
  }

  // 1. 等待攻击阶段 (掷骰)
  if (g.turnPhase === TURN.WAITING_ATK && getCurrentAttackerId(g) === room.aiId) {
    scheduleAiAction(room, `roll:${g.totalRound}:${g.turnData?.attackerIdx}`, 900, () => {
      if (!rooms.has(roomId)) return;
      if (g.phase !== 'battle' || g.turnPhase !== TURN.WAITING_ATK) return;
      const rollRes = rollAttack(g);
      if (!rollRes.ok) return;
      emitStateToAll(room);

      if (rollRes.selfKill) {
        emitToAll(room, 'turn_resolved', (pid) => ({
          damage: 0, selfDamage: rollRes.selfDamage || 0, pierce: false, finalDef: 0, penalty: 0,
          defNegTriggered: false, defNegName: null, defPosTriggered: false, defPosName: null,
          noobTriggered: false, gameOver: rollRes.gameOver ?? true, winner: rollRes.winner ?? g.winner,
          deathCause: rollRes.deathCause || 'self_damage',
          attackerIdx: g.turnData.attackerIdx,
          state: getStateView(g, pid),
        }));
        scheduleFinishedRoomCleanup(room);
        return;
      }
      // 掷骰完自动进入下个子阶段处理
      triggerAiPhase(roomId);
    });
  }

  // 2. 已掷攻击骰阶段 (重投或确认)
  if (g.turnPhase === TURN.ATK_ROLLED && getCurrentAttackerId(g) === room.aiId) {
    scheduleAiAction(room, `attack:${g.totalRound}:${g.turnData?.hasAttackerRerolled ? 1 : 0}`, 850, () => {
      if (!rooms.has(roomId)) return;
      if (g.phase !== 'battle' || g.turnPhase !== TURN.ATK_ROLLED) return;
      const atk = g.players[g.turnData.attackerIdx];
      const rolls = g.turnData.attackRolls;
      const faces = getEffectiveDicePool(g, atk.id);
      const slots = getAllowedSlotCount(g, atk.id, 'attack');

      const rerollIndices = aiChooseRerollIndices({
        player: atk,
        rolls,
        faces,
        slots,
        phase: 'attack',
      });
      if (rerollIndices.length > 0) {
        const rerollResult = rerollDice(g, atk.id, rerollIndices);
        if (rerollResult.ok) {
          emitStateToAll(room);
          triggerAiPhase(roomId);
          return;
        }
      }

      const skillId = atk.card?.positiveSkill?.id || atk.card?.neutralSkill?.id;
      const indices = aiChooseKeepIndices({ rolls, faces, slots, phase: 'attack', skillId });
      const res = confirmAttack(g, indices);
      if (!res.ok) { console.error("AI confirmAttack failed", res, indices, atk.card); return; }
      emitToAll(room, 'atk_confirmed', (pid) => getAttackConfirmationView(g, pid));
      // 这里不需要 triggerAiPhase，因为确认后进入玩家防御
    });
  }

  // 3. 已掷防御骰阶段 (重投或确认)
  if (g.turnPhase === TURN.DEF_ROLLED && getCurrentDefenderId(g) === room.aiId) {
    scheduleAiAction(room, `defense:${g.totalRound}:${g.turnData?.hasDefenderRerolled ? 1 : 0}`, 850, () => {
      if (!rooms.has(roomId)) return;
      if (g.phase !== 'battle' || g.turnPhase !== TURN.DEF_ROLLED) return;
      const def = g.players[g.turnData.defenderIdx];
      const rolls = g.turnData.defenseRolls;
      const faces = getEffectiveDicePool(g, def.id);
      const slots = getAllowedSlotCount(g, def.id, 'defense');
      const targetValue = Number(g.turnData?.atkResult?.finalAtk) || 0;

      const rerollIndices = aiChooseRerollIndices({
        player: def,
        rolls,
        faces,
        slots,
        phase: 'defense',
        targetValue,
      });
      if (rerollIndices.length > 0) {
        const rerollResult = rerollDice(g, def.id, rerollIndices);
        if (rerollResult.ok) {
          emitStateToAll(room);
          triggerAiPhase(roomId);
          return;
        }
      }

      const skillId = def.card?.neutralSkill?.id || def.card?.positiveSkill?.id;
      const indices = aiChooseKeepIndices({ rolls, faces, slots, phase: 'defense', skillId, targetValue });

      let options = {};
      if (def.card.id === 'char_8' && def.hp < def.maxHp * 0.5) {
        let bestSac = indices[0];
        let maxVal = -1;
        for (let idx of indices) {
          if (rolls[idx] > maxVal) { maxVal = rolls[idx]; bestSac = idx; }
        }
        if (maxVal >= 4) options.sacrificeIndex = bestSac;
      }

      const res = confirmDefense(g, def.id, indices, options);
      if (!res.ok) { console.error("AI confirmDefense failed", res, indices, def.card); return; }
      emitToAll(room, 'turn_resolved', (pid) => ({ ...res, state: getStateView(g, pid) }));

      if (res.gameOver) {
        if (g.gameMode === '1v1' && g.winner !== null && g.winner !== 'draw') {
          const winnerCardId = g.players[g.winner].cardId;
          const loserIdx = g.winner === 0 ? 1 : 0;
          const loserCardId = g.players[loserIdx].cardId;
          const isPvE = g.players[0].id.startsWith('AI_') || g.players[1].id.startsWith('AI_');
          recordMatch(winnerCardId, loserCardId, isPvE);
        }
        scheduleFinishedRoomCleanup(room);
      } else if (res.classChanged) {
        emitToAll(room, 'class_change', () => ({
          subject: res.nextSubject,
          index: g.currentClassIndex,
          day: res.currentDay || g.currentDay || 1,
          dayChanged: !!res.dayChanged,
        }));
        setTimeout(() => triggerAiPhase(roomId), 5000);
      } else {
        triggerAiPhase(roomId);
      }
    });
  }
}

// ── 辅助 ──
function scheduleAiSelection(roomId, humanPlayerId) {
  const room = rooms.get(roomId);
  if (!room?.isAI) return;
  const game = room.game;

  setTimeout(() => {
    const currentRoom = rooms.get(roomId);
    if (!currentRoom?.isAI || currentRoom.game !== game || game.phase !== 'preparation') return;
    const aiCardId = currentRoom.aiCardId || aiSelectCard(game.schedule);
    selectCard(game, currentRoom.aiId, aiCardId);
    console.log(`[PVE] AI ${currentRoom.aiId} 已选卡: ${aiCardId}`);
    io.to(humanPlayerId).emit('opponent_selected');
  }, 1000);
}

function scheduleFinishedRoomCleanup(room) {
  if (!room) return;
  if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => cleanupRoom(room), finishedRoomRetentionMs);
  room.cleanupTimer.unref?.();
}

function surrenderGame(room, playerId) {
  const game = room?.game;
  if (!game || game.pending) return { ok: false, error: '对局不存在' };
  if (game.gameMode !== '1v1') return { ok: false, error: '当前模式暂不支持投降' };
  if (game.phase !== 'battle') return { ok: false, error: '当前阶段无法投降' };

  const loserIndex = game.players.findIndex(player => player.id === playerId);
  if (loserIndex === -1) return { ok: false, error: '玩家不在对局中' };

  const winnerIndex = 1 - loserIndex;
  const loser = game.players[loserIndex];
  loser.hp = 0;
  loser.isDead = true;
  game.phase = 'game_over';
  game.winner = winnerIndex;
  game.endReason = 'surrender';
  game.surrenderedId = playerId;

  const winnerCardId = game.players[winnerIndex]?.cardId;
  const loserCardId = loser.cardId;
  if (winnerCardId && loserCardId) {
    const isPvE = game.players.some(player => player.id.startsWith('AI_'));
    recordMatch(winnerCardId, loserCardId, isPvE);
  }

  emitToAll(room, 'game_over', pid => ({
    reason: 'surrender',
    surrenderedId: playerId,
    state: getStateView(game, pid),
  }));
  scheduleFinishedRoomCleanup(room);
  return { ok: true };
}

function requestRoomRematch(roomId, room, playerId) {
  const game = room?.game;
  if (!roomId || !game || game.pending) return { ok: false, error: '房间不存在' };
  if (game.gameMode !== '1v1') return { ok: false, error: '当前模式暂不支持重赛' };
  if (game.phase !== 'game_over') return { ok: false, error: '对局尚未结束' };
  if (!room.playerSockets?.includes(playerId) || room.departedPlayers?.has(playerId)) {
    return { ok: false, error: '你已离开该房间' };
  }

  room.rematchReady ??= new Set();
  room.rematchReady.add(playerId);
  const humanIds = game.players.filter(player => !player.id.startsWith('AI_')).map(player => player.id);
  const required = room.isAI ? 1 : humanIds.length;

  emitToAll(room, 'rematch_status', pid => ({
    readyCount: room.rematchReady.size,
    required,
    isReady: room.rematchReady.has(pid),
  }));

  const canStart = room.isAI || humanIds.every(id => room.rematchReady.has(id));
  if (canStart) startRoomRematch(roomId, room);
  return { ok: true, started: canStart };
}

function startRoomRematch(roomId, room) {
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = null;
  }
  if (room.aiActionTimer) {
    clearTimeout(room.aiActionTimer);
    room.aiActionTimer = null;
    room.aiActionKey = null;
  }

  const previousGame = room.game;
  const players = previousGame.players.map(player => ({ id: player.id, nickname: player.nickname }));
  room.game = createGame(players, previousGame.gameMode);
  room.rematchReady = new Set();
  room.departedPlayers = new Set();

  for (const player of room.game.players) {
    if (player.id.startsWith('AI_')) continue;
    io.to(player.id).emit('rematch_started', {
      roomId,
      opponent: room.game.players.find(other => other.id !== player.id)?.nickname || '未知对手',
      schedule: room.game.schedule,
      state: getStateView(room.game, player.id),
      aiOpponentCardId: room.isAI ? room.aiCardId : null,
    });
  }

  if (room.isAI) {
    const humanId = room.game.players.find(player => !player.id.startsWith('AI_'))?.id;
    if (humanId) scheduleAiSelection(roomId, humanId);
  }
}

function leavePlayerRoom(socket, playerId) {
  const roomId = socketToRoom.get(playerId);
  const room = roomId ? rooms.get(roomId) : null;
  if (!roomId || !room) {
    socketToRoom.delete(playerId);
    return { ok: true };
  }

  if (room.game.pending) {
    socketToRoom.delete(playerId);
    socket.leave(roomId);

    if (room.game.mode === 'sanguosha' && room.game.players) {
      room.game.players = room.game.players.filter(player => player.id !== playerId);
      room.playerSockets = room.playerSockets.filter(id => id !== playerId);
      if (room.playerSockets.length === 0) cleanupRoom(roomId);
      else io.to(roomId).emit('ffa_room_update', { players: room.game.players });
    } else {
      io.to(roomId).emit('room_closed', { reason: '房主已离开房间' });
      cleanupRoom(roomId);
    }
    return { ok: true };
  }

  if (room.game.phase === 'preparation') {
    broadcastToOpponent(room, playerId, 'room_closed', { reason: '对手已离开准备房间' });
    cleanupRoom(roomId);
    socket.leave(roomId);
    return { ok: true };
  }

  if (room.game.phase === 'battle' && room.game.gameMode === '1v1') {
    surrenderGame(room, playerId);
  }

  room.departedPlayers ??= new Set();
  room.departedPlayers.add(playerId);
  room.rematchReady?.delete(playerId);
  room.playerSockets = room.playerSockets.filter(id => id !== playerId);
  socketToRoom.delete(playerId);
  socket.leave(roomId);

  broadcastToOpponent(room, playerId, 'opponent_left_room', { playerId });
  if (room.isAI || room.playerSockets.filter(Boolean).length === 0) cleanupRoom(roomId);
  else scheduleFinishedRoomCleanup(room);
  return { ok: true };
}

function getPersistentPlayerId(socket) {
  const sessionId = socket.handshake.auth?.playerSessionId;
  if (typeof sessionId === 'string' && /^[a-zA-Z0-9_-]{16,96}$/.test(sessionId)) {
    return `P_${sessionId}`;
  }
  return socket.id;
}

function resumePlayerSession(socket, playerId) {
  const roomId = socketToRoom.get(playerId);
  const room = roomId ? rooms.get(roomId) : null;
  if (!room) {
    socketToRoom.delete(playerId);
    return { ok: false };
  }

  const belongsToRoom = room.playerSockets?.includes(playerId)
    || room.game?.creatorId === playerId
    || room.game?.players?.some(p => p.id === playerId);
  if (!belongsToRoom) {
    socketToRoom.delete(playerId);
    return { ok: false };
  }

  socket.join(roomId);
  const wasDisconnected = room.disconnectedPlayers?.delete(playerId) || false;
  const disconnectTimer = room.disconnectTimers?.get(playerId);
  if (disconnectTimer) clearTimeout(disconnectTimer);
  room.disconnectTimers?.delete(playerId);

  if (room.game.pending) {
    if (wasDisconnected && room.game.players) {
      io.to(roomId).emit('ffa_room_update', { players: room.game.players });
    }
    return {
      ok: true,
      pending: true,
      roomId,
      mode: room.game.mode,
      isOwner: room.game.mode === 'sanguosha'
        ? room.game.players?.[0]?.id === playerId
        : room.game.creatorId === playerId,
      players: room.game.players || [{ id: room.game.creatorId, nickname: room.game.creatorName }],
    };
  }

  const player = room.game.players?.find(p => p.id === playerId);
  if (!player) {
    socketToRoom.delete(playerId);
    return { ok: false };
  }

  if (wasDisconnected) {
    broadcastToOpponent(room, playerId, 'opponent_reconnected', { playerId });
  }

  const opponent = room.game.gameMode === 'sanguosha'
    ? '大乱斗模式'
    : room.game.players.find(p => p.id !== playerId)?.nickname || '未知对手';

  return {
    ok: true,
    roomId,
    opponent,
    schedule: room.game.schedule,
    state: getStateView(room.game, playerId),
    aiOpponentCardId: room.isAI ? room.aiCardId : null,
  };
}

function schedulePlayerDisconnect(roomId, room, playerId) {
  room.disconnectedPlayers ??= new Set();
  room.disconnectTimers ??= new Map();

  const previousTimer = room.disconnectTimers.get(playerId);
  if (previousTimer) clearTimeout(previousTimer);

  room.disconnectedPlayers.add(playerId);
  if (!room.game.pending) {
    broadcastToOpponent(room, playerId, 'opponent_connection_lost', {
      playerId,
      graceMs: reconnectGraceMs,
    });
  }

  const timer = setTimeout(() => finalizePlayerDisconnect(roomId, playerId), reconnectGraceMs);
  timer.unref?.();
  room.disconnectTimers.set(playerId, timer);
}

function finalizePlayerDisconnect(roomId, playerId) {
  if (activeSockets.has(playerId)) return;

  const room = rooms.get(roomId);
  if (!room || socketToRoom.get(playerId) !== roomId) return;

  room.disconnectTimers?.delete(playerId);
  room.disconnectedPlayers?.delete(playerId);
  socketToRoom.delete(playerId);

  if (room.isAI) {
    cleanupRoom(roomId);
    return;
  }

  if (room.game.pending) {
    if (room.game.mode === 'sanguosha' && room.game.players) {
      room.game.players = room.game.players.filter(p => p.id !== playerId);
      room.playerSockets = room.playerSockets.filter(pid => pid !== playerId);
      if (room.playerSockets.length === 0) cleanupRoom(roomId);
      else io.to(roomId).emit('ffa_room_update', { players: room.game.players });
    } else {
      cleanupRoom(roomId);
    }
    return;
  }

  const player = room.game.players?.find(p => p.id === playerId);
  if (!player) return;

  player.hp = 0;
  player.isDead = true;

  if (room.game.turnPhase === TURN.DEF_ROLLED && room.game.turnData?.isAoE) {
    const defState = room.game.turnData.aoeDefenses[playerId];
    if (defState && !defState.confirmed) {
      const indices = defState.rolls.map((_, index) => index).slice(0, player.card.defSlots);
      const result = confirmDefense(room.game, playerId, indices);
      if (result.ok && !result.waitingForOthers) {
        emitToAll(room, 'turn_resolved', pid => ({ ...result, state: getStateView(room.game, pid) }));
      }
    }
  }

  emitToAll(room, 'opponent_disconnected', { disconnectedId: playerId });
  emitStateToAll(room);
}

function getRoom(sid) {
  const rid = socketToRoom.get(sid);
  return rid ? rooms.get(rid) : null;
}

function broadcastToOpponent(room, mySid, event, data = {}) {
  if (!room.game.players) return;
  for (const op of room.game.players) {
    if (op.id !== mySid && !op.id.startsWith('AI_') && !room.departedPlayers?.has(op.id)) {
      io.to(op.id).emit(event, data);
    }
  }
}

function emitStateToAll(room) {
  emitToAll(room, 'state_update', (pid) => getStateView(room.game, pid));
}

function emitToAll(room, event, buildData) {
  if (!room.game.players) return;
  for (const p of room.game.players) {
    if (p.id.startsWith('AI_') || room.departedPlayers?.has(p.id)) continue;
    const data = typeof buildData === 'function' ? buildData(p.id) : buildData;
    io.to(p.id).emit(event, data);
  }
}

function cleanupRoom(roomOrId) {
  const rid = typeof roomOrId === 'string' ? roomOrId : [...rooms.entries()].find(([k, v]) => v === roomOrId)?.[0];
  if (!rid) return;
  const room = rooms.get(rid);
  if (room?.cleanupTimer) clearTimeout(room.cleanupTimer);
  if (room?.aiActionTimer) clearTimeout(room.aiActionTimer);
  if (room?.disconnectTimers) {
    for (const timer of room.disconnectTimers.values()) clearTimeout(timer);
  }
  if (room && room.playerSockets) {
    for (const sid of room.playerSockets) {
      if (sid) socketToRoom.delete(sid);
    }
  }
  rooms.delete(rid);
}

// ============================================================
// 货币战争 (自走棋) Socket 处理
// ============================================================
io.on('connection', (socket) => {
  // ── 开始货币战争 ──
  socket.on('start_autochess', ({ nickname }) => {
    const run = createRun(socket.id, nickname);
    acRuns.set(socket.id, run);
    const runView = getRunView(run);
    socket.emit('match_found', { roomId: 'ac_' + socket.id, mode: 'autochess', run: runView });
  });

  // ── 购买角色 ──
  socket.on('ac_buy', ({ shopIndex }) => {
    const run = acRuns.get(socket.id);
    if (!run) return;
    const result = buyCharacter(run, shopIndex);
    if (!result.ok) { socket.emit('error_msg', { message: result.error }); return; }
    if (result.starUps?.length) {
      result.starUps.forEach(su => socket.emit('ac_star_up', su));
    }
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 卖出角色 ──
  socket.on('ac_sell', ({ from, index }) => {
    const run = acRuns.get(socket.id);
    if (!run) return;
    sellCharacter(run, from, index);
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 放置角色 ──
  socket.on('ac_place', ({ benchIndex, slot }) => {
    const run = acRuns.get(socket.id);
    if (!run) return;
    const result = placeCharacter(run, benchIndex, slot);
    if (!result.ok) { socket.emit('error_msg', { message: result.error }); return; }
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 从棋盘移回 ──
  socket.on('ac_remove', ({ slot }) => {
    const run = acRuns.get(socket.id);
    if (!run) return;
    removeFromBoard(run, slot);
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 刷新商店 ──
  socket.on('ac_refresh_shop', () => {
    const run = acRuns.get(socket.id);
    if (!run) return;
    let refreshCost = AC.SHOP_REFRESH_COST;
    const bargainBuff = (run.investmentBuffs || []).filter(b => b.id === 'bargain');
    if (bargainBuff.length > 0) refreshCost = Math.max(0, refreshCost - bargainBuff.reduce((s, b) => s + b.value, 0));
    if (run.gold < refreshCost) { socket.emit('error_msg', { message: 'no_gold' }); return; }
    run.gold -= refreshCost;
    run.shop = shopRefresh(run.pool, run.level);
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 买经验 ──
  socket.on('ac_buy_xp', () => {
    const run = acRuns.get(socket.id);
    if (!run) return;
    const result = buyXP(run);
    if (!result.ok) { socket.emit('error_msg', { message: result.error }); return; }
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 开始战斗 ──
  socket.on('ac_start_combat', () => {
    const run = acRuns.get(socket.id);
    if (!run || !run.board.core) return;

    run.phase = 'combat';
    const buffs = calculateSupportBuffs(run);

    // 构建玩家战斗角色
    const coreEntry = run.board.core;
    const coreCfg = AC_CHAR_MAP[coreEntry.charId];
    const coreStats = scaleCharStats(coreCfg, coreEntry.star);
    const playerFighter = {
      name: coreCfg.name,
      hp: coreStats.hp,
      dicePool: [...coreStats.dicePool],
      atkSlots: coreStats.atkSlots,
      defSlots: coreStats.defSlots,
      coreSkills: { positive: coreCfg.corePositive, negative: coreCfg.coreNegative },
    };

    // 幸运骰: 所有骰子面数+N
    const luckyDice = (run.investmentBuffs || []).filter(b => b.id === 'lucky_dice');
    if (luckyDice.length > 0) {
      const boost = luckyDice.reduce((s, b) => s + b.value, 0);
      playerFighter.dicePool = playerFighter.dicePool.map(f => f + boost);
    }

    // 学霸光环: 攻击+4
    let scholarBonus = 0;
    const scholarBuff = (run.investmentBuffs || []).filter(b => b.id === 'scholar_aura');
    if (scholarBuff.length > 0) scholarBonus = scholarBuff.reduce((s, b) => s + b.value, 0);

    // 生成 AI 对手
    const nodeType = getCurrentNodeType(run);
    let aiFighter;
    if (nodeType === 'event') {
      // 金矿战斗
      aiFighter = createGoldMineBattle();
    } else {
      aiFighter = generateAIOpponent(run);
    }

    // 执行自动战斗
    const combatResult = autoResolveMatch(playerFighter, aiFighter, buffs, {
      atkBonusThisPlane: (run.atkBonusThisPlane || 0) + scholarBonus,
    });

    const won = combatResult.winner === 1;

    // 处理战后结算
    const battleResult = processBattleResult(run, won, combatResult.totalDamageByP1);

    // 辅阵技：战后骰面成长
    if (won && buffs.growMinDie > 0 && coreCfg) {
      // 找骰池最小的骰子，加面数
      const pool = coreStats.dicePool;
      const minIdx = pool.indexOf(Math.min(...pool));
      // 永久修改需要存储，这里简化为记录buff
    }

    socket.emit('ac_combat_result', {
      combatLog: combatResult.log,
      won,
      goldEarned: battleResult.goldEarned,
      commanderDamage: battleResult.commanderDamage,
      result: getRunView(run),
    });
  });

  // ── 手动战斗 ──
  socket.on('ac_start_manual_combat', () => {
    const run = acRuns.get(socket.id);
    if (!run || !run.board.core) return;

    run.phase = 'manual_combat';
    const buffs = calculateSupportBuffs(run);

    const coreEntry = run.board.core;
    const coreCfg = AC_CHAR_MAP[coreEntry.charId];
    const coreStats = scaleCharStats(coreCfg, coreEntry.star);
    const playerFighter = {
      name: coreCfg.name,
      hp: coreStats.hp,
      dicePool: [...coreStats.dicePool],
      atkSlots: coreStats.atkSlots,
      defSlots: coreStats.defSlots,
      coreSkills: { positive: coreCfg.corePositive, negative: coreCfg.coreNegative },
    };

    const luckyDice = (run.investmentBuffs || []).filter(b => b.id === 'lucky_dice');
    if (luckyDice.length > 0) {
      const boost = luckyDice.reduce((s, b) => s + b.value, 0);
      playerFighter.dicePool = playerFighter.dicePool.map(f => f + boost);
    }

    const nodeType = getCurrentNodeType(run);
    let aiFighter;
    if (nodeType === 'event') {
      aiFighter = createGoldMineBattle();
    } else {
      aiFighter = generateAIOpponent(run);
    }

    socket.emit('ac_manual_combat_setup', {
      playerFighter,
      aiFighter,
      buffs: {
        flatReduction: buffs.flatReduction,
        flatDef: buffs.flatDef,
        extraRerolls: buffs.extraRerolls,
        healOnOverflow: buffs.healOnOverflow,
      },
      nodeType,
    });
  });

  socket.on('ac_manual_combat_done', ({ won, totalDamage }) => {
    const run = acRuns.get(socket.id);
    if (!run) return;
    processBattleResult(run, won, totalDamage || 0);
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 事件节点选择 ──
  socket.on('ac_event_choice', () => {
    const run = acRuns.get(socket.id);
    if (!run) return;
    const result = chooseEvent(run);
    if (!result.ok) return;
    if (result.choice === 'investment') {
      run._eventOptions = result.options;
      socket.emit('ac_event_options', { options: result.options });
    } else {
      // 金矿 → 进入shop阶段准备战斗
      socket.emit('ac_run_update', getRunView(run));
      socket.emit('error_msg', { message: '触发了金矿事件！请开始战斗。' }); 
    }
  });

  // ── 确认投资策略 ──
  socket.on('ac_confirm_investment', ({ buffIndex }) => {
    const run = acRuns.get(socket.id);
    if (!run || !run._eventOptions) return;
    const result = confirmInvestment(run, run._eventOptions[buffIndex]?.id, run._eventOptions);
    delete run._eventOptions;
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 购买饮料 ──
  socket.on('ac_buy_beverage', ({ beverageId }) => {
    const run = acRuns.get(socket.id);
    if (!run) return;
    const result = buyBeverage(run, beverageId);
    if (!result.ok) { socket.emit('error_msg', { message: result.error }); return; }
    socket.emit('ac_run_update', getRunView(run));
  });

  // ── 断开连接时清理 ──
  socket.on('disconnect', () => {
    acRuns.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, "0.0.0.0", () => console.log(`🎲 校园战力党 → http://localhost:${PORT}`));
