# Technical Analysis: Round 2 Requirement R1 (Persistent Logic Bug Extermination)

**Author**: `explorer_r2_logic`  
**Date**: 2026-08-07  
**Scope**: Tactical Card Pricing Verification & Card Play Validation (`shared/cards.js`, `server/game/engine.js`, `server/index.js`, `src/pages/battle.js`)

---

## Executive Summary

An exhaustive audit of the School Dice Duel card system and play pipeline revealed critical issues in card play resolution:
1. **Pricing Parity**: All 60 card definitions in `shared/cards.js` define `tpCost` (1, 2, or 3) matching their star rating (rendered dynamically in UI as `★` count). Server `buyDraftCard` correctly checks `p.tp >= slot.card.tpCost` and deducts `slot.card.tpCost`. `playTacticalCard` requires 0 TP.
2. **Silent Card Execution Failures**: **26 out of 60 cards** defined in `shared/cards.js` are **completely unhandled** in `server/game/engine.js`. Playing these cards consumes them from hand but applies zero effect to the game state.
3. **Card Effect Implementation Bug**: `card_gen_14` (which should grant 2 TP if taking 0 damage when defending) is incorrectly implemented as deducting 5 HP from both players.
4. **Client UI Playability Blocking (`canUseClass`)**: `src/pages/battle.js` incorrectly blocks subject-specific card play if `me.card.subjects` does not contain `curSubj`, labeling cards as `非自身选科`. However, server `engine.js` allows playing any subject card during its corresponding scheduled class regardless of player character subjects. This prevents players from using subject cards purchased during draft shop phases.
5. **Turn Card Overwrite**: `p.playedTurnCard` holds only a single object. Playing multiple non-blessing cards in one turn causes subsequent cards to overwrite previous card effects.

---

## 1. Pricing Logic Verification Audit

### 1.1 Card Definitions Audit (`shared/cards.js`)
- Total card definitions: **60** (45 Subject Cards = 15 subjects × 3 cards + 15 Universal Cards `card_gen_01` .. `card_gen_15`).
- Structure: Each card object contains `{ id, name, subject, type, tpCost, desc }`.
- `tpCost` values across all 60 cards:
  - **1 TP (1-star)**: 33 cards (e.g. `card_chi_2`, `card_mat_2`, `card_eng_2`, `card_gen_01`, `card_gen_02`, etc.)
  - **2 TP (2-stars)**: 20 cards (e.g. `card_chi_1`, `card_chi_3`, `card_phy_2`, `card_gen_03`, `card_gen_04`, `card_gen_05`, etc.)
  - **3 TP (3-stars)**: 7 cards (e.g. `card_mat_1`, `card_bio_3`, `card_his_3`, `card_geo_1`, `card_pe_1`)
- UI Star Rendering (`src/pages/battle.js` line 398):  
  `const stars = '★'.repeat(c.tpCost) + '☆'.repeat(Math.max(0, 3 - c.tpCost));`  
  This ensures 100% visual parity between rendered stars and `tpCost`.

### 1.2 Draft Shop Purchase & Deductions (`server/game/engine.js`)
- In `buyDraftCard(state, playerId, slotIndex)` (lines 1888-1909):
  - Check: `if ((p.tp || 0) < slot.card.tpCost) return { ok: false, error: 'TP 不足' };`
  - Deduction: `p.tp -= slot.card.tpCost;`
  - Addition to hand: `p.handCards.push(slot.card);`
- In `playTacticalCard(state, playerId, cardId)` (lines 1783-1812):
  - No TP check or deduction occurs when playing cards from hand (0 TP requirement).
- In `refreshDraftSlot`: Slot card is replaced using `getRandomCard(...)`, leaving `refreshesLeft` decremented.

---

## 2. Card Play Validation Audit

### 2.1 Complete Audit of Unhandled Cards (26 / 60 Cards)

The following 26 cards exist in `shared/cards.js` but have **no effect logic implemented** in `server/game/engine.js`:

