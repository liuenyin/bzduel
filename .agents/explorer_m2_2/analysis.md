# Milestone 2 Iteration 1 Gate Failure Analysis & Fix Strategy Report

## Executive Summary
In Iteration 1, the gate test failed due to 4 specific `TypeError` vectors during adversarial stress testing:
1. `src/utils/vfx.js` (`rollDice`): Calling `rollDice([validElement, null])` throws `TypeError: Cannot read properties of null (reading 'style')`.
2. `src/pages/battle.js` (`buildAlerts` & `onTurnResolved`): `data.isAoE` is true while `data.aoeResults` is `null`/`undefined`, throwing `TypeError: Cannot read properties of null (reading 'forEach')`.
3. `src/pages/battle.js` (`onTurnResolved`): `S` state uninitialized or `undefined` inside `setTimeout` callbacks, throwing `TypeError: Cannot read properties of undefined (reading 'myIndex')`.
4. `src/pages/battle.js` (`onTurnResolved`): `S.defenderIdx` is `undefined`, causing `undefined !== null` to evaluate to `true` and throwing `TypeError: Cannot read properties of undefined (reading 'id')`.

This report provides the exact, tested fix strategy for each vector without modifying source files directly (per explorer read-only mandate).

---

## 1. Defect Analysis & Evidence Chain

### Defect 1: `vfxManager.rollDice` DOM Element Null Crash
- **Location**: `src/utils/vfx.js:23-32`
- **Observed Behavior**:
  ```javascript
  const elements = Array.from(diceElements || []);
  if (elements.length === 0) { ... }
  elements.forEach(el => {
    el.style.animation = 'none'; // Throws TypeError if el is null or undefined
  });
  ```
- **Root Cause**: `Array.from` converts `[element, null]` into an array of length 2. The array is non-empty, so execution proceeds to `elements.forEach` and attempts to read `.style` on `null`.
- **Fix Strategy**: Filter `diceElements` using `.filter(Boolean)` so that only valid HTML elements remain in `elements`.

### Defect 2: `onTurnResolved` / `buildAlerts` Null `aoeResults` Crash
- **Location**: `src/pages/battle.js:700` and `737-747`
- **Observed Behavior**:
  ```javascript
  // Line 700 in buildAlerts:
  const results = data.isAoE ? data.aoeResults : [data];
  results.forEach(res => { ... }); // Throws TypeError if data.isAoE is true but data.aoeResults is null

  // Line 737 in onTurnResolved:
  const isAoE = data.isAoE;
  // Line 747:
  data.aoeResults.forEach(res => { ... }); // Throws TypeError
  ```
- **Root Cause**: `data.isAoE` can be `true` when `data.aoeResults` is `null` or `undefined`.
- **Fix Strategy**:
  1. In `buildAlerts`: Use `Array.isArray(data.aoeResults)` check:
     `const results = data.isAoE ? (Array.isArray(data.aoeResults) ? data.aoeResults : []) : [data];`
  2. In `onTurnResolved`: Change `const isAoE = data.isAoE;` to:
     `const isAoE = data.isAoE && Array.isArray(data.aoeResults);`

### Defect 3: `onTurnResolved` Uninitialized `S` State Crash inside Deferred Timers
- **Location**: `src/pages/battle.js:741` and `787`
- **Observed Behavior**:
  ```javascript
  setTimeout(() => {
    const isMyAtk = S.myIndex === attackerIdx; // Throws TypeError if S is null/undefined
  }, 800);
  ```
- **Root Cause**: If `S` is uninitialized or reset prior to/during the 800ms deferred animation callback execution, property access on `S` fails.
- **Fix Strategy**: Add a guard check at the beginning of `setTimeout` callbacks in both AoE and 1v1 animation branches:
  ```javascript
  if (!S || typeof S.myIndex === 'undefined') return;
  ```

### Defect 4: `onTurnResolved` `S.defenderIdx === undefined` Crash
- **Location**: `src/pages/battle.js:795`
- **Observed Behavior**:
  ```javascript
  const defId = S.defenderIdx !== null ? S.players[S.defenderIdx].id : null;
  ```
