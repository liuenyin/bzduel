/** One delegated listener covers freshly rendered controls and owned modals. */
export function bindBattleActions({ container, overlays, lifecycle, actions }) {
  const dispatch = event => {
    const target = event.target?.closest?.('[data-battle-action]');
    if (!target || (!container.contains(target) && ![...overlays].some(overlay => overlay.contains(target)))) return;
    if (target.matches(':disabled') || target.closest('[inert]')) return;
    if (event.type === 'keydown') {
      if (!['Enter', ' '].includes(event.key) || target.tagName === 'BUTTON') return;
    }
    const action = actions[target.dataset.battleAction];
    if (typeof action !== 'function') return;
    event.preventDefault();
    event.stopPropagation();
    action(target.dataset.value, target);
  };
  lifecycle.listen(document, 'click', dispatch);
  lifecycle.listen(document, 'keydown', dispatch);
  lifecycle.listen(document, 'keydown', event => {
    if (event.key === 'Escape') actions.closeHand();
  });
}
