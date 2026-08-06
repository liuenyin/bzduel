# School Dice Duel — Comprehensive Codebase & Web UI Survey Report

**Surveyor**: `explorer_survey_1`  
**Date**: 2026-08-05  
**Target Repository**: `E:/School+AI/school-dice-duel`

---

## 1. Executive Summary

This document provides a thorough survey of the existing web UI, styling architecture, component structures, responsive layout behaviors, and animation mechanics for **School Dice Duel** (校园战力党).

The codebase is a single-page application (SPA) built with standard JavaScript (ES Modules), Vite, Vanilla CSS, and Socket.io. It features a light, warm-toned academic aesthetic ("暖白底 · 衬线标题"). However, several full-screen modals and overlays inadvertently introduce heavy dark backgrounds (`#0f172a`, `#1e293b`, `#170f26`), which conflicts with Requirement R1 ("Maintain Light/Fresh Aesthetics"). Furthermore, mobile viewports suffer from floating UI button overlaps (e.g. KARDS Tactical Hand FAB vs Global Chat Widget) and vertical clutter, and animations currently rely on simple CSS `@keyframes` without dedicated physics-based animation libraries.

---

## 2. Architecture & File Structure Overview

### 2.1 Project Configuration & Root Files
- `index.html`: Standard HTML5 document. Sets `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`. Imports Google Fonts (`Noto Serif SC` weights 400/600/700/900 and `Noto Sans SC` weights 400/500/700). Imports stylesheet files `/src/style/index.css` and `/src/styles/autochess.css`. Mounts `<div id="app"></div>` and loads script `/src/main.js`.
- `package.json`:
  - **Dependencies**: `express` (^4.21.0), `socket.io` (^4.8.0), `socket.io-client` (^4.8.0), `vite` (^6.3.0).
  - **DevDependencies**: `concurrently` (^9.1.0), `playwright` (^1.62.1).
  - **Animation Libraries**: *None installed* (No GSAP, Anime.js, Framer Motion, or Tailwind CSS).
- `vite.config.js`: Configured with root `.`, port 5173, socket.io websocket proxy to `http://localhost:3000`, build output to `dist`.

### 2.2 Client Source Structure (`/src`)
```
src/
├── main.js                 # SPA Router (navigate function) & Global Chat Widget initialization
├── net/
│   └── socket.js           # Socket.io client network event handler wrapper
├── pages/
│   ├── lobby.js            # Lobby page view & win-rate matrix stats modal
│   ├── preparation.js      # Character selection grid, schedule bar & card modal
│   ├── battle.js           # Main battle arena view (1v1 & FFA modes, dice rolling, tactical cards)
│   └── autochess.js        # Autochess / Currency War mode view (hex board, shop, bench, replay)
├── style/
│   └── index.css           # Primary application stylesheet (1321 lines Vanilla CSS)
├── styles/
│   └── autochess.css       # Autochess module stylesheet (622 lines Vanilla CSS)
└── utils/
    └── audio.js            # Web Audio API procedural sound synthesizer (dice rolls, hits, skills)
```

### 2.3 Shared Assets & Data (`/shared`, `/public`)
- `shared/characters.js`: Contains definitions for 19 characters (ID, name, title, subjects, image path, HP, dice pool, attack/defense slot limits, positive/neutral/negative skills).
- `shared/rules.js`: Core rules constants (SUBJECTS, CORE_SUBJECTS, ELECTIVE_SUBJECTS, MINOR_SUBJECTS, getSkillMultiplier, DICE_COLORS, IDENTITY).
- `shared/autochess-config.js`: Configuration for Autochess mode.
- `public/photos/`: Character avatar image files (17 files, e.g. `dan_heng.png`, `fxr.png`, `hjc.jpg`, `wyc.jpg`, `yzm.png`, etc.).

---

## 3. Styling Architecture & Aesthetic Analysis

### 3.1 CSS Design System (`src/style/index.css`)
- **Variables Definition (`:root`)**:
  ```css
  --font-display: 'Noto Serif SC', Georgia, serif;
  --font-body: 'Noto Sans SC', -apple-system, sans-serif;
  --bg: #faf8f5; --bg-warm: #f5f1eb; --bg-card: #fff; --bg-inset: #f0ece5;
  --text: #3b3532; --text-secondary: #7a716a; --text-muted: #b0a89e;
  --accent: #c06040; --accent-hover: #a84e32; --accent-soft: #e8c4b0;
  --blue: #5b8fb9; --green: #6a9e6d; --red: #c45c5c; --gold: #c09a50; --rose-gold: #b76e79;
  --radius: 12px; --radius-lg: 20px;
  --shadow: 0 2px 12px rgba(80,60,40,.07); --shadow-lg: 0 8px 32px rgba(80,60,40,.10);
  ```
