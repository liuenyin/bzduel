import { test, expect } from '@playwright/test';

async function startBattle(page) {
  await page.goto('/');
  await page.fill('#nickname-input', '恢复测试');
  await page.click('#btn-pve-custom');
  await page.click('[data-character-id="char_6"]');
  await page.click('#btn-start-custom-pve');
  await page.click('.avatar-cell[data-id="char_6"]');
  await page.click('#modal-select-btn');
  await page.click('#btn-ready');
  await expect(page.locator('#btn-roll')).toBeEnabled();
  await page.click('#btn-roll');
  await expect(page.locator('.die.attack.selectable')).toHaveCount(4);
}

for (const recovery of ['reload', 'reconnect']) {
  test(`rolled dice remain playable after ${recovery}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await startBattle(page);
    const values = await page.locator('.die.attack').evaluateAll(dice => dice.map(d => d.dataset.val));
    if (recovery === 'reload') await page.reload();
    else {
      await page.evaluate(async () => {
        const { gameSocket } = await import('/src/net/socket.js');
        await new Promise(resolve => {
          gameSocket.lastResumeData = null;
          const stop = gameSocket.onSessionResumed(() => { stop(); resolve(); });
          gameSocket.socket.disconnect();
          gameSocket.socket.connect();
        });
      });
    }
    await expect(page.locator('.die.attack.selectable')).toHaveCount(4);
    expect(await page.locator('.die.attack').evaluateAll(dice => dice.map(d => d.dataset.val))).toEqual(values);
    for (let i = 0; i < 3; i++) await page.locator('.die.attack.selectable').nth(i).click();
    await expect(page.locator('#btn-confirm')).toBeEnabled();
    await page.click('#btn-confirm');
    await expect(page.locator('#battle-log-count')).not.toHaveText('0', { timeout: 15000 });
    expect(errors).toEqual([]);
  });
}

test('simplified motion skips GSAP dice animation', async ({ page }) => {
  await page.goto('/');
  await page.check('#motion-toggle');
  await page.reload();
  await expect(page.locator('#motion-toggle')).toBeChecked();
  const skipped = await page.evaluate(async () => {
    const { vfxManager } = await import('/src/utils/vfx.js');
    const die = document.createElement('div');
    document.body.append(die);
    let completed = false;
    const animation = vfxManager.rollDice([die], [6], () => { completed = true; });
    die.remove();
    return completed && animation === null;
  });
  expect(skipped).toBe(true);
});
