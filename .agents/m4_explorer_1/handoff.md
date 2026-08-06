# Handoff Report — Milestone 4 Remediation Exploration (m4_explorer_1)

## 1. Observation

### Empirical Context & Failure Reports
- **Backend Crash during Run 3 (`task-47`)**:
  - Verbatim Error from `m4_challenger_1/handoff.md`:
    ```
    net::ERR_CONNECTION_REFUSED at http://localhost:3000/
    (The express backend server process node server/index.js crashed/terminated mid-suite execution)
    ```
  - Affected Tests in Run 3: Tests 1.4, 1.5, 2.1, 2.2, 2.3, 3.1 all failed with connection refused.

- **Test Flakiness & Timeout Failures in Run 2 (`task-35`)**:
  - Test 2.3 (`Mobile Viewport (375x667) Check`):
    `Test timeout of 30000ms exceeded. Error: page.waitForSelector: Target page, context or browser has been closed at line 278: await page.waitForSelector('#modal-select-btn');`
  - Test 3.1 (`Full Battle Turn Cycle`):
    `Test timeout of 30000ms exceeded. Error: page.waitForTimeout: Test timeout of 30000ms exceeded. at line 351: await page.waitForTimeout(1000);`

### Code Inspections

1. **`server/index.js` (Server Process & Socket Error Handling)**:
   - Line 31-32: `const httpServer = createServer(app); const io = new Server(httpServer, { cors: { origin: '*' }, pingTimeout: 30000, pingInterval: 10000 });`
   - Lines 54-512: `io.on('connection', (socket) => { ... })`
     - **Observation**: Zero global error handling registered on Node process level (`process.on('uncaughtException')` or `process.on('unhandledRejection')`).
     - **Observation**: Zero socket error event handlers registered (`socket.on('error')` or `io.engine.on('connection_error')`).
     - **Observation**: All 30+ socket event handlers lack synchronous/asynchronous `try ... catch` exception guards.
   - Lines 515-694: `triggerAiPhase(roomId)`:
     - **Observation**: `triggerAiPhase` schedules delayed `setTimeout` callbacks (1500ms and 2200ms) for AI actions.
     - Line 476 (`disconnect` event handler): when a client disconnects, `rooms.delete(roomId)` removes the room from the `rooms` Map.
     - Lines 568-588, 592-620, 624-693 (`setTimeout` callbacks in `triggerAiPhase`): when the delayed timer callback executes 1.5s–2.2s later, it does NOT check `if (!rooms.has(roomId)) return;`. As a result, operations execute on an orphaned game state object after room deletion, attempting to evaluate state or emit to disconnected sockets, throwing uncaught exceptions outside socket event loops and crashing the server process.

2. **`tests/e2e/ui_vfx_verification.spec.js` (E2E Test Race Condition & Timeout)**:
   - Lines 272-278 (Test 2.3):
     ```javascript
     272: await page.waitForSelector('#card-selector');
     ...
     277: await page.click('.avatar-cell[data-id="char_6"]');
     278: await page.waitForSelector('#modal-select-btn');
     ```
     - **Observation**: `#card-selector` appears in DOM before character cards (`.avatar-cell`) are populated by Socket.IO events. Test 2.3 lacks `await page.waitForSelector('.avatar-cell[data-id="char_6"]')` (present in Test 1.3, 1.4, 2.1, 2.2). Clicking before element visibility causes Playwright to miss the click or hang until timeout.
   - Lines 298-362 (Test 3.1):
     ```javascript
     298: test('3.1 Full Battle Turn Cycle', async ({ page }) => {
     ...
     316: for (let turn = 0; turn < 6; turn++) { ... }
     ```
     - **Observation**: Test 3.1 executes a 6-turn complete battle cycle. With page setup (5-8s) plus 6 turns each including socket roundtrips, UI animation delays, and server AI timeouts (1.5-2.2s per turn), total execution time ranges from 29s to 44s. Playwright's default test timeout threshold of 30,000ms is exceeded during multi-turn cycles.

---

## 2. Logic Chain

1. **Express Server Crash Analysis**:
   - In automated E2E test runs (especially rapid sequential runs like Run 3), browsers connect, interact, and disconnect rapidly.
   - When a test ends or page reloads, the client socket disconnects. `socket.on('disconnect')` executes `rooms.delete(roomId)`.
   - However, `triggerAiPhase` timers (scheduled 1500–2200ms earlier during AI turns) are still queued in the Node event loop.
   - When these timers fire on deleted rooms, `emitToAll(room, ...)` attempts to invoke `buildData(pid)` which evaluates state functions (`getStateView(g, pid)`) or accesses properties on modified/cleaned-up game objects.
   - Because `server/index.js` contains no `try/catch` inside timer callbacks and no `process.on('uncaughtException')` or `process.on('unhandledRejection')` process traps, any error thrown inside a timer callback immediately terminates the Node process, leading to `net::ERR_CONNECTION_REFUSED` for all subsequent test requests.

2. **Test 2.3 Race Condition Analysis**:
   - `page.waitForSelector('#card-selector')` only guarantees the container element exists in the DOM.
   - The card list (`.avatar-cell`) is asynchronously rendered upon receiving socket state data (`match_found`).
   - Calling `page.click('.avatar-cell[data-id="char_6"]')` without waiting for `.avatar-cell[data-id="char_6"]` to be rendered and visible introduces a race condition. If the click fails or fires before handler attach, the modal `#modal-select-btn` never opens, causing line 278 `waitForSelector('#modal-select-btn')` to block until the test times out.

