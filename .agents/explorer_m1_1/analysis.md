# Analysis & Implementation Blueprint — Milestone 1: Light Aesthetic & Mobile Layout Overhaul

**Author**: `explorer_m1_1`  
**Date**: 2026-08-05  
**Target Project**: `E:/School+AI/school-dice-duel`

---

## Executive Summary

This document presents a comprehensive, file-by-file implementation blueprint for **Milestone 1: Light Aesthetic & Mobile Layout Overhaul**. 

The current codebase contains several UI components and full-screen overlays that hardcode dark slate, navy, and purple backgrounds (`#0f172a`, `#1e293b`, `#170f26`), directly violating Requirement **R1 (Maintain Light/Fresh Aesthetics)**. Additionally, on mobile viewports (<680px), the fixed-position KARDS Tactical Hand FAB (`.hand-fab-container`) overlaps directly with the Global Chat Widget (`.chat-widget`), and table components (such as `.stats-matrix`) lack responsive container overflow controls.

This blueprint details exact CSS token updates, rule rewrites in `src/style/index.css`, JS adjustments in `src/pages/battle.js` and `package.json`, and mobile responsive positioning logic.

---

## 1. Package Dependency Updates (`package.json`)

### Problem & Requirement
- GSAP is required for physics-based spring easing, VFX timelines, and hit impact management starting in Milestone 1 and powering Milestone 2 & 3.
- Currently, `package.json` does not include `gsap`.

### Action Plan
1. Add `"gsap": "^3.12.5"` under `"dependencies"` in `package.json`.
2. Execution command: `npm install gsap`.

---

## 2. Light Aesthetic & Glassmorphism Overhaul Blueprint

### 2.1 Design Tokens & Colors
- **Light Surface**: Frost white `rgba(255, 255, 255, 0.85)` / `rgba(250, 248, 245, 0.88)`
- **Glassmorphic Filter**: `backdrop-filter: blur(12px)` / `-webkit-backdrop-filter: blur(12px)` (or `blur(16px)` for full-screen overlays)
- **Border Treatment**: `1px solid rgba(220, 200, 180, 0.5)` or `var(--accent-soft)`
- **Typography & Color**: Warm text `var(--text)` (`#3b3532`), secondary text `var(--text-secondary)` (`#7a716a`)
- **Shadow Depth**: Warm ambient drop shadows `var(--shadow-lg)` (`0 8px 32px rgba(80,60,40,.10)`) and `0 20px 50px rgba(80,60,40,0.12)`

### 2.2 Target Component 1: Game Over Screen (`.game-over-screen`)
- **Location**: `src/style/index.css` (lines 460–485, 574–615, 760–795)
- **Current State**: Hardcoded dark slate blue `rgba(15, 23, 42, 0.95)`, dark gradient content box, white text with dark drop shadows, dark HP bars.
- **Replacement Rules**:

```css
/* ── 结算画面 (Light Glassmorphic Overhaul) ── */
.game-over-screen {
  position: fixed; inset: 0;
  background: rgba(250, 248, 245, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000; animation: fadeIn 0.4s ease-out;
  font-family: var(--font-display);
  color: var(--text);
}

.go-content {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(220, 200, 180, 0.5);
  padding: 50px 60px;
  border-radius: 24px;
  text-align: center;
  box-shadow: var(--shadow-lg), 0 20px 50px rgba(80, 60, 40, 0.12);
  animation: popUp 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  max-width: 90%; width: 600px;
  color: var(--text);
  max-height: 90vh;
  overflow-y: auto;
}

.go-title {
  font-size: 3.5rem; font-weight: 900; margin-bottom: 40px;
  text-transform: uppercase; letter-spacing: 0.1em;
  text-shadow: 0 2px 10px rgba(192, 96, 64, 0.15);
  color: var(--text);
}

.go-stats {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 50px; background: var(--bg-inset);
  padding: 30px; border-radius: 16px;
  border: 1px solid rgba(220, 200, 180, 0.3);
}

.go-avatar {
  width: 100px; height: 100px; border-radius: 50%;
  object-fit: cover; border: 4px solid var(--bg-card);
  margin-bottom: 16px; transition: all 0.3s;
  box-shadow: var(--shadow);
}
.go-avatar.dead {
  filter: grayscale(100%) opacity(0.6);
  border-color: var(--text-muted);
}

.go-name {
  font-family: var(--font-body); font-weight: 700;
  font-size: 1.1rem; color: var(--text); margin-bottom: 8px;
}

.go-stats .hp-bar {
  height: 8px; background: var(--bg-card); border-radius: 4px; overflow: hidden;
  border: 1px solid var(--bg-inset);
}
```

