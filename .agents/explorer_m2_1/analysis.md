# M2 GSAP VFX System & Visual Enhancements Design Analysis

## 1. Executive Summary
This document defines the architectural design, API contract, and integration specification for `src/utils/vfx.js` and its integration into `src/pages/battle.js`. The objective of Milestone 2 (M2) is to replace rigid CSS animations and screen shakes with a GSAP-powered physics animation engine that provides smooth 3D dice rolling, fluid camera impulses, light glassmorphic damage flashes, floating damage numbers, and dynamic character card aura effects.

---

## 2. Codebase Baseline & Findings

### 2.1 Dependencies
- **GSAP**: `gsap` version `^3.12.5` is installed in `package.json` under `dependencies`.
- **Module System**: ES Modules (`"type": "module"` in `package.json`).

### 2.2 Existing Battle Page Animation Code (`src/pages/battle.js`)
1. **Dice Roll (Lines 512–567)**:
   - `renderDice()` injects `.die` elements into `#dice-area`.
   - Roll animation relies on CSS class `.die.rolling` with `@keyframes diceRoll` (CSS keyframe in `src/style/index.css` lines 334–339).
   - Limitation: Rigid duration (0.45s), static 2D-to-3D CSS keyframe, no staggered tumbling, no spring physics easing.

2. **Hit Impact & Damage (Lines 715–840)**:
   - `onTurnResolved(data)` handles 1v1 and AoE combat damage resolution.
   - Lines 801–824 (1v1 damage):
     ```javascript
     dmgEl.className = `floating-damage ${damage === 0 ? 'miss' : ''}`;
     dmgEl.textContent = damage > 0 ? `−${damage}` : 'MISS';
     if (defCard) defCard.appendChild(dmgEl);
     playHit(damage >= 8);
     if (damage >= 8) {
       document.body.classList.add('shake-screen');
       setTimeout(() => document.body.classList.remove('shake-screen'), 300);
       if (damage > 15 && defCard) {
         defCard.classList.add('damage-flash');
         setTimeout(() => defCard.classList.remove('damage-flash'), 500);
       }
     }
     ```
   - Limitation: Hardcoded `.shake-screen` (translates `document.body` by -3px to +3px rigidly), fixed setTimeout DOM removals, plain `@keyframes floatUp` for text.

3. **Aura Class Handling (Lines 1009–1027)**:
   - `getAuraClass(p)` returns CSS class names (`aura-gpy-rage`, `aura-dream-domain`, `aura-zxs-water`, `aura-yzm-gold`, `aura-wyc-redheat`, `aura-whd-sugar`).
   - `updateAura(el, p)` swaps classes instantly without transition or particle glow.

---

## 3. Architecture & API Design for `src/utils/vfx.js`

`src/utils/vfx.js` will export a singleton object `vfxManager` (and named functions) powered by GSAP.

### 3.1 Interface Contract

```javascript
import gsap from 'gsap';

export const vfxManager = {
  /**
   * Physics 3D Dice Roll Animation with GSAP spring/bounce easing
   * @param {NodeList|Array<HTMLElement>} diceElements - Array of .die DOM elements
   * @param {Array<number>} finalValues - Array of target dice numbers
   * @param {Function} [onComplete] - Optional callback upon completion
   */
  rollDice(diceElements, finalValues, onComplete),

  /**
   * Fluid Hit Impact: Camera Impulse + Damage Flash + Floating Text + Ripple
   * @param {HTMLElement} targetCardElement - Target card container (.battle-card-wrap or .ffa-micro-card)
   * @param {number} damageAmount - Damage value (0 for MISS)
   * @param {Object} [options] - Additional hit parameters
   * @param {boolean} [options.isCrit=false] - Whether damage is critical (damage >= 8)
   * @param {boolean} [options.isHeavy=false] - Whether damage is heavy (damage >= 15)
   * @param {boolean} [options.nineLivesTriggered=false] - Revival halo effect
   * @param {boolean} [options.pierce=false] - Pierce visual line effect
   * @param {Function} [onComplete] - Callback when hit animation finishes
   */
  playHitImpact(targetCardElement, damageAmount, options, onComplete),

  /**
   * Camera Impulse (Fluid GSAP Screen Shake)
   * @param {number} intensity - Impulse scale (1.0 for normal hit, 2.0 for crit, 3.0 for ultimate)
   */
  triggerCameraImpulse(intensity),

  /**
   * Floating Damage Text Animation
   * @param {HTMLElement} targetElement - Container element to anchor damage text
   * @param {number} damageAmount - Value to display (or 0 for MISS)
   * @param {boolean} isCrit - Critical hit flag
   */
  spawnFloatingDamage(targetElement, damageAmount, isCrit),

  /**
   * Dynamic Aura & Glow Transition for Character Cards
   * @param {HTMLElement} cardElement - .battle-card DOM element
   * @param {string} auraClass - Active aura CSS class name
   */
  triggerAuraEffect(cardElement, auraClass),

  /**
   * Particle Burst Helper (for hits, crits, and rolls)
   * @param {number} x - Screen X coordinate
   * @param {number} y - Screen Y coordinate
   * @param {number} count - Number of particles
   * @param {string} color - Particle color hex/var
   */
  spawnParticles(x, y, count, color)
};
```

---

## 4. Feature Specifications & Implementation Details

