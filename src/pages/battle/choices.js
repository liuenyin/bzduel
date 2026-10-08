import { gameSocket } from '../../net/socket.js';
import { SUBJECTS, CORE_SUBJECTS, ELECTIVE_SUBJECTS, MINOR_SUBJECTS } from '../../../shared/rules.js';
import { canChooseDreamTarget } from './dream.js';
import { trapFocus } from '../../utils/a11y.js';

export function createBattleChoices({ getState, actions, appendOverlay }) {
  function checkDreamTargetModal(s) {
    const existing = document.getElementById('dream-target-modal');
    if (canChooseDreamTarget(s)) {
      if (existing) return;
      const overlay = document.createElement('div');
      overlay.className = 'result-overlay';
      overlay.id = 'dream-target-modal';
      overlay.style.zIndex = '10000';
      overlay.innerHTML = `
        <div class="dream-target-modal-panel" role="dialog" aria-modal="true" aria-labelledby="dream-target-title" aria-describedby="dream-target-description">
          <h2 id="dream-target-title" style="color:var(--accent); margin-bottom:6px; font-size:1.35rem; font-family:var(--font-display);">梦境之王 - 盲选真身</h2>
          <p id="dream-target-description" style="font-size:0.88rem; color:var(--text); margin-bottom:14px; line-height:1.4;">付修然展开了梦境领域！出现 1 个本体与 2 个分身，请盲选本节课的攻击目标：</p>
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
      const dialog = overlay.querySelector('.dream-target-modal-panel');
      overlay.addEventListener('keydown', event => trapFocus(event, dialog));
      overlay.querySelector('.dream-target-btn')?.focus();
      actions.pickDreamTarget = (value) => {
        const idx = Number(value);
        const buttons = [...overlay.querySelectorAll('.dream-target-btn')];
        buttons.forEach(button => { button.disabled = true; button.setAttribute('aria-busy', 'true'); });
        gameSocket.chooseDreamTarget(idx, (result) => {
          if (result?.ok) {
            overlay.remove();
            return;
          }
          if (!overlay.isConnected) return;
          buttons.forEach(button => { button.disabled = false; button.removeAttribute('aria-busy'); });
          actions.showToast(result?.error || '当前无法选择梦境目标');
        });
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
      <div class="panel" role="dialog" aria-modal="true" aria-labelledby="reschedule-title" style="max-width:360px;width:90%;">
        <p id="reschedule-title" class="section-title" style="margin-bottom:8px;">使用调课权</p>
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
    const dialog = overlay.querySelector('[role="dialog"]');
    overlay.addEventListener('keydown', event => trapFocus(event, dialog));
    dialog.querySelector('select, button')?.focus();
    actions.pickSubj = (id) => {
      const targetIdx = parseInt(document.getElementById('reschedule-idx-select').value);
      const button = [...overlay.querySelectorAll('[data-battle-action="pickSubj"]')].find(candidate => candidate.dataset.value === id);
      overlay.querySelectorAll('[data-battle-action="pickSubj"]').forEach(candidate => { candidate.disabled = true; });
      gameSocket.useReschedule(targetIdx, id, result => {
        if (result?.ok) {
          overlay.remove();
          return;
        }
        if (!overlay.isConnected) return;
        overlay.querySelectorAll('[data-battle-action="pickSubj"]').forEach(candidate => { candidate.disabled = false; });
        actions.showToast(result?.error || '暂时无法调课');
        button?.focus();
      });
    };
  }
  return { checkDreamTargetModal, showRescheduleModal };
}
