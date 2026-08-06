# E2E Test Infra: School Dice Duel UI/UX & VFX Verification

## Test Philosophy
- Opaque-box, requirement-driven programmatic verification using Playwright.
- Headless Chromium browser execution against local Express + Socket.IO server (`http://localhost:3000`).
- Strict assertion: Zero uncaught JavaScript errors or exceptions (`page.on('pageerror')`, `page.on('console')`) during UI interactions and VFX triggers.

## Feature Inventory & Test Mapping
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|--------|:------:|:------:|:------:|:------:|
| 1 | Light/Fresh UI Aesthetics | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ | ✓ |
| 2 | Mobile Responsiveness | ORIGINAL_REQUEST R3 | 5 | 5 | ✓ | ✓ |
| 3 | Smooth Physics Dice Rolling | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ | ✓ |
| 4 | Hit Impact & Damage Flash VFX | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ | ✓ |
| 5 | Character Ultimates VFX | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Test Runner**: `npx playwright test tests/e2e/ui_vfx_verification.spec.js` or `node tests/e2e/run_headless_verification.js`
- **Server Startup**: `node server/index.js`
- **Console Listener Setup**:
  ```js
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  ```
- **Target Viewports**:
  - Desktop: 1280 x 800
  - Mobile: 375 x 667 (iPhone SE), 390 x 844 (iPhone 12/13/14)

## Coverage Thresholds
- Tier 1 (Feature Coverage): Lobby load, preparation navigation, 1v1 battle start, dice roll trigger, ultimate trigger.
- Tier 2 (Boundary & Corner Cases): Rapid dice rerolls, multi-damage triggers, mobile viewport layout checks, Fu Xiuran target modal toggle.
- Tier 3 (Cross-Feature Combinations): Full turn cycle (Roll -> Attack -> Defend -> Damage VFX -> Ultimate activation -> Victory/Defeat overlay).
- Tier 4 (Real-World Application): Mobile 375px complete battle session without horizontal scroll or JS exceptions.
