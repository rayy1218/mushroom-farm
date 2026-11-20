// One pricing everywhere (spec 2026-11-12-data-integrity-design.md 9): a run's electricity is the same RM on Costs, Runs, the
// Harvest tab and the Energy card (G17); a month is the sum of its rooms (G18); a day before and after a rate is priced at
// its own (G14). Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createHarvests } from '../server/harvests.js';
import { createBatches } from '../server/batches.js';
import { createSales } from '../server/sales.js';
import { createCosts } from '../server/costs.js';
import { createRuns } from '../server/runs.js';
import { createTariffs, tariffOf } from '../server/tariffs.js';
import { fixedZone, roomUsage } from '../server/usage.js';

const at = (d, h = 12, m = 0) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8, m);
const zone = fixedZone(480);
const LIM = { name: 'Lim', role: 'owner' };

function farm(t, { price = 0.55 } = {}) {
  const db = openDb(':memory:');
  let clock = at('2026-09-28', 6);
  const now = () => clock;
  const [first] = db.listTariffs();
  db.updateTariff(first.id, { from: first.from, rate: price, afa: 0, note: '' });
  const batches = createBatches({ db, now });
  const harvests = createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor });
  const sales = createSales({ db, now });
  const costs = createCosts({ db, now, zone });
  const runs = createRuns({ db, harvests, batches, sales, costs });
  t.after(async () => { harvests.stop(); costs.stop(); await Promise.all([harvests.warmed(), costs.warmed()]); db.close(); });
  const room = (name) => {
    const id = db.createRoom({ name, length: 12, width: 2.3, height: 2.5, intakeW: 1000 }, clock).id; // no sensor: always seen
    db.setProgram(id, { ...db.getProgram(id), crops: [{ crop: 'oyster', blocks: 500 }] }, { change: 'start', at: clock });
    return id;
  };
  // the intake on `seconds` on a day, from 08:00
  const run = (id, date, seconds) => {
    db.logMachine(id, 'intake', { on: true }, 'auto', at(date, 8));
    db.logMachine(id, 'intake', { on: false }, 'auto', at(date, 8) + seconds * 1000);
  };
  const settle = async () => {
    costs.monthView({});
    harvests.roomView(db.listRooms()[0].id);
    await Promise.all([costs.warmed(), harvests.warmed()]);
  };
  return { db, costs, harvests, runs, room, run, settle, setClock: (ms) => { clock = ms; }, now };
}

test('G17: three days of 1.010 kWh at RM 0.55: RM 1.68 on Costs, Runs, the Harvest tab and the Energy card', async (t) => {
  const f = farm(t);
  const id = f.room('Container 4');
  for (const d of ['2026-10-01', '2026-10-02', '2026-10-03']) f.run(id, d, 3636);
  f.setClock(at('2026-10-04', 10));
  await f.settle();
  const oct = f.costs.monthView({});
  const runId = f.db.openRun(id).id;
  assert.deepEqual(oct.byCategory.filter((c) => c.category === 'utilities').map((c) => [c.label, c.amount]), [['Electricity · estimated', 1.68]]);
  assert.equal(oct.runs.find((r) => r.id === runId).parts.energy, 1.68);
  assert.equal(oct.runs.find((r) => r.id === runId).parts.energyEstimated, 1.68);
  assert.equal(f.runs.list().runs.find((r) => r.id === runId).costs, 1.68);
  assert.equal(f.harvests.roomView(id).current.cost.cost, 1.68, 'was RM 1.67 from 3.030 kWh × 0.55');
  const usage = roomUsage(f.db, id, { days: 7, prices: { electricity: 0.55, water: null, tariff: tariffOf(f.db) }, now: f.now(), zone });
  assert.equal(usage.last7.cost, 1.68);
});

test('G18: a month of two rooms is the sum of its rooms to the sen', async (t) => {
  const f = farm(t, { price: 0.5429 });
  const a = f.room('Container 4');
  const b = f.room('Container 5');
  for (let i = 1; i <= 9; i += 1) {
    f.run(a, `2026-10-0${i}`, 1234 + i * 77);
    f.run(b, `2026-10-0${i}`, 2345 + i * 51);
  }
  f.setClock(at('2026-10-10', 10));
  await f.settle();
  const oct = f.costs.monthView({});
  const lines = oct.runs.map((r) => r.parts.energy);
  const sum = Math.round(lines.reduce((s, x) => s + x, 0) * 100) / 100;
  assert.equal(oct.tiles.costs, sum);
});

test('G14 through Costs: a rate from 1 Oct; 30 Sep at its own price, 1 Oct at the new', async (t) => {
  const f = farm(t, { price: 0.515 });
  createTariffs({ db: f.db, now: f.now }).add({ from: '2026-10-01', rate: 0.515, afa: 0.0275 }, LIM);
  const id = f.room('Container 4');
  f.run(id, '2026-09-30', 36_000); // 10 kWh
  f.run(id, '2026-10-01', 36_000);
  f.setClock(at('2026-10-02', 10));
  await f.settle();
  assert.equal(f.costs.monthView({ month: '2026-09' }).tiles.costs, 5.15);
  assert.equal(f.costs.monthView({ month: '2026-10' }).tiles.costs, 5.43);
});
