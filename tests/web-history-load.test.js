// web/history.js: the range choice and its loading, with a minimal fake DOM and a stubbed fetch and timers.
// Races: an older reply must not replace a newer range's data; destroy clears the refresh timer.

import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeElement() {
  return {
    children: [], dataset: {}, attrs: {}, listeners: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    append(...c) { this.children.push(...c); },
    replaceChildren() { this.children = []; },
  };
}

function setup(t) {
  const real = { document: globalThis.document, fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  globalThis.document = { createElement: fakeElement };
  const pending = []; // fetches waiting for an answer: { path, resolve }
  globalThis.fetch = (path) => new Promise((resolve) => pending.push({ path, resolve }));
  const timers = new Map();
  let nextTimer = 1;
  globalThis.setTimeout = (fn, ms) => { timers.set(nextTimer, { fn, ms }); return nextTimer++; };
  globalThis.clearTimeout = (id) => { timers.delete(id); };
  t.after(() => Object.assign(globalThis, real));
  const answer = (call, body) => call.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  return { pending, timers, answer };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('an older reply that arrives after a newer range was picked is dropped', async (t) => {
  const { pending, answer } = setup(t);
  const { createHistory } = await import('../web/history.js');
  const host = fakeElement();
  let changes = 0;
  const h = createHistory(host, { roomId: 1, onChange: () => { changes++; } });
  const button = (key) => host.children.find((b) => b.dataset.range === key);
  button('6h').listeners.click();
  button('24h').listeners.click();
  assert.deepEqual(pending.map((p) => p.path), ['/api/rooms/1/history?hours=6', '/api/rooms/1/history?hours=24']);
  answer(pending[1], { from: 0, to: 1, bucketS: 300, marker: '24h' });
  await flush();
  answer(pending[0], { from: 0, to: 1, bucketS: 60, marker: '6h' }); // late
  await flush();
  assert.equal(h.current().range.key, '24h');
  assert.equal(h.current().data.marker, '24h');
  h.destroy();
  assert.ok(changes >= 3);
});

test('Live has no data and loads nothing; destroy clears the refresh timer and drops a reply in flight', async (t) => {
  const { pending, timers, answer } = setup(t);
  const { createHistory, HISTORY_REFRESH_MS } = await import('../web/history.js');
  const host = fakeElement();
  const h = createHistory(host, { roomId: 2, onChange: () => {} });
  assert.equal(h.current(), null);
  assert.equal(pending.length, 0);
  host.children.find((b) => b.dataset.range === '1h').listeners.click();
  answer(pending[0], { from: 0, to: 1, bucketS: 15 });
  await flush();
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].ms, HISTORY_REFRESH_MS);
  [...timers.values()][0].fn(); // the refresh fires: a second request is in flight
  assert.equal(pending.length, 2);
  h.destroy();
  assert.equal(timers.size, 0);
  answer(pending[1], { from: 5, to: 6, bucketS: 15 });
  await flush();
  assert.equal(timers.size, 0, 'a reply after destroy must not start a new timer');
});

test('the page can open on another range than Live (the room page opens on 24 h): it loads at once', async (t) => {
  const { pending } = setup(t);
  const { createHistory } = await import('../web/history.js');
  const host = fakeElement();
  const h = createHistory(host, { roomId: 3, initial: '24h', onChange: () => {} });
  assert.deepEqual(pending.map((p) => p.path), ['/api/rooms/3/history?hours=24']);
  assert.equal(h.current().range.key, '24h');
  assert.equal(host.children.find((b) => b.dataset.range === '24h').attrs['aria-pressed'], 'true');
  h.destroy();
});
