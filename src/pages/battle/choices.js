import { gameSocket } from '../../net/socket.js';
import { SUBJECTS, CORE_SUBJECTS, ELECTIVE_SUBJECTS, MINOR_SUBJECTS } from '../../../shared/rules.js';

export function createBattleChoices({ getState, actions, appendOverlay }) {
  function checkDreamTargetModal(s) {
    const existing = document.getElementById('dream-target-modal');
    const fxr = s.players?.find(p => (p.card?.positiveSkill?.id === 'dream_king' || p.cardId === 'char_fxr'));
    if (s.phase === 'battle' && fxr && fxr.inDreamState && !fxr.lgpyForm && s.me.id !== fxr.id && fxr.dreamTargetChoice === null) {
      if (existing) return;
      const overlay = document.createElement('div');
      overlay.className = 'result-overlay';
      overlay.id = 'dream-target-modal';
      overlay.style.zIndex = '10000';
      overlay.innerHTML = `
        <div class="dream-target-modal-panel">
          <h2 style="color:var(--accent); margin-bottom:6px; font-size:1.35rem; font-family:var(--font-display);">梦境之王 - 盲选真身</h2>
          <p style="font-size:0.88rem; color:var(--text); margin-bottom:14px; line-height:1.4;">付修然展开了梦境领域！出现 1 个本体与 2 个分身，请盲选本节课的攻击目标：</p>
          <div class="dream-target-cards-container">
            <button class="dream-target-btn" data-battle-action="pickDreamTarget" data-value="0">
              目标 A
            </button>
            <button class="dream-target-btn" data-battle-action="pickDreamTarget" data-value="1">
              目标 B
            </button>
            <button class="dream-target-btn" data-battle-action="pickDreamTarget" data-value="2">
              目标 C
            </button>
          </div>
          <p style="font-size:0.75rem; color:var(--text-secondary);">* 选错分身：分身使用超强骰池 (D7+D9+D9+D9+D11) 且无法伤及本体！</p>
        </div>
      `;
      appendOverlay(overlay);
      actions.pickDreamTarget = (value) => {
      const idx = Number(value);
        gameSocket.chooseDreamTarget(idx);
        overlay.remove();
      };
    } else {
      if (existing) existing.remove();
    }
  }

  function showRescheduleModal() {
    const S = getState();
    const overlay = document.createElement('div');
    overlay.className = 'result-overlay';
    overlay.id = 'reschedule-modal';
    overlay.style.zIndex = '9999';

    let options = '';
    for(let i = S.currentClassIndex; i < S.schedule.length; i++) {
      options += `<option value="${i}">第 ${i+1} 节课 (${SUBJECTS[S.schedule[i]]?.label || S.schedule[i]})</option>`;
    }

    const makeBtn = (arr) => arr.map(id => {
      const s = SUBJECTS[id];
      return `<button data-battle-action="pickSubj" data-value="${id}">${s.icon} ${s.label}</button>`;
    }).join('');

    overlay.innerHTML = `
      <div class="panel" style="max-width:360px;width:90%;">
        <p class="section-title" style="margin-bottom:8px;">使用调课权</p>
        <div style="text-align:center; margin-bottom:12px;">
          <select id="reschedule-idx-select" style="padding:4px 8px; border-radius:4px; font-family:var(--font-body); font-size:0.85rem; border:1.5px solid var(--bg-inset); background:var(--bg-warm); outline:none;">
            ${options}
          </select>
        </div>
        <div class="subject-picker">
          <div class="picker-section-label">主科</div>${makeBtn(CORE_SUBJECTS)}
          <div class="picker-section-label">选科</div>${makeBtn(ELECTIVE_SUBJECTS)}
          <div class="picker-section-label">副科</div>${makeBtn(MINOR_SUBJECTS)}
        </div>
        <div style="text-align:center;margin-top:14px;">
          <button class="btn btn-secondary" data-battle-action="closeModal">取消</button>
        </div>
      </div>
    `;
    appendOverlay(overlay);
    actions.pickSubj = (id) => {
      const targetIdx = parseInt(document.getElementById('reschedule-idx-select').value);
      gameSocket.useReschedule(targetIdx, id);
      overlay.remove();
    };
  }
  return { checkDreamTargetModal, showRescheduleModal };
}