| Card ID | Card Name | Subject | Type | tpCost | Defined Description | Impact / Status in Engine |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `card_chi_2` | 语文-增益 | chinese | BUFF | 1 | 本回合：选中的点数最小骰子自动变为最大面值 | Unhandled (Silent Fail) |
| `card_chi_3` | 语文-减益 | chinese | DEBUFF | 2 | 本回合：对方投出点数最大的骰子强制变为 2 点 | Unhandled (Silent Fail) |
| `card_mat_1` | 数学-祝福 | math | BLESSING | 3 | 当天数学课：若选中的数字全为质数，跳过对方下一个攻击回合(每节课限1次) | Unhandled (Silent Fail) |
| `card_mat_3` | 数学-减益 | math | DEBUFF | 2 | 本回合：对方无法重投，我方攻击无视对方减伤 | Unhandled (Silent Fail) |
| `card_eng_1` | 英语-祝福 | english | BLESSING | 2 | 当天英语课：重投次数上限+2，且重投不触发负面效果 | Unhandled (Silent Fail) |
| `card_eng_3` | 英语-其他 | english | OTHER | 1 | 本回合：重置当前投出我方与对方的所有骰子 | Unhandled (Silent Fail) |
| `card_phy_3` | 物理-减益 | physics | DEBUFF | 1 | 本回合：使对方防御力临时削减 30% | Unhandled (Silent Fail) |
| `card_che_1` | 化学-祝福 | chemistry | BLESSING | 2 | 当天化学课：给对方造成伤害时，额外叠加 3 层红温 | Unhandled (Silent Fail) |
| `card_bio_2` | 生物-增益 | biology | BUFF | 1 | 本回合：防守溢出数值×1.5转化为生命回复 | Unhandled (Silent Fail) |
| `card_his_2` | 历史-增益 | history | BUFF | 1 | 本回合：继承上一轮未使用的骰点作为附加输出 | Unhandled (Silent Fail) |
| `card_his_3` | 历史-其他 | history | OTHER | 3 | 本回合：恢复生命差值至上一轮状态(最高10点) | Unhandled (Silent Fail) |
| `card_geo_3` | 地理-减益 | geography | DEBUFF | 1 | 本回合：对方所有骰子面数临时-2(最低减少至4) | Unhandled (Silent Fail) |
| `card_mus_3` | 音乐-其他 | music | OTHER | 1 | 本回合：将随机一颗骰子强制替换为 D8 | Unhandled (Silent Fail) |
| `card_art_1` | 美术-祝福 | art | BLESSING | 1 | 当天美术课：选骰槽位+1 | Unhandled (Silent Fail) |
| `card_art_2` | 美术-增益 | art | BUFF | 1 | 本回合：复制对方上一轮投出的最大骰点 | Unhandled (Silent Fail) |
| `card_art_3` | 美术-减益 | art | DEBUFF | 1 | 本回合：隐藏自身投掷的点数 1 轮 | Unhandled (Silent Fail) |
| `card_it_1` | 信息-祝福 | it | BLESSING | 2 | 当天信息课：选择复制对方的正面技能 1 节课 | Unhandled (Silent Fail) |
| `card_it_3` | 信息-其他 | it | OTHER | 1 | 本回合：攻击造成伤害-5，无视对方防御 | Unhandled (Silent Fail) |
| `card_tec_2` | 通技-增益 | tech | BUFF | 1 | 本回合：最小面数骰子+2 | Unhandled (Silent Fail) |
| `card_tec_3` | 通技-其他 | tech | OTHER | 1 | 本回合：获得 1 层蓄势 | Unhandled (Silent Fail) |
| `card_pe_1` | 体育-祝福 | pe | BLESSING | 3 | 当天体育课：选中至少三个奇数时得额外攻击回合(限1次) | Unhandled (Silent Fail) |
| `card_pe_3` | 体育-减益 | pe | DEBUFF | 1 | 本回合：对方永久防御力-2 | Unhandled (Silent Fail) |
| `card_stu_1` | 自习-祝福 | study | BLESSING | 1 | 当天自习课：攻击回合结束后随机获得 1 张战术卡 | Unhandled (Silent Fail) |
| `card_stu_2` | 自习-增益 | study | BUFF | 1 | 本回合：无视自己的负面技能 | Unhandled (Silent Fail) |
| `card_gen_01` | 通用-增益 | universal | BUFF | 1 | 强行重投指定 1 颗骰子(可指定敌我) | Unhandled (Silent Fail) |
| `card_gen_13` | 通用-其他 | universal | OTHER | 2 | 将本节课选骰槽位临时+1 | Unhandled (Silent Fail) |

---

### 2.2 Implemented Card Audit & Discrepancies

For the remaining 34 cards, the following code bugs were identified:

