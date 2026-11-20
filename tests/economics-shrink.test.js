// The shrink from Your runs (server/economics-runs.js, spec 2026-11-12-data-integrity-design.md 6.3): Not sold over picked of
// the counted runs once each is closed (G11); a run not closed gives no figure and says what to record. Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createHarvests } from '../server/harvests.js';
import { createBatches } from '../server/batches.js';
import { createSales } from '../server/sales.js';
import { createNotSold } from '../server/not-sold.js';
import { fixedZone } from '../server/usage.js';
import { yourRuns } from '../server/economics-runs.js';
import { noteParts } from '../web/economics-figures.js';

const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8);
const zone = fixedZone(480);
const LIM = { name: 'Lim', role: 'owner' };
const plain = (s) => s.replace(/[ ⁠]/g, ' ');

function farm(t) {
  const db = openDb(':memory:');
  let clock = at('2026-10-20');
  const now = () => clock;
  const batches = createBatches({ db, now });
  const harvests = createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor });
  const sales = createSales({ db, now });
  const notSold = createNotSold({ db, now });
  t.after(async () => { harvests.stop(); await harvests.warmed(); db.close(); });
  db.setWorkers([{ name: 'Lim', active: true }]);
  const room = db.createRoom({ name: 'Container 4', length: 12, width: 2.3, height: 2.5, trhAddress: 1 }, clock).id;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'woodear', blocks: 600 }] }, { change: 'start', at: clock });
  const run = db.openRun(room).id;
  db.insertHarvest({ roomId: room, runId: run, crop: 'woodear', stage: 'fruiting', flush: 1, blocks: 600, kg: 190, pickedAt: at('2026-11-01', 8), worker: null, taskId: null, at: at('2026-11-01', 8) });
  clock = at('2026-11-02', 15);
  const buyer = sales.addBuyer({ name: 'Restoran Wong' });
  sales.record({ soldAt: at('2026-11-02', 14), buyerId: buyer.id, lines: [{ crop: 'woodear', kg: 24, priceKg: 9 }] }, LIM);
  clock = at('2026-11-20', 9);
  db.setProgram(room, { ...db.getProgram(room), crops: [] }, { change: 'end', at: clock });
  clock = at('2026-12-01');
  const view = () => yourRuns({ db, harvests, batches, days: () => [], room: db.getRoom(room), crop: 'woodear', today: '2026-12-01', zone });
  return { notSold, room, view, setClock: (ms) => { clock = ms; } };
}

test('G11: 166.0 of 190.0 kg not sold: shrink 87.4 % from Your runs, with its note', (t) => {
  const f = farm(t);
  f.setClock(at('2026-11-10', 17));
  f.notSold.record({ at: at('2026-11-10', 16), crop: 'woodear', kg: 166, reason: 'spoiled', roomId: f.room, worker: 'Lim' }, LIM);
  f.setClock(at('2026-12-01'));
  const { figures } = f.view();
  assert.deepEqual(figures.shrink, { value: 87.4, runs: { count: 1, notSold: 166, picked: 190 } });
  const [n] = noteParts({ key: 'shrink', source: 'runs', value: 87.4, runs: figures.shrink.runs, notes: [] }, { room: 'Container 4', crop: 'woodear' });
  assert.equal(plain(n.text), 'Your runs: 166.0 of 190.0 kg not sold (87.4 %), 1 run.');
});

test('a counted run with kg neither sold nor recorded: no figure; the note asks for the record', (t) => {
  const f = farm(t);
  const { figures } = f.view();
  assert.equal(figures.shrink.value, null);
  assert.deepEqual(figures.shrink.runs.open, { kg: 166, room: 'Container 4', startedAt: at('2026-10-20') });
  const parts = noteParts({ key: 'shrink', source: 'research', value: 6, runs: figures.shrink.runs, notes: [],
    research: { confidence: 'low', low: 3, high: 12, sources: [], note: '' } }, { room: 'Container 4', crop: 'woodear' });
  assert.equal(plain(parts[0].text), 'Your runs: 166.0 kg of Container 4’s run of 20 Oct is neither sold nor recorded as Not sold: record it to measure shrink.');
});
