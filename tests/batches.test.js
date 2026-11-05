// Batches (spec 2026-11-05-batches-design.md 3, 3.1, 3.2 and 6): receive, list, edit, delete, put into a room and take out,
// contamination checks, the stock moves, the BE hook.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createBatches } from '../server/batches.js';
import { createHarvests } from '../server/harvests.js';
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
    if (crops) db.setProgram(id, { ...db.getProgram(id), crops }, { change: 'start', at: NOW - 5 * DAY });
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
  for (const inoculatedAt of [1e300, 9e15, NOW + DAY, -1e300]) {
    assert.deepEqual(status(() => batches.receive({ ...GOOD, inoculatedAt }))?.slice(0, 2), [400, 'inoculatedAt'], String(inoculatedAt));
  }
  assert.deepEqual(status(() => batches.receive({ ...GOOD, receivedAt: 9e15 }))?.slice(0, 2), [400, 'receivedAt']);
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

test('place all the good blocks: the row itself goes in, its room and run shown', (t) => {
  const { batches, room, told } = setup(t);
  const roomId = room();
  const a = batches.receive(GOOD);
  const p = batches.place(a.id, { roomId });
  assert.equal(p.id, a.id);
  assert.equal(p.status, 'placed');
  assert.equal(p.roomName, 'Container 1');
  assert.equal(p.placedAt, NOW);
  assert.equal(p.runBlocks, 950);
  assert.deepEqual(told.at(-1).harvestRooms, [roomId]);
  const d = batches.detail(a.id);
  assert.equal(d.batchBlocks, 1200, 'more than the run\'s 950: allowed, the page says so');
  assert.deepEqual(batches.list({ run: String(p.runId) }).batches.map((x) => x.id), [a.id]);
});

test('place fewer: a part splits off with the shared fields; the first row keeps the rest', (t) => {
  const { batches, room } = setup(t);
  const one = room();
  const two = room();
  const a = batches.receive({ ...GOOD, strain: 'PL-27', blockKg: 2.3, waterPct: 60, note: 'first only' });
  const part = batches.place(a.id, { roomId: one, blocks: 800 });
  assert.notEqual(part.id, a.id);
  assert.equal(part.parentId, a.id);
  assert.deepEqual([part.blocks, part.supplier, part.strain, part.blockKg, part.pricePerBlock, part.note], [800, 'Agro Supplies', 'PL-27', 2.3, 2.3, null]);
  assert.equal(batches.detail(a.id).blocks, 400);
  assert.deepEqual(batches.detail(a.id).delivery.map((x) => x.id), [a.id, part.id]);
  const rest = batches.place(a.id, { roomId: two });
  assert.equal(rest.id, a.id, 'the rest: the first row itself');
  assert.equal(rest.roomName, 'Container 2');
});

test('a waiting part splits from the first row\'s family, never from itself', (t) => {
  const { batches, room } = setup(t);
  const one = room();
  const two = room();
  const a = batches.receive(GOOD);
  const p1 = batches.place(a.id, { roomId: one, blocks: 800 });
  batches.place(a.id, { roomId: two }); // the first row goes in too
  const back = batches.unplace(p1.id); // the first row is placed: the part waits on its own
  assert.equal(back.id, p1.id);
  assert.equal(back.status, 'waiting');
  const p2 = batches.place(p1.id, { roomId: two, blocks: 300 });
  assert.equal(p2.parentId, a.id);
  assert.equal(batches.detail(p1.id).blocks, 500);
});

test('take out: a part folds back into its waiting first row with its checks; otherwise the row waits', (t) => {
  const { batches, room } = setup(t);
  const roomId = room();
  const a = batches.receive(GOOD);
  const part = batches.place(a.id, { roomId, blocks: 800 });
  batches.addCheck(part.id, { lost: 4, cause: 'green', worker: 'Ali' });
  const back = batches.unplace(part.id);
  assert.equal(back.id, a.id);
  assert.equal(back.blocks, 1200);
  assert.equal(back.lost, 4, 'the part\'s check moved to the first row');
  assert.equal(batches.detail(a.id).delivery.length, 1);
  const whole = batches.place(a.id, { roomId });
  assert.equal(batches.unplace(whole.id).status, 'waiting');
});

