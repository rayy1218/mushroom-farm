// Sales' pure rules and figures (spec 2026-11-05-sales-design.md 2, 4 and 5): the body checks and their fields, deliveries
// grouped from lines, owed, per crop and per buyer, the summary for Costs and the CSV rows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SalesError, deliveryBody, buyerBody, paidBody, deliveriesOf, owedOf, byCropOf, byBuyerOf, summaryOf, csvRows, CSV_HEADER,
} from '../server/sales-math.js';

const NOW = Date.UTC(2026, 10, 5, 2); // 5 Nov 2026 10:00 at the farm
const ok = (lines, extra = {}) => ({ soldAt: NOW - 3_600_000, buyerId: 3, lines, ...extra });
const refused = (fn, field) => assert.throws(fn, (e) => e instanceof SalesError && e.status === 400 && e.field === field, field);

test('a delivery body: trimmed text, kg and price to 2 places, the total worked out, no room = mixed', () => {
  const d = deliveryBody(ok([{ crop: 'oyster', kg: 12.004, priceKg: 10.499 }, { crop: 'pink', kg: 4.5, priceKg: 0, roomId: 2 }],
    { invoiceNo: '  INV-9 ', note: '' }), { now: NOW });
  assert.deepEqual(d, {
    soldAt: NOW - 3_600_000, buyerId: 3, invoiceNo: 'INV-9', note: null,
    lines: [{ crop: 'oyster', kg: 12, priceKg: 10.5, total: 126, roomId: null }, { crop: 'pink', kg: 4.5, priceKg: 0, total: 0, roomId: 2 }],
  });
});

test('a delivery body refused, with the field of the box', () => {
  refused(() => deliveryBody(null, { now: NOW }), undefined);
  refused(() => deliveryBody(ok([{ crop: 'oyster', kg: 1, priceKg: 1 }], { soldAt: 'x' }), { now: NOW }), 'soldAt');
  refused(() => deliveryBody(ok([{ crop: 'oyster', kg: 1, priceKg: 1 }], { soldAt: NOW + 120_000 }), { now: NOW }), 'soldAt');
  refused(() => deliveryBody(ok([{ crop: 'oyster', kg: 1, priceKg: 1 }], { soldAt: Date.UTC(2019, 11, 31) }), { now: NOW }), 'soldAt');
  refused(() => deliveryBody(ok([{ crop: 'oyster', kg: 1, priceKg: 1 }], { buyerId: 0 }), { now: NOW }), 'buyerId');
  refused(() => deliveryBody(ok([{ crop: 'oyster', kg: 1, priceKg: 1 }], { invoiceNo: 'x'.repeat(41) }), { now: NOW }), 'invoiceNo');
  refused(() => deliveryBody(ok([{ crop: 'oyster', kg: 1, priceKg: 1 }], { note: 'x'.repeat(201) }), { now: NOW }), 'note');
  refused(() => deliveryBody(ok([]), { now: NOW }), 'lines');
  refused(() => deliveryBody(ok(Array.from({ length: 10 }, () => ({ crop: 'oyster', kg: 1, priceKg: 1 }))), { now: NOW }), 'lines');
  refused(() => deliveryBody(ok([{ crop: 'tomato', kg: 1, priceKg: 1 }]), { now: NOW }), 'lines.0.crop');
  refused(() => deliveryBody(ok([{ crop: 'oyster', kg: 1, priceKg: 1 }, { crop: 'oyster', kg: 2, priceKg: 1 }]), { now: NOW }), 'lines.1.crop');
  refused(() => deliveryBody(ok([{ crop: 'oyster', kg: 0.004, priceKg: 1 }]), { now: NOW }), 'lines.0.kg');
  refused(() => deliveryBody(ok([{ crop: 'oyster', kg: 10_001, priceKg: 1 }]), { now: NOW }), 'lines.0.kg');
  refused(() => deliveryBody(ok([{ crop: 'oyster', kg: 1, priceKg: -1 }]), { now: NOW }), 'lines.0.priceKg');
  refused(() => deliveryBody(ok([{ crop: 'oyster', kg: 1, priceKg: 1000.01 }]), { now: NOW }), 'lines.0.priceKg');
  refused(() => deliveryBody(ok([{ crop: 'oyster', kg: 1, priceKg: 1, roomId: 'a' }]), { now: NOW }), 'lines.0.roomId');
});

test('a buyer body: the name trimmed and required, empty phone and note null, prices per crop; a partial body for an edit', () => {
  assert.deepEqual(buyerBody({ name: ' Kedai Ah Seng ', phone: '', prices: { oyster: 12.004, pink: '' } }),
    { name: 'Kedai Ah Seng', phone: null, note: null, prices: { oyster: 12 } });
  assert.deepEqual(buyerBody({ archived: true }, { partial: true }), { archived: true });
  assert.deepEqual(buyerBody({ phone: '012' }, { partial: true }), { phone: '012' });
  refused(() => buyerBody({ name: '  ' }), 'name');
  refused(() => buyerBody({ name: 'x'.repeat(61) }), 'name');
  refused(() => buyerBody({ name: 'A', phone: 'x'.repeat(31) }), 'phone');
  refused(() => buyerBody({ name: 'A', prices: { tomato: 1 } }), 'prices');
  refused(() => buyerBody({ name: 'A', prices: { oyster: 1001 } }), 'prices.oyster');
  refused(() => buyerBody({ archived: 'yes' }, { partial: true }), 'archived');
});

