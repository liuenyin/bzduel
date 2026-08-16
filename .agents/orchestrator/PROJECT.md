# Project: School Dice Duel (Round 2)

## Architecture & System Overview
- **Game Engine & Server**: `server/game/engine.js`, `server/index.js` (handles game state, draft shop purchases `buyDraftCard`, card play verification, turn execution).
- **Shared Card Definitions**: `shared/cards.js` (contains card pool definitions, `getRandomCard` distribution logic, star ratings, `tpCost`).
- **Frontend Battle UI**: `src/pages/battle.js` (renders battle grid, `.hand-card-kards`, shop slots, tactical card playing handlers, VFX trigger calls).
- **UI Styling**: `src/style/index.css` (CSS rules for cards, overlays, tags, flexbox/grid layout, glassmorphism).
- **VFX Engine**: `src/utils/vfx.js` (GSAP v3.12.5 `vfxManager` singleton handling dice rolls, hit impulses, floating damage numbers, ultimate animations).
- **E2E Test Suite**: `playwright.config.js`, `tests/e2e/round2_verification.js` (Playwright E2E verification script).

## Code Layout
- `shared/cards.js`: Card definitions (60 cards)
- `server/game/engine.js`: Server-side game loop, `buyDraftCard`, `playTacticalCard`, card effect handlers (all 60 cards)
- `server/index.js`: Server entry, AI turn logic, socket events (`confirmDefense`)
- `src/pages/battle.js`: Battle page UI, hand card rendering (`tacticalBarHTML`), click handlers, `onTurnResolved`, FFA target lookup
- `src/style/index.css`: Styling for `.hand-card-kards`, `.draft-slot-card`, `.card-disable-overlay`, flexbox/grid rules
- `src/utils/vfx.js`: GSAP VFX animation triggers and manager, TypeError defensive checks
- `tests/e2e/round2_verification.js`: End-to-end verification script for Round 2

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 26 Unhandled Cards Engine Implementation | Implement missing 26 card handlers in engine.js + fix card_gen_14 + multi-card play array | R2-M1 | ORIGINAL_REQUEST R1 |
| 2 | Client Card Playability & Pricing Verification | Remove canUseClass block in battle.js + verify 1-star = 1 TP parity | R2-M1 | ORIGINAL_REQUEST R1 |
| 3 | Hardened Card Layout (Anti-Overlap) | CSS flexbox min-height: 0, 1-line title, 3-line desc clamp, flex-start layout | R2-M2 | ORIGINAL_REQUEST R2 |
| 4 | Overlay & Tag Boundary Constraint | max-width: 90% on disable badge, overflow-hidden overlay matching border-radius | R2-M2 | ORIGINAL_REQUEST R2 |
| 5 | VFX Engine & DOM Detachment Defense | Re-query live DOM nodes in setTimeout, document.body.contains check in vfx.js | R2-M3 | ORIGINAL_REQUEST R3 |
| 6 | Zhou Xuansheng Ultimate & FFA Fix | Return chargeConsumed in confirmDefense payload + FFA card target lookup fix | R2-M3 | ORIGINAL_REQUEST R3 |
| 7 | State Drift & Wrapper Memory Leak Fix | Fix animLock state update retention + fix _buyDraftCard wrapper leak | R2-M3 | ORIGINAL_REQUEST R3 |
| 8 | Round 2 E2E Playwright Verification | Create & execute tests/e2e/round2_verification.js covering 4 verification tiers | R2-M4 | ORIGINAL_REQUEST Verification |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| R2-M1 | Persistent Logic Bug Extermination | 26 engine card handlers, card_gen_14 fix, multi-play array, canUseClass fix | none | DONE |
| R2-M2 | Hardened UI/UX Layout | Anti-overlap CSS overhaul for .hand-card-kards and .draft-slot-card | R2-M1 | DONE |
| R2-M3 | True VFX Restoration | Debug vfx.js, DOM re-querying, chargeConsumed payload, FFA target fix | R2-M1, R2-M2 | PLANNED |
| R2-M4 | Round 2 E2E Verification | Create & run `tests/e2e/round2_verification.js` Playwright test suite | R2-M1, R2-M2, R2-M3 | PLANNED |



## Interface Contracts
### `shared/cards.js` ↔ `server/game/engine.js` & `src/pages/battle.js`
- Card object properties: `{ id, name, star, tpCost, subject, desc, effect }` where `star === tpCost`.
- All 60 cards defined in `shared/cards.js` MUST have corresponding effect handlers in `server/game/engine.js`.

### `src/pages/battle.js` ↔ `src/style/index.css`
- `.hand-card-kards`: Outer card container with fixed height (`185px` desktop / `155px` mobile), `justify-content: flex-start; gap: 3px;`.
- `.card-title-text`: `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;`.
- `.card-desc-text`: `min-height: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;`.
- `.card-disable-overlay`: Absolutely positioned overlay (`inset: 0`, `border-radius: inherit`), `.card-disable-badge` with `max-width: 90%`.


