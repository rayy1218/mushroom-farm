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

test('BT1 module registers batches and exports the C10 12.2 names and the C13 5 chart helpers', () => {
  assert.equal(typeof registered.batches.mount, 'function');
  assert.equal(typeof registered.batches.unmount, 'function');
  assert.deepEqual(Object.keys(B).sort(), ['ageDays', 'batchBody', 'batchPlan', 'notPlacedMessage', 'placedMessage', 'daysText', 'dateToSeconds', 'dropText', 'filterByState', 'flushBars', 'niceAxis', 'niceMax', 'plural', 'secondsToDate', 'stateWords', 'subText', 'timelineRows', 'titleOf'].sort());
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
    getAttribute(k) { return this.attrs[k]; },
    querySelector: sel => (stubs[sel] ||= mk(sel)), querySelectorAll: () => [], focus() {} };
}

test('BT5 #btCrop lists the crops with a fruiting range, built in mount', async t => {
  const { startFakeApi } = require('./fakes/api-server.js');
  const fake = await startFakeApi();
  const prevBase = globalThis.FarmApi.base;
  globalThis.FarmApi.base = fake.url;
  globalThis.document = { createElement: mk, createElementNS: (ns, tag) => mk(tag) };
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
  globalThis.document = { createElement: mk, createElementNS: (ns, tag) => mk(tag) };
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
  globalThis.document = { createElement: mk, createElementNS: (ns, tag) => mk(tag) };
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
  globalThis.document = { createElement: mk, createElementNS: (ns, tag) => mk(tag) };
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
  globalThis.document = { createElement: mk, createElementNS: (ns, tag) => mk(tag) };
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
  globalThis.document = { createElement: mk, createElementNS: (ns, tag) => mk(tag) };
  const api = globalThis.FarmApi, saved = { ...api };
  t.after(() => { Object.assign(api, saved); delete globalThis.document; registered.batches.unmount(); });
  const el = mkEl();
  api.listRooms = async () => [];
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
  globalThis.document = { createElement: mk, createElementNS: (ns, tag) => mk(tag) };
  const api = globalThis.FarmApi, saved = { ...api };
  t.after(() => { Object.assign(api, saved); delete globalThis.document; registered.batches.unmount(); });
  const a = deferred(), b = deferred();
  const replies = [a, b];
  api.listRooms = async () => [];
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

test('BT-V1 flushBars: BE % so far is the kg so far over the dry substrate, ending at the batch BE %', () => {
  const HRd = globalThis.FarmHarvestRules;
  const batch = { block_count: 1000, block_wet_kg: 1, moisture_pct: 60 };           // 400 kg dry
  const flushes = HRd.flushes({ ...batch, flush_gap_days: 5 }, [{ t: 0, kg: 20 }, { t: 10 * 86400, kg: 12 }, { t: 20 * 86400, kg: 8 }].map((c, i) => ({ ...c, id: i + 1, deleted_at: null })));
  const detail = { ...batch, flushes, totals: HRd.totals({ ...batch, flush_gap_days: 5 }, [{ t: 0, kg: 20 }, { t: 10 * 86400, kg: 12 }, { t: 20 * 86400, kg: 8 }].map((c, i) => ({ ...c, id: i + 1, deleted_at: null }))) };
  const bars = B.flushBars(detail);
  assert.deepEqual(bars.map(b => b.beCum), [5, 8, 10]);
  assert.equal(bars[2].beCum, detail.totals.be_pct);
  assert.deepEqual(bars.map(b => [b.n, b.kg, b.gPerBlock]), [[1, 20, 20], [2, 12, 12], [3, 8, 8]]);
  assert.deepEqual(B.flushBars({}), []);
  assert.deepEqual(B.flushBars(null), []);
});

test('BT-V2 dropText says the drop from the best flush in words', () => {
  const f = (...kgs) => kgs.map((kg, i) => ({ n: i + 1, kg }));
  assert.equal(B.dropText([]), '');
  assert.equal(B.dropText(f(5)), 'One flush so far.');
  assert.equal(B.dropText(f(10, 6)), 'Flush 2 gave 40 % less than flush 1.');
  assert.equal(B.dropText(f(6, 10)), 'Flush 2 is the best so far.');
  assert.equal(B.dropText(f(6, 10, 5)), 'Flush 3 gave 50 % less than flush 2.');
  assert.equal(B.dropText(f(4, 4)), 'Flush 2 gave the same as flush 1.');
  assert.equal(B.dropText(f(0, 0)), '');
});

test('BT-V3 niceMax gives the tightest axis of 3, 4 or 5 round steps', () => {
  assert.deepEqual(B.niceMax(0), { max: 4, steps: 4 });
  assert.deepEqual(B.niceMax(7.3), { max: 7.5, steps: 3 });
  assert.deepEqual(B.niceMax(20.5), { max: 25, steps: 5 });
  assert.deepEqual(B.niceMax(23), { max: 25, steps: 5 });
  assert.deepEqual(B.niceMax(10), { max: 10, steps: 4 });
  assert.equal(B.niceAxis(11, 5), 12.5);
  assert.equal(B.niceAxis(7, 4), 8);
  for (const v of [0.7, 3, 12, 20.5, 35, 99, 1350]) { const m = B.niceMax(v).max; assert.ok(m >= v && m < 1.35 * v + 1, `${v} -> ${m}`); }
});

test('BT-V4 timelineRows: a row per room, empty rooms kept, overlaps on lanes, Flush n in the label', () => {
  const day = 86400, now = 1791388800 + 40 * day;
  const rooms = [{ id: 2, name: 'Room B' }, { id: 1, name: 'Room A' }, { id: 3, name: 'Room C' }];
  const mk = (id, room, crop, placed, flushes, extra) => ({ id, room_id: room, room_name: `Room ${room}`, crop, state: 'placed', placed_at: placed, cleared_at: null, totals: { flushes }, ...extra });
  const batches = [mk(10, 1, 'oyster', now - 30 * day, 2), mk(11, 1, 'oyster', now - 5 * day, 0), mk(12, 2, 'lionsmane', now - 10 * day, 1),
    { ...mk(13, 3, 'oyster', now - 50 * day, 3), state: 'cleared', cleared_at: now - 20 * day }];
  const t = B.timelineRows(rooms, batches, now, 'placed');
  assert.deepEqual(t.rows.map(r => r.name), ['Room A', 'Room B', 'Room C']);
  assert.equal(t.rows[0].bars.length, 2);
  assert.deepEqual(t.rows[0].bars.map(b => b.lane), [0, 1]);
  assert.equal(t.rows[0].lanes, 2);
  assert.match(t.rows[0].bars[0].label, /Flush 2$/);
  assert.equal(t.rows[0].bars[1].label, CC.CROPS.oyster.name);          // no crate yet: just the mushroom
  assert.equal(t.rows[2].bars.length, 0);                              // empty room kept, the finished batch is not growing
  assert.equal(t.to, now);
  assert.equal(t.from, now - 30 * day);
  assert.equal(t.rows[0].bars[0].since, now - 30 * day);
  const done = B.timelineRows(rooms, batches, now, 'cleared');
  assert.deepEqual(done.rows.map(r => r.name), ['Room C']);            // Finished lists only rooms that had batches
  assert.deepEqual([done.rows[0].bars[0].from, done.rows[0].bars[0].to], [now - 50 * day, now - 20 * day]);
  assert.equal(done.to, now - 20 * day);                               // Finished ends at the last clearing, no today
});

test('BT-V5 timelineRows copes with no data and with a room missing from the list', () => {
  const now = 1791388800;
  const none = B.timelineRows([], [], now, 'placed');
  assert.deepEqual(none.rows, []);
  assert.equal(none.to - none.from, 14 * 86400);
  const b = { id: 1, room_id: 9, room_name: 'Old room', crop: 'oyster', state: 'placed', placed_at: now - 86400, totals: { flushes: 0 } };
  const t = B.timelineRows([{ id: 1, name: 'A' }], [b], now, 'placed');
  assert.deepEqual(t.rows.map(r => r.name).sort(), ['A', 'Old room']);
});

test('BT-V6 timelineRows keeps a window of at most 90 days: older bars start at the edge and say since', () => {
  const day = 86400, now = 1791388800 + 200 * day;
  const b = { id: 1, room_id: 1, room_name: 'A', crop: 'oyster', state: 'placed', placed_at: now - 150 * day, totals: { flushes: 4 } };
  const t = B.timelineRows([{ id: 1, name: 'A' }], [b], now, 'placed');
  assert.equal(t.to - t.from, 90 * day);
  assert.equal(t.rows[0].bars[0].from, t.from);
  assert.equal(t.rows[0].bars[0].since, now - 150 * day);
  const gone = { ...b, id: 2, state: 'cleared', cleared_at: now - 120 * day };
  const f = B.timelineRows([{ id: 1, name: 'A' }], [gone, { ...gone, id: 3, cleared_at: now - 10 * day }], now, 'cleared');
  assert.deepEqual(f.rows[0].bars.map(x => x.id), [3]);               // ended before the window opened (the newest clearing is the end)
});

// Walks the recording SVG for elements by class.
const findAll = (node, cls, out = []) => { if (node && node.attrs && String(node.attrs.class || '').split(' ').includes(cls)) out.push(node); for (const c of (node && node.children) || []) findAll(c, cls, out); return out; };
const FLUSH_DETAIL = { ...BATCH, id: 7, state: 'placed', room_id: 1, room_name: 'Room 1', placed_at: BATCH.received_at, block_count: 1000, block_wet_kg: 1, moisture_pct: 60,
  flushes: [{ n: 1, from: 1, to: 2, crates: 2, kg: 20, g_per_block: 20, be_pct: 5 }, { n: 2, from: 3, to: 4, crates: 1, kg: 12, g_per_block: 12, be_pct: 3 }],
  totals: { crates: 3, kg: 32, g_per_block: 32, be_pct: 8, flushes: 2 }, crates: [] };

test('BT-V7 the batch page draws the flush chart as an image at its own width', async t => {
  globalThis.document = { createElement: mk, createElementNS: (ns, tag) => mk(tag) };
  const api = globalThis.FarmApi, saved = { ...api };
  t.after(() => { Object.assign(api, saved); delete globalThis.document; registered.batches.unmount(); });
  api.getBatch = async () => structuredClone(FLUSH_DETAIL);
  api.listRooms = async () => [];
  const el = mkEl();
  await registered.batches.mount(el, { id: 7 });
  const svg = el.querySelector('#bdChartSvg').children[0];
  assert.equal(svg.attrs.role, 'img');
  assert.match(svg.attrs['aria-label'], /Flush 2 gave 40 % less than flush 1/);
  assert.match(svg.attrs['aria-label'], /20\.0 kg/);
  assert.equal(svg.attrs.viewBox, `0 0 ${svg.attrs.width} ${svg.attrs.height}`);
  assert.equal(el.querySelector('#bdChart').hidden, false);
  assert.equal(el.querySelector('#bdChartSum').textContent, 'Flush 2 gave 40 % less than flush 1.');
  assert.equal(findAll(svg, 'vz-bar').length, 2);
});

test('BT-V8 a remount on the same element: a late batch reply of the old mount draws nothing', async t => {
  globalThis.document = { createElement: mk, createElementNS: (ns, tag) => mk(tag) };
  const api = globalThis.FarmApi, saved = { ...api };
  t.after(() => { Object.assign(api, saved); delete globalThis.document; registered.batches.unmount(); });
  const late = deferred();
  const replies = [late.promise, Promise.resolve(structuredClone(FLUSH_DETAIL))];
  api.getBatch = () => replies.shift();
  api.listRooms = async () => [];
  const el = mkEl();
  const first = registered.batches.mount(el, { id: 7 });
  registered.batches.unmount();
  await registered.batches.mount(el, { id: 7 });
  const drawn = el.querySelector('#bdChartSvg').children[0];
  assert.ok(drawn);
  late.resolve({ ...structuredClone(FLUSH_DETAIL), flushes: [FLUSH_DETAIL.flushes[0]] });
  await first;
  assert.equal(el.querySelector('#bdChartSvg').children[0], drawn);     // not redrawn from the old reply
  assert.match(drawn.attrs['aria-label'], /Flush 2/);
});

test('BT-V9 the Growing tab draws the timeline, a bar opens its batch, Finished renames the heading', async t => {
  globalThis.document = { createElement: mk, createElementNS: (ns, tag) => mk(tag) };
  globalThis.location = { hash: '#/batches' };
  const api = globalThis.FarmApi, saved = { ...api };
  t.after(() => { Object.assign(api, saved); delete globalThis.document; delete globalThis.location; registered.batches.unmount(); });
  const now = Math.floor(Date.now() / 1000);
  api.listRooms = async () => [{ id: 1, name: 'Room 1' }, { id: 2, name: 'Room 2' }];
  api.listBatches = async () => [{ ...FLUSH_DETAIL, placed_at: now - 20 * 86400 }];
  const el = mkEl();
  await registered.batches.mount(el, {});
  const host = el.querySelector('#btTimelineChart');
  const svg = host.children[0];
  assert.equal(svg.attrs.role, 'group');
  const hits = findAll(svg, 'vz-hit');
  assert.equal(hits.length, 1);
  assert.match(hits[0].attrs['aria-label'], /^Open .* · Flush 2 in Room 1, placed \d+ \w+$/);
  assert.equal(findAll(svg, 'vz-sub').some(n => n.textContent === 'Empty'), true);
  host.listeners.click({ target: { closest: () => hits[0] } });
  assert.equal(globalThis.location.hash, '#/batches/7');
  assert.equal(el.querySelector('#btTimelineHead').textContent, 'What is growing where');
  el.querySelector('#btTabCleared').listeners.click();
  assert.equal(el.querySelector('#btTimelineHead').textContent, 'What grew where');
});

// ---- C14 5: blocks in one step ----

const FORM = { crop: 'oyster', strain: '', source: '', block_count: '10', block_wet_kg: '1.2', moisture_pct: '60', received_at: '2026-10-08' };

test('BT-W1 batchPlan: create body, and a place body only when a room is chosen', () => {
  const none = B.batchPlan({ ...FORM, room_id: '', placed_at: '2026-10-09' });
  assert.deepEqual(none.create, { crop: 'oyster', block_count: 10, block_wet_kg: 1.2, moisture_pct: 60, received_at: 1791388800 });
  assert.equal(none.place, null);
  const put = B.batchPlan({ ...FORM, room_id: '3', placed_at: '2026-10-09' });
  assert.deepEqual(put.create, none.create);
  assert.deepEqual(put.place, { room_id: 3, placed_at: 1791388800 + 86400 });
  assert.equal(B.batchPlan({ ...FORM, room_id: '3', placed_at: 'x' }).place.placed_at, 'x');
});

test('BT-W2 the two messages', () => {
  assert.equal(B.placedMessage('Room 1'), 'Batch saved and placed in Room 1.');
  assert.equal(B.notPlacedMessage('Placed on is in the future.'), 'Batch saved, but not placed: Placed on is in the future. Use Place in room below.');
  assert.equal(B.notPlacedMessage('Boom'), 'Batch saved, but not placed: Boom. Use Place in room below.');
});

function setupNew(t) {
  globalThis.document = { createElement: mk, createElementNS: (ns, tag) => mk(tag) };
  globalThis.location = { hash: '#/batches' };
  const api = globalThis.FarmApi, saved = { ...api };
  t.after(() => { Object.assign(api, saved); delete globalThis.document; delete globalThis.location; registered.batches.unmount(); });
  api.listBatches = async () => [];
  api.listRooms = async () => [{ id: 3, name: 'Room 1' }, { id: 4, name: 'Old', archived_at: 5 }];
  return api;
}

test('BT-W3 the form is prefilled, lists Not yet and the rooms, and shows Placed on only with a room', async t => {
  const api = setupNew(t);
  const el = mkEl();
  await registered.batches.mount(el, {});
  assert.equal(el.querySelector('#btKg').value, 1.2);
  assert.equal(el.querySelector('#btMoist').value, HR.DEFAULTS.moisture_pct);
  const sel = el.querySelector('#btRoom');
  assert.deepEqual(sel.children.map(o => [o.value, o.textContent]), [['', 'Not yet'], ['3', 'Room 1']]);
  assert.equal(el.querySelector('#btPlacedBox').hidden, true);
  sel.value = '3';
  sel.listeners.change();
  assert.equal(el.querySelector('#btPlacedBox').hidden, false);
  assert.equal(el.querySelector('#btPlaced').value, el.querySelector('#btReceived').value);
  assert.equal(el.querySelector('#btPlaced').min, el.querySelector('#btReceived').value);
  void api;
});

test('BT-W4 create then place: the success message is said on the batch page, once', async t => {
  const api = setupNew(t);
  const el = mkEl();
  await registered.batches.mount(el, {});
  el.querySelector('#btRoom').value = '3';
  const calls = [];
  api.createBatch = async body => { calls.push(['create', body]); return { id: 7 }; };
  api.placeBatch = async (id, body) => { calls.push(['place', id, body]); return {}; };
  await el.querySelector('#btForm').listeners.submit({ preventDefault() {} });
  assert.deepEqual(calls.map(c => c[0]), ['create', 'place']);
  assert.equal(calls[1][1], 7);
  assert.equal(calls[1][2].room_id, 3);
  assert.equal(globalThis.location.hash, '#/batches/7');
  api.getBatch = async () => BATCH;
  const page = mkEl();
  await registered.batches.mount(page, { id: 7 });
  const msg = page.querySelector('#bdMsg');
  assert.equal(msg.textContent, 'Batch saved and placed in Room 1.');
  assert.equal(msg.dataset.lvl, 'good');
  const again = mkEl();                                    // said once
  await registered.batches.mount(again, { id: 7 });
  assert.notEqual(again.querySelector('#bdMsg').textContent, 'Batch saved and placed in Room 1.');
});

test('BT-W5 place fails: still goes to the batch, with the not-placed message; Not yet makes no place call', async t => {
  const api = setupNew(t);
  const el = mkEl();
  await registered.batches.mount(el, {});
  el.querySelector('#btRoom').value = '3';
  api.createBatch = async () => ({ id: 8 });
  api.placeBatch = async () => { throw new api.ApiError(400, 'Invalid', ['placed_at: must not be in the future']); };
  await el.querySelector('#btForm').listeners.submit({ preventDefault() {} });
  assert.equal(globalThis.location.hash, '#/batches/8');
  api.getBatch = async () => BATCH;
  const page = mkEl();
  await registered.batches.mount(page, { id: 8 });
  const msg = page.querySelector('#bdMsg');
  assert.match(msg.textContent, /^Batch saved, but not placed: Placed on: .*\. Use Place in room below\.$/);
  assert.equal(msg.dataset.lvl, 'error');
  // a note for another batch is not shown on this one
  let placed = 0;
  api.placeBatch = async () => { placed++; };
  const el2 = mkEl();
  await registered.batches.mount(el2, {});
  el2.querySelector('#btRoom').value = '';
  api.createBatch = async () => ({ id: 9 });
  await el2.querySelector('#btForm').listeners.submit({ preventDefault() {} });
  assert.equal(placed, 0);
  assert.equal(globalThis.location.hash, '#/batches/9');
});
