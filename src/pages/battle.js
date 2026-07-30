// ============================================================
// 校园战力党 — 对战页面 (阶段制 · 卡牌动画)
// ============================================================
import { gameSocket } from '../net/socket.js';
import { navigate } from '../main.js';
import { SUBJECTS, CORE_SUBJECTS, ELECTIVE_SUBJECTS, MINOR_SUBJECTS, getSkillMultiplier, DICE_COLORS, IDENTITY } from '../../shared/rules.js';

let S; // module-level state ref
let animLock = false; // prevent state_update during animations

const identityName = (id) => {
  switch(id) {
    case IDENTITY.LORD: return '👑 主公';
    case IDENTITY.LOYALIST: return '🛡️ 忠臣';
    case IDENTITY.REBEL: return '🐺 反贼';
    case IDENTITY.SPY: return '🕵️ 内奸';
    default: return '❓ 身份';
  }
};

export function renderBattle(container, data) {
  S = data.state;
  animLock = false; // 重置动画锁
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
  gameSocket.on('buy_water_result', (d) => {
    S = d.state;
    refreshAll();
    showBanner(`买水成功！当前蓄势: ${d.chargeStacks} 层`);
  });

  return () => {};
}

// ── HTML 骨架 ──
function buildArena(s) {
  const me = s.me, op = s.opponent;
  const subj = s.schedule[s.currentClassIndex];
  
  window.selectFfaTarget = (pid) => {
    if (S.turnPhase === 'choose_target' && S.isMyAttackTurn) {
      gameSocket.selectTarget(pid);
    }
  };
  return `
    <div class="arena">
      <aside class="sidebar sidebar-left" id="sidebar-schedule">
        <div class="sidebar-title">课程表</div>
        ${scheduleHTML(s)}
        ${me.hasReschedule ? '<button id="btn-reschedule" class="btn btn-secondary" style="width:100%;margin-top:8px;font-size:.78rem;">调课</button>' : ''}
      </aside>

      <main class="arena-center">
        <div class="card-row">
          ${ s.gameMode === 'sanguosha' ? `<div id="ffa-grid-container">${buildFfaGrid(s)}</div>` : `
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
            ${s.gameMode === 'sanguosha' ? `<div class="bc-identity-badge">${identityName(op.identity)}</div>` : ''}
            <div class="skill-desc-box">
              ${op.card?.positiveSkill ? `<div class="skill-desc-line pos">✦ ${op.card.positiveSkill.name}: ${op.card.positiveSkill.desc}</div>` : ''}
              ${op.card?.neutralSkill ? `<div class="skill-desc-line neu">⬩ ${op.card.neutralSkill.name}: ${op.card.neutralSkill.desc}</div>` : ''}
              ${op.card?.negativeSkill ? `<div class="skill-desc-line neg">✧ ${op.card.negativeSkill.name}: ${op.card.negativeSkill.desc}</div>` : ''}
            </div>
            <div class="bc-buffs" id="buffs-op">${buffIcons(op)}</div>
          </div>
          `}

          <div class="vs-area" id="vs-area">
            <div id="phase-text" class="phase-text">${phasePrompt(s)}</div>
          </div>

          <div class="battle-card-wrap self-side ${s.attackerIdx === s.myIndex ? 'active-attacker' : ''} ${me.isDead ? 'dead' : ''}" id="card-me">
            <div class="bc-multi" id="multi-me">${multiTag(getM(me,subj))}</div>
            <div class="battle-card" style="border: 3px solid ${s.attackerIdx === s.myIndex ? 'var(--red)' : 'transparent'}">
              <img src="${me.card?.image||''}" alt="" onerror="this.style.display='none'">
              <div class="bc-name">${me.card?.name||'???'}</div>
              ${s.attackerIdx === s.myIndex ? `<div class="atk-badge-lg">ATTACKING</div>` : ''}
              ${me.isDead ? `<div class="dead-overlay">已阵亡</div>` : ''}
            </div>
            <div class="bc-hp">
              <div class="hp-bar-h friendly" id="hp-me" style="width:${pct(me.hp,me.maxHp)}%"></div>
              <span class="hp-label" id="hp-me-t">${me.hp}</span>
            </div>
            ${s.gameMode === 'sanguosha' ? `<div class="bc-identity-badge">${identityName(me.identity)}</div>` : ''}
            <div class="skill-desc-box">
              ${me.card?.positiveSkill ? `<div class="skill-desc-line pos">✦ ${me.card.positiveSkill.name}: ${me.card.positiveSkill.desc}</div>` : ''}
              ${me.card?.neutralSkill ? `<div class="skill-desc-line neu">⬩ ${me.card.neutralSkill.name}: ${me.card.neutralSkill.desc}</div>` : ''}
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
  const buy = document.getElementById('btn-buy-water');
  if (buy) buy.onclick = () => { gameSocket.buyWater(); disableBtn('btn-buy-water'); };
}

// ── 刷新所有 UI ──
function refreshAll() {
  const subj = curSubj();
  // HP
  // HP
  setHP('hp-me', S.me.hp, S.me.maxHp, 'hp-me-t');
  if (S.gameMode === '1v1') {
    setHP('hp-op', S.opponent.hp, S.opponent.maxHp, 'hp-op-t');
    setText('multi-op', multiTag(getM(S.opponent, subj)));
    const bOp = document.getElementById('buffs-op'); if (bOp) bOp.innerHTML = buffIcons(S.opponent);
  } else {
    const grid = document.getElementById('ffa-grid-container');
    if (grid) grid.innerHTML = buildFfaGrid(S);
  }
  // Multipliers & Buffs
  setText('multi-me', multiTag(getM(S.me, subj)));
  const bMe = document.getElementById('buffs-me'); if (bMe) bMe.innerHTML = buffIcons(S.me);
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

// ── FFA UI ──
function buildFfaGrid(s) {
  const me = s.me;
  const others = s.players.filter(p => p.id !== me.id);
  const isTargeting = s.turnPhase === 'choose_target' && s.isMyAttackTurn;
  
  let html = `<div class="ffa-opponents-grid" style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-bottom:12px;">`;
  others.forEach(p => {
    const isDefender = s.defenderIdx !== null && s.players[s.defenderIdx]?.id === p.id;
    const isAttacker = s.attackerIdx !== null && s.players[s.attackerIdx]?.id === p.id;
    const canBeTargeted = isTargeting && !p.isDead;
    const identityDisplay = p.identity === 'lord' ? '👑主' : (p.identity === '?' ? '❓' : identityName(p.identity));
    
    html += `
      <div class="ffa-micro-card ${isDefender ? 'active-target' : ''} ${isAttacker ? 'active-attacker' : ''} ${p.isDead ? 'dead' : ''} ${canBeTargeted ? 'selectable-target' : ''}" 
           style="position:relative; width:80px; background:var(--bg-card); border:2px solid ${isDefender ? 'var(--red)' : (isAttacker ? 'var(--gold)' : (canBeTargeted ? 'var(--accent)' : 'var(--bg-inset)'))}; border-radius:8px; padding:4px; text-align:center; cursor:${canBeTargeted ? 'pointer' : 'default'}; transition:all 0.2s;"
           ${canBeTargeted ? `onclick="window.selectFfaTarget('${p.id}')"` : ''}>
        <div style="font-size:10px; color:var(--text-secondary); margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.nickname}</div>
        <div class="micro-avatar-wrap" style="position:relative;">
          <img src="${p.card?.image||''}" alt="" onerror="this.style.display='none'" style="width:40px; height:40px; border-radius:50%; object-fit:cover; margin:0 auto; display:block; filter:${p.isDead ? 'grayscale(1)' : 'none'}">
          ${isAttacker ? `<div class="atk-badge" style="position:absolute; bottom:-4px; left:50%; transform:translateX(-50%); background:var(--red); color:#fff; font-size:8px; padding:0 4px; border-radius:4px; font-weight:900;">ATK</div>` : ''}
          ${p.isDead ? `<div style="position:absolute; inset:0; background:rgba(0,0,0,0.4); border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; font-weight:900;">已阵亡</div>` : ''}
        </div>
        <div style="position:absolute; top:-4px; right:-4px; background:var(--bg-overlay); border-radius:10px; font-size:10px; padding:0 4px; border:1px solid var(--border);">${identityDisplay}</div>
        <div class="hp-bar-h enemy" style="width:${pct(p.hp,p.maxHp)}%; height:4px; margin-top:4px; border-radius:2px;"></div>
        <div style="font-size:9px; color:var(--text-main); margin-top:2px;">${p.hp}/${p.maxHp}</div>
      </div>
    `;
  });
  html += `</div>`;
  if (isTargeting) {
    html += `<div style="text-align:center; color:var(--accent); font-weight:bold; font-size:1.1rem; animation:pulse 1s infinite;">请选择你要攻击的目标！</div>`;
  }
  return html;
}

