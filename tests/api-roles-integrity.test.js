// Workers and Data integrity (spec 2026-11-12-data-integrity-design.md 12): a worker records harvests, uses, counts and Not
// sold as themselves and undoes their own within its minute; never voids, restores, reads the change log, the tariff or keeps a
// month; their asks carry no RM (G19). Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signedInFarm } from './integrity-fixture.js';

test('G19: a worker records 7.6 kg of grey oyster as themselves; void, the log and the money routes are 403', async (t) => {
  const { db, call, room } = await signedInFarm(t);
  const crops = db.getProgram(room).crops;
  assert.ok(crops.length);
  const made = await call('POST', `/api/rooms/${room}/harvests`, { crop: 'oyster', kg: 7.6, worker: 'Lim' }, 'worker');
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.worker, 'Aminah');
  assert.deepEqual(db.changesOf('harvest', made.body.id).map((c) => [c.action, c.by, c.role]), [['add', 'Aminah', 'worker']]);
  for (const [method, path, body] of [
    ['POST', `/api/harvests/${made.body.id}/void`, { reason: 'Weighed twice' }], ['POST', `/api/harvests/${made.body.id}/restore`, {}],
    ['PUT', `/api/harvests/${made.body.id}`, { kg: 7 }], ['GET', '/api/changes'], ['GET', '/api/changes.csv'], ['GET', '/api/tariffs'],
    ['POST', '/api/tariffs', { from: '2026-10-01', rate: 0.5 }], ['POST', '/api/costs/months/202610/keep', {}],
    ['POST', '/api/inventory/moves/1/void', { reason: 'Wrong item' }], ['POST', '/api/not-sold/1/void', { reason: 'Wrong crop' }],
  ]) {
    assert.equal((await call(method, path, body, 'worker')).status, 403, `${method} ${path}`);
  }
});

test("a worker's asks name no money: a duplicate pick", async (t) => {
  const { call, room } = await signedInFarm(t);
  await call('POST', `/api/rooms/${room}/harvests`, { crop: 'oyster', kg: 12.5, worker: 'Aminah' }, 'worker');
  const again = await call('POST', `/api/rooms/${room}/harvests`, { crop: 'oyster', kg: 12.5, worker: 'Aminah' }, 'worker');
  assert.equal(again.status, 409);
  assert.deepEqual(again.body.asks.map((a) => a.kind), ['duplicate']);
  assert.ok(!JSON.stringify(again.body).includes('RM'));
  const ok = await call('POST', `/api/rooms/${room}/harvests`, { crop: 'oyster', kg: 12.5, worker: 'Aminah', confirmed: ['duplicate'] }, 'worker');
  assert.equal(ok.status, 201);
});
