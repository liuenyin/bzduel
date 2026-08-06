# School Dice Duel — Survey of Testing Infrastructure & Automation Environment

## Executive Summary
This survey details the existing technology stack, server launch modes, headless browser capabilities, battle/VFX interaction hooks, and console error monitoring strategies for **School Dice Duel** (`school-dice-duel`).

---

## 1. Package & Dependency Analysis

### Installed Dependencies (`package.json`)
```json
{
  "name": "school-dice-duel",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev:client": "vite",
    "dev:server": "node --watch server/index.js",
    "dev": "concurrently \"npm run dev:client\" \"npm run dev:server\"",
    "build": "npx vite build",
    "start": "node server/index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "socket.io": "^4.8.0",
    "socket.io-client": "^4.8.0",
    "vite": "^6.3.0"
  },
  "devDependencies": {
    "concurrently": "^9.1.0",
    "playwright": "^1.62.1"
  }
}
```

### Key Findings
1. **Playwright Pre-installed**: `playwright` v1.62.1 is present in `devDependencies`. Headless Chromium has been verified and executes successfully via Node (`node -e "const { chromium } = require('playwright')..."`).
2. **Framework & Architecture**:
   - Frontend: Vanilla JavaScript (ESM), Vite SPA router (`navigate('lobby' | 'preparation' | 'battle' | 'autochess')`), modular CSS (`src/style/index.css`).
   - Backend: Express server + Socket.IO websocket engine (`server/index.js`).
   - Shared Modules: Character specs, rules, cards, autochess configs located in `shared/`.

---

## 2. Server Startup & Programmatic Launch

### Server Modes & Ports

| Launch Command | Port(s) | Architecture | Use Case |
|---|---|---|---|
| `node server/index.js` or `npm run start` | `3000` | Single process: Express serves Socket.IO + Vite Middleware (or static `dist/` if `NODE_ENV=production`). | **Recommended for Headless UI Automation Testing** |
| `npm run dev` | `5173` (Vite client) + `3000` (Socket.IO server) | Dual process via `concurrently`. Vite proxies `/socket.io` to `http://localhost:3000`. | Interactive manual development |
| `npm run dev:client` | `5173` | Frontend Vite dev server only. | Independent frontend debugging |
| `npm run dev:server` | `3000` | Node server with `--watch` flag. | Independent backend debugging |

### Recommended Launch Protocol for UI Test Agent
To run headless browser tests, spawn `node server/index.js` in background or prior to test execution:
- Base URL: `http://localhost:3000`
- Startup readiness delay: ~1.5 - 2.0 seconds until `🎲 校园战力党 → http://localhost:3000` log output.

---

## 3. Headless Browser Automation Environment Options

### Option A: Custom Playwright Node.js Runner (**Primary Recommendation**)
- **Installed**: Yes (`playwright` v1.62.1).
- **Supported Browsers**: Chromium (verified working on system).
- **Advantages**: No extra installations needed, full access to DOM selectors, async/await flow control, full event listening for `console` and `pageerror`.

### Option B: Vitest / Cypress / Puppeteer
- **Installed**: No.
- **Evaluation**: Adding Vitest or Cypress is unnecessary since Playwright is already installed and fully operational.

---

## 4. UI Interaction Hooks & Battle VFX Simulation Guide

### Flow Navigation & CSS Selectors

#### A. Lobby Page (`src/pages/lobby.js`)
- Nickname Input: `#nickname-input`
- Single Player (PVE vs AI): `#btn-pve`
- Matchmaking: `#btn-match`
- Create 1v1 Room: `#btn-create`
- Join 1v1 Room Input/Btn: `#room-input`, `#btn-join`
- Create FFA Room: `#btn-create-ffa`

#### B. Preparation Page (`src/pages/preparation.js`)
- Character Grid: `.avatar-grid`
- Character Avatar Cell: `.avatar-cell[data-id="<char_id>"]` (e.g. `char_fxr`, `char_gpy`, `char_zxs`, `char_wyc`, `char_yzm`, `char_whd`, `char_8`, `char_10`, `char_14`, `char_19`)
- Character Modal Confirmation: `#modal-select-btn`
- Ready Button: `#btn-ready`

#### C. Battle Page (`src/pages/battle.js`)
- **Dice Roll Action**: `#btn-roll`
- **Dice Selection**: `.die.attack.selectable` or `.die.defense.selectable` (toggle selection by clicking)
- **Confirm Dice**: `#btn-confirm`
- **Reroll Dice**: `#btn-reroll` (in `#sidebar-reroll`)
- **Special Character Interactions**:
  - Zhou Xiansheng (`char_14`): `#btn-buy-water` (buy water / charge stack)
  - Li Can (`char_8`): `#btn-sacrifice` (sacrifice defense die for heal)
  - Reschedule Class: `#btn-reschedule` -> `#reschedule-idx-select` & `.subject-picker button`
  - Fu Xiuran (`char_fxr` - Domain Expansion / Dream King): Spawns `#dream-target-modal` overlay, click target button `.dream-target-btn`.
