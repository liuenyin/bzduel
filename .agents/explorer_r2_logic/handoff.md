# Handoff Report: Round 2 Requirement R1 (Logic Bug Extermination)

**Agent**: `explorer_r2_logic`  
**Date**: 2026-08-07  
**Working Directory**: `E:/School+AI/school-dice-duel/.agents/explorer_r2_logic`  

---

## 1. Observation

### 1.1 Pricing & Star Rating Verification
- **`shared/cards.js`**: Total 60 cards defined (`card_chi_1` to `card_stu_3`, `card_gen_01` to `card_gen_15`). Each card has `tpCost` set to 1, 2, or 3. No separate `star` property exists on card objects.
- **`src/pages/battle.js` line 398**:  
  `const stars = '★'.repeat(c.tpCost) + '☆'.repeat(Math.max(0, 3 - c.tpCost));`  
  Star rendering strictly matches `c.tpCost` (1-star = 1 TP, 2-star = 2 TP, 3-star = 3 TP).
- **`server/game/engine.js` lines 1899-1900**:  
  `if ((p.tp || 0) < slot.card.tpCost) return { ok: false, error: 'TP 不足' };`  
  `p.tp -= slot.card.tpCost;`  
  Purchasing deducts the exact `tpCost` of the card.
- **`server/game/engine.js` line 1783**:  
  `playTacticalCard` requires 0 TP (does not check or deduct TP).

### 1.2 Unhandled Cards in Engine (26 / 60 Cards)
- Search for all 60 card IDs in `server/game/engine.js` revealed **26 cards are completely missing**:
  `card_chi_2`, `card_chi_3`, `card_mat_1`, `card_mat_3`, `card_eng_1`, `card_eng_3`, `card_phy_3`, `card_che_1`, `card_bio_2`, `card_his_2`, `card_his_3`, `card_geo_3`, `card_mus_3`, `card_art_1`, `card_art_2`, `card_art_3`, `card_it_1`, `card_it_3`, `card_tec_2`, `card_tec_3`, `card_pe_1`, `card_pe_3`, `card_stu_1`, `card_stu_2`, `card_gen_01`, `card_gen_13`.
- When played, these cards are consumed from `p.handCards` but exert **zero effect** on battle state (silent failure).

### 1.3 Card Effect Implementation Errors
- **`card_gen_14` (`server/game/engine.js` lines 1856-1859)**:  
  Card description in `shared/cards.js`: `"本轮如果防守无伤，获得 2 TP"`.  
  Code execution: `p.hp = Math.max(0, p.hp - 5); if (opp) opp.hp = Math.max(0, opp.hp - 5);` (deals 5 self-damage and 5 opponent damage).
- **Single `playedTurnCard` Slot (`server/game/engine.js` line 1806)**:  
  `p.playedTurnCard = card;` overwrites any previously played non-blessing card in the same turn.

### 1.4 Client UI Card Playability Block (`canUseClass`)
- **`src/pages/battle.js` lines 301, 313, 318**:  
  `const canUseClass = me.card?.subjects?.includes(curSubj);`  
  `const canPlay = c.subject === 'universal' || (subjMatch && canUseClass);`  
  Client blocks playing subject cards if `me.card.subjects` does not contain `curSubj`, showing overlay `非自身选科`.
- **`server/game/engine.js` line 1795**:  
  Only checks `card.subject !== 'universal' && card.subject !== curSubj`.
- **Conflict**: Client UI forbids playing valid subject cards purchased from draft shop during that class if the character's base subject choices do not include `curSubj`.

---

## 2. Logic Chain

1. **Pricing Consistency**:
   - `shared/cards.js` defines `tpCost` for all 60 cards.
   - `src/pages/battle.js` computes visual stars directly from `c.tpCost`.
   - `server/game/engine.js` deducts `c.tpCost` during `buyDraftCard`.
   - Therefore, pricing logic between UI stars, `tpCost`, and server deduction is parity-aligned.

2. **Card Play Failures**:
   - 26 cards lack any handler in `applyInstantCardEffect` or `calculateTurnEffects`.
   - When `playTacticalCard` is invoked, it removes the card from hand and updates state log, but engine state calculations ignore the card.
   - `card_gen_14` executes dummy self-harm code instead of conditional TP reward.
   - `playedTurnCard` assignment overwrites prior cards if multiple non-blessing cards are played in one turn.
   - Client UI enforces `canUseClass` on card play, blocking players from using subject-specific cards bought for current classes.

---

## 3. Caveats

- **No Source Modifications Made**: As an explorer role, all investigation was read-only. No source files outside `.agents/explorer_r2_logic` were modified.
- **Card Balance**: Some unhandled cards (e.g. `card_mat_1`, `card_eng_1`, `card_pe_1`) require extra turn state tracking (e.g. prime number detection, skip next turn, odd number count). Specific helper state variables will need to be added to `turnData` or `player` state by the implementer.

---

## 4. Conclusion

1. **Pricing**: Verified 1:1 match between star rating UI and `tpCost` deductions across `shared/cards.js`, `battle.js`, and `engine.js`.
2. **Card Playability**: Card playing suffers from:
   - 26 unhandled cards in `engine.js`.
   - Mismatched logic in `card_gen_14`.
   - Single-card overwrite bug on `playedTurnCard`.
   - Client UI falsely disabling subject card play via `canUseClass`.

---

## 5. Verification Method

### 5.1 Verification Script Command
Run the following node script to verify card definition parity and check engine handlers:
```bash
python -c "
import re
with open('shared/cards.js', 'r', encoding='utf-8') as f: cards = f.read()
with open('server/game/engine.js', 'r', encoding='utf-8') as f: engine = f.read()
card_ids = re.findall(r'id:\s*\'(card_[^\']+)\'', cards)
missing = [cid for cid in card_ids if cid not in engine]
print(f'Total cards: {len(card_ids)}, Missing in engine: {len(missing)}')
"
```
*Expected Result after Implementer Fix*: `Missing in engine: 0`.

### 5.2 Client Playability Check
Inspect `src/pages/battle.js` lines 301-318:
Confirm `canUseClass` is removed from `canPlay` condition so `canPlay = (c.subject === 'universal' || c.subject === curSubj)`.
