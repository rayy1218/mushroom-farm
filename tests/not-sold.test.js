// Not sold (server/not-sold.js, spec 2026-11-12-data-integrity-design.md 6): recorded with its checks, a room's run tied, a
// worker as themselves; the asks (a duplicate, more than unsold, the balance); edit, void, restore and the Undo, each logged;
// it closes the unsold balance (G10). Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createNotSold, NotSoldError } from '../server/not-sold.js';
import { createSales } from '../server/sales.js';
import { AskError } from '../server/asks.js';
import { signedInFarm } from './integrity-fixture.js';

const farm = (d, hh = 12, mm = 0) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), hh - 8, mm);
const NOW = farm('2026-11-10', 16, 30);
const LIM = { name: 'Lim', role: 'owner' };
const AMINAH = { name: 'Aminah', role: 'worker' };
const plain = (s) => s.replace(/ /g, ' ');

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = farm('2026-10-25');
  const now = () => clock;
  db.setWorkers([{ name: 'Aminah', active: true }, { name: 'Lim', active: true }]);
  const room = db.createRoom({ name: 'Container 4', length: 12, width: 2.3, height: 2.5 }, clock).id;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'woodear', blocks: 600 }] }, { change: 'start', at: clock });
  const run = db.openRun(room).id;
  db.insertHarvest({ roomId: room, runId: run, crop: 'woodear', stage: 'fruiting', flush: 1, blocks: 600, kg: 190, pickedAt: farm('2026-11-01', 8), worker: null, taskId: null, at: farm('2026-11-01', 8) });
  const sales = createSales({ db, now });
  const buyer = sales.addBuyer({ name: 'Restoran Wong' });
  clock = farm('2026-11-02', 15);
  sales.record({ soldAt: farm('2026-11-02', 14), buyerId: buyer.id, lines: [{ crop: 'woodear', kg: 24, priceKg: 9 }] }, LIM);
  clock = NOW;
  const notSold = createNotSold({ db, now });
  return { db, sales, notSold, room, run, buyer, tick: (ms) => { clock += ms; } };
}
const refused = (fn, status, field) => assert.throws(fn, (e) => e instanceof NotSoldError && e.status === status && e.field === field);

test('G10: 166.0 kg past its keeping days since 6 Nov; Not sold 166.00 kg (spoiled) closes it, tied to the room\'s run', (t) => {
  const { db, sales, notSold, room, run } = setup(t);
  assert.deepEqual(notSold.unsold().crops.map((c) => [c.crop, c.fresh, c.past, c.pastSince]), [['woodear', 0, 166, '2026-11-06']]);
  assert.deepEqual(sales.view({ days: 30 }).unsold.total, { fresh: 0, past: 166, value: 0 });
  const r = notSold.record({ at: NOW, crop: 'woodear', kg: 166, reason: 'spoiled', roomId: room, worker: 'Aminah' }, AMINAH);
  assert.deepEqual([r.kg, r.reason, r.roomName, r.runId, r.worker], [166, 'spoiled', 'Container 4', run, 'Aminah']);
  assert.deepEqual(notSold.unsold().crops, []);
  assert.deepEqual(db.changesOf('not-sold', r.id).map((c) => [c.action, c.by, c.after.kg]), [['add', 'Aminah', 166]]);
});

test('the checks: day, crop, kg, why, room, a buyer only for rejected, note, who', (t) => {
  const { notSold, buyer } = setup(t);
  const ok = { at: NOW, crop: 'woodear', kg: 5, reason: 'sample', worker: 'Lim' };
  refused(() => notSold.record({ ...ok, at: NOW + 3_600_000 }, LIM), 400, 'at');
  refused(() => notSold.record({ ...ok, crop: 'truffle' }, LIM), 400, 'crop');
  refused(() => notSold.record({ ...ok, kg: 0 }, LIM), 400, 'kg');
  refused(() => notSold.record({ ...ok, reason: 'lost' }, LIM), 400, 'reason');
  refused(() => notSold.record({ ...ok, roomId: 99 }, LIM), 400, 'roomId');
  refused(() => notSold.record({ ...ok, note: 'x'.repeat(201) }, LIM), 400, 'note');
  refused(() => notSold.record({ ...ok, worker: 'Nobody' }, LIM), 400, 'worker');
  assert.equal(notSold.record({ ...ok, buyerId: buyer.id }, LIM).buyerId, null, 'a buyer only for rejected');
  assert.equal(notSold.record({ ...ok, kg: 6, reason: 'rejected', buyerId: buyer.id }, LIM).buyer, 'Restoran Wong');
});

