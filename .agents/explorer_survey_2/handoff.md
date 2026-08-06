# Handoff Report — Battle Mechanics & VFX Survey

## 1. Observation
Directly observed project structure, battle engine, dice rolling animations, hit impact mechanisms, character rosters, and state management in `school-dice-duel`:

1. **Battle Engine State Machine**:
   - Location: `server/game/engine.js` (1925 lines).
   - Core phase machine: `phase` (`PREPARATION`, `BATTLE`, `GAME_OVER`), `turnPhase` (`CHOOSE_TARGET`, `WAITING_ATK`, `ATK_ROLLED`, `DEF_ROLLED`).
   - Manages 1v1 and SanGuoSha FFA mode, 60 tactical cards, TP system, and draft shop after classes 2, 4, 6.
2. **Dice Rolling Triggers & Animation**:
   - Triggers: `rollAttack()` (`engine.js:170`), `rerollDice()` (`engine.js:309`), `confirmAttack()` (`engine.js:431`).
   - Client handler: `renderDice()` (`src/pages/battle.js:488`).
   - Current animation: CSS `@keyframes diceRoll` in `src/style/index.css:331-335` (basic 3D rotate/scale CSS keyframes) + Web Audio synth `playDiceRoll()` in `src/utils/audio.js:22`.
3. **Damage Calculation & Hit Feedback**:
   - Location: `confirmDefense()` (`engine.js:614`) & `onTurnResolved()` (`src/pages/battle.js:715-840`).
   - Current Screen Shake: Uses rigid body displacement `document.body.classList.add('shake-screen')` (`battle.js:812`, `index.css:336-342`), which shifts `document.body` by 2-4px.
   - Attacker & defender animation: `.card-attacking` (`index.css:365`), `.card-hit` (`index.css:379`), `.floating-damage` (`index.css:389`), `.damage-flash` (`index.css:1168`).
4. **Character Roster & Ultimate Abilities**:
   - Location: `shared/characters.js` (480 lines) & `server/game/engine.js`.
   - Complete count: **18 characters** (`char_3` to `char_19`, plus `char_fxr`).
   - **Fu Xiuran ("Domain Expansion" / 梦境之王)**: `SKILL.DREAM_KING` (lines 465-468) grants 1 Dream stack on chosen sum >= 15; at 3 stacks enters "Dream King" domain next class. Opponent blind-selects 1 of 3 targets (A, B, C); decoys use D7+D9+D9+D9+D11 pool with 0 damage to real body, real body locks lethal damage to 3 HP. Negative `SKILL.ELEPHANT_CONDEMN`: opponent HP < 20% forces opponent into gpy berserk mode & seals Fu Xiuran's skills & ends dream domain.
   - Other notable ultimates: Wang Hedi (Star Showoff x Sugar Crash), Li Can (Gal Player counter & sacrifice), Zeng Wuwei (Eat It), Zhang Chuwei (Extra Turn counter), Liu Yichen (AoE Rapper), Zhou Xuansheng (Water Charge), Zhang Jinyuan (Nine Lives Revival), Yan Ziming (Timeless Grace pierce & extra turn).
5. **State Management & VFX Integration**:
   - Client uses `animLock` (`battle.js:10, 716`) to block `state_update` DOM overwrites during animation playback.
   - State `S` is read-only on client; VFX can be triggered cleanly via Socket event listeners (`atk_confirmed`, `turn_resolved`, `class_change`).

## 2. Logic Chain
1. **Observation**: `engine.js` is pure state reducer, while `battle.js` listens to Socket events (`state_update`, `atk_confirmed`, `turn_resolved`) and uses `animLock` during animation sequences.
   - **Inference**: VFX upgrades can be added strictly in `battle.js` and CSS/JS animation layers without modifying server logic or corrupting state `S`.
2. **Observation**: Damage >= 8 triggers `document.body.classList.add('shake-screen')`, moving the whole `<body>` element.
   - **Inference**: Requirement R2 explicitly asks to avoid cheap screen shaking. Replacing `shake-screen` on `document.body` with targeted card micro-vibrations, chromatic aberration, or GSAP punch effects satisfies R2 cleanly.
3. **Observation**: Dice rolling currently uses CSS `@keyframes diceRoll` and Web Audio oscillators.
   - **Inference**: Smooth dice rolling can be enhanced using GSAP physics easing curves or 3D canvas overlays in `#dice-area`.
4. **Observation**: Fu Xiuran's "Domain Expansion" triggers `inDreamState` and mounts a static CSS gradient `#fxr-dream-bg`.
   - **Inference**: A full-screen glassmorphism / particle / domain expansion curtain transition can hook directly into `fxr-dream-bg` mounting or `inDreamState` activation.

## 3. Caveats
- No code modifications were performed in `src/`, `server/`, or `shared/` as this is a read-only investigation.
- Sound synthesis (`src/utils/audio.js`) relies on Web Audio API oscillators; browser autoplay policies require user interaction before first audio playback.

## 4. Conclusion
- The battle engine state machine in `server/game/engine.js` is fully deterministic and decoupled from rendering.
- All 18 characters and their ultimate abilities have been mapped out in detail, with Fu Xiuran's Domain Expansion ("梦境之王") and gpy Berserk mode ("小象的谴责") identified as the primary target for high-impact full-screen VFX.
- VFX hook locations (`renderDice()`, `onTurnResolved()`, `updateAura()`, `#fxr-dream-bg`) have been pinpointed.
- Detailed survey report recorded at `E:/School+AI/school-dice-duel/.agents/explorer_survey_2/survey_battle_mechanics.md`.

## 5. Verification Method
1. Inspect survey document: `view_file` on `E:/School+AI/school-dice-duel/.agents/explorer_survey_2/survey_battle_mechanics.md`.
2. Verify character definitions: `view_file` on `E:/School+AI/school-dice-duel/shared/characters.js`.
3. Verify battle rendering hooks: `view_file` on `E:/School+AI/school-dice-duel/src/pages/battle.js`.
