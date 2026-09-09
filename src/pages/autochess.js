// ============================================================
// 校园战力党 — 货币战争 前端页面
// ============================================================
import { gameSocket } from '../net/socket.js';
import { navigate } from '../main.js';
import { AC_CHAR_MAP, HEX_SUBJECTS, BEVERAGES, AC } from '../../shared/autochess-config.js';
import { escapeHTML } from '../utils/html.js';

const SUBJECT_LABELS = {
  physics: '物理', chemistry: '化学', biology: '生物',
  history: '历史', geography: '地理', politics: '政治',
  chinese: '语文', math: '数学', english: '英语',
};
const SUBJECT_ICONS = {
  physics: '⚡', chemistry: '🧪', biology: '🧬',
  history: '📜', geography: '🌍', politics: '⚖️',
  chinese: '📖', math: '🔢', english: '🔤',
};

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clampStar(value) {
  return Math.max(0, Math.min(3, Math.floor(Number(value) || 0)));
}

function starText(value) {
  const star = clampStar(value);
  return '★'.repeat(star) + '☆'.repeat(3 - star);
}

export function renderAutochess(container, data = {}) {
  let run = data.run || null;

  function render() {
    if (!run) {
      container.innerHTML = `<div class="ac-loading">正在创建对局…</div>`;
      return;
    }

    const planeEnvironments = safeArray(run.planeEnvironments);
    const nodeTypes = safeArray(run.nodeTypes);
    const board = run.board && typeof run.board === 'object' ? run.board : {};
    const hexSlots = board.hexSlots && typeof board.hexSlots === 'object' ? board.hexSlots : {};
    const core = board.core || null;
    const bench = safeArray(run.bench);
    const shop = safeArray(run.shop);
    const env = planeEnvironments[run.currentPlane] || '';
    const envLabel = SUBJECT_LABELS[env] || env;
    const envIcon = SUBJECT_ICONS[env] || '';
    const nodeType = run.currentNodeType || 'normal';
    const nodeLabel = { normal: '普通', elite: '精英', boss: 'Boss', event: '事件' }[nodeType] || nodeType;

    // HP 百分比
    const hpPct = Number.isFinite(run.commanderHP) && Number.isFinite(run.maxCommanderHP) && run.maxCommanderHP > 0
      ? Math.max(0, Math.min(100, Math.round((run.commanderHP / run.maxCommanderHP) * 100)))
      : 0;
    const hpColor = hpPct > 50 ? 'var(--green)' : hpPct > 25 ? 'var(--gold)' : 'var(--red)';

    // 连胜败
    let streakHtml = '';
    if (run.winStreak > 0) streakHtml = `<span class="ac-streak win">${escapeHTML(run.winStreak)}连胜</span>`;
    else if (run.loseStreak > 0) streakHtml = `<span class="ac-streak lose">${escapeHTML(run.loseStreak)}连败</span>`;

    container.innerHTML = `
      <div class="ac-page">
        <div class="ac-topbar-wrapper">
          <div class="ac-topbar">
            <div class="ac-stat ac-stat-gold"><span class="ac-label">金</span><span class="ac-val">${escapeHTML(run.gold)}</span></div>
            <div class="ac-stat"><span class="ac-label">Lv.${escapeHTML(run.level)}</span><span class="ac-val" style="font-size:0.75rem;color:var(--text-muted)">(${escapeHTML(run.xp)}/${escapeHTML(run.xpToNext || 'Max')})</span></div>
            <div class="ac-hp-wrap">
              <div class="ac-hp-bar-bg"><div class="ac-hp-bar-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
              <span class="ac-hp-text">${escapeHTML(run.commanderHP)}</span>
            </div>
            ${streakHtml}
          </div>
          <div class="ac-planes">
            ${planeEnvironments.map((pe, i) => `
              <div class="ac-plane ${i === run.currentPlane ? 'active' : i < run.currentPlane ? 'done' : ''}">
                <span class="ac-plane-icon">${SUBJECT_ICONS[pe] || ''}</span>
                <span class="ac-plane-label">${escapeHTML(SUBJECT_LABELS[pe] || pe)}</span>
                ${i === run.currentPlane ? `<span class="ac-plane-node">${escapeHTML(nodeLabel)} ${escapeHTML((Number(run.currentNode) || 0) + 1)}/${escapeHTML(safeArray(nodeTypes[i]).length || '?')}</span>` : ''}
              </div>
            `).join('<span class="ac-plane-arrow">›</span>')}
          </div>
          ${safeArray(nodeTypes[run.currentPlane]).length > 0 ? (() => {
            const nodes = safeArray(nodeTypes[run.currentPlane]);
            const pct = Math.max(0, Math.min(100, Math.round(((Number(run.currentNode) || 0) / nodes.length) * 100)));
            return `<div class="ac-plane-progress"><div class="ac-plane-progress-fill" style="width:${pct}%"></div></div>`;
          })() : ''}
        </div>

        <div class="ac-board-section">
          <div class="ac-board">
            ${HEX_SUBJECTS.map((subj, i) => {
              const entry = hexSlots[subj];
              const charCfg = entry ? AC_CHAR_MAP[entry.charId] : null;
              const matched = charCfg?.electives?.includes(subj);
              const envMatched = env === subj;
              const efficacy = envMatched && matched ? '200%' : matched ? '100%' : entry ? '降星' : '';
              return `
                <div class="ac-hex-slot" data-slot="${subj}" data-index="${i}">
                <div class="ac-hex-label">${SUBJECT_ICONS[subj] || ''} ${escapeHTML(SUBJECT_LABELS[subj] || subj)}</div>
                  ${entry ? `
                    <div class="ac-hex-char ${envMatched && matched ? 'env-match' : matched ? 'matched' : 'mismatched'}">
                      <img class="ac-avatar" src="${escapeHTML(charCfg?.image || '')}" onerror="this.remove()">
                      <span class="ac-char-star">${starText(entry.star)}</span>
                      <span class="ac-efficacy">${efficacy}</span>
                    </div>
                  ` : `<div class="ac-hex-empty">空</div>`}
                </div>
              `;
            }).join('')}
            <div class="ac-core-slot" data-slot="core">
              ${core ? (() => {
                const c = AC_CHAR_MAP[core.charId];
                return `
                  <div class="ac-core-char">
                    <span class="ac-core-label">阵眼</span>
                    <img class="ac-avatar" src="${escapeHTML(c?.image || '')}" onerror="this.remove()">
                    <span class="ac-char-star">${starText(core.star)}</span>
                  </div>
                `;
              })() : `<div class="ac-core-empty">阵眼</div>`}
            </div>
          </div>

          <div class="ac-actions">
            ${run.phase === 'shop' ? `
              <button id="ac-btn-refresh" class="btn btn-secondary">刷新 ${AC.SHOP_REFRESH_COST}金</button>
              <button id="ac-btn-buyxp" class="btn btn-secondary">经验 ${AC.XP_BUY_COST}金</button>
              <button id="ac-btn-fight" class="btn btn-primary btn-lg" ${!core ? 'disabled' : ''}>自动战斗</button>
              <button id="ac-btn-manual" class="btn btn-secondary btn-lg" ${!core ? 'disabled' : ''}>手动战斗</button>
            ` : run.phase === 'event' ? `
              <button id="ac-btn-event" class="btn btn-primary btn-lg" style="width:100%">探索事件</button>
            ` : run.phase === 'victory' ? `
              <div class="ac-result ac-victory">
                <div class="ac-result-title">通关成功</div>
                <div class="ac-result-subtitle">恭喜你在货币战争中存活了下来</div>
                <div class="ac-result-stats">
                  <div class="ac-rs"><span>胜场</span><span>${escapeHTML(run.stats?.battlesWon || 0)}</span></div>
                  <div class="ac-rs"><span>总回合</span><span>${escapeHTML(run.stats?.roundsPlayed || 0)}</span></div>
                  <div class="ac-rs"><span>剩余HP</span><span>${escapeHTML(run.commanderHP)}/${escapeHTML(run.maxCommanderHP)}</span></div>
                  <div class="ac-rs"><span>等级</span><span>Lv.${escapeHTML(run.level)}</span></div>
                </div>
                <button id="ac-btn-home" class="btn btn-primary btn-lg" style="width:100%;margin-top:12px;">返回大厅</button>
              </div>
            ` : run.phase === 'defeat' ? `
              <div class="ac-result ac-defeat">
                <div class="ac-result-title">Game Over</div>
                <div class="ac-result-subtitle">指挥官HP归零，下次再战</div>
                <div class="ac-result-stats">
                  <div class="ac-rs"><span>到达</span><span>位面${escapeHTML(run.currentPlane + 1)} 节点${escapeHTML(run.currentNode + 1)}</span></div>
                  <div class="ac-rs"><span>胜场</span><span>${escapeHTML(run.stats?.battlesWon || 0)}</span></div>
                  <div class="ac-rs"><span>等级</span><span>Lv.${escapeHTML(run.level)}</span></div>
                </div>
                <button id="ac-btn-home" class="btn btn-primary btn-lg" style="width:100%;margin-top:12px;">返回大厅</button>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="ac-sidebar">
          ${run.hasBeverageShop && !run.beveragePurchasedThisNode && run.phase === 'shop' ? `
            <div class="ac-beverage-shop">
              <h3>特供商店</h3>
              <div class="ac-bev-list">
                ${(BEVERAGES || []).map(b => `
              <button class="ac-bev-item" data-bev="${escapeHTML(b.id)}" ${run.gold < b.cost ? 'disabled' : ''}>
                    <span class="ac-bev-name">${escapeHTML(b.name)}</span>
                    <span class="ac-bev-cost">${escapeHTML(b.cost)}金</span>
                    <span class="ac-bev-desc">${escapeHTML(b.desc)}</span>
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          ${run.phase === 'shop' || run.phase === 'event' ? `
            <div class="ac-shop">
              <h3>商店 · ${envIcon} ${escapeHTML(envLabel)}</h3>
              <div class="ac-shop-items">
                ${shop.map((item, i) => {
                  if (!item) return `<div class="ac-shop-slot empty">—</div>`;
                  const c = AC_CHAR_MAP[item.charId];
                  if (!c) return `<div class="ac-shop-slot empty">?</div>`;
                  return `
                    <button class="ac-shop-slot cost-${escapeHTML(item.cost)}" data-shop="${i}" ${run.gold < item.cost ? 'disabled' : ''}>
                      <span class="ac-shop-cost">${escapeHTML(item.cost)}</span>
                      <img class="ac-avatar" src="${escapeHTML(c.image || '')}" onerror="this.remove()">
                      <span class="ac-shop-star">${'★'.repeat(1)}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <div class="ac-bench">
            <h3>备战席 ${bench.length}</h3>
            <div class="ac-bench-list">
              ${bench.map((entry, i) => {
                const c = AC_CHAR_MAP[entry.charId];
                if (!c) return '';
                return `
                  <div class="ac-bench-item cost-${c.cost || 1}" data-bench="${i}" draggable="true">
                    <img class="ac-bench-avatar" src="${escapeHTML(c.image || '')}" onerror="this.remove()">
                    <span class="ac-bench-star">${starText(entry.star)}</span>
                    <button class="ac-bench-sell" data-idx="${i}">×</button>
                  </div>
                `;
              }).join('')}
              ${bench.length === 0 ? '<p class="ac-empty-hint">从商店购买角色</p>' : ''}
            </div>
          </div>
        </div>

        <div id="ac-combat-log" class="ac-combat-log" style="display:none;"></div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // 商店购买
    container.querySelectorAll('.ac-shop-slot[data-shop]').forEach(el => {
      el.addEventListener('click', () => gameSocket.emit('ac_buy', { shopIndex: parseInt(el.dataset.shop) }));
    });

    const q = (sel) => container.querySelector(sel);

    q('#ac-btn-refresh')?.addEventListener('click', () => gameSocket.emit('ac_refresh_shop'));
    q('#ac-btn-buyxp')?.addEventListener('click', () => gameSocket.emit('ac_buy_xp'));
    q('#ac-btn-fight')?.addEventListener('click', () => gameSocket.emit('ac_start_combat'));
    q('#ac-btn-manual')?.addEventListener('click', () => gameSocket.emit('ac_start_manual_combat'));

    // 卖出
    container.querySelectorAll('.ac-bench-sell').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        gameSocket.emit('ac_sell', { from: 'bench', index: parseInt(el.dataset.idx) });
      });
    });

    // 点击棋盘角色移回备战席
    container.querySelectorAll('.ac-hex-slot, .ac-core-slot').forEach(el => {
      el.addEventListener('click', () => {
        if (el.querySelector('.ac-hex-char') || el.querySelector('.ac-core-char')) {
          gameSocket.emit('ac_remove', { slot: el.dataset.slot });
        }
      });
    });

    // 拖拽：备战席 → 棋盘
    container.querySelectorAll('.ac-bench-item').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'bench', index: el.dataset.bench }));
        setTimeout(() => el.classList.add('dragging'), 0);
      });
      el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        container.querySelectorAll('.drag-over').forEach(d => d.classList.remove('drag-over'));
      });
    });

    container.querySelectorAll('.ac-hex-slot, .ac-core-slot').forEach(el => {
      if (el.querySelector('.ac-hex-char') || el.querySelector('.ac-core-char')) {
        el.setAttribute('draggable', 'true');
        el.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'board', slot: el.dataset.slot }));
          setTimeout(() => el.classList.add('dragging'), 0);
        });
        el.addEventListener('dragend', () => {
          el.classList.remove('dragging');
          container.querySelectorAll('.drag-over').forEach(d => d.classList.remove('drag-over'));
        });
      }

      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.source === 'bench') {
            gameSocket.emit('ac_place', { benchIndex: parseInt(data.index), slot: el.dataset.slot });
          }
        } catch (err) {}
      });
    });

    // 备战席接收棋盘拖回
    const benchList = container.querySelector('.ac-bench-list');
    if (benchList) {
      benchList.addEventListener('dragover', (e) => { e.preventDefault(); benchList.classList.add('drag-over'); });
      benchList.addEventListener('dragleave', () => benchList.classList.remove('drag-over'));
      benchList.addEventListener('drop', (e) => {
        e.preventDefault();
        benchList.classList.remove('drag-over');
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.source === 'board') gameSocket.emit('ac_remove', { slot: data.slot });
        } catch (err) {}
      });
    }

    q('#ac-btn-event')?.addEventListener('click', () => gameSocket.emit('ac_event_choice'));

    container.querySelectorAll('.ac-bev-item').forEach(el => {
      el.addEventListener('click', () => gameSocket.emit('ac_buy_beverage', { beverageId: el.dataset.bev }));
    });

    q('#ac-btn-home')?.addEventListener('click', () => navigate('lobby'));
  }

  // ── Socket 事件 ──
  function onRunUpdate(newRun) { run = newRun; render(); }

  function onCombatResult(payload = {}) {
    const { combatLog, result } = payload && typeof payload === 'object' ? payload : {};
    if (!result || typeof result !== 'object') {
      showToast('战斗结果数据异常');
      return;
    }
    const logEl = document.getElementById('ac-combat-log');
    if (logEl && Array.isArray(combatLog) && combatLog.length > 0) {
      logEl.style.display = 'flex';
      playCombatLog(logEl, combatLog, () => { run = result; render(); });
    } else { run = result; render(); }
  }

  function onEventOptions(payload = {}) {
    const options = safeArray(payload?.options).filter(option => option && typeof option === 'object');
    if (options.length === 0) {
      showToast('事件选项数据异常');
      return;
    }
    const modal = document.createElement('div');
    modal.className = 'ac-modal';
    modal.innerHTML = `
      <div class="ac-modal-content">
        <h3>选择投资策略</h3>
        ${options.map((o, i) => `
          <button class="ac-invest-option" data-idx="${i}">
            <strong>${escapeHTML(o.name)}</strong><span>${escapeHTML(o.desc)}</span>
          </button>
        `).join('')}
      </div>
    `;
    container.appendChild(modal);
    modal.querySelectorAll('.ac-invest-option').forEach(el => {
      el.addEventListener('click', () => {
        gameSocket.emit('ac_confirm_investment', { buffIndex: parseInt(el.dataset.idx) });
        modal.remove();
      });
    });
  }

  function onStarUp({ charId, toStar }) {
    const name = AC_CHAR_MAP[charId]?.name || charId;
    showToast(`${name} → ${'★'.repeat(Math.max(0, Math.min(3, Number(toStar) || 0)))}`, 'success');
  }

  function onError(data) {
    const msg = typeof data === 'string' ? data : data?.message || '未知错误';
    showToast(msg);
  }

  // ── 手动战斗 ──
  function onManualCombatSetup(payload = {}) {
    const { playerFighter, aiFighter, buffs, nodeType } = payload && typeof payload === 'object' ? payload : {};
    if (!playerFighter || !aiFighter || !Array.isArray(playerFighter.dicePool) || !Array.isArray(aiFighter.dicePool)) {
      showToast('手动战斗数据异常');
      return;
    }
    showManualCombat(container, playerFighter, aiFighter, buffs, (won, totalDamage) => {
      gameSocket.emit('ac_manual_combat_done', { won, totalDamage });
    });
  }

  gameSocket.on('ac_run_update', onRunUpdate);
  gameSocket.on('ac_combat_result', onCombatResult);
  gameSocket.on('ac_event_options', onEventOptions);
  gameSocket.on('ac_star_up', onStarUp);
  gameSocket.on('error_msg', onError);
  gameSocket.on('ac_manual_combat_setup', onManualCombatSetup);

  render();

  return () => {
    gameSocket.off('ac_run_update', onRunUpdate);
    gameSocket.off('ac_combat_result', onCombatResult);
    gameSocket.off('ac_event_options', onEventOptions);
    gameSocket.off('ac_star_up', onStarUp);
    gameSocket.off('error_msg', onError);
    gameSocket.off('ac_manual_combat_setup', onManualCombatSetup);
  };
}

