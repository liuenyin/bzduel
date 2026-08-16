# Round 2 Requirement R3 (True VFX Restoration) — Technical Findings & Analysis

## Executive Summary
This document details the root causes, code bugs, and proposed solutions for **Round 2 Requirement R3 (True VFX Restoration)** in the School Dice Duel game. Our investigation audited `src/utils/vfx.js`, `src/pages/battle.js`, `server/game/engine.js`, and existing Playwright E2E test suites in `tests/e2e/`.

Key discoveries:
1. **Silent Abort & Detached DOM Element Bugs**: In fast battle updates (`onTurnResolved`), DOM elements (`atkCard`, `defCard`, `dCard`) were captured into closures prior to async `setTimeout` delays. When `refreshAll()` or state updates re-rendered the UI during those delays, GSAP animations and damage text DOM insertions executed on **detached DOM nodes**, resulting in invisible damage numbers (`−X`/`MISS`) and particle bursts exploding at `(0, 0)`.
2. **Broken Ultimate Triggers (Zhou Xuansheng `char_14`)**: Zhou Xuansheng's "天子蓄势 · 极水崩山" ultimate VFX never fired because the server (`confirmDefense`) omitted `chargeConsumed` from the return object, and `atkP.chargeStacks` was reset to 0 upon attack confirmation, causing `(atkP.chargeStacks >= 2 || data.chargeConsumed >= 2)` to evaluate to `false`.
3. **Tactical Card VFX Target Misalignment in FFA**: Playing tactical cards in FFA mode attempted to locate `#card-op` (which only exists in 1v1). Failing that, it fell back to `#card-me`, animating traveling particles back to the user card instead of the target opponent.
4. **Function Wrapping Memory Leak**: `window._buyDraftCard` repeatedly re-wrapped itself inside `renderBattle()`, creating an escalating call stack on every render.
5. **State Update Drop during `animLock`**: `gameSocket.on('state_update')` ignored state updates entirely when `animLock` was active, causing state drift if intermediate socket updates arrived during the 1.5s battle animation window.

---

## 1. Detailed Technical Findings

### 1.1 VFX Engine Audit (`src/utils/vfx.js`)

| Function | Observed Issue | Root Cause & Impact | Proposed Fix |
|---|---|---|---|
| `playHitImpact` | Damage text invisible; particles spawn at top-left `(0, 0)`. | `targetCardElement` is detached when animation executes. `getBoundingClientRect()` on detached nodes returns 0 width/height. | Check `document.body.contains(targetCardElement)`. Fallback `cx`/`cy` to window center if element detached or `width === 0`. |
| `spawnFloatingDamage` | Appends `floating-damage` element to detached DOM nodes. | `targetElement.appendChild(dmgEl)` appends to an orphaned node, rendering nothing on screen. | Return null if `!document.body.contains(targetElement)`. Sanitize `damageAmount` against `NaN` / `undefined`. |
| `triggerCameraImpulse` | GSAP transform syntax error on invalid intensity. | Non-numeric or `NaN` `intensity` produces invalid timeline properties (`x: -=NaN`). | Sanitize intensity with `typeof intensity === 'number' && !isNaN(intensity) ? intensity : 1.0`. |
| `playTacticalCardVFX` | Particle origin/destination defaults to `(0, 0)`. | Missing check for detached `sourceCardEl` / `targetCardEl`. | Verify `document.body.contains()` for both elements before computing `getBoundingClientRect()`. |

### 1.2 Battle Page Audit (`src/pages/battle.js`)

#### Bug A: Detached Target Cards in `onTurnResolved`
- **Location**: `src/pages/battle.js` lines 755-875 (`onTurnResolved`).
- **Mechanism**:
  ```javascript
  const dCard = dId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${dId}"]`);
  setTimeout(() => {
    if (dCard) {
      vfxManager.playHitImpact(dCard, res.damage, ...);
    }
  }, 400);
  ```
  `dCard` and `defCard` are stored in local variables at line 777/820. After 400ms, if `refreshAll()` was called, `dCard` points to an old element removed from the document body.
- **Solution**: Inside the `setTimeout` callback, re-query live DOM nodes (`document.getElementById` or `document.querySelector`) to ensure animations target active elements.

#### Bug B: Zhou Xuansheng (`char_14`) Ultimate VFX Never Triggering
- **Location**: `src/pages/battle.js` line 770 & 843; `server/game/engine.js` line 1304.
- **Mechanism**:
  In `battle.js`:
  ```javascript
  else if (cardId === 'char_14' && (atkP.chargeStacks >= 2 || data.chargeConsumed >= 2))
  ```
  In `engine.js` `confirmAttack`, `atk.chargeStacks` is set to 0 and `state.turnData.chargeConsumed` is set to 2. But `confirmDefense` returns:
  ```javascript
  return { ok: true, baseDef, finalDef, ..., attackerIdx: prevAttackerIdx };
  ```
  `chargeConsumed` was missing from the returned payload! Thus `data.chargeConsumed` was `undefined`, and `atkP.chargeStacks` in state was 0.
- **Solution**:
  1. In `server/game/engine.js` (`confirmDefense`), include `chargeConsumed: state.turnData.chargeConsumed || 0`.
  2. In `src/pages/battle.js`, check `data.chargeConsumed >= 2 || data.atkResult?.posName === '蓄势爆发'`.

#### Bug C: Tactical Card Target Selection in FFA
- **Location**: `src/pages/battle.js` line 30.
- **Mechanism**:
  ```javascript
  window._playTacticalCard = (id, evt) => {
    const cardEl = evt?.currentTarget || document.querySelector(`.hand-card-kards[onclick*="${id}"]`);
    const targetCardEl = document.getElementById('card-op') || document.getElementById('card-me');
    vfxManager.playTacticalCardVFX(cardEl, targetCardEl, () => ...);
  };
  ```
  In FFA mode, `#card-op` does not exist in DOM. `targetCardEl` falls back to `#card-me` (self).
