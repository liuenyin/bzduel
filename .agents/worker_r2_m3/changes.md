# Milestone R2-M3 (True VFX Restoration) — Summary of Changes

## 1. `src/utils/vfx.js`
- **Detached DOM Safety**: Added `document.body.contains(targetCardElement)` checks in `playHitImpact`, `spawnFloatingDamage`, `triggerCameraImpulse`, `playTacticalCardVFX`, `triggerUltimateVFX`, and `triggerRevivalHalo`.
- **Parameter Hardening**: Sanitized `intensity` (`Number.isFinite(intensity) ? intensity : 1.0`) and `damageAmount` (`Number.isFinite(damageAmount) ? damageAmount : 0`). If damage is <= 0 or non-finite, displays `'MISS'` text and skips screen shake / heavy impact animations.
- **Roll Dice Element Guard**: Hardened `rollDice` filter to verify elements are non-null objects with `.style`.
- **Global Window Binding**: Exposed `window.vfxManager` when running in browser environment.

## 2. `server/game/engine.js`
- **Zhou Xuansheng Ultimate Payload**: Captured `const chargeConsumed = state.turnData?.chargeConsumed || 0;` prior to `resolvePhaseEnd(state)` in `confirmDefense` and included `chargeConsumed` in the return payload.

## 3. `src/pages/battle.js`
- **Detached DOM Nodes in `setTimeout`**: Rewrote delayed callbacks (300ms, 400ms, 1500ms) in `onTurnResolved` to re-query live DOM nodes (`getLiveAtkCard()`, `getLiveDCard()`, `getLiveDefCard()`) and check `document.body.contains(el)` before applying CSS classes or invoking GSAP timelines.
- **FFA Tactical Card Target Resolution**: Updated `window._playTacticalCard` to prioritize `.ffa-micro-card.active-target` then non-dead `.ffa-micro-card` opponent elements in FFA mode before falling back to `#card-me`.
- **Memory Leak Removal**: Removed recursive re-wrapping of `window._buyDraftCard` in `checkDraftShopModal` / `renderBattle()`.
- **State Update Retention (`animLock`)**: Updated `gameSocket.on('state_update')` to save incoming state in `pendingState` when `animLock` is active. Upon unlock at the end of `onTurnResolved`, `S` is updated to `pendingState` prior to `refreshAll()`.

## 4. `tests/r2_m3_vfx_verification.js`
- Created comprehensive verification test script covering:
  - Test 1: Detached DOM node safety and NaN damage/intensity sanitization.
  - Test 2: Zhou Xuansheng ultimate charge payload propagation and client VFX trigger evaluation.
  - Test 3: FFA tactical card target lookup priority resolution (`.active-target` > `:not(.dead)`).
  - Test 4: Floating damage number rendering and live DOM re-query resilience.
  - Test 5: `_buyDraftCard` call stack safety across multiple renders.
  - Test 6: `animLock` state retention during battle turn resolution animations.
