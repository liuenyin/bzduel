# Handoff Report — R2: Tactical Card UI/UX Overhaul Investigation

## 1. Observation

### Key Code References
- **`src/pages/battle.js` (Lines 307–340)**: HTML structure for `.hand-card-kards` in `tacticalBarHTML()`:
  ```javascript
  return `
    <div class="hand-card-kards ${canPlay ? '' : 'disabled'}" style="transform: rotate(${rotateDeg}deg) translateY(${transY}px)" ${canPlay ? `onclick="window._toggleHand(); window._playTacticalCard('${c.id}', event)"` : ''} title="${disableReason}">
      <div class="card-tag-row">
        <span class="card-tag-type ${typeClass}">${scopeLabel}</span>
        <span class="card-tp-cost">⚡${c.tpCost}</span>
      </div>
      <div class="card-title-text">${c.name}</div>
      <div class="card-desc-text">${c.desc}</div>
      ${!canPlay ? `<div class="card-disable-overlay">${disableReason}</div>` : ''}
    </div>
  `;
  ```
- **`src/pages/battle.js` (Lines 387–411)**: HTML structure for `.draft-slot-card` in `checkDraftShopModal()`:
  ```javascript
  return `
    <div class="draft-slot-card ${buyDisabled ? 'disabled' : 'clickable'}" ${buyDisabled ? '' : `onclick="window._buyDraftCard(${idx})"`}>
      <button class="btn-icon-refresh" ${slot.refreshesLeft > 0 ? '' : 'disabled'} onclick="event.stopPropagation(); window._refreshDraftSlot(${idx})" title="刷新 (${slot.refreshesLeft})">↻</button>
      <div class="draft-card-star">${stars}</div>
      <div style="font-size:0.95rem; font-weight:800; color:var(--text-main); margin-top:8px;">${c.name}</div>
      <div style="font-size:0.75rem; color:var(--text-secondary); line-height:1.3; min-height:40px; margin-top:6px;">${c.desc}</div>
      ${buyDisabled ? `<div class="card-disable-overlay">${disableReason}</div>` : ''}
    </div>
  `;
  ```
- **`src/style/index.css` (Lines 1316–1336)**: Hand card styling rules:
  ```css
  .hand-card-kards {
    position: absolute; bottom: 0; left: 50%;
    margin-left: -65px; /* center align */
    width: 130px; height: 180px;
    background: var(--bg-card); border-radius: 8px;
    border: 1px solid var(--bg-inset);
    padding: 8px; box-shadow: -2px -2px 10px rgba(0,0,0,0.3);
    transform-origin: bottom center;
    transition: 0.2s; cursor: pointer;
    overflow: hidden;
  }
  .hand-card-kards.disabled { opacity: 0.5; filter: grayscale(1); cursor: not-allowed; }
  .hand-card-kards:hover:not(.disabled) {
     transform: rotate(0deg) translateY(-20px) scale(1.1) !important;
  }
  ```
- **`src/style/index.css` (Lines 1131–1142)**: Tactical card elements styling rules:
  ```css
  .card-tag-row{display:flex;align-items:center;justify-content:space-between;font-size:.65rem;font-weight:800}
  .card-tag-type{padding:1px 5px;border-radius:4px;line-height:1.2}
  .card-tag-type.blessing{background:rgba(106,158,109,.15);color:var(--green);border:1px solid rgba(106,158,109,.3)}
  .card-tag-type.buff{background:rgba(91,143,185,.15);color:var(--blue);border:1px solid rgba(91,143,185,.3)}
  .card-tag-type.debuff{background:rgba(196,92,92,.15);color:var(--red);border:1px solid rgba(196,92,92,.3)}
  .card-tag-type.other{background:rgba(183,110,121,.15);color:var(--rose-gold);border:1px solid rgba(183,110,121,.3)}
  .card-tp-cost{color:var(--gold);font-weight:900}
  .card-title-text{font-size:.78rem;font-weight:800;color:var(--text);line-height:1.2}
  .card-desc-text{font-size:.65rem;color:var(--text-secondary);line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  ```