- **Tactical Hand (Kards style)**:
  - Toggle Hand: `#hand-fab`
  - Tactical Card: `.hand-card-kards`
  - Supply Station Modal: `#draft-shop-modal`, slot cards `.draft-slot-card`, refresh button `.btn-icon-refresh`, complete button `button[onclick="window._confirmDraftReady()"]`.

#### D. Battle VFX & Animation Classes
- Dice Roll Animation: `.die.rolling`
- Attacker Motion: `.card-attacking`
- Hit Shake/Impact: `.card-hit`, `.floating-damage`, `.shake-screen`, `.damage-flash`
- Revive Halo: `.revival-halo`
- Character Ultimates / Domain Expansion Overlay:
  - Fu Xiuran Domain Background: `#fxr-dream-bg` / `.fxr-dream-bg`
  - Auras: `.aura-dream-domain`, `.aura-gpy-rage`, `.aura-zxs-water`, `.aura-yzm-gold`, `.aura-wyc-redheat`, `.aura-whd-sugar`
  - Class Change Overlay: `.class-change-overlay`

---

## 5. Console Error Monitoring & Verification Strategy

### Error Listener Setup (Playwright)
```javascript
import { chromium } from 'playwright';

const pageErrors = [];
const consoleErrors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Catch uncaught JS exceptions
page.on('pageerror', (err) => {
  pageErrors.push(err.message || err.toString());
});

// Catch console.error logs
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text());
  }
});
```

### Verification Standard
After triggering UI interactions (PVE game creation, character selection, dice rolling, rerolling, ultimate VFX, tactical hand expansion, supply shop), the verification assertion must be:
- `pageErrors.length === 0`
- `consoleErrors.length === 0`

---

## 6. Features & Infrastructure Summary Table

### Features Discovered
| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Server | Express SPA & Socket Server | Unified Express + Socket.IO server on port 3000 serving Vite middleware | `node server/index.js` | HTTP 200, WebSockets listening on 3000 | Port conflict or invalid route returns 404/EADDRINUSE | `server/index.js`, `vite.config.js` |
| 2 | Testing | Playwright Headless Runner | Node Playwright library with Chromium browser support | `playwright.chromium.launch()` | Headless browser context | Throws launcher error if binary missing | `package.json`, CLI probe |
| 3 | Battle UI | PVE Solo Mode | PVE match creation against server AI | Click `#btn-pve` with nickname | Navigation to `preparation` state | Shows red warning if nickname empty | `src/pages/lobby.js`, `server/index.js` |
| 4 | Battle UI | Character Selection & Modal | Character card selection & modal confirmation | Click `.avatar-cell`, click `#modal-select-btn`, `#btn-ready` | Sets character state & readies player | Button disabled until character picked | `src/pages/preparation.js` |
| 5 | Battle UI | Dice Roll & Selection | Roll dice, toggle dice selection, confirm roll | Click `#btn-roll`, click `.die`, click `#btn-confirm` | Emits `roll_dice`, `confirm_dice` | Button disabled if selection count incorrect | `src/pages/battle.js` |
| 6 | VFX | Fu Xiuran Domain Expansion | Full screen domain background `#fxr-dream-bg` & target modal | Triggered when FXR enters dream state | `#fxr-dream-bg` DOM mount, modal prompt | Modal stays until choice made | `src/pages/battle.js` lines 198-270 |
| 7 | VFX | Hit Shake & Floating Damage | Screen shake `.shake-screen` and damage flash `.damage-flash` | Triggered on turn resolution damage | Floating damage element & screen shake | Audio fallback if sound blocked | `src/pages/battle.js` lines 790-835 |
| 8 | Tactical UI | Tactical Hand & Supply Station | KARDS style fan-out hand & supply shop modal | Click `#hand-fab`, click `.hand-card-kards` | Card animation, socket event | Button disabled if TP insufficient | `src/pages/battle.js` lines 274-447 |

### Edge Cases
| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Lobby Join | Empty nickname input | Prevents submit, highlights input in red |
| 2 | Dice Confirmation | Clicking confirm without selecting required count | `#btn-confirm` is disabled until exact required slot count selected |
| 3 | Dream Target Selection | Opponent triggers FXR dream domain | Appears overlay `#dream-target-modal` blocking normal action until target chosen |
| 4 | Opponent Disconnect | Opponent disconnects during battle | Displays text `对手已断开连接` in `#phase-text` |
