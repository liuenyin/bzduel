/** Timers belong to a mounted page and cannot outlive it. */
export function createLifecycle() {
  const timers = new Set();
  let active = true;
  return {
    get active() { return active; },
    delay(callback, milliseconds) {
      if (!active) return null;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (active) callback();
      }, milliseconds);
      timers.add(timer);
      return timer;
    },
    dispose() {
      active = false;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}
