# Original User Request

## 2026-08-06T12:00:33Z

Fix the Tactical Card mechanism (double-charging, shop randomization, incorrect 2TP cost for 1-star cards), restore broken VFX triggers, and overhaul the tactical hand UI for premium aesthetics.

Working directory: E:/School+AI/school-dice-duel
Integrity mode: benchmark

## Requirements

### R1. Tactical Card Logic Fix
- Remove the TP cost check when *playing* a tactical card from the hand in `src/pages/battle.js`. TP should only be deducted when *buying* from the draft shop.
- Fix the `getRandomCard` logic (likely in `shared/cards.js`) to ensure the draft shop provides a balanced mix of universal and subject-specific cards.
- Fix the pricing mismatch: Buying a 1-star card currently costs 2 TP. Ensure the actual `tpCost` precisely matches the UI rendered stars and the deduction logic.

### R2. Tactical Card UI/UX Overhaul
- Redesign the `.hand-card-kards` UI in `src/pages/battle.js` and `src/styles/battle.css` to prevent text overlapping and misaligned elements.
- Ensure the `TP不足` overlay and card tags render cleanly within the card boundaries, using premium game UI principles (e.g., proper padding, clear hierarchy, textured backgrounds).

### R3. VFX Restoration
- Debug and restore any visual effects (VFX) that are currently failing to display during battle. Ensure character ultimates and hit impacts trigger reliably without JavaScript exceptions.

## Acceptance Criteria

### Tactical Card Logic
- [ ] Buying a card correctly deducts the exact TP amount matching its star rating (e.g., 1 star = 1 TP).
- [ ] Playing a card from hand requires 0 TP and triggers the correct game state changes without errors.
- [ ] Refreshing the shop provides a diverse pool of cards, not just 'universal'.

### UI & VFX
- [ ] Tactical cards in the hand and shop render with no text overlapping.
- [ ] Disabled overlays (like `TP不足`) fit perfectly over the card without breaking layout.
- [ ] All intended visual effects (dice rolling, hit impacts, ultimates) display correctly during a full battle loop.
- [ ] A headless Playwright test agent verifies that cards can be played sequentially without triggering "TP不足" after successful purchase, and no JS errors are thrown during VFX execution.

## 2026-08-07T14:28:31Z

# Teamwork Project Prompt — Draft (Round 2)

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

The previous teamwork execution failed to completely resolve the issues. This Round 2 mission will enforce a deeper, more rigorous fix for the persistent UI, VFX, and game logic bugs in the School Dice Duel project.

Working directory: E:/School+AI/school-dice-duel
Integrity mode: benchmark

## Requirements

### R1. Persistent Logic Bug Extermination
- **Pricing Logic Verification**: Ensure there is absolute parity between a card's visual star rating and its actual `tpCost` deduction. A 1-star card MUST cost exactly 1 TP. Audit `shared/cards.js` and `server/game/engine.js`.
- **Card Play Validation**: Ensure cards are resolved correctly upon being played from the hand, applying their intended effects to the game state without silently failing or throwing backend errors.

### R2. Hardened UI/UX Layout
- **Absolute Anti-Overlap**: The `.hand-card-kards` layout in `src/pages/battle.js` must be rewritten to strictly prevent ANY text overlapping, regardless of card name length or description length. 
- Use flexbox/grid or strict max-heights/overflow-hidden within the absolute positioned cards to ensure tags, costs, titles, and descriptions NEVER collide.
- The `TP不足` (or other disable reasons) overlay must perfectly align and cover the card body without overflowing or shifting out of bounds.

### R3. True VFX Restoration
- **Ultimate & Hit Effects**: The VFX engine (`src/utils/vfx.js`) must be thoroughly debugged. Damage numbers, character ultimates (e.g., Domain Expansions, special lighting), and hit impact animations must successfully trigger and render visually in the DOM.
- Catch and handle any `TypeError` (e.g., trying to read properties of undefined DOM elements) that is currently silently aborting the VFX chain.

## Acceptance Criteria

### Verification
- [ ] **Logic**: Buying a 1-star card strictly deducts 1 TP. Playing it correctly alters the game state.
- [ ] **UI**: Visual inspection (via headless screenshot or agent-as-judge) confirms zero text overlap in the card UI, even with exceptionally long descriptions.
- [ ] **VFX**: Triggering an ultimate skill or taking damage produces the correct on-screen animations without a single `console.error` in the browser.
- [ ] **Testing**: A dedicated script (`tests/e2e/round2_verification.js`) must be executed to programmatically verify these criteria before the Orchestrator claims Victory.