- **Design Theme Concept**: Warm white paper background with elegant serif headings ("简约书卷气 · 暖白底 · 衬线标题").
- **Dark Overlay Conflict (R1 Violation)**:
  While the main page backgrounds are warm light (`#faf8f5`), several overlays hardcode dark backgrounds:
  - Game Over Screen (`.game-over-screen`): `background: rgba(15, 23, 42, 0.95)` (dark slate blue).
  - Class Change Banner (`.class-banner`): `background: rgba(30, 41, 59, 0.9)` (dark navy).
  - Dream Target Modal (`.dream-target-modal-panel`): `background: rgba(23, 15, 38, 0.92)` (dark purple).
  - Fu Xiuran Dream BG (`.fxr-dream-bg`): `radial-gradient(circle at center top, rgba(50,15,80,0.85) 0%, rgba(10,5,25,0.95) 100%)`.
  - General Modal Overlays (`.modal-overlay`): `background: rgba(0,0,0,0.5)` or `rgba(0,0,0,0.6)`.

### 3.2 Glassmorphism & Shadow Depth
- Glassmorphism is used sparingly (e.g. `.skill-glass-banner` uses `backdrop-filter: blur(12px)` and `.chat-widget` uses `backdrop-filter: blur(10px)`).
- Card elevation and shadows rely on low-opacity warm brown tint (`rgba(80,60,40,.07)`).

### 3.3 Mobile Responsiveness & Viewport Scaling
- **Media Queries**:
  - `@media(max-width: 680px)`:
    - Re-layouts `.arena` from 3 columns (`110px 1fr 110px`) to 1 column (`grid-template-rows: auto 1fr auto`).
    - Stacks sidebars horizontally above and below the main arena.
    - Stacks battle cards vertically (`.card-row { flex-direction: column; gap: 14px; }`).
    - Scales down battle card size (`width: 100px; height: 130px;`).
    - Repositions global chat widget to full width bottom drawer (`bottom: 0; left: 0; right: 0; width: 100%;`).
  - `@media(max-width: 520px)` and `@media(max-width: 480px)`:
    - Adjusts Game Over modal padding and dream target modal grid gaps.
- **Mobile Responsive Defects**:
  1. **UI Element Collision**: The KARDS Tactical Hand FAB button (`.hand-fab-container`, fixed at `bottom: 20px; right: 20px; z-index: 1000`) overlaps directly with the Global Chat Widget (`.chat-widget`, fixed at `bottom: 20px; right: 20px; z-index: 9000` / full width on mobile).
  2. **Vertical Screen Overcrowding**: On portrait mobile screens (<680px), stacking Opponent Card + Player Card + Dice Area + Action Buttons + Tactical Bar causes excessive height and scrolling issues.
  3. **Table Overflow**: The Win-rate Statistics matrix table (`.stats-matrix`) requires horizontal scrolling (`min-width: 800px`), making it difficult to read on mobile.

---

## 4. Identified UI Component Catalog