- **Solution**: In FFA mode, resolve target to `.ffa-micro-card.active-target` or selected target element.

#### Bug D: Recursively Wrapped `window._buyDraftCard`
- **Location**: `src/pages/battle.js` line 373.
- **Mechanism**:
  ```javascript
  const originalBuy = window._buyDraftCard;
  window._buyDraftCard = (idx) => {
    if (originalBuy) originalBuy(idx);
    window._showToast("购买成功！");
    setTimeout(refreshAll, 50);
  };
  ```
  Every execution of `renderBattle()` re-wraps `originalBuy`, creating an exponentially deep call stack.
- **Solution**: Replace with a direct assignment: `window._buyDraftCard = (idx) => { gameSocket.buyDraftCard(idx); window._showToast("购买成功！"); setTimeout(refreshAll, 50); };`.

#### Bug E: Ignored State Updates during `animLock`
- **Location**: `src/pages/battle.js` line 41.
- **Mechanism**:
  ```javascript
  gameSocket.on('state_update', (s) => { if (!animLock) { S = s; refreshAll(); } });
  ```
  When `animLock` is `true`, incoming `state_update` objects are discarded. When `animLock` becomes `false`, calling `refreshAll()` renders stale state.
- **Solution**: Always update `S = s;` even when locked: `gameSocket.on('state_update', (s) => { S = s; if (!animLock) refreshAll(); });`.

---

## 2. Code Change Proposals (Diffs)

### 2.1 `src/utils/vfx.js`
```javascript
// Fix camera impulse NaN intensity
triggerCameraImpulse(intensity = 1.0) {
  const target = document.querySelector('.arena') || document.querySelector('#app') || document.body;
  const safeIntensity = (typeof intensity === 'number' && !isNaN(intensity)) ? intensity : 1.0;
  const range = Math.min(14, 6 * safeIntensity);
  ...
}

// Fix playHitImpact detached DOM node & particle coordinate check
playHitImpact(targetCardElement, damageAmount, options = {}, onComplete = null) {
  const opts = options || {};
  const isCrit = opts.isCrit || damageAmount >= 8;
  const isHeavy = opts.isHeavy || damageAmount >= 15;

  this.triggerCameraImpulse(isHeavy ? 2.5 : (isCrit ? 1.8 : 1.0));

  if (targetCardElement && document.body.contains(targetCardElement)) {
    this.spawnFloatingDamage(targetCardElement, damageAmount, isCrit);

    if (isHeavy) {
      gsap.fromTo(targetCardElement,
        { filter: 'brightness(2) sepia(0.8) hue-rotate(-50deg) saturate(4)', scale: 0.95 },
        { filter: 'none', scale: 1.0, duration: 0.5, ease: 'power2.out' }
      );
    } else {
      gsap.fromTo(targetCardElement,
        { filter: 'brightness(1.4) saturate(1.5)', x: -4 },
        { filter: 'none', x: 0, duration: 0.35, ease: 'elastic.out(1, 0.4)' }
      );
    }

    if (opts.nineLivesTriggered) {
      this.triggerRevivalHalo(targetCardElement);
    }

    const rect = targetCardElement.getBoundingClientRect();
    const cx = rect.width > 0 ? (rect.left + rect.width / 2) : (window.innerWidth / 2);
    const cy = rect.height > 0 ? (rect.top + rect.height / 2) : (window.innerHeight / 2);
    const particleColor = damageAmount === 0 ? '#a0a0a0' : (isCrit ? '#c09a50' : '#c45c5c');
    this.spawnParticles(cx, cy, isCrit ? 20 : 10, particleColor);
  }

  if (typeof onComplete === 'function') {
    setTimeout(onComplete, 450);
  }
}

// Fix spawnFloatingDamage detached DOM node check
spawnFloatingDamage(targetElement, damageAmount, isCrit = false) {
  if (!targetElement || !document.body.contains(targetElement)) return null;

  const validDmg = (typeof damageAmount === 'number' && !isNaN(damageAmount)) ? damageAmount : 0;
  const dmgEl = document.createElement('div');
  dmgEl.className = `floating-damage ${validDmg === 0 ? 'miss' : ''} ${isCrit ? 'crit' : ''}`;
  dmgEl.textContent = validDmg > 0 ? `−${validDmg}` : 'MISS';
  dmgEl.style.animation = 'none';

  targetElement.appendChild(dmgEl);
  ...
}

// Fix playTacticalCardVFX coordinates for detached or missing elements
playTacticalCardVFX(sourceCardEl, targetCardEl, onComplete = null) {
  const isSourceValid = sourceCardEl && document.body.contains(sourceCardEl);
  const isTargetValid = targetCardEl && document.body.contains(targetCardEl);
  const sRect = isSourceValid ? sourceCardEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight - 100, width: 0, height: 0 };
  const tRect = isTargetValid ? targetCardEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
  ...
}
```