3. **Test 3.1 Timeout Analysis**:
   - Test 3.1 loops through 6 battle turns.
   - Cumulative time: Page initialization (5–8s) + 6 turns * (card selection, roll click, dice selection, confirm click, server AI delay of 1.5–2.2s, plus `waitForTimeout(1000)`) = 29s – 44s.
   - When network or CPU throttling occurs during test execution, 6 turns reliably exceed the 30s default timeout limit. Setting `test.setTimeout(60000)` provides sufficient headroom for the 6-turn loop to complete deterministically.

---

## 3. Caveats

- **Read-Only Scope**: Per explorer guidelines, no application or test source files outside `.agents/m4_explorer_1` were modified.
- **Environment Variance**: Socket timer latencies can vary based on system CPU load; robust guards in server code and adequate E2E timeouts are required regardless of host performance.

---

## 4. Conclusion & Fix Strategy

### Verdict: REPAIR PLAN DEFINED

To achieve 100% deterministic test execution and 100% backend server uptime, two files must be updated: `server/index.js` and `tests/e2e/ui_vfx_verification.spec.js`.

---

### Concrete Fix 1: `server/index.js` Remediation

1. **Add Process Trap & Global Error Handlers**:
   Add `process.on('uncaughtException')` and `process.on('unhandledRejection')` at the top of `server/index.js` to log errors and prevent process termination.
2. **Add Socket Error Listener**:
   Add `socket.on('error', (err) => console.error(`[Socket Error ${socket.id}]:`, err))` and `io.engine.on('connection_error', ...)` to handle socket stream errors gracefully.
3. **Room Existence Guard in `triggerAiPhase` Timer Callbacks**:
   In `triggerAiPhase(roomId)`, add `if (!rooms.has(roomId)) return;` at the beginning of EVERY timer callback (`setTimeout`) to abort AI processing immediately if the room was deleted due to player disconnection.
4. **Try/Catch Wrappers for Critical Socket Callbacks**:
   Wrap socket event listeners in `try { ... } catch (err) { console.error(...); }` blocks.

#### Proposed Code Changes for `server/index.js`:

```javascript
// 1. Process-level error traps (Add after imports ~line 26)
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

// 2. Socket error listener (Add inside io.on('connection', (socket) => { ... }))
socket.on('error', (err) => {
  console.error(`[Socket Error ${socket.id}]:`, err);
});

// 3. Room existence check in triggerAiPhase timer callbacks (~line 568, 592, 625)
// In setTimeout callback for WAITING_ATK:
setTimeout(() => {
  if (!rooms.has(roomId)) return;
  if (g.phase !== 'battle' || g.turnPhase !== TURN.WAITING_ATK) return;
  ...
}, 2200);

// In setTimeout callback for ATK_ROLLED:
setTimeout(() => {
  if (!rooms.has(roomId)) return;
  if (g.phase !== 'battle' || g.turnPhase !== TURN.ATK_ROLLED) return;
  ...
}, 1500);

// In setTimeout callback for DEF_ROLLED:
setTimeout(() => {
  if (!rooms.has(roomId)) return;
  if (g.phase !== 'battle' || g.turnPhase !== TURN.DEF_ROLLED) return;
  ...
}, 1500);
```

---

### Concrete Fix 2: `tests/e2e/ui_vfx_verification.spec.js` Remediation

1. **Fix Race Condition in Test 2.3**:
   Add `await page.waitForSelector('.avatar-cell[data-id="char_6"]', { state: 'visible', timeout: 10000 });` before `await page.click('.avatar-cell[data-id="char_6"]');` in Test 2.3 (around line 277).
2. **Fix Timeout in Test 3.1 & Test 4.1**:
   Add `test.setTimeout(60000);` at the top of Test 3.1 (line 298) and Test 4.1 (line 370).

#### Proposed Code Changes for `tests/e2e/ui_vfx_verification.spec.js`:

```javascript
// Test 2.3 Fix (around line 276):
await page.waitForSelector('#card-selector');

overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
expect(overflow).toBe(false);

await page.waitForSelector('.avatar-cell[data-id="char_6"]', { state: 'visible', timeout: 10000 });
await page.click('.avatar-cell[data-id="char_6"]');
await page.waitForSelector('#modal-select-btn');

// Test 3.1 Fix (around line 298):
test('3.1 Full Battle Turn Cycle', async ({ page }) => {
  test.setTimeout(60000);
  const { pageErrors, consoleErrors } = setupErrorTracking(page);
  ...
```

---

## 5. Verification Method

To independently verify the fixes once implemented:

1. **Run Full Test Suite 3 Consecutive Times**:
   ```powershell
   npx playwright test tests/e2e/ui_vfx_verification.spec.js
   ```
2. **Verify Acceptance Criteria**:
   - All 10 tests pass across 3 consecutive runs (10/10, 10/10, 10/10).
   - Zero `net::ERR_CONNECTION_REFUSED` backend process crashes.
   - Test 2.3 completes deterministically without timeout hanging on `#modal-select-btn`.
   - Test 3.1 completes all 6 battle turn cycles within the extended 60-second limit.
