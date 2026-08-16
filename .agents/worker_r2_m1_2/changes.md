# Changes Report — Milestone R2-M1 Remediation

## Summary of Changes

### 1. `server/game/engine.js`
- **Fixed `confirmDefense` Recalculation Bypass (CRITICAL)**:
  - Updated `finalKeptRolls` calculation in `confirmDefense` (both 1v1 and AoE modes) to synchronize with `keptRolls` which contains active card modifications from `card_chi_2` (+5 max face) and `card_chi_3` (-2 max face).
  - Ensured `finalBaseDef`, `finalFinalDef`, and resulting damage calculation accurately incorporate defense alterations made by tactical cards.
- **Fixed `card_eng_1` Missing Rerolls**:
  - Added `p.rerolls += 2` handling in `playTacticalCard` when `card_eng_1` (英语-祝福) is activated during English class.
- **Fixed `card_his_2` Round Timing**:
  - Implemented `prevUnusedDiceSum` state tracking across turn resolutions (`resolvePhaseEnd`).
  - Updated `card_his_2` (历史-增益) handler in `calcTacticalCardEffects` to inherit `atk.prevUnusedDiceSum` from the previous round rather than overwriting it during the active turn's `confirmAttack`.
- **Fixed `card_it_1` Blessing Execution**:
  - Moved `card_it_1` (信息-祝福) handling to the `CARD_TYPE.BLESSING` execution branch in `playTacticalCard`, allowing it to copy opponent positive skills and dice pool when played during IT class.
- **Fixed `card_bio_3` Opponent Real Damage**:
  - Updated `card_bio_3` (生物-其他) in `applyInstantCardEffect` to deduct up to 10 HP equal real damage from the opponent (`opp.hp`) in addition to taking 30% self-HP cost.
- **Fixed `card_gen_15` Combat Damage Requirement**:
  - Removed instant card draw from `card_gen_15` when played.
  - Implemented combat damage check in `confirmDefense` (1v1 and AoE modes) to grant 1 card draw only when attack deals damage (`damage > 0`).
- **Fixed `playedTurnCards` Turn State Leak**:
  - Updated `resolvePhaseEnd` to reset `playedTurnCard = null` and `playedTurnCards = []` at every sub-round turn resolution, preventing single-turn card effects from persisting into subsequent turns.
- **Fixed `card_gen_14` FFA/AoE Support**:
  - Added `card_gen_14` (+2 TP on 0 defense damage) handler to the per-target defense resolution loop in AoE/FFA mode.

### 2. `tests/r2_m1_verification.js`
- **Hardened Test Suite with End-to-End Combat Resolution**:
  - **Test 1**: Verified pricing parity (1-star card costs 1 TP to buy, 0 TP to play from hand).
  - **Test 2**: Asserted `card_chi_2` defense recalculation and HP damage reduction during `confirmDefense`.
  - **Test 3**: Asserted `card_chi_3` max roll penalty on defender in `confirmDefense`.
  - **Test 4**: Asserted `card_eng_1` +2 rerolls boost upon activation in English class.
  - **Test 5**: Asserted `card_his_2` inheritance of previous round unused dice sum as bonus damage.
  - **Test 6**: Asserted `card_it_1` copying opponent positive skill upon blessing activation.
  - **Test 7**: Asserted `card_bio_3` self-HP cost and equal opponent real damage.
  - **Test 8**: Asserted `card_gen_14` +2 TP gain on 0 damage taken in defense.
  - **Test 9**: Asserted `card_gen_15` delayed card draw only triggering when damage > 0 in combat.
  - **Test 10**: Asserted `playedTurnCards` lifecycle reset across sub-round turn transitions.
  - **Test 11**: Verified all 26 tactical cards play cleanly without runtime errors.
