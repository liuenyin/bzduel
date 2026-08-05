import re

with open('src/pages/battle.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add global window methods inside renderBattle
old_render = """export function renderBattle(container, data) {
  S = data.state;
  animLock = false; // 重置动画锁
  container.innerHTML = buildArena(S);
  bindCoreEvents();"""

new_render = """export function renderBattle(container, data) {
  S = data.state;
  animLock = false; // 重置动画锁

  window._refreshDraftSlot = (idx) => { gameSocket.refreshDraftSlot(idx); };
  window._buyDraftCard = (idx) => { gameSocket.buyDraftCard(idx); };
  window._confirmDraftReady = () => { gameSocket.confirmDraftReady(); };
  window._playTacticalCard = (id) => { gameSocket.playTacticalCard(id); };

  container.innerHTML = buildArena(S);
  bindCoreEvents();"""

code = code.replace(old_render, new_render)

# 2. Update checkDraftShopModal to handle re-rendering existing modal
old_check_draft = """function checkDraftShopModal(s) {
  const existing = document.getElementById('draft-shop-modal');
  if (s.draftShop && s.draftShop.active && s.me) {
    const pDraft = s.draftShop.players?.[s.me.id];
    if (!pDraft) return;

    if (pDraft.ready) {
      if (existing) {
        existing.querySelector('.draft-shop-panel').innerHTML = `
          <h2 style="color:var(--gold); font-size:1.2rem; margin-bottom:8px;">⚡ 战术补给站</h2>
          <p style="color:var(--accent); font-size:1rem; animation:pulse 1s infinite;">已完成选牌，等待对方选择…</p>
        `;
      }
      return;
    }

    if (existing) return;"""

new_check_draft = """function checkDraftShopModal(s) {
  const existing = document.getElementById('draft-shop-modal');
  if (s.draftShop && s.draftShop.active && s.me) {
    const pDraft = s.draftShop.players?.[s.me.id];
    if (!pDraft) return;

    const renderSlots = () => {
      const curSubj = s.schedule[s.currentClassIndex];
      return pDraft.slots.map((slot, idx) => {
        const c = slot.card;
        if (!c) return `<div class="draft-slot-card"><p style="color:var(--text-muted);">已领完</p></div>`;
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
      // 动态更新已存在的弹窗内容，解决购买/刷新后页面不更新的问题
      const slotsWrap = existing.querySelector('#draft-slots-wrap');
      if (slotsWrap) slotsWrap.innerHTML = renderSlots();
      const subTitle = existing.querySelector('.draft-shop-panel p');
      if (subTitle) {
        subTitle.innerHTML = `下节课即将开始！请选择 1~3 张战术卡加入手牌（当前持有: ${s.me.handCards?.length || 0}/3 | TP: ⚡${s.me.tp}）`;
      }
      return;
    }"""

code = code.replace(old_check_draft, new_check_draft)

# Also remove duplicate renderSlots definition in overlay creation part
code = re.sub(r'const overlay = document\.createElement\(\'div\'\);[\s\S]*?const renderSlots = \(\) => \{[\s\S]*?\};\n', 'const overlay = document.createElement(\'div\');\n', code)

with open('src/pages/battle.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("battle.js updated successfully")
