// tests/fakes/harvest-db.js: the fake harvest store against C10 sections 3, 5.2 and 5.4.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../air.js');
require('../controller.js');
const CC = globalThis.ClimateController;
const { openFakeDb } = require('./fakes/db.js');
const { openFakeHarvest } = require('./fakes/harvest-db.js');

const T0 = 1791450000;
const DAY = 86400;
let clock = T0;
const now = () => clock;

function fresh() {
  clock = T0;
  const db = openFakeDb({ now });
  const room = db.createRoom({ name: 'Room A', volume: 50, settings: CC.defaultSettings() });
  const room2 = db.createRoom({ name: 'Room B', volume: 50, settings: CC.defaultSettings() });
  const h = openFakeHarvest(db, { now });
  return { db, room, room2, h };
}

const GOOD = { crop: 'oyster', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: T0 };

function errcode(fn) {
  try { fn(); } catch (e) {
    assert.equal(e.code, 'ERR_SQLITE_ERROR');
    return e.errcode;
  }
  return assert.fail('did not throw');
}

test('openFakeHarvest: functions, independence, unknown options', () => {
  const { db, h } = fresh();
  assert.deepStrictEqual(Object.keys(h).sort(), [
    'addCrate', 'clearBatch', 'countCrates', 'createBatch', 'deleteBatch', 'getBatch', 'getCrate',
    'listBatches', 'listCrates', 'placeBatch', 'undoCrate', 'updateBatch',
  ]);
  h.createBatch(GOOD);
  assert.equal(openFakeHarvest(db).listBatches().length, 0);
  assert.throws(() => openFakeHarvest(db, { foo: 1 }), { name: 'TypeError', message: 'openFakeHarvest: unknown option "foo"' });
  assert.doesNotThrow(() => openFakeHarvest(db, null));
});

test('createBatch: the 15 columns in SQL order, defaults', () => {
  const { h } = fresh();
  clock = T0 + 5;
  const b = h.createBatch(GOOD);
  assert.deepStrictEqual(b, {
    id: 1, crop: 'oyster', strain: null, source: null, block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60,
    spawn_date: null, received_at: T0, room_id: null, placed_at: null, cleared_at: null, flush_gap_days: 5,
    notes: null, created_at: T0 + 5,
  });
  assert.deepStrictEqual(Object.keys(b), [
    'id', 'crop', 'strain', 'source', 'block_count', 'block_wet_kg', 'moisture_pct', 'spawn_date', 'received_at',
    'room_id', 'placed_at', 'cleared_at', 'flush_gap_days', 'notes', 'created_at',
  ]);
  const c = h.createBatch({ ...GOOD, strain: 'LM-01', source: 'own', spawn_date: T0 - DAY, flush_gap_days: 7, notes: 'n', at: 99, block_wet_kg: 2 });
  assert.equal(c.id, 2);
  assert.equal(c.created_at, 99);
  assert.equal(c.flush_gap_days, 7);
  assert.equal(c.strain, 'LM-01');
});

test('rows are copies', () => {
  const { h } = fresh();
  const b = h.createBatch(GOOD);
  b.crop = 'changed';
  assert.equal(h.getBatch(1).crop, 'oyster');
  h.getBatch(1).notes = 'x';
  assert.equal(h.getBatch(1).notes, null);
});

test('createBatch: unknown field is a TypeError and stores nothing', () => {
  const { h } = fresh();
  for (const k of ['room_id', 'placed_at', 'cleared_at', 'created_at', 'id', 'foo']) {
    assert.throws(() => h.createBatch({ ...GOOD, [k]: 1 }), { name: 'TypeError', message: `createBatch: unknown field "${k}"` });
  }
  assert.equal(h.listBatches().length, 0);
});

