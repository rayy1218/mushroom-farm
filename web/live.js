// Live updates (spec 2026-10-26-live-alarms-outdoor-design.md section 3): one EventSource for the whole app.
//   live.on(type, fn(data)) → off · live.connected() · live.onStatus(fn(connected)) → off
// The browser reconnects by itself; a closed stream is opened again after RETRY_MS. Pages ask for their data when an event
// comes (and when the stream is back, in case they missed some); their own timers are the fallback.

export const EVENT_TYPES = ['room', 'alarms', 'outdoor', 'simulation', 'sizing'];
export const RETRY_MS = 5000;
const CLOSED = 2; // EventSource.CLOSED

// EventSource and setTimer are only replaced by tests. Without an EventSource it never connects.
export function createLive({ EventSource: Source = globalThis.EventSource, url = '/api/events', setTimer = setTimeout } = {}) {
  const handlers = new Map(EVENT_TYPES.map((type) => [type, new Set()]));
  const statusFns = new Set();
  let up = false;
  let source = null;

  function setUp(value) {
    if (value === up) return;
    up = value;
    for (const fn of [...statusFns]) fn(up);
  }

  function open() {
    if (!Source) return;
    source = new Source(url);
    source.addEventListener('hello', () => setUp(true));
    source.onopen = () => setUp(true);
    source.onerror = () => {
      setUp(false);
      if (source.readyState === CLOSED) setTimer(open, RETRY_MS); // the browser gave up: try again
    };
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (event) => {
        let data = {};
        try { data = JSON.parse(event.data); } catch { /* an event without a body */ }
        for (const fn of [...handlers.get(type)]) fn(data);
      });
    }
  }

  open();

  return {
    on(type, fn) {
      handlers.get(type).add(fn);
      return () => handlers.get(type).delete(fn);
    },
    connected: () => up,
    onStatus(fn) {
      statusFns.add(fn);
      return () => statusFns.delete(fn);
    },
  };
}

export const live = createLive();
