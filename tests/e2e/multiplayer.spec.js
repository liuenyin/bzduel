import { test, expect } from '@playwright/test';

test.setTimeout(90000);
test.use({ actionTimeout: 10000 });

async function send(page, event, payload = {}) {
  await page.evaluate(async ({ event, payload }) => {
    const { gameSocket } = await import('/src/net/socket.js');
    gameSocket.socket.emit(event, payload);
  }, { event, payload });
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No server state')), 5000);
      gameSocket.socket.once('state_update', state => { clearTimeout(timer); resolve(state); });
      gameSocket.socket.emit('request_state');
    });
  });
}

async function acknowledge(page, event, payload = {}) {
  return page.evaluate(async ({ event, payload }) => {
    const { gameSocket } = await import('/src/net/socket.js');
    return new Promise((resolve, reject) => {
      gameSocket.socket.timeout(5000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result));
    });
  }, { event, payload });
}

async function createParty(browser, count, cardId) {
  const contexts = [];
  const pages = [];
  const errors = [];
  try {
    for (let i = 0; i < count; i++) {
      const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
      contexts.push(context);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      pages.push(page);
      await page.goto('/');
      await page.evaluate(async () => {
        const { gameSocket } = await import('/src/net/socket.js');
        window.resolvedTurns = [];
        gameSocket.socket.on('turn_resolved', result => window.resolvedTurns.push(result));
      });
    }
    const roomId = await pages[0].evaluate(async () => {
      const { gameSocket } = await import('/src/net/socket.js');
      return new Promise(resolve => {
        gameSocket.socket.once('room_created', data => resolve(data.roomId));
        gameSocket.socket.emit('create_ffa_room', { nickname: '玩家0' });
      });
    });
    for (let i = 1; i < count; i++) {
      await send(pages[i], 'join_ffa_room', { roomId, nickname: `玩家${i}` });
    }
    await expect(pages[0].locator('#ffa-player-list li')).toHaveCount(count);
    await pages[0].click('#btn-start-ffa');
    for (const page of pages) {
      await page.click(`.avatar-cell[data-id="${cardId}"]`);
      await page.click('#modal-select-btn');
      await page.click('#btn-ready');
    }
    for (const page of pages) await expect(page.locator('#phase-text')).toBeVisible();
    return { pages, errors, close: () => Promise.allSettled(contexts.map(context => context.close())) };
  } catch (error) {
    await Promise.all(contexts.map(context => context.close()));
    throw error;
  }
}

async function prepareAoe(pages) {
  const states = await Promise.all(pages.map(snapshot));
  const attackerIndex = states.findIndex(state => state.isMyAttackTurn);
  const attacker = pages[attackerIndex];
  const defenders = pages.filter((_, i) => i !== attackerIndex);
  await send(attacker, 'select_target', { targetId: states.find(state => !state.isMyAttackTurn).me.id });
  await expect(attacker.locator('#btn-roll')).toBeEnabled();
  await attacker.click('#btn-roll');
  for (let i = 0; i < 3; i++) await attacker.locator('.die.attack.selectable').nth(i).click();
  await attacker.click('#btn-confirm');
  for (const page of defenders) {
    await expect(page.locator('.die.defense.selectable')).toHaveCount(3);
    const values = await page.locator('.die.defense.selectable').evaluateAll(dice => dice.map(d => Number(d.dataset.val)));
    await page.locator('.die.defense.selectable').nth(values.indexOf(Math.max(...values))).click();
  }
  return { attacker, defenders, states };
}

test('three browsers confirm an AoE concurrently and receive exactly one settlement', async ({ browser }) => {
  const party = await createParty(browser, 3, 'char_13');
  try {
    const { defenders } = await prepareAoe(party.pages);
    await Promise.all(defenders.map(page => page.click('#btn-confirm')));
    for (const page of party.pages) {
      await expect.poll(() => page.evaluate(() => window.resolvedTurns.length)).toBe(1);
      const state = await snapshot(page);
      expect(state.log.filter(entry => entry.type === 'turn')).toHaveLength(1);
      expect(state.totalRound).toBe(2);
    }
    const viewer = party.pages[0];
    await viewer.click('#battle-log > summary');
    const explanation = viewer.locator('#battle-log .damage-explanation').first();
    await explanation.locator('summary').click();
    await expect(explanation).toContainText('本次攻击伤害');
    await viewer.setViewportSize({ width: 375, height: 812 });
    await explanation.scrollIntoViewIfNeeded();
    const bounds = await explanation.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
    await viewer.screenshot({ path: test.info().outputPath('damage-details-mobile.png'), fullPage: true });
    expect(party.errors).toEqual([]);
  } finally { await party.close(); }
});