test('createBatch: NOT NULL gives 1299, CHECK 275, wrong type 3091, nothing stored', () => {
  const { h } = fresh();
  for (const k of ['crop', 'block_count', 'block_wet_kg', 'moisture_pct', 'received_at']) {
    const f = { ...GOOD }; delete f[k];
    assert.equal(errcode(() => h.createBatch(f)), 1299, k);
    assert.equal(errcode(() => h.createBatch({ ...GOOD, [k]: null })), 1299, k);
  }
  assert.equal(errcode(() => h.createBatch({ ...GOOD, flush_gap_days: null })), 1299);
  assert.equal(errcode(() => h.createBatch({ ...GOOD, block_count: NaN })), 1299);
  assert.equal(errcode(() => h.createBatch({ ...GOOD, at: null })), 1299);
  for (const [k, v] of [['block_count', 0], ['block_wet_kg', 0], ['moisture_pct', 100], ['moisture_pct', -1], ['flush_gap_days', 0]]) {
    assert.equal(errcode(() => h.createBatch({ ...GOOD, [k]: v })), 275, `${k} ${v}`);
  }
  for (const [k, v] of [['block_count', 1.5], ['received_at', 1.5], ['spawn_date', 0.5], ['flush_gap_days', 2.5], ['crop', 5], ['strain', 5], ['source', 5], ['notes', 5], ['block_wet_kg', 'abc'], ['moisture_pct', 'abc'], ['at', 1.5]]) {
    assert.equal(errcode(() => h.createBatch({ ...GOOD, [k]: v })), 3091, `${k} ${v}`);
  }
  assert.equal(h.listBatches().length, 0);
});

test('createBatch: an integer block_wet_kg and moisture_pct 0 are fine', () => {
  const { h } = fresh();
  const b = h.createBatch({ ...GOOD, block_wet_kg: 2, moisture_pct: 0 });
  assert.equal(b.block_wet_kg, 2);
  assert.equal(b.moisture_pct, 0);
});

test('getBatch: NotFoundError batch', () => {
  const { h } = fresh();
  for (const id of [1, 0, -1, 1.5, '1', null, undefined]) {
    assert.throws(() => h.getBatch(id), { name: 'NotFoundError', what: 'batch', message: `Unknown batch ${id}` });
  }
});

test('listBatches: received_at descending then id descending, by state and room', () => {
  const { h, room, room2 } = fresh();
  const a = h.createBatch({ ...GOOD, received_at: T0 });
  const b = h.createBatch({ ...GOOD, received_at: T0 + DAY });
  const c = h.createBatch({ ...GOOD, received_at: T0 });
  const d = h.createBatch({ ...GOOD, received_at: T0 - DAY });
  h.placeBatch(a.id, room.id, T0 + DAY);
  h.placeBatch(c.id, room2.id, T0 + DAY);
  h.placeBatch(d.id, room.id, T0);
  h.clearBatch(d.id, T0 + 10 * DAY);
  assert.deepStrictEqual(h.listBatches().map(x => x.id), [2, 3, 1, 4]);
  assert.deepStrictEqual(h.listBatches({}).map(x => x.id), [2, 3, 1, 4]);
  assert.deepStrictEqual(h.listBatches(null).map(x => x.id), [2, 3, 1, 4]);
  assert.deepStrictEqual(h.listBatches({ state: 'received' }).map(x => x.id), [b.id]);
  assert.deepStrictEqual(h.listBatches({ state: 'placed' }).map(x => x.id), [3, 1]);
  assert.deepStrictEqual(h.listBatches({ state: 'cleared' }).map(x => x.id), [4]);
  assert.deepStrictEqual(h.listBatches({ state: null }).length, 4);
  assert.deepStrictEqual(h.listBatches({ room_id: room.id }).map(x => x.id), [1, 4]);
  assert.deepStrictEqual(h.listBatches({ room_id: room.id, state: 'placed' }).map(x => x.id), [1]);
  assert.deepStrictEqual(h.listBatches({ room_id: null }).length, 4);
});

test('listBatches: TypeError, RangeError, NotFoundError room', () => {
  const { h } = fresh();
  assert.throws(() => h.listBatches({ foo: 1 }), { name: 'TypeError', message: 'listBatches: unknown field "foo"' });
  assert.throws(() => h.listBatches({ state: 'open' }), RangeError);
  assert.throws(() => h.listBatches({ room_id: 99 }), { name: 'NotFoundError', what: 'room' });
});

test('listBatches: an archived room still counts', () => {
  const { db, h, room } = fresh();
  db.archiveRoom(room.id);
  assert.deepStrictEqual(h.listBatches({ room_id: room.id }), []);
});

