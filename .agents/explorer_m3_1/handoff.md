# Milestone 3 Handoff Report: Domain Expansion & Character Ultimates High-Impact VFX

**Agent**: explorer_m3_1  
**Milestone**: Milestone 3 — Character Ultimates & High-Impact VFX  
**Working Directory**: `E:/School+AI/school-dice-duel/.agents/explorer_m3_1`  
**Date**: 2026-08-06  

---

## 1. Observation

Direct observations from inspecting `src/utils/vfx.js`, `src/pages/battle.js`, `src/style/index.css`, `src/styles/autochess.css`, `shared/characters.js`, `shared/rules.js`, and `server/game/engine.js`:

### 1.1 Current VFX Engine (`src/utils/vfx.js`)
- `vfxManager` currently provides:
  - `rollDice(diceElements, finalValues, callback)` (GSAP 3D spring dice roll).
  - `playHitImpact(targetCardElement, damageAmount, options, onComplete)` (camera impulse, damage flash, floating text, particle burst).
  - `triggerCameraImpulse(intensity)` (GSAP screen shake).
  - `spawnFloatingDamage(targetElement, damageAmount, isCrit)` (floating text).
  - `triggerAuraEffect(cardElement, auraClass)` (simple CSS class toggle with scale pulse).
  - `spawnParticles(x, y, count, color)` (fixed position particle burst).
- **Missing Interface Contracts**: `vfxManager.triggerUltimateVFX(characterId, ultimateName, containerElement)` specified in `PROJECT.md` is not implemented yet. Also missing: `showSkillBanner`, `playTacticalCardVFX`, `triggerRevivalHalo`.

### 1.2 Fu Xiuran's Domain Expansion (`DREAM_KING` / `char_fxr`)
- **Backend State (`server/game/engine.js`)**:
  - `dreamStacks`: Increments when dice sum $\ge 15$ (lines 476-485, 1024-1033).
  - `pendingDreamState`: Set to `true` when `dreamStacks >= 3`.
  - `inDreamState`: Toggled `true` at class transition, activating blind target selection (`realTargetIdx`, `dreamTargetChoice`).
- **Frontend Current Render (`src/pages/battle.js`)**:
  - Lines 201-209: Toggles DOM element `#fxr-dream-bg` based on `p.inDreamState && !p.lgpyForm`.
  - `src/style/index.css` lines 1132-1145: Defines `.fxr-dream-bg` with a static CSS radial gradient fade.
  - Lines 240-275: `checkDreamTargetModal(s)` displays glassmorphic blind selection popup.
- **Deficiencies**: Lacks entry sequence, full-screen glassmorphic domain expansion overlay, rotating light rings, ethereal floating shards, camera zoom impulse, and light bloom transitions.

### 1.3 Character Ultimate Skill Triggers & Overlays
- **Dream King (`lgpyForm`)**:
  - Triggered via `SKILL.ELEPHANT_CONDEMN` when opponent HP $< 20\%$ (`engine.js` lines 1076-1095).
  - Currently only sets `.buff-gpy` and `aura-gpy-rage`. Missing transformation banner and red heat visual vignette.
- **Yan Ziming (`char_19` - `TIMELESS_GRACE`)**:
  - Triggered during attack when dice contain 3, 4, or 5 identical numbers (`engine.js` lines 665-685, 946-962).
  - 3 matching = reroll refund; 4 matching = defense pierce; 5 matching = extra attack turn!
  - Currently only outputs standard text log. Missing imperial gold light beam overlay & glassmorphic skill banner.
- **Wang Hedi (`char_4` - `STAR_SHOWOFF`)**:
  - Triggered when chosen dice range $\max - \min \le 2$ (`engine.js` line 1302-1309) -> damage multiplied by $(0.5 + \text{multi})$.
  - Currently shows minor skill alert. Missing celestial star constellation burst & light banner.
- **Zhou Xuansheng (`char_14` - `BUY_WATER`)**:
  - Buying water accumulates `chargeStacks` (up to 2). Next attack consumes stacks for $+8$ damage/stack, $+1$ reroll, and defense fractioning.
  - Currently uses plain `showBanner()`. Missing azure water wave sweep & impact banner.

### 1.4 Card Auras, Revival Halos & Tactical Card Feedback
- **Card Auras**: Basic CSS box-shadows (`aura-gpy-rage`, `aura-dream-domain`, `aura-zxs-water`, `aura-yzm-gold`, `aura-wyc-redheat`, `aura-whd-sugar`). Lack `mix-blend-mode: screen/overlay` layered pseudo-glows and GSAP transitions.
- **Revival Halos**: Zhang Jin Yuan (`char_16` - `NINE_LIVES`). CSS `.revival-halo` keyframe exists, but lacks GSAP golden radial bloom and particle halo burst.
- **Tactical Card Play**: Clicking hand cards instantly emits socket event without visual feedback (card float-up, glass shine, disintegration into particles towards target).

