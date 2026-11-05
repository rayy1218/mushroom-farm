// Batches (spec 2026-11-05-batches-design.md 3, 3.1, 3.2 and 6): receive, list, edit, delete, put into a room and take out,
// contamination checks, the stock moves, the BE hook.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createBatches } from '../server/batches.js';
import { openWithStock } from './batches-fixture.js';

const ROOM = { name: 'Container 1', length: 6, width: 4, height: 2.5 };
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5, 4); // 5 Nov 2026 12:00 farm time
const GOOD = { crop: 'oyster', supplier: 'Agro Supplies', receivedAt: NOW - 2 * DAY, blocks: 1200, pricePerBlock: 2.3, spawnBatch: '0912' };

function setup(t, { stock = false } = {}) {
  const db = stock ? openWithStock(t) : openDb(':memory:');
  if (!stock) t.after(() => db.close());
  let clock = NOW;
  const batches = createBatches({ db, now: () => clock });
  const told = [];
  batches.onChange((c) => told.push(c));
  let n = 0;
  function room(crops = [{ crop: 'oyster', blocks: 950 }]) {
    n += 1;
    const id = db.createRoom({ ...ROOM, name: `Container ${n}` }, 1000).id;
    db.setProgram(id, { ...db.getProgram(id), crops }, { change: 'start', at: NOW - 5 * DAY });
    return id;
  }
  return { db, batches, told, room, tick: (ms) => { clock += ms; }, now: () => clock };
}

const status = (fn) => {
  try { fn(); } catch (err) { return [err.status, err.field ?? null, err.message]; }
  return null;
};

test('receive: a waiting bought batch with its fields; the defaults', (t) => {
  const { batches, told } = setup(t);
  const b = batches.receive({ ...GOOD, strain: ' PL-27 ', deliveryRef: 'DN-551', note: 'two pallets', inoculatedAt: NOW - 20 * DAY, blockKg: 2.3, waterPct: 60 });
  assert.equal(b.kind, 'bought');
  assert.equal(b.status, 'waiting');
  assert.equal(b.strain, 'PL-27', 'trimmed');
  assert.equal(b.good, 1200);
  assert.equal(b.dryKg, 0.92);
  assert.equal(b.runBlocks, null);
  assert.deepEqual(told.at(-1), { batchId: b.id, roomId: null, runId: null, harvestRooms: [] });
  const plain = batches.receive({ crop: 'pink', supplier: 'Farm Co', blocks: 10 });
  assert.equal(plain.receivedAt, NOW, 'received now when not given');
  assert.equal(plain.pricePerBlock, null);
  assert.equal(plain.spawnBatch, null);
});

test('receive: each bad field is a 400 naming it', (t) => {
  const { batches } = setup(t);
  const cases = [
    [{ crop: 'tomato' }, 'crop'],
    [{ supplier: '  ' }, 'supplier'],
    [{ supplier: 'x'.repeat(81) }, 'supplier'],
    [{ receivedAt: NOW + DAY }, 'receivedAt'],
    [{ blocks: 0 }, 'blocks'],
    [{ blocks: 1.5 }, 'blocks'],
    [{ blocks: 100_001 }, 'blocks'],
    [{ pricePerBlock: -1 }, 'pricePerBlock'],
    [{ pricePerBlock: 1001 }, 'pricePerBlock'],
    [{ spawnBatch: 'a\u0007b' }, 'spawnBatch'],
    [{ note: 'n'.repeat(501) }, 'note'],
    [{ inoculatedAt: GOOD.receivedAt + DAY }, 'inoculatedAt'],
    [{ blockKg: 2.3 }, 'waterPct'],
    [{ waterPct: 60 }, 'blockKg'],
    [{ blockKg: 11, waterPct: 60 }, 'blockKg'],
    [{ blockKg: 2, waterPct: 90 }, 'waterPct'],
  ];
  for (const [change, field] of cases) {
    const got = status(() => batches.receive({ ...GOOD, ...change }));
    assert.deepEqual(got?.slice(0, 2), [400, field], JSON.stringify(change));
  }
  assert.equal(status(() => batches.receive(null))[0], 400);
});

test('list: newest received first; by run, dates and status; blockCost; bad queries', (t) => {
  const { batches } = setup(t);
  const a = batches.receive({ ...GOOD, receivedAt: NOW - 10 * DAY });
  const b = batches.receive({ ...GOOD, receivedAt: NOW - DAY, pricePerBlock: null });
  assert.deepEqual(batches.list().batches.map((x) => x.id), [b.id, a.id]);
  assert.equal(batches.list().blockCost, null, 'one price unknown');
  const sinceFive = batches.list({ from: '2026-10-31' });
  assert.deepEqual(sinceFive.batches.map((x) => x.id), [b.id]);
  assert.deepEqual(batches.list({ to: '2026-10-26' }).batches.map((x) => x.id), [a.id], 'to is inclusive (received 26 Oct)');
  assert.equal(batches.list({ from: '2026-10-26', to: '2026-10-26' }).blockCost, 2760);
  assert.deepEqual(batches.list({ status: 'placed' }).batches, []);
  for (const [q, field] of [[{ run: 'x' }, 'run'], [{ from: '2026-13-01' }, 'from'], [{ to: '5 Nov' }, 'to'], [{ status: 'gone' }, 'status']]) {
    assert.deepEqual(status(() => batches.list(q)).slice(0, 2), [400, field]);
  }
});

test('detail: the row, its delivery and checks; 404', (t) => {
  const { batches } = setup(t);
  const a = batches.receive(GOOD);
  const d = batches.detail(a.id);
  assert.equal(d.id, a.id);
  assert.deepEqual(d.delivery.map((x) => x.id), [a.id]);
  assert.deepEqual(d.checks, []);
  assert.equal(d.batchBlocks, null);
  assert.equal(status(() => batches.detail(999))[0], 404);
});

test('edit: fields change; blocks only on a waiting first row; cross checks against the stored row', (t) => {
  const { batches } = setup(t);
  const a = batches.receive({ ...GOOD, blockKg: 2.3, waterPct: 60 });
  const e = batches.edit(a.id, { supplier: 'Agro Supplies Sdn Bhd', blocks: 1100, note: '' });
  assert.equal(e.supplier, 'Agro Supplies Sdn Bhd');
  assert.equal(e.blocks, 1100);
  assert.equal(e.note, null);
  assert.equal(e.blockKg, 2.3, 'not given: kept');
  assert.equal(batches.edit(a.id, { blockKg: null, waterPct: null }).dryKg, null);
  assert.deepEqual(status(() => batches.edit(a.id, { blockKg: 2 })).slice(0, 2), [400, 'waterPct'], 'water % is still empty');
  assert.deepEqual(status(() => batches.edit(a.id, { inoculatedAt: NOW })).slice(0, 2), [400, 'inoculatedAt'], 'after the stored received day');
  assert.equal(status(() => batches.edit(999, {}))[0], 404);
});

test('delete: a batch goes; 404 after', (t) => {
  const { batches, told } = setup(t);
  const a = batches.receive(GOOD);
  batches.remove(a.id);
  assert.equal(status(() => batches.detail(a.id))[0], 404);
  assert.equal(told.at(-1).batchId, a.id);
  assert.equal(status(() => batches.remove(a.id))[0], 404);
});