test('updateBatch: changes the given fields, {} changes nothing, returns the row after', () => {
  const { h } = fresh();
  const b = h.createBatch(GOOD);
  assert.deepStrictEqual(h.updateBatch(b.id, {}), b);
  const u = h.updateBatch(b.id, { notes: 'rack 2', flush_gap_days: 7, strain: 'LM-01' });
  assert.equal(u.notes, 'rack 2');
  assert.equal(u.flush_gap_days, 7);
  assert.deepStrictEqual(h.getBatch(b.id), u);
  assert.equal(h.updateBatch(b.id, { notes: null }).notes, null);
  assert.equal(h.updateBatch(b.id, { spawn_date: undefined }).spawn_date, null);
});

test('updateBatch: errors', () => {
  const { h, room } = fresh();
  const b = h.createBatch(GOOD);
  assert.throws(() => h.updateBatch(9, { notes: 'x' }), { name: 'NotFoundError', what: 'batch' });
  for (const k of ['room_id', 'placed_at', 'cleared_at', 'created_at', 'id', 'at', 'foo']) {
    assert.throws(() => h.updateBatch(b.id, { [k]: 1 }), { name: 'TypeError', message: `updateBatch: unknown field "${k}"` });
  }
  assert.equal(errcode(() => h.updateBatch(b.id, { crop: null })), 1299);
  assert.equal(errcode(() => h.updateBatch(b.id, { block_count: 0 })), 275);
  assert.equal(errcode(() => h.updateBatch(b.id, { block_count: 1.5 })), 3091);
  // nothing was stored by the failed calls, and received_at cannot pass placed_at
  assert.deepStrictEqual(h.getBatch(b.id), b);
  h.placeBatch(b.id, room.id, T0 + DAY);
  assert.equal(errcode(() => h.updateBatch(b.id, { received_at: T0 + 2 * DAY })), 275);
  assert.equal(h.getBatch(b.id).received_at, T0);
});

test('placeBatch: sets room and placed_at; room check; date order', () => {
  const { h, room } = fresh();
  const b = h.createBatch(GOOD);
  const p = h.placeBatch(b.id, room.id, T0 + DAY);
  assert.equal(p.room_id, room.id);
  assert.equal(p.placed_at, T0 + DAY);
  assert.deepStrictEqual(h.getBatch(b.id), p);
  assert.throws(() => h.placeBatch(99, room.id, T0), { name: 'NotFoundError', what: 'batch' });
  assert.throws(() => h.placeBatch(b.id, 99, T0), { name: 'NotFoundError', what: 'room' });
  const c = h.createBatch(GOOD);
  assert.equal(errcode(() => h.placeBatch(c.id, room.id, T0 - 1)), 275);
  assert.equal(errcode(() => h.placeBatch(c.id, room.id, null)), 275);
  assert.equal(errcode(() => h.placeBatch(c.id, room.id, T0 + 0.5)), 3091);
  assert.equal(h.getBatch(c.id).room_id, null);
});

test('clearBatch: date order and state', () => {
  const { h, room } = fresh();
  const b = h.createBatch(GOOD);
  assert.equal(errcode(() => h.clearBatch(b.id, T0 + DAY)), 275); // not placed
  h.placeBatch(b.id, room.id, T0 + DAY);
  assert.equal(errcode(() => h.clearBatch(b.id, T0)), 275);
  assert.equal(errcode(() => h.clearBatch(b.id, 1.5)), 3091);
  const c = h.clearBatch(b.id, T0 + 10 * DAY);
  assert.equal(c.cleared_at, T0 + 10 * DAY);
  assert.deepStrictEqual(h.getBatch(b.id), c);
  assert.throws(() => h.clearBatch(99, T0), { name: 'NotFoundError', what: 'batch' });
});

test('deleteBatch: returns the row read before; 787 with crates (undone ones too)', () => {
  const { h } = fresh();
  const b = h.createBatch(GOOD);
  const c = h.createBatch(GOOD);
  const crate = h.addCrate(c.id, { kg: 5 });
  assert.equal(errcode(() => h.deleteBatch(c.id)), 787);
  h.undoCrate(crate.id);
  assert.equal(errcode(() => h.deleteBatch(c.id)), 787);
  assert.deepStrictEqual(h.deleteBatch(b.id), b);
  assert.throws(() => h.getBatch(b.id), { name: 'NotFoundError' });
  assert.throws(() => h.deleteBatch(b.id), { name: 'NotFoundError', what: 'batch' });
  assert.equal(h.createBatch(GOOD).id, 3); // ids are not reused within a store
});

