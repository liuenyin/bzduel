import { gameSocket } from '../net/socket.js';
let chatWidgetEl;
let chatMessagesEl;
let unreadChatCount = 0;

export function initGlobalChat() {
  chatWidgetEl = document.createElement('div');
  chatWidgetEl.className = 'chat-widget collapsed';
  chatWidgetEl.style.display = 'none'; // 初始隐藏，进入房间后显示

  chatWidgetEl.innerHTML = `
    <button class="chat-header" id="chat-header" type="button" aria-expanded="false" aria-label="打开房间聊天">
      <span class="chat-title"><span class="chat-icon" aria-hidden="true">💬</span><span class="chat-label">房间聊天</span></span>
      <span class="chat-unread" id="chat-unread" hidden>0</span>
      <span class="chat-toggle-icon">▼</span>
    </button>
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
  const unreadBadge = document.getElementById('chat-unread');

  const updateUnreadBadge = () => {
    unreadBadge.textContent = unreadChatCount > 99 ? '99+' : String(unreadChatCount);
    unreadBadge.hidden = unreadChatCount === 0;
  };

  // 展开/收起聊天框
  header.addEventListener('click', () => {
    chatWidgetEl.classList.toggle('collapsed');
    const expanded = !chatWidgetEl.classList.contains('collapsed');
    header.setAttribute('aria-expanded', String(expanded));
    header.setAttribute('aria-label', expanded ? '收起房间聊天' : '打开房间聊天');
    if (expanded) {
      unreadChatCount = 0;
      updateUnreadBadge();
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
    const timeEl = document.createElement('span');
    timeEl.style.cssText = 'font-size:0.65rem; color:var(--text-muted)';
    timeEl.textContent = `[${time ?? ''}] `;
    const senderEl = document.createElement('span');
    senderEl.className = 'chat-msg-sender';
    if (isMe) senderEl.style.color = 'var(--green)';
    senderEl.textContent = `${sender ?? '匿名'}: `;
    const messageEl = document.createElement('span');
    messageEl.textContent = msg ?? '';
    msgEl.append(timeEl, senderEl, messageEl);
    chatMessagesEl.appendChild(msgEl);
    while (chatMessagesEl.childElementCount > 100) chatMessagesEl.firstElementChild.remove();
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    if (chatWidgetEl.classList.contains('collapsed')) {
      unreadChatCount++;
      updateUnreadBadge();
    }
  });
}

export function showGlobalChat(message) {
  if (chatWidgetEl) {
    chatWidgetEl.style.display = 'flex';
    chatWidgetEl.classList.add('collapsed');
    const header = chatWidgetEl.querySelector('.chat-header');
    header?.setAttribute('aria-expanded', 'false');
    header?.setAttribute('aria-label', '打开房间聊天');
    unreadChatCount = 0;
    const unreadBadge = chatWidgetEl.querySelector('#chat-unread');
    if (unreadBadge) {
      unreadBadge.textContent = '0';
      unreadBadge.hidden = true;
    }
    if (message) {
      const messageEl = document.createElement('div');
      messageEl.className = 'chat-msg system';
      messageEl.textContent = message;
      chatMessagesEl.replaceChildren(messageEl);
    }
  }
}

export function hideGlobalChat() {
  if (!chatWidgetEl) return;
  chatWidgetEl.style.display = 'none';
  chatWidgetEl.classList.add('collapsed');
  chatWidgetEl.querySelector('.chat-header')?.setAttribute('aria-expanded', 'false');
  unreadChatCount = 0;
  const unreadBadge = chatWidgetEl.querySelector('#chat-unread');
  if (unreadBadge) unreadBadge.hidden = true;
}
