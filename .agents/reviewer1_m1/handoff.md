# Reviewer Handoff Report — Milestone 1: Tactical Card Logic Fix (R1)

## 1. Observation

### 1.1 Hand Card Playability (0 TP Requirement)
- **File**: `src/pages/battle.js` (lines 312–320)
  ```javascript
  const subjMatch = c.subject === 'universal' || c.subject === curSubj;
  const canPlay = c.subject === 'universal' || (subjMatch && canUseClass);

  let disableReason = '';
  if (!canPlay) {
     if (!subjMatch && c.subject !== 'universal') disableReason = `限当节课`;
     else if (!canUseClass && c.subject !== 'universal') disableReason = '非自身选科';
  }
  ```
  - **Verification**: Hand cards no longer inspect `s.me.tp >= c.tpCost`. The `canAfford` check has been removed, ensuring cards in hand require 0 TP to play and are never disabled due to `TP不足`.

- **File**: `server/index.js` (lines 546–558)
  ```javascript
  const aiPlayer = g.players.find(p => p.id === room.aiId);
  if (aiPlayer && !aiPlayer.isDead && aiPlayer.handCards && aiPlayer.handCards.length > 0) {
    const curSubj = g.schedule[g.currentClassIndex];
    const canUseClass = aiPlayer.card?.subjects?.includes(curSubj);
    const playableCard = aiPlayer.handCards.find(c => {
      const subjMatch = c.subject === 'universal' || (c.subject === curSubj && canUseClass);
      return subjMatch;
    });
    if (playableCard) {
      playTacticalCard(g, room.aiId, playableCard.id);
      emitStateToAll(room);
    }
  }
  ```
  - **Verification**: AI card play logic also removed `(aiPlayer.tp || 0) >= c.tpCost`. AI plays valid hand cards regardless of remaining TP.

- **File**: `server/game/engine.js` (`playTacticalCard` lines 1750–1774)
  - `playTacticalCard` verifies presence of card in hand, validates subject matching for subject cards, splices the card from `p.handCards`, and applies instant or blessing effects. There is zero TP check or deduction on play.

### 1.2 Draft Shop Star & TP Deduction Matching
- **File**: `shared/cards.js`
  - 60 card definitions evaluated. Every card defines `tpCost` matching its star rating:
    - 34 cards with `tpCost: 1` (1-star)
    - 21 cards with `tpCost: 2` (2-star)
    - 5 cards with `tpCost: 3` (3-star)
- **File**: `src/pages/battle.js` (`checkDraftShopModal` lines 397–405)
  - Renders stars via `'★'.repeat(c.tpCost) + '☆'.repeat(3 - c.tpCost)`.
  - Checks affordability via `s.me.tp >= c.tpCost`.
- **File**: `server/game/engine.js` (`buyDraftCard` lines 1851–1852)
  ```javascript
  if ((p.tp || 0) < slot.card.tpCost) return { ok: false, error: 'TP 不足' };
  p.tp -= slot.card.tpCost;
  ```
  - **Verification**: Buying a 1-star card deducts exactly 1 TP. Buying a 2-star card deducts 2 TP. Buying a 3-star card deducts 3 TP.

### 1.3 Draft Shop Pool Sampling Balance
- **File**: `shared/cards.js` (`getRandomCard` lines 121–136)
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
  - **Verification**: Gives a strict 50% probability to draw a matching subject card (from player subjects or current class subject) and 50% to draw a universal card when subject cards exist.

### 1.4 Command Execution Results
- Command: `node tests/test_card_logic_r1.js`
  - Output: `Card tier counts: 1-star=34, 2-star=21, 3-star=5`
  - Sample distribution (10,000 runs): Universal = 49.56%, Subject cards = 50.44%
  - Buy 1-star for 1 TP (TP 1 -> 0), Play from hand with 0 TP -> PASSED
- Command: `node tests/challenger1_m1_verification.js`
  - Output: `VERIFICATION COMPLETE: 7 / 7 TESTS PASSED` (100,000 sampling iterations, 50.17% universal ratio)
