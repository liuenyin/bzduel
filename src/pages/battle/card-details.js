import { escapeHTML } from '../../utils/html.js';
import { SUBJECTS } from '../../../shared/rules.js';
import { getTacticalCardMoment, getTacticalCardUsability } from './tactical.js';

export function cardDetailsButton(card, source, index) {
  return `<button type="button" class="card-details-button" data-battle-action="viewCardDetails"
    data-value="${source}:${index}" aria-label="${escapeHTML(`查看${card.name}完整说明`)}">查看说明</button>`;
}

/** Read-only inspection uses the current public view; it never sends a card action. */
export function createCardDetails({ actions, getState, appendOverlay }) {
  let opened = null;

  function lookup(key) {
    const [source, value] = String(key).split(':');
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0) return null;
    const state = getState();
    if (state?.phase !== 'battle') return null;
    let card, reason;
    if (source === 'hand') {
      card = state.me?.handCards?.[index];
      if (card && !card.hidden) reason = getTacticalCardUsability(card, state).reason;
    } else if (source === 'draft' && state.draftShop?.active) {
      const draft = state.draftShop.players?.[state.me?.id];
      if (draft?.ready || state.me?.isDead) return null;
      card = draft?.slots?.[index]?.card;
      reason = state.me.handCards?.length >= 3 ? '手牌已满'
        : state.me.tp < card?.tpCost ? 'TP不足' : '可在补给站购买';
    }
    if (!card || card.hidden) return null;
    return { card, source, reason };
  }

  function close() {
    if (!opened) return;
    const { dialog, key, source } = opened;
    opened = null;
    dialog.close();
    dialog.remove();
    // State updates can replace the original button while the reader is open.
    const button = [...document.querySelectorAll('[data-battle-action="viewCardDetails"]')]
      .find(candidate => candidate.dataset.value === key);
    const fallback = source === 'draft'
      ? document.querySelector('#draft-shop-modal button:not([disabled])')
      : document.getElementById('hand-fab');
    (button || fallback)?.focus();
  }

  function sync() {
    if (!opened) return;
    const current = lookup(opened.key);
    if (!current || current.card.id !== opened.cardId) { close(); return; }
    opened.dialog.querySelector('.card-details-status').textContent = current.reason || '当前可以打出';
  }

  actions.closeCardDetails = close;
  actions.viewCardDetails = key => {
    const current = lookup(key);
    if (!current) return;
    close();
    const { card, source } = current;
    const dialog = document.createElement('dialog');
    dialog.className = 'card-details-dialog';
    dialog.setAttribute('aria-labelledby', 'card-details-title');
    dialog.innerHTML = `<header class="card-details-heading">
      <h2 id="card-details-title">${escapeHTML(card.name)}</h2>
      <button type="button" class="card-details-close" data-battle-action="closeCardDetails" aria-label="关闭卡牌说明" autofocus>×</button>
    </header>
    <p class="card-details-meta">${escapeHTML(SUBJECTS[card.subject]?.label || '通用')} · ${escapeHTML(getTacticalCardMoment(card).label)}</p>
    <p class="card-details-description">${escapeHTML(card.desc)}</p>
    <p class="card-details-status" role="status"></p>
    <p class="card-details-price">补给价 ${escapeHTML(card.tpCost)} TP · 打出不消耗 TP</p>`;
    opened = { dialog, key, source, cardId: card.id };
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') event.stopPropagation();
      if (event.key === 'Tab') {
        event.preventDefault();
        dialog.querySelector('.card-details-close')?.focus();
      }
    });
    appendOverlay(dialog);
    sync();
    dialog.showModal();
  };
  return { sync };
}
