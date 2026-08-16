# Handoff Report — Milestone 1: Tactical Card Logic Fix (R1) Verification

## 1. Observation

### 1.1 Card Playing from Hand at 0 TP (Double-Charging Fix)
- **File**: `src/pages/battle.js` (lines 312–319)
  ```javascript
  const subjMatch = c.subject === 'universal' || c.subject === curSubj;
  const canPlay = c.subject === 'universal' || (subjMatch && canUseClass);

  let disableReason = '';
  if (!canPlay) {
     if (!subjMatch && c.subject !== 'universal') disableReason = `限当节课`;
     else if (!canUseClass && c.subject !== 'universal') disableReason = '非自身选科';
  }
  ```
  - **Observation**: `canPlay` calculation no longer checks `canAfford` (`tp >= c.tpCost`). Playing a hand card requires 0 TP and displays no `TP不足` disable overlay when player TP is 0.

- **File**: `server/game/engine.js` (lines 1783–1811)
  ```javascript
  export function playTacticalCard(state, playerId, cardId) {
    if (state.phase !== PHASE.BATTLE) return { ok: false, error: '非战斗阶段' };
    const p = findPlayer(state, playerId);
    if (!p || p.isDead) return { ok: false, error: '玩家不存在或已阵亡' };

    const cIdx = (p.handCards || []).findIndex(c => c.id === cardId);
    if (cIdx === -1) return { ok: false, error: '手牌中无此卡牌' };
    const card = p.handCards[cIdx];

    const curSubj = state.schedule[state.currentClassIndex];
    if (card.subject !== 'universal' && card.subject !== curSubj) {
      return { ok: false, error: `【${card.name}】只能在 ${card.subject} 课使用！` };
    }
    p.handCards.splice(cIdx, 1);
    ...
    return { ok: true, card };
  }
  ```
  - **Observation**: `playTacticalCard` contains zero TP cost check or TP deduction. Cards are played from hand without consuming TP.

- **File**: `server/index.js` (lines 566–569)
  ```javascript
  const playableCard = aiPlayer.handCards.find(c => {
    const subjMatch = c.subject === 'universal' || (c.subject === curSubj && canUseClass);
    return subjMatch;
  });
  ```
  - **Observation**: Server AI card play strategy checks only subject matching, permitting AI to play cards from hand at 0 TP without being blocked by affordability checks.

### 1.2 Balanced Sampling in Shop Draft (`getRandomCard`)
- **File**: `shared/cards.js` (lines 121–136)
  ```javascript
  export function getRandomCard(currentSubject, playerSubjects = []) {
    const subjectPool = CARDS.filter(c => 
      c.subject !== 'universal' && (playerSubjects.includes(c.subject) || c.subject === currentSubject)
    );
    const universalPool = CARDS.filter(c => c.subject === 'universal');

    if (subjectPool.length > 0 && Math.random() < 0.5) {
      return subjectPool[Math.floor(Math.random() * subjectPool.length)];
    }
    if (universalPool.length > 0) {
      return universalPool[Math.floor(Math.random() * universalPool.length)];
    }
    return CARDS[Math.floor(Math.random() * CARDS.length)];
  }
  ```
  - **Observation**: When subject cards matching `playerSubjects` or `currentSubject` exist, `getRandomCard` samples from `subjectPool` with 50% probability and `universalPool` with 50% probability.

### 1.3 Card Pricing & Star Rating Alignment
- **File**: `shared/cards.js` (lines 23–115)
  - All 60 cards define `tpCost` as 1, 2, or 3.
  - Distribution: 1-Star (1 TP) = 34 cards, 2-Star (2 TP) = 21 cards, 3-Star (3 TP) = 5 cards.
  - UI renders star count as `⭐.repeat(card.tpCost)`.
  - `buyDraftCard` in `server/game/engine.js` line 1900 deducts `p.tp -= slot.card.tpCost`. A 1-star card deducts 1 TP (1 TP -> 0 TP).

### 1.4 Test Execution Results (Empirical Verification)
- **Command 1**: `node tests/test_card_logic_r1.js`
  - Output:
    ```
    === Running R1 Tactical Card Logic Verification Tests ===
    1. Verifying star ratings & tpCost alignment...
    ✓ Card tier counts: 1-star=34, 2-star=21, 3-star=5
    2. Verifying getRandomCard balanced sampling...
      Sample distribution in PE class: { universal: 4986, chinese: 1257, pe: 1247, physics: 1262, math: 1248 }
      Universal card ratio: 49.86% (Expected ~50%)
    ✓ getRandomCard sampling verified successfully!
    3. Verifying Buy 1-Star card (1 TP) & Play from hand with 0 TP...
    ✓ 1-Star card purchased for 1 TP. Remaining TP: 0
    ✓ Card played from hand with 0 TP successfully!
    === All R1 Tactical Card Logic Verification Tests PASSED! ===
    ```
