## 2026-08-06T12:05:42Z
You are a teamwork_preview_worker assigned to implement Milestone 1: Tactical Card Logic Fix (R1).
Working directory for your metadata: E:/School+AI/school-dice-duel/.agents/worker_m1
Original Request: E:/School+AI/school-dice-duel/.agents/ORIGINAL_REQUEST.md
Explorer Investigation Report: E:/School+AI/school-dice-duel/.agents/explorer_card_logic/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Instructions:
1. Create your folder E:/School+AI/school-dice-duel/.agents/worker_m1 and initialize BRIEFING.md and progress.md.
2. Read E:/School+AI/school-dice-duel/.agents/ORIGINAL_REQUEST.md and E:/School+AI/school-dice-duel/.agents/explorer_card_logic/handoff.md.
3. Modify the codebase to resolve R1:
   - In src/pages/battle.js (and server/index.js if needed), ensure playing a card from hand does NOT deduct TP or require reserve TP (0 TP to play). TP deduction happens only when purchasing from shop in server/game/engine.js.
   - In shared/cards.js, update getRandomCard(currentSubject, playerSubjects) so draft shop cards sample player subjects (`playerSubjects.includes(c.subject)`) as well as universal cards in a balanced manner.
   - Fix 1-star card pricing alignment so star ratings match tpCost (1 star = 1 TP purchase cost).
4. Run tests/verification scripts (e.g., node test scripts or Playwright if configured) to confirm changes pass without syntax or execution errors.
5. Document all changes and command results in E:/School+AI/school-dice-duel/.agents/worker_m1/handoff.md.
6. Send completion message back to parent (conversation ID: 8199553d-5cef-45a7-a0fd-5fa01635a398).
