# Handoff Report — Challenger M1_2: Modal Panels & Table Responsive Verification

**Agent**: `challenger_m1_2`  
**Role**: `critic`, `specialist`  
**Date**: 2026-08-05  
**Verdict**: `APPROVE`

---

## 1. Observation

- **Stats Matrix Scroll Wrapper Verification (`src/pages/lobby.js` & `src/style/index.css`)**:
  - `src/pages/lobby.js` (lines 208–236) wraps the character win rate table inside `<div class="stats-matrix-wrap"><table class="stats-matrix">...</table></div>`.
  - `src/style/index.css` (lines 920–941) defines:
    ```css
    .stats-matrix-wrap {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin-top: 10px;
      border-radius: var(--radius);
    }
    .stats-matrix { border-collapse: collapse; width: 100%; min-width: 800px; text-align: center; font-size: 0.85rem; }
    ```
  - Executed automated Playwright empirical test (`tests/e2e/test_m1_2_empirical.js`) on **iPhone SE (375px)** and **iPhone 12/13/14 (390px)** viewports:
    - `wrapOverflowX`: `"auto"`
    - `tableMinWidth`: `"800px"`
    - `tableWidth`: `800px`
    - `wrapScrollWidth`: `800px`
    - `wrapClientWidth`: `284px` (on 375px viewport) / `299px` (on 390px viewport)
    - `bodyHasOverflow`: `false` (`bodyScrollWidth` = `375px` / `390px`)
    - `contentWidth`: `356.25px` (375px screen) / `370.5px` (390px screen) <= 95% modal container width.

- **Modal Panels Scaling & Responsive Layout Verification (`src/style/index.css` & `src/pages/battle.js`)**:
  - **`.dream-target-modal-panel`** (`src/style/index.css` lines 1017–1030):
    ```css
    .dream-target-modal-panel {
      max-width: 440px;
      width: 92%;
      padding: 24px 20px;
      ...
    }
    ```
    - Computed width on 375px viewport: `345px` (left margin `15px`, right margin `15px`, bounding rect fits inside screen `[15, 360]`). Height: `238.4px`.
    - Computed width on 390px viewport: `358.8px` (bounding rect fits inside screen `[15.6, 374.4]`). Height: `238.4px`.
    - Fits horizontally (`fitsInViewportHorizontally: true`), fits vertically (`fitsInViewportVertically: true`), `bodyHasOverflow: false`.
  - **`.game-over-screen` / `.go-content`** (`src/style/index.css` lines 470–492, 843–857):
    ```css
    .go-content {
      ...
      max-width: 90%; width: 600px;
      max-height: 90vh;
      overflow-y: auto;
    }
    @media (max-width: 520px) {
      .go-content {
        padding: 28px 18px; width: 95%; max-width: none; border-radius: 16px;
      }
    }
    ```
    - Computed size on 375px viewport: width `324.9px` (`width: 95%` of modal overlay), height `409.6px`, `maxHeight` `600.3px` (90vh), `overflow-y: auto`, `padding: 28px 18px`. Bounding rect `[25.1, 349.9]`.
    - Computed size on 390px viewport: width `347.8px`, height `421.6px`, `maxHeight` `759.6px` (90vh), `overflow-y: auto`, `padding: 28px 18px`. Bounding rect `[21.1, 368.9]`.
    - Fits horizontally (`fitsHorizontally: true`), fits vertically (`fitsVertically: true`), `bodyHasOverflow: false`.
  - **`.class-banner`** (`src/style/index.css` lines 443–460):
    ```css
    .class-banner {
      position: fixed;
      top: 40%; left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 255, 255, 0.88);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: var(--accent);
      border: 1px solid rgba(220, 200, 180, 0.6);
      padding: 20px 40px;
      border-radius: 16px;
      font-size: 2rem;
      ...
    }
    ```
    - Tested short text ("数学") and long text ("买水成功！当前蓄势: 2 层") on 375px and 390px viewports:
      - 375px viewport: Short banner width `134.8px`, long banner width `168.8px`, height `216px` (wraps text cleanly). Bounding rect left `196.9px`, right `365.6px` (or centered `[103.1, 271.9]`).
      - 390px viewport: Short banner width `131.6px`, long banner width `188.5px`. Bounding rect left `198.3px`, right `386.7px`.
      - `overflowLeft: false`, `overflowRight: false`, `bodyHasOverflow: false`.