- **Command 2**: `node tests/challenger1_m1_verification.js`
  - Output:
    ```
    ===========================================================
      CHALLENGER 1 MILLESTONE 1 EMPIRICAL VERIFICATION HARNESS
    ===========================================================
           Card breakdown by star (tpCost): 1★=34, 2★=21, 3★=5
           Universal cards: 15, Subject cards: 45
    [PASS] 1. Card Database & Star Rating to tpCost Mapping Integrity
    [PASS] 2. Shop Draft Purchase Exact TP Deduction (1-Star = 1 TP, 2-Star = 2 TP, 3-Star = 3 TP)
    [PASS] 3. Play Card from Hand with 0 TP (1-Star, 2-Star, 3-Star, Instant Effects)
    [PASS] 4. UI battle.js Hand Card Playability Logic
           100,000 Samples distribution: { universal: 50021, physics: 16597, math: 16608, chinese: 16774 }
           Universal ratio: 50.02%
           Subject cards ratio: 49.98%
    [PASS] 5. Statistical Distribution & Diversity of getRandomCard (100,000 Iterations)
    [PASS] 6. Draft Shop Refresh Diversity & State Management
    [PASS] 7. Server AI Player Card Play Execution at 0 TP
    ===========================================================
      VERIFICATION COMPLETE: 7 / 7 TESTS PASSED
    ===========================================================
    ```
- **Command 3**: `node tests/challenger_m1_stress_test.js`
  - Output:
    ```
    =================================================
      CHALLENGER STRESS TEST: Milestone 1 (R1)
    =================================================
    ✓ [PASS] Test 1: Card definitions tpCost alignment (1..3 TP & Star matching)
    ✓ [PASS] Test 2: getRandomCard distribution across 20,000 iterations
    ✓ [PASS] Test 3: 0 TP Edge Case: Buy card fails with 'TP不足', Play card succeeds with 0 TP
    ✓ [PASS] Test 4: 1 TP Edge Case: Buy 1-star card succeeds (TP 1 -> 0), then play at 0 TP succeeds. Buy 2-star fails.
    ✓ [PASS] Test 5: Max TP Edge Case: Capping at 10 TP, multiple purchases, max hand size protection
    ✓ [PASS] Test 6: Client UI logic (battle.js): hand cards display and TP overlay checks
    ✓ [PASS] Test 7: AI Turn Execution: AI plays hand cards regardless of TP and respects subject constraints
    =================================================
      STRESS TEST COMPLETE: 7/7 Passed
    =================================================
    ```

## 2. Logic Chain

1. **Card Play TP Cost Check Removal**:
   - The bug in previous builds was double-charging: TP was deducted upon purchasing from the draft shop, but playing the card from hand required having reserve TP equal to `tpCost` again.
   - Removing `canAfford` checks from `src/pages/battle.js` and `server/index.js` while keeping `buyDraftCard` TP deduction guarantees that card purchases cost TP once, and hand cards can be played at 0 TP.
   - Verified by direct code inspection (Observation 1.1) and empirical execution (Observation 1.4, Test 3 & 4), where playing cards with 0 TP succeeds completely and applies instant/buff card effects.

2. **Draft Shop Balanced Sampling (`getRandomCard`)**:
   - `getRandomCard` partitions eligible cards into `subjectPool` (matching `playerSubjects` or `currentSubject`) and `universalPool`.
   - Drawing applies a 50/50 probability split when subject cards are available.
   - Verified by empirical statistical testing over 100,000 iterations (Observation 1.4, Test 5), yielding a 50.02% universal ratio and 49.98% subject card ratio across physics, math, and chinese subjects.

3. **1:1 Star Rating & tpCost Mapping**:
   - All 60 cards in `shared/cards.js` have valid `tpCost` values (1, 2, 3) matching rendered UI star counts.
   - Buying a 1-star card deducts exactly 1 TP. When a player has 1 TP, buying a 1-star card leaves 0 TP, and the player can play it immediately from hand with 0 TP.
   - Verified by direct database audit and execution (Observation 1.3 & 1.4).

## 3. Caveats
No caveats. All requirements R1.1, R1.2, and R1.3 are fully satisfied and verified across both server and client engines.

## 4. Conclusion
**Verdict: APPROVE**

Milestone 1: Tactical Card Logic Fix (R1) is fully verified. All claims regarding 0 TP hand card playing, 1:1 star rating pricing, and draft shop balanced sampling have been empirically proven with 100% test pass rates.

## 5. Verification Method

To independently verify:
Run the test commands:
```bash
node tests/test_card_logic_r1.js
node tests/challenger1_m1_verification.js
node tests/challenger_m1_stress_test.js
```
Expected output:
- All test suites exit with code 0.
- 100,000 sampling iterations verify universal cards ~50% and player subject cards ~50%.
- Purchasing a 1-star card with 1 TP reduces player TP to 0.
- Playing cards from hand at 0 TP succeeds without error or disable overlay.
