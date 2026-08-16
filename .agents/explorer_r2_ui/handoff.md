# Handoff Report: Round 2 Requirement R2 (Hardened UI/UX Layout)

## 1. Observation

### 1.1 Source Code Locations & Line Quotes
- **File**: `src/style/index.css`
  - Selector `.hand-card-kards` (lines 1417–1436):
    ```css
    .hand-card-kards {
      position: absolute;
      bottom: 0; left: 50%; margin-left: -67px;
      width: 135px; height: 185px;
      background: var(--bg-card); border-radius: 12px;
      border: 1.5px solid rgba(220, 200, 180, 0.6);
      padding: 10px; box-shadow: 0 4px 14px rgba(80, 60, 40, 0.1), 0 1px 3px rgba(0, 0, 0, 0.05);
      transform-origin: bottom center;
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.25s ease, border-color 0.25s ease;
      cursor: pointer; overflow: hidden;
      display: flex; flex-direction: column; justify-content: space-between;
    }
    ```
  - Mobile breakpoint `@media (max-width: 480px)` (lines 1487–1505):
    ```css
    .hand-card-kards {
      width: 110px; height: 155px; margin-left: -55px; padding: 6px;
    }
    .hand-card-kards .card-title-text { font-size: 0.72rem; }
    .hand-card-kards .card-desc-text { font-size: 0.6rem; }
    ```
  - Inner card typography selectors (lines 1132–1140):
    ```css
    .card-tag-row{display:flex;align-items:center;justify-content:space-between;font-size:.65rem;font-weight:800;gap:4px}
    .card-tag-type{padding:2px 7px;border-radius:6px;font-size:.64rem;font-weight:700;line-height:1.2}
    .card-tp-cost{color:#d97706;background:rgba(251,191,36,0.15);border:1px solid rgba(245,158,11,0.4);padding:1px 7px;border-radius:999px;font-size:.7rem;font-weight:900}
    .card-title-text{font-family:var(--font-display);font-size:.82rem;font-weight:800;color:var(--text-main);margin:4px 0 2px;line-height:1.25;border-bottom:1px solid var(--bg-inset);padding-bottom:4px}
    .card-desc-text{font-size:.68rem;color:var(--text-secondary);line-height:1.35;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;flex:1;margin-top:2px}
    ```
  - Disable overlay selectors (lines 1145–1176):
    ```css
    .card-disable-overlay {
      position: absolute; inset: 0;
      background: rgba(255, 255, 255, 0.82);
      backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10; padding: 8px; border-radius: inherit;
      animation: fadeIn 0.15s ease-out; pointer-events: none;
    }
    .card-disable-badge {
      background: rgba(220, 38, 38, 0.12); color: #dc2626;
      border: 1px solid rgba(220, 38, 38, 0.3); font-weight: 800; font-size: 0.72rem;
      padding: 4px 10px; border-radius: 999px; letter-spacing: 0.02em;
      box-shadow: 0 2px 8px rgba(220, 38, 38, 0.12); white-space: nowrap;
    }
    ```
- **File**: `src/pages/battle.js`
  - HTML generation for hand cards in `tacticalBarHTML(s)` (lines 327–336):
    ```html
    <div class="hand-card-kards ${canPlay ? '' : 'disabled'}" style="--card-rotate: ${rotateDeg}deg; transform: rotate(${rotateDeg}deg) translateY(${transY}px)" ${canPlay ? `onclick="..."` : ''} title="${disableReason}">
      <div class="card-tag-row">
        <span class="card-tag-type ${typeClass}">${scopeLabel}</span>
        <span class="card-tp-cost">⚡${c.tpCost}</span>
      </div>
      <div class="card-title-text">${c.name}</div>
      <div class="card-desc-text">${c.desc}</div>
      ${!canPlay ? `<div class="card-disable-overlay"><span class="card-disable-badge">${disableReason}</span></div>` : ''}
    </div>
    ```

---

## 2. Logic Chain

