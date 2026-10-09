// web/batches.js: helpers and the #btCrop options (docs/contracts/harvest.md 12.2, 12.3, 13).
'use strict';
process.env.TZ = 'Asia/Kuala_Lumpur';
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller']) require(`../${f}.js`);
require('../harvest-rules.js'); require('../web/ui.js'); require('../web/api.js');
const registered = {};
globalThis.FarmShell = { register: (name, m) => { registered[name] = m; } };
const B = require('../web/batches.js');
const CC = globalThis.ClimateController, HR = globalThis.FarmHarvestRules;

test('BT1 module registers batches and exports the C10 12.2 names only', () => {
  assert.equal(typeof registered.batches.mount, 'function');
  assert.equal(typeof registered.batches.unmount, 'function');
  assert.deepEqual(Object.keys(B).sort(), ['ageDays', 'batchBody', 'dateToSeconds', 'secondsToDate']);
});

test('BT2 dates are farm dates whatever the browser zone', () => {
  assert.equal(B.dateToSeconds('2026-10-08'), 1791388800);
  for (const bad of ['', 'x', '2026-13-01', '2026-02-30', '2026-1-5']) assert.equal(B.dateToSeconds(bad), null, bad);
  assert.equal(B.secondsToDate(1791388800), '2026-10-08');
  assert.equal(B.secondsToDate(1791388799), '2026-10-07');
  assert.equal(B.secondsToDate(B.dateToSeconds('2026-12-31')), '2026-12-31');
  const prev = process.env.TZ;                       // the farm dates must not follow the browser's zone
  process.env.TZ = 'America/New_York';
  try {
    assert.equal(B.dateToSeconds('2026-10-08'), 1791388800);
    assert.equal(B.secondsToDate(1791388799), '2026-10-07');
    assert.equal(B.secondsToDate(1791388800), '2026-10-08');
  } finally { process.env.TZ = prev; }
});

test('BT3 ageDays counts whole days', () => {
  assert.equal(B.ageDays(1791388800, 1791388800 + 3 * 86400 - 1), 2);
  assert.equal(B.ageDays(1791388800, 1791388800 + 3 * 86400), 3);
});

test('BT4 batchBody builds the create and edit bodies', () => {
  const body = B.batchBody({ edit: false, fields: { crop: 'oyster', strain: ' PO-2 ', source: '', block_count: '1000', block_wet_kg: '1.2', moisture_pct: '60', spawn_date: '', received_at: '2026-10-08', flush_gap_days: '', notes: '  ' } });
  assert.deepEqual(body, { crop: 'oyster', strain: 'PO-2', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: 1791388800 });
  assert.deepEqual(HR.checkBatch(body, false), []);
  assert.deepEqual(B.batchBody({ edit: true, fields: { strain: '', notes: 'late', spawn_date: '', block_count: '900' } }),
    { strain: null, notes: 'late', spawn_date: null, block_count: 900 });
  assert.equal(B.batchBody({ edit: false, fields: { block_count: '12a' } }).block_count, '12a');
  assert.deepEqual(Object.keys(B.batchBody({ edit: true, fields: { strain: 'x' } })), ['strain']);
});

const stubs = {};
function mk(tag) {
  return { tag, children: [], dataset: {}, style: {}, attrs: {}, value: '', textContent: '', hidden: false, disabled: false,
    classList: { add() {}, remove() {}, toggle() {} },
    append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; }, replaceChildren(...c) { this.children = c; },
    addEventListener() {}, removeEventListener() {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    querySelector: sel => (stubs[sel] ||= mk(sel)), querySelectorAll: () => [], focus() {} };
}