| Component | Target File | Key DOM Classes & Elements | Responsive & Styling Status |
|---|---|---|---|
| **Global Router & App Container** | `src/main.js` | `#app`, `navigate()` | Clean SPA container, centered max-width 960px |
| **Global Chat Widget** | `src/main.js` | `.chat-widget`, `.chat-header`, `.chat-messages`, `.chat-input-area` | Collapsible drawer, fixed bottom-right; collides with tactical FAB on mobile |
| **Lobby Page** | `src/pages/lobby.js` | `.lobby`, `.panel`, `#nickname-input`, `.btn-group`, `.lobby-info-grid` | Clean warm layout; action buttons clear |
| **Stats Matrix Modal** | `src/pages/lobby.js` | `#stats-modal`, `.stats-matrix`, `.win-high`, `.win-low` | Works well on desktop; min-width 800px table requires horizontal scrolling on mobile |
| **Schedule Bar (Preparation & Battle)** | `src/pages/preparation.js`, `battle.js` | `.schedule-bar`, `.schedule-item`, `.sch-item` | Displays 6 subject classes with icons (`📝`, `⚡`, `🧪`, etc.) |
| **Character Select Grid** | `src/pages/preparation.js` | `.avatar-grid`, `.avatar-cell`, `.avatar-img`, `.avatar-name` | Grid layout using CSS Grid (`repeat(auto-fill, minmax(70px, 1fr))`); intuitive card select |
| **Character Modal (Prep View)** | `src/pages/preparation.js` | `.modal-content-card`, `.card`, `.card-image-wrap`, `.card-stats`, `.card-skills` | Pop-up modal displaying full character attributes, dice pool, and skills |
| **1v1 Battle Arena** | `src/pages/battle.js` | `.arena`, `.sidebar-left`, `.arena-center`, `.sidebar-right`, `.card-row` | 3-column grid on desktop, single column on mobile; battle cards, HP bars, multiplier tags |
| **FFA (Sanguosha) Grid** | `src/pages/battle.js` | `#ffa-grid-container`, `.ffa-opponents-grid`, `.ffa-micro-card` | Renders micro-cards for 3~8 players with identity badges (主/忠/反/内) and target selection |
| **Dice Area & Selection** | `src/pages/battle.js` | `.dice-area`, `.dice-row`, `.die.attack`, `.die.defense`, `.die-corner` | Color-coded dice borders & corners by face type (D4, D6, D8, D10, D12); click to select |
| **Action Bar & Reroll Sidebar** | `src/pages/battle.js` | `.action-bar`, `#btn-roll`, `#btn-confirm`, `#btn-buy-water`, `#btn-reroll` | Dynamic button states depending on turn phase (waiting, rolled, confirmed) |
| **Tactical Hand (KARDS Style)** | `src/pages/battle.js` | `.hand-fab-container`, `.hand-fab`, `.hand-fan-container`, `.hand-card-kards` | Fan-out card hand drawer with rotation angles; overlaps chat widget on mobile |
| **Tactical Supply Shop Modal** | `src/pages/battle.js` | `#draft-shop-modal`, `.draft-shop-panel`, `.draft-slots-container`, `.draft-slot-card` | Modal popup between class rounds for purchasing tactical cards with TP |
| **Dream Target Modal (Fu Xiuran)** | `src/pages/battle.js` | `#dream-target-modal`, `.dream-target-modal-panel`, `.dream-target-btn` | Dark purple overlay for blind-selecting Fu Xiuran's domain target |
| **Class Change & Banner** | `src/pages/battle.js` | `.class-change-overlay`, `.class-banner` | Full-screen transition and pop-in banner when class round changes |
| **Game Over Screen** | `src/pages/battle.js` | `.game-over-screen`, `.go-content`, `.go-title`, `.go-stats`, `.player-box` | Fullscreen dark slate overlay displaying winner, final HP bars, and return button |
| **Autochess / Currency War** | `src/pages/autochess.js` | `.ac-page`, `.ac-board`, `.ac-hex-slot`, `.ac-core-slot`, `.ac-shop`, `.ac-bench` | Hexagonal honeycomb grid board layout with drag-and-drop bench integration |

---

## 5. Animation Architecture & VFX Survey

### 5.1 Existing Animation Implementation
Currently, all animations are written in vanilla CSS `@keyframes` in `src/style/index.css`:
1. `diceRoll`:
   ```css
   @keyframes diceRoll {
     0%{transform:perspective(400px) rotateX(0deg) rotateY(0deg) scale(.5);opacity:.3}
     50%{transform:perspective(400px) rotateX(360deg) rotateY(180deg) scale(1.15);opacity:1}
     100%{transform:perspective(400px) rotateX(720deg) rotateY(360deg) scale(1)}
   }
   ```
2. `screenImpulse` / `heavyHitShake`:
   Rigid X/Y translation shake on heavy damage (>=8).
3. `cardAtk` / `cardAtkSelf`:
   Horizontal slide shift (`translateX(60px) scale(1.08)`).
4. `cardHit`:
   Horizontal vibration (`translateX(-8px)` to `translateX(8px)`).
5. `floatUp`:
   Floating damage text translation (`translateY(-50px)` fade out).
6. `dmgFlash`:
   Box shadow red glow + CSS filter brightness/sepia/hue-rotate shift on heavy damage (>15).
7. `revivalHaloFade`:
   Scaling halo ring animation when Nine Lives triggers.