---

## 2. Logic Chain

From the observations above, we establish the step-by-step logic for the Milestone 3 architectural design:

```
[Observation 1.1 & 1.2: Fu Xiuran inDreamState backend state]
       │
       ▼
[Logic Step 1: Detect domain state transitions in battle.js]
       │
       ▼
[Design Step 1: Full-screen Light Glassmorphic Domain Expansion]
   ├─ Ethereal animated background with rotating radial light rings & floating particles
   ├─ Backdrop blur (16px) with soft pastel violet-indigo gradient palette
   ├─ GSAP camera zoom & spring easing entrance banner: "梦境领域 · 展开"
   └─ Integration in vfxManager.triggerUltimateVFX('char_fxr', 'DREAM_KING')

[Observation 1.3: Ultimate skill triggers in engine.js & battle.js]
       │
       ▼
[Logic Step 2: Intercept skill trigger flags in onTurnResolved & onAtkConfirmed]
       │
       ▼
[Design Step 2: High-Impact Visual Overlays & Skill Banners]
   ├─ Dream King (lgpyForm): Crimson vignette flash + "gpy 狂暴斩杀形态" glass banner
   ├─ Yan Ziming (timeless_grace): Imperial gold beam sweep + "Timeless Grace · 极致优雅" glass banner
   ├─ Wang Hedi (star_showoff): Celestial constellation light burst + "观星 & 显眼包" glass banner
   ├─ Zhou Xuansheng (buy_water 2-stack): Azure tide wave sweep + "天子蓄势 · 极水崩山" glass banner
   └─ Standardized via vfxManager.showSkillBanner(title, subtitle, type)

[Observation 1.4: Card auras, revival halos & tactical card play]
       │
       ▼
[Logic Step 3: Upgrade particle & light bloom effects adhering to /premium-game-ui-vfx]
       │
       ▼
[Design Step 3: Aura Overlays, Halos & Tactical Play Feedback]
   ├─ Card Auras: mix-blend-mode: screen/overlay with animated radial gradient backdrops
   ├─ Revival Halos: GSAP expanding golden light ring & radial particle halo on Nine Lives trigger
   ├─ Tactical Card Play: Card lift + glass sheen + disintegration into GSAP particles toward target card
   └─ Spring physics cubic-bezier(0.175, 0.885, 0.32, 1.275) & brightness(2) juicy flashes
```

---

## 3. Caveats

1. **Read-Only Scope**: This report is an architectural investigation and detailed implementation plan. Code changes will be executed by the implementer agent.
2. **Mobile GPU & Performance Constraints**: Complex particle systems or full-screen CSS filters (`backdrop-filter`) can cause frame drops on low-end mobile devices. Particle counts must be capped at 20-30 particles, and GSAP timelines must automatically clean up created DOM nodes on completion.
3. **State Machine Sync**: Visual ultimate overlays and banners must not block game socket state updates (`animLock` in `battle.js` must be properly managed during multi-step animations).
4. **No Dark Theme Shift**: Per requirement R1, all domain backgrounds and ultimate banners must strictly maintain a light/fresh glassmorphic aesthetic (`rgba(255, 255, 255, 0.88)` to `rgba(245, 235, 255, 0.92)`).

---

## 4. Conclusion & Concrete Implementation Plan

### 4.1 Feature 1: Fu Xiuran Full-Screen Light Glassmorphic Domain Expansion (`DREAM_KING`)

#### Design Specification
- **Visual Style**: Ethereal light glassmorphism. Semi-transparent backdrop (`rgba(245, 235, 255, 0.85)` + `backdrop-filter: blur(16px)`), subtle rotating light rings, floating crystalline translucent particles, and fresh lavender/violet accents.
- **Activation Sequence**:
  1. Triggered when `inDreamState` becomes active or when domain activation occurs.
  2. `vfxManager.triggerUltimateVFX('char_fxr', 'DREAM_KING', container)` creates `.fxr-domain-overlay`.
  3. Camera impulse zoom scale (1.0 -> 1.05 -> 1.0) with GSAP spring easing (`back.out(1.8)`).
  4. Glassmorphic domain banner slides down from top with spring physics:
     - Title: `梦境领域 · 虚实交错`
     - Subtitle: `付修然 展开梦境领域！盲选真身与分身`
  5. Ambient floating particles spawn continuously while domain is active.

### 4.2 Feature 2: High-Impact Character Ultimate Overlays & Skill Banners

#### Character Skill Banners & Visual Effects:
1. **Dream King (`lgpyForm` / "gpy 狂暴斩杀形态")**:
   - Crimson brightness pulse (`filter: brightness(1.8) saturate(2)`).
   - Glassmorphic Banner: `gpy 狂暴斩杀形态` (Subtitle: `血量降至20%以下，封印解除！`).
   - Red heat vignette overlay with spark particles.