test('place and take out: the refusals', (t) => {
  const { db, batches, room, tick } = setup(t);
  const oyster = room();
  const pink = room([{ crop: 'pink', blocks: 300 }]);
  const empty = room(null);
  const a = batches.receive(GOOD);
  assert.deepEqual(status(() => batches.place(a.id, { roomId: 999 })).slice(0, 2), [400, 'roomId']);
  assert.deepEqual(status(() => batches.place(a.id, { roomId: oyster, blocks: 1201 })).slice(0, 2), [400, 'blocks']);
  assert.deepEqual(status(() => batches.place(a.id, { roomId: oyster, blocks: 0 })).slice(0, 2), [400, 'blocks']);
  assert.deepEqual(status(() => batches.place(a.id, { roomId: empty })), [409, null, 'Give Container 3 its crops on the Crop tab first']);
  assert.deepEqual(status(() => batches.place(a.id, { roomId: pink })), [409, null, "Container 2's run has no Grey oyster"]);
  assert.equal(status(() => batches.unplace(a.id))[0], 409, 'not in a room');
  batches.place(a.id, { roomId: oyster });
  assert.equal(status(() => batches.place(a.id, { roomId: oyster }))[0], 409, 'in a room already');
  tick(DAY);
  db.setProgram(oyster, { ...db.getProgram(oyster), crops: [] }, { change: 'end', at: NOW + DAY });
  assert.deepEqual(status(() => batches.unplace(a.id)), [409, null, "Container 1's run has ended"]);
  assert.equal(batches.detail(a.id).status, 'past');
  assert.equal(status(() => batches.edit(a.id, { crop: 'pink' }))[0], 409, 'crop of a placed delivery');
  assert.equal(status(() => batches.edit(a.id, { blocks: 1000 }))[0], 409, 'blocks of a placed row');
});

test('delete: a first row with parts is refused; a part is deleted without giving its blocks back', (t) => {
  const { batches, room } = setup(t);
  const roomId = room();
  const a = batches.receive(GOOD);
  const part = batches.place(a.id, { roomId, blocks: 200 });
  assert.deepEqual(status(() => batches.remove(a.id)), [409, null, 'Delete its parts first, or take them out of the rooms']);
  batches.remove(part.id);
  assert.equal(batches.detail(a.id).blocks, 1000);
  batches.remove(a.id);
  assert.deepEqual(batches.list().batches, []);
});

test('shared fields edited on a part are written to the whole delivery; a note stays the row\'s own', (t) => {
  const { batches, room } = setup(t);
  const roomId = room();
  const a = batches.receive(GOOD);
  const part = batches.place(a.id, { roomId, blocks: 200 });
  batches.edit(part.id, { pricePerBlock: 2.5, spawnBatch: '0913', note: 'part note' });
  assert.deepEqual([batches.detail(a.id).pricePerBlock, batches.detail(a.id).spawnBatch, batches.detail(a.id).note], [2.5, '0913', null]);
  assert.equal(batches.detail(part.id).note, 'part note');
});

test('checks: record, list newest first, edit, delete; good blocks follow', (t) => {
  const { batches, tick } = setup(t);
  const a = batches.receive(GOOD);
  const c1 = batches.addCheck(a.id, { lost: 20, cause: 'green', worker: 'Ali', note: 'top shelf' });
  assert.deepEqual([c1.batchId, c1.at, c1.lost, c1.cause, c1.worker, c1.note], [a.id, NOW, 20, 'green', 'Ali', 'top shelf']);
  tick(60_000);
  const c2 = batches.addCheck(a.id, { lost: 5, cause: 'pests', worker: 'Siti' });
  const d = batches.detail(a.id);
  assert.equal(d.good, 1175);
  assert.deepEqual(d.checks.map((c) => c.id), [c2.id, c1.id]);
  const e = batches.editCheck(c1.id, { lost: 30 });
  assert.deepEqual([e.lost, e.worker, e.note], [30, 'Ali', 'top shelf'], 'not given: kept');
  batches.removeCheck(c2.id);
  assert.equal(batches.detail(a.id).good, 1170);
  assert.equal(status(() => batches.removeCheck(c2.id))[0], 404);
  assert.equal(status(() => batches.editCheck(999, { lost: 1 }))[0], 404);
});

