import { test, expect } from '@playwright/test';

// Drop the notification at the transport dispatch boundary while allowing the
// actual server acknowledgement through; do not fake a successful response.
async function dropLobbyEvents(page) {
  await page.evaluate(async () => {
    const { gameSocket } = await import('/src/net/socket.js');
    const original = gameSocket.socket.onevent;
    gameSocket.socket.onevent = function (packet) {
      if (['match_found', 'room_created'].includes(packet.data?.[0])) return;
      return original.call(this, packet);
    };
  });
}

for (const custom of [false, true]) test(`${custom ? 'custom ' : ''}PVE acknowledgement opens preparation when match notification is lost`, async ({ page }) => {
  await page.goto('/');
  await dropLobbyEvents(page);
  await page.fill('#nickname-input', '回执开局');
  if (custom) {
    await page.click('#btn-pve-custom');
    await page.click('.pve-opponent-option[data-character-id="char_14"]');
    await page.click('#btn-start-custom-pve');
  } else await page.click('#btn-pve');
  await expect(page.locator('#card-selector')).toBeVisible();
  if (custom) await expect(page.locator('.prep-opponent-summary')).toContainText('周煊声');
  await page.click('.avatar-cell[data-id="char_6"]');
  await page.click('#modal-select-btn');
  await expect(page.locator('#btn-ready')).toBeEnabled();
  await page.click('#btn-ready');
  await expect(page.locator('.arena')).toBeVisible();
});

test('matched acknowledgement opens preparation and a late PVE reply cannot revive an old page', async ({ browser, page }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const waiting = await context.newPage();
    await waiting.goto('/');
    await waiting.fill('#nickname-input', '等待匹配');
    await waiting.click('#btn-match');
    await expect(waiting.locator('#btn-cancel-match')).toBeVisible();
    await page.goto('/');
    await dropLobbyEvents(page);
    await page.fill('#nickname-input', '回执匹配');
    await page.click('#btn-match');
    await expect(page.locator('#card-selector')).toBeVisible();
    await expect(waiting.locator('#card-selector')).toBeVisible();
  } finally { await context.close(); }

  // Use a fresh session to hold the real PVE reply until after the player has
  // left preparation. It must not navigate away from the new lobby.
  const fresh = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const player = await fresh.newPage();
    await player.goto('/');
    await player.evaluate(async () => {
      const { gameSocket } = await import('/src/net/socket.js');
      const original = gameSocket.startPVE.bind(gameSocket);
      gameSocket.startPVE = (name, acknowledge) => original(name, result => {
        window.deliverLateLobbyReply = () => acknowledge(result);
      });
    });
    await player.fill('#nickname-input', '迟到回执');
    await player.click('#btn-pve');
    await expect(player.locator('#card-selector')).toBeVisible();
    player.on('dialog', dialog => dialog.accept());
    await player.click('#btn-leave-room');
    await expect(player.locator('#nickname-input')).toBeVisible();
    await player.evaluate(() => window.deliverLateLobbyReply());
    await expect(player.locator('#nickname-input')).toBeVisible();
    await expect(player.locator('#card-selector')).toHaveCount(0);
  } finally { await fresh.close(); }
});

test('create and join acknowledgements recover rooms without lobby notifications', async ({ browser, page }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    await page.goto('/');
    await dropLobbyEvents(page);
    await page.fill('#nickname-input', '回执房主');
    await page.click('#btn-create');
    await expect(page.locator('#btn-leave-waiting')).toBeVisible();
    const roomId = await page.evaluate(async () => (await import('/src/net/socket.js')).gameSocket.currentRoomId);
    expect(roomId).toBeTruthy();
    await expect(page.locator('#status')).toContainText(roomId);

    const guest = await context.newPage();
    await guest.goto('/');
    await dropLobbyEvents(guest);
    await guest.fill('#nickname-input', '回执访客');
    await guest.fill('#room-input', roomId);
    await guest.click('#btn-join');
    await expect(guest.locator('#card-selector')).toBeVisible();
    await expect(guest.locator('.prep-opponent-summary')).toContainText('回执房主');
  } finally { await context.close(); }
});

test('rejected FFA start retains room controls and can be retried after friends join', async ({ browser, page }) => {
  const contexts = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/');
    const roomId = await page.evaluate(async () => {
      const { gameSocket } = await import('/src/net/socket.js');
      return new Promise(resolve => {
        gameSocket.socket.once('room_created', room => resolve(room.roomId));
        gameSocket.createFfaRoom('房主');
      });
    });
    await page.click('#btn-start-ffa');
    await expect(page.locator('#status')).toContainText('大乱斗至少需要 3 名玩家');
    await expect(page.locator('#btn-start-ffa')).toBeEnabled();
    await expect(page.locator('#btn-leave-waiting')).toBeVisible();
    await expect(page.locator('#status')).toContainText(roomId);

    // Legacy errors must also preserve the waiting room instead of deleting it.
    await page.evaluate(async roomId => {
      const { gameSocket } = await import('/src/net/socket.js');
      gameSocket.socket.emit('start_ffa_game', { roomId });
    }, roomId);
    await expect(page.locator('#btn-start-ffa')).toBeEnabled();
    for (let index = 0; index < 2; index++) {
      const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
      contexts.push(context);
      const guest = await context.newPage();
      await guest.goto('/');
      await guest.evaluate(async ({ roomId, index }) => {
        const { gameSocket } = await import('/src/net/socket.js');
        gameSocket.joinFfaRoom(`好友${index}`, roomId);
      }, { roomId, index });
    }
    await expect(page.locator('#ffa-player-list li')).toHaveCount(3);
    await page.click('#btn-start-ffa');
    await expect(page.locator('#card-selector')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
