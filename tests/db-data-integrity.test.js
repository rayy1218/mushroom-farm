// Data integrity's database step (spec 2026-11-12-data-integrity-design.md 2): version 29 from a version 28 file: the change
// log (kept as written), the void columns of five tables, Not sold, the tariff with its first rate, the closed months.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, VOIDED_TABLES } from '../server/db.js';

mkdirSync('/tmp/data-integrity', { recursive: true });
const fileOf = () => join(mkdtempSync('/tmp/data-integrity/db-'), 'farm.db');
const T = Date.UTC(2026, 10, 10, 4); // 12:00 on the farm
const ROOM = { name: 'Container 4', length: 12, width: 2.3, height: 2.5, trhAddress: 1 };

// A version 28 file: made new with a row in each money table, then the step's tables and columns taken out again.
function version28({ price = null } = {}) {
  const file = fileOf();
  const db = openDb(file);
  const room = db.createRoom(ROOM, T).id;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'oyster', blocks: 500 }] }, { change: 'start', at: T });
  db.close();
  const raw = new DatabaseSync(file);
  const run = raw.prepare('SELECT id FROM runs').get().id;
  raw.exec(`DROP TRIGGER not_sold_room_gone; DROP TABLE changes; DROP TABLE not_sold; DROP TABLE tariffs; DROP TABLE month_closes; PRAGMA user_version = 28;`);
  for (const t of VOIDED_TABLES) raw.exec(`ALTER TABLE ${t} DROP COLUMN voided_at; ALTER TABLE ${t} DROP COLUMN voided_by; ALTER TABLE ${t} DROP COLUMN void_reason;`);
  raw.exec(`INSERT INTO harvests (room_id, run_id, crop, stage, flush, blocks, kg, picked_at, created_at) VALUES (${room}, ${run}, 'oyster', 'fruiting', 1, 500, 38.4, ${T}, ${T});
    INSERT INTO costs (date, category, amount, created_at) VALUES ('2026-11-10', 'packaging', 45, ${T});
    INSERT INTO sales (delivery_id, sold_at, crop, kg, price_kg, total, buyer, buyer_id, created_at) VALUES (1, ${T}, 'oyster', 4, 13.5, 54, 'Kedai Ah Seng', 1, ${T});
    INSERT INTO equipment (name, part, bought_on, amount, life_months, created_at) VALUES ('Rack', 'racks', '2026-01-03', 900, 60, ${T});
    INSERT INTO stock_items (name, kind, unit) VALUES ('Bleach', 'chemical', 'L');
    INSERT INTO stock_moves (item_id, at, qty, ref_kind, total) VALUES (1, ${T}, 5, 'purchase', 40);`);
  if (price !== null) raw.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('electricityPrice', ?)").run(price);
  raw.close();
  return { file, room };
}

test('a version 28 database is upgraded to 29: the change log, the void columns, Not sold, the tariff, the closed months', () => {
  const { file, room } = version28({ price: '0.515' });
  openDb(file).close();
  const raw = new DatabaseSync(file);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 30);
  const sql = (name) => raw.prepare('SELECT type, sql FROM sqlite_master WHERE name = ?').get(name);
  for (const t of ['changes', 'not_sold', 'tariffs', 'month_closes']) assert.match(sql(t).sql, /STRICT/, t);
  for (const t of VOIDED_TABLES) {
    const row = raw.prepare(`SELECT voided_at, voided_by, void_reason FROM ${t}`).get();
    assert.deepEqual({ ...row }, { voided_at: null, voided_by: null, void_reason: null }, `${t}: an old row is not voided`);
  }
  assert.deepEqual({ ...raw.prepare('SELECT from_date, rate, afa FROM tariffs').get() }, { from_date: '2020-01-01', rate: 0.515, afa: 0 },
    "the first rate is Settings' price of before");
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM month_closes').get().n, 0);
  assert.equal(raw.prepare('SELECT kg FROM harvests').get().kg, 38.4, 'rows kept');
  raw.close();
  const db = openDb(file);
  assert.equal(db.getRoom(room).name, 'Container 4');
  db.close();
});

test('the change log is kept as written: an update or a delete is refused; a bad kind or action too', () => {
  const db = openDb(':memory:');
  const id = db.logChange({ at: T, by: 'Lim', role: 'owner', kind: 'cost', rowId: 7, action: 'add', after: { amount: 45 } });
  assert.deepEqual(db.changesOf('cost', 7).map((c) => ({ id: c.id, by: c.by, after: c.after })), [{ id, by: 'Lim', after: { amount: 45 } }]);
  db.close();
  const file = fileOf();
  const made = openDb(file);
  made.logChange({ at: T, by: 'Lim', role: 'owner', kind: 'cost', rowId: 7, action: 'add' });
  made.close();
  const raw = new DatabaseSync(file);
  assert.throws(() => raw.exec("UPDATE changes SET by = 'Someone'"), /kept as written/);
  assert.throws(() => raw.exec('DELETE FROM changes'), /kept as written/);
  assert.throws(() => raw.exec(`INSERT INTO changes (at, by, role, kind, row_id, action) VALUES (${T}, 'Lim', 'owner', 'crate', 1, 'add')`), /CHECK/);
  assert.throws(() => raw.exec(`INSERT INTO changes (at, by, role, kind, row_id, action) VALUES (${T}, 'Lim', 'owner', 'cost', 1, 'shred')`), /CHECK/);
  assert.throws(() => raw.exec(`INSERT INTO not_sold (at, crop, kg, reason, created_at) VALUES (${T}, 'oyster', 3, 'lost', ${T})`), /CHECK/);
  raw.close();
});

test('a fresh database has the first rate at the default price, and two live rates may not share a day', () => {
  const db = openDb(':memory:');
  assert.deepEqual(db.listTariffs().map((t) => [t.from, t.rate, t.afa]), [['2020-01-01', 0.55, 0]]);
  db.insertTariff({ from: '2026-10-01', rate: 0.515, afa: 0.0275, note: '' }, T);
  assert.throws(() => db.insertTariff({ from: '2026-10-01', rate: 0.6, afa: 0, note: '' }, T), /UNIQUE/);
  db.close();
});

test("a deleted room's Not sold records keep their kg without it", () => {
  const db = openDb(':memory:');
  const room = db.createRoom(ROOM, T).id;
  const ns = db.insertNotSold({ at: T, crop: 'oyster', kg: 9, reason: 'spoiled', roomId: room, runId: 3, buyerId: null, note: null, worker: 'Aminah' }, T);
  db.deleteRoom(room);
  assert.deepEqual({ ...db.getNotSold(ns.id), createdAt: 0 }, { ...ns, roomId: null, runId: null, createdAt: 0 });
  db.close();
});

test('a write and its entry in one transaction: a write that throws leaves no entry; transactions nest', () => {
  const db = openDb(':memory:');
  assert.throws(() => db.transaction(() => {
    db.logChange({ at: T, by: 'Lim', role: 'owner', kind: 'cost', rowId: 1, action: 'add' });
    db.transaction(() => db.insertCost({ date: '2026-11-10', category: 'nope', amount: 45, roomId: null, runId: null, note: '' }, T));
  }), /CHECK/);
  assert.deepEqual(db.changesBetween(0, T + 1), []);
  assert.equal(db.listCosts().length, 0);
  const value = db.transaction(() => db.transaction(() => 42));
  assert.equal(value, 42);
  db.close();
});
