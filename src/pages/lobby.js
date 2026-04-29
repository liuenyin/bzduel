// ============================================================
// 校园战力党 — 大厅页面
// ============================================================
import { gameSocket } from '../net/socket.js';
import { navigate } from '../main.js';

export function renderLobby(container) {
  container.innerHTML = `
    <div class="lobby">
      <h1 class="title-main">校园战力党</h1>
      <p class="title-sub">和同学来一局骰子对决</p>

      <div class="panel">
        <input id="nickname-input" type="text" placeholder="你的昵称" maxlength="12" />
        
        <div class="btn-group">
          <button id="btn-pve" class="btn btn-primary btn-lg">单人对战</button>
          <button id="btn-match" class="btn btn-success btn-lg">随机匹配</button>
        </div>

        <hr style="border:none; border-top:1px solid var(--bg-inset); margin:12px 0;" />

        <div class="btn-group">
          <button id="btn-create" class="btn btn-secondary">创建房间</button>
          <div class="room-row">
            <input id="room-input" type="text" placeholder="房间号" maxlength="8" />
            <button id="btn-join" class="btn btn-secondary">加入</button>
          </div>
        </div>
      </div>

      <div id="status" style="min-height:36px; margin-top:12px;"></div>
    </div>
  `;

  const nicknameInput = document.getElementById('nickname-input');
  const statusDiv = document.getElementById('status');

  const saved = localStorage.getItem('dice_duel_nickname');
  if (saved) nicknameInput.value = saved;

  function getNick() {
    const n = nicknameInput.value.trim();
    if (!n) {
      statusDiv.innerHTML = '<p style="color:var(--red);">请先输入昵称</p>';
      nicknameInput.focus();
      return null;
    }
    localStorage.setItem('dice_duel_nickname', n);
    return n;
  }

  document.getElementById('btn-pve').addEventListener('click', () => {
    const n = getNick(); if (!n) return;
    gameSocket.startPVE(n);
  });

  document.getElementById('btn-match').addEventListener('click', () => {
    const n = getNick(); if (!n) return;
    gameSocket.joinMatchmaking(n);
    statusDiv.innerHTML = '<p class="status-msg">等待对手中…</p>';
  });

  document.getElementById('btn-create').addEventListener('click', () => {
    const n = getNick(); if (!n) return;
    gameSocket.createRoom(n);
    statusDiv.innerHTML = '<p class="status-msg">创建房间中…</p>';
  });

  document.getElementById('btn-join').addEventListener('click', () => {
    const n = getNick(); if (!n) return;
    const roomId = document.getElementById('room-input').value.trim();
    if (!roomId) {
      statusDiv.innerHTML = '<p style="color:var(--red);">请输入房间号</p>';
      return;
    }
    gameSocket.joinRoom(n, roomId);
  });

  // ── 服务端事件 ──
  gameSocket.on('room_created', ({ roomId }) => {
    statusDiv.innerHTML = `
      <div class="panel" style="text-align:center; padding:16px;">
        <p style="color:var(--text-secondary);">房间已创建，将房间号发给好友：</p>
        <p style="font-family:var(--font-display); font-size:2rem; font-weight:900; color:var(--accent); margin:8px 0;">${roomId}</p>
        <p class="status-msg">等待好友加入…</p>
      </div>
    `;
  });

  gameSocket.on('matchmaking_waiting', () => {
    statusDiv.innerHTML = '<p class="status-msg">等待对手中…</p>';
  });

  gameSocket.on('match_found', (data) => {
    navigate('preparation', data);
  });

  gameSocket.on('error_msg', ({ message }) => {
    statusDiv.innerHTML = `<p style="color:var(--red);">✗ ${message}</p>`;
  });

  return () => {};
}
