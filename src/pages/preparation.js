// ============================================================
// 校园战力党 — 准备页面 (选卡 + 课程表)
// ============================================================
import { gameSocket } from '../net/socket.js';
import { navigate } from '../main.js';
import { characters } from '../../shared/characters.js';
import { SUBJECTS, getSubjectLabel, getSubjectIcon, getSkillMultiplier } from '../../shared/rules.js';

export function renderPreparation(container, data) {
  const { schedule, state, opponent } = data;
  let selectedCardId = null;

  container.innerHTML = `
    <div style="flex:1; display:flex; flex-direction:column; gap:16px; padding:8px 0;">
      <div class="panel" style="text-align:center; padding:16px 20px;">
        <p style="color:var(--text-secondary);">
          对手：<strong style="color:var(--accent);">${opponent || state.opponent.nickname}</strong>
        </p>
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

      <div style="text-align:center; padding-bottom:20px;">
        <button id="btn-ready" class="btn btn-primary btn-lg" disabled>准备完毕</button>
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
    const diceDesc = char.dicePool.map(d => `D${d}`).join('+');
    const electLabel = char.electives.map(e => SUBJECTS[e]?.label || e).join('·');

    return `
      <div class="modal-overlay" id="char-modal">
        <div class="battle-card-wrap" style="transform: scale(1.5); position: relative;" id="modal-card">
          <div class="modal-close" id="modal-close-btn" style="position:absolute; top:-20px; right:-20px; color:#fff; z-index:100; font-size:1.5rem; cursor:pointer;">&times;</div>
          <div style="font-size: 0.6rem; color: #fff; text-shadow: 1px 1px 2px #000; text-align: center; margin-bottom: 4px;">
            ${electLabel} | HP: ${char.hp} | 骰数: ${char.dicePool.length}
          </div>
          <div class="battle-card" style="box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
            <img src="${char.image || ''}" alt="" onerror="this.style.display='none'">
            <div class="bc-name">
              <div style="font-size:0.5rem; color:var(--text-muted); font-weight:normal;">${char.title}</div>
              ${char.name}
            </div>
          </div>
          <div style="text-align:center; font-size:0.5rem; color:#fff; text-shadow: 1px 1px 2px #000; margin-top:2px;">
            <span class="multiplier x2">主场×2 ${home}</span>
            <span class="multiplier x1">中立 ${neutral}</span>
            <span class="multiplier x05">客场 ${away}</span>
          </div>
          <div class="skill-desc-box" style="margin-top: 6px; text-align: left; background: rgba(255,255,255,0.95); max-height: 120px; overflow-y: auto;">
            ${char.positiveSkill ? `<div class="skill-desc-line pos">✦ ${char.positiveSkill.name}: ${char.positiveSkill.desc}</div>` : ''}
            ${char.negativeSkill ? `<div class="skill-desc-line neg">✧ ${char.negativeSkill.name}: ${char.negativeSkill.desc}</div>` : ''}
          </div>
          <button id="modal-select-btn" class="btn btn-primary" style="margin-top: 10px; width: 100%; font-size: 0.7rem; padding: 6px 0;">就决定是你了！</button>
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

  // ── 服务端事件 ──
  gameSocket.on('opponent_selected', () => {
    document.getElementById('prep-status').innerHTML =
      '<p style="color:var(--green);">✓ 对手已选卡</p>';
  });

  gameSocket.on('opponent_ready', () => {
    document.getElementById('prep-status').innerHTML =
      '<p style="color:var(--green);">✓ 对手已准备</p>';
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

  return () => {
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
      <img src="${char.image || ''}" alt="${char.name}" class="avatar-img">
      <div class="avatar-name">${char.name}</div>
      ${disabled ? `<div style="position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); border-radius:12px; display:flex; align-items:center; justify-content:center; color:white; font-size:10px; font-weight:bold;">仅大乱斗</div>` : ''}
    </div>
  `;
}