### 2.3 Target Component 2: Class Change Banner (`.class-banner`)
- **Location**: `src/style/index.css` (lines 438–457)
- **Current State**: `background: rgba(30, 41, 59, 0.9)` (dark navy), white text.
- **Replacement Rules**:

```css
/* ── 课程切换横幅 (Light Warm Banner) ── */
.class-banner {
  position: fixed;
  top: 40%; left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--accent);
  border: 1px solid rgba(220, 200, 180, 0.6);
  padding: 20px 40px;
  border-radius: 16px;
  font-size: 2rem;
  font-weight: bold;
  font-family: var(--font-display);
  z-index: 9999;
  box-shadow: var(--shadow-lg), 0 10px 30px rgba(80, 60, 40, 0.12);
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

.class-banner.fade-out {
  opacity: 0;
  transform: translate(-50%, -60%);
  transition: all 0.5s ease;
}
```

### 2.4 Target Component 3: Dream Target Modal Panel (`.dream-target-modal-panel`) & Fu Xiuran Dream BG (`.fxr-dream-bg`)
- **Location**: `src/style/index.css` (lines 955–990, 1121–1132) & `src/pages/battle.js` (lines 235–262)
- **Current State**: Dark purple panel `rgba(23, 15, 38, 0.92)`, dark void radial background `rgba(50,15,80,0.85)`, inline dark text styles.
- **Replacement Rules (`src/style/index.css`)**:

```css
/* 梦境盲选弹窗 (Light Ethereal Glass Panel) */
.dream-target-modal-panel {
  max-width: 440px;
  width: 92%;
  padding: 24px 20px;
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1.5px solid var(--accent-soft);
  border-radius: 20px;
  box-shadow: var(--shadow-lg), 0 12px 36px rgba(120, 80, 160, 0.12);
  color: var(--text);
  text-align: center;
  margin: auto;
}

.dream-target-btn {
  flex: 1;
  padding: 16px 6px;
  background: var(--bg-card);
  border: 1.5px solid var(--accent-soft);
  border-radius: 14px;
  color: var(--text);
  font-weight: 700;
  font-size: 0.95rem;
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.dream-target-btn:hover, .dream-target-btn:active {
  transform: scale(0.96);
  background: var(--accent-soft);
  color: var(--accent-hover);
}

/* 付修然梦境背景 (Light Shimmering Dream Aura) */
.fxr-dream-bg {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at center top, rgba(245, 235, 255, 0.75) 0%, rgba(235, 225, 250, 0.85) 100%);
  backdrop-filter: blur(8px);
  z-index: -1;
  pointer-events: none;
  animation: dreamSpread 1.5s ease-out forwards;
}
```

- **JS Adjustment (`src/pages/battle.js`, lines 244–260)**:
  Replace hardcoded dark text inline colors in `checkDreamTargetModal(s)`:

```javascript
// Before: <h2 style="color:#fef08a; ...">
// Replace with:
overlay.innerHTML = `
  <div class="dream-target-modal-panel">
    <h2 style="color:var(--accent); margin-bottom:6px; font-size:1.35rem; font-family:var(--font-display);">梦境之王 - 盲选真身</h2>
    <p style="font-size:0.88rem; color:var(--text); margin-bottom:14px; line-height:1.4;">付修然展开了梦境领域！出现 1 个本体与 2 个分身，请盲选本节课的攻击目标：</p>
    <div class="dream-target-cards-container">
      <button class="dream-target-btn" onclick="window._pickDreamTarget(0)">目标 A</button>
      <button class="dream-target-btn" onclick="window._pickDreamTarget(1)">目标 B</button>
      <button class="dream-target-btn" onclick="window._pickDreamTarget(2)">目标 C</button>
    </div>
    <p style="font-size:0.75rem; color:var(--text-secondary);">* 选错分身：分身使用超强骰池 (D7+D9+D9+D9+D11) 且无法伤及本体！</p>
  </div>