test('paid: null clears it; not before the sale\'s farm day, not in the future', () => {
  const soldAt = Date.UTC(2026, 10, 3, 2);
  assert.equal(paidBody({ paidAt: null }, { soldAt, now: NOW }), null);
  assert.equal(paidBody({ paidAt: Date.UTC(2026, 10, 2, 17) }, { soldAt, now: NOW }), Date.UTC(2026, 10, 2, 17), 'the same farm day (3 Nov 01:00)');
  refused(() => paidBody({ paidAt: Date.UTC(2026, 10, 2, 15) }, { soldAt, now: NOW }), 'paidAt');
  refused(() => paidBody({ paidAt: NOW + 120_000 }, { soldAt, now: NOW }), 'paidAt');
  refused(() => paidBody({}, { soldAt, now: NOW }), 'paidAt');
});

const row = (id, deliveryId, crop, kg, priceKg, extra = {}) => ({
  id, deliveryId, soldAt: 1000 * deliveryId, crop, kg, priceKg, total: Math.round(kg * priceKg * 100) / 100, buyer: `B${deliveryId % 2}`,
  buyerId: deliveryId % 2, invoiceNo: null, roomId: null, runId: null, note: null, paidAt: null, createdAt: 0, ...extra,
});

test('deliveries from lines: newest first, lines in the crop list\'s order, sums, room and run named', () => {
  const rows = [row(1, 1, 'pink', 4.5, 14), row(2, 1, 'oyster', 12, 10.5, { roomId: 7, runId: 3 }), row(3, 2, 'black', 1.25, 9)];
  const list = deliveriesOf(rows, { rooms: new Map([[7, { name: 'Container 1' }]]), runs: new Map([[3, { startedAt: 500 }]]), buyers: new Map([[0, { archived: true }]]) });
  assert.deepEqual(list.map((d) => [d.id, d.kg, d.total, d.buyerArchived]), [[2, 1.25, 11.25, true], [1, 16.5, 189, false]]);
  assert.deepEqual(list[1].lines.map((l) => [l.crop, l.roomName, l.runStartedAt]), [['oyster', 'Container 1', 500], ['pink', null, null]]);
  assert.deepEqual(Object.keys(list[1]), ['id', 'soldAt', 'buyerId', 'buyer', 'buyerArchived', 'invoiceNo', 'note', 'paidAt', 'kg', 'total', 'lines']);
  assert.deepEqual(Object.keys(list[1].lines[0]), ['id', 'crop', 'kg', 'priceKg', 'total', 'roomId', 'roomName', 'runId', 'runStartedAt']);
});

test('owed: every unpaid delivery by buyer, most owed first, the oldest sale', () => {
  const list = deliveriesOf([row(1, 1, 'oyster', 10, 10), row(2, 2, 'oyster', 1, 10), row(3, 3, 'oyster', 2, 10)]);
  const owed = owedOf(list);
  assert.deepEqual([owed.total, owed.count, owed.oldestAt], [130, 3, 1000]);
  assert.deepEqual(owed.buyers.map((b) => [b.buyerId, b.total, b.count, b.oldestAt, b.deliveries.map((d) => d.id)]), [[1, 120, 2, 1000, [1, 3]], [0, 10, 1, 2000, [2]]]);
  assert.deepEqual(owedOf([]), { total: 0, count: 0, oldestAt: null, buyers: [] });
});

test('by crop: sold and harvested kg, income, average and expected price; a crop only harvested has a row', () => {
  const rows = [row(1, 1, 'oyster', 10, 10), row(2, 2, 'oyster', 5, 13)];
  const harvests = [{ crop: 'oyster', kg: 20 }, { crop: 'pink', kg: 3.25 }];
  assert.deepEqual(byCropOf(rows, harvests, { oyster: { dryKg: 1, priceKg: 12 }, pink: { dryKg: null, priceKg: null } }), [
    { crop: 'oyster', kg: 15, harvestedKg: 20, total: 165, avgPriceKg: 11, expectedPriceKg: 12 },
    { crop: 'pink', kg: 0, harvestedKg: 3.25, total: 0, avgPriceKg: null, expectedPriceKg: null },
  ]);
});

test('by buyer: the period\'s kg and income, owed all time; most income first', () => {
  const list = deliveriesOf([row(1, 1, 'oyster', 10, 10, { paidAt: 5 }), row(2, 2, 'oyster', 1, 10)]);
  const owed = owedOf(deliveriesOf([row(2, 2, 'oyster', 1, 10), row(9, 9, 'black', 3, 10)]));
  assert.deepEqual(byBuyerOf(list, owed), [{ buyerId: 1, buyer: 'B1', kg: 10, total: 100, owed: 30 }, { buyerId: 0, buyer: 'B0', kg: 1, total: 10, owed: 10 }]);
});