### 2.2 `src/pages/battle.js`
```javascript
// Fix state_update handler to preserve latest state during animLock
gameSocket.on('state_update', (s) => {
  S = s;
  if (!animLock) refreshAll();
});

// Fix _playTacticalCard target element resolution in FFA mode
window._playTacticalCard = (id, evt) => {
  const cardEl = evt?.currentTarget || document.querySelector(`.hand-card-kards`);
  let targetCardEl = document.getElementById('card-op');
  if (!targetCardEl) {
    targetCardEl = document.querySelector('.ffa-micro-card.active-target') || document.querySelector('.ffa-micro-card:not(.dead)') || document.getElementById('card-me');
  }
  vfxManager.playTacticalCardVFX(cardEl, targetCardEl, () => {
    gameSocket.playTacticalCard(id);
  });
};

// Fix _buyDraftCard function re-wrapping
window._buyDraftCard = (idx) => {
  gameSocket.buyDraftCard(idx);
  window._showToast("购买成功！");
  setTimeout(refreshAll, 50);
};

// Fix live DOM re-queries in onTurnResolved
// Inside 400ms setTimeout:
const liveAtkCard = (atkId && S.me && atkId === S.me.id) ? document.getElementById('card-me') : (atkId ? document.querySelector(`.ffa-micro-card[data-pid="${atkId}"]`) : document.getElementById('card-op'));
const liveDefCard = (dId === S.me.id || defId === S.me.id) ? document.getElementById('card-me') : (document.querySelector(`.ffa-micro-card[data-pid="${dId || defId}"]`) || document.getElementById('card-op'));

// Fix Zhou Xuansheng ultimate trigger condition
const isZxsCharged = cardId === 'char_14' && (
  atkP.chargeStacks >= 2 ||
  data.chargeConsumed >= 2 ||
  data.atkResult?.posName === '蓄势爆发'
);
if (isZxsCharged) {
  vfxManager.triggerUltimateVFX('char_14', 'BUY_WATER', document.body);
}
```

### 2.3 `server/game/engine.js`
```javascript
// Return chargeConsumed in confirmDefense payload
return {
  ok: true, baseDef, finalDef, penalty, keptIndices: keepIndices,
  atkResult: ar,
  ...
  chargeConsumed: state.turnData.chargeConsumed || 0,
  gameOver, winner, classChanged, nextSubject,
  attackerIdx: prevAttackerIdx,
};
```

---

## 3. Test Suite Preparation (`tests/e2e/round2_verification.js`)

To programmatically verify all criteria required for Round 2, `tests/e2e/round2_verification.js` should be created with the following architectural components:

### 3.1 Verification Suite Structure
1. **Automatic Node Server Lifecycle Management**:
   - Check if port 3005 is active (`isPortOpen(3005)`). If not, spawn `node server/index.js` as a background child process and await HTTP response at `http://localhost:3005`.
2. **Headless Browser & Error Listening**:
   - Launch Playwright Chromium (`headless: true`).
   - Attach `pageerror` and `console.error` listeners to capture any JS exceptions or console errors during execution.
3. **4-Tier Programmatic Test Execution**:
   - **Tier 1 (Tactical Card Logic Parity)**: Purchase a 1-star card from draft shop, verify TP deducts by 1. Play card from hand, verify TP remains unchanged (0 TP cost to play).
   - **Tier 2 (Card UI Anti-Overlap & Overlay Precision)**: Measure `getBoundingClientRect()` of titles, tags, and descriptions inside `.hand-card-kards` and `.draft-slot-card` across short and long text strings. Verify zero spatial overlap (`bottom1 <= top2 || right1 <= left2`).
   - **Tier 3 (True VFX Engine & Ultimate Execution)**: Select characters with ultimates (Zhou Xuansheng `char_14`, Fu Xiuran `char_fxr`, Wang Hedi `char_4`, Yan Ziming `char_19`, Zhang Jin Yuan `char_16`). Execute full battle roll and hit cycles. Verify presence of `.floating-damage`, hit flash, camera impulse, and `.skill-glass-banner` with zero console errors.
   - **Tier 4 (Mobile Viewport & End-to-End Stress)**: Run battle sessions at 375x667 viewport. Verify `scrollWidth <= clientWidth` on document root (no horizontal scrolling).