8. `pierceLine` / `sweepUp`:
   Piercing beam line and defense sweep line.
9. `dreamSpread`:
   Dark radial gradient expand for Fu Xiuran's dream domain.
10. Character Auras:
    Color glowing pulse animations (`auraPulseRed`, `auraPulsePurple`, `auraPulseBlue`, `auraPulseRedHeat`, `auraGlitchPink`).

### 5.2 Sound Effects Engine (`src/utils/audio.js`)
Uses browser-native `Web Audio API` oscillators without external audio files:
- `playDiceRoll()`: Triangle wave oscillator pitch drop (140Hz → 40Hz) 3 times.
- `playHit(isCritical)`: Sine wave pitch drop (110/90Hz → 30Hz).
- `playSkillTrigger()`: Dual sine wave arpeggio (A4 → A5 and E5 → E6).

### 5.3 Deficiencies & Improvement Opportunities
- **No Animation Library**: No GSAP or Anime.js is currently installed. Complex physics easing, timelines, particle bursts, and spring animations are unavailable.
- **Cheap-Looking Effects**:
  - Screen shake (`screenImpulse`) is a rigid 2D displacement that can cause motion discomfort on mobile.
  - Damage flash uses crude CSS filter shifts (`brightness(1.5) sepia(1) hue-rotate(-50deg)`).
  - Character Ultimates (e.g. Fu Xiuran's Dream Domain Expansion, Yan Ziming's Timeless Grace, Wang Hedi's Showoff) lack high-impact full-screen canvas/particle visual effects.
  - Dice rolls lack physical bounce/weight.

---

## 6. Recommendations for UI Redesign & Modernization

### 6.1 R1: Light & Fresh Aesthetic Overhaul
1. **Eliminate All Dark Overlays**:
   Replace dark slate/purple backgrounds in `.game-over-screen`, `.class-banner`, `.dream-target-modal-panel`, and `.fxr-dream-bg` with light, translucent glassmorphic surfaces (`background: rgba(255, 255, 255, 0.88); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.6)`).
2. **Elevate Glassmorphism & Shadow Architecture**:
   Establish refined design tokens:
   - Surface background: Frost white `#faf8f6` with soft ambient radial glows.
   - Glass cards: `rgba(255, 255, 255, 0.75)` with `backdrop-filter: blur(12px)` and delicate 1px border `rgba(220, 200, 180, 0.4)`.
   - Soft shadows: `0 8px 30px rgba(160, 120, 90, 0.08)`.
3. **Typography & Badge Polish**:
   Refine contrast, font weights, and badge pills for HP, dice types, and character skills.

### 6.2 R2: High-Impact VFX & Animation Overhaul (GSAP / Anime.js)
1. **Library Integration**:
   Install **GSAP** (`npm install gsap`) or **Anime.js** for smooth UI timelines and physics easing.
2. **Physics-based Dice Rolling**:
   Use 3D rotation with elastic/bounce easing (`bounce.out` or custom cubic-bezier) for tactile dice rolls.
3. **Damage Impact & Hits**:
   Replace screen shaking with smooth card impact pulses, floating damage text with dynamic spring arcs, and clean directional hit flashes (avoiding dark filter distortions).
4. **Character Ultimates Visual Overlays**:
   Create dedicated light-themed full-screen particle or aura animations:
   - **Fu Xiuran's Dream King (Domain Expansion)**: Shimmering ethereal light particle aura and glass realm transition.
   - **Yan Ziming's Timeless Grace**: Elegant golden light trails and royal emblem pop.
   - **Wang Hedi's Showoff**: Playful starburst confetti and sparkle animation.
   - **Zhou Xuansheng's Charge / Buy Water**: Hydro-blue water ripple aura and power surge.

### 6.3 R3: Mobile Responsiveness & Layout Optimization
1. **Resolve UI Collision**:
   Reposition KARDS Tactical FAB button (`.hand-fab-container`) or dock global chat widget into a top navigation bar on mobile viewports (<680px) so they never overlap.
2. **Compact Battle Layout on Mobile**:
   Optimize vertical spacing on mobile screens: display friendly and enemy cards in a compact horizontal split header or tabbed arena to maximize legibility of dice and action buttons without vertical scrolling.
3. **Modal Viewport Fit**:
   Ensure all modals (`.draft-shop-panel`, `.modal-content`) fit neatly within mobile height limits (`max-height: 85vh`) with clean touch scrolling.

---

*End of survey report.*