- **`src/style/index.css` (Lines 1248–1260)**: Draft slot card rules:
  ```css
  .draft-slot-card {
    width: 150px; background: var(--bg-card);
    border: 2px solid transparent; border-radius: 12px;
    padding: 10px; cursor: pointer; transition: 0.2s;
    position: relative; overflow: hidden;
  }
  .draft-slot-card.disabled {
    opacity: 0.6; cursor: not-allowed;
  }
  ```
- **Python AST / CSS Verification Command**:
  Executed `python -c "with open('src/style/index.css', 'r', encoding='utf-8') as f: print('card-disable-overlay in CSS:', 'card-disable-overlay' in f.read())"` which returned `False`.

---

## 2. Logic Chain

1. **Root Cause of "TP不足" Overlay Spilling & Layout Breaking**:
   - `src/pages/battle.js` renders `<div class="card-disable-overlay">${disableReason}</div>` inside both `.hand-card-kards` and `.draft-slot-card` when a card cannot be played or bought.
   - However, `.card-disable-overlay` **does not exist anywhere in `src/style/index.css`**.
   - As an unstyled element, the browser defaults it to `display: block` inside normal document flow at the bottom of the card container.
   - In `.hand-card-kards` (fixed size `130px × 180px` / `110px × 155px`), it pushes text up or spills out of the bottom boundary. Because of `overflow: hidden`, text gets clipped or collides with `.card-desc-text`.
   - Furthermore, `.hand-card-kards.disabled` applies `opacity: 0.5; filter: grayscale(1);` to the whole card, rendering both the card content and the overlay text in low-contrast gray, degrading legibility and aesthetic polish.

2. **Causes of Text Overlapping & Element Misalignment**:
   - **Undefined CSS Variable**: In `src/pages/battle.js` line 405, `<div style="... color:var(--text-main);">` uses `--text-main`. In `src/style/index.css` `:root`, `--text-main` is undefined (only `--text`, `--text-secondary`, `--text-muted` exist), causing fallback color behavior.
   - **Line Clamping & Padding Issues**: `.card-desc-text` relies on `-webkit-line-clamp: 2`, but cards with long descriptions (e.g. 50+ characters in `shared/cards.js`) run out of vertical space within fixed-height containers when combined with margins and title text.
   - **Jittery Hover Snapping in KARDS Fan**: Hovering over a card in `.hand-card-kards` applies `transform: rotate(0deg) translateY(-20px) scale(1.1) !important;`. Forcing `rotate(0deg)` on a card rendered with inline `rotate(-15deg)` or `rotate(15deg)` creates a violent rotation snap from its `bottom center` origin, causing cards to overlap neighboring cards awkwardly.
   - **Draft Shop Layout Inconsistencies**: Inline styles in `battle.js` (`margin-top:8px; margin-top:6px; min-height:40px; font-size:0.95rem`) bypass CSS class definitions and cause alignment mismatches between cards with 1-line vs 3-line descriptions. Refresh button (`.btn-icon-refresh`) lacks proper positioning margins relative to card titles.

3. **Synthesis against Premium Light/Fresh Game UI Standards (`premium-game-ui-vfx`)**:
   - The current tactical hand and draft shop UI relies on raw emoji characters (`⚡`, `🃏`, `↻`, `★`, `☆`) and flat gray overlays.
   - Implementing a premium game aesthetic requires subtle glassmorphism (`backdrop-filter: blur()`), light ambient shadows, spring-physics micro-interactions (`cubic-bezier`), clear typography hierarchy, and a non-blocking overlay design.

---

## 3. Caveats

- **Read-Only Scope**: This report provides analysis and exact CSS/JS recommendations. Implementation will be handled by the implementer agent.
- **Data Model Dependency**: `shared/cards.js` defines card types as `blessing`, `buff`, `debuff`, `other`. Ensure any new tag styling maps to these exact strings or provides fallback styles.

---

## 4. Conclusion & Proposed Redesign Specification

