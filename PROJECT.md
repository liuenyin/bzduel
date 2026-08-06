# Project: School Dice Duel UI/UX & VFX Overhaul

## Architecture
- **Tech Stack**: Vanilla JS + Vite SPA frontend (`src/`), Express + Socket.IO server (`server/`), Playwright E2E testing (`tests/e2e/`).
- **Styling Architecture**: Light & fresh glassmorphic UI (`src/style/index.css`, `src/styles/autochess.css`).
- **Animation Engine**: GSAP-powered VFX manager (`src/utils/vfx.js`).
- **Data Flow**: Event-driven client-server socket state machine (`server/game/engine.js` <-> `src/pages/battle.js`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Light/Fresh UI & Glassmorphism | Upgrade color palette, convert dark overlays (`.game-over-screen`, `.class-banner`, `.dream-target-modal-panel`, `.fxr-dream-bg`) to light glassmorphic designs (`rgba(255,255,255,0.85)` + backdrop-filter blur). | M1 | ORIGINAL_REQUEST R1 |
| 2 | Mobile Responsiveness & Layout Fixes | Eliminate UI collision between KARDS Tactical FAB button and Chat Widget on mobile (<680px), ensure zero horizontal overflow, compact battle cards/modals for mobile. | M1 | ORIGINAL_REQUEST R3 |
| 3 | GSAP Animation Manager Setup | Install GSAP and create unified animation manager `src/utils/vfx.js` for spring easing, timeline controls, particle effects. | M2 | ORIGINAL_REQUEST R2 |
| 4 | Physics-based Smooth Dice Rolling | Implement 3D dynamic dice rolling animations with spring/bounce easing in `renderDice()`. | M2 | ORIGINAL_REQUEST R2 |
| 5 | Damage Flash & Hit Impact VFX | Replace rigid screen shake (`.shake-screen`) with fluid GSAP camera impulse, directional damage flashes, hit ripples, floating damage numbers. | M2 | ORIGINAL_REQUEST R2 |
| 6 | Character Ultimate High-Impact Effects | Full-screen light glassmorphic domain expansion for Fu Xiuran (`DREAM_KING`), high-impact visual overlays for Dream King, Yan Ziming, Wang Hedi, Zhou Xuansheng, and all character skills. | M3 | ORIGINAL_REQUEST R2 |
| 7 | Aura & Particle Visual Polish | Upgrade character card aura overlays, revival halos, tactical card play feedback with modern GSAP particle & light bloom effects. | M3 | ORIGINAL_REQUEST R2 |
| 8 | Playwright E2E Test Suite Creation | Create `tests/e2e/ui_vfx_verification.spec.js` covering Tiers 1-4 (Lobby, Preparation, Battle, Dice roll, Damage, Ultimates, Mobile viewport). | E2E Track | ORIGINAL_REQUEST R4 |
| 9 | Agent-as-Judge Browser Exception Verification | Execute server and headless Playwright tests, capturing `page.on('console')` and `page.on('pageerror')` to verify 0 JS exceptions during VFX/battle interactions. | M4 / E2E Track | ORIGINAL_REQUEST R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Light Aesthetic & Mobile Layout Overhaul | Install GSAP, overhaul dark overlays to light glassmorphic designs, fix mobile FAB/Chat collision and overflow. | none | DONE |
| M2 | Physics Dice Roll & Hit Impact VFX Engine | Build `src/utils/vfx.js`, implement GSAP physics dice roll easing, directional hit impacts, damage flash. | M1 | DONE |
| M3 | Character Ultimates & High-Impact Effects | High-impact visual effects for Fu Xiuran's Domain Expansion, Dream King, and character ultimates. | M2 | DONE |
| M4 | E2E Headless Testing & Final Verification | Execute Playwright E2E test suite, verify zero JS exceptions across all VFX and battle interactions. | M3, TEST_READY | DONE |

## Interface Contracts
### `src/utils/vfx.js` ↔ `src/pages/battle.js`
- `vfxManager.rollDice(diceContainer, finalValues, callback)`: Triggers physics 3D dice roll with GSAP spring easing.
- `vfxManager.playHitImpact(targetCardElement, damageAmount, isCrit)`: Triggers directional hit impulse, damage flash, floating text.
- `vfxManager.triggerUltimateVFX(characterId, ultimateName, containerElement)`: Triggers high-impact full-screen domain expansion / ultimate visual overlay.
- `vfxManager.triggerAuraEffect(cardElement, auraType)`: Applies particle bloom / aura glow to character card.

## Code Layout
- `src/utils/vfx.js`: Core GSAP animation and particle manager.
- `src/style/index.css`: Light & fresh CSS styles, glassmorphism variables, mobile responsive rules.
- `src/pages/battle.js`: Battle UI rendering and event hook integration.
- `src/pages/preparation.js`: Character selection and ready view.
- `src/pages/lobby.js`: Lobby UI view.
- `tests/e2e/ui_vfx_verification.spec.js`: Playwright browser automation test suite.
