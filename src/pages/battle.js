// ============================================================
// 校园战力党 — 对战页面 (阶段制 · 卡牌动画)
// ============================================================
import { gameSocket } from '../net/socket.js';
import { navigate } from '../main.js';
import { SUBJECTS, CORE_SUBJECTS, ELECTIVE_SUBJECTS, MINOR_SUBJECTS, getSkillMultiplier, DICE_COLORS } from '../../shared/rules.js';

let S; // module-level state ref
let animLock = false; // prevent state_update during animations

export function renderBattle(container, data) {
  S = data.state;
  container.innerHTML = buildArena(S);
  bindCoreEvents();

  gameSocket.on('state_update', (s) => { if (!animLock) { S = s; refreshAll(); } });
  gameSocket.on('atk_confirmed', (d) => { S = d.state; onAtkConfirmed(d); });
  gameSocket.on('turn_resolved', (d) => { S = d.state; onTurnResolved(d); });
  gameSocket.on('class_change', (d) => showClassChange(d));
  gameSocket.on('opponent_disconnected', () => {
    const el = document.getElementById('phase-text');
    if (el) el.innerHTML = '<span style="color:var(--red)">对手已断开连接</span>';
  });
  gameSocket.on('error_msg', (d) => {
    alert(d.message);
    refreshAll();
  });

  return () => {};
}

// ── HTML 骨架 ──
function buildArena(s) {
  const me = s.me, op = s.opponent;
  const subj = s.schedule[s.currentClassIndex];
  return `
    <div class="arena">
      <aside class="sidebar sidebar-left" id="sidebar-schedule">
        <div class="sidebar-title">课程表</div>
        ${scheduleHTML(s)}
        ${me.hasReschedule ? '<button id="btn-reschedule" class="btn btn-secondary" style="width:100%;margin-top:8px;font-size:.78rem;">调课</button>' : ''}
      </aside>

      <main class="arena-center">
        <div class="card-row">
          <div class="battle-card-wrap" id="card-op">
            <div class="bc-multi" id="multi-op">${multiTag(getM(op,subj))}</div>
            <div class="battle-card">
              <img src="${op.card?.image||''}" alt="" onerror="this.style.display='none'">
              <div class="bc-name">${op.card?.name||'???'}</div>
            </div>
            <div class="bc-hp">
              <div class="hp-bar-h enemy" id="hp-op" style="width:${pct(op.hp,op.maxHp)}%"></div>
              <span class="hp-label" id="hp-op-t">${op.hp}</span>
            </div>
            <div class="skill-desc-box">
              ${op.card?.positiveSkill ? `<div class="skill-desc-line pos">✦ ${op.card.positiveSkill.name}: ${op.card.positiveSkill.desc}</div>` : ''}
              ${op.card?.negativeSkill ? `<div class="skill-desc-line neg">✧ ${op.card.negativeSkill.name}: ${op.card.negativeSkill.desc}</div>` : ''}
            </div>
            <div class="bc-buffs" id="buffs-op">${buffIcons(op)}</div>
          </div>

          <div class="vs-area" id="vs-area">
            <div id="phase-text" class="phase-text">${phasePrompt(s)}</div>
          </div>

          <div class="battle-card-wrap self-side" id="card-me">
            <div class="bc-multi" id="multi-me">${multiTag(getM(me,subj))}</div>
            <div class="battle-card">
              <img src="${me.card?.image||''}" alt="" onerror="this.style.display='none'">
              <div class="bc-name">${me.card?.name||'???'}</div>
            </div>
            <div class="bc-hp">
              <div class="hp-bar-h friendly" id="hp-me" style="width:${pct(me.hp,me.maxHp)}%"></div>
              <span class="hp-label" id="hp-me-t">${me.hp}</span>
            </div>
            <div class="skill-desc-box">
              ${me.card?.positiveSkill ? `<div class="skill-desc-line pos">✦ ${me.card.positiveSkill.name}: ${me.card.positiveSkill.desc}</div>` : ''}
              ${me.card?.negativeSkill ? `<div class="skill-desc-line neg">✧ ${me.card.negativeSkill.name}: ${me.card.negativeSkill.desc}</div>` : ''}
            </div>
            <div class="bc-buffs" id="buffs-me">${buffIcons(me)}</div>
          </div>
        </div>

        <div class="dice-area" id="dice-area"></div>
        <div class="action-bar" id="action-bar">${actionButtons(s)}</div>
      </main>

      <aside class="sidebar sidebar-right" id="sidebar-reroll">
        <div class="sidebar-title">重投</div>
        <div class="reroll-count" id="reroll-count">剩余 <strong>${me.rerolls}</strong> 次</div>
        <p class="reroll-hint" id="reroll-hint">点击骰子选中后重投</p>
        <button id="btn-reroll" class="btn btn-secondary" style="width:100%;display:none;">重投选中</button>
      </aside>
    </div>
    <div class="battle-log-bar" id="battle-log"></div>
  `;
}
// ── 事件绑定 (仅初始化时调用一次) ──
function bindCoreEvents() {
  on('btn-roll', 'click', () => { gameSocket.rollDice(); disableBtn('btn-roll'); });
  on('btn-confirm', 'click', () => {
    const sel = document.querySelectorAll('.die.selected');
    const indices = [...sel].map(d => parseInt(d.dataset.idx));
    gameSocket.confirmDice(indices);
    disableBtn('btn-confirm'); hide('btn-reroll');
  });
  // btn-reroll 在 sidebar 中，只绑一次
  const rr = document.getElementById('btn-reroll');
  if (rr) rr.onclick = () => {
    const sel = document.querySelectorAll('.die.selected');
    if (sel.length === 0) return;
    gameSocket.rerollDice([...sel].map(d => parseInt(d.dataset.idx)));
    sel.forEach(d => d.classList.remove('selected'));
    hide('btn-reroll');
  };
  on('btn-reschedule', 'click', () => showRescheduleModal());
}

