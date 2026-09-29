import { playDiceRoll } from '../../utils/audio.js';

export function configureCombatControls({ actions, socket, lifecycle, showRescheduleModal, navigate, updateActionButtons }) {
  const selectedDice = () => [...document.querySelectorAll('.die.selected')];
  const indices = () => selectedDice().map(die => Number(die.dataset.idx));
  const hideReroll = () => {
    const button = document.getElementById('btn-reroll');
    if (button) button.style.display = 'none';
  };
  actions.roll = (_value, button) => {
    button.disabled = true;
    button.textContent = '掷骰中…';
    playDiceRoll();
    socket.rollDice();
  };
  actions.confirmDice = (_value, button) => {
    button.disabled = true;
    button.textContent = '处理中…';
    hideReroll();
    socket.confirmDice(indices());
  };
  actions.buyWater = (_value, button) => {
    button.disabled = true;
    button.textContent = '购买中…';
    socket.buyWater();
  };
  actions.reroll = (_value, button) => {
    const dice = selectedDice();
    if (!dice.length) return;
    button.disabled = true;
    button.dataset.rerolling = 'true';
    playDiceRoll();
    socket.rerollDice(indices());
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
  actions.leaveBattle = () => {
    if (!window.confirm('确定要退出当前对局吗？战斗中退出会被判负。')) return;
    socket.leaveRoom();
    navigate('lobby');
  };
}
