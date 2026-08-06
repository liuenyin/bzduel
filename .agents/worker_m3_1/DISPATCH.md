## 2026-08-06T06:35:47Z
You are worker_m3_1 assigned to implement Milestone 3 (Domain Expansion & Character Ultimates High-Impact VFX) in School Dice Duel.
Working directory: E:/School+AI/school-dice-duel/.agents/worker_m3_1

Task Instructions:
1. Read E:/School+AI/school-dice-duel/.agents/explorer_m3_1/handoff.md, E:/School+AI/school-dice-duel/PROJECT.md, and C:/Users/86137/.gemini/config/skills/premium_game_ui_vfx/SKILL.md.
2. Upgrade `src/utils/vfx.js`:
   - Implement `triggerUltimateVFX(characterId, ultimateName, containerElement)` for Fu Xiuran's Domain Expansion (`DREAM_KING`), Dream King, Yan Ziming, Wang Hedi, Zhou Xuansheng.
   - Implement `showSkillBanner(title, subtitle, type)` with GSAP spring physics (`cubic-bezier(0.175, 0.885, 0.32, 1.275)`).
   - Implement `triggerRevivalHalo(cardElement)` and `playTacticalCardVFX(sourceCardEl, targetCardEl)`.
   - Upgrade `triggerAuraEffect(cardElement, auraType)` with GSAP pulse and `mix-blend-mode: screen/overlay` particle bloom.
3. Integrate into `src/pages/battle.js`:
   - Hook domain expansion triggers, ultimate skill activations, revival halos, and card play VFX in `onTurnResolved`, skill handlers, and card play hooks.
4. Add CSS styles in `src/style/index.css` and `src/styles/autochess.css`:
   - Light glassmorphic domain expansion overlays (`backdrop-filter: blur(16px)`, `rgba(255,255,255,0.85)`), layered shadows, animated background gradients, and spring easing rules.
5. Run `npx vite build` to verify clean compilation.
6. Write your detailed handoff report in `E:/School+AI/school-dice-duel/.agents/worker_m3_1/handoff.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
