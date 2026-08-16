# Handoff Report: Review & Critic of Milestone R2-M1

**Agent**: `reviewer2_r2_m1`  
**Role**: reviewer, critic  
**Date**: 2026-08-07  
**Working Directory**: `E:/School+AI/school-dice-duel/.agents/reviewer2_r2_m1`  

---

## Verdict: REQUEST_CHANGES

---

## Review Summary

During independent review and stress-testing of Milestone R2-M1 (Persistent Logic Bug Extermination), multiple critical and major logic defects were identified in `server/game/engine.js`. Most notably:
1. **Critical Logic Flaw in Defense Recalculation**: In `confirmDefense`, cards like `card_chi_2` (语文-增益) and `card_chi_3` (语文-减益) modify `keptRolls`. However, lines 1128–1131 re-read original `defRolls[i]` into `finalKeptRolls` to compute `finalFinalDef` for damage calculation. As a result, defender's HP damage calculation completely ignores `card_chi_2` and `card_chi_3` when used in defense!
2. **Incomplete Card Implementation (`card_eng_1`)**: `card_eng_1` (英语-祝福) specifies `"重投次数上限+2，且重投不触发负面效果"`. However, `engine.js` only suppresses reroll penalties (line 435) and NEVER grants +2 rerolls.
3. **Flawed State Tracking for `card_his_2`**: `card_his_2` (历史-增益) specifies `"继承上一轮未使用的骰点作为附加输出"`. In `engine.js` line 486, `atk.unusedDiceSum` is overwritten with the *current* turn's unused dice during `confirmAttack`, rather than preserving the previous round's unused dice.
4. **Superficial Verification Test Coverage**: `tests/r2_m1_verification.js` only asserts that `playTacticalCard` returns `{ ok: true }` without checking if `confirmAttack` or `confirmDefense` actually process and apply the card effects to damage and state.

---

## 1. Observation

1. **`confirmDefense` Recalculation Bypass** (`server/game/engine.js`, lines 1036–1043 vs lines 1128–1139):
   - Line 1036: `card_chi_2` modifies `keptRolls[minIdx] = maxFace`.
   - Line 1057: `baseDef` is computed using `keptRolls`.
   - Line 1128: `const finalKeptRolls = keepIndices.map(i => defRolls[i]);` re-evaluates dice from `defRolls[i]` (unmodified).
   - Line 1130: `const finalBaseDef = finalAdjusted.reduce((s, v) => s + v, 0);`
   - Line 1131: `let finalFinalDef = Math.max(0, finalBaseDef - penalty);`
   - Line 1139: `damage = isPierce ? finalBaseAtk : Math.max(0, finalBaseAtk - finalFinalDef);`
   - **Programmatic Verification Result**: Running a test with `defRolls = [1, 1]` and `finalAtk = 10` showed:
     - With `card_chi_2`: `res.finalDef = 7`, `damage = 8` (10 - 2).
     - Without `card_chi_2`: `res.finalDef = 2`, `damage = 8` (10 - 2).
     - **Defenders lose 8 HP in both cases, completely ignoring the +5 defense boost from `card_chi_2`.**

2. **`card_eng_1` Missing Rerolls** (`server/game/engine.js`, line 435):
   - Definition in `shared/cards.js`: `desc: '当天英语课：重投次数上限+2，且重投不触发负面效果'`
   - Code inspection of `engine.js` reveals `card_eng_1` is only referenced on line 435 for suppressing `ROYAL_ETIQUETTE` self-damage. No code increments `p.rerolls` when `card_eng_1` is activated or during English class turns.

3. **`card_his_2` Incorrect Round Timing** (`server/game/engine.js`, line 486 vs 1884):
   - Definition in `shared/cards.js`: `desc: '本回合：继承上一轮未使用的骰点作为附加输出'`
   - Line 486: `atk.unusedDiceSum = atkRolls.filter((_, i) => !keepIndices.includes(i)).reduce((a, b) => a + b, 0);`
   - Line 1884: `case 'card_his_2': atkBonus += (atk.unusedDiceSum || 0); break;`
   - Because line 486 updates `atk.unusedDiceSum` during the current turn's `confirmAttack` before calculating damage, `card_his_2` uses the current turn's unused dice instead of the previous round's unused dice.

4. **Client UI `canPlay` Logic** (`src/pages/battle.js`, lines 312–313):
   - `const subjMatch = c.subject === 'universal' || c.subject === curSubj;`
   - `const canPlay = (c.subject === 'universal' || subjMatch) && (me.tp >= 0);`
   - Verified: Removes `canUseClass` restriction based on base character subjects, allowing draft shop cards to be played during matching class rounds with 0 TP cost from hand.

