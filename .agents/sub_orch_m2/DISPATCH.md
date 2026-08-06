# DISPATCH — Milestone 2: Physics Dice Roll & Hit Impact VFX Engine

## Mission
Orchestrate the design, implementation, and verification of Milestone 2:
1. Create GSAP Animation Manager (`src/utils/vfx.js`) with physics-based spring easing, 3D dice roll tumble, directional hit impulses, damage flashes, floating damage numbers, and aura bloom.
2. Integrate `vfxManager` into `src/pages/battle.js` (`renderDice()` and combat damage hooks).
3. Execute Explorer -> Worker -> Reviewer / Challenger / Auditor iteration loop until gate passes cleanly.

## 2026-08-06T09:24:07Z
You are sub_orch_m2, the Sub-orchestrator for Milestone 2: Physics Dice Roll & Hit Impact VFX Engine.

Working directory: E:/School+AI/school-dice-duel/.agents/sub_orch_m2
Scope document: E:/School+AI/school-dice-duel/.agents/sub_orch_m2/SCOPE.md
Global project index: E:/School+AI/school-dice-duel/PROJECT.md
Verbatim request: E:/School+AI/school-dice-duel/.agents/ORIGINAL_REQUEST.md

PROCEDURE:
1. Read E:/School+AI/school-dice-duel/.agents/sub_orch_m2/BRIEFING.md, progress.md, SCOPE.md, DISPATCH.md, PROJECT.md, and E:/School+AI/school-dice-duel/.agents/ORIGINAL_REQUEST.md.
2. Dispatch 1 teamwork_preview_explorer (explorer_m2_1) to inspect src/pages/battle.js and design the exact GSAP integration plan for src/utils/vfx.js (rollDice, playHitImpact, camera impulse, floating damage text, aura bloom) and how renderDice() and combat damage hooks in battle.js should call vfxManager.
3. Dispatch 1 teamwork_preview_worker (worker_m2_1) to build src/utils/vfx.js and hook it into src/pages/battle.js. Require worker to run Vite build (npm run build) to ensure a clean build.
   MUST include this verbatim in worker dispatch:
   "DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected."
4. Dispatch 2 teamwork_preview_reviewer agents, 2 teamwork_preview_challenger agents, and 1 teamwork_preview_auditor agent for Iteration 1 gate check.
5. Evaluate gate verdicts in GATE_STATUS.md.
   Pass criteria: All Reviewers APPROVE, all Challengers PASS/APPROVE, Auditor CLEAN.
   Auditor failure or integrity violation is a BINARY VETO.
6. Once gate PASSES:
   - Update Milestone 2 Status in E:/School+AI/school-dice-duel/PROJECT.md to DONE.
   - Write handoff.md in your working directory E:/School+AI/school-dice-duel/.agents/sub_orch_m2/handoff.md.
   - Send completion message back to parent orchestrator.
