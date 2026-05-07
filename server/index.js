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
  rollAttack, rerollDice, confirmAttack, confirmDefense, selectTarget, buyWater,
  getCurrentAttackerId, getCurrentDefenderId, getStateView, TURN,
} from './game/engine.js';
import { aiSelectCard } from './game/ai.js';
import { SKILL } from '../shared/characters.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' }, pingTimeout: 30000, pingInterval: 10000 });

if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
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
let roomCounter = 1000;
function newRoomId() { return String(++roomCounter); }

// ── Socket.IO ──
io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id}`);

  // ── PVE ──
  socket.on('start_pve', ({ nickname }) => {
    const roomId = newRoomId();
    const aiId = 'AI_' + roomId;
    const game = createGame([
      { id: socket.id, nickname },
      { id: aiId, nickname: '🤖 电脑' }
    ]);
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
      game: { pending: true, creatorId: socket.id, creatorName: nickname, mode: '1v1' },
      playerSockets: [socket.id, null], isAI: false,
    });
    socketToRoom.set(socket.id, roomId);
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
      { id: socket.id, nickname }
    ]);
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
      const idx = matchQueue.findIndex(p => p.socketId !== socket.id);
      if (idx === -1) {
        if (!matchQueue.some(p => p.socketId === socket.id)) {
          matchQueue.push({ socketId: socket.id, nickname });
        }
        return;
      }
      const other = matchQueue.splice(idx, 1)[0];
      const roomId = newRoomId();
      const game = createGame([
        { id: other.socketId, nickname: other.nickname },
        { id: socket.id, nickname }
      ]);
      rooms.set(roomId, { game, playerSockets: [other.socketId, socket.id], isAI: false });
      socketToRoom.set(socket.id, roomId);
      socketToRoom.set(other.socketId, roomId);
      socket.join(roomId);
      io.sockets.sockets.get(other.socketId)?.join(roomId);
      for (const pid of [other.socketId, socket.id]) {
        io.to(pid).emit('match_found', {
          roomId,
          opponent: game.players.find(p => p.id !== pid)?.nickname || "未知对手",
          schedule: game.schedule,
          state: getStateView(game, pid),
        });
      }
    } else {
      matchQueue.push({ socketId: socket.id, nickname });
      socket.emit('matchmaking_waiting');
    }
  });

  socket.on('cancel_matchmaking', () => {
    const idx = matchQueue.findIndex(p => p.socketId === socket.id);
    if (idx !== -1) matchQueue.splice(idx, 1);
  });

  // ── FFA 大乱斗房间 ──
  socket.on('create_ffa_room', ({ nickname }) => {
    const roomId = newRoomId();
    rooms.set(roomId, {
      game: { pending: true, mode: 'sanguosha', players: [{ id: socket.id, nickname }] },
      playerSockets: [socket.id], isAI: false,
    });
    socketToRoom.set(socket.id, roomId);
    socket.join(roomId);
    socket.emit('room_created', { roomId, mode: 'sanguosha' });
    io.to(roomId).emit('ffa_room_update', { players: [{ id: socket.id, nickname }] });
  });

  socket.on('join_ffa_room', ({ nickname, roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.game.pending || room.game.mode !== 'sanguosha') {
      socket.emit('error_msg', { message: '房间不存在或已开始' }); return;
    }
    if (room.game.players.length >= 8) {
      socket.emit('error_msg', { message: '房间已满 (最多8人)' }); return;
    }
    room.game.players.push({ id: socket.id, nickname });
    room.playerSockets.push(socket.id);
    socketToRoom.set(socket.id, roomId);
    socket.join(roomId);

    // 通知所有人更新房间玩家列表
    io.to(roomId).emit('ffa_room_update', { players: room.game.players });
  });

  socket.on('start_ffa_game', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.game.pending || room.game.mode !== 'sanguosha') return;
    // 只有房主可以开始
    if (room.game.players[0].id !== socket.id) return;
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
    const room = getRoom(socket.id); if (!room) return;
    if (selectTarget(room.game, socket.id, targetId).ok) {
      room.playerSockets.forEach(pid => {
        io.to(pid).emit('state_update', getStateView(room.game, pid));
      });
    }
  });

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
    const roomId = socketToRoom.get(socket.id);
    if (res.battleStarted) {
      emitStateToAll(room);
      triggerAiPhase(roomId);
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

  // ── 周煊声: 买水 (跳过攻击，蓄势) ──
  socket.on('buy_water', () => {
    const room = getRoom(socket.id); if (!room) return;
    const g = room.game;
    const res = buyWater(g, socket.id);
    if (!res.ok) {
      if (res.error === 'already_rerolled') socket.emit('error_msg', { message: '已经重投过了，无法买水！' });
      else if (res.error === 'max_charges') socket.emit('error_msg', { message: '蓄势已满（最多2层）！' });
      return;
    }
    emitToAll(room, 'buy_water_result', (pid) => ({
      chargeStacks: res.chargeStacks,
      state: getStateView(g, pid),
    }));
    const roomId = socketToRoom.get(socket.id);
    if (res.classChanged) {
      emitToAll(room, 'class_change', () => ({
        subject: res.nextSubject, index: g.currentClassIndex,
      }));
      setTimeout(() => triggerAiPhase(roomId), 2000);
    } else {
      triggerAiPhase(roomId);
    }
  });

  // ── 确认骰子 ──
  socket.on('confirm_dice', ({ indices, options = {} }) => {
    const room = getRoom(socket.id); if (!room) return;
    const g = room.game;

    if (g.turnPhase === TURN.ATK_ROLLED && getCurrentAttackerId(g) === socket.id) {
      const res = confirmAttack(g, indices);
      if (!res.ok) return;
      // YZX masking: hide defense rolls from attacker if defender is YZX
      const defIdx = g.turnData.defenderIdx;
      const isDefYZX = defIdx !== null && g.players[defIdx]?.cardId === 'char_10';
      emitToAll(room, 'atk_confirmed', (pid) => ({
        atkResult: res.atkResult,
        defenseRolls: (isDefYZX && g.players[defIdx]?.id !== pid) ? res.defenseRolls?.map(() => -1) : res.defenseRolls,
        state: getStateView(g, pid),
      }));
      triggerAiPhase(roomId);

    } else if (g.turnPhase === TURN.DEF_ROLLED) {
      if (g.turnData.isAoE) {
        if (!g.turnData.aoeDefenses[socket.id]) return;
      } else {
        if (getCurrentDefenderId(g) !== socket.id) return;
      }

      // Save defender info before confirmDefense modifies state
      const preDefIdx = g.turnData.defenderIdx;
      const preDefId = preDefIdx !== null ? g.players[preDefIdx]?.id : null;
      const preDefCardId = preDefIdx !== null ? g.players[preDefIdx]?.cardId : null;

      const res = confirmDefense(g, socket.id, indices, options);
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

      // YZX masking: hide defense stats from non-YZX players when defender is YZX
      emitToAll(room, 'turn_resolved', (pid) => {
        const data = { ...res, state: getStateView(g, pid) };
        if (preDefCardId === 'char_10' && pid !== preDefId && !res.gameOver) {
          data.baseDef = '??';
          data.finalDef = '??';
          data.damage = '??';
          data.penalty = '??';
        }
        return data;
      });
      const roomId = socketToRoom.get(socket.id);
      if (res.gameOver) {
        setTimeout(() => cleanupRoom(room), 30000);
      } else if (res.classChanged) {
        emitToAll(room, 'class_change', () => ({
          subject: res.nextSubject, index: g.currentClassIndex,
        }));
        setTimeout(() => triggerAiPhase(roomId), 2000);
      } else {
        triggerAiPhase(roomId);
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
  // ── 聊天系统 ──
  socket.on('chat_msg', ({ roomId, sender, msg }) => {
    if (!roomId) return;
    io.to(roomId).emit('chat_msg_receive', { sender, msg, time: new Date().toLocaleTimeString('en-US', { hour12: false }) });
  });

  socket.on('disconnect', () => {
    const idx = matchQueue.findIndex(q => q.socketId === socket.id);
    if (idx >= 0) matchQueue.splice(idx, 1);
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room && room.game && room.game.players) {
        if (room.isAI) {
          rooms.delete(roomId);
        } else {
          if (room.game.pending) {
            // Remove from list if game hasn't started
            room.game.players = room.game.players.filter(p => p.id !== socket.id);
            room.playerSockets = room.playerSockets.filter(sid => sid !== socket.id);
            if (room.playerSockets.length === 0) {
              rooms.delete(roomId);
            } else {
              io.to(roomId).emit('ffa_room_update', { players: room.game.players });
            }
          } else {
            // Battle started: Mark as dead
            const player = room.game.players.find(p => p.id === socket.id);
            if (player) {
              player.hp = 0;
              player.isDead = true;
              // Auto-confirm AoE defense if they are currently supposed to be rolling
              if (room.game.turnPhase === TURN.DEF_ROLLED && room.game.turnData?.isAoE) {
                const defState = room.game.turnData.aoeDefenses[socket.id];
                if (defState && !defState.confirmed) {
                  const res = confirmDefense(room.game, socket.id, defState.rolls.map((_, i) => i).slice(0, player.card.defSlots));
                  if (res.ok && !res.waitingForOthers) {
                    emitToAll(room, 'turn_resolved', (pid) => ({ ...res, state: getStateView(room.game, pid) }));
                  }
                }
              }
              emitToAll(room, 'opponent_disconnected', { disconnectedId: socket.id });
              emitStateToAll(room);
            }
          }
        }
      }
      socketToRoom.delete(socket.id);
    }
  });
});

// ── AI 阶段自动处理 ──
function triggerAiPhase(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.isAI || room.game.phase !== 'battle') return;
  const g = room.game;

  // 1. 等待攻击阶段 (掷骰)
  if (g.turnPhase === TURN.WAITING_ATK && getCurrentAttackerId(g) === room.aiId) {
    setTimeout(() => {
      if (g.phase !== 'battle' || g.turnPhase !== TURN.WAITING_ATK) return;
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
      // 掷骰完自动进入下个子阶段处理
      triggerAiPhase(roomId);
    }, 2200);
  }

  // 2. 已掷攻击骰阶段 (重投或确认)
  if (g.turnPhase === TURN.ATK_ROLLED && getCurrentAttackerId(g) === room.aiId) {
    setTimeout(() => {
      if (g.phase !== 'battle' || g.turnPhase !== TURN.ATK_ROLLED) return;
      const atk = g.players[g.turnData.attackerIdx];
      const rolls = g.turnData.attackRolls;

      // AI 决定是否重投 (如果点数太小则尝试)
      if (atk.rerolls > 0) {
        const badIndices = rolls.map((v, i) => v <= (atk.card.dicePool[i] / 2) ? i : -1).filter(i => i !== -1);
        if (badIndices.length > 0) {
          const res = rerollDice(g, atk.id, badIndices);
          if (res.ok) {
            emitStateToAll(room);
            triggerAiPhase(roomId); // 递归：重投完再次进入本阶段判断
            return;
          }
        }
      }

      // 不重投或重投完，则确认攻击
      const slots = atk.card.atkSlots === -1 ? rolls.length : atk.card.atkSlots;
      const indices = rolls.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, slots).map(x => x.i);
      const res = confirmAttack(g, indices);
      if (!res.ok) { console.error("AI confirmAttack failed", res, indices, atk.card); return; }
      emitToAll(room, 'atk_confirmed', (pid) => ({
        atkResult: res.atkResult, defenseRolls: res.defenseRolls,
        state: getStateView(g, pid),
      }));
      // 这里不需要 triggerAiPhase，因为确认后进入玩家防御
    }, 1500);
  }

  // 3. 已掷防御骰阶段 (重投或确认)
  if (g.turnPhase === TURN.DEF_ROLLED && getCurrentDefenderId(g) === room.aiId) {
    setTimeout(() => {
      if (g.phase !== 'battle' || g.turnPhase !== TURN.DEF_ROLLED) return;
      const def = g.players[g.turnData.defenderIdx];
      const rolls = g.turnData.defenseRolls;

      // 防御方也可以考虑重投
      if (def.rerolls > 0) {
        const badIndices = rolls.map((v, i) => v <= (def.card.dicePool[i] / 2) ? i : -1).filter(i => i !== -1);
        if (badIndices.length >= 2) { // 防御方比较保守
          const res = rerollDice(g, def.id, badIndices);
          if (res.ok) {
            emitStateToAll(room);
            triggerAiPhase(roomId); // 递归
            return;
          }
        }
      }

      // AI 选择最高的骰子
      let candidates = rolls.map((v, i) => ({ v, i, face: def.card.dicePool[i] })).sort((a, b) => b.v - a.v);

      let indices;
      if (def.card.negativeSkill?.id === SKILL.D10_LIMIT) {
        let chosenIndices = [];
        let d10Used = false;
        for (let c of candidates) {
          if (c.face === 10) {
            if (!d10Used) { chosenIndices.push(c.i); d10Used = true; }
          } else {
            chosenIndices.push(c.i);
          }
          if (chosenIndices.length === def.card.defSlots) break;
        }
        indices = chosenIndices;
      } else {
        indices = candidates.slice(0, def.card.defSlots).map(x => x.i);
      }

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
        setTimeout(() => cleanupRoom(room), 30000);
      } else if (res.classChanged) {
        emitToAll(room, 'class_change', () => ({ subject: res.nextSubject, index: g.currentClassIndex }));
        setTimeout(() => triggerAiPhase(roomId), 2500);
      } else {
        triggerAiPhase(roomId);
      }
    }, 1500);
  }
}

// ── 辅助 ──
function getRoom(sid) {
  const rid = socketToRoom.get(sid);
  return rid ? rooms.get(rid) : null;
}

function broadcastToOpponent(room, mySid, event, data = {}) {
  if (!room.game.players) return;
  for (const op of room.game.players) {
    if (op.id !== mySid && !op.id.startsWith('AI_')) {
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
    if (p.id.startsWith('AI_')) continue;
    const data = typeof buildData === 'function' ? buildData(p.id) : buildData;
    io.to(p.id).emit(event, data);
  }
}

function cleanupRoom(roomOrId) {
  const rid = typeof roomOrId === 'string' ? roomOrId : [...rooms.entries()].find(([k, v]) => v === roomOrId)?.[0];
  if (!rid) return;
  const room = rooms.get(rid);
  if (room && room.playerSockets) {
    for (const sid of room.playerSockets) {
      if (sid) socketToRoom.delete(sid);
    }
  }
  rooms.delete(rid);
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, "0.0.0.0", () => console.log(`🎲 校园战力党 → http://localhost:${PORT}`));
