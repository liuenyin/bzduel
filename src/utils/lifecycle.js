/** A mounted page owns its timers, listeners and deferred callbacks. */
export function createLifecycle() {
  const timers = new Set();
  const cleanups = new Set();
  let active = true;
  return {
    get active() { return active; },
    guard(callback) {
      return (...args) => { if (active) return callback(...args); };
    },
    own(cleanup) {
      if (active) cleanups.add(cleanup);
      else cleanup();
      return cleanup;
    },
    listen(target, event, callback, options) {
      if (!active || !target) return () => {};
      const guarded = (...args) => { if (active) callback(...args); };
      target.addEventListener(event, guarded, options);
      const stop = () => {
        target.removeEventListener(event, guarded, options);
        cleanups.delete(stop);
      };
      cleanups.add(stop);
      return stop;
    },
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
      if (!active) return;
      active = false;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    },
  };
}
