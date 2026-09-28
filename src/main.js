import { gameSocket } from './net/socket.js';
import { navigate } from './app/router.js';
import { initGlobalChat, showGlobalChat } from './components/chat.js';

// Retain the entry-point API for existing integrations.
export { navigate, showGlobalChat };

initGlobalChat();
navigate('lobby');

gameSocket.onSessionResumed((data) => {
  gameSocket.currentRoomId = data.roomId;

  if (data.pending) {
    showGlobalChat('已重新连接到等待中的房间。');
    navigate('lobby', { resumedRoom: data });
    return;
  }

  if (data.mode === 'autochess' && data.run) {
    navigate('autochess', data);
    return;
  }

  if (!data.state) return;
  const targetPage = data.state.phase === 'preparation' ? 'preparation' : 'battle';
  showGlobalChat('已恢复原对局。');
  // Rebuild even on the same page: the resumed snapshot is authoritative.
  navigate(targetPage, data);
});
