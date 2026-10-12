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
  assert.deepEqual(Object.keys(B).sort(), ['ageDays', 'batchBody', 'daysText', 'dateToSeconds', 'filterByState', 'plural', 'secondsToDate', 'stateWords', 'subText', 'titleOf'].sort());
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
  for (let i = 0; i < 50 && !fake.requests.some(r => r.path === '/api/batches'); i++) await new Promise(r => setTimeout(r, 20));
  assert.ok(fake.requests.some(r => r.path === '/api/batches'), JSON.stringify(fake.requests));
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
  assert.equal(elB.querySelector('#bdHead').children.length, 0);   // nothing of the old detail page reached the new page
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

test('BT8 the new-batch form: a 400 marks the fields, a save goes to the new batch', async t => {
  globalThis.document = { createElement: mk };
  globalThis.location = { hash: '#/batches' };
  const api = globalThis.FarmApi, saved = { ...api };
  t.after(() => { Object.assign(api, saved); delete globalThis.document; delete globalThis.location; registered.batches.unmount(); });
  api.listBatches = async () => [];
  const el = mkEl();
  await registered.batches.mount(el, {});
  const form = el.querySelector('#btForm');
  // two .field boxes as the page has them; markFields reads and writes these
  const box = key => { const ctl = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
    return { dataset: { field: key }, ctl, err: null, append(e) { this.err = e; }, querySelector() { return this.err; }, querySelectorAll() { return [ctl]; } }; };
  const boxes = [box('block_count'), box('strain')];
  form.querySelectorAll = () => boxes;
  const submit = () => form.listeners.submit({ preventDefault() {} });
  api.createBatch = async () => { throw new api.ApiError(400, 'Invalid batch', ['block_count: required', 'block_wet_kg: must be above 0']); };
  await submit();
  const msg = el.querySelector('#btMsg');
  assert.equal(msg.textContent, 'Check the marked fields.');
  assert.equal(msg.dataset.lvl, 'error');
  assert.equal(msg.hidden, false);
  assert.equal(globalThis.location.hash, '#/batches');
  assert.equal(boxes[0].err.textContent, 'Fill this in.');
  assert.equal(boxes[0].err.hidden, false);
  assert.equal(boxes[0].ctl.attrs['aria-invalid'], 'true');
  assert.equal(boxes[1].err, null);                       // a field the server did not name stays clean
  api.createBatch = async body => { assert.equal(body.crop, el.querySelector('#btCrop').value); return { id: 7 }; };
  await submit();
  assert.equal(globalThis.location.hash, '#/batches/7');
  assert.equal(boxes[0].err.hidden, true);                // the marks are cleared on the next save
  assert.equal(boxes[0].ctl.attrs['aria-invalid'], undefined);
});

test('BT9 Finish batch asks first; the confirm text is the C11 text', async t => {
  globalThis.document = { createElement: mk };
  const api = globalThis.FarmApi, saved = { ...api }, prevConfirm = globalThis.confirm;
  t.after(() => { Object.assign(api, saved); delete globalThis.document; globalThis.confirm = prevConfirm; registered.batches.unmount(); });
  let cleared = 0, asked = null, answer = false;
  api.getBatch = async () => structuredClone({ ...BATCH, state: 'placed', placed_at: BATCH.received_at, room_name: 'Room 1' });
  api.listRooms = async () => [];
  api.clearBatch = async () => { cleared++; return {}; };
  globalThis.confirm = text => { asked = text; return answer; };
  const el = mkEl();
  await registered.batches.mount(el, { id: 1 });
  const head = el.querySelector('#bdHead').children[0];       // the page head: titles first, then the action row
  assert.equal(head.children[0].children[0].textContent, 'Grey oyster · PO-2');
  assert.equal(head.children[0].children[1].textContent, 'Growing in Room 1 · Arrived to placed: 0 days');
  await el.querySelector('#bdClear').listeners.click();
  assert.equal(asked, 'Finish this batch? Its blocks are thrown out and it takes no more crates.');
  assert.equal(cleared, 0);
  answer = true;
  await el.querySelector('#bdClear').listeners.click();
  assert.equal(cleared, 1);
});

test('BT10 helpers: title without a dash, state words, singular and plural days', () => {
  const b = { crop: 'oyster', strain: null, state: 'received', room_name: null, received_at: 1791388800, placed_at: null };
  assert.equal(B.titleOf(b), 'Grey oyster');
  assert.equal(B.titleOf({ ...b, strain: 'PO-2' }), 'Grey oyster · PO-2');
  assert.equal(B.stateWords(b), 'New, not in a room yet');
  assert.equal(B.stateWords({ ...b, state: 'placed', room_name: 'Room 2' }), 'Growing in Room 2');
  assert.equal(B.stateWords({ ...b, state: 'cleared' }), 'Finished');
  assert.equal(B.subText(b), 'New, not in a room yet');
  assert.equal(B.subText({ ...b, state: 'placed', room_name: 'R', placed_at: b.received_at + 86400 }), 'Growing in R · Arrived to placed: 1 day');
  assert.equal(B.subText({ ...b, state: 'placed', room_name: 'R', placed_at: b.received_at + 3 * 86400 }), 'Growing in R · Arrived to placed: 3 days');
  assert.equal(B.daysText(0), '0 days');
  assert.equal(B.plural(1, 'crate', 'crates'), '1 crate');
  assert.deepEqual(B.filterByState([{ state: 'placed', id: 1 }, { state: 'cleared', id: 2 }], 'placed').map(x => x.id), [1]);
});

test('BT11 list: New batch card closed with batches, open without; the button opens it; empty tab text', async t => {
  globalThis.document = { createElement: mk };
  const api = globalThis.FarmApi, saved = { ...api };
  t.after(() => { Object.assign(api, saved); delete globalThis.document; registered.batches.unmount(); });
  const el = mkEl();
  api.listBatches = async () => [{ ...BATCH, state: 'placed', placed_at: BATCH.received_at, room_name: 'Room 1' }];
  await registered.batches.mount(el, {});
  assert.equal(el.querySelector('#btNew').open, false);
  assert.equal(el.querySelector('#btEmpty').hidden, true);
  el.querySelector('#btTabCleared').listeners.click();
  assert.equal(el.querySelector('#btEmpty').hidden, false);
  assert.equal(el.querySelector('#btList').hidden, true);
  assert.equal(el.querySelector('#btNewBtn').listeners.click === undefined, false);
  el.querySelector('#btNewBtn').listeners.click();
  assert.equal(el.querySelector('#btNew').open, true);
  api.listBatches = async () => [];
  const el2 = mkEl();
  await registered.batches.mount(el2, {});
  assert.equal(el2.querySelector('#btNew').open, true);
});

test('BT12 a remount on the same element: a late list reply of the old mount is dropped', async t => {
  globalThis.document = { createElement: mk };
  const api = globalThis.FarmApi, saved = { ...api };
  t.after(() => { Object.assign(api, saved); delete globalThis.document; registered.batches.unmount(); });
  const a = deferred(), b = deferred();
  const replies = [a, b];
  api.listBatches = () => replies.shift().promise;
  const el = mkEl();
  const first = registered.batches.mount(el, {});
  registered.batches.unmount();
  const second = registered.batches.mount(el, {});
  b.resolve([]);
  await second;
  assert.equal(el.querySelector('#btNew').open, true);
  a.resolve([{ ...BATCH, state: 'placed', placed_at: BATCH.received_at }]);
  await first;
  assert.equal(el.querySelector('#btNew').open, true);                       // the old reply did not close it
  assert.equal(el.querySelector('#btList').querySelector('tbody').children.length, 0);
});
