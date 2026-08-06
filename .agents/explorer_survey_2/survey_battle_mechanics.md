# School Dice Duel — Comprehensive Battle Mechanics & VFX Survey

## Executive Summary
This document provides a complete technical survey of the battle engine, state management, dice rolling mechanics, damage calculation, hit impact visual feedback, and character abilities (including ultimates) for **School Dice Duel** (`school-dice-duel`). It maps out exact file paths, line numbers, execution flows, and recommended clean hook locations for visual effects (VFX) upgrades.

---

## 1. Battle Logic & State Management Architecture

### 1.1 Architecture & State Machine
The game operates on an event-driven Client-Server state machine model over WebSockets (`socket.io`):
- **Server Engine (`server/game/engine.js`)**: Pure functional reducer / state updater. Owns authoritative state `S`.
- **Client Render Engine (`src/pages/battle.js`)**: Renders DOM based on state updates. Listens to Socket events.
- **Shared Definitions (`shared/`)**:
  - `shared/rules.js`: Core rules, subjects (15 subjects), game modes (1v1, SanGuoSha FFA), dice color schemes (`DICE_COLORS`), skill multipliers (`getSkillMultiplier`: 2x home, 1x minor, 0.5x away).
  - `shared/characters.js`: Defines all 18 character cards, base stats (HP, dice pool, atk/def slots), positive & negative skills.
  - `shared/cards.js`: Defines 60 tactical cards (45 subject-specific, 15 universal) and TP cost system.

### 1.2 Game Phases & Sub-Phases
State `state.phase` transitions:
1. `PHASE.PREPARATION` (`preparation`): Players choose character cards & click ready.
2. `PHASE.BATTLE` (`battle`): Main battle loop consisting of 6 subject classes (`CLASSES_PER_GAME = 6`), each with 2 sub-rounds (`SUBROUNDS_PER_CLASS = 2`).
3. `PHASE.GAME_OVER` (`game_over`): Victory/Defeat screen.

Sub-phases in `state.turnPhase`:
- `TURN.CHOOSE_TARGET` (`choose_target`): FFA Mode only — Attacker selects target player.
- `TURN.WAITING_ATK` (`waiting_atk`): Attacker rolls initial dice via `rollAttack()`.
- `TURN.ATK_ROLLED` (`atk_rolled`): Attacker can reroll via `rerollDice()` or select dice slots & confirm via `confirmAttack()`.
- `TURN.DEF_ROLLED` (`def_rolled`): Defender's dice auto-rolled by `confirmAttack()`. Defender can reroll via `rerollDice()` or select slots & confirm via `confirmDefense()`.

---

## 2. Dice Rolling Execution Flow & Animations

### 2.1 Trigger Chain
1. **Initial Roll**:
   - Client: User clicks `#btn-roll` -> `gameSocket.rollDice()` (`src/pages/battle.js:145`).
   - Server: Receives `roll_dice` socket message -> calls `rollAttack(state)` (`server/game/engine.js:170`).
   - Server calculates dice values (`rollDiceGroup(rollingPool)`), applies skill triggers (e.g. Liao Zhantao die inversion, Yan Ziming etiquette check), sets `turnPhase = TURN.ATK_ROLLED`, and broadcasts `state_update`.
2. **Reroll**:
   - Client: User selects dice elements `.die.selected` -> clicks `#btn-reroll` -> calls `gameSocket.rerollDice(indices)` (`src/pages/battle.js:154`).
   - Server: `rerollDice(state, playerId, indices)` (`server/game/engine.js:309`) recalculates values for selected indices, decrements `player.rerolls`, triggers reroll skills (Liao Zhantao, Yan Ziming self-damage), and updates state.
3. **Defense Auto-Roll**:
   - Client: Attacker confirms selected dice via `confirmAttack(state, keepIndices)` (`server/game/engine.js:431`).
   - Server automatically rolls defender's dice via `rollDiceGroup(getRollingPool(def))`, sets `turnPhase = TURN.DEF_ROLLED`, and returns `atkResult` & `defenseRolls`.

