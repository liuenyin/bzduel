# Summary of Code Changes — Milestone R2-M1

## Files Modified
1. `server/game/engine.js`
   - **Implemented 26 Unhandled Cards**: Added full game state effect logic for `card_chi_2`, `card_chi_3`, `card_mat_1`, `card_mat_3`, `card_eng_1`, `card_eng_3`, `card_phy_3`, `card_che_1`, `card_bio_2`, `card_his_2`, `card_his_3`, `card_geo_3`, `card_mus_3`, `card_art_1`, `card_art_2`, `card_art_3`, `card_it_1`, `card_it_3`, `card_tec_2`, `card_tec_3`, `card_pe_1`, `card_pe_3`, `card_stu_1`, `card_stu_2`, `card_gen_01`, `card_gen_13`.
   - **Fixed `card_gen_14` Logic**: Removed legacy `5 self-damage / 5 opp-damage` effect from `applyInstantCardEffect`. Implemented "+2 TP if defense damage taken is 0" in `confirmDefense`.
   - **Multi-Card Play Support**: Added `playedTurnCards: []` array to player state. `playTacticalCard` pushes all played cards to `playedTurnCards`. Updated `calcTacticalCardEffects`, `getRollingPool`, `rerollDice`, `confirmAttack`, `confirmDefense`, `getStateView`, and `resolvePhaseEnd` to evaluate all played cards during the turn without overwriting previous card effects.
   - **Player State & Dice Tracking**: Added state tracking fields `unusedDiceSum`, `hpLastRound`, `lastMaxRoll`, `tempSlotBonus`, `stealthActive` for cards requiring historical round data or slot bonuses.

2. `src/pages/battle.js`
   - **Removed Client `canUseClass` Block**: Updated `canPlay` calculation to `(c.subject === 'universal' || c.subject === curSubj) && (me.tp >= 0)`. Subject-specific cards bought from draft shop can now be played during their respective classes regardless of character base subject choices.

3. `tests/r2_m1_verification.js`
   - **Created Automated Test Suite**: Built integration tests covering pricing parity (1-star = 1 TP, hand play = 0 TP), `card_gen_14` TP reward, multi-card play tracking, and execution of all 26 previously unhandled cards.

---

## Verification Results
- `node tests/r2_m1_verification.js`: Executed 37 test assertions across pricing, card_gen_14, multi-card play, and all 26 card handlers — **37 PASSED, 0 FAILED**.