// ── 仅重绑 action-bar 内的按钮 (refreshAll 每次重建 action-bar HTML) ──
function rebindActionButtons() {
  const roll = document.getElementById('btn-roll');
  if (roll) roll.onclick = () => { gameSocket.rollDice(); disableBtn('btn-roll'); };
  const conf = document.getElementById('btn-confirm');
  if (conf) conf.onclick = () => {
    const sel = document.querySelectorAll('.die.selected');
    const indices = [...sel].map(d => parseInt(d.dataset.idx));
    gameSocket.confirmDice(indices);
    disableBtn('btn-confirm'); hide('btn-reroll');
  };
}

// ── 刷新所有 UI ──
function refreshAll() {
  const subj = curSubj();
  // HP
  setHP('hp-me', S.me.hp, S.me.maxHp, 'hp-me-t');
  setHP('hp-op', S.opponent.hp, S.opponent.maxHp, 'hp-op-t');
  // Multipliers & Buffs
  setText('multi-me', multiTag(getM(S.me, subj)));
  setText('multi-op', multiTag(getM(S.opponent, subj)));
  const bMe = document.getElementById('buffs-me'); if (bMe) bMe.innerHTML = buffIcons(S.me);
  const bOp = document.getElementById('buffs-op'); if (bOp) bOp.innerHTML = buffIcons(S.opponent);
  // Schedule
  const sb = document.getElementById('sidebar-schedule');
  if (sb) {
    const hasR = S.me.hasReschedule;
    sb.innerHTML = `<div class="sidebar-title">课程表</div>${scheduleHTML(S)}${hasR ? '<button id="btn-reschedule" class="btn btn-secondary" style="width:100%;margin-top:8px;font-size:.78rem;">调课</button>' : ''}`;
    if (hasR) on('btn-reschedule', 'click', () => showRescheduleModal());
  }
  // Reroll count
  setText('reroll-count', `剩余 <strong>${S.me.rerolls}</strong> 次`);
  // Phase & actions
  setText('phase-text', phasePrompt(S));
  setText('action-bar', actionButtons(S));
  rebindActionButtons();
  // Dice - render if available
  renderDice();
}

