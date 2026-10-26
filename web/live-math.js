// Pure helpers for the live pages (no DOM, so they can be tested in Node): the slow timers while the stream is up, the
// debounced refresh and the top bar mark.

export const LIVE_FALLBACK_MS = 60_000;
export const DEBOUNCE_MS = 300;

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
