# Handoff Report — reviewer_e2e_3

## Review Summary
- **Verdict**: **REQUEST_CHANGES**
- **Target Files**:
  - `tests/e2e/ui_vfx_verification.spec.js`
  - `tests/e2e/run_headless_verification.js`
  - `TEST_READY.md`

---

## 1. Observation

- **Selector Cleanup (`char_gpy`)**:
  - Verified 0 occurrences of `char_gpy` in the entire codebase via `git grep "char_gpy"`.
  - Confirmed both `tests/e2e/ui_vfx_verification.spec.js` and `tests/e2e/run_headless_verification.js` use valid character IDs (`char_6` - 黄佳程, `char_fxr` - 付修然) defined in `shared/characters.js`.

- **Test Execution Findings**:
  1. `node tests/e2e/run_headless_verification.js`:
     - Result: **Passed 100%** (Tiers 1-4 completed with 0 errors).
  2. `npx playwright test tests/e2e/ui_vfx_verification.spec.js`:
     - Result: **FAILED (9 passed, 1 failed out of 10 tests)**.
     - Failure Details:
       - **Failed Test**: `tests/e2e/ui_vfx_verification.spec.js:165` (`Tier 2: Boundary & Corner Cases › 2.1 Rapid Reroll (#btn-reroll)`)
       - **Error Output**:
         ```
         1) tests\e2e\ui_vfx_verification.spec.js:165:5 › School Dice Duel - UI/UX & VFX Verification › Tier 2: Boundary & Corner Cases › 2.1 Rapid Reroll (#btn-reroll) 

            Test timeout of 30000ms exceeded.

            Error: page.waitForTimeout: Target page, context or browser has been closed

              195 |         await selectableDie.click();
              196 |         const rerollBtn = page.locator('#btn-reroll');
            > 197 |
                  | ^
              198 |         if (await rerollBtn.isVisible()) {
              199 |           await rerollBtn.click().catch(() => {});
              200 |           await rerollBtn.click().catch(() => {});
         ```

---

## 2. Logic Chain

1. **Root Cause of Test 2.1 Failure**:
   - In `tests/e2e/ui_vfx_verification.spec.js` (lines 193-203):
     ```javascript
     const selectableDie = page.locator('#dice-area .die.selectable').first();
     if (await selectableDie.isVisible({ timeout: 8000 }).catch(() => false)) {
       await selectableDie.click();
       const rerollBtn = page.locator('#btn-reroll');

       if (await rerollBtn.isVisible()) {
         await rerollBtn.click().catch(() => {});
         await rerollBtn.click().catch(() => {});
         await page.waitForTimeout(500);
       }
     }
     ```
   - **Flaw 1**: In Playwright, `locator.isVisible()` evaluates DOM visibility immediately and ignores options like `{ timeout: 8000 }`. Because `isVisible()` evaluates to `false` synchronously before the GSAP dice rolling animation finishes adding `.selectable` class to `.die`, the `if` condition fails or executes non-deterministically.
   - **Flaw 2**: When `selectableDie.click()` occurs and `rerollBtn.click()` is executed the first time, the client sends a socket reroll request and disables/hides `#btn-reroll` during the reroll animation. The second `await rerollBtn.click().catch(() => {})` on line 200 blocks indefinitely waiting for Playwright's actionability check (waiting for element to be visible and enabled) until the 30,000ms test timeout is reached.

2. **Impact**:
   - The test suite fails to achieve the required 100% pass status on `npx playwright test tests/e2e/ui_vfx_verification.spec.js`.
   - `TEST_READY.md` claims 10 passed out of 10 tests, which is currently inaccurate due to Test 2.1 timeout failure.

---

## 3. Findings & Suggested Fixes

### [Major] Finding 1: Flaky / Timing-Fragile Test Logic in Spec Test 2.1

- **What**: Test `2.1 Rapid Reroll (#btn-reroll)` fails with a 30,000ms Playwright timeout.
- **Where**: `tests/e2e/ui_vfx_verification.spec.js:165-204`
- **Why**:
  1. `selectableDie.isVisible({ timeout: 8000 })` does not wait for visibility. `selectableDie.waitFor({ state: 'visible', timeout: 8000 })` or `page.waitForSelector('#dice-area .die.selectable', { timeout: 8000 })` should be used instead.
  2. Sequential `await rerollBtn.click()` on a button that gets disabled during animation causes Playwright to wait for actionability until timeout.
- **Suggestion**:
  Update lines 189-203 in `tests/e2e/ui_vfx_verification.spec.js`:
  ```javascript
  await page.waitForSelector('#dice-area .die.selectable', { timeout: 8000 }).catch(() => {});
  const selectableDie = page.locator('#dice-area .die.selectable').first();
  if (await selectableDie.isVisible()) {
    await selectableDie.click();
    const rerollBtn = page.locator('#btn-reroll');

    if (await rerollBtn.isVisible()) {
      // Rapid double click with force: true or short timeout to test rapid clicks without blocking on actionability
      await rerollBtn.click({ force: true }).catch(() => {});
      await rerollBtn.click({ force: true, timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  ```

---

## 4. Caveats

- `node tests/e2e/run_headless_verification.js` passes 100% across Tiers 1-4, but `npx playwright test tests/e2e/ui_vfx_verification.spec.js` must also pass 100% cleanly.

---

## 5. Conclusion

- **Verdict**: **REQUEST_CHANGES**
- Remediation required for Test 2.1 in `tests/e2e/ui_vfx_verification.spec.js` to ensure 100% pass status across both test scripts.

---

## 6. Verification Method

1. Run `npx playwright test tests/e2e/ui_vfx_verification.spec.js`
2. Verify all 10 tests pass with zero failures or timeouts.
3. Run `node tests/e2e/run_headless_verification.js`
4. Confirm 100% pass rate across Tiers 1-4.
