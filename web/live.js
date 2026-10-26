// Live updates (spec 2026-10-26-live-alarms-outdoor-design.md section 3): one EventSource for the whole app.
//   live.on(type, fn(data)) → off · live.connected() · live.onStatus(fn(connected)) → off
// The browser reconnects by itself; a closed stream is opened again after RETRY_MS. Pages ask for their data when an event
// comes (and when the stream is back, in case they missed some); their own timers are the fallback.

export const EVENT_TYPES = ['room', 'alarms', 'outdoor', 'simulation', 'sizing'];
export const RETRY_MS = 5000;
const CLOSED = 2; // EventSource.CLOSED

// EventSource, document and setTimer are only replaced by tests. Without an EventSource it never connects.
// A hidden tab closes its stream (a browser allows few per site) and counts as connected, so its pages keep their slow
// timers and ask for nothing; when it is shown again the stream is opened and the pages are told it is up, to ask once.
export function createLive({ EventSource: Source = globalThis.EventSource, url = '/api/events', setTimer = setTimeout, document: doc = globalThis.document } = {}) {
  const handlers = new Map(EVENT_TYPES.map((type) => [type, new Set()]));
  const statusFns = new Set();
  let up = false;
  let told = false; // what the status listeners last heard
  let paused = false; // the tab is hidden
  let catchUp = false; // the next "up" is told even if it was up before
  let source = null;

  function setUp(value) {
    up = value;
    if (value === told && !(value && catchUp)) return;
    told = value;
    catchUp = false;
    for (const fn of [...statusFns]) fn(value);
  }

  function open() {
    if (!Source || paused) return;
    source?.close?.();
    source = new Source(url);
    const mine = source;
    source.addEventListener('hello', () => { if (mine === source) setUp(true); });
    source.onopen = () => { if (mine === source) setUp(true); };
    source.onerror = () => {
      if (mine !== source) return;
      setUp(false);
      if (mine.readyState === CLOSED) setTimer(open, RETRY_MS); // the browser gave up: try again
    };
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (event) => {
        let data = {};
        try { data = JSON.parse(event.data); } catch { /* an event without a body */ }
        for (const fn of [...handlers.get(type)]) fn(data);
      });
    }
  }

  function visibility() {
    if (doc.hidden === paused) return;
    paused = doc.hidden;
    if (paused) {
      const old = source;
      source = null;
      old?.close?.();
    } else {
      up = false; // not heard yet: told again when it is
      catchUp = true;
      open();
    }
  }
  doc?.addEventListener?.('visibilitychange', visibility);

  open();

  return {
    on(type, fn) {
      handlers.get(type).add(fn);
      return () => handlers.get(type).delete(fn);
    },
    connected: () => paused || up,
    onStatus(fn) {
      statusFns.add(fn);
      return () => statusFns.delete(fn);
    },
  };
}

export const live = createLive();
