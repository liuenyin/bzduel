import gsap from 'gsap';

const AURA_CLASSES = [
  'aura-gpy-rage',
  'aura-dream-domain',
  'aura-zxs-water',
  'aura-yzm-gold',
  'aura-wyc-redheat',
  'aura-whd-sugar'
];

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

const EFFECT_COLORS = {
  buff: '#4f8f57',
  debuff: '#c45c5c',
  blessing: '#c09a50',
  neutral: '#5b8fb9',
  tactical: '#b06f79',
  counter: '#7c5fb3',
};

/**
 * GSAP Visual Effects Manager Singleton
 */
export const vfxManager = {
  /**
   * Physics 3D Dice Roll Animation with GSAP spring/bounce easing
   * @param {NodeList|Array<HTMLElement>} diceElements - Array of .die DOM elements
   * @param {Array<number>} [finalValues] - Array of target dice numbers
   * @param {Function} [onComplete] - Optional callback upon completion
   */
  rollDice(diceElements, finalValues = [], onComplete = null) {
    const validEls = Array.from(diceElements || []).filter(el => el && typeof el === 'object' && el.style);
    if (validEls.length === 0) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    if (prefersReducedMotion()) {
      gsap.set(validEls, { clearProps: 'transform,opacity', opacity: 1, scale: 1 });
      if (typeof onComplete === 'function') onComplete();
      return null;
    }

    // Disable CSS animation keyframe interference on dice elements
    validEls.forEach(el => {
      el.style.animation = 'none';
    });

    const tl = gsap.timeline({
      onComplete: () => {
        if (typeof onComplete === 'function') onComplete();
      }
    });

    tl.fromTo(validEls,
      {
        transformPerspective: 600,
        rotateX: -180,
        rotateY: -180,
        scale: 0.4,
        opacity: 0,
        y: -25
      },
      {
        rotateX: 720,
        rotateY: 360,
        scale: 1.15,
        opacity: 1,
        y: 0,
        duration: 0.45,
        ease: 'back.out(1.8)',
        stagger: 0.08
      }
    ).to(validEls, {
      scale: 1.0,
      duration: 0.15,
      ease: 'power2.out'
    });

    return tl;
  },

  /**
   * Fluid Hit Impact: Camera Impulse + Damage Flash + Floating Text + Particles
   * @param {HTMLElement} targetCardElement - Target card container
   * @param {number} damageAmount - Damage value (0 for MISS)
   * @param {Object} [options={}] - Additional hit parameters
   * @param {boolean} [options.isCrit=false] - Whether damage is critical
   * @param {boolean} [options.isHeavy=false] - Whether damage is heavy
   * @param {boolean} [options.nineLivesTriggered=false] - Revival halo effect
   * @param {boolean} [options.pierce=false] - Pierce visual line effect
   * @param {Function} [onComplete] - Callback when hit animation finishes
   */
  playHitImpact(targetCardElement, damageAmount, options = {}, onComplete = null) {
    const opts = options || {};
    const safeDmg = Number.isFinite(damageAmount) ? damageAmount : 0;
    const isCrit = opts.isCrit || safeDmg >= 8;
    const isHeavy = opts.isHeavy || safeDmg >= 15;

    const reducedMotion = prefersReducedMotion();
    const tone = opts.nineLivesTriggered
      ? 'revival'
      : (opts.counter ? 'counter' : (opts.pierce ? 'pierce' : (safeDmg === 0 ? 'blocked' : (isHeavy ? 'heavy' : 'normal'))));

    // 1. Camera Impulse
    if (!reducedMotion && safeDmg > 0) {
      const impulseScale = isHeavy ? 2.5 : (isCrit ? 1.8 : 1.0);
      this.triggerCameraImpulse(impulseScale);
    }

    // 2. Floating Damage Text & Flash
    if (targetCardElement && document.body.contains(targetCardElement)) {
      this.spawnFloatingDamage(targetCardElement, safeDmg, isCrit, { tone });

      // 3. Hit Flash on Target Card
      if (opts.nineLivesTriggered) {
        gsap.fromTo(targetCardElement,
          { filter: 'brightness(1.7) saturate(1.5)', scale: 0.97 },
          { filter: 'none', scale: 1.0, duration: reducedMotion ? 0.12 : 0.55, ease: 'power2.out' }
        );
      } else if (isHeavy) {
        gsap.fromTo(targetCardElement,
          { filter: 'brightness(2) sepia(0.8) hue-rotate(-50deg) saturate(4)', scale: 0.95 },
          { filter: 'none', scale: 1.0, duration: 0.5, ease: 'power2.out' }
        );
      } else {
        gsap.fromTo(targetCardElement,
          { filter: 'brightness(1.4) saturate(1.5)', x: -4 },
          { filter: 'none', x: 0, duration: 0.35, ease: 'elastic.out(1, 0.4)' }
        );
      }

      // 4. Nine Lives Revival Halo Effect
      if (opts.nineLivesTriggered) {
        this.triggerRevivalHalo(targetCardElement);
      }

      // 5. Particle Burst
      const rect = targetCardElement.getBoundingClientRect();
      const cx = rect.width > 0 ? (rect.left + rect.width / 2) : (window.innerWidth / 2);
      const cy = rect.height > 0 ? (rect.top + rect.height / 2) : (window.innerHeight / 2);
      const particleColor = tone === 'revival'
        ? '#c09a50'
        : (tone === 'pierce' ? '#5b8fb9' : (tone === 'counter' ? EFFECT_COLORS.counter : (safeDmg === 0 ? '#6a9e6d' : (isCrit ? '#c09a50' : '#c45c5c'))));
      if (!reducedMotion) this.spawnParticles(cx, cy, isCrit ? 20 : 10, particleColor);
    }

    if (typeof onComplete === 'function') {
      setTimeout(onComplete, 450);
    }
  },

  /**
   * Camera Impulse (Fluid GSAP Screen Shake)
   * @param {number} [intensity=1.0] - Impulse scale
   */
  triggerCameraImpulse(intensity = 1.0) {
    if (prefersReducedMotion()) return null;
    const target = document.querySelector('.arena') || document.querySelector('#app') || document.body;
    const safeIntensity = Number.isFinite(intensity) ? intensity : 1.0;
    const range = Math.min(14, Math.max(0, 6 * safeIntensity));
    const shakeTl = gsap.timeline();

    shakeTl.to(target, { x: `-=${range}`, y: `+=${range / 2}`, duration: 0.04, ease: 'power1.inOut' })
           .to(target, { x: `+=${range * 1.2}`, y: `-=${range}`, duration: 0.04, ease: 'power1.inOut' })
           .to(target, { x: `-=${range * 0.8}`, y: `+=${range / 2}`, duration: 0.05, ease: 'power1.inOut' })
           .to(target, { x: 0, y: 0, duration: 0.06, ease: 'power2.out' });

    return shakeTl;
  },

  /**
   * Floating Damage Text Animation
   * @param {HTMLElement} targetElement - Container element to anchor damage text
   * @param {number} damageAmount - Value to display (or 0 for MISS)
   * @param {boolean} [isCrit=false] - Critical hit flag
   */
  spawnFloatingDamage(targetElement, damageAmount, isCrit = false, options = {}) {
    if (!targetElement || !document.body.contains(targetElement)) return null;

    const validDmg = Number.isFinite(damageAmount) ? damageAmount : 0;
    const tone = options?.tone || (validDmg === 0 ? 'blocked' : 'normal');
    const dmgEl = document.createElement('div');
    dmgEl.className = `floating-damage ${validDmg === 0 ? 'miss' : ''} ${isCrit ? 'crit' : ''} tone-${tone}`;
    dmgEl.textContent = validDmg > 0 ? `−${validDmg}` : '格挡';
    dmgEl.style.animation = 'none';

    targetElement.appendChild(dmgEl);

    const tl = gsap.timeline({
      onComplete: () => {
        dmgEl.remove();
      }
    });

    tl.fromTo(dmgEl,
      { y: 0, scale: 0.3, opacity: 0 },
      { y: -45, scale: isCrit ? 1.4 : 1.0, opacity: 1, duration: 0.3, ease: 'back.out(2)' }
    ).to(dmgEl,
      { y: -75, opacity: 0, duration: 0.5, ease: 'power2.in', delay: 0.35 }
    );

    return dmgEl;
  },

  /**
   * Display Premium Light Glassmorphic Skill Banner with GSAP Spring Physics
   * cubic-bezier(0.175, 0.885, 0.32, 1.275) / back.out(1.8)
   * @param {string} title - Skill title
   * @param {string} [subtitle=''] - Subtitle description
   * @param {string} [type='pos'] - Theme type ('pos', 'neg', 'neu', 'gold', 'crimson', 'azure')
   */
  showSkillBanner(title, subtitle = '', type = 'pos') {
    const banner = document.createElement('div');
    banner.className = `skill-glass-banner ${type}`;
    banner.innerHTML = `
      <div class="banner-title-text">${title}</div>
      ${subtitle ? `<div class="banner-subtitle-text">${subtitle}</div>` : ''}
    `;

    const container = document.querySelector('.arena-center') || document.body;
    container.appendChild(banner);

    const reducedMotion = prefersReducedMotion();
    const tl = gsap.timeline({
      onComplete: () => {
        banner.remove();
      }
    });

    tl.fromTo(banner,
      { y: -40, opacity: 0, scale: 0.82 },
      { y: 0, opacity: 1, scale: 1.0, duration: reducedMotion ? 0.12 : 0.5, ease: reducedMotion ? 'none' : 'back.out(1.8)' }
    ).to(banner,
      { y: reducedMotion ? 0 : -20, opacity: 0, scale: reducedMotion ? 1 : 0.9, duration: reducedMotion ? 0.12 : 0.4, ease: 'power2.in', delay: reducedMotion ? 0.8 : 1.8 }
    );

    return banner;
  },

  /**
   * High-Impact Ultimate Skill Visual Effects & Domain Expansion
   * @param {string} characterId - Character ID (e.g. 'char_fxr', 'lgpyForm', 'char_19', 'char_4', 'char_14')
   * @param {string} ultimateName - Ultimate skill key or title
   * @param {HTMLElement} [containerElement=document.body] - Container element
   */
  triggerUltimateVFX(characterId, ultimateName, containerElement = document.body) {
    this.triggerCameraImpulse(2.2);

    const targetContainer = (containerElement && document.body.contains(containerElement)) ? containerElement : document.body;

    if (prefersReducedMotion()) {
      const reducedTitles = {
        DREAM_KING: '梦境领域 · 展开',
        FXR_DOMAIN: '梦境领域 · 展开',
        DREAM_KING_RAGE: 'gpy 狂暴斩杀形态',
        TIMELESS_GRACE: '亘古不变之优雅',
        STAR_SHOWOFF: '观星 · 显眼包',
        BUY_WATER: '蓄势爆发',
      };
      this.showSkillBanner(reducedTitles[ultimateName] || ultimateName || '技能发动', '', 'neu');
      return null;
    }

    if (characterId === 'char_fxr' || ultimateName === 'DREAM_KING' || ultimateName === 'FXR_DOMAIN') {
      // 1. Fu Xiuran Domain Expansion ("梦境领域")
      this.showSkillBanner('梦境领域 · 展开', '付修然 展开梦境领域！盲选真身与分身', 'neu');

      const overlay = document.createElement('div');
      overlay.className = 'fxr-domain-overlay';
      overlay.innerHTML = `
        <div class="domain-ring ring-1"></div>
        <div class="domain-ring ring-2"></div>
        <div class="domain-ring ring-3"></div>
      `;
      targetContainer.appendChild(overlay);

      // Camera impulse zoom
      const arena = document.querySelector('.arena') || document.body;
      gsap.fromTo(arena,
        { scale: 1.0 },
        { scale: 1.05, duration: 0.35, ease: 'back.out(1.8)', yoyo: true, repeat: 1 }
      );

      // Spawn ethereal translucent shards
      const shardColors = ['rgba(192, 132, 252, 0.7)', 'rgba(168, 85, 247, 0.6)', 'rgba(232, 121, 249, 0.6)'];
      for (let i = 0; i < 16; i++) {
        const shard = document.createElement('div');
        shard.className = 'domain-shard';
        const size = Math.random() * 18 + 10;
        shard.style.width = `${size}px`;
        shard.style.height = `${size * 1.5}px`;
        shard.style.left = `${Math.random() * 100}%`;
        shard.style.top = `${Math.random() * 100}%`;
        shard.style.background = shardColors[Math.floor(Math.random() * shardColors.length)];
        overlay.appendChild(shard);

        gsap.to(shard, {
          y: -120 - Math.random() * 100,
          rotation: Math.random() * 360,
          opacity: 0,
          scale: 0.3,
          duration: 1.5 + Math.random() * 1.0,
          ease: 'power2.out'
        });
      }

      gsap.to(overlay, {
        opacity: 0,
        duration: 0.8,
        delay: 2.2,
        ease: 'power2.in',
        onComplete: () => overlay.remove()
      });

    } else if (characterId === 'lgpyForm' || ultimateName === 'DREAM_KING_RAGE') {
      // 2. Dream King Rage Form ("gpy 狂暴斩杀形态")
      this.showSkillBanner('gpy 狂暴斩杀形态', '血量降至 20% 以下，封印解除！', 'crimson');

      const vignette = document.createElement('div');
      vignette.className = 'redheat-vignette';
      targetContainer.appendChild(vignette);

      gsap.fromTo(targetContainer,
        { filter: 'brightness(2.2) saturate(2.5)' },
        { filter: 'none', duration: 0.7, ease: 'power2.out' }
      );

      const rect = targetContainer.getBoundingClientRect();
      this.spawnParticles(rect.width / 2, rect.height / 2, 28, '#ef4444');

      gsap.to(vignette, {
        opacity: 0,
        duration: 0.6,
        delay: 1.8,
        ease: 'power2.in',
        onComplete: () => vignette.remove()
      });

    } else if (characterId === 'char_19' || ultimateName === 'TIMELESS_GRACE') {
      // 3. Yan Ziming ("Timeless Grace · 极致优雅")
      this.showSkillBanner('Timeless Grace · 极致优雅', '数点成双！无视防御 / 额外回合', 'gold');

      const beam = document.createElement('div');
      beam.className = 'gold-beam-sweep';
      targetContainer.appendChild(beam);

      gsap.fromTo(beam,
        { opacity: 0, scaleY: 0.2 },
        { opacity: 1, scaleY: 1, duration: 0.4, ease: 'back.out(1.5)' }
      );

      const rect = targetContainer.getBoundingClientRect();
      this.spawnParticles(rect.width / 2, rect.height / 2, 22, '#facc15');

      gsap.to(beam, {
        opacity: 0,
        duration: 0.5,
        delay: 1.6,
        ease: 'power2.in',
        onComplete: () => beam.remove()
      });

    } else if (characterId === 'char_4' || ultimateName === 'STAR_SHOWOFF') {
      // 4. Wang Hedi ("观星 & 显眼包")
      this.showSkillBanner('观星 & 显眼包', '极差 ≤ 2！伤害重构与判定反转', 'gold');

      const constellation = document.createElement('div');
      constellation.className = 'star-constellation-overlay';
      targetContainer.appendChild(constellation);

      const rect = targetContainer.getBoundingClientRect();
      this.spawnParticles(rect.width / 2, rect.height / 3, 24, '#38bdf8');
      this.spawnParticles(rect.width / 2, (rect.height * 2) / 3, 24, '#facc15');

      gsap.fromTo(constellation,
        { opacity: 0, scale: 0.7 },
        { opacity: 1, scale: 1.1, duration: 0.5, ease: 'back.out(1.6)' }
      );

      gsap.to(constellation, {
        opacity: 0,
        duration: 0.6,
        delay: 1.6,
        ease: 'power2.in',
        onComplete: () => constellation.remove()
      });

    } else if (characterId === 'char_14' || ultimateName === 'BUY_WATER') {
      // 5. Zhou Xuansheng ("天子蓄势 · 极水崩山")
      this.showSkillBanner('天子蓄势 · 极水崩山', '消耗 2 层蓄势！+16 伤害 & 穿透防护', 'azure');

      const wave = document.createElement('div');
      wave.className = 'azure-water-wave';
      targetContainer.appendChild(wave);

      gsap.fromTo(wave,
        { y: '100%', opacity: 0 },
        { y: '-10%', opacity: 1, duration: 0.6, ease: 'power2.out' }
      );

      const rect = targetContainer.getBoundingClientRect();
      this.spawnParticles(rect.width / 2, rect.height / 2, 24, '#0ea5e9');

      gsap.to(wave, {
        opacity: 0,
        duration: 0.5,
        delay: 1.5,
        ease: 'power2.in',
        onComplete: () => wave.remove()
      });

    } else {
      // Generic Ultimate Fallback
      this.showSkillBanner(ultimateName || '终极奥义', '技能爆发！', 'pos');
    }
  },

  /**
   * Revival Halo Animation for Zhang Jin Yuan (Nine Lives)
   * @param {HTMLElement} cardElement - .battle-card element
   */
  triggerRevivalHalo(cardElement) {
    if (!cardElement || !document.body.contains(cardElement)) return;

    const ring = document.createElement('div');
    ring.className = 'revival-halo-ring';
    cardElement.appendChild(ring);

    // Golden brightness flash on card
    gsap.fromTo(cardElement,
      { filter: 'brightness(2.2) sepia(0.8) hue-rotate(5deg)', scale: 1.08 },
      { filter: 'none', scale: 1.0, duration: 0.8, ease: 'power2.out' }
    );

    // Expanding ring timeline
    gsap.fromTo(ring,
      { scale: 0.1, opacity: 1 },
      { scale: 1.5, opacity: 0, duration: 1.2, ease: 'power2.out', onComplete: () => ring.remove() }
    );

    // Spawn 18 golden particles radiating outwards
    const rect = cardElement.getBoundingClientRect();
    const cx = rect.width > 0 ? (rect.left + rect.width / 2) : (window.innerWidth / 2);
    const cy = rect.height > 0 ? (rect.top + rect.height / 2) : (window.innerHeight / 2);
    this.spawnParticles(cx, cy, 18, '#ffd700');
  },

  /**
   * Briefly marks the active attacker without blocking controls.
   */
  playTurnTransition(cardElement, options = {}) {
    if (!cardElement || !document.body.contains(cardElement)) return null;
    const extraTurn = !!options.extraTurn;
    const ring = document.createElement('div');
    ring.className = `turn-transition-ring ${extraTurn ? 'extra' : 'normal'}`;
    ring.innerHTML = `<span>${options.label || (extraTurn ? '额外回合' : '攻击回合')}</span>`;
    cardElement.appendChild(ring);

    const reducedMotion = prefersReducedMotion();
    const tl = gsap.timeline({ onComplete: () => ring.remove() });
    tl.fromTo(ring,
      { opacity: 0, scale: reducedMotion ? 1 : 0.88 },
      { opacity: 1, scale: 1, duration: reducedMotion ? 0.1 : 0.28, ease: 'power2.out' }
    ).to(ring, {
      opacity: 0,
      scale: reducedMotion ? 1 : 1.05,
      duration: reducedMotion ? 0.12 : 0.42,
      delay: reducedMotion ? 0.35 : 0.65,
      ease: 'power2.in',
    });

    if (!reducedMotion) {
      gsap.fromTo(cardElement, { scale: 0.985 }, { scale: 1, duration: 0.45, ease: 'back.out(1.5)' });
    }
    return tl;
  },

  /**
   * Animates status additions and removals in the compact status row.
   */
  playStatusChange(element, options = {}) {
    if (!element || !document.body.contains(element)) return null;
    const added = options.added !== false;
    const color = EFFECT_COLORS[options.category] || EFFECT_COLORS.neutral;
    if (prefersReducedMotion()) {
      gsap.fromTo(element, { opacity: 0.75 }, { opacity: 1, duration: 0.12 });
      return null;
    }
    return added
      ? gsap.fromTo(element,
          { opacity: 0, scale: 0.78, y: 5, boxShadow: `0 0 0 ${color}` },
          { opacity: 1, scale: 1, y: 0, boxShadow: `0 0 12px ${color}55`, duration: 0.42, ease: 'back.out(1.8)', clearProps: 'boxShadow' }
        )
      : gsap.fromTo(element,
          { opacity: 0.78, boxShadow: `inset 0 0 0 1px ${color}66` },
          { opacity: 1, boxShadow: 'none', duration: 0.3, ease: 'power2.out' }
        );
  },

  /**
   * Small local flash for a skill, tactical log entry, counter, or state trigger.
   */
  playSkillTrigger(element, type = 'neutral') {
    if (!element || !document.body.contains(element)) return null;
    const color = EFFECT_COLORS[type] || EFFECT_COLORS.neutral;
    const flash = document.createElement('span');
    flash.className = `skill-trigger-flash trigger-${type}`;
    flash.style.setProperty('--skill-trigger-color', color);
    element.appendChild(flash);

    const reducedMotion = prefersReducedMotion();
    const tl = gsap.timeline({ onComplete: () => flash.remove() });
    tl.fromTo(flash,
      { opacity: 0, scale: reducedMotion ? 1 : 0.7 },
      { opacity: 0.8, scale: 1, duration: reducedMotion ? 0.08 : 0.2, ease: 'power2.out' }
    ).to(flash, {
      opacity: 0,
      scale: reducedMotion ? 1 : 1.08,
      duration: reducedMotion ? 0.1 : 0.32,
      ease: 'power2.in',
    });
    return tl;
  },

  /**
   * Tactical card feedback with type-aware color and target resolution.
   */
  playTacticalCardResolved(sourceCardEl, targetCardEl, options = {}, onComplete = null) {
    const color = EFFECT_COLORS[options.cardType] || EFFECT_COLORS.tactical;
    if (prefersReducedMotion()) {
      if (targetCardEl) this.playSkillTrigger(targetCardEl, options.cardType || 'tactical');
      if (typeof onComplete === 'function') onComplete();
      return null;
    }
    return this.playTacticalCardVFX(sourceCardEl, targetCardEl, onComplete, { color });
  },

  /**
   * Tactical Card Play Feedback (Card elevation, sheen, traveling particles to target)
   * @param {HTMLElement} sourceCardEl - Source card DOM element
   * @param {HTMLElement} targetCardEl - Target card DOM element
   * @param {Function} [onComplete=null] - Optional callback
   */
  playTacticalCardVFX(sourceCardEl, targetCardEl, onComplete = null, options = {}) {
    const isSourceValid = sourceCardEl && document.body.contains(sourceCardEl);
    const isTargetValid = targetCardEl && document.body.contains(targetCardEl);

    if (isSourceValid) {
      // 1. Elevate source card
      gsap.fromTo(sourceCardEl,
        { y: 0, scale: 1 },
        { y: -25, scale: 1.08, duration: 0.25, ease: 'back.out(1.6)' }
      );

      // 2. Sheen highlight
      const sheen = document.createElement('div');
      sheen.className = 'tactical-card-sheen';
      sourceCardEl.appendChild(sheen);
      gsap.fromTo(sheen,
        { x: '-100%' },
        { x: '100%', duration: 0.4, ease: 'power2.inOut', onComplete: () => sheen.remove() }
      );
    }

    // 3. Traveling particles from source to target
    const sRect = isSourceValid ? sourceCardEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight - 100, width: 0, height: 0 };
    const tRect = isTargetValid ? targetCardEl.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };

    const startX = sRect.width > 0 ? (sRect.left + sRect.width / 2) : (window.innerWidth / 2);
    const startY = sRect.height > 0 ? (sRect.top + sRect.height / 2) : (window.innerHeight - 100);
    const endX = tRect.width > 0 ? (tRect.left + tRect.width / 2) : (window.innerWidth / 2);
    const endY = tRect.height > 0 ? (tRect.top + tRect.height / 2) : (window.innerHeight / 2);

    const particleContainer = document.createElement('div');
    particleContainer.style.position = 'fixed';
    particleContainer.style.inset = '0';
    particleContainer.style.pointerEvents = 'none';
    particleContainer.style.zIndex = '9999';
    document.body.appendChild(particleContainer);

    const tl = gsap.timeline({
      onComplete: () => {
        particleContainer.remove();
        if (isTargetValid) {
          // Target hit ripple
          gsap.fromTo(targetCardEl,
            { filter: 'brightness(1.5) saturate(1.8)', scale: 1.05 },
            { filter: 'none', scale: 1.0, duration: 0.35, ease: 'power2.out' }
          );
        }
        if (typeof onComplete === 'function') onComplete();
      }
    });

    for (let i = 0; i < 15; i++) {
      const p = document.createElement('div');
      p.style.position = 'absolute';
      p.style.left = `${startX}px`;
      p.style.top = `${startY}px`;
      p.style.width = '6px';
      p.style.height = '6px';
      p.style.borderRadius = '50%';
      const particleColor = options.color || '#0ea5e9';
      p.style.backgroundColor = particleColor;
      p.style.boxShadow = `0 0 8px ${particleColor}`;
      particleContainer.appendChild(p);

      const delay = i * 0.02;
      const spreadX = (Math.random() - 0.5) * 40;
      const spreadY = (Math.random() - 0.5) * 40;

      tl.to(p, {
        x: endX - startX + spreadX,
        y: endY - startY + spreadY,
        duration: 0.4,
        ease: 'power2.out'
      }, delay);
    }

    return tl;
  },

  /**
   * Dynamic Aura & Glow Transition for Character Cards
   * @param {HTMLElement} cardElement - .battle-card DOM element
   * @param {string} auraClass - Active aura CSS class name
   */
  triggerAuraEffect(cardElement, auraClass) {
    if (!cardElement) return;

    AURA_CLASSES.forEach(c => cardElement.classList.remove(c));
    if (auraClass) {
      cardElement.classList.add(auraClass);
      const tl = gsap.timeline();
      tl.fromTo(cardElement,
        { scale: 0.97, opacity: 0.85 },
        { scale: 1.02, opacity: 1.0, duration: 0.35, ease: 'back.out(1.5)' }
      ).to(cardElement, {
        scale: 1.0,
        duration: 0.2,
        ease: 'power2.out'
      });
      return tl;
    }
  },

  /**
   * Particle Burst Helper (for hits, crits, and rolls)
   * @param {number} x - Screen X coordinate
   * @param {number} y - Screen Y coordinate
   * @param {number} [count=12] - Number of particles
   * @param {string} [color='var(--accent)'] - Particle color hex/var
   */
  spawnParticles(x, y, count = 12, color = 'var(--accent)') {
    const numParticles = (count === null || count === undefined) ? 12 : count;
    const particleColor = color || 'var(--accent)';

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
    container.style.pointerEvents = 'none';
    container.style.zIndex = '9999';
    document.body.appendChild(container);

    const particleTl = gsap.timeline({
      onComplete: () => {
        container.remove();
      }
    });

    for (let i = 0; i < numParticles; i++) {
      const particle = document.createElement('div');
      const size = Math.floor(Math.random() * 5) + 4;
      particle.style.position = 'absolute';
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.borderRadius = '50%';
      particle.style.backgroundColor = particleColor;
      particle.style.boxShadow = `0 0 6px ${particleColor}`;

      container.appendChild(particle);

      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 45 + 15;
      const destX = Math.cos(angle) * dist;
      const destY = Math.sin(angle) * dist;

      particleTl.to(particle, {
        x: destX,
        y: destY,
        scale: Math.random() * 0.5 + 0.2,
        opacity: 0,
        duration: 0.4 + Math.random() * 0.3,
        ease: 'power2.out'
      }, 0);
    }

    return particleTl;
  }
};

