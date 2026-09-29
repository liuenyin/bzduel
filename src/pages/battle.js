import { createBattleView } from './battle/controller.js';

// Only the routing adapter knows which view is current. Combat state stays inside the view.
let currentView = null;
let disposeCurrent = null;

export function renderBattle(container, data) {
  disposeCurrent?.();
  const view = createBattleView(container, data);
  currentView = view;
  const unmount = view.mount();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unmount?.();
    if (currentView === view) {
      currentView = null;
      disposeCurrent = null;
    }
  };
  disposeCurrent = dispose;
  return dispose;
}

// Retain the existing diagnostic entry point without exposing page state globally.
export function onTurnResolved(data) {
  currentView?.resolveTurn(data);
}
