// Costs' equipment register (spec 2026-11-12-money-truth-design.md 6): an item's checks, its write-off a month at a time, its
// view, the Costs lines it gives (a room's on its run, the farm's shared), the tiles' profit before write-off, and the routes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkEquipment, equipmentView, PARTS } from '../server/costs-equipment.js';
import { writeOffCharges, figuresOf, runTotals, addMonths } from '../server/costs-math.js';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createEvents } from '../server/events.js';

const fail = (status, message, field) => { throw Object.assign(new Error(message), { status, field }); };
const check = (body, o = {}) => checkEquipment(body, { today: '2026-11-12', roomOf: (id) => (id === 2 ? { id: 2 } : null), fail, ...o });
const DAIKIN = { name: ' Daikin FTKF 2.5 hp ', roomId: 2, part: 'cooling', boughtOn: '2025-01-03', amount: 4170, lifeMonths: 60 };
const refused = (body, field) => assert.throws(() => check(body), (e) => e.status === 400 && e.field === field, JSON.stringify(body));

test('an item\'s checks: its name, room, part, any day bought up to today, RM, whole months, a resale up to what it cost', () => {
  assert.deepEqual(check(DAIKIN), { name: 'Daikin FTKF 2.5 hp', roomId: 2, part: 'cooling', boughtOn: '2025-01-03', amount: 4170, lifeMonths: 60, resale: 0, note: '' });
  assert.equal(check({ ...DAIKIN, boughtOn: '2019-06-30', roomId: null }).boughtOn, '2019-06-30', 'any day: no 400-day floor');
  assert.equal(check({ ...DAIKIN, part: undefined }).part, 'other');
  assert.deepEqual(PARTS, ['building', 'cooling', 'humidifier', 'fans', 'racks', 'other']);
  refused({ ...DAIKIN, name: ' ' }, 'name');
  refused({ ...DAIKIN, name: 'x'.repeat(61) }, 'name');
  refused({ ...DAIKIN, roomId: 9 }, 'roomId');
  refused({ ...DAIKIN, part: 'engine' }, 'part');
  refused({ ...DAIKIN, boughtOn: '2026-11-13' }, 'boughtOn');
  refused({ ...DAIKIN, boughtOn: '2026-02-30' }, 'boughtOn');
  refused({ ...DAIKIN, amount: 0 }, 'amount');
  refused({ ...DAIKIN, amount: 10_000_001 }, 'amount');
  refused({ ...DAIKIN, lifeMonths: 0 }, 'lifeMonths');
  refused({ ...DAIKIN, lifeMonths: 12.5 }, 'lifeMonths');
  refused({ ...DAIKIN, lifeMonths: 241 }, 'lifeMonths');
  refused({ ...DAIKIN, resale: -1 }, 'resale');
  refused({ ...DAIKIN, resale: 4170.01 }, 'resale');
  assert.throws(() => check({ ...DAIKIN, resale: 5000 }), { message: 'The resale value can’t be more than what it cost' });
  assert.equal(check({ amount: 5000 }, { old: check(DAIKIN) }).amount, 5000, 'an edit keeps what it leaves out');
});

test('the write-off: once a month on its day from the month bought, (RM − resale) ÷ months floored, the last the rest; none to come', () => {
  const item = { amount: 4170, resale: 0, lifeMonths: 60, boughtOn: '2025-01-31' };
  const all = writeOffCharges(item, '0000-01-01', '2099-12-31', '2099-12-31');
  assert.equal(all.length, 60);
  assert.ok(all.every((c) => c.amount === 69.5));
  assert.deepEqual(all.slice(0, 3).map((c) => c.date), ['2025-01-31', '2025-02-28', '2025-03-31'], 'the month\'s last day when shorter');
  assert.deepEqual(writeOffCharges({ amount: 1000, resale: 100, lifeMonths: 3, boughtOn: '2026-08-10' }, '0000-01-01', '2026-12-31', '2026-12-31').map((c) => c.amount), [300, 300, 300]);
  assert.deepEqual(writeOffCharges({ amount: 100, resale: 0, lifeMonths: 3, boughtOn: '2026-08-10' }, '0000-01-01', '2026-12-31', '2026-12-31').map((c) => c.amount), [33.33, 33.33, 33.34]);
  assert.deepEqual(writeOffCharges(item, '2026-11-01', '2026-11-30', '2026-11-12'), [], 'November\'s charge on the 30th: not yet');
  assert.deepEqual(writeOffCharges(item, '2026-10-01', '2026-10-31', '2026-11-12'), [{ date: '2026-10-31', amount: 69.5 }]);
  assert.deepEqual(writeOffCharges(item, '2030-01-01', '2030-12-31', '2031-01-01'), [], 'written off by then');
  const view = equipmentView({ ...item, id: 1, name: 'Daikin', roomId: 2, part: 'cooling', note: '' }, '2026-11-12', 'Container 1');
  assert.deepEqual([view.monthly, view.written, view.left, view.done, view.roomName], [69.5, 1529, 2641, false, 'Container 1'], '22 months, Jan 2025 to Oct 2026');
});