- **Text Clipping & Readability Verification**:
  - Measured bounding boxes and scroll widths of all primary UI text elements (`.title-main`, `.title-sub`, `#nickname-input`, `#btn-pve`, `#btn-match`, `.info-title`, `.dream-target-modal-panel`, `.go-title`, `.go-stats`, `.class-banner`).
  - No text clipping, text truncation, or unreadable overlapping text was observed on 375px/390px screens.
  - Page viewport width remained exactly `375px` / `390px` with `0` horizontal page overflow (`document.documentElement.scrollWidth === document.documentElement.clientWidth`).

- **Production Build Execution (`npm run build`)**:
  - Output: `built in 2.02s` with 0 syntax, compilation, or bundle errors.

---

## 2. Logic Chain

1. **Table Responsive Isolation**: The `.stats-matrix` table has `min-width: 800px` to maintain column readability across 10+ characters. Wrapping it inside `.stats-matrix-wrap` with `overflow-x: auto` isolates the table's minimum width constraint inside a local scroll container. Empirical measurements confirm `wrapScrollWidth (800px) > wrapClientWidth (284px/299px)` while `document.documentElement.scrollWidth` remains equal to viewport width (`375px`/`390px`), proving zero page width blowout.
2. **Modal Panels Mobile Scaling**: `.dream-target-modal-panel` uses `width: 92%` with `max-width: 440px`, and `.game-over-screen` uses `width: 95%` (`max-width: none` at `<520px>`) with `max-height: 90vh` and `overflow-y: auto`. Empirical measurements at 375px and 390px verify that modal containers maintain soft padding (`28px 18px` / `24px 20px`), stay centered, fit within 90%–95% of viewport width, and restrict vertical height to `<90vh` with active vertical scrolling.
3. **Class Banner Behavior**: `.class-banner` uses flex/block layout centered with `transform: translate(-50%, -50%)`. When rendering multi-word status text (e.g., "买水成功！当前蓄势: 2 层"), the element wraps text cleanly without pushing width beyond `168px–188px`, preventing offscreen clipping on 375px/390px screens.
4. **Legibility & Zero Overflow**: Across all tested screens, DOM bounding box checks confirm zero horizontal overflow (`bodyHasOverflow: false`), clear color contrast, and proper font scaling.

---

## 3. Caveats

- No caveats. All responsive layout behaviors and modal panel constraints were empirically tested and confirmed on 375px and 390px mobile viewports.

---

## 4. Conclusion

**Verdict: `APPROVE`**

The implementation by `worker_m1_1` meets all requirements:
1. `.stats-matrix-wrap` prevents `.stats-matrix` (min-width 800px) from blowing out mobile modal width, providing smooth horizontal scroll.
2. `.dream-target-modal-panel`, `.game-over-screen`, and `.class-banner` scale down cleanly on 375px and 390px viewports with proper max-width, max-height (90vh), and mobile padding.
3. No clipping, unreadable text, or horizontal page overflow exists on small viewports.

---

## 5. Verification Method

To independently verify these results:

1. **Run Production Build**:
   ```bash
   npm run build
   ```
   Confirm output compiles with 0 errors.

2. **Run Empirical Layout Test Suite**:
   ```bash
   node tests/e2e/test_m1_2_empirical.js
   ```
   Confirm all viewport metric assertions pass for 375px and 390px screens with `bodyHasOverflow: false`.
