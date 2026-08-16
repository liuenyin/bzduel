# Handoff Report: Milestone R2-M1 Remediation

**Agent**: `worker_r2_m1_2`  
**Role**: implementer, qa, specialist  
**Date**: 2026-08-07  
**Working Directory**: `E:/School+AI/school-dice-duel/.agents/worker_r2_m1_2`  

---

## 1. Observation

1. **`confirmDefense` Defense Recalculation (`server/game/engine.js`)**:
   - Lines 1035–1052 modified `keptRolls` based on `card_chi_2` (+5 max face) and `card_chi_3` (-2 max face).
   - Line 1128 re-evaluated `finalKeptRolls = keepIndices.map(i => defRolls[i])`, discarding the changes in `keptRolls` and causing `finalFinalDef` and `damage` to ignore defense boost card modifications.
   - **Fix**: Synchronized `finalKeptRolls = keptRolls` in `confirmDefense` (both 1v1 and AoE modes) so card modifications properly carry over to damage and defender HP state.

2. **Missing `card_eng_1` +2 Rerolls (`server/game/engine.js`)**:
   - `shared/cards.js` defines `card_eng_1` as granting +2 max rerolls and reroll penalty immunity in English class.
   - `engine.js` previously only implemented immunity on line 435.
   - **Fix**: Added `p.rerolls += 2` in `playTacticalCard` when `card_eng_1` is activated in English class.

3. **`card_his_2` Round Timing (`server/game/engine.js`)**:
   - `card_his_2` specifies inheriting unused dice from the previous round as bonus output.
   - `confirmAttack` line 486 was overwriting `atk.unusedDiceSum` during the current turn before calculating `atkBonus`.
   - **Fix**: Added `p.prevUnusedDiceSum` persistence in `resolvePhaseEnd` and updated `calcTacticalCardEffects` for `card_his_2` to inherit `atk.prevUnusedDiceSum`.

4. **`card_it_1` Blessing Execution (`server/game/engine.js`)**:
   - `card_it_1` is a blessing type card. `playTacticalCard` added blessings to `activeBlessings` and skipped `applyInstantCardEffect`.
   - Code placed in `applyInstantCardEffect` for `card_it_1` was dead code.
   - **Fix**: Moved `card_it_1` skill/dice copy execution directly into `playTacticalCard` under the `CARD_TYPE.BLESSING` handler branch.

5. **`card_bio_3` Opponent Damage (`server/game/engine.js`)**:
   - `card_bio_3` required 30% self-HP cost and equal real damage to opponent. `applyInstantCardEffect` deducted 30% from `p.hp` but omitted `opp.hp`.
   - **Fix**: Added `opp.hp = Math.max(0, opp.hp - realDmg)` in `applyInstantCardEffect`.

6. **`card_gen_15` Attack Damage Condition (`server/game/engine.js`)**:
   - `card_gen_15` specifies drawing 1 card if an attack dealt damage to opponent. It previously drew a card instantly on play.
   - **Fix**: Removed instant draw from `applyInstantCardEffect` and added conditional card draw inside `confirmDefense` when `damage > 0`.

7. **`playedTurnCards` Turn State Leak (`server/game/engine.js`)**:
   - `playedTurnCards` was previously reset only at class end (`currentSubRound >= SUBROUNDS_PER_CLASS`), causing single-turn card effects to linger into subsequent sub-rounds.
   - **Fix**: Updated `resolvePhaseEnd` to reset `playedTurnCard = null` and `playedTurnCards = []` at every sub-round turn resolution.

8. **`card_gen_14` AoE Mode Support (`server/game/engine.js`)**:
   - `card_gen_14` (+2 TP on 0 defense damage) was only present in 1v1 defense handling.
   - **Fix**: Added `card_gen_14` +2 TP gain check in the per-target AoE defense loop in `confirmDefense`.

9. **Verification Test Suite Hardening (`tests/r2_m1_verification.js`)**:
   - Upgraded test suite to assert end-to-end combat damage, defense values, HP state, TP gains, card draw triggers, and blessing effects.
   - Execution result: `node tests/r2_m1_verification.js` -> `=== Verification Complete: 57 PASSED, 0 FAILED ===`.

---

## 2. Logic Chain

1. In `confirmDefense`, damage calculation relied on `finalFinalDef`, which was derived from `finalKeptRolls`. Because `finalKeptRolls` previously re-read raw `defRolls[i]`, modifications made to `keptRolls` by `card_chi_2` and `card_chi_3` were bypassed. Synchronizing `finalKeptRolls = keptRolls` guarantees that card modifications directly alter `finalFinalDef` and `damage`.
2. By persisting `prevUnusedDiceSum` during turn resolution in `resolvePhaseEnd`, `card_his_2` accurately reads the dice sum left unused in the preceding round instead of current turn's dice.
3. Placing `card_it_1` logic inside `playTacticalCard` for blessings ensures it executes upon card play, copying the target's positive skill and dice pool without relying on unreachable `applyInstantCardEffect` branches.
4. Adding opponent damage to `card_bio_3`, delaying `card_gen_15` draw until `damage > 0` in combat, and clearing `playedTurnCards` every sub-round eliminates state leaks and satisfies all card contracts.

---

## 3. Caveats

No caveats. All 9 remediation tasks specified by Reviewer 1 and Reviewer 2 were fully implemented in `server/game/engine.js` and verified with 57 passing end-to-end assertions in `tests/r2_m1_verification.js`.

---

## 4. Conclusion

Milestone R2-M1 remediation is complete. All persistent logic bugs in combat recalculation, card timing, blessing execution, turn lifecycle, and state propagation have been resolved with genuine logic and verified programmatically.

---

## 5. Verification Method

Run the verification test suite from the project root directory:

```bash
node tests/r2_m1_verification.js
```

### Invalidation Conditions:
- `node tests/r2_m1_verification.js` exits with non-zero exit code or any failed assertion.
- Defender playing `card_chi_2` with `[1, 1]` rolls does not receive max face defense boost in `confirmDefense`.
- `card_bio_3` does not deduct equal real damage from `opp.hp`.
- `card_gen_15` draws a card immediately when played rather than after dealing damage > 0 in combat.
