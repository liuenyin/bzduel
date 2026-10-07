// ============================================================
// 校园战力党 — Socket.IO 客户端封装
// ============================================================
import { io } from 'socket.io-client';

const SESSION_STORAGE_KEY = 'dice_duel_player_session';

function createSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

function getPlayerSessionId() {
  try {
    const saved = globalThis.sessionStorage?.getItem(SESSION_STORAGE_KEY);
    if (saved) return saved;
    const created = createSessionId();
    globalThis.sessionStorage?.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return createSessionId();
  }
}

class GameSocket {
  constructor() {
    this.playerSessionId = getPlayerSessionId();
    this.sessionResumeListeners = new Set();
    this.connectionListeners = new Set();
    this.gameListeners = new Map();
    this.lastResumeData = null;
    this.sessionRevision = 0;
    this.hasConnected = false;
    this.socket = io({
      auth: { playerSessionId: this.playerSessionId },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.4,
      reconnectionAttempts: Infinity,
      timeout: 20000,
    });
    this.currentRoomId = null;
    this.socket.on('connect', () => {
      console.log('[socket] connected', this.socket.id);
      const reconnected = this.hasConnected;
      this.hasConnected = true;
      this.notifyConnectionListeners({ connected: true, reconnected });
      const revision = this.sessionRevision;
      this.socket.timeout(5000).emit('resume_session', {}, (error, result) => {
        if (error || !result?.ok || revision !== this.sessionRevision) return;
        this.currentRoomId = result.roomId;
        this.lastResumeData = result;
        for (const listener of this.sessionResumeListeners) listener(result);
      });
    });
    this.socket.on('disconnect', (reason) => {
      console.log('[socket] disconnected', reason);
      this.notifyConnectionListeners({ connected: false, reconnecting: true, reason });
    });
    this.socket.on('connect_error', (error) => {
      this.notifyConnectionListeners({ connected: false, reconnecting: true, reason: error.message });
    });
    const trackRoom = data => {
      this.sessionRevision++;
      this.lastResumeData = null;
      this.currentRoomId = data.roomId;
    };
    this.socket.on('match_found', trackRoom);
    this.socket.on('room_created', trackRoom);
  }

  notifyConnectionListeners(status) {
    for (const listener of this.connectionListeners) listener(status);
  }

  onConnectionStatus(listener) {
    this.connectionListeners.add(listener);
    listener({ connected: this.socket.connected, reconnecting: !this.socket.connected });
    return () => this.connectionListeners.delete(listener);
  }

  onSessionResumed(listener) {
    this.sessionResumeListeners.add(listener);
    const snapshot = this.lastResumeData;
    if (snapshot) queueMicrotask(() => {
      if (this.sessionResumeListeners.has(listener) && this.lastResumeData === snapshot) listener(snapshot);
    });
    return () => this.sessionResumeListeners.delete(listener);
  }

  emitWithAck(event, payload, acknowledge) {
    if (typeof acknowledge !== 'function') {
      this.socket.emit(event, payload);
      return;
    }
    this.socket.timeout(8000).emit(event, payload, (error, result) => {
      acknowledge(error
        ? { ok: false, error: '连接超时，请检查网络后重试' }
        : result);
    });
  }

  startPVE(n, aiCardId = null) { this.socket.emit('start_pve', { nickname: n, aiCardId }); }
  createRoom(n) { this.socket.emit('create_room', { nickname: n }); }
  joinRoom(n, r) { this.socket.emit('join_room', { nickname: n, roomId: r }); }
  joinMatchmaking(n) { this.socket.emit('join_matchmaking', { nickname: n }); }
  cancelMatchmaking(acknowledge) { this.emitWithAck('cancel_matchmaking', {}, acknowledge); }

  createFfaRoom(n) { this.socket.emit('create_ffa_room', { nickname: n }); }
  joinFfaRoom(n, r) { this.socket.emit('join_ffa_room', { nickname: n, roomId: r }); }
  startFfaGame(acknowledge) {
    if (!this.currentRoomId) {
      acknowledge?.({ ok: false, error: '房间不存在' });
      return;
    }
    this.emitWithAck('start_ffa_game', { roomId: this.currentRoomId }, acknowledge);
  }

  selectTarget(id, acknowledge) { this.emitWithAck('select_target', { targetId: id }, acknowledge); }
  selectCard(id, acknowledge) { this.emitWithAck('select_card', { cardId: id }, acknowledge); }
  setReady(acknowledge) { this.emitWithAck('ready', {}, acknowledge); }
  useReschedule(idx, subj, acknowledge) { this.emitWithAck('use_reschedule', { classIndex: idx, newType: subj }, acknowledge); }

  rollDice(acknowledge) { this.emitWithAck('roll_dice', {}, acknowledge); }
  rerollDice(indices, acknowledge) { this.emitWithAck('reroll_dice', { indices }, acknowledge); }
  confirmDice(indices, options = {}, acknowledge) {
    if (typeof options === 'function') { acknowledge = options; options = {}; }
    this.emitWithAck('confirm_dice', { indices, options }, acknowledge);
  }
  buyWater(acknowledge) { this.emitWithAck('buy_water', {}, acknowledge); }
  chooseDreamTarget(idx, acknowledge) { this.emitWithAck('choose_dream_target', { targetIndex: idx }, acknowledge); }

  playTacticalCard(id, options, acknowledge) {
    if (typeof options === 'function') { acknowledge = options; options = {}; }
    this.emitWithAck('play_tactical_card', { cardId: id, ...(options || {}) }, acknowledge);
  }
  refreshDraftSlot(idx, acknowledge) { this.emitWithAck('refresh_draft_slot', { slotIndex: idx }, acknowledge); }
  buyDraftCard(idx, acknowledge) { this.emitWithAck('buy_draft_card', { slotIndex: idx }, acknowledge); }
  confirmDraftReady(acknowledge) { this.emitWithAck('draft_ready', {}, acknowledge); }
  surrender(acknowledge) { this.emitWithAck('surrender', {}, acknowledge); }
  requestRematch(acknowledge) { this.emitWithAck('request_rematch', {}, acknowledge); }
  leaveRoom(acknowledge) {
    this.sessionRevision++;
    this.emitWithAck('leave_room', {}, (result) => {
      if (result?.ok) {
        this.currentRoomId = null;
        this.lastResumeData = null;
      }
      acknowledge?.(result);
    });
  }

  sendChat(n, msg) { if (this.currentRoomId) this.socket.emit('chat_msg', { roomId: this.currentRoomId, sender: n, msg }); }

  on(e, cb) {
    if (!this.gameListeners.has(e)) this.gameListeners.set(e, new Set());
    this.gameListeners.get(e).add(cb);
    this.socket.on(e, cb);
    return () => this.off(e, cb);
  }
  off(e, cb) {
    this.socket.off(e, cb);
    this.gameListeners.get(e)?.delete(cb);
  }
  emit(e, data) { this.socket.emit(e, data); }

  removeAllGameListeners() {
    for (const [event, listeners] of this.gameListeners) {
      if (event === 'chat_msg_receive') continue;
      for (const listener of listeners) this.socket.off(event, listener);
      this.gameListeners.delete(event);
    }
  }
}

export const gameSocket = new GameSocket();
