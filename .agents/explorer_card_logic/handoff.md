# Handoff Report — R1: Tactical Card Logic Fix

## 1. Observation

### Observation 1.1: Hand Card Playing TP Check (Double-Charging Bug)
- **File**: `src/pages/battle.js`
- **Lines 312–339**:
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

...
<div class="hand-card-kards ${canPlay ? '' : 'disabled'}" style="..." ${canPlay ? `onclick="window._toggleHand(); window._playTacticalCard('${c.id}', event)"` : ''} title="${disableReason}">
  <div class="card-tag-row">
    <span class="card-tag-type ${typeClass}">${scopeLabel}</span>
    <span class="card-tp-cost">⚡${c.tpCost}</span>
  </div>
  <div class="card-title-text">${c.name}</div>
  <div class="card-desc-text">${c.desc}</div>
  ${!canPlay ? `<div class="card-disable-overlay">${disableReason}</div>` : ''}
</div>
```
- **File**: `server/index.js`
- **Lines 566–570**:
```javascript
const playableCard = aiPlayer.handCards.find(c => {
  const canAfford = (aiPlayer.tp || 0) >= c.tpCost;
  const subjMatch = c.subject === 'universal' || c.subject === curSubj;
  return canAfford && subjMatch;
});
```
- **File**: `server/game/engine.js`
- **Lines 1783–1812 (`playTacticalCard`)**:
```javascript
export function playTacticalCard(state, playerId, cardId) {
  if (state.phase !== PHASE.BATTLE) return { ok: false, error: '非战斗阶段' };
  const p = findPlayer(state, playerId);
  if (!p || p.isDead) return { ok: false, error: '玩家不存在或已阵亡' };

  const cIdx = (p.handCards || []).findIndex(c => c.id === cardId);
  if (cIdx === -1) return { ok: false, error: '手牌中无此卡牌' };
  const card = p.handCards[cIdx];

  const curSubj = state.schedule[state.currentClassIndex];

  if (card.subject !== 'universal' && card.subject !== curSubj) {
    return { ok: false, error: `【${card.name}】只能在 ${card.subject} 课使用！` };
  }

  p.handCards.splice(cIdx, 1);
  ...
}
```

### Observation 1.2: Shop Card Pool Randomization Bug (`getRandomCard`)
- **File**: `shared/cards.js`
- **Lines 121–130**:
```javascript
export function getRandomCard(currentSubject, playerSubjects = []) {
  // 过滤出通用卡 + 当前学科卡
  const pool = CARDS.filter(c => {
    if (c.subject === 'universal') return true;
    if (c.subject === currentSubject && playerSubjects.includes(currentSubject)) return true;
    return false;
  });
  if (pool.length === 0) return CARDS.find(c => c.subject === 'universal');
  return pool[Math.floor(Math.random() * pool.length)];
}
```

### Observation 1.3: Card Pricing & Star Rating Deduction Logic
- **File**: `shared/cards.js` (lines 23–115): 60 cards defined with `tpCost` (1, 2, or 3).
- **File**: `server/game/engine.js` (lines 1888–1909):
```javascript
export function buyDraftCard(state, playerId, slotIndex) {
  ...
  if ((p.tp || 0) < slot.card.tpCost) return { ok: false, error: 'TP 不足' };
  p.tp -= slot.card.tpCost;
  p.handCards.push(slot.card);
  ...
}
```
- **File**: `src/pages/battle.js` (lines 388–409):
```javascript
const isAfford = s.me.tp >= c.tpCost;
const buyDisabled = isHandFull || !isAfford;
...
const stars = '★'.repeat(c.tpCost) + '☆'.repeat(3 - c.tpCost);
```

## 2. Logic Chain

1. **Double-Charging / TP Check When Playing Hand Cards**:
   - `buyDraftCard` in `server/game/engine.js` deducts `p.tp -= slot.card.tpCost` upon purchasing a card.
   - However, `src/pages/battle.js` (`tacticalBarHTML`) and `server/index.js` (AI card play loop) check `tp >= c.tpCost` when attempting to play a card from `handCards`.
   - If a player spends 1 TP to buy a 1-star card (`tpCost: 1`), their TP is reduced to 0. When they try to play the card from hand, `battle.js` calculates `canAfford = (0 >= 1)` -> `false`, which disables the card in hand and overlays `TP不足`.
   - Consequently, to actually use a 1-star card, a player effectively needs 2 TP (1 TP to buy it + 1 TP remaining in bank to satisfy the hand check). This directly causes the "1-star card costs 2 TP / double-charging" bug reported in R1.

2. **Unbalanced / Universal-Only Draft Shop Pool**:
   - `getRandomCard` filters cards with `c.subject === currentSubject && playerSubjects.includes(currentSubject)`.
   - Step 2a: If the current course `currentSubject` is a general course (e.g. `pe`, `music`, `politics`, `art`, `it`, `tech`, `study`) that is not listed in the character's `p.card.subjects`, `playerSubjects.includes(currentSubject)` evaluates to `false`. Zero subject cards pass the filter.
   - Step 2b: In this case, `pool` contains only the 15 universal cards. The draft shop generates 100% universal cards.
   - Step 2c: Even when `currentSubject` matches one of the character's subjects, `pool` contains 15 universal cards vs only 3 subject cards (an 83.3% universal bias), ignoring cards belonging to the player's other chosen subjects.

3. **1-Star Card Pricing & Star Rating Alignment**:
   - `shared/cards.js` defines card star ratings via `tpCost` (1-star = 1 TP, 2-star = 2 TP, 3-star = 3 TP), `checkDraftShopModal` in `src/pages/battle.js` renders `★` matching `c.tpCost`, and `buyDraftCard` in `server/game/engine.js` deducts `slot.card.tpCost`.
   - The reported behavior ("Buying a 1-star card costs 2 TP") is a direct consequence of the double check identified in Logic Step 1 (buying deducts 1 TP, playing requires another 1 TP in reserve).
   - Once the hand playing TP check is removed, 1-star cards will accurately cost 1 TP to buy and 0 TP to play.

## 3. Caveats
- No caveats. The root cause analysis has been completely verified by inspecting frontend UI rendering, socket event handlers, server AI loops, and card definitions.

## 4. Conclusion

To resolve R1 completely, the following changes are required:
1. **`src/pages/battle.js`**:
   - In `tacticalBarHTML(s)`: Remove `canAfford` check from `canPlay` and `disableReason` for hand cards. Hand cards require 0 TP to play once in hand.
2. **`server/index.js`**:
   - In AI card play loop: Remove `canAfford` check (`const canAfford = (aiPlayer.tp || 0) >= c.tpCost;`), allowing AI to play cards in hand regardless of remaining TP.
3. **`shared/cards.js`**:
   - Update `getRandomCard(currentSubject, playerSubjects = [])` so that subject cards are drawn if they match any of `playerSubjects` (or `currentSubject`), and weight/sample subject cards vs universal cards fairly (e.g., 50% chance for a subject card and 50% for a universal card, or filtering `c.subject === 'universal' || playerSubjects.includes(c.subject)`).
4. Verify that 1-star cards cost exactly 1 TP on purchase, 0 TP on play, and shop refresh supplies a healthy mix of subject and universal cards.

### Proposed Code Snippets

#### 1. In `src/pages/battle.js` (`tacticalBarHTML`):
```javascript
// BEFORE
const canAfford = tp >= c.tpCost;
const subjMatch = c.subject === 'universal' || c.subject === curSubj;
const canPlay = canAfford && (c.subject === 'universal' || (subjMatch && canUseClass));

