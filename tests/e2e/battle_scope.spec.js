import { test, expect } from '@playwright/test';

async function enterBattle(page) {
  await page.goto('/');
  await page.fill('#nickname-input', '页面隔离测试');
  await page.click('#btn-pve-custom');
  await page.click('[data-character-id="char_6"]');
  await page.click('#btn-start-custom-pve');
  await page.click('.avatar-cell[data-id="char_6"]');
  await page.click('#modal-select-btn');
  await page.click('#btn-ready');
  await expect(page.locator('#btn-roll')).toBeEnabled();
}

test('rebuilt controls support keyboard dice selection and dispatch only once', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await enterBattle(page);
  await page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    const state = await new Promise(resolve => {
      gameSocket.socket.once('state_update', resolve);
      gameSocket.socket.emit('resume_session', {});
    });
    state.turnPhase = 'atk_rolled';
    state.attackRolls = [1, 2, 3, 4];
    window.testConfirmRequests = [];
    window.restoreConfirm = gameSocket.confirmDice;
    gameSocket.confirmDice = indices => window.testConfirmRequests.push(indices);
    for (let i = 0; i < 6; i++) gameSocket.socket.emitEvent(['state_update', structuredClone(state)]);
  });
  const dice = page.locator('.die.attack.selectable');
  await dice.nth(0).focus();
  await page.keyboard.press('Enter');
  await expect(dice.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await dice.nth(1).click();
  await dice.nth(2).click();
  await page.locator('#btn-confirm').click();
  await expect(page.locator('#btn-confirm')).toBeDisabled();
  const requests = await page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    gameSocket.confirmDice = window.restoreConfirm;
    return window.testConfirmRequests;
  });
  expect(requests).toEqual([[0, 1, 2]]);
  expect(errors).toEqual([]);
  expect(await page.locator('[onclick], [onkeydown]').count()).toBe(0);
});

test('late purchase replies, old cleanup and old animation cannot change a replacement battle', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await enterBattle(page);
  const result = await page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    const { renderBattle, onTurnResolved } = await import('/src/pages/battle.js');
    const { cardMap } = await import('/shared/cards.js');
    const state = await new Promise(resolve => {
      gameSocket.socket.once('state_update', resolve);
      gameSocket.socket.emit('resume_session', {});
    });
    const shopState = structuredClone(state);
    shopState.me.tp = 10;
    shopState.draftShop = { active: true, players: {
      [state.me.id]: { ready: false, slots: [{ card: cardMap.card_gen_01, refreshesLeft: 2 }] },
    } };
    const buy = gameSocket.buyDraftCard;
    const refresh = gameSocket.refreshDraftSlot;
    let lateReply;
    let purchases = 0;
    let refreshes = 0;
    gameSocket.buyDraftCard = (_index, acknowledge) => { purchases++; lateReply = acknowledge; };
    gameSocket.refreshDraftSlot = () => refreshes++;
    try {
      const app = document.getElementById('app');
      const firstCleanup = renderBattle(app, { state: shopState });
      document.querySelector('[data-battle-action="refreshDraftSlot"]').click();
      const oldCleanup = renderBattle(app, { state: structuredClone(shopState) });
      const slot = document.querySelector('[data-battle-action="buyDraftCard"]');
      slot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const resolvedState = structuredClone(state);
      resolvedState.me.hp = 1;
      onTurnResolved({ state: resolvedState, damage: 8, finalDef: 3, attackerIdx: 1 });
      renderBattle(app, { state });
      firstCleanup();
      oldCleanup();
      lateReply({ ok: false, error: '旧页面购买失败' });
      document.getElementById('hand-fab').click();
      const handOpen = document.getElementById('hand-fab').getAttribute('aria-expanded');
      await new Promise(resolve => setTimeout(resolve, 3300));
      return {
        purchases, refreshes, handOpen,
        hp: document.getElementById('hp-me-t').textContent,
        expectedHp: `${state.me.hp}/${state.me.maxHp}`,
        modalCount: document.querySelectorAll('#draft-shop-modal').length,
        staleToast: document.body.textContent.includes('旧页面购买失败'),
        listeners: gameSocket.socket.listeners('state_update').length,
        legacyHandlers: ['_toggleHand', '_buyDraftCard', '_showToast', 'selectFfaTarget'].filter(name => name in window),
      };
    } finally {
      gameSocket.buyDraftCard = buy;
      gameSocket.refreshDraftSlot = refresh;
    }
  });
  expect(result).toMatchObject({ purchases: 1, refreshes: 1, handOpen: 'true', modalCount: 0, staleToast: false, listeners: 1, legacyHandlers: [] });
  expect(result.hp.replaceAll(' ', '')).toBe(result.expectedHp);
  expect(errors).toEqual([]);
});