1. **Observation 1.1**: `.hand-card-kards` uses fixed heights (`185px` desktop / `155px` mobile) and `display: flex; flex-direction: column; justify-content: space-between;`.
2. **Observation 1.2**: `.card-title-text` has no `white-space: nowrap`, `text-overflow: ellipsis`, or `line-clamp` rules. When card names are long (e.g. `物理·量子纠缠与波粒二象性` or `绝对零度·冰点终结`), the title text wraps onto 2–3 lines.
3. **Observation 1.3**: `.card-desc-text` has `-webkit-line-clamp: 4` and `flex: 1`. In standard CSS Flexbox, flex items default to `min-height: auto`. When `.card-title-text` expands, `.card-desc-text` cannot shrink past its content height (4 lines = ~58px).
4. **Step 4 (Reasoning)**: Combining a 36px–50px wrapped title + 58px description + 20px tag header + padding exceeds the fixed inner container height of `143px` on mobile cards. Because `overflow: hidden` is applied to `.hand-card-kards`, text is cut off mid-line or squished against bottom borders.
5. **Observation 1.4**: `.card-disable-overlay` relies on `inset: 0` with `border-radius: inherit;` inside parent container with `overflow: hidden;`. This correctly fits the card boundary, but `.card-disable-badge` lacks `max-width` and `text-overflow: ellipsis`, risking horizontal spill if disable reason strings exceed ~5 characters on mobile cards (`110px` width).
6. **Conclusion**: Applying `justify-content: flex-start`, `min-height: 0` to description flex items, `white-space: nowrap; text-overflow: ellipsis; flex-shrink: 0` to title elements, `-webkit-line-clamp: 3` to description text, and `max-width: 90%` to disable badges will eliminate all overlap and collision bugs across viewports.

---

## 3. Caveats

- **Read-Only Scope**: Per role constraints, code modifications were NOT written to project files (`src/pages/battle.js` or `src/style/index.css`). All proposed changes are documented in `analysis.md` for implementer delegation.
- **Assumptions**: Assumed browser standard Flexbox behavior (W3C Flexbox spec for `min-height: auto`).
- **Uninvestigated Areas**: Non-card UI components (such as FFA opponent micro-cards or sound settings) were outside the scope of Round 2 R2 UI layout requirements.

---

## 4. Conclusion

The Card UI overlap and collision issues in Round 2 Requirement R2 are caused by unconstrained card title text wrapping combined with Flexbox's default `min-height: auto` on description elements in fixed-height cards (`185px` / `155px`). 

The issue can be completely resolved by updating `src/style/index.css` with:
1. `min-height: 0; -webkit-line-clamp: 3;` on `.card-desc-text` and `.draft-card-desc`.
2. `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;` on `.card-title-text` and `.draft-card-title`.
3. `max-width: 65%; flex-shrink: 1; text-overflow: ellipsis;` on `.card-tag-type`.
4. `max-width: 90%; text-overflow: ellipsis;` on `.card-disable-badge`.
5. `justify-content: flex-start; gap: 3px;` on `.hand-card-kards` and `.draft-slot-card`.

---

## 5. Verification Method

To independently verify the investigation findings and future implementation fixes:

1. **Inspection Commands**:
   - Inspect `.hand-card-kards` and `.draft-slot-card` styles in `src/style/index.css`.
   - Inspect `tacticalBarHTML` and `checkDraftShopModal` in `src/pages/battle.js`.
2. **Visual & Programmatic Verification**:
   - Launch local preview/dev server (`npm run dev` or `node server/index.js`).
   - Open browser at `http://localhost:3000` or run Playwright/headless browser at viewports `1280x800` (desktop) and `375x667` (iPhone SE mobile).
   - Render cards with long titles (e.g. `物理·量子纠缠与波粒二象性`) and 4-line descriptions.
   - Verify that:
     - Title text is neatly truncated with `...` on a single line.
     - Description text clamps to 3 lines without overflowing the card container or touching the bottom border.
     - Disabled cards (e.g. `TP不足`, `限当节课`) render `.card-disable-overlay` seamlessly within the card border-radius without badge text spilling outside card edges.
3. **Invalidation Conditions**:
   - If any text element overlaps with adjacent elements, or if `.card-disable-overlay` extends beyond the rounded card border, the fix is invalid.
