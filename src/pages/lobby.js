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

      <div class="lobby-info-grid">
        <div class="info-card tutorial">
          <h2 class="info-title">🎓 新手入门教程</h2>
          <div class="tutorial-steps">
            <div class="step">
              <span class="step-num">1</span>
              <p><strong>查看课表：</strong> 每局有6节课，不同课程对不同角色有 **×2** 或 **×0.5** 的技能倍率加成。</p>
            </div>
            <div class="step">
              <span class="step-num">2</span>
              <p><strong>调课时机：</strong> 点击战斗界面右上角图标可“调课”，把接下来的弱势课程换成强势科目。</p>
            </div>
            <div class="step">
              <span class="step-num">3</span>
              <p><strong>掷骰攻防：</strong> 攻击时选高点数求稳，防御时博高点数减伤。点数之差即为对方扣除的HP。</p>
            </div>
            <div class="step">
              <span class="step-num">4</span>
              <p><strong>技能爆发：</strong> 注意角色的正负面技能。例如：[记号]在不重投时变强，[红温]在攻击后会灼烧对方。</p>
            </div>
          </div>
        </div>
        
        <div class="info-card">
          <h2 class="info-title">🛠️ 更新日志 (v1.2)</h2>
          <div class="changelog">
            <div class="log-entry">
              <span class="log-ver">v1.2</span>
              <p>新增角色[王钰程]；重构红温系统；平衡性调整；修复PVE逻辑与移动端调课层级。</p>
            </div>
            <div class="log-entry">
              <span class="log-ver">v1.1</span>
              <p>新增角色[黄佳程]；实装过敏/杂鱼技能；优化结算界面动画。</p>
            </div>
            <div class="log-entry">
              <span class="log-ver">v1.0</span>
              <p>基础框架搭建；实装[计浩然][王鹤迪][赵恩培]；支持在线匹配与房间对战。</p>
            </div>
          </div>
        </div>
      </div>
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
