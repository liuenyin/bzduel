## 2026-08-07T14:38:00Z

You are worker_r2_m1. Your working directory is E:/School+AI/school-dice-duel/.agents/worker_r2_m1.
Read ORIGINAL_REQUEST.md at E:/School+AI/school-dice-duel/.agents/ORIGINAL_REQUEST.md and exploration report at E:/School+AI/school-dice-duel/.agents/explorer_r2_logic/analysis.md (and handoff.md).

Your Mission: Execute Milestone R2-M1 (Persistent Logic Bug Extermination).
Files to modify exclusively:
- server/game/engine.js
- src/pages/battle.js

Detailed Implementation Steps:
1. 26 Unhandled Cards in server/game/engine.js:
   Add effect handling in engine.js for all 26 missing cards: card_chi_2, card_chi_3, card_mat_1, card_mat_3, card_eng_1, card_eng_3, card_phy_3, card_che_1, card_bio_2, card_his_2, card_his_3, card_geo_3, card_mus_3, card_art_1, card_art_2, card_art_3, card_it_1, card_it_3, card_tec_2, card_tec_3, card_pe_1, card_pe_3, card_stu_1, card_stu_2, card_gen_01, card_gen_13.
   Refer to shared/cards.js card descriptions for each card's intended effect and implement the exact game state modification (HP changes, TP changes, dice roll bonuses, status effects, etc.).
2. Fix card_gen_14 logic:
   In server/game/engine.js, replace the self-damage/opp-damage logic for card_gen_14 with granting 2 TP if defense damage taken is 0.
3. Multi-card play support:
   In server/game/engine.js, ensure playing multiple cards in a turn processes all played cards properly instead of letting a single playedTurnCard field overwrite previous played cards.
4. Client UI card playability block:
   In src/pages/battle.js, update canPlay calculation to remove the canUseClass block (so canPlay = (c.subject === 'universal' || c.subject === curSubj) && (me.tp >= 0)). Subject cards purchased from the shop MUST be playable during matching class regardless of character base subjects.
5. Verify Pricing Parity:
   Ensure buying 1-star cards deducts exactly 1 TP and playing cards from hand requires 0 TP.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Run node verification to test syntax and logic. Write changes.md and handoff.md in your working directory. Report back via send_message when complete.
