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
    this.lastResumeData = null;
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
      this.socket.timeout(5000).emit('resume_session', {}, (error, result) => {
        if (error || !result?.ok) return;
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
    this.socket.on('match_found', (data) => { this.currentRoomId = data.roomId; });
    this.socket.on('room_created', (data) => { this.currentRoomId = data.roomId; });
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
    if (this.lastResumeData) queueMicrotask(() => listener(this.lastResumeData));
    return () => this.sessionResumeListeners.delete(listener);
  }

  startPVE(n, aiCardId = null) { this.socket.emit('start_pve', { nickname: n, aiCardId }); }
  createRoom(n) { this.socket.emit('create_room', { nickname: n }); }
  joinRoom(n, r) { this.socket.emit('join_room', { nickname: n, roomId: r }); }
  joinMatchmaking(n) { this.socket.emit('join_matchmaking', { nickname: n }); }
  cancelMatchmaking() { this.socket.emit('cancel_matchmaking'); }

  createFfaRoom(n) { this.socket.emit('create_ffa_room', { nickname: n }); }
  joinFfaRoom(n, r) { this.socket.emit('join_ffa_room', { nickname: n, roomId: r }); }
  startFfaGame() { if(this.currentRoomId) this.socket.emit('start_ffa_game', { roomId: this.currentRoomId }); }

  selectTarget(id) { this.socket.emit('select_target', { targetId: id }); }
  selectCard(id) { this.socket.emit('select_card', { cardId: id }); }
  setReady() { this.socket.emit('ready'); }
  useReschedule(idx, subj) { this.socket.emit('use_reschedule', { classIndex: idx, newType: subj }); }

  rollDice() { this.socket.emit('roll_dice'); }
  rerollDice(indices) { this.socket.emit('reroll_dice', { indices }); }
  confirmDice(indices, options = {}) { this.socket.emit('confirm_dice', { indices, options }); }
  buyWater() { this.socket.emit('buy_water'); }
  chooseDreamTarget(idx) { this.socket.emit('choose_dream_target', { targetIndex: idx }); }

  playTacticalCard(id, acknowledge) { this.socket.emit('play_tactical_card', { cardId: id }, acknowledge); }
  refreshDraftSlot(idx) { this.socket.emit('refresh_draft_slot', { slotIndex: idx }); }
  buyDraftCard(idx, acknowledge) { this.socket.emit('buy_draft_card', { slotIndex: idx }, acknowledge); }
  confirmDraftReady() { this.socket.emit('draft_ready'); }
  surrender(acknowledge) { this.socket.emit('surrender', {}, acknowledge); }
  requestRematch(acknowledge) { this.socket.emit('request_rematch', {}, acknowledge); }
  leaveRoom(acknowledge) {
    this.socket.emit('leave_room', {}, (result) => {
      if (result?.ok) {
        this.currentRoomId = null;
        this.lastResumeData = null;
      }
      acknowledge?.(result);
    });
  }

  sendChat(n, msg) { if (this.currentRoomId) this.socket.emit('chat_msg', { roomId: this.currentRoomId, sender: n, msg }); }

  on(e, cb) { this.socket.on(e, cb); }
  off(e, cb) { this.socket.off(e, cb); }
  emit(e, data) { this.socket.emit(e, data); }

  removeAllGameListeners() {
    const events = [
      'match_found', 'room_created', 'matchmaking_waiting',
      'state_update', 'opponent_selected', 'opponent_ready',
      'battle_start', 'schedule_updated',
      'atk_confirmed', 'turn_resolved', 'class_change',
      'opponent_connection_lost', 'opponent_reconnected', 'opponent_disconnected',
      'game_over', 'rematch_status', 'rematch_started', 'opponent_left_room', 'room_closed',
      'error_msg', 'buy_water_result', 'tactical_card_played',
      // autochess events
      'ac_run_update', 'ac_combat_result', 'ac_event_options', 'ac_star_up',
      // chat_msg_receive is NOT removed here because the global chat widget handles it
    ];
    for (const e of events) this.socket.removeAllListeners(e);
  }
}

export const gameSocket = new GameSocket();
