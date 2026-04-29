import { io } from 'socket.io-client';

const url = 'http://localhost:3000';
const socket1 = io(url);
const socket2 = io(url);

socket1.on('connect', () => {
  console.log('Player 1 connected:', socket1.id);
  socket1.emit('join_matchmaking', { nickname: 'Player 1' });
});

socket2.on('connect', () => {
  console.log('Player 2 connected:', socket2.id);
  // Wait a bit to ensure P1 is in queue
  setTimeout(() => {
    socket2.emit('join_matchmaking', { nickname: 'Player 2' });
  }, 500);
});

socket1.on('match_found', (data) => console.log('P1 match_found'));
socket2.on('match_found', (data) => console.log('P2 match_found'));

socket1.on('disconnect', () => console.log('P1 disconnected'));
socket2.on('disconnect', () => console.log('P2 disconnected'));