test('checks: the refusals', (t) => {
  const { batches } = setup(t);
  const a = batches.receive({ ...GOOD, blocks: 10 });
  const cases = [
    [{ lost: 11, cause: 'green', worker: 'Ali' }, 'lost'],
    [{ lost: 0, cause: 'green', worker: 'Ali' }, 'lost'],
    [{ lost: 1, cause: 'rot', worker: 'Ali' }, 'cause'],
    [{ lost: 1, cause: 'green', worker: '' }, 'worker'],
    [{ lost: 1, cause: 'green', worker: 'Ali', at: NOW + 60_000 }, 'at'],
    [{ lost: 1, cause: 'green', worker: 'Ali', at: GOOD.receivedAt - 86_400_000 }, 'at'],
  ];
  for (const [body, field] of cases) assert.deepEqual(status(() => batches.addCheck(a.id, body)).slice(0, 2), [400, field], JSON.stringify(body));
  const c = batches.addCheck(a.id, { lost: 10, cause: 'black', worker: 'Ali' });
  assert.equal(status(() => batches.addCheck(a.id, { lost: 1, cause: 'green', worker: 'Ali' }))[0], 409, 'all lost already');
  assert.equal(batches.editCheck(c.id, { lost: 10 }).lost, 10, 'its own lost blocks count back in');
});

test('checks: a name not on the workers list is refused when the farm has one', (t) => {
  const { db, batches } = setup(t);
  db.setWorkers([{ name: 'Ali', active: true }]);
  const a = batches.receive(GOOD);
  assert.deepEqual(status(() => batches.addCheck(a.id, { lost: 1, cause: 'green', worker: 'Bob' })).slice(0, 2), [400, 'worker']);
  assert.equal(batches.addCheck(a.id, { lost: 1, cause: 'green', worker: 'ali' }).worker, 'Ali');
});

test('a batch whose blocks are all lost cannot be put into a room', (t) => {
  const { batches, room } = setup(t);
  const roomId = room();
  const a = batches.receive({ ...GOOD, blocks: 3 });
  batches.addCheck(a.id, { lost: 3, cause: 'bacterial', worker: 'Ali' });
  assert.deepEqual(status(() => batches.place(a.id, { roomId })), [409, null, 'Every block of this batch was lost']);
});

const movesOf = (db, ids) => db.batches.moves(ids).map((m) => [m.refId, m.qty, m.unitCost, m.note]);

test('stock moves: receipt, a part in, a loss while waiting, a fold, an edit, a delete', (t) => {
  const { db, batches, room, tick } = setup(t, { stock: true });
  const roomId = room();
  const a = batches.receive(GOOD);
  const item = db.batches.blocksItem('Grey oyster blocks');
  assert.deepEqual(db.batches.moves([a.id]).map((m) => m.itemId), [item], 'on the crop\'s blocks item');
  assert.deepEqual(movesOf(db, [a.id]), [[a.id, 1200, 2.3, null]]);
  tick(60_000);
  const part = batches.place(a.id, { roomId, blocks: 800 });
  assert.deepEqual(movesOf(db, [a.id, part.id]), [[a.id, 1200, 2.3, null], [part.id, -800, null, 'into a room']]);
  tick(60_000);
  batches.addCheck(a.id, { lost: 10, cause: 'green', worker: 'Ali' });
  assert.deepEqual(movesOf(db, [a.id, part.id]).at(-1), [a.id, -10, null, 'contaminated']);
  batches.unplace(part.id);
  assert.deepEqual(movesOf(db, [a.id, part.id]), [[a.id, 1200, 2.3, null], [a.id, -10, null, 'contaminated']], 'the fold: the part\'s moves gone');
  batches.edit(a.id, { pricePerBlock: 2.4 });
  assert.equal(db.batches.moves([a.id])[0].unitCost, 2.4);
  batches.edit(a.id, { crop: 'pink' });
  assert.deepEqual(db.batches.moves([a.id]).map((m) => m.itemId), [db.batches.blocksItem('Pink oyster blocks'), db.batches.blocksItem('Pink oyster blocks')]);
  batches.remove(a.id);
  assert.deepEqual(movesOf(db, [a.id, part.id]), []);
});

test('stock moves: a placed row\'s later losses are in a room, not stock; deleting a part lowers the receipt', (t) => {
  const { db, batches, room, tick } = setup(t, { stock: true });
  const roomId = room();
  const a = batches.receive(GOOD);
  const part = batches.place(a.id, { roomId, blocks: 200 });
  tick(60_000);
  batches.addCheck(part.id, { lost: 7, cause: 'pests', worker: 'Ali' });
  assert.deepEqual(movesOf(db, [part.id]), [[part.id, -200, null, 'into a room']]);
  batches.remove(part.id);
  assert.deepEqual(movesOf(db, [a.id, part.id]), [[a.id, 1000, 2.3, null]]);
});

