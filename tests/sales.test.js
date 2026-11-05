// The Sales store (server/sales.js, spec 2026-11-05-sales-design.md 2, 3, 4 and 5): record, edit, delete and paid with
// their limits, buyers, the page's view, the sheet's range, the summary and the CSV, and the change hook.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createSales } from '../server/sales.js';
import { SalesError } from '../server/sales-math.js';

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