// ── 掷骰展示 ──
function renderDice() {
  const area = document.getElementById('dice-area');
  if (!area) return;
  const myPool = S.me.card.dicePool;
  const opPool = S.opponent.card?.dicePool || myPool;

  let html = '';
  if (S.attackRolls) {
    // 攻击骰始终属于攻击方
    const isMineAtk = S.isMyAttackTurn;
    const canSelect = S.turnPhase === 'atk_rolled' && isMineAtk;
    const atkPool = isMineAtk ? myPool : opPool;
    html += `<div class="dice-row"><span class="dice-label" style="color:var(--gold)">攻</span>`;
    html += S.attackRolls.map((v, i) => {
      const isKept = S.atkResult?.keptIndices?.includes(i);
      const face = atkPool[i] || 6;
      const isYzx = !isMineAtk && S.opponent.cardId === 'char_10';
      const color = DICE_COLORS[face];
      let style = color ? `border-color:${color.border}; color:${color.border};` : '';
      if (!isMineAtk && S.atkResult && !isKept) style += 'opacity:0.3;';
      const displayVal = isYzx ? '?' : v;
      return `<div class="die attack${canSelect ? ' selectable' : ''}${canSelect ? ' rolling' : ''}" style="${style}" data-idx="${i}" data-val="${v}">
        ${color && !isYzx ? `<div class="die-corner" style="color:${color.border};background:${color.bg}">${color.label}</div>` : ''}
        ${displayVal}
      </div>`;
    }).join('');
    if (S.atkResult) {
      const sum = S.atkResult.baseAtk;
      const bonus = S.atkResult.bonusDamage ? `+${S.atkResult.bonusDamage}` : '';
      html += `<span class="dice-sum" style="color:var(--gold)">= ${sum}${bonus}</span></div>`;
    } else {
      html += `</div>`;
    }
  }
  if (S.defenseRolls) {
    // 防御骰始终属于防御方
    const isMineDef = S.isMyDefendTurn;
    const canSelect = S.turnPhase === 'def_rolled' && isMineDef;
    const defPool = isMineDef ? myPool : opPool;
    html += `<div class="dice-row"><span class="dice-label" style="color:var(--blue)">守</span>`;
    html += S.defenseRolls.map((v, i) => {
      const face = defPool[i] || 6;
      const color = DICE_COLORS[face];
      const isYzx = !isMineDef && S.opponent.cardId === 'char_10';
      let style = color ? `border-color:${color.border}; color:${color.border};` : '';
      const displayVal = isYzx ? '?' : v;
      return `<div class="die defense${canSelect ? ' selectable' : ''}" style="${style}" data-idx="${i}" data-val="${v}">
        ${color && !isYzx ? `<div class="die-corner" style="color:${color.border};background:${color.bg}">${color.label}</div>` : ''}
        ${displayVal}
      </div>`;
    }).join('');
    html += `<span class="dice-sum" style="color:var(--blue)"></span></div>`;
  }
  area.innerHTML = html;
  area.querySelectorAll('.die.selectable').forEach(d => {
    d.addEventListener('click', () => { d.classList.toggle('selected'); updateActionButtons(); });
  });
  updateActionButtons();
}

