import re

with open('src/pages/battle.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove playSkillTrigger
content = content.replace("import { playDiceRoll, playHit, playSkillTrigger }", "import { playDiceRoll, playHit }")

# 2. buildFfaGrid unclosed div + css vars + null check
old_ffa = """  others.forEach(p => {
    const isDefender = s.defenderIdx !== null && s.players[s.defenderIdx]?.id === p.id;"""
new_ffa = """  others.forEach(p => {
    if (!p || !p.card) return;
    const isDefender = s.defenderIdx !== null && s.players[s.defenderIdx]?.id === p.id;"""
content = content.replace(old_ffa, new_ffa)

content = content.replace(
    "background:var(--bg-overlay); border-radius:10px; font-size:10px; padding:0 4px; border:1px solid var(--border);",
    "background:var(--bg-card); border-radius:10px; font-size:10px; padding:0 4px; border:1px solid var(--bg-inset);"
)

content = content.replace(
    "        <div style=\"font-size:9px; color:var(--text-main); margin-top:2px;\">${p.hp}/${p.maxHp}</div>\n      </div>\n    `;\n  });",
    "        <div style=\"font-size:9px; color:var(--text-main); margin-top:2px;\">${p.hp}/${p.maxHp}</div>\n      </div>\n      </div>\n    `;\n  });"
)

# 3. AoE defense null crash
old_aoe = "const aoeMyDef = S.aoeDefenses?.[S.me.id];"
new_aoe = "const aoeMyDef = S.me && S.aoeDefenses?.[S.me.id];"
content = content.replace(old_aoe, new_aoe)

# 4. new tacticalBarHTML (Floating KARDS style)
old_tac = """
function tacticalBarHTML(s) {
  if (!s || !s.me) return '';
  const me = s.me;
  const tp = me.tp || 0;
  const handCards = me.handCards || [];
  const curSubj = s.schedule[s.currentClassIndex];
  const canUseClass = me.card?.subjects?.includes(curSubj);

  let cardsHtml = '';
  if (handCards.length === 0) {
    cardsHtml = `<div style="font-size:0.75rem; color:var(--text-secondary); padding:4px 0; text-align:center; width:100%;">暂无战术卡 (在第 2 / 4 / 6 节课后触发补给站)</div>`;
  } else {
    cardsHtml = handCards.map(c => {
      if (c.hidden) return '';
      const typeLabel = c.type === 'blessing' ? '祝福' : (c.type === 'buff' ? '增益' : (c.type === 'debuff' ? '减益' : '其他'));
      const typeClass = c.type || 'buff';
      const scopeLabel = c.subject === 'universal' ? '通用' : (SUBJECTS[c.subject]?.label || c.subject);
      
      const canAfford = tp >= c.tpCost;
      const subjMatch = c.subject === 'universal' || c.subject === curSubj;
      const canPlay = canAfford && canUseClass && subjMatch;

      let disableReason = '';
      if (!canUseClass) disableReason = '非自身选科';
      else if (!subjMatch) disableReason = `限${scopeLabel}课`;
      else if (!canAfford) disableReason = 'TP不足';

      return `
        <div class="tactical-card-item">
          <div class="card-tag-row">
            <span class="card-tag-type ${typeClass}">[${typeLabel}]</span>
            <span style="color:var(--text-secondary); font-size:0.6rem;">${scopeLabel}</span>
            <span class="card-tp-cost">⚡${c.tpCost}TP</span>
          </div>
          <div class="card-title-text">${c.name}</div>
          <div class="card-desc-text" title="${c.desc}">${c.desc}</div>
          <button class="btn-play-card" ${canPlay ? '' : 'disabled'} onclick="window._playTacticalCard('${c.id}')">
            ${canPlay ? '打出' : disableReason}
          </button>
        </div>
      `;
    }).join('');
  }

  let blessingsHtml = '';
  if (me.activeBlessings && me.activeBlessings.length > 0) {
    blessingsHtml = `<div style="font-size:0.7rem; color:#a3e635; display:flex; gap:6px; flex-wrap:wrap; margin-top:2px;">
      <span style="font-weight:700;">当天生效祝福:</span>
      ${me.activeBlessings.map(b => `<span style="background:rgba(163,230,53,0.15); border:1px solid rgba(163,230,53,0.3); padding:0 6px; border-radius:4px;">✦ ${b.name}</span>`).join('')}
    </div>`;
  }

  return `
    <div class="tactical-header">
      <span>战术手牌 (${handCards.length}/3)</span>
      <span class="tp-badge">战术点: ${tp} TP</span>
    </div>
    <div class="hand-cards-list">
      ${cardsHtml}
    </div>
    ${blessingsHtml}
  `;
}
"""
old_tac = old_tac.strip()

new_tac = """
// ── KARDS Style Tactical Hand ──
window._toggleHand = () => {
  const fan = document.getElementById('hand-fan-container');
  if (fan) {
    fan.classList.toggle('expanded');
    const fab = document.getElementById('hand-fab');
    if (fab) fab.classList.toggle('active');
  }
};

function tacticalBarHTML(s) {
  if (!s || !s.me) return '';
  const me = s.me;
  const tp = me.tp || 0;
  const handCards = me.handCards || [];
  const curSubj = s.schedule[s.currentClassIndex];
  const canUseClass = me.card?.subjects?.includes(curSubj);

  let cardsHtml = '';
  if (handCards.length === 0) {
    cardsHtml = `<div style="color:var(--text-secondary); text-align:center; margin-top:40px;">暂无战术卡</div>`;
  } else {
    cardsHtml = handCards.map((c, i) => {
      if (c.hidden) return '';
      const typeClass = c.type || 'buff';
      const scopeLabel = c.subject === 'universal' ? '通用' : (SUBJECTS[c.subject]?.label || c.subject);
      
      const canAfford = tp >= c.tpCost;
      const subjMatch = c.subject === 'universal' || c.subject === curSubj;
      const canPlay = canAfford && (c.subject === 'universal' || (subjMatch && canUseClass));

      let disableReason = '';
      if (!canPlay) {
         if (!subjMatch && c.subject !== 'universal') disableReason = `限当节课`;
         else if (!canUseClass && c.subject !== 'universal') disableReason = '非自身选科';
         else if (!canAfford) disableReason = 'TP不足';
      }

      // 扇形展开的角度计算 (-15deg, 0deg, 15deg)
      const total = handCards.length;
      const mid = (total - 1) / 2;
      const rotateDeg = (i - mid) * 15;
      const transY = Math.abs(i - mid) * 10;

      return `
        <div class="hand-card-kards ${canPlay ? '' : 'disabled'}" style="transform: rotate(${rotateDeg}deg) translateY(${transY}px)" ${canPlay ? `onclick="window._toggleHand(); window._playTacticalCard('${c.id}')"` : ''} title="${disableReason}">
          <div class="card-tag-row">
            <span class="card-tag-type ${typeClass}">${scopeLabel}</span>
            <span class="card-tp-cost">⚡${c.tpCost}</span>
          </div>
          <div class="card-title-text">${c.name}</div>
          <div class="card-desc-text">${c.desc}</div>
          ${!canPlay ? `<div class="card-disable-overlay">${disableReason}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  let blessingsHtml = '';
  if (me.activeBlessings && me.activeBlessings.length > 0) {
    blessingsHtml = `<div class="blessing-badges">
      ${me.activeBlessings.map(b => `<div class="blessing-badge" title="${b.name}">✦</div>`).join('')}
    </div>`;
  }

  return `
    <div class="hand-fab-container">
      ${blessingsHtml}
      <button class="hand-fab" id="hand-fab" onclick="window._toggleHand()">
        <span class="fab-icon">🃏</span> 
        <span class="fab-count">${handCards.length}/3</span>
        <span class="fab-tp">⚡${tp}</span>
      </button>
      <div class="hand-fan-container" id="hand-fan-container">
        ${cardsHtml}
      </div>
    </div>
  `;
}
"""

content = content.replace(old_tac, new_tac.strip())

# 5. checkDraftShopModal
old_draft = """
function checkDraftShopModal(s) {
  const existing = document.getElementById('draft-shop-modal');
  if (s.draftShop && s.draftShop.active && s.me) {
    const pDraft = s.draftShop.players?.[s.me.id];
    if (!pDraft) return;

    const renderSlots = () => {
      const curSubj = s.schedule[s.currentClassIndex];
      return pDraft.slots.map((slot, idx) => {
        const c = slot.card;
        if (!c) return `<div class="draft-slot-card"><p style="color:var(--text-muted); text-align:center;">已领完</p></div>`;
        const typeLabel = c.type === 'blessing' ? '祝福' : (c.type === 'buff' ? '增益' : (c.type === 'debuff' ? '减益' : '其他'));
        const typeClass = c.type || 'buff';
        const scopeLabel = c.subject === 'universal' ? '通用' : (SUBJECTS[c.subject]?.label || c.subject);
        const isHandFull = (s.me.handCards || []).length >= 3;
        const isAfford = s.me.tp >= c.tpCost;
        const buyDisabled = isHandFull || !isAfford;
        const buyReason = isHandFull ? '手牌已满' : (!isAfford ? 'TP不足' : '选择');

        return `
          <div class="draft-slot-card">
            <div class="card-tag-row">
              <span class="card-tag-type ${typeClass}">[${typeLabel}]</span>
              <span style="color:var(--text-secondary); font-size:0.7rem;">${scopeLabel}</span>
              <span class="card-tp-cost">⚡ ${c.tpCost} TP</span>
            </div>
            <div style="font-size:0.95rem; font-weight:800; color:var(--text-main); margin-top:2px;">${c.name}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.3; min-height:40px;">${c.desc}</div>
            <div class="draft-btn-row">
              <button class="btn-draft-action btn-draft-refresh" ${slot.refreshesLeft > 0 ? '' : 'disabled'} onclick="window._refreshDraftSlot(${idx})">
                ↻ 刷新 (${slot.refreshesLeft})
              </button>
              <button class="btn-draft-action btn-draft-buy" ${buyDisabled ? 'disabled' : ''} onclick="window._buyDraftCard(${idx})">
                ${buyReason}
              </button>
            </div>
          </div>
        `;
      }).join('');
    };

    if (pDraft.ready) {
      if (existing) {
        existing.querySelector('.draft-shop-panel').innerHTML = `
          <h2 style="color:var(--gold); font-size:1.2rem; margin-bottom:8px;">⚡ 战术补给站</h2>
          <p style="color:var(--accent); font-size:1rem; animation:pulse 1s infinite;">已完成选牌，等待对方选择…</p>
        `;
      }
      return;
    }

    if (existing) {
      const slotsWrap = existing.querySelector('#draft-slots-wrap');
      if (slotsWrap) slotsWrap.innerHTML = renderSlots();
      const subTitle = existing.querySelector('.draft-shop-panel p');
      if (subTitle) {
        subTitle.innerHTML = `下节课即将开始！请选择 1~3 张战术卡加入手牌（当前持有: ${s.me.handCards?.length || 0}/3 | 持有TP: ⚡${s.me.tp}）`;
      }
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'result-overlay';
    overlay.id = 'draft-shop-modal';
    overlay.style.zIndex = '9999';

    overlay.innerHTML = `
      <div class="draft-shop-panel">
        <h2 style="color:var(--gold); font-size:1.25rem; margin-bottom:4px;">战术补给站</h2>
        <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:12px;">
          下节课即将开始！请选择 1~3 张战术卡加入手牌（当前持有: ${s.me.handCards?.length || 0}/3 | 持有TP: ⚡${s.me.tp}）
        </p>
        <div class="draft-slots-container" id="draft-slots-wrap">
          ${renderSlots()}
        </div>
        <div style="text-align:center; margin-top:14px;">
          <button class="btn btn-primary btn-lg" onclick="window._confirmDraftReady()" style="min-width:180px;">
            完成选牌
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  } else {
    if (existing) existing.remove();
  }
}
"""
old_draft = old_draft.strip()

new_draft = """
window._showToast = (msg) => {
  const t = document.createElement('div');
  t.className = 'toast show';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
};

// 重写原有的购买函数以提供反馈
const originalBuy = window._buyDraftCard;
window._buyDraftCard = (idx) => {
  if (originalBuy) originalBuy(idx);
  window._showToast("购买成功！");
  setTimeout(refreshAll, 50); // 立即刷新UI
};

function checkDraftShopModal(s) {
  const existing = document.getElementById('draft-shop-modal');
  if (s.draftShop && s.draftShop.active && s.me) {
    const pDraft = s.draftShop.players?.[s.me.id];
    if (!pDraft) return;

    const renderSlots = () => {
      return pDraft.slots.map((slot, idx) => {
        const c = slot.card;
        if (!c) return `<div class="draft-slot-card empty"><p>已购买</p></div>`;
        const typeClass = c.type || 'buff';
        const isHandFull = (s.me.handCards || []).length >= 3;
        const isAfford = s.me.tp >= c.tpCost;
        const buyDisabled = isHandFull || !isAfford;
        let disableReason = '';
        if (isHandFull) disableReason = '手牌已满';
        else if (!isAfford) disableReason = 'TP不足';
        
        const stars = '★'.repeat(c.tpCost) + '☆'.repeat(3 - c.tpCost);

        return `
          <div class="draft-slot-card ${buyDisabled ? 'disabled' : 'clickable'}" ${buyDisabled ? '' : `onclick="window._buyDraftCard(${idx})"`}>
            <button class="btn-icon-refresh" ${slot.refreshesLeft > 0 ? '' : 'disabled'} onclick="event.stopPropagation(); window._refreshDraftSlot(${idx})" title="刷新 (${slot.refreshesLeft})">↻</button>
            <div class="draft-card-star">${stars}</div>
            <div style="font-size:0.95rem; font-weight:800; color:var(--text-main); margin-top:8px;">${c.name}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.3; min-height:40px; margin-top:6px;">${c.desc}</div>
            ${buyDisabled ? `<div class="card-disable-overlay">${disableReason}</div>` : ''}
          </div>
        `;
      }).join('');
    };

    if (pDraft.ready) {
      if (existing) {
        existing.querySelector('.draft-shop-panel').innerHTML = `
          <h2 style="color:var(--gold); font-size:1.2rem; margin-bottom:8px;">⚡ 战术补给站</h2>
          <p style="color:var(--accent); font-size:1rem; animation:pulse 1s infinite;">已完成选牌，等待对方选择…</p>
        `;
      }
      return;
    }

    if (existing) {
      const slotsWrap = existing.querySelector('#draft-slots-wrap');
      if (slotsWrap) slotsWrap.innerHTML = renderSlots();
      const subTitle = existing.querySelector('.draft-shop-panel p');
      if (subTitle) {
        subTitle.innerHTML = `下节课即将开始！点击卡面直接购买（当前持有: ${s.me.handCards?.length || 0}/3 | 战术点: ⚡${s.me.tp}）`;
      }
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'result-overlay';
    overlay.id = 'draft-shop-modal';
    overlay.style.zIndex = '9999';

    overlay.innerHTML = `
      <div class="draft-shop-panel">
        <h2 style="color:var(--gold); font-size:1.25rem; margin-bottom:4px;">战术补给站</h2>
        <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:12px;">
          下节课即将开始！点击卡面直接购买（当前持有: ${s.me.handCards?.length || 0}/3 | 战术点: ⚡${s.me.tp}）
        </p>
        <div class="draft-slots-container" id="draft-slots-wrap">
          ${renderSlots()}
        </div>
        <div style="text-align:center; margin-top:14px;">
          <button class="btn btn-primary btn-lg" onclick="window._confirmDraftReady()" style="min-width:180px;">
            完成选牌
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  } else {
    if (existing) existing.remove();
  }
}
"""

content = content.replace(old_draft, new_draft.strip())

with open('src/pages/battle.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Battle.js patched successfully.')
