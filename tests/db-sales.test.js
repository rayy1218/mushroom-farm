// Sales in the database (spec 2026-11-05-sales-design.md 2): the upgrade to 23, a delivery's lines written together, the
// run open at a time, paid, buyers (rename rewrites the sales' name), a room deleted keeps its sales' money.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return { db, roomId: db.createRoom(ROOM, 1000).id };
}

const line = (crop, kg, priceKg, roomId = null, runId = null) => ({ crop, kg, priceKg, total: Math.round(kg * priceKg * 100) / 100, roomId, runId });

test('a version 20 file is upgraded to 23: buyers and sales made, nothing else changed', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'v20.db');
  const first = openDb(path);
  first.createRoom(ROOM, 1000);
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec('DROP TABLE sales; DROP TABLE buyers; PRAGMA user_version = 20;');
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.equal(db.listRooms().length, 1);
  assert.deepEqual(db.listBuyers(), []);
  assert.deepEqual(db.salesBetween(-8.64e15, 8.64e15), []);
  const check = new DatabaseSync(path);
  t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 23);
  const indexes = check.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'sales' ORDER BY name").all().map((r) => r.name);
  assert.deepEqual(indexes, ['sales_by_buyer', 'sales_by_delivery', 'sales_by_run', 'sales_by_time', 'sales_unpaid']);
});

test('buyers: added, listed A–Z without regard to case, a rename rewrites the name on their sales', (t) => {
  const { db } = fresh(t);
  const b = db.insertBuyer({ name: 'kedai Ah Seng', phone: '012-345 6789', note: null, prices: { oyster: 12 } }, 5000);
  db.insertBuyer({ name: 'Borong Lim', phone: null, note: null, prices: {} }, 5000);
  assert.deepEqual(db.listBuyers().map((x) => x.name), ['Borong Lim', 'kedai Ah Seng']);
  assert.deepEqual(db.getBuyer(b.id), { id: b.id, name: 'kedai Ah Seng', phone: '012-345 6789', note: null, prices: { oyster: 12 }, archived: false, createdAt: 5000 });
  db.saveDelivery({ soldAt: 6000, buyerId: b.id, buyer: b.name, invoiceNo: null, note: null, lines: [line('oyster', 2, 12)] }, 6000);
  db.updateBuyer(b.id, { name: 'Kedai Ah Seng', archived: true });
  assert.equal(db.getBuyer(b.id).archived, true);
  assert.deepEqual(db.salesBetween(0, 10_000).map((s) => s.buyer), ['Kedai Ah Seng']);
  assert.equal(db.buyerSaleCount(b.id), 1);
  assert.throws(() => db.insertBuyer({ name: 'KEDAI AH SENG', phone: null, note: null, prices: {} }, 7000), /UNIQUE/);
});

test('a delivery: its lines share delivery_id, time, buyer, reference, note and paid; an edit keeps id and paid', (t) => {
  const { db, roomId } = fresh(t);
  const b = db.insertBuyer({ name: 'Borong Lim', phone: null, note: null, prices: {} }, 1000);
  const id = db.saveDelivery({ soldAt: 5000, buyerId: b.id, buyer: b.name, invoiceNo: 'INV-9', note: 'van',
    lines: [line('oyster', 12, 10.5, roomId, null), line('pink', 4.5, 14)] }, 5000);
  const rows = db.deliveryLines(id);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, id, 'the delivery is named by its first line');
  for (const r of rows) {
    assert.deepEqual([r.deliveryId, r.soldAt, r.buyerId, r.buyer, r.invoiceNo, r.note, r.paidAt, r.createdAt], [id, 5000, b.id, 'Borong Lim', 'INV-9', 'van', null, 5000]);
  }
  assert.deepEqual(rows.map((r) => [r.crop, r.kg, r.priceKg, r.total, r.roomId]), [['oyster', 12, 10.5, 126, roomId], ['pink', 4.5, 14, 63, null]]);

  assert.equal(db.setDeliveryPaid(id, 9000), true);
  assert.equal(db.saveDelivery({ id, soldAt: 5500, buyerId: b.id, buyer: b.name, invoiceNo: null, note: null, lines: [line('black', 3, 9)] }, 7000), id);
  const after = db.deliveryLines(id);
  assert.deepEqual(after.map((r) => [r.deliveryId, r.crop, r.soldAt, r.paidAt]), [[id, 'black', 5500, 9000]]);
  assert.equal(db.saveDelivery({ id: 999, soldAt: 1, buyerId: b.id, buyer: b.name, invoiceNo: null, note: null, lines: [line('black', 1, 1)] }, 1), null);

  assert.deepEqual(db.unpaidSales(), []);
  assert.equal(db.setDeliveryPaid(id, null), true);
  assert.equal(db.unpaidSales().length, 1);
  assert.equal(db.setDeliveryPaid(999, null), false);
  assert.equal(db.deleteDelivery(id), true);
  assert.deepEqual(db.deliveryLines(id), []);
  assert.equal(db.deleteDelivery(id), false);
});

test('runAt: the room\'s run open at a time, null before any or for another room', (t) => {
  const { db, roomId } = fresh(t);
  const crops = [{ crop: 'oyster', blocks: 100 }];
  db.setProgram(roomId, { ...db.getProgram(roomId), crops }, { change: 'start', at: 10_000 });
  const first = db.openRun(roomId);
  assert.equal(db.runAt(roomId, 9_999), null);
  assert.equal(db.runAt(roomId, 10_000), first.id);
  assert.equal(db.runAt(roomId, 50_000), first.id);
  assert.equal(db.runAt(roomId + 1, 50_000), null);
});

test('a room deleted: its sales stay with their money, the room and run cleared', (t) => {
  const { db, roomId } = fresh(t);
  const b = db.insertBuyer({ name: 'Borong Lim', phone: null, note: null, prices: {} }, 1000);
  const id = db.saveDelivery({ soldAt: 5000, buyerId: b.id, buyer: b.name, invoiceNo: null, note: null, lines: [line('oyster', 2, 10, roomId, 77)] }, 5000);
  assert.equal(db.deleteRoom(roomId), true);
  const [r] = db.deliveryLines(id);
  assert.deepEqual([r.roomId, r.runId, r.kg, r.total], [null, null, 2, 20]);
});

test('a buyer with no sales can be deleted', (t) => {
  const { db } = fresh(t);
  const b = db.insertBuyer({ name: 'Borong Lim', phone: null, note: null, prices: {} }, 1000);
  assert.equal(db.deleteBuyer(b.id), true);
  assert.equal(db.getBuyer(b.id), null);
  assert.equal(db.deleteBuyer(b.id), false);
});
