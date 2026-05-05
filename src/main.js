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

// ============================================================
// 全局聊天系统
// ============================================================
function initGlobalChat() {
  const chatWidget = document.createElement('div');
  chatWidget.className = 'chat-widget collapsed';
  chatWidget.style.display = 'none'; // 初始隐藏，进入房间后显示

  chatWidget.innerHTML = `
    <div class="chat-header" id="chat-header">
      <span>💬 房间聊天</span>
      <span class="chat-toggle-icon">▼</span>
    </div>
    <div class="chat-messages" id="chat-messages">
      <div class="chat-msg system">加入房间即可开始聊天</div>
    </div>
    <div class="chat-input-area">
      <input type="text" id="chat-input" placeholder="输入你想说的话..." maxlength="50" autocomplete="off" />
      <button class="btn btn-primary" id="btn-chat-send">发送</button>
    </div>
  `;
  document.body.appendChild(chatWidget);

  const header = document.getElementById('chat-header');
  const messagesDiv = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-chat-send');

  // 展开/收起聊天框
  header.addEventListener('click', () => {
    chatWidget.classList.toggle('collapsed');
    if (!chatWidget.classList.contains('collapsed')) {
      input.focus();
    }
  });

  // 发送消息逻辑
  const sendMessage = () => {
    const text = input.value.trim();
    if (!text) return;
    const nickname = localStorage.getItem('dice_duel_nickname') || '匿名';
    gameSocket.sendChat(nickname, text);
    input.value = '';
  };

  btnSend.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // 接收消息
  gameSocket.on('chat_msg_receive', ({ sender, msg, time }) => {
    const isMe = sender === (localStorage.getItem('dice_duel_nickname') || '匿名');
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';
    msgEl.innerHTML = `
      <span style="font-size:0.65rem; color:var(--text-muted)">[${time}]</span> 
      <span class="chat-msg-sender" style="${isMe ? 'color:var(--green)' : ''}">${sender}:</span> 
      <span>${msg}</span>
    `;
    messagesDiv.appendChild(msgEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  });

  // 当进入房间时显示聊天框
  gameSocket.on('match_found', () => {
    chatWidget.style.display = 'flex';
    messagesDiv.innerHTML = '<div class="chat-msg system">已连接到房间</div>';
  });
  gameSocket.on('room_created', () => {
    chatWidget.style.display = 'flex';
    messagesDiv.innerHTML = '<div class="chat-msg system">房间已创建，等待对手...</div>';
  });
}

initGlobalChat();