function updateActionButtons() {
  const area = document.getElementById('dice-area');
  const btnReroll = document.getElementById('btn-reroll');
  const btnConfirm = document.getElementById('btn-confirm');
  if (!area) return;

  const sel = area.querySelectorAll('.die.selected');
  const count = sel.length;
  
  let currentSum = 0;
  sel.forEach(d => {
    currentSum += parseInt(d.dataset.val || '0');
  });
  
  if (btnReroll) {
    btnReroll.style.display = count > 0 && S.me.rerolls > 0 ? 'block' : 'none';
    if (S.me.buffs && S.me.buffs.find(b => b.id === 'sugar_crash')) {
      btnReroll.disabled = true;
      btnReroll.innerHTML = '🚫 犯糖';
    } else {
      btnReroll.disabled = false;
      btnReroll.innerHTML = '重投';
    }
  }
  
  if (btnConfirm) {
    const isAtk = S.turnPhase === 'atk_rolled' && S.isMyAttackTurn;
    const isDef = S.turnPhase === 'def_rolled' && S.isMyDefendTurn;
    const target = isAtk ? S.me.card.atkSlots : (isDef ? S.me.card.defSlots : 99);
    
    // 李灿献祭逻辑
    const btnSacrifice = document.getElementById('btn-sacrifice');
    if (btnSacrifice) {
      if (isDef && S.me.cardId === 'char_8' && count === target) {
        btnSacrifice.style.display = 'block';
      } else {
        btnSacrifice.style.display = 'none';
      }
    }

    if (target === -1) {
      // ... same
      if (count > 0) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = `✓ 确认 (已选 ${count} 颗) 总和:${currentSum}`;
      } else {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = `至少选 1 颗`;
      }
    } else {
      if (count === target) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = `✓ 确认 (${count}/${target}) 总和:${currentSum}`;
      } else {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = `需选 ${target} 颗 (已选 ${count})`;
      }
    }
  }
}

// 献祭弹窗
window._showSacrifice = () => {
  const sel = document.querySelectorAll('.die.defense.selected');
  let opts = '';
  sel.forEach(d => {
    opts += `<button class="btn btn-secondary" onclick="window._doSacrifice(${d.dataset.idx})">献祭 ${d.dataset.val}</button>`;
  });
  const m = document.createElement('div');
  m.className = 'result-overlay';
  m.id = 'sacrifice-modal';
  m.innerHTML = `<div class="panel"><h3>选择一个骰子进行献祭</h3><p>该骰子变1，回复其点数-1的HP</p>${opts}</div>`;
  document.body.appendChild(m);
};

window._doSacrifice = (idx) => {
  const indices = Array.from(document.querySelectorAll('.die.defense.selected')).map(d => parseInt(d.dataset.idx));
  gameSocket.confirmDice(indices, { sacrificeIndex: idx });
  document.getElementById('sacrifice-modal').remove();
};

// ── 增益/状态图标 ──
function buffIcons(p) {
  let h = '';
  if (p.hasReschedule) h += `<div class="buff-icon pos" title="拥有调课权">🔄</div>`;
  if (p.permanentDefPenalty) h += `<div class="buff-icon neg" title="体力透支: 防御力永久 -${p.permanentDefPenalty}">💦</div>`;
  if (p.buffs && p.buffs.find(b => b.id === 'sugar_crash')) h += `<div class="buff-icon neg" title="犯糖: 禁锢重投，回合开始受击">🍭</div>`;
  if (p.redHeat > 0) h += `<div class="buff-icon neg" title="红温: ${p.redHeat}层">🔥${p.redHeat}</div>`;
  return h;
}

// ── 攻击确认回调 ──
function onAtkConfirmed(data) {
  const ar = data.atkResult;
  const phase = document.getElementById('phase-text');
  if (phase) phase.innerHTML = buildAlerts(data);

  setTimeout(() => refreshAll(), 600);
}

// ── 辅助：构建提示信息 ──
function buildAlerts(data) {
  let alerts = '';
  const ar = data.atkResult || {};
  const defPosTriggered = data.defPosTriggered;
  const defNegTriggered = data.defNegTriggered;

  if (ar.posTriggered) alerts += `<div class="skill-alert positive">✦ ${ar.posName} 发动！</div>`;
  if (ar.negTriggered) alerts += `<div class="skill-alert negative">✧ ${ar.negName} 发动！</div>`;
  if (defPosTriggered) alerts += `<div class="skill-alert positive">✦ ${data.defPosName} 发动！</div>`;
  if (defNegTriggered) alerts += `<div class="skill-alert negative">✧ ${data.defNegName} 发动！</div>`;
  
  if (data.lcCounterDamage > 0) alerts += `<div class="skill-alert positive">🗡️ 反击伤害: ${data.lcCounterDamage}</div>`;
  if (data.lcHealTriggered) alerts += `<div class="skill-alert positive">💚 献祭回复: ${data.healAmount}HP</div>`;
  if (data.eatTriggered) alerts += `<div class="skill-alert positive">🍴 吃掉！攻击降为 2</div>`;
  if (data.noobTriggered) alerts += `<div class="skill-alert negative">✧ 杂鱼反噬 — 血量减半！</div>`;
  if (data.detonateTriggered) alerts += `<div class="skill-alert negative">💥 红温引爆 — ${data.detonateDamage}伤害！</div>`;
  if (data.redHeatApplied > 0) alerts += `<div class="skill-alert negative">🔥 红温 +${data.redHeatApplied}层</div>`;
  if (data.firstBloodTriggered) alerts += `<div class="skill-alert negative">📉 偏科 — 防御选骰数 -1！</div>`;
  if (data.extraTurnTriggered) alerts += `<div class="skill-alert positive">⚡ 逆袭 — 获得额外攻击回合！</div>`;

  return alerts;
}

