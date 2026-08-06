# Handoff Report — M2 GSAP VFX System & Visual Enhancements Design

## 1. Observation
Direct findings from inspect tools and project inspection:
1. **Dependencies**: `package.json` line 14 includes `"gsap": "^3.12.5"`.
2. **Current VFX File**: `src/utils/vfx.js` does not exist yet in `src/utils/` (only `src/utils/audio.js` exists).
3. **Battle Page Implementation (`src/pages/battle.js`)**:
   - `renderDice()` at lines 488–567 renders `.die` elements using static CSS class `.die.rolling`.
   - `onTurnResolved(data)` at lines 715–840 handles damage events.
   - Lines 811–818: Hardcoded screen shake using `document.body.classList.add('shake-screen')` and `defCard.classList.add('damage-flash')`.
   - Lines 801–809: Manual `document.createElement('div')` for `.floating-damage` with basic CSS `@keyframes floatUp`.
   - Lines 1022–1027: `updateAura(el, p)` swaps aura CSS classes directly on elements without transition easing.
4. **CSS Styles (`src/style/index.css`)**:
   - `@keyframes diceRoll` (lines 335–339), `@keyframes screenImpulse` (lines 341–346), `@keyframes cardHit` (lines 383–391), and `@keyframes floatUp` (lines 396–397).
   - Light glassmorphic theme uses `--bg: #faf8f5`, `--accent: #c06040`, `--gold: #c09a50`, `--red: #c45c5c`.

## 2. Logic Chain
1. **Observation 1 & 2** show that GSAP is already an installed dependency and `src/utils/vfx.js` is the designated module location for animation management as specified in `PROJECT.md` and `SCOPE.md`.
2. **Observation 3** shows that `src/pages/battle.js` currently relies on inline DOM class manipulation (`.shake-screen`, `.damage-flash`, `.die.rolling`) and fixed `setTimeout` calls, causing rigid animations and position displacement.
3. Therefore, introducing `src/utils/vfx.js` as an ES module exposing `vfxManager` (`rollDice`, `playHitImpact`, `triggerCameraImpulse`, `spawnFloatingDamage`, `triggerAuraEffect`) provides a unified, physics-driven GSAP animation pipeline.
4. Replacing lines 801–818 and lines 745–758 in `src/pages/battle.js` with `vfxManager.playHitImpact()` replaces rigid screen shake with fluid GSAP camera impulse and light glassmorphic hit flashes.
5. Hooking `vfxManager.rollDice()` inside `renderDice()` (lines 488–567) applies 3D tumbling rotation with spring easing (`back.out(1.8)`) when dice elements render.

## 3. Caveats
- **Scope Boundary**: As `explorer_m2_1`, this investigation is read-only. Code implementation of `src/utils/vfx.js` and modifications to `src/pages/battle.js` will be executed by the implementer agent (`implementer_m2_1`).
- **M3 Ultimates Foundation**: `vfxManager` includes stub functions for high-impact character ultimate VFX to ensure contract compatibility, but complex domain expansion overlays (e.g., Fu Xiuran's full domain) will be expanded in Milestone 3.

## 4. Conclusion
The GSAP VFX architecture plan and exact function hook integration points for `src/pages/battle.js` have been fully formulated and documented in `E:/School+AI/school-dice-duel/.agents/explorer_m2_1/analysis.md`. The design fulfills all Milestone 2 requirements (3D physics dice roll easing, fluid GSAP camera impulses, light glassmorphic damage flashes, floating damage numbers, and aura glow effects) while preserving light theme aesthetics and mobile responsiveness.

## 5. Verification Method
1. **Build Verification**:
   Execute `npm run build` from the project root (`E:/School+AI/school-dice-duel`). Verify 0 compilation or bundling errors.
2. **Module Export Inspection**:
   Inspect `src/utils/vfx.js` to ensure it exports `vfxManager` singleton with methods `rollDice`, `playHitImpact`, `triggerAuraEffect`, `triggerCameraImpulse`, `spawnFloatingDamage`.
3. **Integration Code Inspection**:
   Inspect `src/pages/battle.js` to verify:
   - `import { vfxManager } from '../utils/vfx.js';` is present.
   - `renderDice()` calls `vfxManager.rollDice()`.
   - `onTurnResolved()` calls `vfxManager.playHitImpact()`.
   - `updateAura()` calls `vfxManager.triggerAuraEffect()`.
4. **E2E / Browser Verification**:
   Execute Playwright test suite `npx playwright test` to verify battle interactions and check console logs for 0 JS exceptions during dice roll and hit impact animations.
