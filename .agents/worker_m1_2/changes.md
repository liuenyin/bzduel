# Changes Log — Iteration 2 (worker_m1_2)

## Modified Files

### 1. `src/style/index.css`
- **CSS Rule Order Fix**: Moved `@media (max-width: 680px)` and `@media (max-width: 480px)` responsive blocks from line 582 to the VERY END of the file (lines 1383-1417). This ensures media query overrides for `.hand-fab-container` (`bottom: 58px; right: 16px; z-index: 9000`) take precedence over the base `.hand-fab-container` declaration at line 1312 (`bottom: 20px; right: 20px; z-index: 1000`).
- **Mobile Body Overflow Fix**:
  - Added `overflow-x: hidden` to `html, body`.
  - Added `min-width: 0; max-width: 100%` to flex containers and children (`.panel`, `.arena-center`, `.stats-matrix-wrap`, `.stats-modal`).
- **Hardcoded Dark Hex Fix**: Replaced `color: #1e293b;` in `.draft-shop-panel` with `color: var(--text);`.

### 2. `src/pages/lobby.js`
- **Dark Inline Style Fix in Lobby Modal**: Removed inline `background:rgba(0,0,0,0.6)` from `#stats-modal` overlay and replaced inline `box-shadow:0 10px 30px rgba(0,0,0,0.5)` on `.modal-content` with `box-shadow:var(--shadow-lg)` to adopt the light frosted `.modal-overlay` aesthetic.

## Build Verification Output
```
> school-dice-duel@1.0.0 build
> npx vite build

vite v6.4.2 building for production...
transforming...
✓ 43 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.79 kB │ gzip:  0.49 kB
dist/assets/index-CU6MYZca.css   57.21 kB │ gzip: 11.73 kB
dist/assets/index-lkT5xqrB.js   148.18 kB │ gzip: 44.99 kB
✓ built in 1.68s
```
