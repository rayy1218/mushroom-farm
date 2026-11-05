// The Sales store (server/sales.js, spec 2026-11-05-sales-design.md 2, 3, 4 and 5): record, edit, delete and paid with
// their limits, buyers, the page's view, the sheet's range, the summary and the CSV, and the change hook.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createSales } from '../server/sales.js';
import { SalesError } from '../server/sales-math.js';
import { addDays } from '../server/task-rules.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5, 2); // 5 Nov 2026 10:00 at the farm
const ROOM = { name: 'Container 1', length: 6, width: 4, height: 2.5 };
const refused = (fn, status, field) => assert.throws(fn, (e) => e instanceof SalesError && e.status === status && e.field === field);

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = NOW;
  const sales = createSales({ db, now: () => clock });
  const changes = [];
  sales.onChange(() => changes.push(1));
  const roomId = db.createRoom(ROOM, 1000).id;
  const buyer = sales.addBuyer({ name: 'Kedai Ah Seng', prices: { oyster: 12 } });
  return { db, sales, changes, roomId, buyer, setClock: (ms) => { clock = ms; } };
}

test('record a sale: the buyer\'s name copied, the room\'s open run found, the delivery back', (t) => {
  const { db, sales, roomId, buyer, changes } = setup(t);
  const crops = [{ crop: 'oyster', blocks: 500 }];
  db.setProgram(roomId, { ...db.getProgram(roomId), crops }, { change: 'start', at: NOW - 10 * DAY });
  const runId = db.openRun(roomId).id;
  const d = sales.record({ soldAt: NOW - 3_600_000, buyerId: buyer.id, invoiceNo: 'R-1', lines: [
    { crop: 'pink', kg: 4.5, priceKg: 14 }, { crop: 'oyster', kg: 12, priceKg: 10.5, roomId },
  ] });
  assert.equal(d.buyer, 'Kedai Ah Seng');
  assert.deepEqual([d.kg, d.total, d.paidAt], [16.5, 189, null]);
  assert.deepEqual(d.lines.map((l) => [l.crop, l.roomName, l.runId]), [['oyster', 'Container 1', runId], ['pink', null, null]]);
  assert.ok(changes.length >= 2, 'addBuyer and record told the listeners');
});

test('record refused: an unknown or archived buyer, a room that is gone', (t) => {
  const { sales, buyer } = setup(t);
  const line = [{ crop: 'oyster', kg: 1, priceKg: 1 }];
  refused(() => sales.record({ soldAt: NOW, buyerId: 999, lines: line }), 400, 'buyerId');
  refused(() => sales.record({ soldAt: NOW, buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 1, priceKg: 1, roomId: 999 }] }), 400, 'lines.0.roomId');
  sales.editBuyer(buyer.id, { archived: true });
  refused(() => sales.record({ soldAt: NOW, buyerId: buyer.id, lines: line }), 400, 'buyerId');
});

test('edit: lines replaced, paid kept; an archived buyer kept on its own sale; a date after the paid day refused', (t) => {
  const { sales, buyer } = setup(t);
  const d = sales.record({ soldAt: NOW - 3 * DAY, buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 10 }] });
  sales.setPaid(d.id, { paidAt: NOW - 2 * DAY });
  sales.editBuyer(buyer.id, { archived: true });
  const e = sales.edit(d.id, { soldAt: NOW - 3 * DAY, buyerId: buyer.id, lines: [{ crop: 'black', kg: 1, priceKg: 9 }] });
  assert.deepEqual([e.id, e.paidAt, e.lines.map((l) => l.crop)], [d.id, NOW - 2 * DAY, ['black']]);
  refused(() => sales.edit(d.id, { soldAt: NOW - 1 * DAY, buyerId: buyer.id, lines: [{ crop: 'black', kg: 1, priceKg: 9 }] }), 400, 'soldAt');
  refused(() => sales.edit(999, { soldAt: NOW, buyerId: buyer.id, lines: [{ crop: 'black', kg: 1, priceKg: 9 }] }), 404, undefined);
});

test('paid and unpaid; delete', (t) => {
  const { sales, buyer } = setup(t);
  const d = sales.record({ soldAt: NOW - DAY, buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 10 }] });
  assert.equal(sales.setPaid(d.id, { paidAt: NOW }).paidAt, NOW);
  assert.equal(sales.setPaid(d.id, { paidAt: null }).paidAt, null);
  refused(() => sales.setPaid(d.id, { paidAt: NOW - 3 * DAY }), 400, 'paidAt');
  refused(() => sales.setPaid(999, { paidAt: null }), 404, undefined);
  sales.remove(d.id);
  refused(() => sales.remove(d.id), 404, undefined);
});

