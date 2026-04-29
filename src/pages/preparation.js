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
      <div class="card-grid" id="card-selector">
        ${characters.map((c) => renderCard(c, schedule)).join('')}
      </div>

      <div id="prep-status" style="text-align:center; min-height:32px;">
        <p style="color:var(--text-muted); font-size:0.88rem;">点击角色卡选择，然后点击准备</p>
      </div>

      <div style="text-align:center; padding-bottom:20px;">
        <button id="btn-ready" class="btn btn-primary btn-lg" disabled>准备完毕</button>
      </div>
    </div>
  `;

  // ── 选卡交互 ──
  const cards = container.querySelectorAll('.card');
  cards.forEach((cardEl) => {
    cardEl.addEventListener('click', () => {
      selectedCardId = cardEl.dataset.id;
      cards.forEach((c) => c.classList.remove('selected'));
      cardEl.classList.add('selected');
      document.getElementById('btn-ready').disabled = false;
      gameSocket.selectCard(selectedCardId);
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
      navigate('battle', { state: newState });
    } else {
      // Refresh schedule if it changed
      const bar = document.getElementById('schedule-bar');
      if (bar && newState.schedule) bar.innerHTML = renderSchedule(newState.schedule);
    }
  });

  return () => {};
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

function renderCard(char, schedule) {
  // 统计主场/客场/中立
  let home = 0, away = 0, neutral = 0;
  for (const subj of schedule) {
    const m = getSkillMultiplier(char.subjects, subj);
    if (m === 2) home++;
    else if (m === 0.5) away++;
    else neutral++;
  }

  const diceDesc = (dice) => dice.map((d) => `D${d}`).join('+');
  const electLabel = char.electives.map(e => SUBJECTS[e]?.label || e).join('·');

  return `
    <div class="card" data-id="${char.id}">
      <div class="card-image-wrap">
        <img src="${char.image || ''}" alt="${char.name}"
             onerror="this.style.display='none'">
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
          <div class="stat" style="flex:1; padding-left:8px;">
            <div class="stat-val" style="color:var(--text); letter-spacing:1px;">${diceDesc(char.dicePool)}</div>
            <div class="stat-lbl">骰池 (攻${char.atkSlots} 守${char.defSlots})</div>
          </div>
        </div>
        <div style="text-align:center; font-size:0.72rem; color:var(--text-muted); margin-bottom:8px;">
          <span class="multiplier x2">主场×2 ${home}节</span>
          <span class="multiplier x05">客场 ${away}节</span>
          <span class="multiplier x1">中立 ${neutral}节</span>
        </div>
        <div class="card-skills">
          <div class="skill-line pos">✦ <strong>${char.positiveSkill.name}</strong> — ${char.positiveSkill.desc}</div>
          <div class="skill-line neg">✧ <strong>${char.negativeSkill.name}</strong> — ${char.negativeSkill.desc}</div>
        </div>
      </div>
    </div>
  `;
}
