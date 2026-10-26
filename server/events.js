// The farm's change events (spec 2026-10-26-live-alarms-outdoor-design.md section 2): a tiny in-process bus. The SSE route
// passes them to the pages; the Telegram notifier listens for alarms. Publishing never throws: a listener that fails is
// logged and kept.
//   publish(type, data) · subscribe(fn(type, data)) → unsubscribe · listeners() → how many

export function createEvents({ log = console.error } = {}) {
  const fns = new Set();
  return {
    publish(type, data = {}) {
      for (const fn of [...fns]) {
        try {
          fn(type, data);
        } catch (err) {
          log(err);
        }
      }
    },
    subscribe(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    listeners: () => fns.size,
  };
}