### 2.2 Dice Rendering & Current Animation Code
- **Render Location**: `renderDice()` function in `src/pages/battle.js:488-567`.
- **DOM Structure**: Rendered in `#dice-area`. Each die is a `<div class="die attack/defense ...">` with value and corner face badge (D4, D6, D8, D10, D12, etc.).
- **Stealth Hiding**: If Yin Zexuan (`char_10`) or stealth card is active, server sends `-1` and client renders `?`.
- **Current Rolling Animation**:
  - `src/style/index.css:330-335`:
    ```css
    .die.rolling { animation: diceRoll .45s cubic-bezier(.175,.885,.32,1.275); }
    @keyframes diceRoll {
      0% { transform: perspective(400px) rotateX(0deg) rotateY(0deg) scale(.5); opacity: .3; }
      50% { transform: perspective(400px) rotateX(360deg) rotateY(180deg) scale(1.15); opacity: 1; }
      100% { transform: perspective(400px) rotateX(720deg) rotateY(360deg) scale(1); }
    }
    ```
  - Audio: `playDiceRoll()` in `src/utils/audio.js` synthesizes 3 wood-like clicks using Web Audio API oscillators.

---

## 3. Damage Calculation, Hit Impacts, Health Updates & Screen Feedback

### 3.1 Damage Calculation Pipeline (`server/game/engine.js:614-1321`)
1. **Attacker Base Damage**: Sum of kept attack dice (`baseAtk`), multiplied by course multiplier `multi` for Jiang Pengze (`LIBERAL_ARTS`).
2. **Attacker Bonus & Multipliers**:
   - Wang Hedi (`STAR_SHOWOFF`): if range <= 2, damage multiplied by `(0.5 + multi)`.
   - Zhou Xuansheng (`BUY_WATER`): +8 damage per charge stack (`chargeStacks`).
   - Yin Zexuan (`STEALTH_STRIKE`): +`2 * multi` Atk.
   - Tactical cards (`calcTacticalCardEffects`): flat bonuses, multipliers (e.g., Music-1 x1.3), pierce.
3. **Defender Base Defense**: Sum of kept defense dice (`baseDef`), modified by subject multiplier for Jiang Pengze.
4. **Defensive Modifiers & Penalties**:
   - Ji Haoran (`REROLL_PENALTY`): permanent -2 DEF per reroll.
   - Zhou Xuansheng (`BUY_WATER`): attacker's charge stacks reduce defender's DEF to `1 / (1 + chargeStacks)`.
5. **Special Defensive Skills**:
   - Zeng Wuwei (`EAT_IT`): forces attacker's max kept die value to 2.
   - Huang Jiacheng (`TALENTED`): reduces final damage to 1x / 0.75x / 0.5x.
   - Fu Xiuran (`DREAM_KING`): decoy target takes 0 damage to real body; real body locks lethal damage to 3 HP.
   - Li Can (`GAL_PLAYER`): if DEF > ATK, counter-attacks for difference; sacrifice option turns die to 1 & heals.
   - Yu Han (`MAMA_HEAL`): overflow defense converted to heal x multi; (`MAMA_MERCY`): damage fixed to 1 against targets < 20% HP.
   - Xie Ruiqi (`STICKER_BOMB`): 2 stickers explode for 35% HP damage + 3 Red Heat.
   - Zhang Chuwei (`EXTRA_TURN`): >=8 damage taken grants immediate extra turn (+2 rerolls, +2 face values).
   - Zhang Jinyuan (`NINE_LIVES`): first death revives with 9 HP & converts all dice to D10.
6. **Final HP Deduction**: `p.hp = Math.max(0, p.hp - damage)`.

