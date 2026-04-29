// ============================================================
// 校园战力党 — 主入口 (SPA 路由)
// ============================================================
import { gameSocket } from './net/socket.js';
import { renderLobby } from './pages/lobby.js';
import { renderPreparation } from './pages/preparation.js';
import { renderBattle } from './pages/battle.js';

const app = document.getElementById('app');
let currentCleanup = null;

/**
 * 切换页面
 * @param {'lobby' | 'preparation' | 'battle'} page
 * @param {object} data  传递给页面的数据
 */
export function navigate(page, data = {}) {
  // 清理旧页面
  if (currentCleanup) currentCleanup();
  gameSocket.removeAllGameListeners();
  app.innerHTML = '';

  switch (page) {
    case 'lobby':
      currentCleanup = renderLobby(app, data);
      break;
    case 'preparation':
      currentCleanup = renderPreparation(app, data);
      break;
    case 'battle':
      currentCleanup = renderBattle(app, data);
      break;
    default:
      currentCleanup = renderLobby(app, data);
  }
}

// 初始进入大厅
navigate('lobby');