test('without Inventory\'s tables nothing is written and nothing fails', (t) => {
  const { db, batches, room } = setup(t);
  const a = batches.receive(GOOD);
  batches.place(a.id, { roomId: room(), blocks: 100 });
  assert.equal(db.batches.hasStock(), false);
});

test('the CSV: the head, oldest first, the formula guard, the default 90 days', (t) => {
  const { batches, room } = setup(t);
  batches.receive({ ...GOOD, receivedAt: NOW - 100 * 86_400_000, supplier: 'Too old' });
  const a = batches.receive({ ...GOOD, receivedAt: NOW - 3 * 86_400_000, supplier: '=cmd' });
  batches.receive({ ...GOOD, receivedAt: NOW - 86_400_000, supplier: 'Later', note: 'a, b' });
  batches.place(a.id, { roomId: room() });
  const { name, text } = batches.csv();
  assert.equal(name, 'batches 2026-08-08–2026-11-05.csv');
  const lines = text.trimEnd().split('\r\n');
  assert.equal(lines[0], 'received,crop,kind,supplier,strain,spawn batch,delivery note,blocks,lost,price per block,room,run started,placed,block kg,water %,note,mixed,recipe');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], "2026-11-02,Grey oyster,bought,'=cmd,,0912,,1200,0,2.3,Container 1,2026-10-31,2026-11-05,,,,,");
  assert.match(lines[2], /,"a, b",,$/);
  assert.equal(batches.csv({ from: '2026-11-04', to: '2026-11-04' }).text.trimEnd().split('\r\n').length, 2);
  assert.equal(status(() => batches.csv({ from: 'x' }))[0], 400);
});

test("Harvest's BE uses the batches' dry kg when every batch of the crop in the run has a weight (spec 3.2)", async (t) => {
  const { db, batches, room } = setup(t);
  const roomId = room([{ crop: 'oyster', blocks: 1000 }]);
  const harvests = createHarvests({ db, now: () => NOW, batchDryKg: batches.dryKgFor });
  t.after(() => harvests.stop());
  harvests.record(roomId, { crop: 'oyster', kg: 100, worker: 'Ali' });
  const before = harvests.roomView(roomId).current;
  assert.equal(before.be, null, 'no dry substrate in Settings and no batch');
  const a = batches.receive({ ...GOOD, blocks: 600, blockKg: 2.5, waterPct: 60 }); // 1.0 kg dry
  batches.place(a.id, { roomId });
  const b = batches.receive({ ...GOOD, blocks: 400 });
  batches.place(b.id, { roomId });
  assert.equal(harvests.roomView(roomId).current.be, null, 'one batch has no weight: Settings stays');
  batches.edit(b.id, { blockKg: 2.5, waterPct: 60 });
  assert.equal(harvests.roomView(roomId).current.be, 10, '100 kg ÷ (1,000 blocks × 1.0 kg) × 100');
  assert.deepEqual(harvests.roomView(roomId).current.missing.dryKg, []);
  assert.equal(harvests.farmView({ days: 30 }).rooms[0].current.be, 10);
  await harvests.warmed();
});

test('checks: times far out of range are a 400 on at, never a crash', (t) => {
  const { batches } = setup(t);
  const a = batches.receive(GOOD);
  for (const at of [-1e300, -9e15, 1e300, 9e15]) {
    assert.deepEqual(status(() => batches.addCheck(a.id, { lost: 1, cause: 'green', worker: 'Ali', at }))?.slice(0, 2), [400, 'at'], String(at));
  }
  const c = batches.addCheck(a.id, { lost: 1, cause: 'green', worker: 'Ali' });
  assert.deepEqual(status(() => batches.editCheck(c.id, { at: -9e15 }))?.slice(0, 2), [400, 'at']);
});

test('checks: every block lost is a 409 before the fields are looked at', (t) => {
  const { batches } = setup(t);
  const a = batches.receive({ ...GOOD, blocks: 2 });
  batches.addCheck(a.id, { lost: 2, cause: 'green', worker: 'Ali' });
  assert.equal(status(() => batches.addCheck(a.id, { lost: 0, cause: 'rot', worker: '', at: -1e300 }))[0], 409);
});