// A farm on 15 Nov 2026 with Container 1's open run (100 blocks) and Container 2's (300 blocks).
const run = (o) => ({ id: 1, roomId: 1, startDate: '2026-10-01', endDate: null, blocks: 100, ...o });
const data = (o = {}) => ({
  today: '2026-11-15', keptFrom: '2025-10-12', prices: { electricity: 0.5, water: null }, rooms: new Map([[1, 'Container 1'], [2, 'Container 2']]),
  runs: [run({ id: 1 }), run({ id: 2, roomId: 2, blocks: 300 })], costs: [], usage: new Map(), batches: [], purchases: [], uses: [], sales: [], harvests: [],
  cropYield: {}, equipment: [], ...o,
});

test('Costs\' lines: a room\'s item on its run, the farm\'s shared by block-days; profit before write-off; a run\'s equipment part', () => {
  const equipment = [
    { id: 1, name: 'Daikin', roomId: 1, part: 'cooling', boughtOn: '2025-01-03', amount: 4170, resale: 0, lifeMonths: 60 },
    { id: 2, name: 'Mixer', roomId: null, part: 'other', boughtOn: '2026-06-01', amount: 1200, resale: 0, lifeMonths: 12 },
  ];
  const d = data({ equipment, sales: [{ id: 1, date: '2026-11-06', crop: 'oyster', kg: 10, total: 500, roomId: 1, runId: 1 }] });
  const f = figuresOf('2026-11-01', '2026-11-15', d);
  assert.deepEqual(f.lines.filter((l) => l.key === 'equipment').map((l) => [l.name, l.amount, l.runId, l.shared]), [['Daikin', 69.5, 1, false], ['Mixer', 100, null, true]]);
  assert.equal(f.writeOff, 169.5);
  assert.equal(f.costs, 169.5);
  assert.equal(f.profit, 330.5);
  assert.equal(f.profitBeforeWriteOff, 500, 'what Economics calls the month before the write-off');
  assert.deepEqual([f.runs.get(1).equipment, f.runs.get(1).shared, f.runs.get(2).shared], [69.5, 25, 75], 'the mixer by block-days, 1 : 3');
  const byCat = f.byCategory.find((c) => c.key === 'equipment');
  assert.deepEqual([byCat.label, byCat.source, byCat.amount], ['Equipment written off', 'register', 169.5]);
  const months = (m) => figuresOf(`${m}-01`, m === '2026-11' ? '2026-11-15' : `${m}-${m === '2026-10' ? '31' : '30'}`, d);
  const r = runTotals(d.runs[0], (m) => months(m), d.today);
  assert.equal(r.parts.equipment, 139, 'October\'s and November\'s 69.50');
  assert.deepEqual(r.byCategory.find((c) => c.category === 'equipment'), { category: 'equipment', amount: 139 });
  assert.equal(addMonths('2026-10', 1), '2026-11');
});

async function app(t, login = false) {
  const db = openDb(':memory:');
  const events = createEvents();
  const seen = [];
  events.subscribe((type) => seen.push(type));
  const server = createApp(db, { login, events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { db, call, seen };
}

test('the routes: add, list (newest bought first, with its write-off), edit, delete; 400 with its field, 404; each write tells', async (t) => {
  const { call, seen } = await app(t);
  const made = await call('POST', '/api/equipment', { name: 'Mixer', boughtOn: '2024-03-15', amount: 1200, lifeMonths: 24, resale: 200 });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.deepEqual([made.body.name, made.body.roomId, made.body.part, made.body.resale], ['Mixer', null, 'other', 200]);
  const list = await call('GET', '/api/equipment');
  assert.deepEqual(list.body.items.map((i) => [i.name, i.monthly, i.left, i.done]), [['Mixer', 41.66, 0, true]], 'bought 2024: written off');
  const bad = await call('POST', '/api/equipment', { name: 'Fan', boughtOn: '2024-03-15', amount: 100, lifeMonths: 0 });
  assert.deepEqual([bad.status, bad.body.field], [400, 'lifeMonths']);
  const put = await call('PUT', `/api/equipment/${made.body.id}`, { amount: 1500 });
  assert.deepEqual([put.status, put.body.amount, put.body.lifeMonths], [200, 1500, 24]);
  assert.equal((await call('PUT', '/api/equipment/999', { amount: 1 })).status, 404);
  assert.equal((await call('DELETE', `/api/equipment/${made.body.id}`)).status, 204);
  assert.equal((await call('DELETE', `/api/equipment/${made.body.id}`)).status, 404);
  assert.equal((await call('PATCH', '/api/equipment')).status, 404);
  assert.equal(seen.filter((x) => x === 'costs').length, 3, 'add, edit, delete');
});

test('the CSV names an item written off and its source', async () => {
  const { csvRows } = await import('../server/costs-math.js');
  const d = data({ equipment: [{ id: 1, name: 'Daikin', roomId: 1, part: 'cooling', boughtOn: '2025-01-03', amount: 4170, resale: 0, lifeMonths: 60 }] });
  const f = figuresOf('2026-11-01', '2026-11-15', d);
  assert.ok(csvRows(f, d).includes('2026-11-03,cost,Equipment written off,Daikin,Container 1,2026-10-01,equipment register,69.50'));
});
