# Scope: Milestone 1 — Light Aesthetic & Mobile Layout Overhaul

## Objectives
1. Install GSAP dependency (`npm install gsap`).
2. Overhaul all dark UI overlays into pure Light/Fresh aesthetics with subtle glassmorphism (`rgba(255,255,255,0.85)` + `backdrop-filter: blur(12px)`, soft warm shadows, clean typography):
   - `.game-over-screen` (currently #0f172a) -> light glassmorphic card & overlay
   - `.class-banner` (currently #1e293b) -> light warm banner with blur
   - `.dream-target-modal-panel` (currently #170f26) -> light ethereal glass panel
   - `.fxr-dream-bg` (currently dark purple void) -> light shimmering dream aura
   - `.modal-overlay` (currently dark translucent) -> light frosted backdrop (`rgba(255,255,255,0.6)` or `rgba(240,235,225,0.7)`)
3. Fix mobile layout UI collisions (<680px):
   - Reposition/adjust `.hand-fab-container` (KARDS FAB button) so it never overlaps `.chat-widget`.
   - Ensure all battle cards, health bars, action buttons, and modals scale cleanly on mobile viewports (375px / 390px) with ZERO horizontal overflow.

## Code Files to Modify (Worker ownership)
- `package.json` (for GSAP dependency)
- `src/style/index.css` (primary stylesheet overhaul)
- `src/pages/battle.js` (modal structure and inline style adjustments if needed)
- `src/main.js` (chat widget container positioning on mobile if needed)

## Verification Plan
1. Worker runs `npm install gsap`, verifies build (`npm run build` or Vite check).
2. Reviewers inspect aesthetics, code quality, and CSS design system consistency.
3. Challengers verify layout responsiveness on 375px/390px/680px viewports with zero horizontal overflow.
4. Forensic Auditor checks for authentic changes, no hardcoded cheating.