### 3.2 Hit Impact & Visual Feedback (`src/pages/battle.js:715-840` & `src/style/index.css`)
- **Attacker Card Movement**: `.card-attacking` class added to attacker's card container (`src/style/index.css:364-378`), animating horizontally via `@keyframes cardAtk`.
- **Defender Card Impact**: `.card-hit` class added to defender's card (`src/style/index.css:379-387`), shaking horizontally via `@keyframes cardHit`.
- **Floating Damage**: Dynamic `<div class="floating-damage">−N</div>` created and floated upward (`src/style/index.css:389-392`).
- **Heavy Hit Feedback (Damage >= 8)**:
  - Audio: `playHit(true)` (lower frequency bass thud).
  - **Screen Shake (Rigid Displacement)**: `document.body.classList.add('shake-screen')` (`src/pages/battle.js:812`).
    ```css
    .shake-screen { animation: screenImpulse .25s cubic-bezier(.36,.07,.19,.97) both; }
    @keyframes screenImpulse {
      10%,90% { transform: translate3d(-2px,0,0); }
      20%,80% { transform: translate3d(3px,-1px,0); }
      30%,50%,70% { transform: translate3d(-3px,2px,0); }
      40%,60% { transform: translate3d(3px,1px,0); }
    }
    ```
    *Note: This rigid position displacement on `document.body` causes noticeable layout shifts and is targeted for overhaul in R2.*
  - **High Damage Flash (Damage > 15)**: `defCard.classList.add('damage-flash')` (`src/style/index.css:1168-1174`).
- **Health Bar Update**: `setHP()` updates width with CSS `transition: width .5s ease`.

---

## 4. Complete Character Roster & Ultimate Abilities Enumeration

All 18 characters in the game are enumerated below:

