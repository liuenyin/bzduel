import { JSDOM } from 'jsdom';

// ----------------------------------------------------
// Setup JSDOM Environment for Empirical Stress Testing
// ----------------------------------------------------
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div><div id="sandbox"></div></body></html>', {
  url: 'http://localhost/'
});

global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.sessionStorage = dom.window.sessionStorage;
global.HTMLElement = dom.window.HTMLElement;
global.NodeList = dom.window.NodeList;
global.Element = dom.window.Element;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

const { vfxManager } = await import('../src/utils/vfx.js');
const { onTurnResolved, renderBattle } = await import('../src/pages/battle.js');

async function runChallengerM32Suite() {
  console.log('====================================================');
  console.log('🔥 CHALLENGER M3_2 EMPIRICAL STRESS & EDGE CASE SUITE');
  console.log('====================================================\n');

  const testResults = [];
  const record = (name, pass, details) => {
    testResults.push({ name, pass, details });
    const symbol = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${symbol} | ${name}`);
    console.log(`   Details: ${details}\n`);
  };

  const sandbox = document.getElementById('sandbox');

  // Track uncaught exceptions globally
  const uncaughtErrors = [];
  const uncaughtHandler = (err) => {
    uncaughtErrors.push(err);
    console.error('⚠️ Uncaught Exception Captured:', err.message || err);
  };
  process.on('uncaughtException', uncaughtHandler);

  // ----------------------------------------------------
  // TEST 1: Revival Halos (triggerRevivalHalo) Stress & Edge Cases
  // ----------------------------------------------------
  {
    sandbox.innerHTML = '';
    const cardEl = document.createElement('div');
    cardEl.className = 'battle-card';
    sandbox.appendChild(cardEl);

    let normalOk = false;
    try {
      vfxManager.triggerRevivalHalo(cardEl);
      const ring = cardEl.querySelector('.revival-halo-ring');
      normalOk = !!ring;
    } catch (e) {
      normalOk = false;
    }

    let nullOk = true;
    try {
      vfxManager.triggerRevivalHalo(null);
      vfxManager.triggerRevivalHalo(undefined);
    } catch (e) {
      nullOk = false;
    }

    let detachedOk = true;
    try {
      const detachedEl = document.createElement('div');
      detachedEl.className = 'battle-card';
      vfxManager.triggerRevivalHalo(detachedEl);
    } catch (e) {
      detachedOk = false;
    }

    let spamOk = true;
    try {
      for (let i = 0; i < 100; i++) {
        vfxManager.triggerRevivalHalo(cardEl);
      }
    } catch (e) {
      spamOk = false;
    }

    const removeEl = document.createElement('div');
    removeEl.className = 'battle-card';
    sandbox.appendChild(removeEl);
    vfxManager.triggerRevivalHalo(removeEl);
    setTimeout(() => { removeEl.remove(); }, 20);

    await new Promise(r => setTimeout(r, 1400));

    const pass1 = normalOk && nullOk && detachedOk && spamOk;
    record('Revival Halos (triggerRevivalHalo) Stress & Edge Cases', pass1,
      `Normal execution: ${normalOk}, Null safety: ${nullOk}, Detached safety: ${detachedOk}, 100x Spam safety: ${spamOk}`);
  }

  // ----------------------------------------------------
  // TEST 2: Tactical Card Play VFX (playTacticalCardVFX) Stress & Edge Cases
  // ----------------------------------------------------
  {
    sandbox.innerHTML = '';
    const srcCard = document.createElement('div');
    srcCard.className = 'hand-card-kards';
    const tgtCard = document.createElement('div');
    tgtCard.className = 'battle-card';
    sandbox.appendChild(srcCard);
    sandbox.appendChild(tgtCard);

    let cbFired = false;
    const tl = vfxManager.playTacticalCardVFX(srcCard, tgtCard, () => { cbFired = true; });
    if (tl && typeof tl.progress === 'function') {
      tl.progress(1); // Force timeline completion to verify callback execution
    }

    let missingSrcOk = true;
    try { vfxManager.playTacticalCardVFX(null, tgtCard); } catch (e) { missingSrcOk = false; }

    let missingTgtOk = true;
    try { vfxManager.playTacticalCardVFX(srcCard, null); } catch (e) { missingTgtOk = false; }

    let missingBothOk = true;
    try { vfxManager.playTacticalCardVFX(null, null); } catch (e) { missingBothOk = false; }

    let cardSpamOk = true;
    try {
      for (let i = 0; i < 50; i++) {
        const dSrc = document.createElement('div');
        const dTgt = document.createElement('div');
        sandbox.appendChild(dSrc);
        sandbox.appendChild(dTgt);
        vfxManager.playTacticalCardVFX(dSrc, dTgt);
      }
    } catch (e) { cardSpamOk = false; }

    const multiTargets = [1, 2, 3, 4].map(() => {
      const el = document.createElement('div');
      el.className = 'ffa-micro-card';
      sandbox.appendChild(el);
      return el;
    });
    let multiCombatOk = true;
    try {
      multiTargets.forEach(tgt => vfxManager.playTacticalCardVFX(srcCard, tgt));
    } catch (e) { multiCombatOk = false; }

    const tempSrc = document.createElement('div');
    const tempTgt = document.createElement('div');
    sandbox.appendChild(tempSrc);
    sandbox.appendChild(tempTgt);
    vfxManager.playTacticalCardVFX(tempSrc, tempTgt);
    setTimeout(() => { tempSrc.remove(); tempTgt.remove(); }, 50);

    await new Promise(r => setTimeout(r, 600));

    const pass2 = cbFired && missingSrcOk && missingTgtOk && missingBothOk && cardSpamOk && multiCombatOk;
    record('Tactical Card Play VFX (playTacticalCardVFX) Stress & Edge Cases', pass2,
      `Callback executed: ${cbFired}, Null Src/Tgt/Both safe: ${missingSrcOk && missingTgtOk && missingBothOk}, 50x Spam safe: ${cardSpamOk}, Multi-target safe: ${multiCombatOk}`);
  }

  // ----------------------------------------------------
  // TEST 3: Card Aura Transitions (triggerAuraEffect) Stress & Edge Cases
  // ----------------------------------------------------
  {
    sandbox.innerHTML = '';
    const auraCard = document.createElement('div');
    auraCard.className = 'battle-card';
    sandbox.appendChild(auraCard);

    let auraExecError = null;
    try {
      vfxManager.triggerAuraEffect(auraCard, 'aura-gpy-rage');
    } catch (e) {
      auraExecError = e.message;
    }

    let nullAuraOk = true;
    try {
      vfxManager.triggerAuraEffect(null, 'aura-gpy-rage');
      vfxManager.triggerAuraEffect(auraCard, null);
    } catch (e) { nullAuraOk = false; }

    const pass3 = !auraExecError && nullAuraOk;
    record('Card Aura Transitions (triggerAuraEffect) Stress & Edge Cases', pass3,
      auraExecError ? `CRITICAL BUG DETECTED: ${auraExecError}` : `Aura transitions executed smoothly`);
  }

  // ----------------------------------------------------
  // TEST 4: Ultimate VFX (triggerUltimateVFX) & Domain Expansion Stress
  // ----------------------------------------------------
  {
    sandbox.innerHTML = '';
    const arenaCenter = document.createElement('div');
    arenaCenter.className = 'arena-center';
    sandbox.appendChild(arenaCenter);

    let hasDomain = false;
    try {
      vfxManager.triggerUltimateVFX('char_fxr', 'DREAM_KING', arenaCenter);
      const domainOverlay = arenaCenter.querySelector('.fxr-domain-overlay');
      hasDomain = !!domainOverlay;
    } catch (e) {
      hasDomain = false;
    }

    let otherUltOk = true;
    try {
      vfxManager.triggerUltimateVFX('lgpyForm', 'DREAM_KING_RAGE', arenaCenter);
      vfxManager.triggerUltimateVFX('char_19', 'TIMELESS_GRACE', arenaCenter);
      vfxManager.triggerUltimateVFX('char_4', 'STAR_SHOWOFF', arenaCenter);
      vfxManager.triggerUltimateVFX('char_14', 'BUY_WATER', arenaCenter);
      vfxManager.triggerUltimateVFX('unknown_char', 'GENERIC_ULT', arenaCenter);
    } catch (e) { otherUltOk = false; }

    let nullContainerOk = true;
    try {
      vfxManager.triggerUltimateVFX('char_fxr', 'DREAM_KING', null);
    } catch (e) { nullContainerOk = false; }

    let ultSpamOk = true;
    try {
      for (let i = 0; i < 30; i++) {
        vfxManager.triggerUltimateVFX('char_fxr', 'DREAM_KING', sandbox);
      }
    } catch (e) { ultSpamOk = false; }

    await new Promise(r => setTimeout(r, 2500));

    const pass4 = hasDomain && otherUltOk && nullContainerOk && ultSpamOk;
    record('Ultimate VFX & Domain Expansion Stress & Edge Cases', pass4,
      `Domain Expansion overlay created: ${hasDomain}, Ultimates safe: ${otherUltOk}, Null container safe: ${nullContainerOk}, 30x Spam safe: ${ultSpamOk}`);
  }

  // ----------------------------------------------------
  // TEST 5: Hit Impact (playHitImpact) Edge Case - Null Options Parameter
  // ----------------------------------------------------
  {
    sandbox.innerHTML = '';
    const targetCard = document.createElement('div');
    targetCard.className = 'battle-card';
    sandbox.appendChild(targetCard);

    let nullOptionsError = null;
    try {
      vfxManager.playHitImpact(targetCard, 10, null);
    } catch (e) {
      nullOptionsError = e.message;
    }

    let nullTargetOk = true;
    try { vfxManager.playHitImpact(null, 10); } catch (e) { nullTargetOk = false; }

    let hitSpamOk = true;
    try {
      for (let i = 0; i < 100; i++) {
        vfxManager.playHitImpact(targetCard, i % 20, { isCrit: i % 2 === 0 });
      }
    } catch (e) { hitSpamOk = false; }

    await new Promise(r => setTimeout(r, 600));

    const pass5 = !nullOptionsError && nullTargetOk && hitSpamOk;
    record('Hit Impact (playHitImpact) Edge Cases & Null Options Parameter', pass5,
      nullOptionsError ? `CRITICAL BUG DETECTED when options=null: ${nullOptionsError}` : `Hit impacts safe`);
  }

  // ----------------------------------------------------
  // TEST 6: Battle Integration & Multi-target Combat Turn Resolution
  // ----------------------------------------------------
  {
    sandbox.innerHTML = '';
    const ffaState = {
      gameMode: 'sanguosha',
      myIndex: 0,
      attackerIdx: 0,
      defenderIdx: null,
      schedule: ['math'],
      currentClassIndex: 0,
      me: { id: 'p1', hp: 30, maxHp: 30, card: { name: 'P1' } },
      players: [
        { id: 'p1', nickname: 'P1', hp: 30, maxHp: 30, cardId: 'char_fxr', inDreamState: true },
        { id: 'p2', nickname: 'P2', hp: 25, maxHp: 30, cardId: 'char_19' },
        { id: 'p3', nickname: 'P3', hp: 20, maxHp: 30, cardId: 'char_14', chargeStacks: 2 },
        { id: 'p4', nickname: 'P4', hp: 15, maxHp: 30, cardId: 'char_4' }
      ]
    };

    let renderOk = true;
    try {
      renderBattle(sandbox, { state: ffaState });
    } catch (e) {
      renderOk = false;
    }

    let turnResolvedOk = true;
    try {
      onTurnResolved({
        isAoE: true,
        aoeResults: [
          { playerId: 'p1', damage: 0, nineLivesTriggered: false },
          { playerId: 'p2', damage: 8, nineLivesTriggered: false },
          { playerId: 'p3', damage: 16, nineLivesTriggered: true },
          { playerId: 'p4', damage: 25, nineLivesTriggered: false }
        ],
        state: ffaState,
        damage: 0,
        finalDef: 0,
        attackerIdx: 0
      });
    } catch (err) {
      turnResolvedOk = false;
    }

    await new Promise(r => setTimeout(r, 2600));

    const pass6 = renderOk && turnResolvedOk;
    record('Battle Integration & Multi-target Combat Turn Resolution', pass6,
      `Render battle: ${renderOk}, Turn resolved AoE: ${turnResolvedOk}`);
  }

  process.removeListener('uncaughtException', uncaughtHandler);

  // ----------------------------------------------------
  // Summary & Overall Verdict
  // ----------------------------------------------------
  const passedAll = testResults.every(r => r.pass) && uncaughtErrors.length === 0;
  const overallVerdict = passedAll ? 'PASS' : 'FAIL';

  console.log('====================================================');
  console.log(`📊 CHALLENGER M3_2 VERDICT: ${overallVerdict}`);
  console.log('====================================================\n');

  process.exit(passedAll ? 0 : 1);
}

runChallengerM32Suite().catch(err => {
  console.error('Fatal Test Exception:', err);
  process.exit(1);
});