### A. Fix `.card-disable-overlay` with Glassmorphic Pill Overlay
Add absolute-positioned glassmorphic container in `src/style/index.css`:
```css
/* Glassmorphic Non-Overlapping Disable Overlay */
.card-disable-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  padding: 8px;
  border-radius: inherit;
  animation: fadeIn 0.15s ease-out;
}

.card-disable-badge {
  background: rgba(220, 38, 38, 0.12);
  color: #dc2626;
  border: 1px solid rgba(220, 38, 38, 0.3);
  font-weight: 800;
  font-size: 0.72rem;
  padding: 4px 10px;
  border-radius: 999px;
  letter-spacing: 0.02em;
  box-shadow: 0 2px 8px rgba(220, 38, 38, 0.12);
  white-space: nowrap;
}
```

Update HTML generator in `src/pages/battle.js` (lines 337 & 407):
```html
${!canPlay ? `<div class="card-disable-overlay"><span class="card-disable-badge">${disableReason}</span></div>` : ''}
```

### B. Redesign `.hand-card-kards` (Tactical Hand UI)
Update `src/style/index.css` (lines 1316–1336):
```css
.hand-card-kards {
  position: absolute;
  bottom: 0;
  left: 50%;
  margin-left: -67px;
  width: 135px;
  height: 185px;
  background: var(--bg-card);
  border-radius: 12px;
  border: 1.5px solid rgba(220, 200, 180, 0.6);
  padding: 10px;
  box-shadow: 0 4px 14px rgba(80, 60, 40, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
  transform-origin: bottom center;
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.25s ease, border-color 0.25s ease;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.hand-card-kards.disabled {
  opacity: 0.75;
  filter: grayscale(0.4);
  cursor: not-allowed;
}

.hand-card-kards:hover:not(.disabled) {
  z-index: 20;
  border-color: var(--gold);
  box-shadow: 0 10px 25px rgba(192, 154, 80, 0.22), 0 0 0 2px rgba(192, 154, 80, 0.4);
  /* Smooth elevation along natural fan vector without snapping rotation */
  transform: translateY(-24px) scale(1.08) !important;
}
```

### C. Refine Typography & Tag Styling
Update `.card-tag-row`, `.card-tp-cost`, `.card-title-text`, `.card-desc-text` in `src/style/index.css`:
```css
.card-tag-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.card-tag-type {
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 0.64rem;
  font-weight: 700;
  line-height: 1.2;
}

.card-tp-cost {
  color: #d97706;
  background: rgba(251, 191, 36, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.35);
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 900;
}

.card-title-text {
  font-family: var(--font-display);
  font-size: 0.82rem;
  font-weight: 800;
  color: var(--text);
  margin: 6px 0 4px;
  line-height: 1.25;
  border-bottom: 1px solid var(--bg-inset);
  padding-bottom: 4px;
}

.card-desc-text {
  font-size: 0.68rem;
  color: var(--text-secondary);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}
```

### D. Redesign Draft Shop Panel & Slot Cards
In `src/pages/battle.js` and `src/style/index.css`:
- Replace raw inline styles (`color: var(--text-main)`) with structured classes `.draft-card-title` and `.draft-card-desc`.
- Upgrade `.draft-shop-panel` with glassmorphic modal styling (`background: rgba(255, 255, 255, 0.94); backdrop-filter: blur(16px); border-radius: 20px;`).
- Style `.draft-card-star` with glowing gold star icons.

---

## 5. Verification Method

1. **File Inspection**:
   - Verify `src/style/index.css` contains `.card-disable-overlay` and `.card-disable-badge`.
   - Verify `src/pages/battle.js` uses `<span class="card-disable-badge">` inside `.card-disable-overlay`.
   - Verify all `var(--text-main)` occurrences in `src/pages/battle.js` are replaced with `var(--text)`.

2. **Visual & Behavioral Invalidation Conditions**:
   - Check mobile viewport (<480px width) in browser developer tools: hand cards must not trigger horizontal scrollbars or overflow offscreen.
   - When TP is insufficient (e.g. `TP < tpCost`), hovering over a disabled card should display the centered glass badge "TP不足" clearly without text overlapping or line clipping.
   - When hovering over playable hand cards, rotation transition must be smooth without abrupt snap artifacts.