| ID | Character Name | Title | HP | Dice Pool | Atk/Def Slots | Signature / Ultimate Ability Name | Ultimate Mechanism & Details |
|---|---|---|---|---|---|---|---|
| `char_fxr` | **付修然 (Fu Xiuran)** | 梦境之王 | 41 | `[4, 6, 6, 6, 8]` | 3 / 3 | **梦境之王 (Domain Expansion / Dream King)** | Chosen dice sum >= 15 grants 1 Dream stack (+1 reroll). At 3 stacks, enters "Dream King" domain next class. Opponent must blind-select 1 of 3 targets (A, B, C). Decoy targets use D7+D9+D9+D9+D11 dice pool, deal 0 damage to real body. Real body locks lethal damage to 3 HP! Also has **小象的谴责 (Elephant Condemn)**: opponent HP < 20% forces opponent into gpy berserk mode (D7+D9+D9+D9+D11 pool for 1 class), sealing skills & ending dream domain. |
| `char_3` | **计浩然 (Ji Haoran)** | 体委 | 33 | `[6, 6, 6, 8]` | 3 / 2 | **记号 (Marking)** | +1 reroll at attack start. If all chosen attack dice are odd, participating dice permanently increase face count by +2 (no upper cap). Negative: **体力透支** (Reroll on defense permanently reduces DEF by 2). |
| `char_4` | **王鹤迪 (Wang Hedi)** | 那个显眼包 | 30 | `[4, 4, 4, 6, 6]` | 4 / 3 | **观星 & 显眼包** | +2 rerolls at attack start. If 4 chosen dice range <= 2, damage multiplied by `(0.5 + course multiplier)`. Negative: **犯糖 & 全投** (>=8 damage taken inflicts Sugar Crash: no reroll, 4x multi self-damage each round; must reroll all dice). |
| `char_5` | **赵恩培 (Zhao Enpei)** | 团长 | 40 | `[4, 4, 4, 4]` | -1 / 4 | **团长大人！(Commander!)** | Defense without reroll permanently adds a D4/D6/D8 die to dice pool based on course multiplier. Negative: **不可持续发展** (Self-damage 2x multi at attack start). |
| `char_6` | **黄佳程 (Huang Jiacheng)** | +* | 22 | `[6, 8, 10, 12]` | 3 / 3 | **天赋怪 (Genius)** | Final damage taken reduced to 1x / 0.75x / 0.5x based on course multiplier. Negative: **过敏 & 杂鱼** (10% allergy locks atk to 2/4/8; if atk < def, current HP halved). |
| `char_7` | **王钰程 (Wang Yucheng)** | 不知道称号 | 32 | `[4, 4, 6, 6, 6]` | 3 / 3 | **玩（）玩的 (Red Heat)** | Attack damage applies `1 + 2*multi` Red Heat stacks to target. Negative: **你怎么急了** (If atk <= def, detonates opponent's Red Heat stacks into direct damage). |
| `char_8` | **李灿 (Li Can)** | 玩gal玩的 | 30 | `[6, 6, 6, 8]` | 3 / 4 | **休眠火山 (Gal Player)** | Counter-attacks for difference if DEF > ATK; can sacrifice a defense die to turn to 1 & heal `orig - 1` HP. Negative: None. |
| `char_9` | **曾无畏 (Zeng Wuwei)** | 吃掉! | 31 | `[6, 10, 10]` | 3 / 2 | **吃掉! (Eat it!)** | Defense forces opponent's max kept attack die to 2. Neutral: **D10 Limit** (Can only keep 1 D10 die on defense). |
| `char_10` | **殷泽轩 (Yin Zexuan)** | 隐藏者 | 33 | `[8, 8, 8, 8]` | 3 / 3 | **隐藏信息 (Stealth Strike)** | Opponent cannot view HP or dice roll values; +`2*multi` attack damage. Neutral: **Vulnerable** (Extra +`2*multi` damage taken when hit). |
| `char_11` | **姜鹏泽 (Jiang Pengze)** | 文科之光 | 28 | `[4, 4, 6, 6]` | 3 / 3 | **文科之光 (Light of Liberal Arts)** | Dice values multiplied by course multiplier (2x home, 1x neutral, 0.5x away). Negative: **偏科** (First damage taken reduces def slots by 1). |
| `char_12` | **张楚唯 (Zhang Chuwei)** | hammer | 37 | `[6, 6, 6, 6, 8]` | 3 / 3 | **死磕 (Counter-Strike)** | Taking >=8 damage grants an immediate extra attack turn with +2 rerolls & temporary +2 dice faces. Negative: **腰疼？** (Each extra turn permanently reduces def slots by 1). |
| `char_13` | **刘奕辰 (Liu Yichen)** | Rapper | 36 | `[4, 8, 12]` | 3 / 1 | **rapper (AoE Blast)** | SanGuoSha FFA mode: Primary target takes 100% damage, all other alive players take 33%/50%/66% AoE damage. Negative: **忘词** (Rerolling and missing targets inflicts self-damage). |
| `char_14` | **周煊声 (Zhou Xuansheng)** | 天子 | 30 | `[4, 6, 6, 8]` | 3 / 3 | **买水 (Water Charge)** | Skip attack without reroll to gain 1 Charge stack (max 2). Consuming stacks grants +8 damage/stack, +1 reroll, and reduces target def to `1/(1+stacks)`. Negative: **被发现** (+3 damage taken per charge stack). |
| `char_15` | **余汉 (Yu Han)** | 妈妈 | 35 | `[6, 6, 8, 8, 8]` | 3 / 3 | **妈! (Mama Heal)** | +1 defense reroll; overflow defense converted to heal x multi. Negative: **操碎了心** (Damage fixed to 1 against targets < 20% HP). |
| `char_16` | **张锦元 (Zhang Jinyuan)** | 喵 | 28 | `[6, 6, 8, 10]` | 3 / 3 | **九条命 (Nine Lives)** | First HP drop to 0 triggers instant revival with 9 HP and upgrades entire dice pool to D10. Negative: **贪睡** (-3 Atk/Def during round 1). |
| `char_17` | **谢睿琦 (Xie Ruiqi)** | 贴纸狂魔 | 33 | `[6, 6, 8, 8]` | 3 / 3 | **背后贴贴画 (Sticker Bomb)** | Damage attaches 1 sticker; 2 stickers explode for 35% HP damage + 3 Red Heat stacks. Negative: **被发现了!** (>=8 damage taken attaches sticker to self). |
| `char_18` | **廖展韬 (Liao Zhantao)** | N/A | 34 | `[8, 8, 8, 8, 10]` | 3 / 2 | **字斟句酌 (Die Inversion)** | +1 attack reroll; lowest die automatically inverted to face max; opponent cannot roll face max. Negative: **深度思考** (Rerolls permanently grant opponent +1 flat damage reduction). |
| `char_19` | **闫紫铭 (Yan Ziming)** | 优雅 | 33 | `[2, 2, 2, 4, 4, 6, 6]` | 5 / 4 | **Timeless Grace** | 3 identical dice -> +1 reroll; 4 identical -> ignore defense (pierce); 5 identical -> extra attack turn. Negative: **Inelegant!** (Rolling a 1 inflicts 1 true damage on self). |

---

## 5. State Management & Clean VFX Integration Hook Locations

### 5.1 Clean Integration Principle
- Game state `S` MUST NOT be corrupted by VFX libraries (GSAP / Anime.js / Canvas).
- VFX should be rendered as **non-blocking, layered visual overlays** that respond to socket events and state changes.
- The existing animation lock `animLock` in `src/pages/battle.js` prevents socket updates from rebuilding DOM mid-animation.

### 5.2 Specific VFX Hook Locations

1. **Dice Rolling Animation Hook**:
   - Location: `renderDice()` in `src/pages/battle.js:488` or when handling `roll_dice` / `reroll_dice`.
   - Clean Hook: Intercept dice DOM creation in `#dice-area`. Trigger 3D/physics tumbling/easing animation using GSAP or CSS transform before snapping to final values.

2. **Damage Flashes & Hit Impacts (Replacing Rigid Screen Shake)**:
   - Location: `onTurnResolved(data)` in `src/pages/battle.js:811-818`.
   - Action: **Remove `document.body.classList.add('shake-screen')`** (which displaces rigid layout).
   - Clean Hook: Apply targeted card chromatic aberration flash, GSAP scale punch on `#card-op` / `#card-me`, particle burst overlay, or subtle directional canvas pulse without displacing body layout.

3. **Fu Xiuran "Domain Expansion" (梦境之王) Full-Screen VFX Hook**:
   - Trigger: In `refreshAll()` or `onTurnResolved()`, when `p.inDreamState` is active or `p.pendingDreamState` triggers.
   - Current Code: Renders a static gradient background `#fxr-dream-bg` (`src/style/index.css:1121`).
   - Clean Hook: Trigger a full-screen GSAP/Canvas Domain Expansion transition (e.g. ethereal purple glassmorphism shatter, domain curtain expansion, dream particle fog overlay).

4. **Character Ultimate Aura & State VFX Hooks**:
   - Location: `getAuraClass(p)` and `updateAura(el, p)` in `src/pages/battle.js:1010-1027`.
   - Auras currently defined in `src/style/index.css`:
     - `.aura-gpy-rage` (gpy berserk mode).
     - `.aura-dream-domain` (Fu Xiuran dream state).
     - `.aura-zxs-water` (Zhou Xuansheng charge state).
     - `.aura-yzm-gold` (Yan Ziming gold aura).
     - `.aura-wyc-redheat` (Wang Yucheng Red Heat).
     - `.aura-whd-sugar` (Wang Hedi Sugar Crash).
   - Clean Hook: Replace static CSS box-shadow glow with animated SVG filters, particle rings, or dynamic glassmorphic edge highlights.

5. **Revival & Extra Turn VFX Hooks**:
   - Location: `onTurnResolved()` in `src/pages/battle.js:805` (`.revival-halo`) and line 705 (`extraTurnTriggered`).
   - Clean Hook: Trigger high-impact gold revival beam or time-rewind effect overlay.

---
*Report compiled by explorer_survey_2 for School Dice Duel.*
