import { createGame, eliminateDisconnectedPlayer, getStateView } from '../game/engine.js';

import { getRunView } from '../game/autobattler.js';

import { recordMatch } from '../statsManager.js';

import { registerDuelHandlers } from './handlers.js';
import { createAiController } from './ai-controller.js';
import { registerAutochessHandlers } from '../autochess/handlers.js';

export function registerGameServer(io) {
  const rooms = new Map();
  const matchQueue = [];
  const socketToRoom = new Map();
  const activeSockets = new Map();
  const acRuns = new Map(); // persistent playerId -> autochess run
  const reconnectGraceMs = Math.max(1000, Number(process.env.RECONNECT_GRACE_MS) || 60000);
  const finishedRoomRetentionMs = Math.max(30000, Number(process.env.FINISHED_ROOM_RETENTION_MS) || 300000);
  let roomCounter = 1000;
  function newRoomId() { return String(++roomCounter); }

  function hasActiveSession(playerId) {
    const run = acRuns.get(playerId);
    if (run && (run.phase === 'victory' || run.phase === 'defeat')) {
      acRuns.delete(playerId);
    }
    return socketToRoom.has(playerId) || acRuns.has(playerId);
  }

  const { triggerAiPhase, scheduleAiSelection } = createAiController({ scheduleFinishedRoomCleanup, emitImmediateTurnResolution, emitSkippedAttackResolution, emitTacticalGameOver, emitStateToAll, emitToAll, rooms, io });
  io.on('connection', socket => {
    registerDuelHandlers(socket, { newRoomId, hasActiveSession, triggerAiPhase, scheduleAiSelection, scheduleFinishedRoomCleanup, emitImmediateTurnResolution, emitSkippedAttackResolution, emitTacticalGameOver, surrenderGame, requestRoomRematch, leavePlayerRoom, getPersistentPlayerId, resumePlayerSession, schedulePlayerDisconnect, getRoom, broadcastToOpponent, emitStateToAll, emitToAll, rooms, matchQueue, socketToRoom, activeSockets, acRuns, io });
    registerAutochessHandlers(socket, { acRuns, hasActiveSession });
  });

  function scheduleFinishedRoomCleanup(room) {
    if (!room) return;
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    room.cleanupTimer = setTimeout(() => cleanupRoom(room), finishedRoomRetentionMs);
    room.cleanupTimer.unref?.();
  }

  function recordCompletedMatch(game) {
    if (game.gameMode !== '1v1' || game.winner === null || game.winner === 'draw') return;
    const winnerCardId = game.players[game.winner]?.cardId;
    const loserIdx = game.winner === 0 ? 1 : 0;
    const loserCardId = game.players[loserIdx]?.cardId;
    if (!winnerCardId || !loserCardId) return;
    const isPvE = game.players.some(player => player.id.startsWith('AI_'));
    recordMatch(winnerCardId, loserCardId, isPvE);
  }

  function emitImmediateTurnResolution(room, result) {
    const game = room.game;
    emitToAll(room, 'turn_resolved', pid => ({
      ...result,
      damage: result.damage ?? 0,
      selfDamage: result.selfDamage ?? 0,
      pierce: result.pierce ?? false,
      finalDef: result.finalDef ?? 0,
      penalty: result.penalty ?? 0,
      defNegTriggered: result.defNegTriggered ?? false,
      defNegName: result.defNegName ?? null,
      defPosTriggered: result.defPosTriggered ?? false,
      defPosName: result.defPosName ?? null,
      noobTriggered: result.noobTriggered ?? false,
      gameOver: result.gameOver ?? true,
      winner: result.winner ?? game.winner,
      deathCause: result.deathCause || 'self_damage',
      attackerIdx: result.attackerIdx ?? game.turnData.attackerIdx,
      state: getStateView(game, pid),
    }));
    if (result.gameOver ?? true) {
      recordCompletedMatch(game);
      scheduleFinishedRoomCleanup(room);
      return;
    }

    const roomId = [...rooms.entries()].find(([, candidate]) => candidate === room)?.[0];
    if (result.classChanged) {
      emitToAll(room, 'class_change', () => ({
        subject: result.nextSubject,
        index: game.currentClassIndex,
        day: result.currentDay || game.currentDay || 1,
        dayChanged: !!result.dayChanged,
      }));
      if (roomId) setTimeout(() => triggerAiPhase(roomId), 5000);
    } else if (roomId) {
      triggerAiPhase(roomId);
    }
  }

  function emitSkippedAttackResolution(room, result) {
    const game = room.game;
    emitToAll(room, 'turn_resolved', pid => ({
      damage: 0,
      selfDamage: 0,
      pierce: false,
      finalDef: 0,
      penalty: 0,
      skipped: true,
      gameOver: !!result.gameOver,
      winner: result.winner ?? game.winner,
      attackerIdx: result.attackerIdx,
      state: getStateView(game, pid),
    }));
    if (result.gameOver) {
      recordCompletedMatch(game);
      scheduleFinishedRoomCleanup(room);
      return;
    }

    const roomId = [...rooms.entries()].find(([, candidate]) => candidate === room)?.[0];
    if (result.classChanged) {
      emitToAll(room, 'class_change', () => ({
        subject: result.nextSubject,
        index: game.currentClassIndex,
        day: result.currentDay || game.currentDay || 1,
        dayChanged: !!result.dayChanged,
      }));
      if (roomId) setTimeout(() => triggerAiPhase(roomId), 5000);
    } else if (roomId) {
      triggerAiPhase(roomId);
    }
  }

  function emitTacticalGameOver(room, result) {
    if (!result.gameOver) return;
    recordCompletedMatch(room.game);
    emitToAll(room, 'game_over', pid => ({
      reason: result.deathCause || 'tactical_card',
      cardId: result.card?.id || result.cardId || null,
      state: getStateView(room.game, pid),
    }));
    scheduleFinishedRoomCleanup(room);
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
    const autochessRun = acRuns.get(playerId);
    if (autochessRun) {
      return {
        ok: true,
        roomId: `ac_${playerId}`,
        mode: 'autochess',
        run: getRunView(autochessRun),
      };
    }

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

    const result = eliminateDisconnectedPlayer(room.game, playerId);
    emitToAll(room, 'opponent_disconnected', { disconnectedId: playerId });
    if (result.ok && (result.gameOver || result.advanced)) {
      emitImmediateTurnResolution(room, result);
      return;
    }
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

}
