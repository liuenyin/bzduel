import { createGame, selectCard, setReady, useReschedule, rollAttack, rerollDice, confirmAttack, confirmDefense, selectTarget, buyWater, chooseDreamTarget, playTacticalCard, refreshDraftSlot, buyDraftCard, confirmDraftReady, getCurrentAttackerId, getCurrentDefenderId, getStateView, getAttackConfirmationView, TURN } from '../game/engine.js';
import { aiSelectCard } from '../game/ai.js';
import { characterMap } from '../../shared/characters.js';
import { getRunView } from '../game/autobattler.js';

import { recordMatch } from '../statsManager.js';

import { payloadObject, normalizeNickname, validRoomId, rejectInvalidNickname } from '../validation.js';

const ACTION_ERROR_LABELS = {
  invalid_phase: '当前不在可操作阶段',
  invalid_schedule: '课程安排无效',
  ffa_only: '该角色仅限大乱斗模式',
  player_not_found: '玩家不存在',
  player_defeated: '已淘汰，无法操作',
  already_ready: '你已经完成选牌',
  already_chosen: '目标已被其他玩家选择',
  invalid_index: '目标编号无效',
};

function readableActionError(error, fallback) {
  return ACTION_ERROR_LABELS[error] || error || fallback;
}

export function registerDuelHandlers(socket, {
  newRoomId, hasActiveSession, triggerAiPhase, scheduleAiSelection, scheduleFinishedRoomCleanup, emitImmediateTurnResolution, emitSkippedAttackResolution, emitTacticalGameOver, surrenderGame, requestRoomRematch, leavePlayerRoom, getPersistentPlayerId, resumePlayerSession, schedulePlayerDisconnect, getRoom, broadcastToOpponent, emitStateToAll, emitToAll, rooms, matchQueue, socketToRoom, activeSockets, acRuns, io
}) {
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
  socket.on('start_pve', (payload = {}, acknowledge) => {
    const { nickname: rawNickname, aiCardId = null } = payloadObject(payload);
    const nickname = normalizeNickname(rawNickname);
    if (!nickname) return rejectInvalidNickname(socket, acknowledge);
    if (hasActiveSession(playerId)) {
      const error = '你已经在其他对局中';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
      return;
    }
    const requestedAiCard = typeof aiCardId === 'string' ? characterMap[aiCardId] : null;
    if (aiCardId && (!requestedAiCard || requestedAiCard.ffaOnly)) {
      const error = '无法使用该角色作为人机对手';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
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
    acknowledge?.({ ok: true, roomId });
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
  socket.on('create_room', (payload = {}, acknowledge) => {
    const nickname = normalizeNickname(payloadObject(payload).nickname);
    if (!nickname) return rejectInvalidNickname(socket, acknowledge);
    if (hasActiveSession(playerId)) {
      const error = '你已经在其他对局中';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
      return;
    }
    const roomId = newRoomId();
    rooms.set(roomId, {
      game: { pending: true, creatorId: playerId, creatorName: nickname, mode: '1v1' },
      playerSockets: [playerId, null], isAI: false,
    });
    socketToRoom.set(playerId, roomId);
    socket.join(roomId);
    acknowledge?.({ ok: true, roomId });
    socket.emit('room_created', { roomId, mode: '1v1' });
  });

  // ── 加入房间 ──
  socket.on('join_room', (payload = {}, acknowledge) => {
    const { roomId } = payloadObject(payload);
    const nickname = normalizeNickname(payloadObject(payload).nickname);
    if (!nickname) return rejectInvalidNickname(socket, acknowledge);
    if (!validRoomId(roomId)) {
      const error = '房间号无效';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
      return;
    }
    if (hasActiveSession(playerId)) {
      const error = '你已经在其他对局中';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
      return;
    }
    const room = rooms.get(roomId);
    if (!room || !room.game.pending || room.game.mode !== '1v1') {
      const error = '房间不存在或已开始';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
      return;
    }
    const game = createGame([
      { id: room.game.creatorId, nickname: room.game.creatorName },
      { id: playerId, nickname }
    ]);
    room.game = game; room.playerSockets[1] = playerId;
    socketToRoom.set(playerId, roomId);
    socket.join(roomId);
    acknowledge?.({ ok: true, roomId });
    for (const pid of [game.players[0].id, game.players[1].id]) {
      io.to(pid).emit('match_found', {
        roomId, opponent: game.players.find(p => p.id !== pid).nickname,
        schedule: game.schedule, state: getStateView(game, pid),
      });
    }
  });

  // ── 匹配 ──
  socket.on('join_matchmaking', (payload = {}, acknowledge) => {
    const nickname = normalizeNickname(payloadObject(payload).nickname);
    if (!nickname) return rejectInvalidNickname(socket, acknowledge);
    if (hasActiveSession(playerId)) {
      const error = '你已经在其他对局中';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
      return;
    }
    if (matchQueue.length > 0) {
      const idx = matchQueue.findIndex(p => p.playerId !== playerId);
      if (idx === -1) {
        if (!matchQueue.some(p => p.playerId === playerId)) {
          matchQueue.push({ playerId, nickname });
        }
        acknowledge?.({ ok: true, waiting: true });
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
      acknowledge?.({ ok: true, roomId, matched: true });
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
      acknowledge?.({ ok: true, waiting: true });
      socket.emit('matchmaking_waiting');
    }
  });

  socket.on('cancel_matchmaking', (_payload = {}, acknowledge) => {
    if (socketToRoom.has(playerId)) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: '已进入房间，请在房间内离开' });
      return;
    }
    const idx = matchQueue.findIndex(p => p.playerId === playerId);
    if (idx !== -1) matchQueue.splice(idx, 1);
    if (typeof acknowledge === 'function') acknowledge({ ok: true });
  });

  // ── FFA 大乱斗房间 ──
  socket.on('create_ffa_room', (payload = {}, acknowledge) => {
    const nickname = normalizeNickname(payloadObject(payload).nickname);
    if (!nickname) return rejectInvalidNickname(socket, acknowledge);
    if (hasActiveSession(playerId)) {
      const error = '你已经在其他对局中';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
      return;
    }
    const roomId = newRoomId();
    rooms.set(roomId, {
      game: { pending: true, mode: 'sanguosha', players: [{ id: playerId, nickname }] },
      playerSockets: [playerId], isAI: false,
    });
    socketToRoom.set(playerId, roomId);
    socket.join(roomId);
    acknowledge?.({ ok: true, roomId });
    socket.emit('room_created', { roomId, mode: 'sanguosha' });
    io.to(roomId).emit('ffa_room_update', { players: [{ id: playerId, nickname }] });
  });

  socket.on('join_ffa_room', (payload = {}, acknowledge) => {
    const { roomId } = payloadObject(payload);
    const nickname = normalizeNickname(payloadObject(payload).nickname);
    if (!nickname) return rejectInvalidNickname(socket, acknowledge);
    if (!validRoomId(roomId)) {
      const error = '房间号无效';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
      return;
    }
    if (hasActiveSession(playerId)) {
      const error = '你已经在其他对局中';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
      return;
    }
    const room = rooms.get(roomId);
    if (!room || !room.game.pending || room.game.mode !== 'sanguosha') {
      const error = '房间不存在或已开始';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
      return;
    }
    if (room.game.players.length >= 8) {
      const error = '房间已满 (最多8人)';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
      return;
    }
    if (room.game.players.some(player => player.id === playerId)) {
      const error = '你已经在该房间';
      socket.emit('error_msg', { message: error });
      acknowledge?.({ ok: false, error });
      return;
    }
    room.game.players.push({ id: playerId, nickname });
    room.playerSockets.push(playerId);
    socketToRoom.set(playerId, roomId);
    socket.join(roomId);
    acknowledge?.({ ok: true, roomId });

    // 通知所有人更新房间玩家列表
    io.to(roomId).emit('ffa_room_update', { players: room.game.players });
  });

  socket.on('start_ffa_game', (payload = {}, acknowledge) => {
    const roomId = payloadObject(payload).roomId;
    const room = rooms.get(roomId);
    const reply = result => { if (typeof acknowledge === 'function') acknowledge(result); };
    if (!room || !room.game.pending || room.game.mode !== 'sanguosha') {
      reply({ ok: false, error: '房间不存在或已开始' });
      return;
    }
    if (socketToRoom.get(playerId) !== roomId) {
      reply({ ok: false, error: '你不在该房间' });
      return;
    }
    // 只有房主可以开始
    if (room.game.players[0].id !== playerId) {
      reply({ ok: false, error: '只有房主可以开始游戏' });
      return;
    }
    if (room.game.players.length < 3) {
      const error = '大乱斗至少需要 3 名玩家';
      if (typeof acknowledge !== 'function') socket.emit('error_msg', { message: error });
      reply({ ok: false, error });
      return;
    }

    const game = createGame(room.game.players, 'sanguosha');
    room.game = game;
    reply({ ok: true });

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
  socket.on('select_target', (payload = {}, acknowledge) => {
    const targetId = payloadObject(payload).targetId;
    const room = getRoom(playerId);
    if (!room) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: '对局不存在' });
      return;
    }
    const result = selectTarget(room.game, playerId, targetId);
    if (!result.ok) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: result.error || '无法选择目标' });
      else socket.emit('error_msg', { message: result.error || '无法选择目标' });
      return;
    }
    if (typeof acknowledge === 'function') acknowledge({ ok: true });
    {
      room.playerSockets.forEach(pid => {
        io.to(pid).emit('state_update', getStateView(room.game, pid));
      });
    }
  });

  socket.on('choose_dream_target', (payload = {}, acknowledge) => {
    const targetIndex = payloadObject(payload).targetIndex;
    const room = getRoom(playerId);
    if (!room) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: '对局不存在' });
      return;
    }
    const res = chooseDreamTarget(room.game, playerId, targetIndex);
    if (res.ok) {
      if (typeof acknowledge === 'function') acknowledge({ ok: true, isReal: res.isReal });
      emitStateToAll(room);
    } else if (typeof acknowledge === 'function') {
      acknowledge({ ok: false, error: readableActionError(res.error, '当前无法选择梦境目标') });
    } else {
      socket.emit('error_msg', { message: readableActionError(res.error, '当前无法选择梦境目标') });
    }
  });

  socket.on('select_card', (payload = {}, acknowledge) => {
    const cardId = payloadObject(payload).cardId;
    const room = getRoom(playerId);
    if (!room) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: '对局不存在' });
      return;
    }
    const result = selectCard(room.game, playerId, cardId);
    if (!result.ok) {
      const error = readableActionError(result.error, '无法选择角色');
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error });
      else socket.emit('error_msg', { message: error });
      return;
    }
    if (typeof acknowledge === 'function') acknowledge({ ok: true });
    {
      socket.emit('state_update', getStateView(room.game, playerId));
      broadcastToOpponent(room, playerId, 'opponent_selected');
    }
  });

  // ── 准备 ──
  socket.on('ready', (_payload = {}, acknowledge) => {
    const reply = result => { if (typeof acknowledge === 'function') acknowledge(result); };
    const room = getRoom(playerId);
    if (!room) { reply({ ok: false, error: '对局不存在' }); return; }
    const res = setReady(room.game, playerId);
    if (!res.ok) {
      const error = readableActionError(res.error, '暂时无法准备');
      if (typeof acknowledge !== 'function') socket.emit('error_msg', { message: error });
      reply({ ok: false, error });
      return;
    }
    if (room.isAI && !res.battleStarted) {
      const aiCardId = room.game.players[1].cardId || room.aiCardId || aiSelectCard(room.game.schedule);
      if (!room.game.players[1].cardId) selectCard(room.game, room.aiId, aiCardId);
      const aiRes = setReady(room.game, room.aiId);
      if (aiRes.battleStarted) res.battleStarted = true;
      console.log(`[PVE] AI ${room.aiId} 准备完毕, 战斗开始: ${res.battleStarted}`);
    }
    reply({ ok: true, battleStarted: !!res.battleStarted });
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
  socket.on('use_reschedule', (payload = {}, acknowledge) => {
    const { classIndex, newType } = payloadObject(payload);
    const room = getRoom(playerId);
    if (!room) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: '对局不存在' });
      return;
    }
    const result = useReschedule(room.game, playerId, classIndex, newType);
    if (!result.ok) {
      const error = readableActionError(result.error, '暂时无法调课');
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error });
      else socket.emit('error_msg', { message: error });
      return;
    }
    if (typeof acknowledge === 'function') acknowledge({ ok: true });
    {
      emitStateToAll(room);
    }
  });

  // ── 掷攻击骰 ──
  socket.on('roll_dice', (_payload = {}, acknowledge) => {
    const reply = result => { if (typeof acknowledge === 'function') acknowledge(result); };
    const room = getRoom(playerId);
    if (!room) { reply({ ok: false, error: '对局不存在' }); return; }
    const g = room.game;
    if (getCurrentAttackerId(g) !== playerId) {
      reply({ ok: false, error: '当前不是你的攻击回合' });
      return;
    }
    const res = rollAttack(g);
    if (!res.ok) {
      if (res.error === 'dream_target_required' && typeof acknowledge !== 'function') {
        socket.emit('error_msg', { message: '梦境盲选尚未完成，请等待对手选择目标。' });
      }
      reply({ ok: false, error: res.error || '暂时无法掷骰' });
      return;
    }
    reply({ ok: true });
    emitStateToAll(room);
    if (res.skipped) {
      emitSkippedAttackResolution(room, res);
    } else if (res.selfKill) {
      emitImmediateTurnResolution(room, res);
    }
  });

  // ── 重投骰子 ──
  socket.on('reroll_dice', (payload = {}, acknowledge) => {
    const reply = result => { if (typeof acknowledge === 'function') acknowledge(result); };
    const indices = payloadObject(payload).indices;
    const room = getRoom(playerId);
    if (!room) { reply({ ok: false, error: '对局不存在' }); return; }
    const res = rerollDice(room.game, playerId, indices);
    if (!res.ok) {
      reply({ ok: false, error: res.error || '暂时无法重投' });
      return;
    }
    reply({ ok: true });
    emitStateToAll(room);
    if (res.selfKill) emitImmediateTurnResolution(room, res);
  });

  // ── 周煊声: 买水 (跳过攻击，蓄势) ──
  socket.on('buy_water', (_payload = {}, acknowledge) => {
    const reply = result => { if (typeof acknowledge === 'function') acknowledge(result); };
    const room = getRoom(playerId);
    if (!room) { reply({ ok: false, error: '对局不存在' }); return; }
    const g = room.game;
    const res = buyWater(g, playerId);
    if (!res.ok) {
      const message = res.error === 'already_rerolled'
        ? '已经重投过了，无法买水！'
        : res.error === 'max_charges'
          ? '蓄势已满（最多2层）！'
          : (res.error || '暂时无法买水');
      if (typeof acknowledge !== 'function') socket.emit('error_msg', { message });
      reply({ ok: false, error: message });
      return;
    }
    reply({ ok: true });
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
  socket.on('confirm_dice', (payload = {}, acknowledge) => {
    const reply = result => { if (typeof acknowledge === 'function') acknowledge(result); };
    const { indices, options = {} } = payloadObject(payload);
    const roomId = socketToRoom.get(playerId);
    const room = getRoom(playerId);
    if (!room) { reply({ ok: false, error: '对局不存在' }); return; }
    const g = room.game;

    if (g.turnPhase === TURN.ATK_ROLLED && getCurrentAttackerId(g) === playerId) {
      const res = confirmAttack(g, indices);
      if (!res.ok) {
        reply({ ok: false, error: res.error || '无效的攻击选骰' });
        return;
      }
      if (res.selfKill) {
        reply({ ok: true });
        emitImmediateTurnResolution(room, res);
        return;
      }
      reply({ ok: true });
      emitToAll(room, 'atk_confirmed', (pid) => getAttackConfirmationView(g, pid));
      triggerAiPhase(roomId);

    } else if (g.turnPhase === TURN.DEF_ROLLED) {
      if (g.turnData.isAoE) {
        if (!g.turnData.aoeDefenses[playerId]) {
          reply({ ok: false, error: '当前不是你的防守回合' });
          return;
        }
      } else {
        if (getCurrentDefenderId(g) !== playerId) {
          reply({ ok: false, error: '当前不是你的防守回合' });
          return;
        }
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
        if (typeof acknowledge !== 'function') {
          if (res.error === 'zww_d10_limit') {
            socket.emit('error_msg', { message: '曾无畏的限制：防御时最多只能选中一个 D10 骰子！' });
          } else {
            socket.emit('error_msg', { message: '无效的选骰' });
          }
        }
        reply({ ok: false, error: res.error || '无效的防守选骰' });
        return;
      }

      if (res.waitingForOthers) {
        reply({ ok: true, waitingForOthers: true });
        emitStateToAll(room);
        return;
      }

      reply({ ok: true });

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
    } else {
      reply({ ok: false, error: '当前无法确认骰子' });
    }
  });

  // ── 请求状态 (断线重连) ──
  socket.on('request_state', () => {
    const room = getRoom(playerId);
    if (room && room.game.players) {
      socket.emit('state_update', getStateView(room.game, playerId));
      return;
    }
    const run = acRuns.get(playerId);
    if (run) {
      socket.emit('ac_run_update', getRunView(run));
    }
  });

  socket.on('resume_session', (_payload = {}, acknowledge) => {
    const result = resumePlayerSession(socket, playerId);
    if (typeof acknowledge === 'function') acknowledge(result);
    if (result.ok && result.state) socket.emit('state_update', result.state);
  });

  // ── 战术卡与商店 ──
  socket.on('play_tactical_card', (payload = {}, acknowledge) => {
    const { cardId, ...options } = payloadObject(payload);
    const room = getRoom(playerId);
    if (!room || !room.game) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: '对局不存在' });
      return;
    }
    const res = playTacticalCard(room.game, playerId, cardId, options);
    if (!res.ok) {
      const error = res.error || '无法打出此战术卡';
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error });
      else socket.emit('error_msg', { message: error });
      return;
    }
    if (typeof acknowledge === 'function') acknowledge({ ok: true, card: res.card });
    emitToAll(room, 'tactical_card_played', { playerId, card: res.card });
    emitStateToAll(room);
    if (res.gameOver) {
      emitTacticalGameOver(room, res);
      return;
    }
    if (res.defeatedIds?.length) {
      emitImmediateTurnResolution(room, res);
      return;
    }
    const roomId = socketToRoom.get(playerId);
    if (roomId) triggerAiPhase(roomId);
  });

  socket.on('refresh_draft_slot', (payload = {}, acknowledge) => {
    const slotIndex = payloadObject(payload).slotIndex;
    const room = getRoom(playerId);
    if (!room || !room.game) {
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error: '对局不存在' });
      return;
    }
    const res = refreshDraftSlot(room.game, playerId, slotIndex);
    if (!res.ok) {
      const error = readableActionError(res.error, '无法刷新');
      if (typeof acknowledge === 'function') acknowledge({ ok: false, error });
      else socket.emit('error_msg', { message: error });
      return;
    }
    if (typeof acknowledge === 'function') acknowledge({ ok: true });
    emitStateToAll(room);
  });

  socket.on('buy_draft_card', (payload = {}, acknowledge) => {
    const slotIndex = payloadObject(payload).slotIndex;
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

  socket.on('draft_ready', (_payload = {}, acknowledge) => {
    const room = getRoom(playerId);
    const reply = result => { if (typeof acknowledge === 'function') acknowledge(result); };
    if (!room || !room.game) {
      reply({ ok: false, error: '对局不存在' });
      return;
    }
    const result = confirmDraftReady(room.game, playerId);
    if (!result.ok) {
      const error = readableActionError(result.error, '无法完成选牌');
      if (typeof acknowledge !== 'function') socket.emit('error_msg', { message: error });
      reply({ ok: false, error });
      return;
    }
    reply({ ok: true, allReady: !!result.allReady });
    emitStateToAll(room);
    const roomId = socketToRoom.get(playerId);
    if (result.allReady && roomId) triggerAiPhase(roomId);
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
  socket.on('chat_msg', (payload = {}) => {
    const roomId = socketToRoom.get(playerId);
    const room = roomId ? rooms.get(roomId) : null;
    const msg = payloadObject(payload).msg;
    if (!room || typeof msg !== 'string') return;

    const text = msg.trim().slice(0, 200);
    if (!text) return;
    const sender = room.game?.players?.find(player => player.id === playerId)?.nickname
      || room.game?.creatorName
      || '匿名玩家';
    const recipients = new Set(room.playerSockets || room.game?.players?.map(player => player.id) || []);
    for (const recipientId of recipients) {
      if (recipientId && !recipientId.startsWith('AI_')) {
        io.to(recipientId).emit('chat_msg_receive', {
          sender,
          msg: text,
          time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        });
      }
    }
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
}
