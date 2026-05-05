// ============================================================
// 校园战力党 — Socket.IO 客户端封装
// ============================================================
import { io } from 'socket.io-client';

class GameSocket {
  constructor() {
    this.socket = io({ reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 5000, reconnectionAttempts: Infinity, timeout: 20000 });
    this.currentRoomId = null;
    this.socket.on('connect', () => {
      console.log('[socket] connected', this.socket.id);
      this.socket.emit('request_state');
    });
    this.socket.on('disconnect', () => console.log('[socket] disconnected'));
    this.socket.on('match_found', (data) => { this.currentRoomId = data.roomId; });
    this.socket.on('room_created', (data) => { this.currentRoomId = data.roomId; });
  }

  startPVE(n) { this.socket.emit('start_pve', { nickname: n }); }
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

  sendChat(n, msg) { if (this.currentRoomId) this.socket.emit('chat_msg', { roomId: this.currentRoomId, sender: n, msg }); }

  on(e, cb) { this.socket.on(e, cb); }
  off(e, cb) { this.socket.off(e, cb); }

  removeAllGameListeners() {
    const events = [
      'match_found', 'room_created', 'matchmaking_waiting',
      'state_update', 'opponent_selected', 'opponent_ready',
      'battle_start', 'schedule_updated',
      'atk_confirmed', 'turn_resolved', 'class_change',
      'opponent_disconnected', 'error_msg',
      // chat_msg_receive is NOT removed here because the global chat widget handles it
    ];
    for (const e of events) this.socket.removeAllListeners(e);
  }
}

export const gameSocket = new GameSocket();