test('buyers: a name taken is 409 without regard to case; a buyer with sales cannot be deleted, only archived', (t) => {
  const { sales, buyer } = setup(t);
  refused(() => sales.addBuyer({ name: 'KEDAI AH SENG' }), 409, 'name');
  const other = sales.addBuyer({ name: 'Borong Lim' });
  refused(() => sales.editBuyer(other.id, { name: 'kedai ah seng' }), 409, 'name');
  sales.record({ soldAt: NOW, buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 10 }] });
  refused(() => sales.removeBuyer(buyer.id), 409, undefined);
  sales.removeBuyer(other.id);
  refused(() => sales.editBuyer(other.id, { phone: '1' }), 404, undefined);
  const [b] = sales.buyers();
  assert.deepEqual([b.name, b.sales, b.owed, b.prices], ['Kedai Ah Seng', 1, 20, { oyster: 12 }]);
});

test('the view: the period\'s deliveries and totals with harvested kg, owed all time, by crop and by buyer', (t) => {
  const { db, sales, roomId, buyer } = setup(t);
  const crops = [{ crop: 'oyster', blocks: 500 }];
  db.setProgram(roomId, { ...db.getProgram(roomId), crops }, { change: 'start', at: NOW - 60 * DAY });
  const run = db.openRun(roomId);
  db.insertHarvest({ roomId, runId: run.id, crop: 'oyster', stage: 'fruiting', flush: 1, blocks: 500, kg: 20, pickedAt: NOW - 2 * DAY, worker: null, taskId: null, at: NOW });
  sales.record({ soldAt: NOW - 40 * DAY, buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 5, priceKg: 10 }] }); // out of 30 days, unpaid
  const d = sales.record({ soldAt: NOW - DAY, buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 15, priceKg: 11 }] });
  sales.setPaid(d.id, { paidAt: NOW });
  const v = sales.view({ days: 30 });
  assert.deepEqual([v.from, v.to, v.days], ['2026-10-07', '2026-11-05', 30]);
  assert.deepEqual(v.totals, { kg: 15, total: 165, harvestedKg: 20, count: 1 });
  assert.deepEqual([v.owed.total, v.owed.count], [50, 1]);
  assert.deepEqual(v.byCrop, [{ crop: 'oyster', kg: 15, harvestedKg: 20, total: 165, avgPriceKg: 11, expectedPriceKg: null }]);
  assert.deepEqual(v.byBuyer, [{ buyerId: buyer.id, buyer: 'Kedai Ah Seng', kg: 15, total: 165, owed: 50 }]);
  assert.equal(v.buyerCount, 1);
  refused(() => sales.view({ days: 31 }), 400, 'days');
});

test('the sheet\'s range, the summary for Costs and the CSV', (t) => {
  const { sales, buyer } = setup(t);
  sales.record({ soldAt: Date.UTC(2026, 10, 3, 1), buyerId: buyer.id, invoiceNo: 'R-1', lines: [{ crop: 'oyster', kg: 2, priceKg: 10 }] });
  sales.record({ soldAt: Date.UTC(2026, 10, 4, 1), buyerId: buyer.id, lines: [{ crop: 'pink', kg: 1, priceKg: 14 }] });
  const r = sales.range({ from: '2026-11-04', to: '2026-11-05' });
  assert.deepEqual(r.lines.map((l) => [l.date, l.crop, l.kg, l.priceKg, l.total, l.invoiceNo, l.buyer, l.roomName]), [['2026-11-04', 'pink', 1, 14, 14, null, 'Kedai Ah Seng', null]]);
  refused(() => sales.range({ from: '2026-11-05', to: '2026-11-04' }), 400, 'from');
  refused(() => sales.range({ from: '2024-01-01', to: '2026-11-04' }), 400, 'from');
  refused(() => sales.range({ from: '2026-13-01', to: '2026-11-04' }), 400, 'from');
  assert.deepEqual(sales.summary({}), { kg: 3, total: 34, byCrop: [{ crop: 'oyster', kg: 2, total: 20 }, { crop: 'pink', kg: 1, total: 14 }], byRun: [] });
  assert.deepEqual(sales.summary({ from: '2026-11-04' }).kg, 1);
  assert.deepEqual(sales.summary({ run: 5 }).kg, 0);
  const csv = sales.csv(7);
  assert.equal(csv.name, 'sales 2026-10-30–2026-11-05.csv');
  assert.equal(csv.text.split('\r\n').length, 4, 'header, two lines, the closing line break');
});

