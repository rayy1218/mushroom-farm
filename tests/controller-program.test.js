// The stage program in the controller's runner (spec 2026-10-20-crops-and-simulation-design.md 3.4): ramp, stage change,
// stored program, the blocksDone alarm.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../server/controller.js';
import { openDb } from '../server/db.js';
import { createMachines } from '../server/machines.js';
import { startStage } from '../server/program.js';
import { mixBands } from '../web/crops.js';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const OYSTER = [{ crop: 'oyster', blocks: 100 }];
const BAND_KEYS = ['co2Low', 'co2High', 'co2Safety', 'tLow', 'tHigh', 'rhLow', 'rhHigh'];
const bandsOf = (c) => Object.fromEntries(BAND_KEYS.map((k) => [k, c[k]]));

function setup(t, { crops = OYSTER, auto = true, program = {} } = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const client = { async writeCoil() {}, async writeRegisters() {} };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  let clock = 1_000_000;
  const now = () => clock;
  const machines = createMachines({ db, client, poller, now });
  const controller = createController({ db, machines, now, log: (e) => { throw e; } });
  const id = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 }).id;
  controller.update(id, { auto });
  if (crops.length) db.setProgram(id, { ...db.getProgram(id), crops, ...program });
  return {
    db, controller, id, set: (ms) => { clock = ms; }, at: () => clock,
    async cycle({ dt = 30_000 } = {}) {
      clock += dt;
      const start = clock;
      db.addReading({ roomId: id, kind: 'trh', address: 1, at: start, ok: true, t: 22, rh: 90, error: null });
      db.addReading({ roomId: id, kind: 'co2', address: 2, at: start, ok: true, co2: 650, error: null });
      clock += 1;
      await controller.run(start);
    },
  };
}

// Starts the stage now (as the crop PUT does) with a ramp of the given length.
function begin(s, stage, rampH) {
  const p = db0(s);
  s.db.setProgram(s.id, startStage({ ...p, rampH }, stage, s.at(), s.db.getControl(s.id)));
}
const db0 = (s) => s.db.getProgram(s.id);

test('a ramp moves the control bands over the cycles and is dropped when it ends', async (t) => {
  const s = setup(t);
  const from = bandsOf(s.db.getControl(s.id));
  begin(s, 'fruiting', 2);
  const target = mixBands(OYSTER, 'fruiting').bands;
  await s.cycle({ dt: HOUR }); // half way
  const mid = bandsOf(s.db.getControl(s.id));
  assert.notDeepEqual(mid, from);
  assert.notDeepEqual(mid, target);
  assert.ok(mid.tHigh > Math.min(from.tHigh, target.tHigh) && mid.tHigh < Math.max(from.tHigh, target.tHigh) || from.tHigh === target.tHigh);
  assert.notEqual(db0(s).ramp, null);
  await s.cycle({ dt: HOUR + 60_000 });
  assert.deepEqual(bandsOf(s.db.getControl(s.id)), target);
  assert.equal(db0(s).ramp, null, 'dropped and stored');
  const c = s.controller.get(s.id);
  assert.equal(c.tHigh, target.tHigh, 'the page shows them');
});

test('the same cycle decides with the new bands', async (t) => {
  const s = setup(t, { program: {} });
  begin(s, 'fruiting', 0);
  await s.cycle();
  const c = s.controller.get(s.id);
  assert.match(c.reasons.exchange, new RegExp(`${mixBands(OYSTER, 'fruiting').bands.co2Low}|${mixBands(OYSTER, 'fruiting').bands.co2High}`));
});

test('a stage change after its days: the stage, flush and bands follow and the program row is stored', async (t) => {
  const s = setup(t);
  begin(s, 'fruiting', 0);
  await s.cycle();
  const since = db0(s).stageSince;
  await s.cycle({ dt: 7 * DAY - 120_000 });
  assert.equal(db0(s).stage, 'fruiting');
  await s.cycle({ dt: 150_000 });
  const p = db0(s);
  assert.equal(p.stage, 'rest');
  assert.equal(p.flush, 1);
  assert.equal(p.stageSince, since + 7 * DAY, 'at its own end time');
  await s.cycle({ dt: 5 * HOUR });
  assert.deepEqual(bandsOf(s.db.getControl(s.id)), mixBands(OYSTER, 'rest').bands);
});

test('the last rest after the last flush ends in done and the blocksDone alarm; a new stage clears it', async (t) => {
  const s = setup(t, { program: { flushes: 1, rampH: 0 } });
  const alarms = () => s.db.activeAlarms(s.id).filter((a) => a.key === 'blocksDone');
  begin(s, 'fruiting', 0);
  await s.cycle();
  assert.equal(alarms().length, 0);
  await s.cycle({ dt: 7 * DAY + 1000 }); // the last fruiting ends: done (the last rest follows)
  assert.equal(db0(s).done, true);
  assert.equal(alarms().length, 1);
  await s.cycle({ dt: 10 * DAY }); // the rest ends: nothing follows, still done
  assert.equal(db0(s).done, true);
  assert.equal(alarms().length, 1);
  assert.equal(alarms()[0].level, 'warning');
  assert.equal(alarms()[0].text, 'Flush 1 of 1 done: replace the blocks');
  begin(s, 'fruiting', 0);
  await s.cycle();
  assert.equal(db0(s).done, false);
  assert.equal(alarms().length, 0);
});

test('a room without crops is untouched', async (t) => {
  const s = setup(t, { crops: [] });
  const before = s.db.getControl(s.id);
  const program = db0(s);
  await s.cycle({ dt: 10 * DAY });
  assert.deepEqual(bandsOf(s.db.getControl(s.id)), bandsOf(before));
  assert.deepEqual(db0(s), program);
});

test('with auto off the program still advances and writes the bands', async (t) => {
  const s = setup(t, { auto: false });
  begin(s, 'fruiting', 0);
  await s.cycle();
  assert.deepEqual(bandsOf(s.db.getControl(s.id)), mixBands(OYSTER, 'fruiting').bands);
  assert.equal(s.db.getControl(s.id).auto, false);
  await s.cycle({ dt: 8 * DAY });
  assert.equal(db0(s).stage, 'rest');
});

test('bands are written only on a change', async (t) => {
  const s = setup(t);
  begin(s, 'fruiting', 0);
  await s.cycle();
  let writes = 0;
  const real = s.db.setControl;
  s.db.setControl = (...a) => { writes++; return real.apply(s.db, a); };
  await s.cycle();
  await s.cycle();
  assert.equal(writes, 0);
});
