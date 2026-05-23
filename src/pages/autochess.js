// ============================================================
// 校园战力党 — 货币战争 前端页面
// ============================================================
import { gameSocket } from '../net/socket.js';
import { navigate } from '../main.js';
import { AC_CHAR_MAP, HEX_SUBJECTS, BEVERAGES, AC } from '../../shared/autochess-config.js';

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

export function renderAutochess(container, data = {}) {
  let run = data.run || null;

  function render() {
    if (!run) {
      container.innerHTML = `<div class="ac-loading"><p>正在创建对局…</p></div>`;
      return;
    }

    const env = run.planeEnvironments[run.currentPlane] || '';
    const envLabel = SUBJECT_LABELS[env] || env;
    const envIcon = SUBJECT_ICONS[env] || '📚';
    const nodeType = run.currentNodeType || 'normal';
    const nodeLabel = { normal: '普通', elite: '⭐精英', boss: '💀Boss', event: '🎁事件' }[nodeType] || nodeType;

    container.innerHTML = `
      <div class="ac-page">
        <!-- 顶部区域 -->
        <div class="ac-topbar-wrapper">
          <div class="ac-topbar">
            <div class="ac-stat"><span class="ac-label">💰金币</span><span class="ac-val" id="ac-gold">${run.gold}</span></div>
            <div class="ac-stat"><span class="ac-label">📊等级</span><span class="ac-val">Lv.${run.level} (${run.xp}/${run.xpToNext || '∞'})</span></div>
            <div class="ac-stat"><span class="ac-label">❤️生命</span><span class="ac-val">${run.commanderHP}/${run.maxCommanderHP}</span></div>
            <div class="ac-stat"><span class="ac-label">💹利息</span><span class="ac-val">+${run.interest || 0}</span></div>
            <div class="ac-stat streak">${run.winStreak > 0 ? `🔥${run.winStreak}连胜` : run.loseStreak > 0 ? `💧${run.loseStreak}连败` : '—'}</div>
          </div>
          <div class="ac-planes">
            ${run.planeEnvironments.map((pe, i) => `
              <div class="ac-plane ${i === run.currentPlane ? 'active' : i < run.currentPlane ? 'done' : ''}">
                <span class="ac-plane-icon">${SUBJECT_ICONS[pe] || '📚'}</span>
                <span class="ac-plane-label">${SUBJECT_LABELS[pe] || pe}</span>
                ${i === run.currentPlane ? `<span class="ac-plane-node">${run.currentNode + 1}/${run.nodeTypes[i]?.length || '?'}</span>` : ''}
              </div>
            `).join('<span class="ac-plane-arrow">→</span>')}
          </div>
          <div class="ac-node-info">
            <span>🗺️ 位面 ${run.currentPlane + 1} · 节点 ${run.currentNode + 1} · ${nodeLabel}</span>
            <span>📍 课程环境：${envIcon} ${envLabel}</span>
          </div>
        </div>

        <!-- 棋盘与操作区 -->
        <div class="ac-board-section">
          <!-- 严格六边形棋盘 -->
          <div class="ac-board">
            ${HEX_SUBJECTS.map((subj, i) => {
              const entry = run.board.hexSlots[subj];
              const charCfg = entry ? AC_CHAR_MAP[entry.charId] : null;
              const matched = charCfg?.electives?.includes(subj);
              const envMatched = env === subj;
              const efficacy = envMatched && matched ? '200%' : matched ? '100%' : entry ? '降星' : '';
              return `
                <div class="ac-hex-slot" data-slot="${subj}" data-index="${i}">
                  <div class="ac-hex-label">${SUBJECT_ICONS[subj]} ${SUBJECT_LABELS[subj]}</div>
                  ${entry ? `
                    <div class="ac-hex-char ${envMatched && matched ? 'env-match' : matched ? 'matched' : 'mismatched'}">
                      <img class="ac-avatar" src="/photos/${charCfg.id}.jpg" onerror="this.style.display='none'">
                      <span class="ac-char-name">${charCfg?.name || '?'}</span>
                      <span class="ac-char-star">${'★'.repeat(entry.star)}${'☆'.repeat(3 - entry.star)}</span>
                      <span class="ac-efficacy">${efficacy}</span>
                    </div>
                  ` : `<div class="ac-hex-empty">拖入角色</div>`}
                </div>
              `;
            }).join('')}
            <div class="ac-core-slot" data-slot="core">
              ${run.board.core ? (() => {
                const c = AC_CHAR_MAP[run.board.core.charId];
                return `
                  <div class="ac-core-char">
                    <span class="ac-core-label">阵眼</span>
                    <img class="ac-avatar" src="/photos/${c.id}.jpg" onerror="this.style.display='none'">
                    <span class="ac-char-name">${c?.name || '?'}</span>
                    <span class="ac-char-star">${'★'.repeat(run.board.core.star)}${'☆'.repeat(3 - run.board.core.star)}</span>
                  </div>
                `;
              })() : `<div class="ac-core-empty" style="color:var(--accent);">阵眼<br>拖入主C</div>`}
            </div>
          </div>

          <!-- 底部主操作区 -->
          <div class="ac-actions">
            ${run.phase === 'shop' ? `
              <button id="ac-btn-refresh" class="btn btn-secondary">🔄 刷新 (${AC.SHOP_REFRESH_COST}💰)</button>
              <button id="ac-btn-buyxp" class="btn btn-secondary">📈 买经验 (${AC.XP_BUY_COST}💰→${AC.XP_BUY_AMOUNT}XP)</button>
              <button id="ac-btn-fight" class="btn btn-primary btn-lg" ${!run.board.core ? 'disabled' : ''}>⚔️ 开始考试!</button>
            ` : run.phase === 'event' ? `
              <button id="ac-btn-invest" class="btn btn-primary btn-lg">📈 投资策略</button>
              <button id="ac-btn-goldmine" class="btn btn-success btn-lg">💰 打劫金矿</button>
            ` : run.phase === 'victory' ? `
              <div class="ac-result ac-victory">
                <div class="ac-result-title">🏆 通关成功！</div>
                <div class="ac-result-subtitle">恭喜你在货币战争中存活了下来！</div>
                <div class="ac-result-stats">
                  <div class="ac-rs"><span>🎯 胜场</span><span>${run.stats?.battlesWon || 0}</span></div>
                  <div class="ac-rs"><span>⚔️ 总回合</span><span>${run.stats?.roundsPlayed || 0}</span></div>
                  <div class="ac-rs"><span>💰 总金币</span><span>${run.stats?.totalGold || 0}</span></div>
                  <div class="ac-rs"><span>❤️ 剩余HP</span><span>${run.commanderHP}/${run.maxCommanderHP}</span></div>
                  <div class="ac-rs"><span>📊 最终等级</span><span>Lv.${run.level}</span></div>
                  ${(run.investmentBuffs || []).length > 0 ? `<div class="ac-rs"><span>📈 投资</span><span>${run.investmentBuffs.map(b => b.name).join(', ')}</span></div>` : ''}
                </div>
                <button id="ac-btn-home" class="btn btn-primary btn-lg" style="width:100%;margin-top:16px;">返回大厅</button>
              </div>
            ` : run.phase === 'defeat' ? `
              <div class="ac-result ac-defeat">
                <div class="ac-result-title">💀 Game Over</div>
                <div class="ac-result-subtitle">指挥官HP归零，下次再战！</div>
                <div class="ac-result-stats">
                  <div class="ac-rs"><span>🗺️ 到达</span><span>位面${run.currentPlane + 1} · 节点${run.currentNode + 1}</span></div>
                  <div class="ac-rs"><span>🎯 胜场</span><span>${run.stats?.battlesWon || 0}</span></div>
                  <div class="ac-rs"><span>⚔️ 总回合</span><span>${run.stats?.roundsPlayed || 0}</span></div>
                  <div class="ac-rs"><span>💰 总金币</span><span>${run.stats?.totalGold || 0}</span></div>
                  <div class="ac-rs"><span>📊 最终等级</span><span>Lv.${run.level}</span></div>
                </div>
                <button id="ac-btn-home" class="btn btn-primary btn-lg" style="width:100%;margin-top:16px;">返回大厅</button>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- 右侧边栏: 商店与备战席 -->
        <div class="ac-sidebar">
          ${run.hasBeverageShop && !run.beveragePurchasedThisNode && run.phase === 'shop' ? `
            <div class="ac-beverage-shop">
              <h3>🥤 周煊声特供商店</h3>
              <div class="ac-bev-list">
                ${BEVERAGES.map(b => `
                  <button class="ac-bev-item" data-bev="${b.id}" ${run.gold < b.cost ? 'disabled' : ''}>
                    <span class="ac-bev-name">${b.name}</span>
                    <span class="ac-bev-cost">${b.cost}💰</span>
                    <span class="ac-bev-desc">${b.desc}</span>
                  </button>
                `).join('')}
              </div>
            </div>
          ` : ''}

          ${run.phase === 'shop' || run.phase === 'event' ? `
            <div class="ac-shop">
              <h3>🛒 课间商店</h3>
              <div class="ac-shop-items">
                ${(run.shop || []).map((item, i) => {
                  if (!item) return `<div class="ac-shop-slot empty">已售</div>`;
                  const c = AC_CHAR_MAP[item.charId];
                  return `
                    <button class="ac-shop-slot cost-${item.cost}" data-shop="${i}" ${run.gold < item.cost ? 'disabled' : ''}>
                      <span class="ac-shop-cost">${item.cost}💰</span>
                      <img class="ac-avatar" src="/photos/${c.id}.jpg" onerror="this.style.display='none'">
                      <span class="ac-shop-name">${c?.name || '?'}</span>
                      <span class="ac-shop-title">${c?.title || ''}</span>
                      <span class="ac-shop-electives">${(c?.electives || []).map(e => SUBJECT_ICONS[e] || e).join('')}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <div class="ac-bench">
            <h3>📦 备战席 (${run.bench.length}/${AC.MAX_BENCH}) <span style="font-size:0.6rem;font-weight:normal;color:var(--text-muted);">*拖拽角色上阵</span></h3>
            <div class="ac-bench-list">
              ${run.bench.map((entry, i) => {
                const c = AC_CHAR_MAP[entry.charId];
                return `
                  <div class="ac-bench-item" data-bench="${i}" draggable="true">
                    <span class="ac-char-cost">${c?.cost || '?'}💰</span>
                    <img class="ac-avatar" src="/photos/${c.id}.jpg" onerror="this.style.display='none'">
                    <span class="ac-char-name">${c?.name || '?'}</span>
                    <span class="ac-char-star">${'★'.repeat(entry.star)}${'☆'.repeat(3 - entry.star)}</span>
                    <button class="ac-sell-btn" data-idx="${i}">出售</button>
                  </div>
                `;
              }).join('')}
              ${run.bench.length === 0 ? '<p class="ac-empty-hint">从商店购买角色...</p>' : ''}
            </div>
          </div>
        </div>

        <!-- 战斗录像区 -->
        <div id="ac-combat-log" class="ac-combat-log" style="display:none;"></div>
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // 商店购买
    document.querySelectorAll('.ac-shop-slot[data-shop]').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.shop);
        gameSocket.emit('ac_buy', { shopIndex: idx });
      });
    });

    // 刷新商店
    document.getElementById('ac-btn-refresh')?.addEventListener('click', () => {
      gameSocket.emit('ac_refresh_shop');
    });

    // 买经验
    document.getElementById('ac-btn-buyxp')?.addEventListener('click', () => {
      gameSocket.emit('ac_buy_xp');
    });

    // 开始战斗
    document.getElementById('ac-btn-fight')?.addEventListener('click', () => {
      gameSocket.emit('ac_start_combat');
    });

    // 卖出
    document.querySelectorAll('.ac-sell-btn').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation(); // 防止触发其他点击
        gameSocket.emit('ac_sell', { from: 'bench', index: parseInt(el.dataset.idx) });
      });
    });

    // 点击棋盘上的角色可以直接移回备战席
    document.querySelectorAll('.ac-hex-slot, .ac-core-slot').forEach(el => {
      el.addEventListener('click', () => {
        if (el.querySelector('.ac-hex-char') || el.querySelector('.ac-core-char')) {
          gameSocket.emit('ac_remove', { slot: el.dataset.slot });
        }
      });
    });

    // ── 拖拽逻辑 ──
    document.querySelectorAll('.ac-bench-item').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'bench', index: el.dataset.bench }));
        setTimeout(() => el.classList.add('dragging'), 0);
      });
      el.addEventListener('dragend', (e) => {
        el.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(d => d.classList.remove('drag-over'));
      });
    });

    document.querySelectorAll('.ac-hex-slot, .ac-core-slot').forEach(el => {
      // 若已有角色，允许它被拖拽回备战席
      if (el.querySelector('.ac-hex-char') || el.querySelector('.ac-core-char')) {
        el.setAttribute('draggable', 'true');
        el.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'board', slot: el.dataset.slot }));
          setTimeout(() => el.classList.add('dragging'), 0);
        });
        el.addEventListener('dragend', (e) => {
          el.classList.remove('dragging');
          document.querySelectorAll('.drag-over').forEach(d => d.classList.remove('drag-over'));
        });
      }

      // 允许放入
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', (e) => {
        el.classList.remove('drag-over');
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.source === 'bench') {
            gameSocket.emit('ac_place', { benchIndex: parseInt(data.index), slot: el.dataset.slot });
          }
        } catch(err) {}
      });
    });

    // 备战席作为 Drop 区 (用于从棋盘拖回角色)
    const benchList = document.querySelector('.ac-bench-list');
    if (benchList) {
      benchList.addEventListener('dragover', (e) => { e.preventDefault(); benchList.classList.add('drag-over'); });
      benchList.addEventListener('dragleave', (e) => { benchList.classList.remove('drag-over'); });
      benchList.addEventListener('drop', (e) => {
        e.preventDefault();
        benchList.classList.remove('drag-over');
        try {
          const data = JSON.parse(e.dataTransfer.getData('text/plain'));
          if (data.source === 'board') {
            gameSocket.emit('ac_remove', { slot: data.slot });
          }
        } catch(err) {}
      });
    }

    // 事件选择
    document.getElementById('ac-btn-invest')?.addEventListener('click', () => {
      gameSocket.emit('ac_event_choice', { choice: 0 });
    });
    document.getElementById('ac-btn-goldmine')?.addEventListener('click', () => {
      gameSocket.emit('ac_event_choice', { choice: 1 });
    });

    // 饮料购买
    document.querySelectorAll('.ac-bev-item').forEach(el => {
      el.addEventListener('click', () => {
        gameSocket.emit('ac_buy_beverage', { beverageId: el.dataset.bev });
      });
    });

    // 返回大厅
    document.getElementById('ac-btn-home')?.addEventListener('click', () => {
      navigate('lobby');
    });
  }

  // ── Socket 事件 ──
  gameSocket.on('ac_run_update', (newRun) => {
    run = newRun;
    render();
  });

  gameSocket.on('ac_combat_result', ({ combatLog, won, goldEarned, commanderDamage, result }) => {
    // 播放战斗录像
    const logEl = document.getElementById('ac-combat-log');
    if (logEl) {
      logEl.style.display = 'flex';
      playCombatLog(logEl, combatLog, () => {
        // 播放完毕后更新状态
        run = result;
        render();
      });
    } else {
      run = result;
      render();
    }
  });

  gameSocket.on('ac_event_options', ({ options }) => {
    // 显示投资策略选项
    const modal = document.createElement('div');
    modal.className = 'ac-modal';
    modal.innerHTML = `
      <div class="ac-modal-content">
        <h3>📈 选择投资策略</h3>
        ${options.map((o, i) => `
          <button class="ac-invest-option" data-idx="${i}">
            <strong>${o.name}</strong>
            <span>${o.desc}</span>
          </button>
        `).join('')}
      </div>
    `;
    container.appendChild(modal);
    modal.querySelectorAll('.ac-invest-option').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        gameSocket.emit('ac_confirm_investment', { buffIndex: idx });
        modal.remove();
      });
    });
  });

  gameSocket.on('ac_star_up', ({ charId, fromStar, toStar }) => {
    // 升星特效
    const name = AC_CHAR_MAP[charId]?.name || charId;
    showToast(`⭐ ${name} 升到了 ${'★'.repeat(toStar)} ！！`);
  });

  gameSocket.on('error_msg', ({ message }) => {
    showToast(`❌ 操作失败: ${message}`);
  });

  // 初始渲染
  render();

  return () => {
    gameSocket.off('ac_run_update');
    gameSocket.off('ac_combat_result');
    gameSocket.off('ac_event_options');
    gameSocket.off('ac_star_up');
    gameSocket.off('error_msg');
  };
}