// ── 回合结算回调 (含攻击动画) ──
export function onTurnResolved(data) {
  animLock = true;
  const newState = data.state;
  const { damage, finalDef, penalty, gameOver, attackerIdx } = data;

  const phase = document.getElementById('phase-text');
  const alerts = buildAlerts(data);
  if (phase && alerts) phase.innerHTML = alerts;

  const dArea = document.getElementById('dice-area');
  if (dArea) {
    const defSumEl = dArea.querySelector('.dice-row:last-child .dice-sum');
    if (defSumEl) defSumEl.innerHTML = `= ${finalDef}${penalty ? ` <small>(−${penalty})</small>` : ''}`;
  }

  setTimeout(() => {
    const isMyAtk = S.myIndex === attackerIdx;
    const atkCard = document.getElementById(isMyAtk ? 'card-me' : 'card-op');
    const defCard = document.getElementById(isMyAtk ? 'card-op' : 'card-me');

    if (atkCard) atkCard.classList.add('card-attacking');
    if (defCard) setTimeout(() => defCard.classList.add('card-hit'), 300);

    setTimeout(() => {
      const dmgEl = document.createElement('div');
      dmgEl.className = `floating-damage ${damage === 0 ? 'miss' : ''}`;
      dmgEl.textContent = damage > 0 ? `−${damage}` : 'MISS';
      if (defCard) defCard.appendChild(dmgEl);
      setHP('hp-me', newState.me.hp, newState.me.maxHp, 'hp-me-t');
      setHP('hp-op', newState.opponent.hp, newState.opponent.maxHp, 'hp-op-t');
      setTimeout(() => dmgEl.remove(), 1200);
    }, 400);

    setTimeout(() => {
      if (atkCard) atkCard.classList.remove('card-attacking');
      if (defCard) defCard.classList.remove('card-hit');
      // 不再在此处 showBanner，由 class_change 事件统一处理

      setTimeout(() => {
        S = newState;
        animLock = false;
        refreshAll();
        addLog(data);
        if (gameOver) setTimeout(() => showGameOver(S), 800);
      }, data.classChanged ? 1500 : 500);
    }, 1500);
  }, 800);
}

