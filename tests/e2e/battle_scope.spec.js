import { test, expect } from '@playwright/test';

test('matchmaking waiting can be cancelled without trapping the lobby', async ({ page }) => {
  await page.goto('/');
  await page.fill('#nickname-input', '取消匹配测试');
  await page.click('#btn-match');
  await expect(page.locator('#btn-cancel-match')).toBeVisible();
  await page.click('#btn-cancel-match');
  await expect(page.locator('#status')).toContainText('已取消匹配');
  await expect(page.locator('#btn-match')).toBeVisible();
});

test('room chat hides again after leaving the waiting room', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.chat-widget')).toHaveCSS('display', 'none');
  await page.fill('#nickname-input', '聊天生命周期测试');
  await page.click('#btn-create');
  await expect(page.locator('.chat-widget')).toHaveCSS('display', 'flex');
  await page.click('#btn-leave-waiting');
  await expect(page.locator('#nickname-input')).toBeVisible();
  await expect(page.locator('.chat-widget')).toHaveCSS('display', 'none');
});

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

test('targeted reroll presents hidden FFA dice by position and submits the selected target', async ({ page }) => {
  await enterBattle(page);
  await page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    const { renderBattle } = await import('/src/pages/battle.js');
    const { cardMap } = await import('/shared/cards.js');
    const state = await new Promise(resolve => {
      gameSocket.socket.once('state_update', resolve);
      gameSocket.socket.emit('resume_session', {});
    });
    const primary = state.players[1];
    const secondary = { ...structuredClone(primary), id: 'secondary', nickname: '隐藏目标' };
    state.players.push(secondary);
    Object.assign(state, { gameMode: 'sanguosha', opponent: null, attackerIdx: 0, defenderIdx: 1,
      turnPhase: 'def_rolled', isMyAttackTurn: false, isMyDefendTurn: false, attackRolls: [2, 3, 4],
      defenseRolls: null, aoeDefenses: {
        [primary.id]: { confirmed: true, rolls: null, rollCount: 3 },
        secondary: { confirmed: false, rolls: null, rollCount: 3 },
      },
    });
    state.me.handCards = [cardMap.card_gen_01];
    window.rerollRequests = [];
    gameSocket.playTacticalCard = (id, options, acknowledge) => {
      window.rerollRequests.push({ id, options });
      acknowledge({ ok: true });
    };
    renderBattle(document.getElementById('app'), { state });
  });
  await page.locator('#hand-fab').click();
  await page.locator('[data-battle-action="playTacticalCard"][data-value="card_gen_01"]').click();
  const dialog = page.getByRole('dialog', { name: '选择重投目标' });
  await expect(dialog.locator('[data-battle-action="playTargetedCard"]')).toHaveCount(6);
  await expect(dialog.getByRole('button', { name: '隐藏目标 · 第 2 颗（?）', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '隐藏目标 · 第 2 颗（?）', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.rerollRequests)).toEqual([
    { id: 'card_gen_01', options: { targetId: 'secondary', dieIndex: 1 } },
  ]);
});

test('disabled hand and supply cards explain why they cannot be used', async ({ page }) => {
  await enterBattle(page);
  await page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    const { renderBattle } = await import('/src/pages/battle.js');
    const { cardMap } = await import('/shared/cards.js');
    const state = await new Promise(resolve => {
      gameSocket.socket.once('state_update', resolve);
      gameSocket.socket.emit('resume_session', {});
    });
    state.turnPhase = 'waiting_atk';
    state.attackerIdx = state.myIndex === 0 ? 1 : 0;
    state.defenderIdx = state.myIndex;
    state.isMyAttackTurn = false;
    state.isMyDefendTurn = true;
    state.draftShop = { active: false };
    state.me.handCards = [cardMap.card_gen_04];
    renderBattle(document.getElementById('app'), { state });
  });
  await page.locator('#hand-fab').click();
  await expect(page.locator('.hand-card-kards .card-disable-overlay')).toBeVisible();
  await expect(page.locator('.hand-card-kards .card-disable-badge')).toContainText('仅在攻击回合使用');

  await page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    const { renderBattle } = await import('/src/pages/battle.js');
    const { cardMap } = await import('/shared/cards.js');
    const state = await new Promise(resolve => {
      gameSocket.socket.once('state_update', resolve);
      gameSocket.socket.emit('resume_session', {});
    });
    state.me.handCards = [cardMap.card_gen_02, cardMap.card_gen_04, cardMap.card_gen_06];
    state.me.tp = 0;
    state.draftShop = { active: true, players: {
      [state.me.id]: { ready: false, slots: [{ card: cardMap.card_gen_01, refreshesLeft: 1 }] },
    } };
    renderBattle(document.getElementById('app'), { state });
  });
  await expect(page.locator('.draft-slot-card .card-disable-overlay')).toBeVisible();
  await expect(page.locator('.draft-slot-card .card-disable-badge')).toContainText('手牌已满');
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

