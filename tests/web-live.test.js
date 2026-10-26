// The live updates in the web app: web/live.js with a fake EventSource, and the scheduling helpers of web/live-math.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLive, RETRY_MS } from '../web/live.js';
import { fallbackMs, createDebounce, liveMark, LIVE_FALLBACK_MS } from '../web/live-math.js';

class FakeSource {
  static all = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    FakeSource.all.push(this);
  }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  emit(type, data) { for (const fn of this.listeners.get(type) ?? []) fn({ data: typeof data === 'string' ? data : JSON.stringify(data) }); }
}

function setup() {
  FakeSource.all = [];
  const timers = [];
  const live = createLive({ EventSource: FakeSource, setTimer: (fn, ms) => timers.push({ fn, ms }) });
  return { live, source: FakeSource.all[0], timers };
}

test('one source for the app; connected after hello, not before', () => {
  const { live, source } = setup();
  assert.equal(FakeSource.all.length, 1);
  assert.equal(source.url, '/api/events');
  assert.equal(live.connected(), false);
  const seen = [];
  live.onStatus((c) => seen.push(c));
  source.emit('hello', { at: 1 });
  source.emit('hello', { at: 2 });
  assert.equal(live.connected(), true);
  source.onerror();
  assert.equal(live.connected(), false);
  source.onopen();
  assert.deepEqual(seen, [true, false, true], 'only changes are told');
});

test('on(type) gets the parsed data; off stops it; types are separate; a bad body gives {}', () => {
  const { live, source } = setup();
  const rooms = [];
  const alarms = [];
  const off = live.on('room', (d) => rooms.push(d));
  live.on('alarms', (d) => alarms.push(d));
  source.emit('room', { id: 2, part: 'readings' });
  source.emit('alarms', { count: 3 });
  source.emit('room', 'not json');
  off();
  source.emit('room', { id: 3, part: 'control' });
  assert.deepEqual(rooms, [{ id: 2, part: 'readings' }, {}]);
  assert.deepEqual(alarms, [{ count: 3 }]);
});

test('a closed stream is opened again after a pause; a stream the browser retries is left alone', () => {
  const { live, source, timers } = setup();
  source.readyState = 0; // connecting again
  source.onerror();
  assert.deepEqual(timers, []);
  source.readyState = 2;
  source.onerror();
  assert.equal(timers[0].ms, RETRY_MS);
  timers[0].fn();
  assert.equal(FakeSource.all.length, 2);
  const seen = [];
  live.on('sizing', (d) => seen.push(d.id));
  FakeSource.all[1].emit('sizing', { id: 4 });
  assert.deepEqual(seen, [4]);
});

test('without an EventSource it is never live and does nothing', () => {
  const live = createLive({ EventSource: undefined });
  const off = live.on('room', () => assert.fail());
  assert.equal(live.connected(), false);
  off();
});

test('the page timers: as they are while not live, a minute at least while live', () => {
  assert.equal(fallbackMs(5000, false), 5000);
  assert.equal(fallbackMs(5000, true), LIVE_FALLBACK_MS);
  assert.equal(fallbackMs(2000, true), 60_000);
  assert.equal(fallbackMs(120_000, true), 120_000);
});

test('debounce: many calls make one, ms after the last; cancel drops it', () => {
  const timers = new Map();
  let nextId = 1;
  const clock = { setTimer: (fn, ms) => { timers.set(nextId, { fn, ms }); return nextId++; }, clearTimer: (id) => timers.delete(id) };
  let calls = 0;
  const d = createDebounce(() => calls++, 300, clock);
  d.call();
  d.call();
  d.call();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].ms, 300);
  [...timers.values()][0].fn();
  timers.clear(); // a timer that fired is gone
  assert.equal(calls, 1);
  d.call();
  d.cancel();
  assert.equal(timers.size, 0);
  assert.equal(calls, 1);
});

test('the mark says Live or Not live in words', () => {
  assert.equal(liveMark(true).text, 'Live');
  assert.equal(liveMark(false).text, 'Not live');
  assert.equal(liveMark(false).live, false);
});