// ── 换课动画 ──
function showClassChange(data) {
  const s = SUBJECTS[data.subject];
  const overlay = document.createElement('div');
  overlay.className = 'class-change-overlay';
  overlay.innerHTML = `
    <div class="class-change-content">
      <div class="cc-icon">${s?.icon || '📝'}</div>
      <div class="cc-label">第 ${data.index + 1} 节课</div>
      <div class="cc-name">${s?.label || data.subject}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => { overlay.classList.add('fade-out'); setTimeout(() => overlay.remove(), 500); }, 1800);
}

// ── 调课权弹窗 ──
function showRescheduleModal() {
  const overlay = document.createElement('div');
  overlay.className = 'result-overlay';
  overlay.id = 'reschedule-modal';
  overlay.style.zIndex = '9999';
  
  let options = '';
  for(let i = S.currentClassIndex; i < S.schedule.length; i++) {
    options += `<option value="${i}">第 ${i+1} 节课 (${SUBJECTS[S.schedule[i]]?.label || S.schedule[i]})</option>`;
  }

  const makeBtn = (arr) => arr.map(id => {
    const s = SUBJECTS[id];
    return `<button onclick="window._pickSubj('${id}')">${s.icon} ${s.label}</button>`;
  }).join('');
  
  overlay.innerHTML = `
    <div class="panel" style="max-width:360px;width:90%;">
      <p class="section-title" style="margin-bottom:8px;">使用调课权</p>
      <div style="text-align:center; margin-bottom:12px;">
        <select id="reschedule-idx-select" style="padding:4px 8px; border-radius:4px; font-family:var(--font-body); font-size:0.85rem; border:1.5px solid var(--bg-inset); background:var(--bg-warm); outline:none;">
          ${options}
        </select>
      </div>
      <div class="subject-picker">
        <div class="picker-section-label">主科</div>${makeBtn(CORE_SUBJECTS)}
        <div class="picker-section-label">选科</div>${makeBtn(ELECTIVE_SUBJECTS)}
        <div class="picker-section-label">副科</div>${makeBtn(MINOR_SUBJECTS)}
      </div>
      <div style="text-align:center;margin-top:14px;">
        <button class="btn btn-secondary" onclick="document.getElementById('reschedule-modal').remove()">取消</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  window._pickSubj = (id) => { 
    const targetIdx = parseInt(document.getElementById('reschedule-idx-select').value);
    gameSocket.useReschedule(targetIdx, id); 
    overlay.remove(); 
  };
}

// ── 结算 ──
function showGameOver(s) {
  const o = document.createElement('div');
  o.className = 'game-over-screen';
  
  const isWin = s.winner === s.myIndex;
  const isDraw = s.winner === 'draw';
  const statusStr = isDraw ? '平 局' : (isWin ? '胜 利' : '败 北');
  const statusClass = isDraw ? 'draw' : (isWin ? 'win' : 'lose');
  
  const me = s.me;
  const op = s.opponent;

  function renderPlayer(p, index) {
    const isMe = index === s.myIndex;
    const card = p.card;
    const isYzx = p.cardId === 'char_10' && !isMe;
    const hpText = isYzx ? '??' : p.hp;
    const maxHpText = isYzx ? '??' : p.maxHp;
    const hpPercent = isYzx ? 100 : (p.hp / p.maxHp) * 100;

    return `
      <div class="player-box ${isMe ? 'me' : 'op'} ${isYzx ? 'stealth' : ''}">
        <div class="avatar-area">
          <img src="${card.image}" class="avatar" />
          ${isMe ? `<div class="badge-me">我</div>` : ''}
        </div>
        <div class="player-info">
          <div class="name-row">
            <span class="nickname">${p.nickname}</span>
            <span class="card-name">${card.name}</span>
          </div>
          <div class="hp-container">
            <div class="hp-bar">
              <div class="hp-bar-fill" style="width:${hpPercent}%"></div>
            </div>
            <div class="hp-text">${hpText} / ${maxHpText}</div>
          </div>
          <div class="buffs-row">${buffIcons(p)}</div>
        </div>
      </div>
    `;
  }
  
  o.innerHTML = `
    <div class="go-content ${statusClass}">
      <h1 class="go-title">${statusStr}</h1>
      <div class="go-stats">
        ${renderPlayer(me, s.myIndex)}
        <div class="go-vs">VS</div>
        ${renderPlayer(op, (s.myIndex + 1) % 2)}
      </div>
      <div class="go-footer">
        <button class="btn btn-primary btn-lg" id="btn-back" style="min-width: 200px; padding: 12px 0;">返回大厅</button>
      </div>
    </div>
  `;
  document.body.appendChild(o);
  document.getElementById('btn-back').addEventListener('click', () => { o.remove(); navigate('lobby'); });
}

// ── 日志 ──
function addLog(r) {
  const el = document.getElementById('battle-log');
  if (!el) return;
  const d = document.createElement('span');
  d.className = 'log-item';
  d.textContent = `${r.damage > 0 ? `−${r.damage}HP` : 'MISS'}${r.pierce ? ' 穿透' : ''}${r.selfDamage ? ` 自伤${r.selfDamage}` : ''}`;
  el.prepend(d);
}