test('the summary for Costs: exactly { kg, total, byCrop, byRun }, runs without a run left out of byRun', () => {
  const rows = [row(1, 1, 'pink', 2, 10, { runId: 4 }), row(2, 1, 'oyster', 1.5, 10, { runId: 4 }), row(3, 2, 'oyster', 1, 10)];
  assert.deepEqual(summaryOf(rows), {
    kg: 4.5, total: 45,
    byCrop: [{ crop: 'oyster', kg: 2.5, total: 25 }, { crop: 'pink', kg: 2, total: 20 }],
    byRun: [{ runId: 4, kg: 3.5, total: 35 }],
  });
});

test('the CSV: a line a row, oldest first, the formula guard', () => {
  const list = deliveriesOf([row(1, 1, 'oyster', 2, 10, { soldAt: Date.UTC(2026, 10, 4, 1), buyer: '=HACK', invoiceNo: 'R1', paidAt: Date.UTC(2026, 10, 5, 1), note: 'van' })]);
  assert.equal(CSV_HEADER, 'date,time,buyer,reference,crop,room,run started,kg,price per kg,total,paid on,note');
  assert.deepEqual(csvRows(list), [CSV_HEADER, "2026-11-04,09:00,'=HACK,R1,Grey oyster,Mixed,,2,10,20,2026-11-05,van"]);
});

test('review: server-side total, the minute of grace, inclusive bounds, trimmed length, negative zero', () => {
  const one = (l, extra) => deliveryBody(ok([{ crop: 'oyster', kg: 12.004, priceKg: 10.499, ...l }], extra), { now: NOW });
  assert.equal(one({ total: 999 }).lines[0].total, 126);
  assert.equal(one({}, { soldAt: NOW + 60_000 }).soldAt, NOW + 60_000);
  assert.deepEqual(one({ kg: 10_000, priceKg: 1000 }).lines[0], { crop: 'oyster', kg: 10_000, priceKg: 1000, total: 10_000_000, roomId: null });
  assert.equal(one({}, { invoiceNo: ' ' + 'x'.repeat(40) }).invoiceNo, 'x'.repeat(40));
  refused(() => one({ priceKg: -0.001 }), 'lines.0.priceKg');
  refused(() => buyerBody({ name: 'A', prices: { oyster: -0.001 } }), 'prices.oyster');
  refused(() => one({}, { invoiceNo: 5 }), 'invoiceNo');
  assert.throws(() => one({}, { note: 5 }), /A note must be text/);
  assert.throws(() => one({}, { invoiceNo: 5 }), /The reference must be text/);
  assert.throws(() => buyerBody({ name: 'A', phone: 5 }), /A phone number must be text/);
  assert.throws(() => one({}, { soldAt: Date.UTC(2019, 11, 31) }), /The date can't be before 2020/);
  assert.throws(() => one({}, { soldAt: 1.5 }), /Give the date/);
  assert.throws(() => paidBody({ paidAt: Date.UTC(2019, 11, 31) }, { soldAt: NOW - 1000, now: NOW }), /The date can't be before 2020/);
  assert.throws(() => paidBody({ paidAt: NOW }, { soldAt: undefined, now: NOW }), (e) => e instanceof SalesError && e.status === 400 && e.message === 'Sale not found');
});

test('review: ties by id, owed ignores paid, a crop sold at RM 0, byRun sorted, CSV order and empty cells', () => {
  const tie = deliveriesOf([row(1, 1, 'oyster', 1, 1, { soldAt: 5, buyerId: 1 }), row(2, 2, 'oyster', 1, 1, { soldAt: 5, buyerId: 1 })]);
  assert.deepEqual(tie.map((d) => d.id), [2, 1]);
  assert.deepEqual(owedOf(tie).buyers[0].deliveries.map((d) => d.id), [1, 2]);
  const mixed = deliveriesOf([row(1, 1, 'oyster', 1, 10, { paidAt: 9 }), row(2, 2, 'oyster', 1, 10)]);
  assert.deepEqual([owedOf(mixed).total, owedOf(mixed).count], [10, 1]);
  assert.equal(byCropOf([row(1, 1, 'oyster', 2, 0)], [], {})[0].avgPriceKg, 0);
  assert.deepEqual(summaryOf([row(1, 1, 'oyster', 1, 1, { runId: 9 }), row(2, 2, 'oyster', 1, 1, { runId: 4 })]).byRun.map((r) => r.runId), [4, 9]);
  const d = (id, day, buyer) => deliveriesOf([row(id, id, 'oyster', 1, 1, { soldAt: Date.UTC(2026, 10, day, 1), buyer })])[0];
  const lines = csvRows([d(2, 5, 'Ah, Seng'), d(1, 4, 'Bob')]);
  assert.equal(lines[1], '2026-11-04,09:00,Bob,,Grey oyster,Mixed,,1,1,1,,');
  assert.equal(lines[2], '2026-11-05,09:00,"Ah, Seng",,Grey oyster,Mixed,,1,1,1,,');
});
