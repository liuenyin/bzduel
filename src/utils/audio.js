// ============================================================
// 校园战力党 — Web Audio 原生音效合成引擎
// 无须外部音频资源文件，基于波形合成雅致音效
// ============================================================

let ctx = null;

function getAudioContext() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      ctx = new AudioCtx();
    }
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
  return ctx;
}

/** 掷骰木质打击声 */
export function playDiceRoll() {
  const ac = getAudioContext();
  if (!ac) return;

  const count = 3;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      try {
        const osc = ac.createOscillator();
        const gain = ac.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140 + Math.random() * 80, ac.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.05);

        gain.gain.setValueAtTime(0.18, ac.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.05);

        osc.connect(gain);
        gain.connect(ac.destination);

        osc.start();
        osc.stop(ac.currentTime + 0.05);
      } catch (e) {}
    }, i * 60);
  }
}

/** 击中/扣血沉稳顿挫声 */
export function playHit(isCritical = false) {
  const ac = getAudioContext();
  if (!ac) return;

  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isCritical ? 110 : 90, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ac.currentTime + (isCritical ? 0.2 : 0.12));

    gain.gain.setValueAtTime(isCritical ? 0.35 : 0.2, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + (isCritical ? 0.2 : 0.12));

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.start();
    osc.stop(ac.currentTime + (isCritical ? 0.2 : 0.12));
  } catch (e) {}
}

/** 技能触发高精双音阶沉浸声 */
export function playSkillTrigger() {
  const ac = getAudioContext();
  if (!ac) return;

  try {
    const now = ac.currentTime;
    const osc1 = ac.createOscillator();
    const osc2 = ac.createOscillator();
    const gain = ac.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';

    osc1.frequency.setValueAtTime(440, now); // A4
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.18); // A5

    osc2.frequency.setValueAtTime(659.25, now + 0.04); // E5
    osc2.frequency.exponentialRampToValueAtTime(1318.5, now + 0.22); // E6

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ac.destination);

    osc1.start(now);
    osc2.start(now + 0.04);
    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  } catch (e) {}
}