// ── 辅助 ──
function curSubj() { return S.schedule[S.currentClassIndex] || S.schedule[S.schedule.length-1]; }
function pct(c,m) { return m>0 ? Math.max(0,Math.round(c/m*100)) : 0; }
function getM(p,subj) { return p.card ? getSkillMultiplier(p.card.subjects, subj) : 1; }

function multiTag(m) {
  if (m===2) return '<span class="multiplier x2">×2</span>';
  if (m===0.5) return '<span class="multiplier x05">×½</span>';
  return '<span class="multiplier x1">×1</span>';
}



function phasePrompt(s) {
  let p = '';
  if (s.turnPhase === 'waiting_atk') p = s.isMyAttackTurn ? '你的攻击回合' : '对手攻击中…';
  if (s.turnPhase === 'atk_rolled') p = s.isMyAttackTurn ? '选择骰子重投或确认' : '对手选择中…';
  if (s.turnPhase === 'def_rolled') p = s.isMyDefendTurn ? '你的防御 — 重投或确认' : '对手防御中…';
  
  if (s.allergyTriggered && s.isMyAttackTurn) {
    p = `<span style="color:var(--red); font-weight:bold;">⚠️ 过敏：伤害已锁定！</span><br/>${p}`;
  }
  return p;
}

function actionButtons(s) {
  if (s.turnPhase === 'waiting_atk' && s.isMyAttackTurn)
    return '<button id="btn-roll" class="btn btn-primary btn-lg">掷骰</button>';
  if (s.turnPhase === 'atk_rolled' && s.isMyAttackTurn)
    return `<div>
          <button id="btn-confirm" class="btn btn-success" disabled>✓ 确认</button>
        </div>` + `${s.me.card.atkSlots === -1 ? '至少选 1 颗' : `需选 ${s.me.card.atkSlots} 颗`}`;
  if (s.turnPhase === 'def_rolled' && s.isMyDefendTurn) {
    const sacBtn = s.me.cardId === 'char_8' ? '<button id="btn-sacrifice" class="btn btn-secondary" style="display:none;" onclick="window._showSacrifice()">🩸 献祭回血</button>' : '';
    return `<div>
          <button id="btn-confirm" class="btn btn-primary" disabled>✓ 确认</button>
          ${sacBtn}
        </div>` + `需选 ${s.me.card.defSlots} 颗`;
  }
  return `<span style="color:var(--text-muted);font-size:.88rem">${phasePrompt(s)}</span>`;
}

function scheduleHTML(s) {
  return s.schedule.map((subj, i) => {
    const info = SUBJECTS[subj];
    const active = i === s.currentClassIndex;
    const past = i < s.currentClassIndex;
    return `<div class="sch-item${active?' active':''}" style="${past?'opacity:.35':''}">
      <span>${info?.icon||'📝'}</span><span class="sch-label">${info?.label||subj}</span>
    </div>`;
  }).join('');
}

function setHP(barId, hp, maxHp, txtId) {
  const bar = document.getElementById(barId);
  const txt = document.getElementById(txtId);
  const isHidden = hp === '??';
  if (bar) bar.style.width = isHidden ? '100%' : `${pct(hp, maxHp)}%`;
  if (txt) txt.textContent = isHidden ? '??' : hp;
}

function on(id, evt, fn) { document.getElementById(id)?.addEventListener(evt, fn); }
function disableBtn(id) { const b = document.getElementById(id); if(b) b.disabled = true; }
function hide(id) { const b = document.getElementById(id); if(b) b.style.display = 'none'; }

function showBanner(text) {
  const b = document.createElement('div');
  b.className = 'class-banner';
  b.textContent = text;
  document.body.appendChild(b);
  setTimeout(() => b.classList.add('fade-out'), 1500);
  setTimeout(() => b.remove(), 2000);
}
function setText(id, html) { const e = document.getElementById(id); if(e) e.innerHTML = html; }