- Command: `node tests/challenger_m1_stress_test.js`
  - Output: `STRESS TEST COMPLETE: 7/7 Passed`

---

## 2. Logic Chain

1. **Elimination of Double-Charging**:
   - TP was previously checked twice: once during purchase from draft shop and once when attempting to play from hand.
   - By removing `canAfford` checks from `src/pages/battle.js` and `server/index.js`, playing a card from hand requires 0 TP and is purely governed by subject/class match.
   - Purchasing a card in `server/game/engine.js` correctly deducts `c.tpCost` (1 TP for 1-star). A player with 1 TP can buy a 1-star card (leaving 0 TP) and play it immediately.

2. **Draft Shop Pool Diversification**:
   - `getRandomCard` separates non-universal subject cards relevant to the active player's subjects or current class from universal cards.
   - Using a 50/50 split ensures draft shops are not dominated purely by universal cards or single-subject cards, maintaining draft strategic variety.

3. **Code Quality & Anti-Pattern Check**:
   - No hardcoded test results, facade implementations, or bypasses were detected. Production code in `battle.js`, `cards.js`, `index.js`, and `engine.js` directly implements the logic.

---

## 3. Caveats

No caveats. All requirements in Milestone 1 (R1) have been inspected, tested, and confirmed to meet specification without residual side effects.

---

## 4. Conclusion

**Verdict**: **APPROVE**

Milestone 1: Tactical Card Logic Fix (R1) satisfies all acceptance criteria and quality standards.

---

## 5. Verification Method

To independently verify:
```bash
node tests/test_card_logic_r1.js
node tests/challenger1_m1_verification.js
node tests/challenger_m1_stress_test.js
```
Expected output: All test suites complete with exit code 0 and 100% pass rate.

---

## 6. Review Summary & Findings

**Verdict**: APPROVE

### Verified Claims
- Claim: Playing cards from hand requires 0 TP and does not check for reserve TP.
  - Verified via: Code inspection of `src/pages/battle.js`, `server/index.js`, `server/game/engine.js`, and execution of `test_card_logic_r1.js` (Test 3) -> PASS.
- Claim: Purchasing cards from shop deducts exact star rating (1 star = 1 TP).
  - Verified via: Inspection of `shared/cards.js` (all 60 cards match `tpCost`) and `engine.js` (`p.tp -= slot.card.tpCost`), verified via `challenger1_m1_verification.js` (Test 2) -> PASS.
- Claim: `getRandomCard` produces a balanced draft shop pool including player subjects and universal cards.
  - Verified via: 100,000 iteration empirical distribution test showing ~50% universal cards and ~50% player subject cards -> PASS.

### Coverage Gaps
- None. All modified files and call sites were thoroughly inspected.

### Unverified Items
- None.

---

## 7. Adversarial Challenge Report

**Overall Risk Assessment**: LOW

### Challenge Scenarios & Stress Tests

1. **Scenario 1: Player at 0 TP attempts to play hand card**
   - *Attack Scenario*: Player buys 1-star card with 1 TP (TP drops to 0). Tries to play card from hand.
   - *Expected Behavior*: Card is playable, cost overlay displays ⚡1 (card tier), click triggers play effect, server accepts play request.
   - *Actual Result*: PASSED. Card played successfully at 0 TP.

2. **Scenario 2: Player at 0 TP attempts to purchase 1-star card**
   - *Attack Scenario*: Player with 0 TP clicks draft shop 1-star card slot.
   - *Expected Behavior*: Client displays `TP不足` overlay on draft slot, server rejects `buyDraftCard` with `TP 不足`.
   - *Actual Result*: PASSED. Server returns `{ ok: false, error: 'TP 不足' }`.

3. **Scenario 3: Empty subject pool fallback in `getRandomCard`**
   - *Attack Scenario*: `getRandomCard` called with a subject that has no subject cards defined and `playerSubjects` is empty.
   - *Expected Behavior*: `subjectPool` is empty, falls back gracefully to `universalPool` without throwing exceptions or returning undefined.
   - *Actual Result*: PASSED. `universalPool` card returned reliably.

### Unchallenged Areas
- None.