1. **`card_gen_14` Severe Logic Error**:
   - `shared/cards.js`: `{ id: 'card_gen_14', desc: '本轮如果防守无伤，获得 2 TP' }`
   - `server/game/engine.js` line 1856:
     ```javascript
     case 'card_gen_14':
       p.hp = Math.max(0, p.hp - 5);
       if (opp) opp.hp = Math.max(0, opp.hp - 5);
       break;
     ```
   - **Issue**: Instead of checking zero damage on defense to grant 2 TP, playing `card_gen_14` immediately deals 5 self-damage and 5 damage to opponent.
2. **`card_gen_15` Delayed Condition Ignored**:
   - `shared/cards.js`: `{ id: 'card_gen_15', desc: '本轮如果攻击造成伤害，抽 1 张学科战术卡' }`
   - `server/game/engine.js`: Immediately draws a card in `applyInstantCardEffect` instead of checking damage delivery after combat turn resolution.
3. **Single `playedTurnCard` Limitation**:
   - In `engine.js` line 1806: `p.playedTurnCard = card;`
   - If a player plays two non-blessing turn cards in the same phase, the second card overwrites `p.playedTurnCard`, causing the first card's buff/debuff to be lost in `calculateTurnEffects`. It should be stored in an array (e.g. `p.playedTurnCards = []`).

---

### 2.3 Client vs. Server Subject Restriction Discrepancy

- **Server Logic** (`server/game/engine.js` line 1795):
  ```javascript
  if (card.subject !== 'universal' && card.subject !== curSubj) {
    return { ok: false, error: `【${card.name}】只能在 ${card.subject} 课使用！` };
  }
  ```
  The server allows playing subject cards whenever `card.subject === curSubj` or `card.subject === 'universal'`.
- **Client Logic** (`src/pages/battle.js` lines 301, 313, 318):
  ```javascript
  const canUseClass = me.card?.subjects?.includes(curSubj);
  const subjMatch = c.subject === 'universal' || c.subject === curSubj;
  const canPlay = c.subject === 'universal' || (subjMatch && canUseClass);
  ```
  The client additionally checks `canUseClass` (whether the player's character natively has `curSubj` as a subject). If `canUseClass` is false, `canPlay` is evaluated to `false`, rendering a `非自身选科` overlay and disabling the `onclick` handler.
- **Impact**: Any character playing a scheduled class outside their character's initial major subjects cannot play subject-specific cards bought for that class during the draft shop phase.
- **Fix Required**: Remove the `canUseClass` condition for playing cards in `src/pages/battle.js` and `server/index.js`. Card playability depends only on `c.subject === 'universal' || c.subject === curSubj`.

---

## 3. Recommended Technical Solutions

### Proposal 1: Client Card Playability Fix (`src/pages/battle.js` & `server/index.js`)
Update `src/pages/battle.js`:
```javascript
const subjMatch = c.subject === 'universal' || c.subject === curSubj;
const canPlay = subjMatch;
```
Remove `canUseClass` check and update `disableReason` to simply reflect `!subjMatch ? '限当节课' : ''`.

### Proposal 2: Multiple Turn Cards Support (`server/game/engine.js`)
Change `p.playedTurnCard` to `p.playedTurnCards = []`.
In `playTacticalCard`:
```javascript
if (card.type === CARD_TYPE.BLESSING) {
  if (!p.activeBlessings) p.activeBlessings = [];
  p.activeBlessings.push(card);
} else {
  if (!p.playedTurnCards) p.playedTurnCards = [];
  p.playedTurnCards.push(card);
  applyInstantCardEffect(state, p, card);
}
```

### Proposal 3: Full Implementation of Unhandled Cards in `server/game/engine.js`
1. Extend `applyInstantCardEffect(state, p, card)` for instant card triggers (`card_chi_2`, `card_eng_3`, `card_mus_3`, `card_gen_01`, `card_gen_13`, `card_tec_3`, etc.).
2. Extend `calculateTurnEffects(state)` / turn resolution hooks for conditional and turn-based card effects (`card_mat_1`, `card_phy_3`, `card_bio_2`, `card_his_2`, `card_geo_3`, `card_pe_1`, `card_stu_1`, `card_stu_2`, `card_gen_14`, `card_gen_15`).
3. Fix `card_gen_14` to grant 2 TP at turn end if defender suffered 0 damage.

---

## 4. Summary of Verification Items for Implementer

1. Run `node -e "..."` or Jest/Playwright tests to verify 1-star card purchases strictly cost 1 TP and leave player with `p.tp - 1`.
2. Verify all 60 cards resolve in `server/game/engine.js` without silent failure or errors.
3. Test card play in client UI when character subject does not match scheduled class subject.