export const rollDice = vfxManager.rollDice.bind(vfxManager);
export const playHitImpact = vfxManager.playHitImpact.bind(vfxManager);
export const triggerCameraImpulse = vfxManager.triggerCameraImpulse.bind(vfxManager);
export const spawnFloatingDamage = vfxManager.spawnFloatingDamage.bind(vfxManager);
export const triggerUltimateVFX = vfxManager.triggerUltimateVFX.bind(vfxManager);
export const showSkillBanner = vfxManager.showSkillBanner.bind(vfxManager);
export const triggerRevivalHalo = vfxManager.triggerRevivalHalo.bind(vfxManager);
export const playTacticalCardVFX = vfxManager.playTacticalCardVFX.bind(vfxManager);
export const playTacticalCardResolved = vfxManager.playTacticalCardResolved.bind(vfxManager);
export const playTurnTransition = vfxManager.playTurnTransition.bind(vfxManager);
export const playStatusChange = vfxManager.playStatusChange.bind(vfxManager);
export const playSkillTrigger = vfxManager.playSkillTrigger.bind(vfxManager);
export const triggerAuraEffect = vfxManager.triggerAuraEffect.bind(vfxManager);
export const spawnParticles = vfxManager.spawnParticles.bind(vfxManager);

if (typeof window !== 'undefined') {
  window.vfxManager = vfxManager;
}

export default vfxManager;
