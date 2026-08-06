# Test Plan — challenger_m1_1

## Objective
Empirically test and challenge mobile responsiveness and layout rules implemented in Milestone 1.

## Test Areas & Verification Methodology

### 1. Mobile FAB vs. Chat Header Positioning (<680px, 375px, 390px)
- **Target**: `.hand-fab-container` (`bottom: 58px; right: 16px; z-index: 9000`) vs `.chat-widget.collapsed` (`bottom: 0; right: 0; left: 0; width: 100%; z-index: 8500; height: 400px; transform: translateY(calc(100% - 48px))`).
- **Empirical Check**:
  - Spawn headless browser via Playwright (or node DOM layout harness / Vite server).
  - Measure `getBoundingClientRect()` of `.hand-fab-container` / `.hand-fab` and `.chat-header` when collapsed on 375px, 390px, 480px, 679px viewports.
  - Calculate exact vertical distance between bottom of FAB (`fab.bottom`) and top of chat header (`header.top`). Target: Exactly 10px gap (`header.top - fab.bottom === 10`).
  - Verify horizontal alignment (`fab.right` vs `viewport.right`), z-index ordering, and click target isolation (clicking FAB triggers hand fan, clicking chat header toggles chat).

### 2. Desktop Layout Positioning (>680px, e.g., 1024px, 1280px)
- **Target**: `.chat-widget` (`bottom: 20px; right: 90px; width: 300px`) vs `.hand-fab-container` (`bottom: 20px; right: 20px; width: 60px`).
- **Empirical Check**:
  - Measure `getBoundingClientRect()` of `.chat-widget` and `.hand-fab-container` on desktop viewports.
  - Verify `.chat-widget` right edge is at `viewport.width - 90px`, left edge is at `viewport.width - 390px`.
  - Verify `.hand-fab-container` right edge is at `viewport.width - 20px`, left edge is at `viewport.width - 80px`.
  - Verify no overlap between `.chat-widget` (390px to 90px from right edge) and `.hand-fab-container` (80px to 20px from right edge). Gap = 10px (`90px - 80px = 10px`).

### 3. Zero Horizontal Overflow on Mobile (375px, 390px)
- **Target**: Entire DOM layout across all pages (Lobby, Preparation, Battle Arena, Stats Matrix, Modals).
- **Empirical Check**:
  - Set viewport dimensions to 375x812 (iPhone SE/12 mini) and 390x844 (iPhone 12/13/14).
  - Check `document.documentElement.scrollWidth <= document.documentElement.clientWidth` and `document.body.scrollWidth <= document.body.clientWidth`.
  - Inspect individual wide elements (`#app`, `.arena`, `.lobby`, `.stats-matrix-wrap`, `.hand-fan-container`, `.game-over-screen`, `.modal-content`) to ensure no element exceeds screen width or forces horizontal scroll on `window`.

## Execution Steps
1. Create a Playwright / Node layout testing script `test_mobile_layout.js` in a temporary test directory or run via `npx playwright test`.
2. Start local Vite server or serve static HTML / DOM render.
3. Run automated tests for all three criteria under multiple viewports (375px, 390px, 480px, 679px, 1024px, 1280px).
4. Analyze bounding box rects, hit test points (`document.elementFromPoint`), scroll widths, and computed CSS values.
5. Document all results with exact numbers, pass/fail status, and edge-case challenge analysis in `handoff.md`.