// ── 掷骰展示 ──
function renderDice() {
  const area = document.getElementById('dice-area');
  if (!area) return;

  const isMeAtk = S.myIndex === S.attackerIdx;
  const isMeDef = S.myIndex === S.defenderIdx;

  let atkPlayer, defPlayer;
  if (S.gameMode === '1v1') {
    atkPlayer = isMeAtk ? S.me : S.opponent;
    defPlayer = isMeAtk ? S.opponent : S.me;
  } else {
    atkPlayer = S.players[S.attackerIdx];
    defPlayer = S.defenderIdx !== null ? S.players[S.defenderIdx] : null;
  }

  const atkPool = atkPlayer?.card?.dicePool || [];
  const defPool = defPlayer?.card?.dicePool || [];

  let html = '';
  if (S.attackRolls) {
    // 攻击骰：由 attackerIdx 掷出
    const canSelect = S.turnPhase === 'atk_rolled' && S.isMyAttackTurn;
    html += `<div class="dice-row"><span class="dice-label" style="color:var(--gold)">攻</span>`;
    html += S.attackRolls.map((v, i) => {
      const isKept = S.atkResult?.keptIndices?.includes(i);
      let face = atkPool[i] || 6;
      if (S.isExtraTurn && S.extraTurnFaceBoost) {
        face += S.extraTurnFaceBoost;
      }
      // 殷泽轩屏蔽：如果不是我掷出的且对方是 YZX
      const isYzx = v === -1;
      const color = DICE_COLORS[face];
      let style = color ? `border-color:${color.border}; color:${color.border};` : '';
      if (S.atkResult && !isKept) style += 'opacity:0.3;';
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
  if (S.defenseRolls || (S.aoeDefenses && S.aoeDefenses[S.me.id] && S.aoeDefenses[S.me.id].rolls)) {
    // 防御骰
    const canSelect = S.turnPhase === 'def_rolled' && S.isMyDefendTurn;
    const rollsToRender = S.aoeDefenses ? S.aoeDefenses[S.me.id].rolls : S.defenseRolls;
    const isConfirmed = S.aoeDefenses ? S.aoeDefenses[S.me.id].confirmed : false;
    
    html += `<div class="dice-row"><span class="dice-label" style="color:var(--blue)">守</span>`;
    if (rollsToRender) {
      html += rollsToRender.map((v, i) => {
        const face = defPool[i] || 6;
        const color = DICE_COLORS[face];
        // 如果点数是 -1，说明被后端屏蔽了
        const isYzx = v === -1;
        let style = color ? `border-color:${color.border}; color:${color.border};` : '';
        if (isConfirmed) style += 'opacity:0.5;';
        const displayVal = isYzx ? '?' : v;
        return `<div class="die defense${(canSelect && !isConfirmed) ? ' selectable' : ''}" style="${style}" data-idx="${i}" data-val="${v}">
          ${color && !isYzx ? `<div class="die-corner" style="color:${color.border};background:${color.bg}">${color.label}</div>` : ''}
          ${displayVal}
        </div>`;
      }).join('');
    }
    html += `<span class="dice-sum" style="color:var(--blue)">${isConfirmed ? ' 已确认' : ''}</span></div>`;
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
  let alerts = [];
  const ar = data.atkResult || {};

  if (ar.posTriggered) alerts.push(`<div class="skill-alert positive">✦ ${ar.posName} 发动！</div>`);
  if (ar.negTriggered) alerts.push(`<div class="skill-alert negative">✧ ${ar.negName} 发动！</div>`);

  const results = data.isAoE ? data.aoeResults : [data];

  results.forEach(res => {
    if (res.defPosTriggered) alerts.push(`<div class="skill-alert positive">✦ ${res.defPosName} 发动！</div>`);
    if (res.defNegTriggered) alerts.push(`<div class="skill-alert negative">✧ ${res.defNegName} 发动！</div>`);
    
    if (res.lcCounterDamage > 0) alerts.push(`<div class="skill-alert positive">🗡️ 反击伤害: ${res.lcCounterDamage}</div>`);
    if (res.lcHealTriggered) alerts.push(`<div class="skill-alert positive">💚 献祭回复: ${res.healAmount}HP</div>`);
    if (res.eatTriggered) alerts.push(`<div class="skill-alert positive">🍴 吃掉！攻击降为 2</div>`);
    if (res.noobTriggered) alerts.push(`<div class="skill-alert negative">✧ 杂鱼反噬 — 血量减半！</div>`);
    if (res.detonateTriggered) alerts.push(`<div class="skill-alert negative">💥 红温引爆 — ${res.detonateDamage}伤害！</div>`);
    if (res.redHeatApplied > 0) alerts.push(`<div class="skill-alert negative">🔥 红温 +${res.redHeatApplied}层</div>`);
    if (res.extraTurnTriggered) alerts.push(`<div class="skill-alert positive">⚡ 死磕 — 获得额外攻击回合！</div>`);
  });

  if (data.firstBloodTriggered) alerts.push(`<div class="skill-alert negative">📉 偏科 — 防御选骰数 -1！</div>`);

  return [...new Set(alerts)].join('');
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

  const isAoE = data.isAoE;
  
  if (isAoE) {
    // FFA 群伤效果动画
    setTimeout(() => {
      const isMyAtk = S.myIndex === attackerIdx;
      const atkId = S.players[attackerIdx].id;
      const atkCard = atkId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${atkId}"]`);
      if (atkCard) atkCard.classList.add('card-attacking');
      
      data.aoeResults.forEach(res => {
        const dId = res.playerId;
        const dCard = dId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${dId}"]`);
        if (dCard) setTimeout(() => dCard.classList.add('card-hit'), 300);
        
        setTimeout(() => {
          const dmgEl = document.createElement('div');
          dmgEl.className = `floating-damage ${res.damage === 0 ? 'miss' : ''}`;
          dmgEl.textContent = res.damage > 0 ? `−${res.damage}` : 'MISS';
          if (dCard) dCard.appendChild(dmgEl);
          setTimeout(() => dmgEl.remove(), 1200);
        }, 400);
      });
      
      setTimeout(() => {
        setHP('hp-me', newState.me.hp, newState.me.maxHp, 'hp-me-t');
      }, 400);

      setTimeout(() => {
        if (atkCard) atkCard.classList.remove('card-attacking');
        data.aoeResults.forEach(res => {
          const dId = res.playerId;
          const dCard = dId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${dId}"]`);
          if (dCard) dCard.classList.remove('card-hit');
        });
        
        setTimeout(() => {
          S = newState;
          animLock = false;
          refreshAll();
          addLog(data); // TODO aoe log
          if (data.gameOver) setTimeout(() => showGameOver(S), 800);
        }, data.classChanged ? 1500 : 500);
      }, 1500);
    }, 800);
  } else {
    // 1v1 动画
    setTimeout(() => {
      const isMyAtk = S.myIndex === attackerIdx;
      let atkCard, defCard;
      if (S.gameMode === '1v1') {
        atkCard = document.getElementById(isMyAtk ? 'card-me' : 'card-op');
        defCard = document.getElementById(isMyAtk ? 'card-op' : 'card-me');
      } else {
        const atkId = S.players[attackerIdx].id;
        const defId = S.defenderIdx !== null ? S.players[S.defenderIdx].id : null;
        atkCard = atkId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${atkId}"]`);
        defCard = defId === S.me.id ? document.getElementById('card-me') : (defId ? document.querySelector(`.ffa-micro-card[data-pid="${defId}"]`) : null);
      }

      if (atkCard) atkCard.classList.add('card-attacking');
      if (defCard) setTimeout(() => defCard.classList.add('card-hit'), 300);

      setTimeout(() => {
        const dmgEl = document.createElement('div');
        dmgEl.className = `floating-damage ${damage === 0 ? 'miss' : ''}`;
        dmgEl.textContent = damage > 0 ? `−${damage}` : 'MISS';
        if (defCard) defCard.appendChild(dmgEl);
        setHP('hp-me', newState.me.hp, newState.me.maxHp, 'hp-me-t');
        if (newState.gameMode === '1v1') {
          setHP('hp-op', newState.opponent.hp, newState.opponent.maxHp, 'hp-op-t');
        }
        setTimeout(() => dmgEl.remove(), 1200);
      }, 400);

      setTimeout(() => {
        if (atkCard) atkCard.classList.remove('card-attacking');
        if (defCard) defCard.classList.remove('card-hit');
        
        setTimeout(() => {
          S = newState;
          animLock = false;
          refreshAll();
          addLog(data);
          if (data.gameOver) setTimeout(() => showGameOver(S), 800);
        }, data.classChanged ? 1500 : 500);
      }, 1500);
    }, 800);
  }
}

// ── 换课动画 ──
function showClassChange(data) {
  if (animLock) {
    setTimeout(() => showClassChange(data), 500);
    return;
  }
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
  
  let isWin = false;
  let statusStr = '';
  
  if (s.gameMode === '1v1') {
    isWin = s.winner === s.myIndex;
    const isDraw = s.winner === 'draw';
    statusStr = isDraw ? '平 局' : (isWin ? '胜 利' : '败 北');
  } else {
    // FFA
    if (s.winner === 'lord') {
      isWin = s.me.identity === 'lord' || s.me.identity === 'loyalist';
      statusStr = isWin ? '胜 利 (主公/忠臣 赢)' : '败 北 (主公/忠臣 赢)';
    } else if (s.winner === 'rebel') {
      isWin = s.me.identity === 'rebel';
      statusStr = isWin ? '胜 利 (反贼 赢)' : '败 北 (反贼 赢)';
    } else if (s.winner === 'spy') {
      isWin = s.me.identity === 'spy';
      statusStr = isWin ? '胜 利 (内奸 赢)' : '败 北 (内奸 赢)';
    }
  }

  const statusClass = (s.gameMode === '1v1' && s.winner === 'draw') ? 'draw' : (isWin ? 'win' : 'lose');

  function renderPlayer(p, index) {
    if (!p) return '';
    const isMe = index === s.myIndex;
    const card = p.card;
    const isYzx = p.cardId === 'char_10' && !isMe;
    const hpText = isYzx ? '??' : p.hp;
    const maxHpText = isYzx ? '??' : p.maxHp;
    const hpPercent = isYzx ? 100 : (p.hp / p.maxHp) * 100;
    const identityHtml = s.gameMode === 'sanguosha' ? `<div style="color:var(--accent);font-size:0.8rem;margin-top:4px;">身份: ${p.identity==='lord'?'👑主公':(p.identity==='?'?'❓':p.identity)}</div>` : '';

    return `
      <div class="player-box ${isMe ? 'me' : 'op'} ${isYzx ? 'stealth' : ''}" style="${s.gameMode === 'sanguosha' ? 'width:45%; margin-bottom:10px;' : ''}">
        <div class="avatar-area">
          <img src="${card.image}" class="avatar" />
          ${isMe ? `<div class="badge-me">我</div>` : ''}
        </div>
        <div class="player-info">
          <div class="name-row">
            <span class="nickname">${p.nickname}</span>
            <span class="card-name">${card.name}</span>
          </div>
          ${identityHtml}
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
  
  let statsHtml = '';
  if (s.gameMode === '1v1') {
    statsHtml = `
      ${renderPlayer(s.me, s.myIndex)}
      <div class="go-vs">VS</div>
      ${renderPlayer(s.opponent, (s.myIndex + 1) % 2)}
    `;
  } else {
    statsHtml = `<div style="display:flex; flex-wrap:wrap; justify-content:space-between; max-height:400px; overflow-y:auto; width:100%;">`;
    s.players.forEach((p, idx) => {
      statsHtml += renderPlayer(p, idx);
    });
    statsHtml += `</div>`;
  }

  o.innerHTML = `
    <div class="go-content ${statusClass}" style="${s.gameMode==='sanguosha'?'width:90%; max-width:800px;':''}">
      <h1 class="go-title">${statusStr}</h1>
      <div class="go-stats" style="${s.gameMode==='sanguosha'?'flex-direction:row; flex-wrap:wrap;':''}">
        ${statsHtml}
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
function pct(c,m) { if (typeof c !== 'number' || typeof m !== 'number') return 100; return m>0 ? Math.max(0,Math.round(c/m*100)) : 0; }
function getM(p,subj) { return p.card ? getSkillMultiplier(p.card.subjects, subj) : 1; }

function multiTag(m) {
  if (m===2) return '<span class="multiplier x2">×2</span>';
  if (m===0.5) return '<span class="multiplier x05">×½</span>';
  return '<span class="multiplier x1">×1</span>';
}



function phasePrompt(s) {
  let p = '';
  if (s.turnPhase === 'choose_target') p = s.isMyAttackTurn ? '选择目标' : '等待攻击方选择目标…';
  if (s.turnPhase === 'waiting_atk') p = s.isMyAttackTurn ? '你的攻击回合' : '等待攻击…';
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
  if (s.turnPhase === 'atk_rolled' && s.isMyAttackTurn) {
    const buyBtn = (s.me.cardId === 'char_14' && !s.hasAttackerRerolled && s.me.chargeStacks < 2) 
      ? '<button id="btn-buy-water" class="btn btn-secondary" style="margin-left:8px;">💧 买水</button>' 
      : '';
    return `<div>
          <button id="btn-confirm" class="btn btn-success" disabled>✓ 确认</button>
          ${buyBtn}
        </div>` + `${s.me.card.atkSlots === -1 ? '至少选 1 颗' : `需选 ${s.me.card.atkSlots} 颗`}`;
  }
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