for (const width of [320, 375, 1280]) test(`card details stay readable without playing or buying at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 812 });
  await enterBattle(page);
  const description = '这是需要完整阅读的卡牌说明。'.repeat(30) + '<最后一段>不可省略。';
  await page.evaluate(async description => {
    const { gameSocket } = await import('/src/net/socket.js');
    const { renderBattle } = await import('/src/pages/battle.js');
    const { cardMap } = await import('/shared/cards.js');
    const { state } = await new Promise(resolve => gameSocket.requestState(resolve));
    Object.assign(state, { turnPhase: 'waiting_atk', isMyAttackTurn: false, isMyDefendTurn: true,
      attackerIdx: 1 - state.myIndex, defenderIdx: state.myIndex, draftShop: { active: false } });
    state.me.handCards = [{ ...cardMap.card_gen_04, desc: description }, cardMap.card_gen_02, cardMap.card_gen_06];
    window.cardDetailState = state;
    window.cardDetailRequests = { play: 0, buy: 0 };
    gameSocket.playTacticalCard = () => window.cardDetailRequests.play++;
    gameSocket.buyDraftCard = () => window.cardDetailRequests.buy++;
    renderBattle(document.getElementById('app'), { state });
  }, description);
  await page.locator('#hand-fab').click();
  await expect(page.locator('.hand-card-kards').first()).toBeDisabled();
  const inspectHand = page.locator('[data-battle-action="viewCardDetails"][data-value="hand:0"]');
  await inspectHand.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('.card-details-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.card-details-description')).toHaveText(description);
  await expect(dialog.locator('.card-details-status')).toContainText('仅在攻击回合使用');
  const close = dialog.getByRole('button', { name: '关闭卡牌说明' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.querySelector('.card-details-dialog').contains(document.activeElement))).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('card-details.png') });

  // A state refresh must update the reason and keep reading open.
  await page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    const state = window.cardDetailState;
    Object.assign(state, { attackerIdx: state.myIndex, defenderIdx: 1 - state.myIndex,
      isMyAttackTurn: true, isMyDefendTurn: false });
    gameSocket.socket.emitEvent(['state_update', structuredClone(state)]);
  });
  await expect(dialog.locator('.card-details-status')).toHaveText('当前可以打出');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(inspectHand).toBeFocused();
  await expect(page.locator('#hand-fab')).toHaveAttribute('aria-expanded', 'true');

  await page.evaluate(async description => {
    const { renderBattle } = await import('/src/pages/battle.js');
    const { cardMap } = await import('/shared/cards.js');
    const state = window.cardDetailState;
    state.me.handCards = [];
    state.me.tp = 10;
    state.draftShop = { active: true, players: { [state.me.id]: {
      ready: false, slots: [cardMap.card_gen_01, cardMap.card_gen_02, cardMap.card_gen_06]
        .map(card => ({ card: { ...card, desc: description }, refreshesLeft: 1 })),
    } } };
    renderBattle(document.getElementById('app'), { state });
  }, description);
  const inspectDraft = page.locator('[data-battle-action="viewCardDetails"][data-value="draft:0"]');
  await inspectDraft.click();
  await expect(dialog.locator('.card-details-description')).toHaveText(description);
  await expect(dialog.locator('.card-details-status')).toHaveText('可在补给站购买');
  await close.click();
  await expect(inspectDraft).toBeFocused();
  expect(await page.evaluate(() => window.cardDetailRequests)).toEqual({ play: 0, buy: 0 });
  await inspectDraft.click();
  // A refreshed slot must not leave an obsolete card description open.
  await page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    const { cardMap } = await import('/shared/cards.js');
    const state = window.cardDetailState;
    state.draftShop.players[state.me.id].slots[0].card = cardMap.card_gen_02;
    gameSocket.socket.emitEvent(['state_update', structuredClone(state)]);
  });
  await expect(dialog).toHaveCount(0);
  await expect(inspectDraft).toBeFocused();
  await page.locator('.draft-slot-card.clickable').first().click();
  expect(await page.evaluate(() => window.cardDetailRequests)).toEqual({ play: 0, buy: 1 });
  await inspectDraft.click();
  await page.evaluate(async () => {
    const { renderBattle } = await import('/src/pages/battle.js');
    renderBattle(document.getElementById('app'), { state: window.cardDetailState });
  });
  await expect(dialog).toHaveCount(0);
});
