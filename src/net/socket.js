// ============================================================
// 校园战力党 — Socket.IO 客户端封装
// ============================================================
import { io } from 'socket.io-client';

class GameSocket {
  constructor() {
    this.socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: 10 });
    this.socket.on('connect', () => {
      console.log('[socket] connected', this.socket.id);
      this.socket.emit('request_state');
    });
    this.socket.on('disconnect', () => console.log('[socket] disconnected'));
  }

  startPVE(n) { this.socket.emit('start_pve', { nickname: n }); }
  createRoom(n) { this.socket.emit('create_room', { nickname: n }); }
  joinRoom(n, r) { this.socket.emit('join_room', { nickname: n, roomId: r }); }
  joinMatchmaking(n) { this.socket.emit('join_matchmaking', { nickname: n }); }
  cancelMatchmaking() { this.socket.emit('cancel_matchmaking'); }

  selectCard(id) { this.socket.emit('select_card', { cardId: id }); }
  setReady() { this.socket.emit('ready'); }
  useReschedule(idx, subj) { this.socket.emit('use_reschedule', { classIndex: idx, newType: subj }); }

  rollDice() { this.socket.emit('roll_dice'); }
  rerollDice(indices) { this.socket.emit('reroll_dice', { indices }); }
  confirmDice(indices, options = {}) { this.socket.emit('confirm_dice', { indices, options }); }

  on(e, cb) { this.socket.on(e, cb); }
  off(e, cb) { this.socket.off(e, cb); }

  removeAllGameListeners() {
    const events = [
      'match_found', 'room_created', 'matchmaking_waiting',
      'state_update', 'opponent_selected', 'opponent_ready',
      'battle_start', 'schedule_updated',
      'atk_confirmed', 'turn_resolved', 'class_change',
      'opponent_disconnected', 'error_msg',
    ];
    for (const e of events) this.socket.removeAllListeners(e);
  }
}

export const gameSocket = new GameSocket();
