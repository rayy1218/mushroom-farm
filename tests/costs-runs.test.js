// Costs' Runs block (server/costs.js runViews, spec 2026-11-05-runs-design.md 3): every run's whole figures from one read,
// the same as monthView's runs and the run summary give them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createCropApi } from '../server/crop-api.js';
import { createCosts } from '../server/costs.js';
import { fixedZone } from '../server/usage.js';
import { add } from './costs-fixtures.js';

mkdirSync('/tmp/runs', { recursive: true });
const NOW = Date.UTC(2026, 10, 15, 4); // 15 Nov 2026 12:00 on the farm's clock
const OCT1 = Date.UTC(2026, 9, 1, 1);
const NOV1 = Date.UTC(2026, 10, 1, 1);
const ROOM = { name: 'Container 1', length: 6, width: 2.4, height: 2.4 };

// Container 1 with 100 oyster blocks since 1 Oct, Container 2 with 300 since 1 Nov; rent shared over both, a repair in
// Container 1, a sale of Container 1's run.
function setup(t) {
  const dir = mkdtempSync('/tmp/runs/costs-');
  const file = join(dir, 'farm.db');
  const db = openDb(file);
  let clock = OCT1;
  const now = () => clock;
  const one = db.createRoom({ ...ROOM, trhAddress: 1 }, clock).id;
  const two = db.createRoom({ ...ROOM, name: 'Container 2', trhAddress: 2 }, clock).id;
  createCropApi({ db, now }).put(one, { crops: [{ crop: 'oyster', blocks: 100 }] });
  clock = NOV1;
  createCropApi({ db, now }).put(two, { crops: [{ crop: 'oyster', blocks: 300 }] });
  clock = NOW;
  const costs = createCosts({ db, now, zone: fixedZone(480) });
  t.after(async () => {
    costs.stop();
    await costs.warmed();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const runOne = db.openRun(one);
  const runTwo = db.openRun(two);
  costs.add({ date: '2026-10-01', category: 'rent', amount: 1000, repeat: 'monthly' });
  costs.add({ date: '2026-11-03', category: 'repairs', amount: 120, roomId: one });
  const raw = new DatabaseSync(file);
  add(raw, { sales: [{ id: 1, sold_at: Date.UTC(2026, 10, 10, 4), crop: 'oyster', kg: 20, price_kg: 15, total: 300, buyer: 'Kedai', room_id: one, run_id: runOne.id }] });
  raw.close();
  return { db, costs, one, two, runOne, runTwo };
}

test('runViews: every run as monthView\'s runs give it, pending until the energy is worked out', async (t) => {
  const s = setup(t);
  const cold = s.costs.runViews();
  assert.equal(cold.length, 2);
  assert.ok(cold.every((v) => v.pending && v.costs === null && v.profit === null), 'a cold room: no partial figure');
  await s.costs.warmed();
  const views = s.costs.runViews();
  assert.deepEqual(views.map((v) => v.id).toSorted(), [s.runOne.id, s.runTwo.id].toSorted());
  const month = s.costs.monthView({});
  for (const v of views) assert.deepEqual(v, month.runs.find((r) => r.id === v.id), `run ${v.id}: monthView's view`);
  assert.deepEqual(Object.keys(views[0]), ['id', 'roomId', 'roomName', 'startedAt', 'endedAt', 'crops', 'parts', 'byCategory', 'income',
    'kgHarvested', 'kgSold', 'costs', 'profit', 'costPerKg', 'profitPerKg', 'notes', 'pending', 'incomplete']);
});

test('runViews: each run\'s figures are its summary\'s; one run alone; none for a run that is not there', async (t) => {
  const s = setup(t);
  s.costs.runViews();
  await s.costs.warmed();
  for (const v of s.costs.runViews()) {
    const sum = s.costs.summary({ run: v.id });
    assert.deepEqual([v.costs, v.income, v.profit, v.profitPerKg], [sum.total, sum.income, sum.profit, sum.profitPerKg], `run ${v.id}`);
  }
  const [one] = s.costs.runViews({ run: s.runOne.id });
  assert.equal(one.roomName, 'Container 1');
  assert.equal(one.income, 300);
  assert.equal(one.parts.own, 120);
  assert.ok(one.parts.shared > 0, 'its share of the rent');
  assert.deepEqual(s.costs.runViews({ run: 999 }), []);
});