test('addCrate: the 6 columns, defaults, errors', () => {
  const { h } = fresh();
  const b = h.createBatch(GOOD);
  clock = T0 + 100;
  const c = h.addCrate(b.id, { kg: 12.5 });
  assert.deepStrictEqual(c, { id: 1, batch_id: b.id, t: T0 + 100, kg: 12.5, picker: null, deleted_at: null });
  assert.deepStrictEqual(Object.keys(c), ['id', 'batch_id', 't', 'kg', 'picker', 'deleted_at']);
  const d = h.addCrate(b.id, { kg: 50, picker: 'Aminah', t: T0 });
  assert.deepStrictEqual(d, { id: 2, batch_id: b.id, t: T0, kg: 50, picker: 'Aminah', deleted_at: null });
  assert.equal(h.addCrate(b.id, { kg: 3 }).kg, 3);
  assert.throws(() => h.addCrate(99, { kg: 1 }), { name: 'NotFoundError', what: 'batch' });
  for (const k of ['batch_id', 'deleted_at', 'id', 'foo']) {
    assert.throws(() => h.addCrate(b.id, { kg: 1, [k]: 1 }), { name: 'TypeError', message: `addCrate: unknown field "${k}"` });
  }
  assert.equal(errcode(() => h.addCrate(b.id, {})), 1299);
  assert.equal(errcode(() => h.addCrate(b.id, { kg: NaN })), 1299);
  assert.equal(errcode(() => h.addCrate(b.id, { kg: 1, t: null })), 1299);
  for (const kg of [0, 0.009, 50.01]) assert.equal(errcode(() => h.addCrate(b.id, { kg })), 275, String(kg));
  assert.equal(errcode(() => h.addCrate(b.id, { kg: 1, t: 1.5 })), 3091);
  assert.equal(errcode(() => h.addCrate(b.id, { kg: 'abc' })), 3091);
  assert.equal(errcode(() => h.addCrate(b.id, { kg: 1, picker: 5 })), 3091);
  assert.equal(h.countCrates(b.id), 3);
});

test('listCrates: t ascending then id, undone included, from is inclusive', () => {
  const { h } = fresh();
  const b = h.createBatch(GOOD);
  const o = h.createBatch(GOOD);
  const c1 = h.addCrate(b.id, { kg: 1, t: T0 + 20 });
  const c2 = h.addCrate(b.id, { kg: 2, t: T0 + 10 });
  const c3 = h.addCrate(b.id, { kg: 3, t: T0 + 10 });
  h.addCrate(o.id, { kg: 9, t: T0 });
  h.undoCrate(c2.id, T0 + 30);
  assert.deepStrictEqual(h.listCrates(b.id).map(c => c.id), [c2.id, c3.id, c1.id]);
  assert.equal(h.listCrates(b.id)[0].deleted_at, T0 + 30);
  assert.deepStrictEqual(h.listCrates(b.id, { from: T0 + 10 }).map(c => c.id), [c2.id, c3.id, c1.id]);
  assert.deepStrictEqual(h.listCrates(b.id, { from: T0 + 11 }).map(c => c.id), [c1.id]);
  assert.equal(h.listCrates(b.id, { from: null }).length, 3);
  assert.equal(h.listCrates(b.id, null).length, 3);
  assert.throws(() => h.listCrates(99), { name: 'NotFoundError', what: 'batch' });
  assert.throws(() => h.listCrates(b.id, { since: 1 }), { name: 'TypeError', message: 'listCrates: unknown field "since"' });
});

test('countCrates: every row, undone ones included', () => {
  const { h } = fresh();
  const b = h.createBatch(GOOD);
  assert.equal(h.countCrates(b.id), 0);
  const c = h.addCrate(b.id, { kg: 1 });
  h.undoCrate(c.id);
  assert.equal(h.countCrates(b.id), 1);
  assert.throws(() => h.countCrates(99), { name: 'NotFoundError', what: 'batch' });
});