const line = [{ crop: 'oyster', kg: 2, priceKg: 10 }];
const crops = [{ crop: 'oyster', blocks: 500 }];

test('run at the sale: a sale in run 1 gets run 1, before any run null, an edit into run 2 gets run 2', (t) => {
  const { db, sales, roomId, buyer } = setup(t);
  db.setProgram(roomId, { ...db.getProgram(roomId), crops }, { change: 'start', at: NOW - 20 * DAY });
  const run1 = db.openRun(roomId).id;
  db.setProgram(roomId, db.getProgram(roomId), { change: 'restart', at: NOW - 5 * DAY });
  const run2 = db.openRun(roomId).id;
  assert.notEqual(run1, run2);
  const l = (soldAt, id = buyer.id) => ({ soldAt, buyerId: id, lines: [{ crop: 'oyster', kg: 1, priceKg: 1, roomId }] });
  const d = sales.record(l(NOW - 10 * DAY));
  assert.equal(d.lines[0].runId, run1);
  assert.equal(sales.record(l(NOW - 30 * DAY)).lines[0].runId, null);
  assert.equal(sales.edit(d.id, l(NOW - 2 * DAY)).lines[0].runId, run2);
});

test('edit onto an archived buyer other than its own is refused', (t) => {
  const { sales, buyer } = setup(t);
  const b = sales.addBuyer({ name: 'Borong Lim' });
  const d = sales.record({ soldAt: NOW - DAY, buyerId: buyer.id, lines: line });
  sales.editBuyer(b.id, { archived: true });
  refused(() => sales.edit(d.id, { soldAt: NOW - DAY, buyerId: b.id, lines: line }), 400, 'buyerId');
});

test('paid day: an edit within the paid day is allowed, the day after is refused', (t) => {
  const { sales, buyer } = setup(t);
  const day = (h) => Date.UTC(2026, 10, 3, h - 8);
  const d = sales.record({ soldAt: day(1) - DAY, buyerId: buyer.id, lines: line });
  sales.setPaid(d.id, { paidAt: day(9) });
  assert.equal(sales.edit(d.id, { soldAt: day(15), buyerId: buyer.id, lines: line }).soldAt, day(15));
  refused(() => sales.edit(d.id, { soldAt: day(9) + DAY, buyerId: buyer.id, lines: line }), 400, 'soldAt');
});

test('the view: the to day\'s late sale and harvest counted, the day before from not; archived buyers not counted', (t) => {
  const { db, sales, roomId, buyer, setClock } = setup(t);
  setClock(Date.UTC(2026, 10, 5, 15, 30)); // 23:30 farm
  db.setProgram(roomId, { ...db.getProgram(roomId), crops }, { change: 'start', at: NOW - 60 * DAY });
  const run = db.openRun(roomId);
  const pick = (kg, pickedAt) => db.insertHarvest({ roomId, runId: run.id, crop: 'oyster', stage: 'fruiting', flush: 1, blocks: 500, kg, pickedAt, worker: null, taskId: null, at: pickedAt });
  const sell = (kg, soldAt) => sales.record({ soldAt, buyerId: buyer.id, lines: [{ crop: 'oyster', kg, priceKg: 10 }] });
  sell(3, Date.UTC(2026, 10, 5, 15, 0)); pick(7, Date.UTC(2026, 10, 5, 15, 0));
  sell(5, Date.UTC(2026, 9, 6, 16, 0)); pick(11, Date.UTC(2026, 9, 6, 16, 0)); // 7 Oct 00:00 farm: in
  sell(100, Date.UTC(2026, 9, 6, 15, 59)); pick(200, Date.UTC(2026, 9, 6, 15, 59)); // 6 Oct 23:59: out
  sales.editBuyer(sales.addBuyer({ name: 'Old' }).id, { archived: true });
  const v = sales.view({ days: 30 });
  assert.deepEqual(v.totals, { kg: 8, total: 80, harvestedKg: 18, count: 2 });
  assert.equal(v.buyerCount, 1);
});

