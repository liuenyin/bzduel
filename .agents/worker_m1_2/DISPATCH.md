# Task Assignment for worker_m1_2

## Context & Assignment
You are worker_m1_2, a teamwork_preview_worker implementing Iteration 2 fixes for Milestone 1: Light Aesthetic & Mobile Layout Overhaul.

Working directory: E:/School+AI/school-dice-duel/.agents/worker_m1_2
Project root: E:/School+AI/school-dice-duel

Mandatory files to read before starting:
- E:/School+AI/school-dice-duel/.agents/ORIGINAL_REQUEST.md
- E:/School+AI/school-dice-duel/.agents/sub_orch_m1/SCOPE.md
- E:/School+AI/school-dice-duel/.agents/sub_orch_m1/GATE_STATUS.md

## Fix Requirements
Implement all 4 specific fixes identified in Iteration 1 gate review:

1. **CSS Rule Order Bug**:
   In `src/style/index.css`, default `.hand-fab-container` (around line 1312) was declared AFTER `@media (max-width: 680px)` (around line 591).
   Move `@media (max-width: 680px)` and `@media (max-width: 480px)` responsive blocks to the VERY END of `src/style/index.css` so media query overrides take precedence over base styles.
   Ensure `.hand-fab-container` on mobile evaluates to `bottom: 58px; right: 16px; z-index: 9000`.

2. **Mobile Body Overflow**:
   `body.scrollWidth = 812px` on 375px/390px viewports because flex containers (`.arena-center`, `.panel`, `.stats-modal`, `.stats-matrix-wrap`) lack `min-width: 0; max-width: 100%`.
   Add `min-width: 0; max-width: 100%` to flex children (`.arena-center`, `.panel`, `.stats-modal`, `.stats-matrix-wrap` and related flex elements as appropriate) and add `overflow-x: hidden` to `html, body`.

3. **Dark Inline Style in Lobby Modal**:
   In `src/pages/lobby.js` (around line 53), `#stats-modal` has `class="modal-overlay"` but retains inline style `background:rgba(0,0,0,0.6)` and `box-shadow:0 10px 30px rgba(0,0,0,0.5)`.
   Remove dark inline background and box-shadow styles so `#stats-modal` uses the light frosted `.modal-overlay` class.

4. **Hardcoded Dark Hex**:
   In `src/style/index.css` (around line 1174), `.draft-shop-panel` uses `color: #1e293b;`.
   Replace with `color: var(--text);`.

## Build Verification
Run Vite build (`npm run build`) in `E:/School+AI/school-dice-duel` to ensure clean build with zero errors.

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Handoff Report
When finished, write `handoff.md` in your working directory `E:/School+AI/school-dice-duel/.agents/worker_m1_2/handoff.md` detailing exact changes made, build output (`npm run build`), and send message to parent sub_orch_m1.
