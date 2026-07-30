// ============================================================
// 校园战力党 — 大厅页面
// ============================================================
import { gameSocket } from '../net/socket.js';
import { navigate, showGlobalChat } from '../main.js';
import { characters } from '../../shared/characters.js';

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
          <button id="btn-create" class="btn btn-secondary">创建 1v1 房间</button>
          <div class="room-row">
            <input id="room-input" type="text" placeholder="房间号" maxlength="8" />
            <button id="btn-join" class="btn btn-secondary">加入 1v1</button>
          </div>
        </div>

        <div style="margin-top:20px; padding-top:16px; border-top:1px dashed var(--bg-inset);">
          <p style="font-family:var(--font-display); font-weight:700; color:var(--accent); text-align:center; margin-bottom:12px;">三国杀？ (3~8人)</p>
          <div class="btn-group">
            <button id="btn-create-ffa" class="btn btn-primary" style="flex:1">创建大乱斗</button>
            <div class="room-row" style="flex:2">
              <input id="room-input-ffa" type="text" placeholder="大乱斗房间号" maxlength="8" />
              <button id="btn-join-ffa" class="btn btn-primary">加入</button>
            </div>
          </div>
        </div>

        <div style="margin-top:20px; padding-top:16px; border-top:2px solid var(--accent); display:none;">
          <p style="font-family:var(--font-display); font-weight:700; color:var(--gold, #f0c040); text-align:center; margin-bottom:12px;">🎲 货币战争 (自走棋)</p>
          <button id="btn-autochess" class="btn btn-lg" style="width:100%; background:linear-gradient(135deg, #f0c040, #e67e22); color:#1a1a2e; font-weight:900; font-size:1.1rem;">⚔️ 货币战争...?</button>
        </div>

        <div style="margin-top:12px; text-align:center;">
          <button id="btn-stats" class="btn btn-secondary" style="width:100%;">📊 查看全服角色胜率数据</button>
        </div>
      </div>

      <div id="stats-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:999; align-items:center; justify-content:center;">
        <div class="modal-content" style="background:var(--bg-card); max-width:900px; width:95%; max-height:90vh; border-radius:12px; display:flex; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
          <div class="modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:16px; border-bottom:1px solid var(--bg-inset);">
            <h2 style="margin:0; font-family:var(--font-display);">📊 角色胜率矩阵</h2>
            <button id="btn-close-stats" class="btn" style="background:var(--bg-inset); color:var(--text); padding:4px 12px;">关闭</button>
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
    statusDiv.innerHTML = '<p class="status-msg">创建 1v1 房间中…</p>';
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

  document.getElementById('btn-create-ffa').addEventListener('click', () => {
    const n = getNick(); if (!n) return;
    gameSocket.createFfaRoom(n);
    statusDiv.innerHTML = '<p class="status-msg">创建大乱斗房间中…</p>';
  });

  document.getElementById('btn-join-ffa').addEventListener('click', () => {
    const n = getNick(); if (!n) return;
    const roomId = document.getElementById('room-input-ffa').value.trim();
    if (!roomId) {
      statusDiv.innerHTML = '<p style="color:var(--red);">请输入大乱斗房间号</p>';
      return;
    }
    gameSocket.joinFfaRoom(n, roomId);
  });

  document.getElementById('btn-autochess').addEventListener('click', () => {
    const n = getNick(); if (!n) return;
    gameSocket.emit('start_autochess', { nickname: n });
  });

  document.getElementById('btn-stats').addEventListener('click', async () => {
    document.getElementById('stats-modal').style.display = 'flex';
    document.getElementById('stats-body').innerHTML = '<p style="text-align:center;">加载中...</p>';
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      renderStatsMatrix(data);
    } catch (e) {
      document.getElementById('stats-body').innerHTML = '<p style="color:var(--red); text-align:center;">获取数据失败</p>';
    }
  });

  document.getElementById('btn-close-stats').addEventListener('click', () => {
    document.getElementById('stats-modal').style.display = 'none';
  });

  function renderStatsMatrix(data) {
    const chars = characters;
    let html = \`<div style="margin-bottom:12px; display:flex; gap:12px; align-items:center;">
      <span style="font-weight:700;">对战模式:</span>
      <select id="stats-mode-select" class="btn" style="background:var(--bg-inset); color:var(--text);">
        <option value="pvp">PvP (玩家 vs 玩家)</option>
        <option value="pve">PvE (玩家 vs 电脑)</option>
      </select>
    </div>
    <div id="stats-matrix-container"></div>\`;
    document.getElementById('stats-body').innerHTML = html;
    
    const modeSelect = document.getElementById('stats-mode-select');
    modeSelect.addEventListener('change', () => drawTable(modeSelect.value));
    
    function drawTable(mode) {
      const stats = data[mode] || {};
      let table = '<table class="stats-matrix"><thead><tr><th>胜率(场次)</th>';
      chars.forEach(c => { table += \`<th>\${c.name}</th>\`; });
      table += '</tr></thead><tbody>';
      
      chars.forEach(rowChar => {
        table += \`<tr><th>\${rowChar.name}</th>\`;
        chars.forEach(colChar => {
          if (rowChar.id === colChar.id) {
            table += \`<td class="empty-cell">-</td>\`;
          } else {
            const wins = (stats[rowChar.id] && stats[rowChar.id][colChar.id]) || 0;
            const losses = (stats[colChar.id] && stats[colChar.id][rowChar.id]) || 0;
            const total = wins + losses;
            if (total === 0) {
              table += \`<td class="empty-cell" style="color:var(--text-muted);">-</td>\`;
            } else {
              const winRate = (wins / total * 100).toFixed(1);
              let colorClass = '';
              if (winRate >= 60) colorClass = 'win-high';
              else if (winRate <= 40) colorClass = 'win-low';
              table += \`<td class="\${colorClass}">\${winRate}% <span class="total-matches" style="font-size:0.75rem; color:var(--text-muted);">(\${total})</span></td>\`;
            }
          }
        });
        table += '</tr>';
      });
      table += '</tbody></table>';
      table += \`<p style="font-size:0.8rem; color:var(--text-muted); margin-top:10px;">* 行代表左侧角色(你)，列代表上方角色(对手)。单元格表示左侧角色战胜上方角色的胜率。</p>\`;
      document.getElementById('stats-matrix-container').innerHTML = table;
    }
    
    drawTable('pvp');
  }

  // ── 服务端事件 ──
  gameSocket.on('room_created', ({ roomId, mode }) => {
    gameSocket.currentRoomId = roomId;
    showGlobalChat('房间已创建，等待对手加入...');
    const modeName = mode === 'sanguosha' ? '大乱斗' : '1v1';
    statusDiv.innerHTML = `
      <div class="panel" style="text-align:center; padding:16px;">
        <p style="color:var(--text-secondary);">${modeName} 房间已创建，将房间号发给好友：</p>
        <p style="font-family:var(--font-display); font-size:2rem; font-weight:900; color:var(--accent); margin:8px 0;">${roomId}</p>
        <p class="status-msg">等待好友加入…</p>
        ${mode === 'sanguosha' ? `<button id="btn-start-ffa" class="btn btn-primary" style="margin-top:12px; width:100%;">全员准备完毕，开始游戏</button>` : ''}
      </div>
    `;

    if (mode === 'sanguosha') {
      document.getElementById('btn-start-ffa').addEventListener('click', () => {
        gameSocket.startFfaGame();
      });
    }
  });

  gameSocket.on('ffa_room_update', ({ players }) => {
    // 仅在房主端显示或者全员大厅显示
    const list = players.map(p => `<li>${p.nickname}</li>`).join('');
    const listEl = document.getElementById('ffa-player-list');
    if(listEl) listEl.innerHTML = `已加入: <ul>${list}</ul>`;
    else {
      const p = document.createElement('div');
      p.id = 'ffa-player-list';
      p.innerHTML = `已加入: <ul>${list}</ul>`;
      statusDiv.appendChild(p);
    }
  });

  gameSocket.on('matchmaking_waiting', () => {
    statusDiv.innerHTML = '<p class="status-msg">等待对手中…</p>';
  });

  gameSocket.on('match_found', (data) => {
    gameSocket.currentRoomId = data.roomId;
    if (data.mode === 'autochess') {
      navigate('autochess', data);
    } else {
      showGlobalChat('已连接到对局！');
      navigate('preparation', data);
    }
  });

  gameSocket.on('error_msg', ({ message }) => {
    statusDiv.innerHTML = `<p style="color:var(--red);">✗ ${message}</p>`;
  });

  return () => {};
}
