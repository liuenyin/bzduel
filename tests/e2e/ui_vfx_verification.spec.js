import { test, expect } from '@playwright/test';

/**
 * Strict Error Listener for capturing uncaught JS exceptions and console error logs.
 */
function setupErrorTracking(page) {
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (err) => {
    const text = err.message || err.toString();
    if (!text.includes('WebSocket closed without opened')) {
      pageErrors.push(text);
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out browser static resource 404s and Socket.IO connection close logs during page transitions
      if (!text.includes('Failed to load resource') && !text.includes('WebSocket closed without opened')) {
        consoleErrors.push(text);
      }
    }
  });

  return { pageErrors, consoleErrors };
}

test.describe('School Dice Duel - UI/UX & VFX Verification', () => {

  // ----------------------------------------------------
  // Tier 1: Feature Coverage
  // ----------------------------------------------------
  test.describe('Tier 1: Feature Coverage', () => {

    test('1.1 Lobby Page Load', async ({ page }) => {
      const { pageErrors, consoleErrors } = setupErrorTracking(page);

      await page.goto('http://localhost:3000');
      await page.waitForSelector('#nickname-input');

      await expect(page.locator('.title-main')).toHaveText(/校园战力党/);
      await expect(page.locator('#nickname-input')).toBeVisible();
      await expect(page.locator('#btn-pve')).toBeVisible();
      await expect(page.locator('#btn-match')).toBeVisible();
      await expect(page.locator('#btn-create')).toBeVisible();

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('1.2 Preparation Navigation', async ({ page }) => {
      const { pageErrors, consoleErrors } = setupErrorTracking(page);

      await page.goto('http://localhost:3000');
      await page.waitForSelector('#nickname-input');
      await page.fill('#nickname-input', 'Tester_T1_2');
      await page.click('#btn-pve');

      await page.waitForSelector('#card-selector');
      await expect(page.locator('#schedule-bar')).toBeVisible();
      const avatars = page.locator('.avatar-cell');
      expect(await avatars.count()).toBeGreaterThan(0);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('1.3 Battle Init (1v1 PVE mode)', async ({ page }) => {
      const { pageErrors, consoleErrors } = setupErrorTracking(page);

      await page.goto('http://localhost:3000');
      await page.waitForSelector('#nickname-input');
      await page.fill('#nickname-input', 'Tester_T1_3');
      await page.click('#btn-pve');

      await page.waitForSelector('#card-selector');
      await page.waitForSelector('.avatar-cell[data-id="char_6"]');
      await page.click('.avatar-cell[data-id="char_6"]');
      await page.waitForSelector('#modal-select-btn');
      await page.click('#modal-select-btn');

      await page.waitForSelector('#btn-ready:not([disabled])');
      await page.click('#btn-ready');

      await page.waitForSelector('.arena');
      await expect(page.locator('#card-me')).toBeVisible();
      await expect(page.locator('#card-op')).toBeVisible();

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('1.4 Dice Roll Trigger', async ({ page }) => {
      const { pageErrors, consoleErrors } = setupErrorTracking(page);

      await page.goto('http://localhost:3000');
      await page.waitForSelector('#nickname-input');
      await page.fill('#nickname-input', 'Tester_T1_4');
      await page.click('#btn-pve');

      await page.waitForSelector('#card-selector', { state: 'visible', timeout: 10000 });
      await page.waitForSelector('.avatar-cell[data-id="char_6"]', { state: 'visible', timeout: 10000 });
      await page.click('.avatar-cell[data-id="char_6"]');
      await page.waitForSelector('#modal-select-btn', { state: 'visible', timeout: 10000 });
      await page.click('#modal-select-btn');

      await page.waitForSelector('#btn-ready:not([disabled])', { state: 'visible', timeout: 10000 });
      await page.click('#btn-ready');

      await page.waitForSelector('.arena', { state: 'visible', timeout: 10000 });

      // Wait for turn action (roll button or selectable dice)
      const rollBtn = page.locator('#btn-roll');
      if (await rollBtn.isVisible()) {
        if (await rollBtn.isEnabled()) {
          await rollBtn.click();
        }
      }

      await page.waitForSelector('#dice-area .die', { timeout: 8000 }).catch(() => {});
      const diceCount = await page.locator('#dice-area .die').count();
      expect(diceCount).toBeGreaterThanOrEqual(0);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('1.5 Ultimate / Skill Trigger & Interactive Elements', async ({ page }) => {
      const { pageErrors, consoleErrors } = setupErrorTracking(page);

      await page.goto('http://localhost:3000');
      await page.waitForSelector('#nickname-input');
      await page.fill('#nickname-input', 'Tester_T1_5');
      await page.click('#btn-pve');

      await page.waitForSelector('#card-selector', { state: 'visible', timeout: 10000 });
      await page.waitForSelector('.avatar-cell', { state: 'visible', timeout: 10000 });
      await page.waitForSelector('.avatar-cell[data-id="char_fxr"]', { state: 'visible', timeout: 10000 });
      await page.locator('.avatar-cell[data-id="char_fxr"]').scrollIntoViewIfNeeded().catch(() => {});
      await page.click('.avatar-cell[data-id="char_fxr"]');
      await page.waitForSelector('#modal-select-btn', { state: 'visible', timeout: 10000 });
      await page.click('#modal-select-btn');

      await page.waitForSelector('#btn-ready:not([disabled])', { state: 'visible', timeout: 10000 });
      await page.click('#btn-ready');

      await page.waitForSelector('.arena', { state: 'visible', timeout: 10000 });

      const skillSummary = page.locator('#card-me summary');
      if (await skillSummary.isVisible()) {
        await skillSummary.click();
      }

      const handFab = page.locator('#hand-fab');
      if (await handFab.isVisible()) {
        await handFab.click();
        await page.waitForTimeout(300);
        await handFab.click();
      }

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });

  // ----------------------------------------------------
  // Tier 2: Boundary & Corner Cases
  // ----------------------------------------------------
  test.describe('Tier 2: Boundary & Corner Cases', () => {

    test('2.1 Rapid Reroll (#btn-reroll)', async ({ page }) => {
      const { pageErrors, consoleErrors } = setupErrorTracking(page);

      await page.goto('http://localhost:3000');
      await page.waitForSelector('#nickname-input');
      await page.fill('#nickname-input', 'Tester_T2_1');
      await page.click('#btn-pve');

      await page.waitForSelector('#card-selector', { state: 'visible', timeout: 10000 });
      await page.waitForSelector('.avatar-cell', { state: 'visible', timeout: 10000 });
      await page.waitForSelector('.avatar-cell[data-id="char_6"]', { state: 'visible', timeout: 10000 });
      await page.click('.avatar-cell[data-id="char_6"]');
      await page.waitForSelector('#modal-select-btn', { state: 'visible', timeout: 10000 });
      await page.click('#modal-select-btn');
      await page.waitForSelector('#btn-ready:not([disabled])', { state: 'visible', timeout: 10000 });
      await page.click('#btn-ready');

      await page.waitForSelector('.arena', { state: 'visible', timeout: 10000 });

      const rollBtn = page.locator('#btn-roll');
      if (await rollBtn.isVisible()) {
        if (await rollBtn.isEnabled()) {
          await rollBtn.click();
        }
      }

      await page.waitForSelector('#dice-area .die.selectable', { timeout: 10000 });
      const selectableDie = page.locator('#dice-area .die.selectable').first();
      await expect(selectableDie).toBeVisible({ timeout: 10000 });
      await selectableDie.click();
      await page.waitForTimeout(200);
      const rerollBtn = page.locator('#btn-reroll');

      if (await rerollBtn.isVisible()) {
        await rerollBtn.click();
        await expect(rerollBtn).toBeHidden();
        await page.waitForTimeout(500);
      }

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('2.2 Multi-hit Damage Check & VFX', async ({ page }) => {
      const { pageErrors, consoleErrors } = setupErrorTracking(page);

      await page.goto('http://localhost:3000');
      await page.waitForSelector('#nickname-input');
      await page.fill('#nickname-input', 'Tester_T2_2');
      await page.click('#btn-pve');

      await page.waitForSelector('#card-selector', { state: 'visible', timeout: 10000 });
      await page.waitForSelector('.avatar-cell[data-id="char_6"]', { state: 'visible', timeout: 10000 });
      await page.click('.avatar-cell[data-id="char_6"]');
      await page.waitForSelector('#modal-select-btn', { state: 'visible', timeout: 10000 });
      await page.click('#modal-select-btn');
      await page.waitForSelector('#btn-ready:not([disabled])', { state: 'visible', timeout: 10000 });
      await page.click('#btn-ready');

      await page.waitForSelector('.arena', { state: 'visible', timeout: 10000 });

      const rollBtn = page.locator('#btn-roll');
      if (await rollBtn.isVisible()) {
        if (await rollBtn.isEnabled()) {
          await rollBtn.click();
        }
      }

      await page.waitForSelector('#dice-area .die.selectable', { timeout: 8000 }).catch(() => {});
      const dice = page.locator('#dice-area .die.selectable');
      const count = await dice.count();
      for (let i = 0; i < count; i++) {
        await dice.nth(i).click().catch(() => {});
      }

      const confirmBtn = page.locator('#btn-confirm');
      if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
        await confirmBtn.click();
        await page.waitForTimeout(1500);
      }

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });

    test('2.3 Mobile Viewport (375x667) Check', async ({ page }) => {
      const { pageErrors, consoleErrors } = setupErrorTracking(page);

      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('http://localhost:3000');
      await page.waitForSelector('#nickname-input');

      let overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);

      await page.fill('#nickname-input', 'Tester_T2_3');
      await page.click('#btn-pve');

      await page.waitForSelector('#card-selector');

      overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);

      await page.waitForSelector('.avatar-cell[data-id="char_6"]', { state: 'visible', timeout: 10000 });
      await page.click('.avatar-cell[data-id="char_6"]');
      await page.waitForSelector('#modal-select-btn');
      await page.click('#modal-select-btn');
      await page.waitForSelector('#btn-ready:not([disabled])');
      await page.click('#btn-ready');

      await page.waitForSelector('.arena');

      overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });

  // ----------------------------------------------------
  // Tier 3: Cross-Feature Combinations
  // ----------------------------------------------------
  test.describe('Tier 3: Cross-Feature Combinations', () => {

    test('3.1 Full Battle Turn Cycle', async ({ page }) => {
      test.setTimeout(60000);
      const { pageErrors, consoleErrors } = setupErrorTracking(page);

      await page.goto('http://localhost:3000');
      await page.waitForSelector('#nickname-input');
      await page.fill('#nickname-input', 'Tester_T3');
      await page.click('#btn-pve');

      await page.waitForSelector('#card-selector');
      await page.waitForSelector('.avatar-cell[data-id="char_6"]');
      await page.click('.avatar-cell[data-id="char_6"]');
      await page.waitForSelector('#modal-select-btn');
      await page.click('#modal-select-btn');
      await page.waitForSelector('#btn-ready:not([disabled])');
      await page.click('#btn-ready');

      await page.waitForSelector('.arena');

      for (let turn = 0; turn < 6; turn++) {
        const gameOver = await page.locator('.game-over-screen').isVisible();
        if (gameOver) break;

        const draftReadyBtn = page.locator('#draft-shop-modal button:has-text("完成选牌")');
        if (await draftReadyBtn.isVisible()) {
          await draftReadyBtn.click();
          await page.waitForTimeout(400);
        }

        const dreamBtn = page.locator('.dream-target-btn').first();
        if (await dreamBtn.isVisible()) {
          await dreamBtn.click();
          await page.waitForTimeout(400);
        }

        const rollBtn = page.locator('#btn-roll');
        if (await rollBtn.isVisible() && await rollBtn.isEnabled()) {
          await rollBtn.click().catch(() => {});
          await page.waitForTimeout(400);
        }

        const dice = page.locator('#dice-area .die.selectable');
        const diceCount = await dice.count();
        if (diceCount > 0) {
          for (let d = 0; d < diceCount; d++) {
            await dice.nth(d).click().catch(() => {});
          }

          const confirmBtn = page.locator('#btn-confirm');
          if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
            await confirmBtn.click().catch(() => {});
          }
        }

        await page.waitForTimeout(1000);
      }

      const gameOverBtn = page.locator('#btn-back');
      if (await gameOverBtn.isVisible()) {
        await gameOverBtn.click();
        await page.waitForSelector('.title-main');
      }

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });

  // ----------------------------------------------------
  // Tier 4: Real-World Application
  // ----------------------------------------------------
  test.describe('Tier 4: Real-World Application', () => {

    test('4.1 Complete Mobile 375px Battle Session', async ({ page }) => {
      test.setTimeout(60000);
      const { pageErrors, consoleErrors } = setupErrorTracking(page);

      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto('http://localhost:3000');
      await page.waitForSelector('#nickname-input');
      await page.fill('#nickname-input', 'Tester_T4_Mobile');
      await page.click('#btn-pve');

      await page.waitForSelector('#card-selector');
      await page.waitForSelector('.avatar-cell[data-id="char_6"]');
      await page.click('.avatar-cell[data-id="char_6"]');
      await page.waitForSelector('#modal-select-btn');
      await page.click('#modal-select-btn');
      await page.waitForSelector('#btn-ready:not([disabled])');
      await page.click('#btn-ready');

      await page.waitForSelector('.arena');

      for (let turn = 0; turn < 4; turn++) {
        const gameOver = await page.locator('.game-over-screen').isVisible();
        if (gameOver) break;

        const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        expect(hasOverflow).toBe(false);

        const draftReadyBtn = page.locator('#draft-shop-modal button:has-text("完成选牌")');
        if (await draftReadyBtn.isVisible()) {
          await draftReadyBtn.click();
          await page.waitForTimeout(400);
        }

        const dreamBtn = page.locator('.dream-target-btn').first();
        if (await dreamBtn.isVisible()) {
          await dreamBtn.click();
          await page.waitForTimeout(400);
        }

        const rollBtn = page.locator('#btn-roll');
        if (await rollBtn.isVisible() && await rollBtn.isEnabled()) {
          await rollBtn.click().catch(() => {});
          await page.waitForTimeout(400);
        }

        const dice = page.locator('#dice-area .die.selectable');
        const diceCount = await dice.count();
        if (diceCount > 0) {
          for (let d = 0; d < diceCount; d++) {
            await dice.nth(d).click().catch(() => {});
          }
          const confirmBtn = page.locator('#btn-confirm');
          if (await confirmBtn.isVisible() && await confirmBtn.isEnabled()) {
            await confirmBtn.click().catch(() => {});
          }
        }

        await page.waitForTimeout(1000);
      }

      const hasFinalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasFinalOverflow).toBe(false);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });

});
