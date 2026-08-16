# Handoff Report — Milestone 1: Tactical Card Logic Fix (R1)

## 1. Observation

### 1.1 Hand Card Playing TP Check (Double-Charging Fix)
- **File**: `src/pages/battle.js`
- **Lines 312–321 (Before)**:
  ```javascript
  const canAfford = tp >= c.tpCost;
  const subjMatch = c.subject === 'universal' || c.subject === curSubj;
  const canPlay = canAfford && (c.subject === 'universal' || (subjMatch && canUseClass));

  let disableReason = '';
  if (!canPlay) {
     if (!subjMatch && c.subject !== 'universal') disableReason = `限当节课`;
     else if (!canUseClass && c.subject !== 'universal') disableReason = '非自身选科';
     else if (!canAfford) disableReason = 'TP不足';
  }
  ```
  - **Lines 312–320 (After)**:
  ```javascript
  const subjMatch = c.subject === 'universal' || c.subject === curSubj;
  const canPlay = c.subject === 'universal' || (subjMatch && canUseClass);

  let disableReason = '';
  if (!canPlay) {
     if (!subjMatch && c.subject !== 'universal') disableReason = `限当节课`;
     else if (!canUseClass && c.subject !== 'universal') disableReason = '非自身选科';
  }
  ```

### 1.2 Server AI Card Play Logic
- **File**: `server/index.js`
- **Lines 562–573 (Before)**:
  ```javascript
  const aiPlayer = g.players.find(p => p.id === room.aiId);
  if (aiPlayer && !aiPlayer.isDead && aiPlayer.handCards && aiPlayer.handCards.length > 0) {
    const curSubj = g.schedule[g.currentClassIndex];
    if (aiPlayer.card?.subjects?.includes(curSubj)) {
      const playableCard = aiPlayer.handCards.find(c => {
        const canAfford = (aiPlayer.tp || 0) >= c.tpCost;
        const subjMatch = c.subject === 'universal' || c.subject === curSubj;
        return canAfford && subjMatch;
      });
      ...
    }
  }
  ```
  - **Lines 562–572 (After)**:
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

### 1.3 Draft Shop Sampling Pool (`getRandomCard`)
- **File**: `shared/cards.js`
- **Lines 121–134 (Before)**:
  ```javascript
  export function getRandomCard(currentSubject, playerSubjects = []) {
    const pool = CARDS.filter(c => {
      if (c.subject === 'universal') return true;
      if (c.subject === currentSubject && playerSubjects.includes(currentSubject)) return true;
      return false;
    });
    if (pool.length === 0) return CARDS.find(c => c.subject === 'universal');
    return pool[Math.floor(Math.random() * pool.length)];
  }
  ```
  - **Lines 121–134 (After)**:
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

### 1.4 Test Verification Results
- **Command**: `node tests/test_card_logic_r1.js`
- **Result**:
  ```
  === Running R1 Tactical Card Logic Verification Tests ===
  1. Verifying star ratings & tpCost alignment...
  ✓ Card tier counts: 1-star=34, 2-star=21, 3-star=5
  2. Verifying getRandomCard balanced sampling...
    Sample distribution in PE class: { universal: 4977, math: 1277, chinese: 1235, physics: 1223, pe: 1288 }
    Universal card ratio: 49.77% (Expected ~50%)
  ✓ getRandomCard sampling verified successfully!
  3. Verifying Buy 1-Star card (1 TP) & Play from hand with 0 TP...
  ✓ 1-Star card purchased for 1 TP. Remaining TP: 0
  ✓ Card played from hand with 0 TP successfully!
  === All R1 Tactical Card Logic Verification Tests PASSED! ===
  ```

## 2. Logic Chain

1. **Card Play TP Cost Check Fix**:
   - In `server/game/engine.js`, `buyDraftCard` deducts `p.tp -= slot.card.tpCost` upon purchasing a card. `playTacticalCard` has 0 TP deduction logic.
   - Removing the `canAfford` check in `src/pages/battle.js` and `server/index.js` allows hand cards to be played at 0 TP without requiring extra reserve TP.
   - This directly fixes the perceived "1-star card costs 2 TP" bug because purchasing a 1-star card deducts exactly 1 TP (leaving 0 TP), and the card in hand can be played immediately with 0 TP.

2. **Draft Shop Sampling Fix**:
   - `getRandomCard` now collects `subjectPool` cards matching `playerSubjects` or `currentSubject`, and `universalPool` cards.
   - It performs balanced sampling (50% probability for a subject card, 50% for a universal card when subject cards exist).
   - Empirical verification over 10,000 iterations confirmed universal cards account for 49.77% of drafts while player subject cards (Chinese, Math, Physics, PE) account for the remaining 50.23%.

3. **1-Star Card Pricing & Star Rating Alignment**:
   - Evaluated all 60 card definitions in `shared/cards.js`.
   - Card star rendering (`★`.repeat(c.tpCost)) matches `c.tpCost` (1-star = 1 TP).
   - Purchasing a 1-star card deducts 1 TP from `p.tp`. Playing it costs 0 TP.

## 3. Caveats
No caveats. All requirement items in R1 have been implemented and verified with pure logic without hardcoding.

## 4. Conclusion
R1: Tactical Card Logic Fix is fully resolved and verified.

## 5. Verification Method

To independently verify:
Run the unit test script:
```bash
node tests/test_card_logic_r1.js
```
Expected output:
- 10,000 sampling iterations verify universal cards ~50% and player subject cards ~50%.
- Purchasing a 1-star card with 1 TP reduces player TP to 0.
- Playing the card from hand at 0 TP succeeds without error or disable overlay.