// ── 手动战斗 UI ──
function showManualCombat(container, p1, p2, buffs, onDone) {
  buffs = buffs && typeof buffs === 'object' ? buffs : {};
  const p1MaxHP = Math.max(1, Number(p1.hp) || 1);
  const p2MaxHP = Math.max(1, Number(p2.hp) || 1);
  let p1HP = p1MaxHP, p2HP = p2MaxHP;
  let round = 0;
  let isPlayerTurn = true; // 玩家先手
  let battleEnded = false;
  let submitted = false;
  const MAX_ROUNDS = 50;

  function rollDie(f) { return Math.floor(Math.random() * f) + 1; }
  function rollDice(pool) { return safeArray(pool).map(f => rollDie(Math.max(1, Number(f) || 1))); }
  function slotCount(slots, rolls) {
    return slots === -1 ? rolls.length : Math.max(0, Math.min(rolls.length, Number(slots) || 0));
  }

  const overlay = document.createElement('div');
  overlay.className = 'ac-manual-overlay';
  container.appendChild(overlay);

  function renderBattle() {
    const p1Pct = Math.max(0, Math.min(100, Math.round((p1HP / p1MaxHP) * 100)));
    const p2Pct = Math.max(0, Math.min(100, Math.round((p2HP / p2MaxHP) * 100)));

    overlay.innerHTML = `
      <div class="ac-manual-panel">
        <div class="ac-manual-vs">
          <div class="ac-fighter-card">
            <h4>${escapeHTML(p1.name)}</h4>
            <div class="ac-fighter-stat">HP: ${escapeHTML(p1HP)}/${escapeHTML(p1MaxHP)}</div>
            <div class="ac-hp-bar-bg" style="margin-top:4px"><div class="ac-hp-bar-fill" style="width:${p1Pct}%;background:var(--green)"></div></div>
          </div>
          <span style="font-family:var(--font-display);font-size:1.2rem;font-weight:900;color:var(--text-muted)">VS</span>
          <div class="ac-fighter-card">
            <h4>${escapeHTML(p2.name)}</h4>
            <div class="ac-fighter-stat">HP: ${escapeHTML(p2HP)}/${escapeHTML(p2MaxHP)}</div>
            <div class="ac-hp-bar-bg" style="margin-top:4px"><div class="ac-hp-bar-fill" style="width:${p2Pct}%;background:var(--red)"></div></div>
          </div>
        </div>
        <div class="ac-dice-area" id="mc-dice">
          <div style="color:var(--text-secondary);font-size:0.8rem">第 ${round + 1} 回合 — ${isPlayerTurn ? '你的攻击' : '对方攻击'}</div>
        </div>
        <div id="mc-log" style="max-height:120px;overflow-y:auto;font-size:0.72rem;color:var(--text-secondary);margin:6px 0;"></div>
        <div class="ac-manual-actions">
          ${isPlayerTurn ? `<button id="mc-roll" class="btn btn-primary">掷骰攻击</button>` : `<button id="mc-defend" class="btn btn-secondary">掷骰防御</button>`}
          <button id="mc-auto" class="btn btn-secondary">自动完成</button>
        </div>
      </div>
    `;

    overlay.querySelector('#mc-roll')?.addEventListener('click', doPlayerAttack);
    overlay.querySelector('#mc-defend')?.addEventListener('click', doEnemyAttack);
    overlay.querySelector('#mc-auto')?.addEventListener('click', autoFinish);
  }

  function addLog(msg) {
    const logEl = overlay.querySelector('#mc-log');
    if (logEl) {
      const div = document.createElement('div');
      div.textContent = msg;
      logEl.prepend(div);
    }
  }

  function doPlayerAttack() {
    if (battleEnded) return;
    round++;
    const rolls = rollDice(p1.dicePool);
    const kept = rolls.sort((a, b) => b - a).slice(0, slotCount(p1.atkSlots, rolls));
    let atk = kept.reduce((s, v) => s + v, 0);

    const defRolls = rollDice(p2.dicePool);
    const defKept = defRolls.sort((a, b) => b - a).slice(0, slotCount(p2.defSlots, defRolls));
    let def = defKept.reduce((s, v) => s + v, 0) + (buffs.flatDef || 0);

    const dmg = Math.max(0, atk - def - (buffs.flatReduction || 0));
    p2HP = Math.max(0, p2HP - dmg);

    addLog(`R${round} 你攻击 ${kept.join('+')}=${atk} vs 防御${defKept.join('+')}=${def} → ${dmg > 0 ? `-${dmg}HP` : '挡住了'}`);

    if (p2HP <= 0) return endBattle(true);
    isPlayerTurn = false;
    renderBattle();
  }

  function doEnemyAttack() {
    if (battleEnded) return;
    round++;
    const rolls = rollDice(p2.dicePool);
    const kept = rolls.sort((a, b) => b - a).slice(0, slotCount(p2.atkSlots, rolls));
    let atk = kept.reduce((s, v) => s + v, 0);

    const defRolls = rollDice(p1.dicePool);
    const defKept = defRolls.sort((a, b) => b - a).slice(0, slotCount(p1.defSlots, defRolls));
    let def = defKept.reduce((s, v) => s + v, 0);

    const dmg = Math.max(0, atk - def);
    p1HP = Math.max(0, p1HP - dmg);

    addLog(`R${round} 敌方攻击 ${kept.join('+')}=${atk} vs 你防御${defKept.join('+')}=${def} → ${dmg > 0 ? `-${dmg}HP` : '挡住了'}`);

    if (p1HP <= 0) return endBattle(false);
    isPlayerTurn = true;
    renderBattle();
  }

  function autoFinish() {
    if (battleEnded) return;
    while (p1HP > 0 && p2HP > 0 && round < MAX_ROUNDS) {
      if (isPlayerTurn) {
        round++;
        const rolls = rollDice(p1.dicePool);
        const kept = rolls.sort((a, b) => b - a).slice(0, slotCount(p1.atkSlots, rolls));
        const atk = kept.reduce((s, v) => s + v, 0);
        const defRolls = rollDice(p2.dicePool);
        const defKept = defRolls.sort((a, b) => b - a).slice(0, slotCount(p2.defSlots, defRolls));
        const def = defKept.reduce((s, v) => s + v, 0);
        const dmg = Math.max(0, atk - def - (buffs.flatReduction || 0));
        p2HP = Math.max(0, p2HP - dmg);
      } else {
        round++;
        const rolls = rollDice(p2.dicePool);
        const kept = rolls.sort((a, b) => b - a).slice(0, slotCount(p2.atkSlots, rolls));
        const atk = kept.reduce((s, v) => s + v, 0);
        const defRolls = rollDice(p1.dicePool);
        const defKept = defRolls.sort((a, b) => b - a).slice(0, slotCount(p1.defSlots, defRolls));
        const def = defKept.reduce((s, v) => s + v, 0);
        const dmg = Math.max(0, atk - def);
        p1HP = Math.max(0, p1HP - dmg);
      }
      isPlayerTurn = !isPlayerTurn;
    }
    endBattle(p1HP > 0);
  }

  function endBattle(won) {
    if (battleEnded) return;
    battleEnded = true;
    const totalDamage = Math.max(0, p2MaxHP - p2HP);
    overlay.innerHTML = `
      <div class="ac-manual-panel" style="text-align:center">
        <h3 style="font-family:var(--font-display);color:${won ? 'var(--gold)' : 'var(--red)'}">
          ${won ? '胜利' : '败北'}
        </h3>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin:8px 0">
          ${won ? `击败了 ${escapeHTML(p2.name)}` : `被 ${escapeHTML(p2.name)} 击败`} · 共 ${escapeHTML(round)} 回合
        </p>
        <button id="mc-done" class="btn btn-primary" style="width:100%">继续</button>
      </div>
    `;
    overlay.querySelector('#mc-done').addEventListener('click', () => {
      if (submitted) return;
      submitted = true;
      overlay.remove();
      if (typeof onDone === 'function') onDone(won, totalDamage);
    });
  }

  renderBattle();
}