- **Root Cause**: In JavaScript, `undefined !== null` evaluates to `true`. When `S.defenderIdx` is `undefined`, `S.players[undefined]` evaluates to `undefined`, and accessing `.id` throws `TypeError: Cannot read properties of undefined (reading 'id')`.
- **Fix Strategy**: Refactor the null check to explicitly check for both `null` and `undefined` as well as confirming array element existence:
  ```javascript
  const defId = (S.defenderIdx !== null && S.defenderIdx !== undefined && S.players && S.players[S.defenderIdx]) ? S.players[S.defenderIdx].id : null;
  ```

---

## 2. Proposed Code Changes (Patch Specification)

### File 1: `src/utils/vfx.js`
```diff
--- a/src/utils/vfx.js
+++ b/src/utils/vfx.js
@@ -20,7 +20,7 @@ export const vfxManager = {
    * @param {Function} [onComplete] - Optional callback upon completion
    */
   rollDice(diceElements, finalValues = [], onComplete = null) {
-    const elements = Array.from(diceElements || []);
+    const elements = Array.from(diceElements || []).filter(Boolean);
     if (elements.length === 0) {
       if (typeof onComplete === 'function') onComplete();
       return;
```

### File 2: `src/pages/battle.js`
```diff
--- a/src/pages/battle.js
+++ b/src/pages/battle.js
@@ -697,7 +697,7 @@ function buildAlerts(data) {
   if (ar.posTriggered) alerts.push(`<div class="skill-alert positive">[${ar.posName}] 发动</div>`);
   if (ar.negTriggered) alerts.push(`<div class="skill-alert negative">[${ar.negName}] 发动</div>`);
 
-  const results = data.isAoE ? data.aoeResults : [data];
+  const results = data.isAoE ? (Array.isArray(data.aoeResults) ? data.aoeResults : []) : [data];
 
   results.forEach(res => {
     if (res.defPosTriggered) alerts.push(`<div class="skill-alert positive">[${res.defPosName}] 发动</div>`);
@@ -734,11 +734,12 @@ export function onTurnResolved(data) {
     if (defSumEl) defSumEl.innerHTML = `= ${finalDef}${penalty ? ` <small>(−${penalty})</small>` : ''}`;
   }
 
-  const isAoE = data.isAoE;
+  const isAoE = data.isAoE && Array.isArray(data.aoeResults);
   
   if (isAoE) {
     // FFA 群伤效果动画
     setTimeout(() => {
+      if (!S || typeof S.myIndex === 'undefined') return;
       const isMyAtk = S.myIndex === attackerIdx;
       const atkId = S.players[attackerIdx].id;
       const atkCard = atkId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${atkId}"]`);
@@ -785,13 +786,14 @@ export function onTurnResolved(data) {
   } else {
     // 1v1 动画
     setTimeout(() => {
+      if (!S || typeof S.myIndex === 'undefined') return;
       const isMyAtk = S.myIndex === attackerIdx;
       let atkCard, defCard;
       if (S.gameMode === '1v1') {
         atkCard = document.getElementById(isMyAtk ? 'card-me' : 'card-op');
         defCard = document.getElementById(isMyAtk ? 'card-op' : 'card-me');
       } else {
         const atkId = S.players[attackerIdx].id;
-        const defId = S.defenderIdx !== null ? S.players[S.defenderIdx].id : null;
+        const defId = (S.defenderIdx !== null && S.defenderIdx !== undefined && S.players && S.players[S.defenderIdx]) ? S.players[S.defenderIdx].id : null;
         atkCard = atkId === S.me.id ? document.getElementById('card-me') : document.querySelector(`.ffa-micro-card[data-pid="${atkId}"]`);
         defCard = defId === S.me.id ? document.getElementById('card-me') : (defId ? document.querySelector(`.ffa-micro-card[data-pid="${defId}"]`) : null);
       }
```

---

## 3. Verification Plan
1. **Stress Test 1 (Challenger M2.1)**: Run `node tests/stress_m2_1.js` to confirm `rollDice([validElement, null])` passes without throwing.
2. **Stress Test 2 (Challenger M2.2)**: Run `node tests/e2e/test_m2_2_empirical.js` to confirm AoE null test, undefined state test, and undefined defenderIdx test all pass without page errors.
3. **Build Check**: Run `npm run build` to verify no bundling regressions.