`;
```

### 2.5 Target Component 4: General Modal Overlays (`.modal-overlay`, `.result-overlay`)
- **Location**: `src/style/index.css` (lines 151–161, 408–411)
- **Current State**: `.modal-overlay` uses `background: rgba(0,0,0,0.5)`.
- **Replacement Rules**:

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(250, 248, 245, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s;
}

.result-overlay {
  position: fixed; inset: 0;
  background: rgba(250, 248, 245, 0.75);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex; align-items: center; justify-content: center;
  z-index: 100; animation: fadeIn .25s;
}
```

### 2.6 Target Component 5: Secondary Dark Elements Polish
- **Avatar Badges & Card Overlays**:
  - `.avatar-name` (lines 89–95): Replace `background: rgba(0,0,0,0.6)` with `background: rgba(255,255,255,0.85); backdrop-filter: blur(4px); color: var(--text); border-top: 1px solid var(--bg-inset); font-weight: 700;`.
  - `.bc-name` (line 299): Replace `background: linear-gradient(to top,rgba(0,0,0,.65),transparent); color:#fff;` with `background: linear-gradient(to top, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.5) 70%, transparent 100%); color: var(--text); font-weight: 800; text-shadow: none;`.
  - `.skill-glass-banner` (lines 358–362): Update `.pos`, `.neg`, `.neu` classes from dark backgrounds (`rgba(26,46,32,.85)`, `rgba(48,22,22,.85)`, `rgba(30,26,48,.85)`) to light frosted glass panels:
    - `.skill-glass-banner.pos`: `background: rgba(235, 247, 238, 0.88); border: 1px solid rgba(106, 158, 109, 0.4); color: #2d5a30; box-shadow: var(--shadow);`
    - `.skill-glass-banner.neg`: `background: rgba(253, 238, 238, 0.88); border: 1px solid rgba(196, 92, 92, 0.4); color: #944; box-shadow: var(--shadow);`
    - `.skill-glass-banner.neu`: `background: rgba(245, 240, 255, 0.88); border: 1px solid rgba(168, 85, 247, 0.4); color: #6b21a8; box-shadow: var(--shadow);`
  - `.fab-tp` (line 1266): Replace `background: rgba(0,0,0,0.5)` with `background: rgba(255,255,255,0.85); color: #0284c7; border: 1px solid rgba(14, 165, 233, 0.3);`.

---

## 3. Mobile Layout Collision & Overflow Resolution Blueprint (<680px)

### 3.1 Resolving KARDS Tactical FAB vs Global Chat Widget Collision
- **Problem**:
  Currently, `.hand-fab-container` (KARDS FAB) is fixed at `bottom: 20px; right: 20px; z-index: 1000`.
  `.chat-widget` is fixed at `bottom: 20px; right: 20px; z-index: 9000` on desktop, and `bottom: 0; left: 0; right: 0; width: 100%` on mobile (<680px).
  Both elements collide directly in the bottom-right corner!
- **Solution Strategy**:
  1. **Desktop (>680px)**:
     - Keep `.hand-fab-container` at `bottom: 20px; right: 20px; z-index: 9000`.
     - Move `.chat-widget` to `bottom: 20px; right: 90px; width: 300px; z-index: 8500;` so it sits side-by-side to the left of the KARDS FAB button.
  2. **Mobile (<680px)**:
     - Keep `.chat-widget` docked at `bottom: 0; left: 0; right: 0; width: 100%; z-index: 8500;`. Its collapsed header height is 48px.
     - Move `.hand-fab-container` to `bottom: 58px; right: 16px; z-index: 9000;`. This positions the FAB button floating cleanly 10px above the chat drawer header.
     - Adjust `.hand-fan-container` on mobile (<480px) so expanded tactical hand cards fan out gracefully within the viewport (`right: -10px; width: 290px; height: 180px;`).

- **CSS Replacement Rules (`src/style/index.css`)**:

```css
/* Global Chat Widget Desktop Position */
.chat-widget {
  position: fixed;
  bottom: 20px;
  right: 90px;
  width: 300px;
  height: 400px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(220, 200, 180, 0.5);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  z-index: 8500;
  transform: translateY(0);
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s;
}

/* Mobile responsive layout positioning */
@media (max-width: 680px) {
  #app {
    padding: 8px;
  }
  .chat-widget {
    bottom: 0;
    right: 0;
    left: 0;
    width: 100%;
    border-radius: 20px 20px 0 0;
    z-index: 8500;
  }
  .hand-fab-container {
    bottom: 58px;
    right: 16px;
    z-index: 9000;
  }
}

@media (max-width: 480px) {
  .hand-fan-container {
    right: -10px;
    width: 290px;
    height: 180px;
  }
  .hand-card-kards {
    width: 110px;
    height: 155px;
    margin-left: -55px;
    padding: 6px;
  }
  .hand-card-kards .card-title-text {
    font-size: 0.72rem;
  }
  .hand-card-kards .card-desc-text {
    font-size: 0.6rem;
  }
}
```

### 3.2 Eliminating Horizontal Table & Modal Overflow
- **Problem**: `.stats-matrix` table has `min-width: 800px` without a dedicated scroll wrapper, causing the modal to overflow viewport width on 375px/390px mobile screens.
- **Solution**:
  1. Add `.stats-matrix-container` wrapper in CSS and ensure modals scroll cleanly.
  2. Add responsive rules in `src/style/index.css`:

```css
.stats-matrix-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin-top: 10px;
  border-radius: var(--radius);
}

@media (max-width: 680px) {
  .stats-matrix {
    font-size: 0.75rem;
  }
  .stats-matrix th, .stats-matrix td {
    padding: 4px 3px;
  }
  .draft-slot-card {
    min-width: 140px;
    padding: 8px;
  }
}
```

---

## 4. File-by-File Blueprint Summary

| Target File | Required Action / Edit Summary | Target Section / Lines |
|---|---|---|
| `package.json` | Add `"gsap": "^3.12.5"` under `"dependencies"` | `dependencies` block |
| `src/style/index.css` | 1. Replace `.game-over-screen`, `.go-content`, `.go-title`, `.go-stats` dark styles with Light Glassmorphic rules (`rgba(250,248,245,0.85)` + blur).<br>2. Replace `.class-banner` dark navy background with frosted light warm glass banner.<br>3. Replace `.dream-target-modal-panel` and `.fxr-dream-bg` dark purple styles with light ethereal glass panel & light shimmering dream aura.<br>4. Update `.modal-overlay` and `.result-overlay` to light frosted backdrop.<br>5. Lighten dark avatar badges (`.avatar-name`, `.bc-name`, `.skill-glass-banner`, `.fab-tp`).<br>6. Fix `.chat-widget` and `.hand-fab-container` mobile positioning to eliminate collisions.<br>7. Add `.stats-matrix-wrap` responsive overflow styles. | Lines 89–95, 151–161, 299, 358–362, 408–411, 438–485, 565–577, 955–990, 1110, 1121–1128, 1246–1275 |
| `src/pages/battle.js` | Replace dark inline colors in `checkDreamTargetModal(s)` (`#fef08a`, `#e9d5ff`, `#c084fc`) with CSS variables (`var(--accent)`, `var(--text)`, `var(--text-secondary)`). | Lines 244–260 |

---

## 5. Verification Plan for Worker

1. **Dependency Verification**:
   - Run `npm install` after modifying `package.json`.
   - Run `node -e "require('gsap')"` or verify build passes with `npm run build`.

2. **Visual & Aesthetic Verification**:
   - Inspect `.game-over-screen`: verify frosted warm light background `rgba(250,248,245,0.85)` with blur, soft warm text, light stats box.
   - Inspect `.class-banner`: verify light warm banner with blur and accent typography.
   - Inspect `.dream-target-modal-panel` & `.fxr-dream-bg`: verify light glass panel and light dream aura background.
   - Inspect `.modal-overlay`: verify light frosted backdrop across all popups.

3. **Mobile Layout Verification (375px & 390px viewports)**:
   - Verify KARDS FAB button sits floating at `bottom: 58px; right: 16px` on mobile, completely clear of the collapsed chat bar at `bottom: 0`.
   - Verify tactical cards fan container expands cleanly without obscuring action buttons or clipping outside the viewport.
   - Verify zero horizontal scrolling (`overflow-x`) on the main `body` or `#app` container.