test('edit: receivedAt later than a check or a placement is refused', (t) => {
  const { batches, room, tick } = setup(t);
  const a = batches.receive({ ...GOOD, receivedAt: NOW - 5 * DAY });
  batches.addCheck(a.id, { lost: 1, cause: 'green', worker: 'Ali', at: NOW - 3 * DAY });
  assert.deepEqual(status(() => batches.edit(a.id, { receivedAt: NOW - DAY })), [400, 'receivedAt', 'Some contamination checks are before that day']);
  assert.equal(batches.edit(a.id, { receivedAt: NOW - 3 * DAY }).receivedAt, NOW - 3 * DAY, 'the check day itself is fine');
  const b = batches.receive({ ...GOOD, receivedAt: NOW - 5 * DAY });
  const part = batches.place(b.id, { roomId: room(), blocks: 100 });
  tick(0);
  assert.deepEqual(status(() => batches.edit(part.id, { receivedAt: NOW + 0 - 0 })), null, 'placed today: received today is fine');
  const c = batches.receive({ ...GOOD, receivedAt: NOW - 5 * DAY });
  batches.place(c.id, { roomId: room() });
  assert.equal(batches.edit(c.id, { receivedAt: NOW }).receivedAt, NOW);
});

test('edit: a later receivedAt than the placed day is refused', (t) => {
  const { batches, room, tick } = setup(t);
  const a = batches.receive({ ...GOOD, receivedAt: NOW - 5 * DAY });
  batches.place(a.id, { roomId: room() });
  tick(2 * DAY);
  assert.deepEqual(status(() => batches.edit(a.id, { receivedAt: NOW + DAY })), [400, 'receivedAt', 'Some blocks went into a room before that day']);
});

test('place on a row whose run has ended says so; a deleted room keeps its own text and its stock move out', (t) => {
  const { db, batches, room, tick } = setup(t, { stock: true });
  const one = room();
  const a = batches.receive(GOOD);
  batches.place(a.id, { roomId: one });
  tick(DAY);
  db.setProgram(one, { ...db.getProgram(one), crops: [] }, { change: 'end', at: NOW + DAY });
  assert.deepEqual(status(() => batches.place(a.id, { roomId: one })), [409, null, "Container 1's run has ended"]);
  const two = room();
  const b = batches.receive(GOOD);
  batches.place(b.id, { roomId: two });
  assert.equal(db.deleteRoom(two), true);
  assert.equal(batches.detail(b.id).status, 'past');
  assert.deepEqual(status(() => batches.place(b.id, { roomId: one })), [409, null, 'These blocks went into a room that was deleted']);
  assert.deepEqual(movesOf(db, [b.id]), [[b.id, 1200, 2.3, null], [b.id, -1200, null, 'into a room']]);
});

test('a folded part keeps its own note, appended on a new line, at most 500 characters', (t) => {
  const { batches, room } = setup(t);
  const roomId = room();
  const a = batches.receive({ ...GOOD, note: 'first' });
  const part = batches.place(a.id, { roomId, blocks: 100 });
  batches.edit(part.id, { note: 'part note' });
  assert.equal(batches.unplace(part.id).note, 'first\npart note');
  const b = batches.receive({ ...GOOD, note: 'f'.repeat(450) });
  const p2 = batches.place(b.id, { roomId, blocks: 100 });
  batches.edit(p2.id, { note: 'p'.repeat(100) });
  assert.equal(batches.unplace(p2.id).note.length, 500);
  const c = batches.receive(GOOD);
  const p3 = batches.place(c.id, { roomId, blocks: 100 });
  batches.edit(p3.id, { note: 'only part' });
  assert.equal(batches.unplace(p3.id).note, 'only part');
});

test('harvestRooms: unplace (fold and not) and removing a placed row tell the room', (t) => {
  const { batches, room, told } = setup(t);
  const roomId = room();
  const a = batches.receive(GOOD);
  const part = batches.place(a.id, { roomId, blocks: 100 });
  batches.unplace(part.id);
  assert.deepEqual(told.at(-1).harvestRooms, [roomId], 'fold');
  const whole = batches.place(a.id, { roomId });
  batches.unplace(whole.id);
  assert.deepEqual(told.at(-1).harvestRooms, [roomId], 'not a fold');
  const p = batches.place(a.id, { roomId, blocks: 100 });
  batches.remove(p.id);
  assert.deepEqual(told.at(-1).harvestRooms, [roomId], 'removing a placed row');
  batches.remove(a.id);
  assert.deepEqual(told.at(-1).harvestRooms, [], 'a waiting row');
});