test('range: oldest first, 400 days ok and 401 refused, a bad to or 30 February refused', (t) => {
  const { sales, buyer } = setup(t);
  sales.record({ soldAt: Date.UTC(2026, 10, 4, 1), buyerId: buyer.id, lines: line });
  sales.record({ soldAt: Date.UTC(2026, 10, 3, 1), buyerId: buyer.id, lines: [{ crop: 'pink', kg: 1, priceKg: 1 }] });
  assert.deepEqual(sales.range({ from: '2026-11-01', to: '2026-11-05' }).lines.map((l) => l.date), ['2026-11-03', '2026-11-04']);
  const to = '2026-11-05';
  assert.equal(sales.range({ from: addDays(to, -399), to }).to, to);
  refused(() => sales.range({ from: addDays(to, -400), to }), 400, 'from');
  refused(() => sales.range({ from: '2026-11-01', to: 'x' }), 400, 'to');
  refused(() => sales.range({ from: '2026-11-01', to: '2026-13-01' }), 400, 'to');
  refused(() => sales.range({ from: '2026-02-30', to }), 400, 'from');
  refused(() => sales.range({ from: '2026-01-01', to: '2026-02-30' }), 400, 'to');
});

test('summary: to excludes later sales and includes its own day, empty strings are no bound, a bad from is 400, byRun', (t) => {
  const { db, sales, roomId, buyer } = setup(t);
  db.setProgram(roomId, { ...db.getProgram(roomId), crops }, { change: 'start', at: NOW - 20 * DAY });
  const runId = db.openRun(roomId).id;
  sales.record({ soldAt: Date.UTC(2026, 10, 3, 1), buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 10, roomId }] });
  sales.record({ soldAt: Date.UTC(2026, 10, 4, 1), buyerId: buyer.id, lines: line });
  assert.equal(sales.summary({ to: '2026-11-03' }).kg, 2);
  assert.equal(sales.summary({ to: '2026-11-04' }).kg, 4);
  assert.equal(sales.summary({ from: '', to: '' }).kg, 4);
  refused(() => sales.summary({ from: 'nope' }), 400, 'from');
  refused(() => sales.summary({ to: '2026-02-30' }), 400, 'to');
  assert.deepEqual(sales.summary({}).byRun.map((r) => r.runId), [runId]);
});

test('listeners: every write tells them; one that throws is logged and the write returns', (t) => {
  const { sales, changes, buyer } = setup(t);
  const step = (fn) => { const n = changes.length; const r = fn(); assert.equal(changes.length, n + 1); return r; };
  const d = step(() => sales.record({ soldAt: NOW - DAY, buyerId: buyer.id, lines: line }));
  step(() => sales.edit(d.id, { soldAt: NOW - DAY, buyerId: buyer.id, lines: line }));
  step(() => sales.setPaid(d.id, { paidAt: NOW }));
  step(() => sales.remove(d.id));
  const b = step(() => sales.addBuyer({ name: 'Z' }));
  step(() => sales.editBuyer(b.id, { phone: '1' }));
  step(() => sales.removeBuyer(b.id));
  const db = openDb(':memory:');
  t.after(() => db.close());
  const logged = [];
  const s2 = createSales({ db, now: () => NOW, log: (e) => logged.push(e) });
  let after = 0;
  s2.onChange(() => { throw new Error('boom'); });
  const stop = s2.onChange(() => { after++; });
  assert.equal(s2.addBuyer({ name: 'A' }).name, 'A');
  assert.deepEqual([logged.length, after], [1, 1]);
  stop();
  s2.addBuyer({ name: 'B' });
  assert.equal(after, 1);
});

test('buyers: renaming to its own name in another case is allowed; an unknown id is 404; counts and owed per buyer', (t) => {
  const { sales, buyer } = setup(t);
  assert.equal(sales.editBuyer(buyer.id, { name: 'KEDAI AH SENG' }).name, 'KEDAI AH SENG');
  refused(() => sales.removeBuyer(999), 404, undefined);
  refused(() => sales.editBuyer(999, { phone: '1' }), 404, undefined);
  const other = sales.addBuyer({ name: 'Borong Lim' });
  sales.record({ soldAt: NOW - DAY, buyerId: buyer.id, lines: line });
  sales.record({ soldAt: NOW - DAY, buyerId: buyer.id, lines: line });
  const e = sales.editBuyer(buyer.id, { phone: '1' });
  assert.deepEqual([e.sales, e.owed], [2, 40]);
  assert.deepEqual(sales.buyers().map((b) => [b.name, b.sales, b.owed]), [['Borong Lim', 0, 0], ['KEDAI AH SENG', 2, 40]]);
  assert.equal(other.sales, 0);
});
