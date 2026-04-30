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
  rollAttack, rerollDice, confirmAttack, confirmDefense,
  getCurrentAttackerId, getCurrentDefenderId, getStateView, TURN,
} from './game/engine.js';
import { aiSelectCard } from './game/ai.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.static(join(__dirname, '..', 'dist')));
app.get('*', (req, res) => res.sendFile(join(__dirname, '..', 'dist', 'index.html')));

const rooms = new Map();
const matchQueue = [];
const socketToRoom = new Map();
let roomCounter = 1000;
function newRoomId() { return String(++roomCounter); }

// ── Socket.IO ──
io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id}`);

  // ── PVE ──
  socket.on('start_pve', ({ nickname }) => {
    const roomId = newRoomId();
    const aiId = 'AI_' + roomId;
    const game = createGame(socket.id, nickname, aiId, '🤖 电脑');
    rooms.set(roomId, { game, playerSockets: [socket.id, null], isAI: true, aiId });
    socketToRoom.set(socket.id, roomId);
    socket.emit('match_found', {
      roomId, opponent: '🤖 电脑',
      schedule: game.schedule, state: getStateView(game, socket.id),
    });
    console.log(`[PVE] 房间 ${roomId} 已创建, AI: ${aiId}`);
    
    // AI 预选卡片 (增加体验，让玩家看到 AI 已选)
    setTimeout(() => {
      const room = rooms.get(roomId);
      if (room && room.isAI) {
        const aiCardId = aiSelectCard(room.game.schedule);
        selectCard(room.game, room.aiId, aiCardId);
        console.log(`[PVE] AI ${aiId} 已自动选卡: ${aiCardId}`);
        socket.emit('opponent_selected');
      }
    }, 1000);
  });

  // ── 创建房间 ──
  socket.on('create_room', ({ nickname }) => {
    const roomId = newRoomId();
    rooms.set(roomId, {
      game: { pending: true, creatorId: socket.id, creatorName: nickname },
      playerSockets: [socket.id, null], isAI: false,
    });
    socketToRoom.set(socket.id, roomId);
    socket.join(roomId);
    socket.emit('room_created', { roomId });
  });

  // ── 加入房间 ──
  socket.on('join_room', ({ nickname, roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.game.pending) {
      socket.emit('error_msg', { message: '房间不存在或已开始' }); return;
    }
    const game = createGame(room.game.creatorId, room.game.creatorName, socket.id, nickname);
    room.game = game; room.playerSockets[1] = socket.id;
    socketToRoom.set(socket.id, roomId);
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
      const other = matchQueue.shift();
      const roomId = newRoomId();
      const game = createGame(other.socketId, other.nickname, socket.id, nickname);
      rooms.set(roomId, { game, playerSockets: [other.socketId, socket.id], isAI: false });
      socketToRoom.set(socket.id, roomId);
      socketToRoom.set(other.socketId, roomId);
      socket.join(roomId);
      io.sockets.sockets.get(other.socketId)?.join(roomId);
      for (const pid of [other.socketId, socket.id]) {
        io.to(pid).emit('match_found', {
          roomId, opponent: game.players.find(p => p.id !== pid).nickname,
          schedule: game.schedule, state: getStateView(game, pid),
        });
      }
    } else {
      matchQueue.push({ socketId: socket.id, nickname });
      socket.emit('matchmaking_waiting');
    }
  });

  socket.on('cancel_matchmaking', () => {
    const idx = matchQueue.findIndex(q => q.socketId === socket.id);
    if (idx >= 0) matchQueue.splice(idx, 1);
  });

  // ── 选卡 ──
  socket.on('select_card', ({ cardId }) => {
    const room = getRoom(socket.id); if (!room) return;
    if (selectCard(room.game, socket.id, cardId).ok) {
      socket.emit('state_update', getStateView(room.game, socket.id));
      broadcastToOpponent(room, socket.id, 'opponent_selected');
    }
  });

  // ── 准备 ──
  socket.on('ready', () => {
    const room = getRoom(socket.id); if (!room) return;
    const res = setReady(room.game, socket.id);
    if (!res.ok) return;
    if (room.isAI && !res.battleStarted) {
      const aiCardId = room.game.players[1].cardId || aiSelectCard(room.game.schedule);
      if (!room.game.players[1].cardId) selectCard(room.game, room.aiId, aiCardId);
      const aiRes = setReady(room.game, room.aiId);
      if (aiRes.battleStarted) res.battleStarted = true;
      console.log(`[PVE] AI ${room.aiId} 准备完毕, 战斗开始: ${res.battleStarted}`);
    }
    if (res.battleStarted) {
      emitStateToAll(room);
      triggerAiPhase(room);
    } else {
      socket.emit('state_update', getStateView(room.game, socket.id));
      broadcastToOpponent(room, socket.id, 'opponent_ready');
    }
  });

  // ── 调课权 ──
  socket.on('use_reschedule', ({ classIndex, newType }) => {
    const room = getRoom(socket.id); if (!room) return;
    if (useReschedule(room.game, socket.id, classIndex, newType).ok) {
      emitStateToAll(room);
    }
  });

  // ── 掷攻击骰 ──
  socket.on('roll_dice', () => {
    const room = getRoom(socket.id); if (!room) return;
    const g = room.game;
    if (getCurrentAttackerId(g) !== socket.id) return;
    const res = rollAttack(g);
    if (res.ok) {
      emitStateToAll(room);
      if (res.selfKill) {
        emitToAll(room, 'turn_resolved', (pid) => ({
          damage: 0, selfDamage: 0, pierce: false, finalDef: 0, penalty: 0,
          defNegTriggered: false, defNegName: null, defPosTriggered: false, defPosName: null,
          noobTriggered: false, gameOver: true, winner: g.winner,
          attackerIdx: g.turnData.attackerIdx,
          state: getStateView(g, pid),
        }));
        setTimeout(() => cleanupRoom(room), 30000);
      }
    }
  });

  // ── 重投骰子 ──
  socket.on('reroll_dice', ({ indices }) => {
    const room = getRoom(socket.id); if (!room) return;
    const res = rerollDice(room.game, socket.id, indices);
    if (res.ok) emitStateToAll(room);
  });

  // ── 确认骰子 ──
  socket.on('confirm_dice', ({ indices }) => {
    const room = getRoom(socket.id); if (!room) return;
    const g = room.game;

    if (g.turnPhase === TURN.ATK_ROLLED && getCurrentAttackerId(g) === socket.id) {
      const res = confirmAttack(g, indices);
      if (!res.ok) return;
      // Send atk_confirmed event then state (which now has DEF_ROLLED phase)
      emitToAll(room, 'atk_confirmed', (pid) => ({
        atkResult: res.atkResult, defenseRolls: res.defenseRolls,
        state: getStateView(g, pid),
      }));
      triggerAiPhase(room);

    } else if (g.turnPhase === TURN.DEF_ROLLED && getCurrentDefenderId(g) === socket.id) {
      const res = confirmDefense(g, indices);
      if (!res.ok) return;
      emitToAll(room, 'turn_resolved', (pid) => ({
        ...res, state: getStateView(g, pid),
      }));
      if (res.gameOver) {
        setTimeout(() => cleanupRoom(room), 30000);
      } else if (res.classChanged) {
        emitToAll(room, 'class_change', () => ({
          subject: res.nextSubject, index: g.currentClassIndex,
        }));
        setTimeout(() => triggerAiPhase(room), 2000);
      } else {
        triggerAiPhase(room);
      }
    }
  });

  // ── 请求状态 (断线重连) ──
  socket.on('request_state', () => {
    const room = getRoom(socket.id);
    if (room && room.game.players) {
      socket.emit('state_update', getStateView(room.game, socket.id));
    }
  });

  // ── 断线 ──
  socket.on('disconnect', () => {
    const idx = matchQueue.findIndex(q => q.socketId === socket.id);
    if (idx >= 0) matchQueue.splice(idx, 1);
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room && !room.isAI) broadcastToOpponent(room, socket.id, 'opponent_disconnected');
      socketToRoom.delete(socket.id);
    }
  });
});

// ── AI 阶段自动处理 ──
function triggerAiPhase(room) {
  if (!room.isAI || room.game.phase !== 'battle') return;
  const g = room.game;

  if (g.turnPhase === TURN.WAITING_ATK && getCurrentAttackerId(g) === room.aiId) {
    setTimeout(() => {
      if (g.phase !== 'battle') return;
      const rollRes = rollAttack(g);
      if (!rollRes.ok) return;
      emitStateToAll(room);
      if (rollRes.selfKill) {
        emitToAll(room, 'turn_resolved', (pid) => ({
          damage: 0, selfDamage: 0, pierce: false, finalDef: 0, penalty: 0,
          defNegTriggered: false, defNegName: null, defPosTriggered: false, defPosName: null,
          noobTriggered: false, gameOver: true, winner: g.winner,
          attackerIdx: g.turnData.attackerIdx,
          state: getStateView(g, pid),
        }));
        setTimeout(() => cleanupRoom(room), 30000);
        return;
      }
      // AI auto-confirms attack
      setTimeout(() => {
        if (g.phase !== 'battle' || g.turnPhase !== TURN.ATK_ROLLED) return;
        const atk = g.players[g.turnData.attackerIdx];
        const rolls = g.turnData.attackRolls;
        // AI picks highest dice
        const slots = atk.card.atkSlots === -1 ? rolls.length : atk.card.atkSlots;
        const indices = rolls.map((v, i) => ({v, i})).sort((a,b) => b.v - a.v).slice(0, slots).map(x => x.i);
        const res = confirmAttack(g, indices);
        if (!res.ok) { console.error("AI confirmAttack failed", res, indices, atk.card); return; }
        emitToAll(room, 'atk_confirmed', (pid) => ({
          atkResult: res.atkResult, defenseRolls: res.defenseRolls,
          state: getStateView(g, pid),
        }));
        // Now it's player's defense turn — don't auto-trigger
      }, 1200);
    }, 800);
  }

  if (g.turnPhase === TURN.DEF_ROLLED && getCurrentDefenderId(g) === room.aiId) {
    setTimeout(() => {
      if (g.phase !== 'battle' || g.turnPhase !== TURN.DEF_ROLLED) return;
      const def = g.players[g.turnData.defenderIdx];
      const rolls = g.turnData.defenseRolls;
      // AI picks highest dice
      const indices = rolls.map((v, i) => ({v, i})).sort((a,b) => b.v - a.v).slice(0, def.card.defSlots).map(x => x.i);
      const res = confirmDefense(g, indices);
      if (!res.ok) return;
      emitToAll(room, 'turn_resolved', (pid) => ({ ...res, state: getStateView(g, pid) }));
      if (res.gameOver) {
        setTimeout(() => cleanupRoom(room), 30000);
      } else if (res.classChanged) {
        emitToAll(room, 'class_change', () => ({ subject: res.nextSubject, index: g.currentClassIndex }));
        setTimeout(() => triggerAiPhase(room), 2000);
      } else {
        triggerAiPhase(room);
      }
    }, 1000);
  }
}

// ── 辅助 ──
function getRoom(sid) {
  const rid = socketToRoom.get(sid);
  return rid ? rooms.get(rid) : null;
}

function broadcastToOpponent(room, mySid, event, data = {}) {
  if (!room.game.players) return;
  const op = room.game.players.find(p => p.id !== mySid);
  if (op && !op.id.startsWith('AI_')) io.to(op.id).emit(event, data);
}

function emitStateToAll(room) {
  emitToAll(room, 'state_update', (pid) => getStateView(room.game, pid));
}

function emitToAll(room, event, buildData) {
  if (!room.game.players) return;
  for (const p of room.game.players) {
    if (p.id.startsWith('AI_')) continue;
    const data = typeof buildData === 'function' ? buildData(p.id) : buildData;
    io.to(p.id).emit(event, data);
  }
}

function cleanupRoom() { /* keep room alive for reconnects */ }

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`🎲 校园战力党 → http://localhost:${PORT}`));