---

## 2. Logic Chain

1. In `server/game/engine.js`, `confirmDefense` contains two separate defense calculation passes:
   - Pass 1 (lines 1034–1074): Modifies `keptRolls` based on `card_chi_2` / `card_chi_3` and computes `baseDef` and `finalDef`.
   - Pass 2 (lines 1128–1131): Re-reads `defRolls` directly into `finalKeptRolls` to compute `finalBaseDef` and `finalFinalDef`.
   - Because `defRolls` is never modified during Pass 1, Pass 2 computes `finalFinalDef` using the raw initial dice values.
   - Line 1139 computes damage using `finalFinalDef`.
   - Therefore, any card modification targeting `keptRolls` in Pass 1 is silently discarded in Pass 2, rendering card defense effects ineffective in damage calculation.

2. In `shared/cards.js`, `card_eng_1` promises +2 reroll count limit in addition to immunity. By only implementing immunity in `engine.js` line 435 and neglecting the +2 rerolls, the card implementation is incomplete.

3. In `tests/r2_m1_verification.js`, Test 4 only verifies that `playTacticalCard` returns `{ ok: true }` when cards are played from hand. It does not run `confirmAttack` or `confirmDefense` to verify whether card handlers produce the correct numerical outcome in state.

---

## 3. Caveats

- `src/pages/battle.js` UI `canPlay` logic correctly allows cards to be played without TP restriction, and shop pricing parity is verified (1-star = 1 TP purchase, 0 TP hand play).
- Handlers for cards that directly modify simple properties (e.g. `card_phy_2` flat pierce, `card_gen_03` HP heal, `card_tec_3` charge stacks) function as expected when tested independently.

---

## 4. Conclusion

Milestone R2-M1 does NOT meet approval standards due to critical logic defects in `confirmDefense` card resolution (`card_chi_2`, `card_chi_3`) and incomplete card logic (`card_eng_1`, `card_his_2`).

**Verdict: REQUEST_CHANGES**

### Actionable Fix Instructions for Worker:
1. In `server/game/engine.js` (`confirmDefense`), update `defRolls` or synchronize `finalKeptRolls` with `keptRolls` so that `card_chi_2` and `card_chi_3` modifications carry over into `finalFinalDef` and damage calculation.
2. In `server/game/engine.js`, add `p.rerolls += 2` handling when `card_eng_1` is active in English class rounds (e.g., in `rollAttack` or `playTacticalCard`).
3. In `server/game/engine.js`, update `card_his_2` to preserve `unusedDiceSum` from the previous round (e.g., store `prevUnusedDiceSum` at sub-round/class transition instead of overwriting `unusedDiceSum` during the active attack).
4. Update `tests/r2_m1_verification.js` to include end-to-end combat resolution assertions (`confirmAttack` / `confirmDefense`) for card effects, rather than solely checking `playTacticalCard` return status.

---

## 5. Verification Method

To independently verify these findings:

1. **Defense Damage Recalculation Test**:
   ```bash
   node -e "
   import('./server/game/engine.js').then(engine => {
     import('./shared/characters.js').then(chars => {
       const charIds = Object.keys(chars.characterMap);
       const state = engine.createGame([{id: 'p1', nickname: 'P1'}, {id: 'p2', nickname: 'P2'}]);
       engine.selectCard(state, 'p1', 'char_3');
       engine.selectCard(state, 'p2', 'char_3');
       engine.setReady(state, 'p1');
       engine.setReady(state, 'p2');
       state.schedule[0] = 'chinese';
       const p1 = state.players[0], p2 = state.players[1];
       p2.handCards = [{ id: 'card_chi_2', name: '语文-增益', subject: 'chinese', type: 'buff', tpCost: 1, desc: '' }];
       engine.rollAttack(state);
       engine.confirmAttack(state, [0, 1]);
       engine.playTacticalCard(state, 'p2', 'card_chi_2');
       state.turnData.defenseRolls = [1, 1];
       state.turnData.atkResult.finalAtk = 10;
       const res = engine.confirmDefense(state, 'p2', [0, 1]);
       console.log('Damage taken:', res.damage, 'Expected damage taken with D6 max face boost: 3');
     });
   });
   "
   ```
   *Expected behavior after fix*: `res.damage` should equal `3` (10 - 7), not `8`.

2. **Integration Verification Command**:
   ```bash
   node tests/r2_m1_verification.js
   ```
