import { JSDOM } from 'jsdom';

// ----------------------------------------------------
// Setup JSDOM Environment for Re-verification Stress Testing
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

async function runReverificationSuite() {
  console.log('====================================================');
  console.log('🔥 CHALLENGER M3_3 DEEP RE-VERIFICATION & STRESS SUITE');
  console.log('====================================================\n');

  const testResults = [];
  const uncaughtErrors = [];

  const uncaughtHandler = (err) => {
    uncaughtErrors.push(err);
    console.error('⚠️ Uncaught Exception Captured:', err.message || err);
  };
  process.on('uncaughtException', uncaughtHandler);

  const record = (name, pass, details) => {
    testResults.push({ name, pass, details });
    const symbol = pass ? '✅ PASS' : '❌ FAIL';
    console.log(`${symbol} | ${name}`);
    console.log(`   Details: ${details}\n`);
  };

  const sandbox = document.getElementById('sandbox');

  // ----------------------------------------------------
  // SUITE 1: Deep Stress & Edge Cases for triggerAuraEffect
  // ----------------------------------------------------
  {
    sandbox.innerHTML = '';
    const cardEl = document.createElement('div');
    cardEl.className = 'battle-card';
    sandbox.appendChild(cardEl);

    let singleAuraOk = true;
    try {
      vfxManager.triggerAuraEffect(cardEl, 'aura-gpy-rage');
      singleAuraOk = cardEl.classList.contains('aura-gpy-rage');
    } catch (e) {
      singleAuraOk = false;
    }

    let auraCycleOk = true;
    try {
      const auraList = ['aura-gpy-rage', 'aura-dream-domain', 'aura-zxs-water', 'aura-yzm-gold', 'aura-wyc-redheat', 'aura-whd-sugar'];
      for (let i = 0; i < 100; i++) {
        const aura = auraList[i % auraList.length];
        vfxManager.triggerAuraEffect(cardEl, aura);
      }
      auraCycleOk = auraList.some(a => cardEl.classList.contains(a));
    } catch (e) {
      auraCycleOk = false;
    }

    let nullCardOk = true;
    try {
      vfxManager.triggerAuraEffect(null, 'aura-gpy-rage');
      vfxManager.triggerAuraEffect(undefined, 'aura-gpy-rage');
    } catch (e) {
      nullCardOk = false;
    }

    let nullAuraOk = true;
    try {
      vfxManager.triggerAuraEffect(cardEl, null);
      vfxManager.triggerAuraEffect(cardEl, undefined);
    } catch (e) {
      nullAuraOk = false;
    }

    let unmountOk = true;
    try {
      const tempCard = document.createElement('div');
      sandbox.appendChild(tempCard);
      vfxManager.triggerAuraEffect(tempCard, 'aura-dream-domain');
      tempCard.remove();
    } catch (e) {
      unmountOk = false;
    }

    const pass1 = singleAuraOk && auraCycleOk && nullCardOk && nullAuraOk && unmountOk;
    record('triggerAuraEffect Deep Stress & Edge Cases', pass1,
      `Single aura: ${singleAuraOk}, 100x Cycle: ${auraCycleOk}, Null card safe: ${nullCardOk}, Null aura safe: ${nullAuraOk}, Unmount safe: ${unmountOk}`);
  }

  // ----------------------------------------------------
  // SUITE 2: Deep Stress & Edge Cases for playHitImpact(target, damage, null)
  // ----------------------------------------------------
  {
    sandbox.innerHTML = '';
    const targetEl = document.createElement('div');
    targetEl.className = 'battle-card';
    sandbox.appendChild(targetEl);

    let explicitNullOptionsOk = true;
    try {
      vfxManager.playHitImpact(targetEl, 10, null);
    } catch (e) {
      explicitNullOptionsOk = false;
    }

    let explicitUndefinedOptionsOk = true;
    try {
      vfxManager.playHitImpact(targetEl, 10, undefined);
    } catch (e) {
      explicitUndefinedOptionsOk = false;
    }

    let optionsVariantsOk = true;
    try {
      vfxManager.playHitImpact(targetEl, 5, { isCrit: true });
      vfxManager.playHitImpact(targetEl, 20, { isHeavy: true });
      vfxManager.playHitImpact(targetEl, 12, { nineLivesTriggered: true });
      vfxManager.playHitImpact(targetEl, 0, {});
    } catch (e) {
      optionsVariantsOk = false;
    }

    let nullTargetOk = true;
    try {
      vfxManager.playHitImpact(null, 10, null);
      vfxManager.playHitImpact(undefined, 10, null);
    } catch (e) {
      nullTargetOk = false;
    }

    let hitSpamOk = true;
    try {
      for (let i = 0; i < 100; i++) {
        vfxManager.playHitImpact(targetEl, i % 25, null);
      }
    } catch (e) {
      hitSpamOk = false;
    }

    let unmountHitOk = true;
    try {
      const tempTarget = document.createElement('div');
      sandbox.appendChild(tempTarget);
      vfxManager.playHitImpact(tempTarget, 15, null);
      tempTarget.remove();
    } catch (e) {
      unmountHitOk = false;
    }

    await new Promise(r => setTimeout(r, 600));

    const pass2 = explicitNullOptionsOk && explicitUndefinedOptionsOk && optionsVariantsOk && nullTargetOk && hitSpamOk && unmountHitOk;
    record('playHitImpact(target, damage, null) Deep Stress & Edge Cases', pass2,
      `Null options safe: ${explicitNullOptionsOk}, Undefined options safe: ${explicitUndefinedOptionsOk}, Options variants safe: ${optionsVariantsOk}, Null target safe: ${nullTargetOk}, 100x Spam safe: ${hitSpamOk}, Unmount safe: ${unmountHitOk}`);
  }

  // ----------------------------------------------------
  // SUITE 3: Deep Stress & Edge Cases for triggerRevivalHalo
  // ----------------------------------------------------
  {
    sandbox.innerHTML = '';
    const cardEl = document.createElement('div');
    cardEl.className = 'battle-card';
    sandbox.appendChild(cardEl);

    let haloSpawnOk = true;
    try {
      vfxManager.triggerRevivalHalo(cardEl);
      haloSpawnOk = !!cardEl.querySelector('.revival-halo-ring');
    } catch (e) {
      haloSpawnOk = false;
    }

    let nullHaloOk = true;
    try {
      vfxManager.triggerRevivalHalo(null);
      vfxManager.triggerRevivalHalo(undefined);
    } catch (e) {
      nullHaloOk = false;
    }

    let haloSpamOk = true;
    try {
      for (let i = 0; i < 100; i++) {
        vfxManager.triggerRevivalHalo(cardEl);
      }
    } catch (e) {
      haloSpamOk = false;
    }

    let unmountHaloOk = true;
    try {
      const tempEl = document.createElement('div');
      sandbox.appendChild(tempEl);
      vfxManager.triggerRevivalHalo(tempEl);
      tempEl.remove();
    } catch (e) {
      unmountHaloOk = false;
    }

    await new Promise(r => setTimeout(r, 1400));

    const pass3 = haloSpawnOk && nullHaloOk && haloSpamOk && unmountHaloOk;
    record('triggerRevivalHalo Deep Stress & Edge Cases', pass3,
      `Halo spawned: ${haloSpawnOk}, Null target safe: ${nullHaloOk}, 100x Spam safe: ${haloSpamOk}, Unmount safe: ${unmountHaloOk}`);
  }

  // ----------------------------------------------------
  // SUITE 4: Deep Stress & Edge Cases for playTacticalCardVFX
  // ----------------------------------------------------
  {
    sandbox.innerHTML = '';
    const srcEl = document.createElement('div');
    srcEl.className = 'hand-card-kards';
    const tgtEl = document.createElement('div');
    tgtEl.className = 'battle-card';
    sandbox.appendChild(srcEl);
    sandbox.appendChild(tgtEl);

    let cbFired = false;
    try {
      const tl = vfxManager.playTacticalCardVFX(srcEl, tgtEl, () => { cbFired = true; });
      if (tl && typeof tl.progress === 'function') {
        tl.progress(1);
      }
    } catch (e) {
      cbFired = false;
    }

    let nullCardsOk = true;
    try {
      vfxManager.playTacticalCardVFX(null, tgtEl);
      vfxManager.playTacticalCardVFX(srcEl, null);
      vfxManager.playTacticalCardVFX(null, null);
    } catch (e) {
      nullCardsOk = false;
    }

    let tacticalSpamOk = true;
    try {
      for (let i = 0; i < 50; i++) {
        vfxManager.playTacticalCardVFX(srcEl, tgtEl);
      }
    } catch (e) {
      tacticalSpamOk = false;
    }

    let unmountTacticalOk = true;
    try {
      const d1 = document.createElement('div');
      const d2 = document.createElement('div');
      sandbox.appendChild(d1);
      sandbox.appendChild(d2);
      vfxManager.playTacticalCardVFX(d1, d2);
      d1.remove();
      d2.remove();
    } catch (e) {
      unmountTacticalOk = false;
    }

    await new Promise(r => setTimeout(r, 600));

    const pass4 = cbFired && nullCardsOk && tacticalSpamOk && unmountTacticalOk;
    record('playTacticalCardVFX Deep Stress & Edge Cases', pass4,
      `Callback executed: ${cbFired}, Null src/tgt safe: ${nullCardsOk}, 50x Spam safe: ${tacticalSpamOk}, Unmount safe: ${unmountTacticalOk}`);
  }

  // ----------------------------------------------------
  // SUITE 5: Deep Stress & Edge Cases for triggerUltimateVFX
  // ----------------------------------------------------
  {
    sandbox.innerHTML = '';
    const containerEl = document.createElement('div');
    containerEl.className = 'arena-center';
    sandbox.appendChild(containerEl);

    let domainOverlayOk = true;
    try {
      vfxManager.triggerUltimateVFX('char_fxr', 'DREAM_KING', containerEl);
      domainOverlayOk = !!containerEl.querySelector('.fxr-domain-overlay');
    } catch (e) {
      domainOverlayOk = false;
    }

    let allUltimatesOk = true;
    try {
      vfxManager.triggerUltimateVFX('lgpyForm', 'DREAM_KING_RAGE', containerEl);
      vfxManager.triggerUltimateVFX('char_19', 'TIMELESS_GRACE', containerEl);
      vfxManager.triggerUltimateVFX('char_4', 'STAR_SHOWOFF', containerEl);
      vfxManager.triggerUltimateVFX('char_14', 'BUY_WATER', containerEl);
      vfxManager.triggerUltimateVFX('unknown_char', 'UNKNOWN_ULT', containerEl);
    } catch (e) {
      allUltimatesOk = false;
    }

    let nullContainerOk = true;
    try {
      vfxManager.triggerUltimateVFX('char_fxr', 'DREAM_KING', null);
      vfxManager.triggerUltimateVFX('char_fxr', 'DREAM_KING', undefined);
    } catch (e) {
      nullContainerOk = false;
    }

    let ultSpamOk = true;
    try {
      for (let i = 0; i < 50; i++) {
        vfxManager.triggerUltimateVFX('char_fxr', 'DREAM_KING', containerEl);
      }
    } catch (e) {
      ultSpamOk = false;
    }

    let unmountUltOk = true;
    try {
      const tempCont = document.createElement('div');
      sandbox.appendChild(tempCont);
      vfxManager.triggerUltimateVFX('char_fxr', 'DREAM_KING', tempCont);
      tempCont.remove();
    } catch (e) {
      unmountUltOk = false;
    }

    await new Promise(r => setTimeout(r, 2500));

    const pass5 = domainOverlayOk && allUltimatesOk && nullContainerOk && ultSpamOk && unmountUltOk;
    record('triggerUltimateVFX Deep Stress & Edge Cases', pass5,
      `Domain overlay: ${domainOverlayOk}, All ultimates safe: ${allUltimatesOk}, Null container safe: ${nullContainerOk}, 50x Spam safe: ${ultSpamOk}, Unmount safe: ${unmountUltOk}`);
  }

  process.removeListener('uncaughtException', uncaughtHandler);

  const passedAll = testResults.every(r => r.pass) && uncaughtErrors.length === 0;
  const overallVerdict = passedAll ? 'PASS' : 'FAIL';

  console.log('====================================================');
  console.log(`📊 RE-VERIFICATION VERDICT: ${overallVerdict}`);
  console.log(`   Total uncaught JS exceptions: ${uncaughtErrors.length}`);
  console.log('====================================================\n');

  process.exit(passedAll ? 0 : 1);
}

runReverificationSuite().catch(err => {
  console.error('Fatal Test Exception:', err);
  process.exit(1);
});
