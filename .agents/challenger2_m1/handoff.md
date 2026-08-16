# Handoff Report — Challenger 2 Verification for Milestone 1: Tactical Card Logic Fix (R1)

## 1. Observation

### 1.1 Code Inspection Findings
- **File**: `src/pages/battle.js`
  - Lines 312–320: The hand card rendering logic was updated so `canPlay` is evaluated strictly via subject match (`subjMatch && canUseClass`), removing the dependency on `tp >= c.tpCost`. This ensures cards in hand are not erroneously tagged as `TP不足` when player TP is 0.
- **File**: `server/index.js`
  - Lines 561–574: AI hand card play logic was updated to search `aiPlayer.handCards` for cards matching subject requirements without checking `aiPlayer.tp >= c.tpCost`.
  - Lines 545–559: AI draft shop auto-purchasing calls `buyDraftCard(g, room.aiId, i)`, which internally checks `(p.tp || 0) >= slot.card.tpCost` and deducts TP upon purchase.
- **File**: `shared/cards.js`
  - Lines 121–136: `getRandomCard` collects eligible subject-specific cards and universal cards, applying balanced 50/50 sampling when subject cards are available.
  - All 60 cards have valid `tpCost` values (1 to 3 TP). 1-star cards cost 1 TP, 2-star cards cost 2 TP, 3-star cards cost 3 TP. UI star rendering (`'★'.repeat(c.tpCost) + '☆'.repeat(3 - c.tpCost)`) matches `c.tpCost` exactly.

### 1.2 Verification Harness Execution Outputs

#### Harness 1: `node tests/test_card_logic_r1.js`
```
=== Running R1 Tactical Card Logic Verification Tests ===
1. Verifying star ratings & tpCost alignment...
✓ Card tier counts: 1-star=34, 2-star=21, 3-star=5
2. Verifying getRandomCard balanced sampling...
  Sample distribution in PE class: { universal: 5047, physics: 1253, math: 1269, chinese: 1233, pe: 1198 }
  Universal card ratio: 50.47% (Expected ~50%)
✓ getRandomCard sampling verified successfully!
3. Verifying Buy 1-Star card (1 TP) & Play from hand with 0 TP...
✓ 1-Star card purchased for 1 TP. Remaining TP: 0
✓ Card played from hand with 0 TP successfully!
=== All R1 Tactical Card Logic Verification Tests PASSED! ===
```

#### Harness 2: `node tests/challenger_m1_stress_test.js` (Custom Challenger Harness)
```
=================================================
  CHALLENGER STRESS TEST: Milestone 1 (R1)
=================================================

✓ [PASS] Test 1: Card definitions tpCost alignment (1..3 TP & Star matching)
   Sample distribution over 20000 runs: { chinese: 3417, universal: 9991, pe: 3270, math: 3322 }
   Universal card ratio: 49.95%
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

#### Harness 3: `node tests/challenger1_m1_verification.js`
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
       100,000 Samples distribution: { chinese: 16759, universal: 50204, physics: 16517, math: 16520 }
       Universal ratio: 50.20%
       Subject cards ratio: 49.80%
[PASS] 5. Statistical Distribution & Diversity of getRandomCard (100,000 Iterations)
[PASS] 6. Draft Shop Refresh Diversity & State Management
[PASS] 7. Server AI Player Card Play Execution at 0 TP
===========================================================
  VERIFICATION COMPLETE: 7 / 7 TESTS PASSED
===========================================================
```

## 2. Logic Chain

1. **TP Deduction vs Play Cost**:
   - In `server/game/engine.js`, TP is deducted only during `buyDraftCard`. `playTacticalCard` does not check or deduct TP.
   - Hand card UI in `src/pages/battle.js` and AI server handler in `server/index.js` evaluate card playability solely based on subject match (`c.subject === 'universal' || (c.subject === curSubj && canUseClass)`).
   - Stress tests empirically verified that players with 0 TP can play 1-star, 2-star, and 3-star hand cards without errors or double-charging.

2. **Draft Shop TP Enforcement & Star Rating Alignment**:
   - `buyDraftCard` in `server/game/engine.js` verifies `(p.tp || 0) >= slot.card.tpCost`. Buying a 1-star card deducts 1 TP, a 2-star card deducts 2 TP, and a 3-star card deducts 3 TP.
   - UI in `src/pages/battle.js` correctly renders disabled overlay (`TP不足`) in the draft shop modal when `tp < card.tpCost`.
   - Max TP (10 TP) capping and 3-card hand limit protection operate as expected under stress conditions.

3. **AI Turn Execution**:
   - AI players correctly evaluate hand card eligibility without TP cost checks.
   - AI draft shop purchasing respects TP cost constraints (will not attempt to buy un-affordable cards).
   - AI executes card plays seamlessly without JS exceptions or unhandled promise rejections.

4. **getRandomCard Sampling**:
   - Over 20,000 and 100,000 iterations, universal cards represent 49.95% to 50.20% of drafts, while subject cards fill the remaining ~50%.

## 3. Caveats
No caveats. All requirements in Milestone 1 (R1) were stress tested empirically and verified against edge cases.

## 4. Conclusion
**Verdict: APPROVE**

Milestone 1: Tactical Card Logic Fix (R1) is fully verified. All edge case TP values (0 TP, 1 TP, max TP) and AI turn card execution operate accurately and reliably.

## 5. Verification Method

To independently verify:
```bash
node tests/test_card_logic_r1.js
node tests/challenger_m1_stress_test.js
node tests/challenger1_m1_verification.js
```
Expected output: All test cases pass with exit code 0.