2. **Yan Ziming (`char_19` - `TIMELESS_GRACE`)**:
   - Gold beam sweep (`mix-blend-mode: overlay`).
   - Glassmorphic Banner: `Timeless Grace · 极致优雅` (Subtitle: `数点成双！无视防御 / 额外回合`).
   - Gold starburst particles.
3. **Wang Hedi (`char_4` - `STAR_SHOWOFF`)**:
   - Constellation light pattern burst.
   - Glassmorphic Banner: `观星 & 显眼包` (Subtitle: `极差≤2！伤害重构`).
   - Starlight particle cascade.
4. **Zhou Xuansheng (`char_14` - `BUY_WATER` 2-Stack Burst)**:
   - Azure water wave sweep across the battle arena.
   - Glassmorphic Banner: `天子蓄势 · 极水崩山` (Subtitle: `消耗2层蓄势！+16伤害 & 穿透防护`).
   - Water splash particles.

### 4.3 Feature 3: Card Aura Overlays, Revival Halos & Tactical Card Play Feedback

1. **Card Aura Overlays (`mix-blend-mode: screen/overlay`)**:
   - Upgrade CSS aura classes to use pseudo-elements (`::before` / `::after`) with `mix-blend-mode: screen` and animated radial gradients (`radial-gradient(circle, rgba(..., 0.6), transparent 70%)`).
   - Soft glow radius: `box-shadow: 0 0 25px rgba(..., 0.5), inset 0 0 15px rgba(..., 0.3)`.
2. **Revival Halo (`NINE_LIVES`)**:
   - `vfxManager.triggerRevivalHalo(targetCardElement)`:
     - Golden radial expanding ring from center of card (`scale: 0.1` -> `1.4`, `opacity: 1` -> `0`).
     - Card brightness flash (`brightness(2)` -> `1.0`).
     - Golden halo particle burst (18 particles radiating outwards).
3. **Tactical Card Play Feedback (`playTacticalCardVFX`)**:
   - When a tactical card is played from hand:
     1. Card element elevates (`translateY(-30px) scale(1.1)`).
     2. Glass sheen highlight passes across card face (`mix-blend-mode: overlay`).
     3. Card disintegrates into 15 GSAP particles traveling towards the target card/arena.
     4. Target card receives hit ripple / glow pulse before socket state update resolves.

---

## 5. Detailed Code Modification Architecture

### File 1: `src/utils/vfx.js`
Add new methods to `vfxManager`:
- `triggerUltimateVFX(characterId, ultimateName, containerElement)`: Orchestrates full-screen domain expansion and character ultimate overlays.
- `showSkillBanner(title, subtitle, type)`: Spawns premium glassmorphic banner with GSAP entrance/exit timelines (`cubic-bezier(0.175, 0.885, 0.32, 1.275)`).
- `triggerRevivalHalo(cardElement)`: Animates golden revival ring and particle halo.
- `playTacticalCardVFX(cardElement, targetCardElement, onComplete)`: Animates tactical card play disintegration & beam travel.
- Enhanced `triggerAuraEffect(cardElement, auraClass)`: Smooth GSAP aura transition.

### File 2: `src/pages/battle.js`
- Integrate `vfxManager.triggerUltimateVFX` and `showSkillBanner` in `onTurnResolved`, `onAtkConfirmed`, and domain transition state checks.
- Intercept tactical card clicks (`_playTacticalCard`) to trigger `vfxManager.playTacticalCardVFX()` prior to socket emit.
- Wire `vfxManager.triggerRevivalHalo` when `nineLivesTriggered` is true.

### File 3: `src/style/index.css`
- Add enhanced domain expansion styles (`.fxr-domain-overlay`, `.domain-ring`, `.domain-shard`).
- Upgrade `.skill-glass-banner` to light glassmorphism (`backdrop-filter: blur(16px)`, fresh borders, subtle shadows).
- Upgrade `.aura-*` classes with `mix-blend-mode: screen/overlay` pseudo-elements.
- Add `.tactical-card-sheen` and `.revival-halo-ring` CSS animations.

---

## 6. Verification Method

To verify Milestone 3 implementation independently:

1. **Build Verification**:
   - Run `npm run build` or `npx vite build` to ensure zero compilation errors.

2. **Playwright E2E Test Suite (`tests/e2e/ui_vfx_verification.spec.js`)**:
   - Execute Playwright test verifying:
     - Fu Xiuran Domain Expansion modal & overlay render cleanly without exception.
     - Character ultimate skill banners (Yan Ziming, Wang Hedi, Zhou Xuansheng, Dream King) trigger and display light glassmorphic styling.
     - Card aura glows and revival halo animate smoothly.
     - No JS exceptions logged in `page.on('pageerror')` or `page.on('console')`.
