# Scope: Milestone 2 — Physics Dice Roll & Hit Impact VFX Engine

## Objective
Build `src/utils/vfx.js` animation engine using GSAP, and integrate smooth physics-based 3D dice rolling animations and hit impact VFX into `src/pages/battle.js`.

## Features
- **GSAP Animation Manager (`src/utils/vfx.js`)**: Create modular VFX manager exposing `rollDice`, `playHitImpact`, `triggerAuraEffect`.
- **Physics 3D Dice Roll**: Replace instant/static dice rendering in `renderDice()` with GSAP spring/bounce easing, rotation, tumble, and dynamic settle animations.
- **Hit Impact & Damage Flash**: Replace rigid screen shake (`.shake-screen`) with fluid GSAP camera impulses, directional red/crit damage flashes, particle impact ripples, and animated floating damage text.

## Interface Contracts
- `vfxManager.rollDice(diceContainer, finalValues, callback)`
- `vfxManager.playHitImpact(targetCardElement, damageAmount, isCrit)`
- `vfxManager.triggerAuraEffect(cardElement, auraType)`

## Verification Criteria
- `npm run build` passes with zero errors.
- `src/utils/vfx.js` imports `gsap` correctly and exports `vfxManager` singleton.
- Dice roll triggers visible tumble/rotation animation before revealing final numbers.
- Hit impacts trigger camera impulse, damage flash, and floating damage numbers without throwing JS exceptions.
- Playwright E2E tests pass cleanly.
