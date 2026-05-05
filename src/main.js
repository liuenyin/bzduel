// ============================================================
// 校园战力党 — 主入口 (SPA 路由)
// ============================================================
import { gameSocket } from './net/socket.js';
import { renderLobby } from './pages/lobby.js';
import { renderPreparation } from './pages/preparation.js';
import { renderBattle } from './pages/battle.js';

const app = document.getElementById('app');
let currentCleanup = null;
let chatWidgetEl = null;
let chatMessagesEl = null;

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
  chatWidgetEl = document.createElement('div');
  chatWidgetEl.className = 'chat-widget collapsed';
  chatWidgetEl.style.display = 'none'; // 初始隐藏，进入房间后显示

  chatWidgetEl.innerHTML = `
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
  document.body.appendChild(chatWidgetEl);

  const header = document.getElementById('chat-header');
  chatMessagesEl = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-chat-send');

  // 展开/收起聊天框
  header.addEventListener('click', () => {
    chatWidgetEl.classList.toggle('collapsed');
    if (!chatWidgetEl.classList.contains('collapsed')) {
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
    chatMessagesEl.appendChild(msgEl);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  });
}

initGlobalChat();

export function showGlobalChat(message) {
  if (chatWidgetEl) {
    chatWidgetEl.style.display = 'flex';
    if (message) {
      chatMessagesEl.innerHTML = \`<div class="chat-msg system">\${message}</div>\`;
    }
  }
}
