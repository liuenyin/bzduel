// ============================================================
// 校园战力党 — 准备页面 (选卡 + 课程表)
// ============================================================
import { gameSocket } from '../net/socket.js';
import { navigate } from '../main.js';
import { characters } from '../../shared/characters.js';
import { SUBJECTS, getSubjectLabel, getSubjectIcon, getSkillMultiplier, DICE_COLORS } from '../../shared/rules.js';

function portraitInitials(name) {
  return Array.from(String(name || '?').replace(/[\[\]\s]/g, '')).slice(-2).join('') || '?';
}

function portraitFrame(character, className = '') {
  return `
    <span class="portrait-frame ${className}">
      <span class="portrait-fallback" aria-hidden="true">${portraitInitials(character.name)}</span>
      ${character.image ? `<img src="${character.image}" alt="${character.name}" onerror="this.remove()">` : ''}
    </span>
  `;
}

export function renderPreparation(container, data) {
  const { schedule, state, opponent, aiOpponentCardId } = data;
  let selectedCardId = null;
  const selectedAiOpponent = aiOpponentCardId ? characters.find(character => character.id === aiOpponentCardId) : null;

  container.innerHTML = `
    <div style="flex:1; display:flex; flex-direction:column; gap:16px; padding:8px 0;">
      <div class="panel prep-opponent-summary">
        ${selectedAiOpponent ? portraitFrame(selectedAiOpponent, 'prep-opponent-avatar') : ''}
        <div>
          <span>对手</span>
          <strong>${opponent || state.opponent.nickname}</strong>
          ${selectedAiOpponent ? `<small>指定角色：${selectedAiOpponent.name}</small>` : ''}
        </div>
      </div>

      <p class="section-title">📋 今日课程表</p>
      <div class="schedule-bar" id="schedule-bar">
        ${renderSchedule(schedule)}
      </div>

      <p class="section-title">选择你的角色</p>
      <div class="avatar-grid" id="card-selector">
        ${characters.map((c) => renderAvatar(c, state.gameMode)).join('')}
      </div>

      <div id="prep-status" style="text-align:center; min-height:32px;">
        <p style="color:var(--text-muted); font-size:0.88rem;">点击头像查看角色并确认选择</p>
      </div>

      <div style="display:flex; justify-content:center; gap:10px; padding-bottom:20px;">
        <button id="btn-ready" class="btn btn-primary btn-lg" disabled>准备完毕</button>
        <button id="btn-leave-room" class="btn btn-secondary">离开房间</button>
      </div>
    </div>
  `;

  // ── 模态框容器 ──
  const modalContainer = document.createElement('div');
  modalContainer.id = 'char-modal-container';
  document.body.appendChild(modalContainer);

  const renderModal = (charId) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return '';
    
    // 计算主客场
    let home = 0, away = 0, neutral = 0;
    for (const subj of schedule) {
      const m = getSkillMultiplier(char.subjects, subj);
      if (m === 2) home++;
      else if (m === 0.5) away++;
      else neutral++;
    }
    const diceHtml = char.dicePool.map(d => {
      const color = DICE_COLORS[d];
      const style = color ? `border-color:${color.border}; color:${color.border};` : '';
      const corner = color ? `<div class="die-mini-corner" style="color:${color.border};background:${color.bg}">${color.label}</div>` : '';
      return `<div class="die-mini" style="${style}">${corner}${d}</div>`;
    }).join('');
    const electLabel = char.electives.map(e => SUBJECTS[e]?.label || e).join('·');

    return `
      <div class="modal-overlay" id="char-modal" style="align-items: center; padding: 20px;">
        <div class="modal-content-card">
          <div class="modal-close" id="modal-close-btn">&times;</div>
          <div class="card" style="width: 100%; cursor: default;">
            <div class="card-image-wrap">
              ${portraitFrame(char, 'card-detail-portrait')}
              <div class="card-badge">${electLabel}</div>
            </div>
            <div class="card-body">
              <div class="card-name">${char.name}</div>
              <div class="card-title">${char.title}</div>
              <div class="card-stats">
                <div class="stat">
                  <div class="stat-val" style="color:var(--green);">${char.hp}</div>
                  <div class="stat-lbl">HP</div>
                </div>
                <div class="stat" style="flex:1; padding-left:8px; text-align:right;">
                  <div class="stat-val" style="color:var(--text); display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap;">${diceHtml}</div>
                  <div class="stat-lbl">骰池 (攻${char.atkSlots === -1 ? '全选' : char.atkSlots} 守${char.defSlots})</div>
                </div>
              </div>
              <div style="text-align:center; font-size:0.72rem; color:var(--text-muted); margin-bottom:8px;">
                <span class="multiplier x2">主场×2 ${home}节</span>
                <span class="multiplier x05">客场 ${away}节</span>
                <span class="multiplier x1">中立 ${neutral}节</span>
              </div>
              <div class="card-skills">
                ${char.positiveSkill ? `<div class="skill-line pos">✦ <strong>${char.positiveSkill.name}</strong> — ${char.positiveSkill.desc}</div>` : ''}
                ${char.negativeSkill ? `<div class="skill-line neg">✧ <strong>${char.negativeSkill.name}</strong> — ${char.negativeSkill.desc}</div>` : ''}
              </div>
              <button id="modal-select-btn" class="btn btn-primary btn-lg" style="width: 100%; margin-top: 16px;">就决定是你了！</button>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  // ── 选卡交互 ──
  const avatars = container.querySelectorAll('.avatar-cell:not(.disabled)');
  avatars.forEach((avatarEl) => {
    avatarEl.addEventListener('click', () => {
      const charId = avatarEl.dataset.id;
      modalContainer.innerHTML = renderModal(charId);
      
      document.getElementById('modal-close-btn').addEventListener('click', () => {
        modalContainer.innerHTML = '';
      });

      document.getElementById('char-modal').addEventListener('click', (e) => {
        if(e.target.id === 'char-modal') modalContainer.innerHTML = '';
      });

      document.getElementById('modal-select-btn').addEventListener('click', () => {
        selectedCardId = charId;
        avatars.forEach((c) => c.classList.remove('selected'));
        avatarEl.classList.add('selected');
        document.getElementById('btn-ready').disabled = false;
        gameSocket.selectCard(selectedCardId);
        modalContainer.innerHTML = '';
      });
    });
  });

  // ── 准备按钮 ──
  document.getElementById('btn-ready').addEventListener('click', () => {
    if (!selectedCardId) return;
    gameSocket.setReady();
    const btn = document.getElementById('btn-ready');
    btn.disabled = true;
    btn.textContent = '等待对手…';
    document.getElementById('prep-status').innerHTML =
      '<p class="status-msg">等待对手准备…</p>';
  });

  document.getElementById('btn-leave-room').addEventListener('click', () => {
    if (!window.confirm('确定要离开当前房间吗？')) return;
    gameSocket.leaveRoom(() => navigate('lobby'));
  });

  // ── 服务端事件 ──
  gameSocket.on('opponent_selected', () => {
    document.getElementById('prep-status').innerHTML =
      '<p style="color:var(--green);">✓ 对手已选卡</p>';
  });

  gameSocket.on('opponent_ready', () => {
    document.getElementById('prep-status').innerHTML =
      '<p style="color:var(--green);">✓ 对手已准备</p>';
  });

  gameSocket.on('opponent_connection_lost', ({ graceMs }) => {
    const seconds = Math.ceil((graceMs || 60000) / 1000);
    document.getElementById('prep-status').innerHTML =
      `<p style="color:var(--accent);">对手暂时掉线，等待重连（${seconds} 秒）</p>`;
  });

  gameSocket.on('opponent_reconnected', () => {
    document.getElementById('prep-status').innerHTML =
      '<p style="color:var(--green);">✓ 对手已重新连接</p>';
  });

  gameSocket.on('room_closed', ({ reason }) => {
    window.alert(reason || '房间已关闭');
    gameSocket.currentRoomId = null;
    navigate('lobby');
  });

  gameSocket.on('state_update', (newState) => {
    if (newState.phase === 'battle') {
      if(document.getElementById('char-modal-container')) {
        document.getElementById('char-modal-container').remove();
      }
      navigate('battle', { state: newState });
    } else {
      // Refresh schedule if it changed
      const bar = document.getElementById('schedule-bar');
      if (bar && newState.schedule) bar.innerHTML = renderSchedule(newState.schedule);
    }
  });

  let localConnectionLost = false;
  const stopConnectionStatus = gameSocket.onConnectionStatus(({ connected }) => {
    const status = document.getElementById('prep-status');
    if (!status) return;
    if (!connected) {
      localConnectionLost = true;
      status.innerHTML = '<p style="color:var(--accent);">连接中断，正在自动重连…</p>';
    } else if (localConnectionLost) {
      localConnectionLost = false;
      status.innerHTML = '<p style="color:var(--green);">✓ 连接已恢复</p>';
    }
  });

  return () => {
    stopConnectionStatus();
    if(document.getElementById('char-modal-container')) {
      document.getElementById('char-modal-container').remove();
    }
  };
}

// ── 课程表渲染 ──────────────────────────────────────

function renderSchedule(schedule) {
  return schedule
    .map((subj, i) => `
      <div class="schedule-item" data-index="${i}">
        <span class="icon">${getSubjectIcon(subj)}</span>
        <span class="label">${SUBJECTS[subj]?.label || subj}</span>
      </div>
    `)
    .join('');
}

// ── 角色卡渲染 ──────────────────────────────────────

function renderAvatar(char, gameMode) {
  const disabled = char.ffaOnly && gameMode === '1v1';
  return `
    <div class="avatar-cell ${disabled ? 'disabled' : ''}" data-id="${char.id}" style="${disabled ? 'opacity: 0.5; filter: grayscale(1); cursor: not-allowed; position: relative;' : ''}">
      ${portraitFrame(char, 'avatar-img')}
      <div class="avatar-name">${char.name}</div>
      ${disabled ? `<div style="position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); border-radius:12px; display:flex; align-items:center; justify-content:center; color:white; font-size:10px; font-weight:bold;">仅大乱斗</div>` : ''}
    </div>
  `;
}