test('getCrate and undoCrate: undoing twice keeps the first time', () => {
  const { h } = fresh();
  const b = h.createBatch(GOOD);
  const c = h.addCrate(b.id, { kg: 4, t: T0 });
  assert.deepStrictEqual(h.getCrate(c.id), c);
  clock = T0 + 50;
  const u = h.undoCrate(c.id);
  assert.deepStrictEqual(u, { ...c, deleted_at: T0 + 50 });
  clock = T0 + 90;
  assert.deepStrictEqual(h.undoCrate(c.id), u);
  assert.deepStrictEqual(h.undoCrate(c.id, T0 + 99), u);
  assert.deepStrictEqual(h.getCrate(c.id), u);
  for (const id of [99, 0, 1.5, null]) {
    assert.throws(() => h.getCrate(id), { name: 'NotFoundError', what: 'crate', message: `Unknown crate ${id}` });
    assert.throws(() => h.undoCrate(id), { name: 'NotFoundError', what: 'crate' });
  }
  const d = h.addCrate(b.id, { kg: 1 });
  assert.equal(h.undoCrate(d.id, 777).deleted_at, 777);
  const e = h.addCrate(b.id, { kg: 1 });
  assert.equal(errcode(() => h.undoCrate(e.id, 1.5)), 3091);
});

// ---------- Lead decision 70: details both stores share ----------

test('decision 70: placeBatch checks the batch before the room', () => {
  const { h } = fresh();
  assert.throws(() => h.placeBatch(99, 99, T0), { name: 'NotFoundError', what: 'batch', id: 99 });
});

test('decision 70: an explicit undefined in updateBatch sets the column to NULL', () => {
  const { h } = fresh();
  const b = h.createBatch({ ...GOOD, strain: 'LM-01', notes: 'n' });
  const u = h.updateBatch(b.id, { strain: undefined, notes: undefined });
  assert.equal(u.strain, null);
  assert.equal(u.notes, null);
  assert.equal(h.updateBatch(b.id, { crop: 'oyster' }).strain, null);
  assert.equal(errcode(() => h.updateBatch(b.id, { crop: undefined })), 1299);
});

test('decision 70: clearBatch(id, null) un-clears a cleared batch', () => {
  const { h, room } = fresh();
  const b = h.createBatch(GOOD);
  h.placeBatch(b.id, room.id, T0 + DAY);
  h.clearBatch(b.id, T0 + 2 * DAY);
  const u = h.clearBatch(b.id, null);
  assert.equal(u.cleared_at, null);
  assert.equal(h.listBatches({ state: 'placed' }).length, 1);
  assert.equal(h.getBatch(b.id).cleared_at, null);
});

test('decision 70: undoCrate(id, null) changes nothing', () => {
  const { h } = fresh();
  const b = h.createBatch(GOOD);
  const c = h.addCrate(b.id, { kg: 2, t: T0 });
  assert.deepStrictEqual(h.undoCrate(c.id, null), c);
  assert.equal(h.getCrate(c.id).deleted_at, null);
  // and it did not use up the undo: a later undo still records its time
  assert.equal(h.undoCrate(c.id, T0 + 9).deleted_at, T0 + 9);
});

test('decision 70: listCrates does not validate from', () => {
  const { h } = fresh();
  const b = h.createBatch(GOOD);
  h.addCrate(b.id, { kg: 1, t: T0 });
  h.addCrate(b.id, { kg: 1, t: T0 + 10 });
  assert.equal(h.listCrates(b.id, { from: 5.5 + T0 }).length, 1);
  assert.equal(h.listCrates(b.id, { from: -1 }).length, 2);
  assert.equal(h.listCrates(b.id, { from: Infinity }).length, 2); // non-finite is NULL, as bound by the real store
  assert.doesNotThrow(() => h.listCrates(b.id, { from: 'abc' }));
});

test('decision 70: listBatches({ room_id }) filters in every state', () => {
  const { h, room, room2 } = fresh();
  const a = h.createBatch(GOOD);
  const b = h.createBatch(GOOD);
  h.placeBatch(a.id, room.id, T0);
  h.placeBatch(b.id, room.id, T0);
  h.clearBatch(b.id, T0 + DAY);
  h.createBatch(GOOD); // received, no room
  assert.deepStrictEqual(h.listBatches({ room_id: room.id }).map(x => x.id), [2, 1]);
  assert.deepStrictEqual(h.listBatches({ room_id: room.id, state: 'cleared' }).map(x => x.id), [2]);
  assert.deepStrictEqual(h.listBatches({ room_id: room.id, state: 'received' }), []);
  assert.deepStrictEqual(h.listBatches({ room_id: room2.id }), []);
});