test('the asks: a duplicate within 10 minutes, more than the unsold kg', (t) => {
  const { notSold, tick } = setup(t);
  notSold.record({ at: NOW, crop: 'woodear', kg: 12, reason: 'spoiled', worker: 'Aminah' }, AMINAH);
  tick(60_000);
  try {
    notSold.record({ at: NOW + 60_000, crop: 'woodear', kg: 12, reason: 'spoiled', worker: 'Aminah' }, AMINAH);
    assert.fail('no ask');
  } catch (e) {
    assert.ok(e instanceof AskError, e.message);
    assert.deepEqual(e.asks.map((a) => [a.kind, plain(a.text)]), [['duplicate', '12.00 kg of Black jelly (wood ear) was recorded not sold (spoiled) at 16:30. Is this another?']]);
  }
  try {
    notSold.record({ at: NOW, crop: 'woodear', kg: 200, reason: 'dried', worker: 'Aminah' }, AMINAH);
    assert.fail('no ask');
  } catch (e) {
    assert.deepEqual(e.asks.map((a) => [a.kind, plain(a.text)]), [['beyond', "That's more than the 154.00 kg of Black jelly (wood ear) not yet sold. Is 200.00 kg right?"]]);
  }
});

test('edit, void, restore by the owner; the Undo within its minute by its person; each logged', (t) => {
  const { db, notSold, tick } = setup(t);
  const r = notSold.record({ at: NOW, crop: 'woodear', kg: 12, reason: 'spoiled', worker: 'Aminah' }, AMINAH);
  assert.equal(notSold.edit(r.id, { kg: 10 }, LIM).kg, 10);
  refused(() => notSold.remove(r.id, LIM), 409, undefined);
  refused(() => notSold.voidNotSold(r.id, {}, LIM), 400, 'reason');
  assert.equal(notSold.voidNotSold(r.id, { reason: 'They sold after all' }, LIM).voided.reason, 'They sold after all');
  assert.equal(notSold.unsold().total.past, 166, 'out of the balance');
  refused(() => notSold.edit(r.id, { kg: 9 }, LIM), 409, undefined);
  notSold.restoreNotSold(r.id, {}, LIM);
  assert.deepEqual(db.changesOf('not-sold', r.id).map((c) => [c.action, c.by]), [['add', 'Aminah'], ['edit', 'Lim'], ['void', 'Lim'], ['restore', 'Lim']]);
  const slip = notSold.record({ at: NOW, crop: 'woodear', kg: 2, reason: 'staff', worker: 'Aminah' }, AMINAH);
  tick(30_000);
  notSold.remove(slip.id, AMINAH);
  assert.equal(db.getNotSold(slip.id), null);
  assert.deepEqual(notSold.list({ days: 7 }).records.map((x) => [x.id, x.voided]), [[r.id, null]]);
});

test('over HTTP: a worker records Not sold as themselves; voids and the list are the owner\'s', async (t) => {
  const { call, room } = await signedInFarm(t);
  await call('POST', `/api/rooms/${room}/harvests`, { crop: 'oyster', kg: 30, worker: 'Aminah' }, 'worker');
  const made = await call('POST', '/api/not-sold', { crop: 'oyster', kg: 4, reason: 'spoiled', roomId: room, worker: 'Lim' }, 'worker');
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.worker, 'Aminah');
  assert.equal((await call('POST', `/api/not-sold/${made.body.id}/void`, { reason: 'x y z' }, 'worker')).status, 403);
  assert.equal((await call('GET', '/api/not-sold?days=7', undefined, 'worker')).status, 403);
  assert.equal((await call('GET', '/api/not-sold?days=7')).body.records.length, 1);
  assert.equal((await call('DELETE', `/api/not-sold/${made.body.id}`, undefined, 'worker')).status, 204, 'their Undo');
});

test("Costs: a month's not-yet-sold note takes Not sold off; a run's kg not sold through the sale steps", async (t) => {
  const { db, notSold, room, run } = setup(t);
  const { createCosts } = await import('../server/costs.js');
  const { fixedZone } = await import('../server/usage.js');
  const costs = createCosts({ db, now: () => NOW, zone: fixedZone(480) });
  t.after(async () => { costs.stop(); await costs.warmed(); });
  const note = () => costs.monthView({ month: '2026-11' }).notes.find((n) => n.kind === 'unsold')?.text ?? null;
  assert.equal(note(), '166.0 kg picked and not yet sold');
  notSold.record({ at: NOW, crop: 'woodear', kg: 160, reason: 'dried', worker: 'Lim' }, LIM);
  assert.equal(note(), '6.0 kg picked and not yet sold');
  costs.monthView({ month: '2026-11' });
  await costs.warmed();
  const r = costs.monthView({ month: '2026-11' }).runs.find((x) => x.id === run);
  assert.deepEqual([r.kgHarvested, r.kgSold, r.kgNotSold], [190, 24, 160], `room ${room}: the only run growing it`);
});
