// web/history.js with outdoor on (the outdoor line of the charts), and the dialog markup of the new fields.

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

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(t) {
  const real = { document: globalThis.document, fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  globalThis.document = { createElement: fakeElement };
  const pending = [];
  globalThis.fetch = (path) => new Promise((resolve) => pending.push({ path, resolve }));
  globalThis.setTimeout = () => 1; // the 60 s refresh never fires here
  globalThis.clearTimeout = () => {};
  t.after(() => Object.assign(globalThis, real));
  return pending;
}

test('with outdoor on, the outdoor history of the same range is asked too; its failure leaves the room data', async (t) => {
  const pending = setup(t);
  const { createHistory } = await import('../web/history.js');
  const host = fakeElement();
  const h = createHistory(host, { roomId: 1, outdoor: true, onChange: () => {} });
  host.children.find((b) => b.dataset.range === '6h').listeners.click();
  assert.deepEqual(pending.map((p) => p.path), ['/api/rooms/1/history?hours=6', '/api/outdoor/history?range=6h']);
  pending[0].resolve(json({ from: 0, to: 1, bucketS: 60, marker: 'room' }));
  pending[1].resolve(json({ error: 'Not found' }, 404));
  await flush();
  assert.equal(h.current().data.marker, 'room');
  assert.equal(h.current().outdoor, null);
  assert.equal(h.current().failed, false);
  h.destroy();
});

test('with outdoor on, a good outdoor reply comes with the room data; a late reply of an older range is dropped', async (t) => {
  const pending = setup(t);
  const { createHistory } = await import('../web/history.js');
  const host = fakeElement();
  const h = createHistory(host, { roomId: 1, outdoor: true, onChange: () => {} });
  const click = (key) => host.children.find((b) => b.dataset.range === key).listeners.click();
  click('6h');
  click('24h');
  assert.equal(pending.length, 4);
  pending[2].resolve(json({ bucketS: 300, marker: '24h' }));
  pending[3].resolve(json({ bucketS: 300, marker: 'out24h' }));
  await flush();
  pending[0].resolve(json({ bucketS: 60, marker: '6h' }));
  pending[1].resolve(json({ bucketS: 60, marker: 'out6h' }));
  await flush();
  assert.equal(h.current().data.marker, '24h');
  assert.equal(h.current().outdoor.marker, 'out24h');
  h.destroy();
});

test('without the option the outdoor route is not asked (the Live-only and old callers stay as they were)', async (t) => {
  const pending = setup(t);
  const { createHistory } = await import('../web/history.js');
  const host = fakeElement();
  const h = createHistory(host, { roomId: 2, onChange: () => {} });
  host.children.find((b) => b.dataset.range === '1h').listeners.click();
  assert.deepEqual(pending.map((p) => p.path), ['/api/rooms/2/history?hours=1']);
  h.destroy();
});

