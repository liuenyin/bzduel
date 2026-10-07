// ============================================================
// 校园战力党 — 大厅页面
// ============================================================
import { gameSocket } from '../net/socket.js';
import { navigate } from '../app/router.js';
import { showGlobalChat, hideGlobalChat } from '../components/chat.js';
import { characters } from '../../shared/characters.js';
import { escapeHTML } from '../utils/html.js';
import { trapFocus } from '../utils/a11y.js';

function portraitInitials(name) {
  return Array.from(String(name || '?').replace(/[\[\]\s]/g, '')).slice(-2).join('') || '?';
}

function portraitFrame(character, className = '') {
  return `
    <span class="portrait-frame ${escapeHTML(className)}">
      <span class="portrait-fallback" aria-hidden="true">${escapeHTML(portraitInitials(character.name))}</span>
      ${character.image ? `<img src="${escapeHTML(character.image)}" alt="${escapeHTML(character.name)}" loading="lazy" onerror="this.remove()">` : ''}
    </span>
  `;
}

export function renderLobby(container, data = {}) {
  hideGlobalChat();
  container.innerHTML = `
    <div class="lobby">
      <h1 class="title-main">校园战力党</h1>
      <p class="title-sub">和同学来一局骰子对决</p>

      <div class="panel">
        <input id="nickname-input" type="text" placeholder="你的昵称" maxlength="12" />
        
        <div class="btn-group">
          <button id="btn-pve" class="btn btn-primary btn-lg">单人对战</button>
          <button id="btn-pve-custom" class="btn btn-secondary btn-lg">自选人机对手</button>
          <button id="btn-match" class="btn btn-success btn-lg">随机匹配</button>
        </div>

        <hr style="border:none; border-top:1px solid var(--bg-inset); margin:12px 0;" />

        <div class="btn-group">
          <button id="btn-create" class="btn btn-secondary">创建 1v1 房间</button>
          <div class="room-row">
            <input id="room-input" type="text" placeholder="房间号" maxlength="8" />
            <button id="btn-join" class="btn btn-secondary">加入 1v1</button>
          </div>
        </div>

        <div style="margin-top:12px; text-align:center;">
          <button id="btn-stats" class="btn btn-secondary" style="width:100%;">📊 查看全服角色胜率数据</button>
        </div>
        <label class="motion-toggle"><input id="motion-toggle" type="checkbox"> 简洁动画</label>
      </div>

      <div id="pve-opponent-modal" class="modal-overlay pve-opponent-modal" role="dialog" aria-modal="true" aria-labelledby="pve-opponent-title">
        <section class="pve-opponent-panel">
          <header class="pve-opponent-header">
            <h2 id="pve-opponent-title">选择电脑角色</h2>
            <button id="btn-close-pve-opponent" class="pve-opponent-close" type="button" aria-label="关闭">&times;</button>
          </header>
          <div class="pve-opponent-grid">
            ${characters.filter(character => !character.ffaOnly).map(character => `
              <button class="pve-opponent-option" type="button" data-character-id="${character.id}" aria-pressed="false">
                ${portraitFrame(character, 'pve-opponent-portrait')}
                <span>${escapeHTML(character.name)}</span>
                <small>${character.hp} HP</small>
              </button>
            `).join('')}
          </div>
          <footer class="pve-opponent-footer">
            <span id="pve-opponent-selection">尚未选择</span>
            <button id="btn-start-custom-pve" class="btn btn-primary" type="button" disabled>开始对战</button>
          </footer>
        </section>
      </div>

      <div id="stats-modal" class="modal-overlay stats-modal" role="dialog" aria-modal="true" aria-labelledby="stats-title" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; z-index:999; align-items:center; justify-content:center;">
        <div class="modal-content" style="background:var(--bg-card); max-width:900px; width:95%; max-height:90vh; border-radius:12px; display:flex; flex-direction:column; box-shadow:var(--shadow-lg);">
          <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:16px; border-bottom:1px solid var(--bg-inset);">
            <h2 id="stats-title" style="margin:0; font-family:var(--font-display);">📊 角色胜率矩阵</h2>
            <button id="btn-close-stats" class="btn" type="button" aria-label="关闭胜率矩阵" style="background:var(--bg-inset); color:var(--text); padding:4px 12px;">关闭</button>
          </div>
          <div class="modal-body" id="stats-body" style="padding:16px; overflow-x:auto; overflow-y:auto; flex:1;">
            Loading...
          </div>
        </div>
      </div>

      <div id="status" style="min-height:36px; margin-top:12px;"></div>

      <div class="lobby-info-grid">
        <div class="info-card tutorial" style="grid-column: span 2;">
          <h2 class="info-title">📖 校园战力党：规则详解</h2>
          <div class="rule-sections">
            <div class="rule-group">
              <h3>1. 游戏流程</h3>
              <p>一局游戏包含 <strong>6节课</strong>。每节课由 <strong>2个小轮</strong> 组成（双方轮流担任一次攻击方和防御方）。当6节课结束或某方HP归零时，游戏结束。</p>
            </div>
            <div class="rule-group">
              <h3>2. 卡牌信息阅读</h3>
              <ul class="rule-list">
                <li><strong>HP (生命值)：</strong> 战斗的本钱，降至0即判负。</li>
                <li><strong>骰子组：</strong> 决定你投出的骰子面数。例如 <code>[6, 8, 10, 12]</code> 表示你每轮会掷出这四种骰子各一颗。</li>
                <li><strong>攻/防位数：</strong> 表示你最终可以挑选 <strong>几颗</strong> 骰子计入总分。例如“3位攻”表示你可以从所有投出的骰子中选最大的3颗。</li>
                <li><strong>科目倾向：</strong> 每个角色有擅长和不擅长的科目。主场作战时，技能强度和基础值会有巨大提升。</li>
              </ul>
            </div>
            <div class="rule-group">
              <h3>3. 回合操作</h3>
              <p><strong>攻击方：</strong> 掷骰后，可以点击骰子进行 <strong>一次重投</strong>（部分技能会限制此操作）。最后挑选点数最大的几颗骰子进行确认。</p>
              <p><strong>防御方：</strong> 在攻击方确认后掷骰。同样拥有一次重投机会，选出最大点数以减免伤害。</p>
              <p><strong>调课：</strong> 战斗中点击右上角图标。如果你有“调课权”，可以将未来某一节课修改为对你更有利的科目。</p>
            </div>
          </div>
        </div>
        
        <div class="info-card" style="grid-column: span 2;">
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
          </div>
        </div>
      </div>
    </div>
  `;

  const nicknameInput = document.getElementById('nickname-input');
  const statusDiv = document.getElementById('status');

  function showLobbyError(message) {
    if (!statusDiv.isConnected) return;
    let notice = statusDiv.querySelector('.status-msg');
    if (!notice) {
      notice = document.createElement('p');
      notice.className = 'status-msg';
      statusDiv.appendChild(notice);
    }
    notice.setAttribute('role', 'alert');
    notice.style.color = 'var(--red)';
    notice.textContent = `✗ ${message || '操作失败'}`;
  }

  const saved = localStorage.getItem('dice_duel_nickname');
  if (saved) nicknameInput.value = saved;

  const inviteParams = new URLSearchParams(window.location.search);
  const invitedRoomId = inviteParams.get('room');
  const invitedMode = '1v1';
  if (invitedRoomId) {
    const inputId = 'room-input';
    document.getElementById(inputId).value = invitedRoomId;
    statusDiv.innerHTML = `<p class="status-msg">邀请房间 ${escapeHTML(invitedRoomId)} 已填入，输入昵称后即可加入。</p>`;
  }

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

  const pveOpponentModal = document.getElementById('pve-opponent-modal');
  const customPveStartButton = document.getElementById('btn-start-custom-pve');
  const pveOpponentSelection = document.getElementById('pve-opponent-selection');
  const pveOpponentOptions = [...document.querySelectorAll('.pve-opponent-option')];
  const lobbyAction = (button, pendingLabel, action, fallback = '操作失败') => {
    if (!button || button.disabled) return;
    const previousLabel = button.textContent;
    button.disabled = true;
    button.textContent = pendingLabel;
    action(result => {
      if (result?.ok || !button.isConnected) return;
      button.disabled = false;
      button.textContent = previousLabel;
      showLobbyError(result.error || fallback);
    });
  };
  let customPveNickname = null;
  let selectedAiCardId = null;

  const closePveOpponentModal = () => {
    pveOpponentModal.classList.remove('is-open');
    if (pveOpponentReturnFocus?.isConnected) pveOpponentReturnFocus.focus();
    pveOpponentReturnFocus = null;
  };

  let pveOpponentReturnFocus = null;
  const handleLobbyKeydown = (event) => {
    if (!pveOpponentModal.classList.contains('is-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closePveOpponentModal();
      return;
    }
    trapFocus(event, pveOpponentModal);
  };
  document.addEventListener('keydown', handleLobbyKeydown);

  document.getElementById('btn-pve').addEventListener('click', event => {
    const n = getNick(); if (!n) return;
    lobbyAction(event.currentTarget, '正在创建对局…', acknowledge => gameSocket.startPVE(n, acknowledge), '创建对局失败');
  });

  document.getElementById('btn-pve-custom').addEventListener('click', event => {
    const n = getNick(); if (!n) return;
    customPveNickname = n;
    pveOpponentReturnFocus = event.currentTarget;
    pveOpponentModal.classList.add('is-open');
    pveOpponentOptions[0]?.focus();
  });

  document.getElementById('btn-close-pve-opponent').addEventListener('click', closePveOpponentModal);
  pveOpponentModal.addEventListener('click', event => {
    if (event.target === pveOpponentModal) closePveOpponentModal();
  });
  pveOpponentOptions.forEach(option => {
    option.addEventListener('click', () => {
      selectedAiCardId = option.dataset.characterId;
      pveOpponentOptions.forEach(candidate => {
        const isSelected = candidate === option;
        candidate.classList.toggle('selected', isSelected);
        candidate.setAttribute('aria-pressed', String(isSelected));
      });
      const selectedCharacter = characters.find(character => character.id === selectedAiCardId);
      pveOpponentSelection.textContent = selectedCharacter ? `已选择：${selectedCharacter.name}` : '尚未选择';
      customPveStartButton.disabled = !selectedCharacter;
    });
  });
  customPveStartButton.addEventListener('click', () => {
    if (!customPveNickname || !selectedAiCardId) return;
    customPveStartButton.disabled = true;
    customPveStartButton.textContent = '正在创建对局…';
    gameSocket.startPVE(customPveNickname, selectedAiCardId, result => {
      if (result?.ok || !customPveStartButton.isConnected) return;
      customPveStartButton.disabled = false;
      customPveStartButton.textContent = '开始对战';
      showLobbyError(result.error || '创建对局失败');
    });
  });

  const matchButton = document.getElementById('btn-match');
  document.getElementById('btn-match').addEventListener('click', event => {
    const n = getNick(); if (!n) return;
    statusDiv.innerHTML = '<p class="status-msg">等待对手中…</p>';
    lobbyAction(event.currentTarget, '匹配中…', acknowledge => gameSocket.joinMatchmaking(n, result => {
      if (result?.ok && result.waiting) showMatchmakingWaiting();
      acknowledge(result);
    }), '匹配失败');
  });

  document.getElementById('btn-create').addEventListener('click', event => {
    const n = getNick(); if (!n) return;
    statusDiv.innerHTML = '<p class="status-msg">创建 1v1 房间中…</p>';
    lobbyAction(event.currentTarget, '正在创建…', acknowledge => gameSocket.createRoom(n, acknowledge), '创建房间失败');
  });

  document.getElementById('btn-join').addEventListener('click', event => {
    const n = getNick(); if (!n) return;
    const roomId = document.getElementById('room-input').value.trim();
    if (!roomId) {
      statusDiv.innerHTML = '<p style="color:var(--red);">请输入房间号</p>';
      return;
    }
    statusDiv.innerHTML = '<p class="status-msg">正在加入房间…</p>';
    lobbyAction(event.currentTarget, '正在加入…', acknowledge => gameSocket.joinRoom(n, roomId, acknowledge), '加入房间失败');
  });

  const motionToggle = document.getElementById('motion-toggle');
  if (motionToggle) {
    motionToggle.checked = localStorage.getItem('dice_duel_reduced_motion') === '1';
    document.body.classList.toggle('reduced-motion', motionToggle.checked);
    motionToggle.addEventListener('change', () => {
      localStorage.setItem('dice_duel_reduced_motion', motionToggle.checked ? '1' : '0');
      document.body.classList.toggle('reduced-motion', motionToggle.checked);
    });
  }

  const statsModal = document.getElementById('stats-modal');
  const statsBody = document.getElementById('stats-body');
  const statsCloseButton = document.getElementById('btn-close-stats');
  let statsRequestId = 0;
  let statsReturnFocus = null;
  const closeStats = () => {
    statsRequestId++;
    statsModal.style.display = 'none';
    if (statsReturnFocus?.isConnected) statsReturnFocus.focus();
    statsReturnFocus = null;
  };

  document.getElementById('btn-stats').addEventListener('click', async () => {
    statsReturnFocus = document.activeElement;
    statsModal.style.display = 'flex';
    statsBody.innerHTML = '<p style="text-align:center;">加载中...</p>';
    statsCloseButton.focus();
    const requestId = ++statsRequestId;
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (requestId !== statsRequestId || !statsModal.isConnected || statsModal.style.display === 'none') return;
      renderStatsMatrix(data);
    } catch (e) {
      if (requestId === statsRequestId && statsModal.isConnected && statsModal.style.display !== 'none') {
        statsBody.innerHTML = '<p style="color:var(--red); text-align:center;">获取数据失败</p>';
      }
    }
  });

  statsCloseButton.addEventListener('click', closeStats);
  statsModal.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeStats();
      return;
    }
    trapFocus(event, statsModal);
  });
  statsModal.addEventListener('click', event => {
    if (event.target === statsModal) closeStats();
  });

  function renderStatsMatrix(data) {
    const chars = characters;
    let html = `<div style="margin-bottom:12px; display:flex; gap:12px; align-items:center;">
      <span style="font-weight:700;">对战模式:</span>
      <select id="stats-mode-select" class="btn" style="background:var(--bg-inset); color:var(--text);">
        <option value="pvp">PvP (玩家 vs 玩家)</option>
        <option value="pve">PvE (玩家 vs 电脑)</option>
      </select>
    </div>
    <div id="stats-matrix-container"></div>`;
    document.getElementById('stats-body').innerHTML = html;
    
    const modeSelect = document.getElementById('stats-mode-select');
    modeSelect.addEventListener('change', () => drawTable(modeSelect.value));
    
    function drawTable(mode) {
      const stats = data[mode] || {};
      let table = '<div class="stats-matrix-wrap"><table class="stats-matrix"><thead><tr><th>胜率(场次)</th>';
      chars.forEach(c => { table += `<th>${escapeHTML(c.name)}</th>`; });
      table += '</tr></thead><tbody>';
      
      chars.forEach(rowChar => {
        table += `<tr><th>${escapeHTML(rowChar.name)}</th>`;
        chars.forEach(colChar => {
          if (rowChar.id === colChar.id) {
            table += `<td class="empty-cell">-</td>`;
          } else {
            const winsValue = stats[rowChar.id] && stats[rowChar.id][colChar.id];
            const lossesValue = stats[colChar.id] && stats[colChar.id][rowChar.id];
            const wins = Number.isFinite(Number(winsValue)) ? Math.max(0, Number(winsValue)) : 0;
            const losses = Number.isFinite(Number(lossesValue)) ? Math.max(0, Number(lossesValue)) : 0;
            const total = wins + losses;
            if (total === 0) {
              table += `<td class="empty-cell" style="color:var(--text-muted);">-</td>`;
            } else {
              const winRate = (wins / total * 100).toFixed(1);
              let colorClass = '';
              if (winRate >= 60) colorClass = 'win-high';
              else if (winRate <= 40) colorClass = 'win-low';
              table += `<td class="${colorClass}">${winRate}% <span class="total-matches" style="font-size:0.75rem; color:var(--text-muted);">(${total})</span></td>`;
            }
          }
        });
        table += '</tr>';
      });
      table += '</tbody></table></div>';
      table += `<p style="font-size:0.8rem; color:var(--text-muted); margin-top:10px;">* 行代表左侧角色(你)，列代表上方角色(对手)。单元格表示左侧角色战胜上方角色的胜率。</p>`;
      document.getElementById('stats-matrix-container').innerHTML = table;
    }
    
    drawTable('pvp');
  }

  // ── 服务端事件 ──
  const copyText = async (text, successMessage) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
    const message = document.querySelector('#status .status-msg');
    if (message) message.textContent = successMessage;
  };

  const showWaitingRoom = ({ roomId, mode, isOwner = true, players = [] }) => {
    gameSocket.currentRoomId = roomId;
    container.querySelectorAll('.lobby > .panel > .btn-group').forEach(group => { group.style.display = 'none'; });
    showGlobalChat(isOwner ? '房间已创建，等待对手加入...' : '已重新加入等待中的房间。');
    const modeName = mode === 'sanguosha' ? '大乱斗' : '1v1';
    const playerList = mode === 'sanguosha'
      ? `<div id="ffa-player-list">已加入: <ul>${players.map(p => `<li>${escapeHTML(p?.nickname || '匿名玩家')}</li>`).join('')}</ul></div>`
      : '';
    const inviteUrl = new URL(window.location.href);
    inviteUrl.search = '';
    inviteUrl.searchParams.set('room', roomId);
    inviteUrl.searchParams.set('mode', mode);
    statusDiv.innerHTML = `
      <div class="panel" style="text-align:center; padding:16px;">
        <p style="color:var(--text-secondary);">${modeName} 房间号：</p>
        <p style="font-family:var(--font-display); font-size:2rem; font-weight:900; color:var(--accent); margin:8px 0;">${escapeHTML(roomId)}</p>
        <p class="status-msg">等待好友加入…</p>
        ${playerList}
        ${mode === 'sanguosha' && isOwner ? `<button id="btn-start-ffa" class="btn btn-primary" style="margin-top:12px; width:100%;">全员准备完毕，开始游戏</button>` : ''}
        <div class="waiting-room-actions">
          <button id="btn-copy-room" class="btn btn-secondary">复制房间号</button>
          <button id="btn-copy-invite" class="btn btn-secondary">复制邀请链接</button>
          <button id="btn-leave-waiting" class="btn btn-secondary">离开房间</button>
        </div>
      </div>
    `;

    if (mode === 'sanguosha' && isOwner) {
      document.getElementById('btn-start-ffa').addEventListener('click', (event) => {
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = '正在开始…';
        gameSocket.startFfaGame(result => {
          if (result?.ok || !button.isConnected) return;
          button.disabled = false;
          button.textContent = '全员准备完毕，开始游戏';
          showLobbyError(result?.error || '暂时无法开始游戏');
        });
      });
    }
    document.getElementById('btn-copy-room').addEventListener('click', () => {
      copyText(roomId, '房间号已复制');
    });
    document.getElementById('btn-copy-invite').addEventListener('click', () => {
      copyText(inviteUrl.toString(), '邀请链接已复制');
    });
    document.getElementById('btn-leave-waiting').addEventListener('click', () => {
      const button = document.getElementById('btn-leave-waiting');
      button.disabled = true;
      button.textContent = '正在离开…';
      gameSocket.leaveRoom(result => {
        if (result?.ok) navigate('lobby');
        else {
          button.disabled = false;
          button.textContent = '重试离开';
        }
      });
    });
  };

  gameSocket.on('room_created', ({ roomId, mode }) => {
    showWaitingRoom({ roomId, mode, isOwner: true });
  });

  gameSocket.on('ffa_room_update', ({ players }) => {
    // 仅在房主端显示或者全员大厅显示
    const list = (Array.isArray(players) ? players : []).map(p => `<li>${escapeHTML(p?.nickname || '匿名玩家')}</li>`).join('');
    const listEl = document.getElementById('ffa-player-list');
    if(listEl) listEl.innerHTML = `已加入: <ul>${list}</ul>`;
    else {
      const p = document.createElement('div');
      p.id = 'ffa-player-list';
      p.innerHTML = `已加入: <ul>${list}</ul>`;
      statusDiv.appendChild(p);
    }
  });

  const showMatchmakingWaiting = () => {
    matchButton.disabled = true;
    matchButton.textContent = '匹配中…';
    statusDiv.innerHTML = `
      <div class="panel" style="text-align:center; padding:12px;">
        <p class="status-msg">等待对手中…</p>
        <button id="btn-cancel-match" class="btn btn-secondary" type="button">取消匹配</button>
      </div>`;
    document.getElementById('btn-cancel-match')?.addEventListener('click', event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = '正在取消…';
      gameSocket.cancelMatchmaking(result => {
        if (!button.isConnected) return;
        if (!result?.ok) {
          button.disabled = false;
          button.textContent = '取消匹配';
          showLobbyError(result?.error || '取消失败，请重试');
          return;
        }
        statusDiv.innerHTML = '<p class="status-msg">已取消匹配</p>';
        matchButton.disabled = false;
        matchButton.textContent = '随机匹配';
        container.querySelectorAll('.lobby > .panel > .btn-group').forEach(group => { group.style.display = ''; });
      });
    });
  };

  gameSocket.on('matchmaking_waiting', showMatchmakingWaiting);

  gameSocket.on('match_found', (data) => {
    gameSocket.currentRoomId = data.roomId;
    if (data.mode === 'autochess') {
      navigate('autochess', data);
    } else {
      showGlobalChat('已连接到对局！');
      navigate('preparation', data);
    }
  });

  gameSocket.on('error_msg', (data = {}) => {
    const message = typeof data === 'string' ? data : data.message;
    if (customPveStartButton?.disabled && customPveNickname) {
      customPveStartButton.disabled = false;
      customPveStartButton.textContent = '开始对战';
    }
    showLobbyError(message || '发生错误');
  });

  gameSocket.on('room_closed', (data = {}) => {
    const reason = typeof data === 'string' ? data : data.reason;
    gameSocket.currentRoomId = null;
    container.querySelectorAll('.lobby > .panel > .btn-group').forEach(group => { group.style.display = ''; });
    statusDiv.innerHTML = `<p style="color:var(--text-secondary);">${escapeHTML(reason || '房间已关闭')}</p>`;
  });

  if (data.resumedRoom) showWaitingRoom(data.resumedRoom);

  return () => {
    document.removeEventListener('keydown', handleLobbyKeydown);
  };
}
