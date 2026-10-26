// Pure helpers for the live pages (no DOM, so they can be tested in Node): the slow timers while the stream is up, the
// debounced refresh and the top bar mark.

export const LIVE_FALLBACK_MS = 60_000;
export const DEBOUNCE_MS = 300;
export const THROTTLE_MS = 2000;

// How long a page's own timer waits: as it is while the stream is down, at least a minute while it is up.
export function fallbackMs(ms, connected) {
  return connected ? Math.max(ms, LIVE_FALLBACK_MS) : ms;
}

// fn is called once, ms after the last call(); cancel() drops a call waiting. setTimer and clearTimer are only replaced by tests.
export function createDebounce(fn, ms = DEBOUNCE_MS, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null;
  return {
    call() {
      clearTimer(timer);
      timer = setTimer(() => {
        timer = null;
        fn();
      }, ms);
    },
    cancel() {
      clearTimer(timer);
      timer = null;
    },
  };
}

// The mark in the top bar: words as well as colour.
export function liveMark(connected) {
  return connected
    ? { text: 'Live', title: 'This page updates as things happen', live: true }
    : { text: 'Not live', title: 'Not connected for live updates: this page asks the farm app every few seconds', live: false };
}

// fn runs at once on the first call, then at most once per ms: calls in between make one more run at the end of the wait
// (leading and trailing edge). cancel() drops a run waiting. now, setTimer and clearTimer are only replaced by tests.
export function createThrottle(fn, ms = THROTTLE_MS, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let last = -Infinity;
  let timer = null;
  function run() {
    timer = null;
    last = now();
    fn();
  }
  return {
    call() {
      if (timer !== null) return; // one is already waiting
      const wait = last + ms - now();
      if (wait <= 0) run();
      else timer = setTimer(run, wait);
    },
    cancel() {
      clearTimer(timer);
      timer = null;
    },
  };
}

// A job's progress is only ever forward: an answer that was asked before an event (a lower percent) must not repaint it.
// current and next: { status, progress }. A finished next always counts.
export function isStale(current, next) {
  const over = (j) => j.status === 'done' || j.status === 'failed';
  if (over(next)) return false;
  if (over(current)) return true;
  return (next.progress ?? 0) < (current.progress ?? 0);
}

// The job as it is after an event (the event carries id, status, progress and for a suggestion tried), or null when the
// event is older than what is shown.
export function withProgress(job, event) {
  if (isStale(job, event)) return null;
  const { status, progress, tried } = event;
  return { ...job, status, progress, ...(tried === undefined ? {} : { tried }) };
}