test('a listener that throws is logged and does not undo or fail the write', (t) => {
  const { db } = setup(t);
  const logged = [];
  const batches = createBatches({ db, now: () => NOW, log: (e) => logged.push(e) });
  batches.onChange(() => { throw new Error('listener'); });
  const heard = [];
  batches.onChange((c) => heard.push(c));
  const a = batches.receive(GOOD);
  assert.equal(batches.detail(a.id).id, a.id);
  assert.equal(logged.length, 1);
  assert.equal(heard.length, 1, 'the next listener still hears');
});

test('stock moves: a crop edit on a delivery whose part waits moves every move to the new crop\'s item', (t) => {
  const { db, batches, room } = setup(t, { stock: true });
  const roomId = room();
  const a = batches.receive(GOOD);
  const part = batches.place(a.id, { roomId, blocks: 100 });
  batches.place(a.id, { roomId });
  batches.unplace(part.id); // the first row is placed: the part waits on its own
  assert.equal(status(() => batches.edit(part.id, { crop: 'pink' }))[0], 409, 'the first row is placed');
  batches.unplace(a.id); // now both rows wait (no fold: the part was not folded)
  assert.equal(batches.detail(a.id).delivery.length, 2);
  batches.addCheck(part.id, { lost: 3, cause: 'green', worker: 'Ali' });
  batches.edit(part.id, { crop: 'pink' });
  const pink = db.batches.blocksItem('Pink oyster blocks');
  const moves = db.batches.moves([a.id, part.id]);
  assert.ok(moves.length >= 2, JSON.stringify(moves));
  assert.ok(moves.every((m) => m.itemId === pink), JSON.stringify([pink, moves]));
});

test('list: status past and waiting with data', (t) => {
  const { db, batches, room, tick } = setup(t);
  const roomId = room();
  const wait = batches.receive(GOOD);
  const placed = batches.receive(GOOD);
  const past = batches.receive(GOOD);
  batches.place(placed.id, { roomId });
  const other = room();
  batches.place(past.id, { roomId: other });
  tick(DAY);
  db.setProgram(other, { ...db.getProgram(other), crops: [] }, { change: 'end', at: NOW + DAY });
  assert.deepEqual(batches.list({ status: 'waiting' }).batches.map((x) => x.id), [wait.id]);
  assert.deepEqual(batches.list({ status: 'placed' }).batches.map((x) => x.id), [placed.id]);
  assert.deepEqual(batches.list({ status: 'past' }).batches.map((x) => x.id), [past.id]);
});

test('list and csv: from after to is a 400 on from', (t) => {
  const { batches } = setup(t);
  assert.deepEqual(status(() => batches.list({ from: '2026-11-05', to: '2026-11-04' })), [400, 'from', 'from must be on or before to']);
  assert.deepEqual(status(() => batches.csv({ from: '2026-11-05', to: '2026-11-04' })).slice(0, 2), [400, 'from']);
});

test('the CSV: a note with a line break is quoted; no BOM', (t) => {
  const { batches } = setup(t);
  batches.receive({ ...GOOD, note: 'line one\nline two' });
  const { text } = batches.csv();
  assert.ok(text.includes('"line one\nline two"'));
  assert.notEqual(text.charCodeAt(0), 0xfeff);
});

test('usedBlocks: the blocks that went into the room, without the ones lost before it', (t) => {
  const { batches, room, tick } = setup(t);
  const roomId = room();
  const a = batches.receive({ ...GOOD, blocks: 100 });
  assert.equal(batches.detail(a.id).usedBlocks, null, 'waiting: none');
  tick(60_000);
  batches.addCheck(a.id, { lost: 5, cause: 'green', worker: 'Ali' });
  tick(60_000);
  const p = batches.place(a.id, { roomId });
  assert.equal(p.usedBlocks, 95);
  tick(60_000);
  batches.addCheck(p.id, { lost: 3, cause: 'pests', worker: 'Ali' });
  const after = batches.detail(p.id);
  assert.deepEqual([after.lost, after.good, after.usedBlocks], [8, 92, 95], 'a loss after the placement leaves it');
  assert.equal(batches.list().batches.find((x) => x.id === p.id).usedBlocks, 95);
});
