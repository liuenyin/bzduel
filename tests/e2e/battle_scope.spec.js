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
