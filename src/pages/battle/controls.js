import { playDiceRoll } from '../../utils/audio.js';

export function configureCombatControls({ actions, socket, lifecycle, showRescheduleModal, navigate, updateActionButtons }) {
  const selectedDice = () => [...document.querySelectorAll('.die.selected')];
  const indices = () => selectedDice().map(die => Number(die.dataset.idx));
  const hideReroll = () => {
    const button = document.getElementById('btn-reroll');
    if (button) button.style.display = 'none';
  };
  const recoverAction = (button, result, fallback) => {
    if (result?.ok) return;
    if (button) {
      button.disabled = false;
      button.textContent = button.dataset.previousLabel || button.textContent;
      delete button.dataset.rerolling;
    }
    updateActionButtons();
    actions.showToast(result?.error || fallback);
  };
  actions.roll = (_value, button) => {
    button.dataset.previousLabel = button.textContent;
    button.disabled = true;
    button.textContent = '掷骰中…';
    playDiceRoll();
    socket.rollDice(lifecycle.guard(result => recoverAction(button, result, '暂时无法掷骰')));
  };
  actions.confirmDice = (_value, button) => {
    button.dataset.previousLabel = button.textContent;
    button.disabled = true;
    button.textContent = '处理中…';
    hideReroll();
    socket.confirmDice(indices(), lifecycle.guard(result => recoverAction(button, result, '暂时无法确认骰子')));
  };
  actions.buyWater = (_value, button) => {
    button.dataset.previousLabel = button.textContent;
    button.disabled = true;
    button.textContent = '购买中…';
    socket.buyWater(lifecycle.guard(result => recoverAction(button, result, '暂时无法买水')));
  };
  actions.reroll = (_value, button) => {
    const dice = selectedDice();
    if (!dice.length) return;
    button.dataset.previousLabel = button.textContent;
    button.disabled = true;
    button.dataset.rerolling = 'true';
    playDiceRoll();
    socket.rerollDice(indices(), lifecycle.guard(result => recoverAction(button, result, '暂时无法重投')));
    for (const die of dice) {
      die.classList.remove('selected');
      die.setAttribute('aria-pressed', 'false');
    }
    hideReroll();
  };
  actions.selectDie = (_value, die) => {
    die.classList.toggle('selected');
    die.setAttribute('aria-pressed', String(die.classList.contains('selected')));
    updateActionButtons();
  };
  actions.reschedule = showRescheduleModal;
  actions.surrender = (_value, button) => {
    if (!window.confirm('确定要投降吗？本局将立即判负。')) return;
    button.disabled = true;
    socket.surrender(lifecycle.guard(result => {
      if (!result?.ok) {
        button.disabled = false;
        actions.showToast(result?.error || '投降失败');
      }
    }));
  };
  actions.leaveBattle = (_value, button) => {
    if (!window.confirm('确定要退出当前对局吗？战斗中退出会被判负。')) return;
    if (button) {
      button.disabled = true;
      button.textContent = '正在退出…';
    }
    socket.leaveRoom(lifecycle.guard(result => {
      if (result?.ok) {
        navigate('lobby');
        return;
      }
      if (button) {
        button.disabled = false;
        button.textContent = '退出对局';
      }
      actions.showToast(result?.error || '退出失败，请重试');
    }));
  };
}