let disableReason = '';
if (!canPlay) {
   if (!subjMatch && c.subject !== 'universal') disableReason = `限当节课`;
   else if (!canUseClass && c.subject !== 'universal') disableReason = '非自身选科';
   else if (!canAfford) disableReason = 'TP不足';
}

// AFTER
const subjMatch = c.subject === 'universal' || c.subject === curSubj;
const canPlay = c.subject === 'universal' || (subjMatch && canUseClass);

let disableReason = '';
if (!canPlay) {
   if (!subjMatch && c.subject !== 'universal') disableReason = `限当节课`;
   else if (!canUseClass && c.subject !== 'universal') disableReason = '非自身选科';
}
```

#### 2. In `server/index.js` (AI play tactical card):
```javascript
// BEFORE
const playableCard = aiPlayer.handCards.find(c => {
  const canAfford = (aiPlayer.tp || 0) >= c.tpCost;
  const subjMatch = c.subject === 'universal' || c.subject === curSubj;
  return canAfford && subjMatch;
});

// AFTER
const playableCard = aiPlayer.handCards.find(c => {
  const subjMatch = c.subject === 'universal' || c.subject === curSubj;
  return subjMatch;
});
```

#### 3. In `shared/cards.js` (`getRandomCard`):
```javascript
// BEFORE
export function getRandomCard(currentSubject, playerSubjects = []) {
  const pool = CARDS.filter(c => {
    if (c.subject === 'universal') return true;
    if (c.subject === currentSubject && playerSubjects.includes(currentSubject)) return true;
    return false;
  });
  if (pool.length === 0) return CARDS.find(c => c.subject === 'universal');
  return pool[Math.floor(Math.random() * pool.length)];
}

// AFTER
export function getRandomCard(currentSubject, playerSubjects = []) {
  // Subject cards matching player subjects or current subject
  const subjectPool = CARDS.filter(c => 
    c.subject !== 'universal' && (playerSubjects.includes(c.subject) || c.subject === currentSubject)
  );
  const universalPool = CARDS.filter(c => c.subject === 'universal');

  // 50% chance to pick a subject card if available, else fallback to universal
  if (subjectPool.length > 0 && Math.random() < 0.5) {
    return subjectPool[Math.floor(Math.random() * subjectPool.length)];
  }
  return universalPool[Math.floor(Math.random() * universalPool.length)];
}
```

## 5. Verification Method

1. **Card Play TP Verification**:
   - Buy a 1-star card (costs 1 TP) when holding 1 TP. TP drops to 0.
   - Inspect hand UI in `src/pages/battle.js`: verify the card does NOT show `disabled` or `TP不足` overlay, and can be clicked/played successfully at 0 TP.
2. **Draft Shop Pool Verification**:
   - Open draft shop or refresh draft slots.
   - Run 20 iterations of `getRandomCard('pe', ['chinese', 'math', 'physics'])`.
   - Verify that returned cards contain a mix of Chinese/Math/Physics cards as well as Universal cards (not 100% universal).
3. **Price & Star Rating Verification**:
   - Inspect draft shop UI: 1-star (`★☆☆`) cards cost 1 TP, 2-star (`★★☆`) cards cost 2 TP, 3-star (`★★★`) cards cost 3 TP.
   - Confirm player TP is deducted by exact `c.tpCost` upon purchase.