// ── 战斗录像播放器 (2倍速) ──
function playCombatLog(container, log, onDone) {
  container.innerHTML = `
    <div class="ac-combat-replay">
      <h3>⚔️ 战斗回放</h3>
      <div class="ac-combat-hp-bars">
        <div class="ac-hp-bar"><span id="ac-p1-hp">--</span></div>
        <span>VS</span>
        <div class="ac-hp-bar enemy"><span id="ac-p2-hp">--</span></div>
      </div>
      <div id="ac-replay-content" class="ac-replay-content"></div>
      <button id="ac-skip-combat" class="btn btn-secondary">⏩ 跳过</button>
    </div>
  `;

  const replayEl = document.getElementById('ac-replay-content');
  const p1HP = document.getElementById('ac-p1-hp');
  const p2HP = document.getElementById('ac-p2-hp');
  let idx = 0;
  let timer = null;

  document.getElementById('ac-skip-combat')?.addEventListener('click', () => {
    if (timer) clearInterval(timer);
    container.style.display = 'none';
    onDone();
  });

  function showNext() {
    if (idx >= log.length) {
      if (timer) clearInterval(timer);
      setTimeout(() => {
        container.style.display = 'none';
        onDone();
      }, 800);
      return;
    }

    const e = log[idx++];
    p1HP.textContent = `你: ${e.p1HP}HP`;
    p2HP.textContent = `敌: ${e.p2HP}HP`;

    let html = `<div class="ac-replay-round">`;
    html += `<span class="round-num">R${e.round}</span> `;
    html += `<span>${e.attacker}攻击 → 🎲${e.atkKept?.join('+')}=${e.atkTotal}</span> `;
    html += `<span>${e.defender}防御 → 🛡️${e.defKept?.join('+')}=${e.defTotal}</span> `;
    if (e.damage > 0) html += `<span class="dmg">-${e.damage}HP</span>`;
    if (e.healed) html += `<span class="heal">+${e.healed}HP</span>`;
    if (e.stickerExplode) html += `<span class="dmg">💥贴画爆炸-${e.stickerExplode}</span>`;
    if (e.revived) html += `<span class="heal">🐱九条命! +${e.revived}HP</span>`;
    if (e.redHeatApplied) html += `<span class="debuff">🔥红温+${e.redHeatApplied}</span>`;
    if (e.bossRage) html += `<span class="debuff">💢狂暴+${e.bossRage}</span>`;
    if (e.bossArmor) html += `<span class="heal">🛡️护甲+${e.bossArmor}</span>`;
    html += `</div>`;

    replayEl.innerHTML = html + replayEl.innerHTML;
    replayEl.scrollTop = 0;
  }

  // 2 倍速：每 500ms 一个回合
  timer = setInterval(showNext, 500);
  showNext();
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'ac-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2000);
}