// ── 自动战斗回放 ──
function playCombatLog(container, log, onDone) {
  const entries = safeArray(log).filter(entry => entry && typeof entry === 'object');
  if (entries.length === 0) {
    if (typeof onDone === 'function') onDone();
    return;
  }

  container.innerHTML = `
    <div class="ac-combat-replay">
      <h3>战斗回放</h3>
      <div class="ac-combat-hp-bars">
        <div class="ac-hp-bar"><span id="ac-p1-hp">--</span></div>
        <span>VS</span>
        <div class="ac-hp-bar enemy"><span id="ac-p2-hp">--</span></div>
      </div>
      <div id="ac-replay-content" class="ac-replay-content"></div>
      <button id="ac-skip-combat" class="btn btn-secondary">跳过</button>
    </div>
  `;

  const replayEl = container.querySelector('#ac-replay-content');
  const p1HP = container.querySelector('#ac-p1-hp');
  const p2HP = container.querySelector('#ac-p2-hp');
  let idx = 0, timer = null;
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    if (timer) clearInterval(timer);
    container.style.display = 'none';
    if (typeof onDone === 'function') onDone();
  }

  container.querySelector('#ac-skip-combat')?.addEventListener('click', finish);

  function showNext() {
    if (idx >= entries.length) {
      if (timer) clearInterval(timer);
      setTimeout(finish, 500);
      return;
    }
    const e = entries[idx++];
    if (p1HP) p1HP.textContent = `你: ${e.p1HP ?? '--'}`;
    if (p2HP) p2HP.textContent = `敌: ${e.p2HP ?? '--'}`;

    let html = `<div class="ac-replay-round"><span class="round-num">R${escapeHTML(e.round)}</span>`;
    html += `<span>${escapeHTML(e.attacker)}→${escapeHTML(safeArray(e.atkKept).join('+'))}=${escapeHTML(e.atkTotal)}</span> `;
    html += `<span>${escapeHTML(e.defender)}→${escapeHTML(safeArray(e.defKept).join('+'))}=${escapeHTML(e.defTotal)}</span>`;
    if (e.damage > 0) html += `<span class="dmg">-${escapeHTML(e.damage)}</span>`;
    if (e.healed) html += `<span class="heal">+${escapeHTML(e.healed)}</span>`;
    if (e.stickerExplode) html += `<span class="dmg">贴画-${escapeHTML(e.stickerExplode)}</span>`;
    if (e.revived) html += `<span class="heal">复活+${escapeHTML(e.revived)}</span>`;
    if (e.redHeatApplied) html += `<span class="debuff">红温+${escapeHTML(e.redHeatApplied)}</span>`;
    html += `</div>`;

    if (replayEl) replayEl.innerHTML = html + replayEl.innerHTML;
  }

  timer = setInterval(showNext, 450);
  showNext();
}

function showToast(msg, type = 'error') {
  const el = document.createElement('div');
  el.className = `ac-toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2000);
}
