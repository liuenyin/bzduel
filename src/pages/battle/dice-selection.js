import { gameSocket } from '../../net/socket.js';
import { DICE_COLORS } from '../../../shared/rules.js';
import { vfxManager } from '../../utils/vfx.js';
import { trapFocus } from '../../utils/a11y.js';

export function createDiceSelection({ getState, appendOverlay, showToast = () => {} }) {
  let selectionKey = null;
  function renderDice() {
    const S = getState();
    const area = document.getElementById('dice-area');
    if (!area) return;
    const nextKey = JSON.stringify([
      S.totalRound, S.attackerIdx, S.defenderIdx, S.turnPhase, S.isMyAttackTurn, S.isMyDefendTurn,
      S.attackRolls, S.defenseRolls, S.aoeDefenses?.[S.me.id], S.me.effectiveDicePool,
    ]);
    const selected = nextKey === selectionKey
      ? new Set([...area.querySelectorAll('.die.selected')].map(d => `${d.classList.contains('attack')}:${d.dataset.idx}`))
      : new Set();
    selectionKey = nextKey;

    const isMeAtk = S.myIndex === S.attackerIdx;
    const isMeDef = S.myIndex === S.defenderIdx;

    let atkPlayer, defPlayer;
    if (S.gameMode === '1v1') {
      atkPlayer = isMeAtk ? S.me : S.opponent;
      defPlayer = isMeAtk ? S.opponent : S.me;
    } else {
      atkPlayer = (S.players && S.attackerIdx !== null && S.attackerIdx !== undefined) ? S.players[S.attackerIdx] : null;
      defPlayer = (S.players && S.defenderIdx !== null && S.defenderIdx !== undefined) ? S.players[S.defenderIdx] : null;
    }

    // 使用 effectiveDicePool 以正确反映状态覆盖后的骰池
    const atkPool = atkPlayer?.effectiveDicePool || atkPlayer?.card?.dicePool || [];
    const defPool = defPlayer?.effectiveDicePool || defPlayer?.card?.dicePool || [];

    let html = '';
    if (S.attackRolls) {
      // 攻击骰：由 attackerIdx 掷出
      const canSelect = S.turnPhase === 'atk_rolled' && S.isMyAttackTurn;
      html += `<div class="dice-row"><span class="dice-label" style="color:var(--gold)">攻</span>`;
      html += S.attackRolls.map((v, i) => {
        const isKept = S.atkResult?.keptIndices?.includes(i);
        let face = atkPool[i] || 6;
        if (S.isExtraTurn && S.extraTurnFaceBoost) {
          face += S.extraTurnFaceBoost;
        }
        // 殷泽轩屏蔽：如果不是我掷出的且对方是 YZX
        const isYzx = v === -1 || (atkPlayer && atkPlayer.stealthActive);
        const color = DICE_COLORS[face];
        let style = color ? `border-color:${color.border}; color:${color.border};` : '';
        if (S.atkResult && !isKept) style += 'opacity:0.3;';
        const displayVal = isYzx ? '?' : v;
        return `<div class="die attack${canSelect ? ' selectable' : ''}${canSelect ? ' rolling' : ''}" style="${style}" data-idx="${i}" data-val="${v}">
          ${color && !isYzx ? `<div class="die-corner" style="color:${color.border};background:${color.bg}">${color.label}</div>` : ''}
          ${displayVal}
        </div>`;
      }).join('');
      if (S.atkResult) {
        const sum = S.atkResult.baseAtk;
        const bonus = S.atkResult.bonusDamage ? `+${S.atkResult.bonusDamage}` : '';
        html += `<span class="dice-sum" style="color:var(--gold)">= ${sum}${bonus}</span></div>`;
      } else {
        html += `</div>`;
      }
    }
    const myAoeDefense = S.aoeDefenses?.[S.me?.id] || null;
    if (Array.isArray(S.defenseRolls) || Array.isArray(myAoeDefense?.rolls)) {
      // 防御骰
      const canSelect = S.turnPhase === 'def_rolled' && S.isMyDefendTurn;
      const rollsToRender = myAoeDefense ? myAoeDefense.rolls : S.defenseRolls;
      const isConfirmed = !!myAoeDefense?.confirmed;

      html += `<div class="dice-row"><span class="dice-label" style="color:var(--blue)">守</span>`;
      if (Array.isArray(rollsToRender)) {
        html += rollsToRender.map((v, i) => {
          const face = defPool[i] || 6;
          const color = DICE_COLORS[face];
          // 如果点数是 -1，说明被后端屏蔽了
          const isYzx = v === -1 || (defPlayer && defPlayer.stealthActive);
          let style = color ? `border-color:${color.border}; color:${color.border};` : '';
          if (isConfirmed) style += 'opacity:0.5;';
          const displayVal = isYzx ? '?' : v;
          return `<div class="die defense${(canSelect && !isConfirmed) ? ' selectable' : ''}" style="${style}" data-idx="${i}" data-val="${v}">
            ${color && !isYzx ? `<div class="die-corner" style="color:${color.border};background:${color.bg}">${color.label}</div>` : ''}
            ${displayVal}
          </div>`;
        }).join('');
      }
      html += `<span class="dice-sum" style="color:var(--blue)">${isConfirmed ? ' 已确认' : ''}</span></div>`;
    }
    area.innerHTML = html;
    const diceEls = area.querySelectorAll('.die.rolling, .die.selectable');
    if (diceEls.length > 0) {
      const vals = Array.from(diceEls).map(d => parseInt(d.dataset.val || '0'));
      vfxManager.rollDice(diceEls, vals);
    }
    area.querySelectorAll('.die.selectable').forEach(d => {
      d.classList.toggle('selected', selected.has(`${d.classList.contains('attack')}:${d.dataset.idx}`));
      d.dataset.battleAction = 'selectDie';
      d.setAttribute('role', 'button');
      d.tabIndex = 0;
      const announcedValue = d.dataset.val === '-1' ? '隐藏骰子' : d.dataset.val;
      d.setAttribute('aria-label', `骰子 ${announcedValue}`);
      d.setAttribute('aria-pressed', String(d.classList.contains('selected')));
    });
    updateActionButtons();
  }

  function updateActionButtons() {
    const S = getState();
    const area = document.getElementById('dice-area');
    const btnReroll = document.getElementById('btn-reroll');
    const btnConfirm = document.getElementById('btn-confirm');
    if (!area) return;

    const sel = area.querySelectorAll('.die.selected');
    const count = sel.length;

    let currentSum = 0;
    sel.forEach(d => {
      currentSum += parseInt(d.dataset.val || '0');
    });

    if (btnReroll) {
      btnReroll.style.display = count > 0 && S.me.rerolls > 0 ? 'block' : 'none';
      if ((S.me.buffs && S.me.buffs.find(b => b.id === 'sugar_crash')) || btnReroll.dataset.rerolling === 'true') {
        btnReroll.disabled = true;
        if (S.me.buffs && S.me.buffs.find(b => b.id === 'sugar_crash')) btnReroll.innerHTML = '🚫 犯糖';
      } else {
        btnReroll.disabled = false;
        btnReroll.innerHTML = `重投 ${count} 颗`;
      }
    }

    if (btnConfirm) {
      const isAtk = S.turnPhase === 'atk_rolled' && S.isMyAttackTurn;
      const isDef = S.turnPhase === 'def_rolled' && S.isMyDefendTurn;
      const target = isAtk
        ? (S.me.effectiveAtkSlots ?? S.me.card.atkSlots)
        : (isDef ? (S.me.effectiveDefSlots ?? S.me.card.defSlots) : 99);

      // 李灿献祭逻辑
      const btnSacrifice = document.getElementById('btn-sacrifice');
      if (btnSacrifice) {
        if (isDef && S.me.cardId === 'char_8' && !S.me.skillsSealed && count === target) {
          btnSacrifice.style.display = 'block';
        } else {
          btnSacrifice.style.display = 'none';
        }
      }

      if (target === -1) {
        // ... same
        if (count > 0) {
          btnConfirm.disabled = false;
          btnConfirm.innerHTML = `✓ 确认 (已选 ${count} 颗) 总和:${currentSum}`;
        } else {
          btnConfirm.disabled = true;
          btnConfirm.innerHTML = `至少选 1 颗`;
        }
      } else {
        if (count === target) {
          btnConfirm.disabled = false;
          btnConfirm.innerHTML = `✓ 确认 (${count}/${target}) 总和:${currentSum}`;
        } else {
          btnConfirm.disabled = true;
          btnConfirm.innerHTML = `需选 ${target} 颗 (已选 ${count})`;
        }
      }
    }
  }

  function showSacrifice() {
    const sel = document.querySelectorAll('.die.defense.selected');
    let opts = '';
    sel.forEach(d => {
      opts += `<button class="btn btn-secondary" data-battle-action="doSacrifice" data-value="${d.dataset.idx}">献祭 ${d.dataset.val}</button>`;
    });
    const m = document.createElement('div');
    m.className = 'result-overlay';
    m.id = 'sacrifice-modal';
    m.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-labelledby="sacrifice-title"><h3 id="sacrifice-title">选择一个骰子进行献祭</h3><p>该骰子变1，回复其点数-1的HP</p>${opts}</div>`;
    appendOverlay(m);
    const dialog = m.querySelector('[role="dialog"]');
    m.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        m.remove();
        return;
      }
      trapFocus(event, dialog);
    });
    dialog.querySelector('button')?.focus();
  }

  function doSacrifice(idx) {
    const indices = Array.from(document.querySelectorAll('.die.defense.selected')).map(d => parseInt(d.dataset.idx));
    gameSocket.confirmDice(indices, { sacrificeIndex: idx }, result => {
      if (!result?.ok) {
        showToast(result?.error || '暂时无法确认献祭');
      }
    });
    document.getElementById('sacrifice-modal')?.remove();
  }
  return { renderDice, updateActionButtons, showSacrifice, doSacrifice };
}