### 4.1 Physics 3D Dice Rolling (`rollDice`)
- **Animation Sequence**:
  1. Initial state: `scale: 0.4`, `opacity: 0`, `rotateX: -180deg`, `rotateY: -180deg`.
  2. Spring tumble: GSAP timeline with `stagger: 0.08` across dice.
  3. Easing: `back.out(1.8)` for bounce overshoot, `transformPerspective: 600`.
  4. 3D Rotation: Tumbles 720deg on X axis, 360deg on Y axis, with dynamic height arc (`y: -25px -> 0px`).
  5. Settle pop: Final scale bounce (`scale: 1.15 -> 1.0` with `power2.out`).
  6. Call `onComplete` callback after timeline finishes.

### 4.2 Hit Impact & Fluid Camera Impulse (`playHitImpact` & `triggerCameraImpulse`)
- **Camera Impulse**:
  - Replaces `.shake-screen` by animating `#app` or `document.body` transform offset via GSAP.
  - Multi-step decay timeline:
    ```javascript
    const shakeTl = gsap.timeline();
    const range = 6 * intensity;
    shakeTl.to(target, { x: `-=${range}`, y: `+=${range/2}`, duration: 0.04, ease: 'power1.inOut' })
           .to(target, { x: `+=${range*1.2}`, y: `-=${range}`, duration: 0.04, ease: 'power1.inOut' })
           .to(target, { x: `-=${range*0.8}`, y: `+=${range/2}`, duration: 0.05, ease: 'power1.inOut' })
           .to(target, { x: 0, y: 0, duration: 0.06, ease: 'power2.out' });
    ```
- **Hit Flash**:
  - For normal hit (`damage > 0`): `gsap.fromTo(cardElement, { filter: 'brightness(1.4) saturate(1.5)', x: -4 }, { filter: 'none', x: 0, duration: 0.35, ease: 'elastic.out(1, 0.4)' })`.
  - For heavy hit (`damage >= 15`): `gsap.fromTo(cardElement, { filter: 'brightness(2) sepia(1) hue-rotate(-50deg) saturate(4)', scale: 0.95 }, { filter: 'none', scale: 1, duration: 0.5, ease: 'power2.out' })`.
- **Floating Damage Text**:
  - Spawns `.floating-damage` overlay element.
  - GSAP timeline: `gsap.fromTo(el, { y: 0, scale: 0.3, opacity: 0 }, { y: -45, scale: isCrit ? 1.35 : 1.0, opacity: 1, duration: 0.3, ease: 'back.out(2)' })` followed by `gsap.to(el, { y: -70, opacity: 0, duration: 0.5, ease: 'power2.in', delay: 0.4, onComplete: () => el.remove() })`.

### 4.3 Character Card Aura Transition (`triggerAuraEffect`)
- Smoothly animates box-shadow pulse and glow scale when a player triggers or loses an aura state (e.g. FXR Dream state, GPY Rage, ZXS Water, WYC Redheat).

---

## 5. Exact Function Hooks & Code Modifications in `src/pages/battle.js`

### 5.1 Import Statement
- **Location**: Line 7 in `src/pages/battle.js`.
- **Change**:
  ```javascript
  import { playDiceRoll, playHit } from '../utils/audio.js';
  import { vfxManager } from '../utils/vfx.js';
  ```

### 5.2 Dice Roll Hook in `renderDice()`
- **Location**: Lines 488–567 in `src/pages/battle.js`.
- **Change**:
  - In `renderDice()`, after setting `area.innerHTML = html;` (Line 562), collect newly rendered dice elements:
  ```javascript
  const diceEls = area.querySelectorAll('.die.rolling');
  if (diceEls.length > 0) {
    const vals = Array.from(diceEls).map(d => parseInt(d.dataset.val || '0'));
    vfxManager.rollDice(diceEls, vals);
  }
  ```

### 5.3 Combat HP Damage & Hit Hook in `onTurnResolved(data)`
- **Location**: Lines 730–840 in `src/pages/battle.js`.
- **Change in 1v1 Branch (Lines 796–825)**:
  - Replace rigid CSS shake (`document.body.classList.add('shake-screen')`) and raw class additions with `vfxManager`:
  ```javascript
  // Replace lines 801-818 with GSAP VFX Manager integration:
  vfxManager.playHitImpact(defCard, damage, {
    isCrit: damage >= 8,
    isHeavy: damage >= 15,
    nineLivesTriggered: data.nineLivesTriggered,
    pierce: data.pierce
  });
  playHit(damage >= 8);
  ```
- **Change in AoE / FFA Branch (Lines 740–765)**:
  - Replace hardcoded element creation and CSS class additions in `data.aoeResults.forEach`:
  ```javascript
  data.aoeResults.forEach(res => {
    const dId = res.playerId;
    const dCard = dId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${dId}"]`);
    if (dCard) {
      vfxManager.playHitImpact(dCard, res.damage, {
        isCrit: res.damage >= 8,
        isHeavy: res.damage >= 15,
        nineLivesTriggered: res.nineLivesTriggered,
        isAoE: true
      });
    }
  });
  ```

### 5.4 Aura Update Hook in `updateAura(el, p)`
- **Location**: Lines 1022–1027 in `src/pages/battle.js`.
- **Change**:
  ```javascript
  function updateAura(el, p) {
    if (!el) return;
    const newAura = getAuraClass(p);
    vfxManager.triggerAuraEffect(el, newAura);
  }
  ```

---

## 6. Layout & Mobile Responsiveness Compliance
- All GSAP animations use relative positioning (`transform`, `opacity`, `filter`, `box-shadow`) to avoid altering layout flow or triggering reflow overflow on mobile screens (<680px).
- Floating damage numbers are constrained to `position: absolute` within `.battle-card-wrap` or `.ffa-micro-card`, preventing horizontal scrollbar emergence.
- Light/fresh color palette (`#faf8f5` background, `#c06040` accent, `#c09a50` gold, `#c45c5c` red) is strictly preserved without introducing dark overlays.
