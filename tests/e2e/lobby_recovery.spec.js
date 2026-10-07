import { test, expect } from '@playwright/test';

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
