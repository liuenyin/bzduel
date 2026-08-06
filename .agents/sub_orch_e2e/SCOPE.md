# Scope: E2E Testing Track

## Architecture
- **Test Suite**: Playwright Chromium test suite in `tests/e2e/ui_vfx_verification.spec.js`.
- **Standalone Runner**: Node script `tests/e2e/run_headless_verification.js` that programmatically spawns server `node server/index.js` (or verifies port 3000), runs Playwright browser, captures console/page error logs, and exits 0 on success.
- **Server**: Express + Socket.IO server at `http://localhost:3000`.

## Feature Inventory
| # | Feature | Description | Tier | Status |
|---|---------|-------------|------|--------|
| 1 | Page Load & Navigation | Lobby load (`#nickname-input`, `#btn-pve`), navigate to Preparation (`.avatar-grid`, `.avatar-cell`). | Tier 1 | PLANNED |
| 2 | Battle Init & Roll / Ultimate Triggers | 1v1 battle start (`#btn-ready`), trigger dice roll (`#btn-roll`), trigger ultimate. | Tier 1 | PLANNED |
| 3 | Rapid Reroll & Multi-hit Damage | Rapid dice reroll clicks (`#btn-reroll`), multi-hit damage triggers, mobile viewport 375x667 check. | Tier 2 | PLANNED |
| 4 | Full Battle Turn Cycle | Roll -> Attack -> Defend -> Damage flash -> Ultimate overlay -> Game Over screen. | Tier 3 | PLANNED |
| 5 | Mobile Application Scenario | Complete battle sequence at 375px without horizontal scroll or JS exceptions. | Tier 4 | PLANNED |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---------|-------|--------------|--------|
| 1 | Test Suite & Runner Implementation | Write `tests/e2e/ui_vfx_verification.spec.js` & `tests/e2e/run_headless_verification.js` | none | IN_PROGRESS |
| 2 | Execution Verification & Gate Check | Run standalone runner against server, verify zero JS exceptions | M1 | PLANNED |
| 3 | TEST_READY.md Publication | Publish `TEST_READY.md` summarizing test counts and checklist | M2 | PLANNED |