test('BT5 #btCrop lists the crops with a fruiting range, built in mount', async t => {
  const { startFakeApi } = require('./fakes/api-server.js');
  const fake = await startFakeApi();
  const prevBase = globalThis.FarmApi.base;
  globalThis.FarmApi.base = fake.url;
  globalThis.document = { createElement: mk };
  t.after(async () => { await fake.close(); delete globalThis.document; globalThis.FarmApi.base = prevBase; });
  const el = mk('main');
  Object.defineProperty(el, 'innerHTML', { set() {}, get() { return ''; } });
  const pending = registered.batches.mount(el, {});
  assert.deepEqual(stubs['#btCrop'].children.map(o => ({ value: o.value, text: o.textContent })),
    Object.keys(CC.CROPS).filter(k => CC.CROPS[k].range).map(k => ({ value: k, text: CC.CROPS[k].name })));
  registered.batches.unmount();
  await pending;
  for (let i = 0; i < 50 && !fake.requests.some(r => r.path === '/api/batches' && r.query.state === 'placed'); i++) await new Promise(r => setTimeout(r, 20));
  assert.ok(fake.requests.some(r => r.path === '/api/batches' && r.query.state === 'placed'), JSON.stringify(fake.requests));
});

// A recording element of its own: listeners kept, replaceChildren detaches what was queried (as a real page does).
function mkEl() {
  const map = {};
  const el = mk('main');
  el.stubs = map;
  el.listeners = {};
  const make = sel => {
    const n = mk(sel);
    n.querySelector = s2 => (map[sel + ' ' + s2] ||= make(sel + ' ' + s2));
    n.addEventListener = (type, fn) => { n.listeners = { ...(n.listeners || {}), [type]: fn }; };
    return n;
  };
  let detached = false;
  const reset = () => { for (const k of Object.keys(map)) delete map[k]; detached = false; };
  el.querySelector = sel => (detached ? null : (map[sel] ||= make(sel)));
  el.replaceChildren = (...c) => { detached = true; el.children = c; };
  Object.defineProperty(el, 'innerHTML', { set: reset, get() { return ''; } });   // a new template: fresh nodes
  return el;
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const BATCH = { id: 1, crop: 'oyster', strain: 'PO-2', source: null, block_count: 10, block_wet_kg: 1, moisture_pct: 60, spawn_date: null,
  received_at: 1791388800, room_id: null, placed_at: null, cleared_at: null, flush_gap_days: 5, notes: null, room_name: null, state: 'received',
  totals: { crates: 0, kg: 0, g_per_block: 0, be_pct: 0, flushes: 0 }, flushes: [], crates: [] };

test('BT6 a late reply of an older mount does not touch the new page', async t => {
  globalThis.document = { createElement: mk };
  const api = globalThis.FarmApi, saved = { ...api };
  t.after(() => { Object.assign(api, saved); delete globalThis.document; });
  const place = deferred(), list = deferred();
  api.getBatch = async () => structuredClone(BATCH);
  api.listRooms = async () => [];
  api.placeBatch = () => place.promise;
  api.listBatches = () => list.promise;
  const elA = mkEl();
  await registered.batches.mount(elA, { id: 1 });
  elA.querySelector('#bdPlace').listeners.click();                  // Place in room, reply pending
  registered.batches.unmount();
  const elB = elA;                                                  // the shell reuses its one view element
  const pendingB = registered.batches.mount(elB, {});               // the list, reply pending
  place.resolve({});                                                 // the old page's action finishes now
  await new Promise(r => setTimeout(r, 20));
  assert.equal(elB.querySelector('#bdHead').textContent, '');       // nothing of the old detail page reached the new page
  list.resolve([{ ...BATCH, state: 'placed', placed_at: BATCH.received_at, room_name: 'Room 1' }]);
  await pendingB;
  assert.equal(elB.querySelector('#btList').querySelector('tbody').children.length, 1);
});

test('BT7 an unknown batch shows its page and mount does not reject', async t => {
  globalThis.document = { createElement: mk };
  const api = globalThis.FarmApi, saved = { ...api };
  t.after(() => { Object.assign(api, saved); delete globalThis.document; });
  api.getBatch = async () => { throw new api.ApiError(404, 'Unknown batch', []); };
  api.listRooms = async () => [{ id: 1, name: 'Room 1' }];
  const el = mkEl();
  await registered.batches.mount(el, { id: 99999 });
  assert.equal(el.children.length, 1);
  assert.equal(el.children[0].children[0].textContent, 'This batch does not exist.');
  registered.batches.unmount();
});