test('pending AoE defense survives reconnection and a timeout resumes play with the eliminated player spectating', async ({ browser }) => {
  const party = await createParty(browser, 4, 'char_13');
  try {
    const { attacker, defenders } = await prepareAoe(party.pages);
    const defenderStates = await Promise.all(defenders.map(snapshot));
    const pendingIndex = defenderStates.findIndex(state => state.me.identity !== 'lord');
    const pending = defenders[pendingIndex];
    const pendingId = defenderStates[pendingIndex].me.id;
    for (const page of defenders.filter(page => page !== pending)) {
      await expect(page.locator('.die.defense.selected')).toHaveCount(1);
      await page.click('#btn-confirm');
      await expect(page.locator('#btn-confirm')).toHaveCount(0);
      await expect(page.locator('#phase-text')).toContainText('防御已确认');
    }
    await expect(attacker.locator('#phase-text')).toContainText(defenderStates[pendingIndex].me.nickname);
    await pending.evaluate(async () => {
      const { gameSocket } = await import('/src/net/socket.js');
      gameSocket.socket.disconnect();
      gameSocket.socket.connect();
    });
    await expect(pending.locator('.die.defense.selectable')).toHaveCount(3);
    const restored = await snapshot(pending);
    expect(restored.aoeDefenses[pendingId].confirmed).toBe(false);
    expect(restored.aoeDefenses[pendingId].rolls).toEqual(defenderStates[pendingIndex].aoeDefenses[pendingId].rolls);
    await pending.evaluate(async () => (await import('/src/net/socket.js')).gameSocket.socket.disconnect());
    await expect.poll(async () => (await snapshot(attacker)).players.find(p => p.id === pendingId).isDead, { timeout: 12000 }).toBe(true);
    await pending.evaluate(async () => (await import('/src/net/socket.js')).gameSocket.socket.connect());
    await expect(pending.locator('#phase-text')).toContainText('观战');
    await expect(pending.locator('#btn-roll, #btn-confirm, .die.selectable')).toHaveCount(0);
    const state = await snapshot(attacker);
    expect(state.phase).toBe('battle');
    expect(state.log.filter(entry => entry.type === 'turn')).toHaveLength(1);
    expect(await attacker.evaluate(() => window.resolvedTurns.length)).toBe(1);
    expect(party.errors).toEqual([]);
  } finally { await party.close(); }
});

test('three-player supply preserves purchases and ready status across reload and rejects late shopping', async ({ browser }) => {
  const party = await createParty(browser, 3, 'char_14');
  try {
    // Four normal attacks reach the first supply break without random damage.
    for (let turn = 0; turn < 4; turn++) {
      const states = await Promise.all(party.pages.map(snapshot));
      const index = states.findIndex(state => state.isMyAttackTurn);
      const page = party.pages[index];
      await send(page, 'select_target', { targetId: states[(index + 1) % states.length].me.id });
      await page.click('#btn-roll');
      await page.click('#btn-buy-water');
      await expect.poll(async () => (await snapshot(page)).totalRound).toBe(turn + 2);
    }
    const buyer = party.pages[0];
    await expect(buyer.locator('#draft-shop-modal')).toBeVisible();
    const before = await snapshot(buyer);
    const slots = before.draftShop.players[before.me.id].slots;
    const affordable = slots.findIndex(slot => slot.card.tpCost <= before.me.tp);
    const purchase = await acknowledge(buyer, 'buy_draft_card', { slotIndex: affordable < 0 ? 0 : affordable });
    expect(purchase.ok).toBe(affordable >= 0);
    const bought = await snapshot(buyer);
    expect(bought.me.handCards.length).toBe(before.me.handCards.length + (affordable >= 0 ? 1 : 0));
    if (affordable >= 0) expect(bought.me.tp).toBe(before.me.tp - slots[affordable].card.tpCost);
    await buyer.click('[data-battle-action="confirmDraftReady"]');
    await expect(buyer.locator('.draft-waiting-state')).toContainText('已完成选牌');
    await buyer.reload();
    await expect(buyer.locator('.draft-waiting-state')).toContainText('玩家1');
    const ready = await snapshot(buyer);
    expect(ready.me.handCards).toEqual(bought.me.handCards);
    expect(ready.me.tp).toBe(bought.me.tp);
    expect((await acknowledge(buyer, 'buy_draft_card', { slotIndex: 0 })).ok).toBe(false);
    await send(buyer, 'refresh_draft_slot', { slotIndex: 0 });
    const unchanged = await snapshot(buyer);
    expect(unchanged.draftShop).toEqual(ready.draftShop);
    expect(unchanged.me.tp).toBe(ready.me.tp);
    for (const page of party.pages.slice(1)) await page.click('[data-battle-action="confirmDraftReady"]');
    for (const page of party.pages) await expect(page.locator('#draft-shop-modal')).toHaveCount(0);
    expect((await snapshot(buyer)).draftShop.active).toBe(false);
    expect(party.errors).toEqual([]);
  } finally { await party.close(); }
});

test('the last pending AoE defender can leave without blocking the remaining players', async ({ browser }) => {
  const party = await createParty(browser, 4, 'char_13');
  try {
    const { attacker, defenders } = await prepareAoe(party.pages);
    const states = await Promise.all(defenders.map(snapshot));
    const index = states.findIndex(state => state.me.identity !== 'lord');
    const departing = defenders[index];
    const playerId = states[index].me.id;
    for (const page of defenders.filter(page => page !== departing)) await page.click('#btn-confirm');
    departing.on('dialog', dialog => dialog.accept());
    await departing.click('.battle-menu > summary');
    await departing.click('[data-battle-action="leaveBattle"]');
    await expect(departing.locator('#nickname-input')).toBeVisible();
    await expect.poll(async () => (await snapshot(attacker)).players.find(p => p.id === playerId).isDead).toBe(true);
    const state = await snapshot(attacker);
    expect(state.phase).toBe('battle');
    expect(state.totalRound).toBe(2);
    expect(state.log.filter(entry => entry.type === 'turn')).toHaveLength(1);
    expect(await attacker.evaluate(() => window.resolvedTurns.length)).toBe(1);
    expect((await acknowledge(departing, 'resume_session')).ok).toBe(false);
    expect(party.errors).toEqual([]);
  } finally { await party.close(); }
});
