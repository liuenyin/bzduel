# Forensic Audit Report: R2-M1 Remediation

**Work Product**: `server/game/engine.js`, `shared/cards.js`, `tests/r2_m1_verification.js`  
**Profile**: General Project (Benchmark Mode)  
**Verdict**: CLEAN  

---

## 1. Observation

A comprehensive empirical and static analysis of the 9 remediated fixes in `server/game/engine.js` and the verification test suite `tests/r2_m1_verification.js` was conducted:

1. **`confirmDefense` Recalculation (`server/game/engine.js` lines 1076–1174, 880–915)**:
   - In 1v1 mode, `keptRolls` is modified by `card_chi_2` (line 1082: setting minimum kept die to max face) and `card_chi_3` (line 1091: setting maximum kept die to 2).
   - Line 1157 sets `finalKeptRolls = keptRolls` rather than re-evaluating `keepIndices.map(i => defRolls[i])`. `finalBaseDef` and `finalFinalDef` are computed directly from `finalKeptRolls`, propagating modified defense to `damage` (line 1180) and defender `def.hp` (line 1205).
   - In AoE mode, lines 880–915 mirror this logic via `finalPKeptRolls = pKeptRolls`, propagating defense recalculations to `pFinalBaseDef`, `pFinalFinalDef`, `damage`, and `p.hp`.

2. **`card_eng_1` +2 Rerolls (`server/game/engine.js` line 2013)**:
   - `playTacticalCard` handles `card_eng_1` by setting `p.rerolls += 2` when played as a blessing.

3. **`card_his_2` Round Timing (`server/game/engine.js` lines 1575–1579, line 1940)**:
   - `resolvePhaseEnd` saves `p.prevUnusedDiceSum = p.unusedDiceSum || 0` at every sub-round completion.
   - `calcTacticalCardEffects` line 1940 uses `atk.prevUnusedDiceSum` for `card_his_2` bonus attack calculation.

4. **`card_it_1` Blessing Execution (`server/game/engine.js` lines 2015–2024)**:
   - Placed directly inside `playTacticalCard` under the `CARD_TYPE.BLESSING` branch, executing `JSON.parse(JSON.stringify(opp.card.positiveSkill))` and copying `opp.card.dicePool`.

5. **`card_bio_3` Opponent Damage (`server/game/engine.js` lines 2085–2092)**:
   - `applyInstantCardEffect` computes `hpCost = Math.floor(p.hp * 0.3)` and `realDmg = Math.min(10, Math.max(1, hpCost))`. Deducts `hpCost` from `p.hp` and `realDmg` from `opp.hp`.

6. **`card_gen_15` Attack Damage Condition (`server/game/engine.js` lines 951–959, lines 1206–1212)**:
   - Instant draw removed from `applyInstantCardEffect` (line 2069).
   - Added conditional draw inside `confirmDefense` checking `damage > 0` for both 1v1 and AoE modes.

7. **`playedTurnCards` State Cleanup (`server/game/engine.js` lines 1775–1779)**:
   - `resolvePhaseEnd` resets `p.playedTurnCard = null` and `p.playedTurnCards = []` at every sub-round turn resolution.

8. **`card_gen_14` AoE Mode Support (`server/game/engine.js` lines 944–949)**:
   - Added check `if (pTurnCards.some(c => c.id === 'card_gen_14') && damage === 0)` inside the AoE defense loop to grant `p.tp += 2`.

9. **Verification Suite Integrity (`tests/r2_m1_verification.js`)**:
   - `node tests/r2_m1_verification.js` executes 57 assertions across 11 test suites with 0 failures.
   - `node tests/challenger_r2_m1_stress.js` executes 16 test suites across 50 Monte Carlo games (893 turns) with 0 failures.

---

## 2. Logic Chain

1. **Recalculation Integrity**: Synchronizing `finalKeptRolls = keptRolls` in `confirmDefense` guarantees that card effects (`card_chi_2`, `card_chi_3`) directly impact `finalFinalDef`, `damage`, and `p.hp` during combat resolution.
2. **Lifecycle & Timing Integrity**: Storing `prevUnusedDiceSum` during `resolvePhaseEnd` guarantees `card_his_2` reads previous-round dice state rather than current-round dice state.
3. **Card Contract Parity**: Blessing cards (`card_eng_1`, `card_it_1`) execute their logic immediately upon play. Conditional cards (`card_gen_14`, `card_gen_15`) defer state changes until combat damage resolution.
4. **No Cheating / No Hardcoding**: Static inspection confirms all calculations are dynamic math based on character dice pools and actual combat parameters. No facade functions or fixed return constants were added.

---

## 3. Caveats

- Benchmark mode rules were strictly enforced: zero pre-built solver dependencies, zero hardcoded test pass triggers.
- No source or test code was modified during this audit.

---

## 4. Conclusion

**Verdict: CLEAN**

All 9 remediated card & engine fixes in `server/game/engine.js` are authentic, genuine, and mathematically sound implementations. `tests/r2_m1_verification.js` assertions are genuine and pass empirically.

---

## 5. Verification Method

Run the verification test suites from the project root directory:

```bash
node tests/r2_m1_verification.js
node tests/challenger_r2_m1_stress.js
```

### Invalidation Conditions:
- `node tests/r2_m1_verification.js` exits with non-zero code or failed assertions.
- Hardcoded constant values found in `confirmDefense` or `applyInstantCardEffect`.
