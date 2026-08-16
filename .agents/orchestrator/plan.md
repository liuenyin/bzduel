# Project Plan — School Dice Duel

## Overview
Orchestrate bug fixes, UI/UX redesign, VFX restoration, and Playwright verification for School Dice Duel.

## Phase 0: Survey & Scoping
- Spawn 3 parallel `teamwork_preview_explorer` subagents to investigate:
  1. Card playing logic, TP deduction, shop distribution, and 1-star card pricing (`src/pages/battle.js`, `shared/cards.js`, shop logic).
  2. Tactical Card UI/UX layout and CSS styles (`.hand-card-kards`, `src/styles/battle.css`, overlays, tags).
  3. Visual Effects (VFX), character ultimate triggers, damage flashes, dice roll animations, and existing test suites (Playwright config/scripts).
- Synthesize explorer findings into `PROJECT.md`.

## Phase 1: Decompose & Milestone Planning
- M1: Tactical Card Logic & Shop Pricing Fix (R1)
- M2: Tactical Card UI/UX Overhaul (R2)
- M3: VFX Restoration & Debugging (R3)
- M4: E2E Playwright Verification & Hardening

## Phase 2: Execution & Verification
- For each milestone:
  1. Dispatch Explorer for targeted investigation and fix strategy.
  2. Dispatch Worker with mandatory integrity warning to implement fix & run tests.
  3. Dispatch 2 Reviewers independently to verify code quality, correctness, and UI/UX alignment.
  4. Dispatch 2 Challengers for empirical stress testing.
  5. Dispatch Forensic Auditor (`teamwork_preview_auditor`) for non-skippable integrity verification.
  6. Gate check: proceed if all pass; loop back on failure.

## Phase 3: Final Verification & Sentinel Notification
- Run full Playwright test suite to verify card logic, shop pricing, and zero JS console errors during VFX execution.
- Deliver summary report and claim victory to parent Sentinel.
