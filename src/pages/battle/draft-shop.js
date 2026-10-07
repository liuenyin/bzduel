import { escapeHTML } from '../../utils/html.js';
import { gameSocket } from '../../net/socket.js';
import { SUBJECTS } from '../../../shared/rules.js';
import { waitingNames } from './presentation.js';
import { trapFocus } from '../../utils/a11y.js';

export function createDraftShop({ actions, viewLifecycle, appendOverlay }) {
  let draftInteraction = null;
  let draftReadyPending = false;
  actions.refreshDraftSlot = (value) => {
    const idx = Number(value);
    if (draftInteraction) return;
    const slot = document.querySelector(`.draft-slot-card[data-slot-index="${idx}"]`);
    draftInteraction = {
      type: 'refresh',
      index: idx,
      previousCardId: slot?.dataset.cardId || '',
    };
    slot?.classList.add('is-refreshing');
    gameSocket.refreshDraftSlot(idx, (result) => {
      if (!viewLifecycle.active) return;
      if (result?.ok) {
        gameSocket.requestState();
        return;
      }
      draftInteraction = null;
      slot?.classList.remove('is-refreshing');
      actions.showToast(result?.error || '无法刷新');
    });
    viewLifecycle.delay(() => {
      if (draftInteraction?.type === 'refresh' && draftInteraction.index === idx) {
        draftInteraction = null;
        slot?.classList.remove('is-refreshing');
      }
    }, 1400);
  };
  actions.buyDraftCard = (value) => {
    const idx = Number(value);
    if (draftInteraction) return;
    const slot = document.querySelector(`.draft-slot-card[data-slot-index="${idx}"]`);
    draftInteraction = { type: 'buy', index: idx };
    slot?.classList.add('is-buying');
    slot?.setAttribute('aria-busy', 'true');
    gameSocket.buyDraftCard(idx, (result) => {
      if (!viewLifecycle.active) return;
      if (result?.ok) {
        actions.showToast('已加入手牌');
        gameSocket.requestState();
        viewLifecycle.delay(() => {
          if (draftInteraction?.type === 'buy' && draftInteraction.index === idx) draftInteraction = null;
        }, 900);
      } else {
        draftInteraction = null;
        slot?.classList.remove('is-buying');
        slot?.removeAttribute('aria-busy');
        actions.showToast(result?.error || '购买失败');
      }
    });
  };
  actions.confirmDraftReady = () => {
    if (draftReadyPending) return;
    draftReadyPending = true;
    const button = document.querySelector('#draft-shop-modal [data-battle-action="confirmDraftReady"]');
    button?.setAttribute('disabled', 'true');
    button?.setAttribute('aria-busy', 'true');
    gameSocket.confirmDraftReady((result) => {
      if (!viewLifecycle.active) return;
      draftReadyPending = false;
      if (!result?.ok) {
        button?.removeAttribute('disabled');
        button?.removeAttribute('aria-busy');
        actions.showToast(result?.error || '无法完成选牌');
      }
    });
  };
  function checkDraftShopModal(s) {
    const existing = document.getElementById('draft-shop-modal');
    if (s.draftShop && s.draftShop.active && s.me) {
      const pDraft = s.draftShop.players?.[s.me.id];
      if (!pDraft || s.me.isDead) { existing?.remove(); return; }

      const renderSlots = () => {
        return pDraft.slots.map((slot, idx) => {
          const c = slot.card;
          if (!c) {
            const justPurchased = draftInteraction?.type === 'buy' && draftInteraction.index === idx;
            return `
              <div class="draft-slot-card empty ${justPurchased ? 'just-purchased' : ''}" data-slot-index="${idx}">
                <span class="draft-purchased-mark" aria-hidden="true">✓</span>
                <strong>已加入手牌</strong>
                <small>此位置已购买</small>
              </div>
            `;
          }
          const typeClass = c.type || 'buff';
          const scopeLabel = c.subject === 'universal' ? '通用' : (SUBJECTS[c.subject]?.label || c.subject);
          const isHandFull = (s.me.handCards || []).length >= 3;
          const isAfford = s.me.tp >= c.tpCost;
          const buyDisabled = isHandFull || !isAfford;
          let disableReason = '';
          if (isHandFull) disableReason = '手牌已满';
          else if (!isAfford) disableReason = 'TP不足';

          const stars = '★'.repeat(c.tpCost) + '☆'.repeat(Math.max(0, 3 - c.tpCost));
          const isRefreshing = draftInteraction?.type === 'refresh' && draftInteraction.index === idx;
          const justRefreshed = isRefreshing && draftInteraction.previousCardId && draftInteraction.previousCardId !== c.id;
          const cardState = justRefreshed ? 'just-refreshed' : (isRefreshing ? 'is-refreshing' : '');
          const actionLabel = buyDisabled ? disableReason : `购买 · ${c.tpCost} TP`;

          return `
            <div class="draft-slot-card ${buyDisabled ? 'disabled' : 'clickable'} ${cardState}" data-slot-index="${idx}" data-card-id="${escapeHTML(c.id)}"
                 ${buyDisabled ? '' : `role="button" tabindex="0" data-battle-action="buyDraftCard" data-value="${idx}"`}
                 aria-label="${escapeHTML(`${c.name}，${actionLabel}`)}">
              <button type="button" class="btn-icon-refresh" ${slot.refreshesLeft > 0 && !isRefreshing ? '' : 'disabled'}
                      data-battle-action="refreshDraftSlot" data-value="${idx}" title="刷新卡牌，剩余 ${slot.refreshesLeft} 次" aria-label="刷新卡牌，剩余 ${slot.refreshesLeft} 次">
                <span aria-hidden="true">↻</span><small>${slot.refreshesLeft}</small>
              </button>
              <div class="draft-card-header">
                <span class="card-tag-type ${escapeHTML(typeClass)}">${escapeHTML(scopeLabel)}</span>
                <span class="draft-card-star" aria-label="${c.tpCost} 点战术点">${stars}</span>
              </div>
              <div class="draft-card-title">${escapeHTML(c.name)}</div>
              <div class="draft-card-desc">${escapeHTML(c.desc)}</div>
              <div class="draft-card-footer">
                <span class="draft-card-cost">${c.tpCost} TP</span>
                <span class="draft-card-action">${escapeHTML(actionLabel)}</span>
              </div>
            </div>
          `;
        }).join('');
      };

      const statusHTML = `
        <div class="draft-shop-status-copy">
          <span class="draft-shop-kicker">下一节课开始前</span>
          <strong>选一张卡，或刷新你不需要的卡</strong>
        </div>
        <div class="draft-shop-metrics" aria-label="补给站资源">
          <span class="draft-metric"><small>手牌</small><b>${s.me.handCards?.length || 0}/3</b></span>
          <span class="draft-metric tp"><small>战术点</small><b>${s.me.tp} TP</b></span>
        </div>
      `;

      if (pDraft.ready) {
        const overlay = existing || document.createElement('div');
        overlay.id = 'draft-shop-modal';
        overlay.className = 'result-overlay';
        overlay.style.zIndex = '9999';
        overlay.innerHTML = `<div class="draft-shop-panel" role="dialog" aria-modal="true" aria-labelledby="draft-shop-title">
            <div class="draft-shop-title-row"><div><span class="draft-shop-eyebrow">课间补给</span><h2 id="draft-shop-title">战术补给站</h2></div><span class="draft-ready-mark">✓</span></div>
            <div class="draft-waiting-state"><span class="draft-waiting-dot" aria-hidden="true"></span><strong>已完成选牌</strong><span>等待${escapeHTML(waitingNames(s, s.draftShop.pendingPlayerIds)) || '其他玩家'}完成选择…</span></div>
          </div>`;
        if (!existing) appendOverlay(overlay);
        return;
      }

      if (existing) {
        const slotsWrap = existing.querySelector('#draft-slots-wrap');
        if (slotsWrap) slotsWrap.innerHTML = renderSlots();
        const status = existing.querySelector('#draft-shop-status');
        if (status) status.innerHTML = statusHTML;
        if (draftInteraction?.type === 'refresh' && draftInteraction.previousCardId && pDraft.slots[draftInteraction.index]?.card?.id !== draftInteraction.previousCardId) {
          viewLifecycle.delay(() => { if (draftInteraction?.type === 'refresh') draftInteraction = null; }, 450);
        }
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'result-overlay';
      overlay.id = 'draft-shop-modal';
      overlay.style.zIndex = '9999';

      overlay.innerHTML = `
        <div class="draft-shop-panel" role="dialog" aria-modal="true" aria-labelledby="draft-shop-title">
          <div class="draft-shop-title-row">
            <div><span class="draft-shop-eyebrow">课间补给</span><h2 id="draft-shop-title">战术补给站</h2></div>
            <span class="draft-shop-icon" aria-hidden="true">✦</span>
          </div>
          <div class="draft-shop-status" id="draft-shop-status">${statusHTML}</div>
          <div class="draft-slots-container" id="draft-slots-wrap">
            ${renderSlots()}
          </div>
          <div class="draft-shop-footer">
            <span>最多持有 3 张战术卡</span>
            <button class="btn btn-primary btn-lg" data-battle-action="confirmDraftReady" ${draftReadyPending ? 'disabled aria-busy="true"' : ''}>
              完成选牌
            </button>
          </div>
        </div>
      `;

      appendOverlay(overlay);
      const dialog = overlay.querySelector('[role="dialog"]');
      overlay.addEventListener('keydown', event => trapFocus(event, dialog));
      dialog.querySelector('button:not([disabled])')?.focus();
    } else {
      if (existing) existing.remove();
    }
  }
  return { render: checkDraftShopModal };
}
