// Gateway outages and the room's own alarms (spec 2026-11-12-alarms-triage-design.md 4; the independent review's repros of
// 2026-11-12): an outage pauses the room's alarms, never clears them; a flapping gateway hides nothing; the gateway alarm has
// hysteresis.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createController } from '../server/controller.js';
import { createMachines } from '../server/machines.js';

const MIN_CYCLES = 12; // cycles of 5 s in a minute
const GW = '127.0.0.1:1512';

// A wired container behind its own gateway, grey oyster in fruiting (hot limit 32 °C), on a controller with a fake clock.
// cycle(down, t): one poll cycle 5 s on; down: nothing answers (readings fail, the relay module and the aircon too).
function setup(t, { relay = true, acNeverAnswers = false, crops = true } = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = 1_000_000;
  let up = true;
  const okRelay = () => ({ at: clock, ok: true, coils: Array(6).fill(false), inputs: Array(6).fill(false) });
  const failed = () => ({ at: clock, ok: false, error: 'no connection' });
  const okAc = () => ({ at: clock, ok: true, power: false, mode: 'cool', setpoint: 25, fan: 'auto', roomT: 25, error: 0 });
  const poller = { machineState: () => ({
    relay: relay ? { address: 3, polls: [up ? okRelay() : failed()] } : { address: null, polls: [] },
    ac: { address: 4, polls: [up && !acNeverAnswers ? okAc() : failed()] },
  }) };
  const machines = createMachines({ db, client: { async writeCoil() {}, async writeRegisters() {} }, poller, now: () => clock });
  const controller = createController({ db, machines, now: () => clock, log: (e) => { throw e; } });
  const room = db.createRoom({ length: 6, width: 2.4, height: 2.4, trhAddress: 1, co2Address: 2, relayAddress: relay ? 3 : null, acAddress: 4, name: 'Container 1', gateway: GW });
  if (crops) db.setProgram(room.id, { ...db.getProgram(room.id), crops: [{ crop: 'oyster', blocks: 100 }], stage: 'fruiting' });
  const events = [];
  db.onAlarmChange((e) => events.push([e.change, e.alarm?.key, e.alarm?.level]));
  return {
    db, room, events,
    level: (key) => db.activeAlarms(room.id).find((a) => a.key === key)?.level ?? null,
    async cycle(down, temp = 25) {
      await this.cycleWith({ down, temp });
    },
    // trh: the probe's reading to store instead of a good one (a dead probe behind a gateway that answers)
    async cycleWith({ down, temp = 25, trh = null }) {
      clock += 5000;
      up = !down;
      const read = (kind, address, good) => db.addReading({ roomId: room.id, kind, address, at: clock, ...(down ? { ok: false, error: 'no connection' } : { ok: true, ...good }) });
      if (trh && !down) db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: clock, ...trh });
      else read('trh', 1, { t: temp + (clock % 10_000 ? 0.1 : 0), rh: 88 + (clock % 10_000 ? 0.2 : 0) }); // never frozen
      read('co2', 2, { co2: clock % 10_000 ? 705 : 700 });
      await controller.run(clock, [{ gateway: GW, address: GW, roomIds: [room.id], polls: 4, failed: down ? 4 : 0, down }]);
    },
    async cycles(n, down, temp) { for (let i = 0; i < n; i++) await this.cycle(down, temp); },
  };
}

for (const [name, cycles] of [['30 s', 6], ['2 min', 24]]) {
  test(`a hot room's Critical alarm survives a ${name} gateway outage: no Cleared, still Critical when the gateway answers`, async (t) => {
    const s = setup(t);
    await s.cycles(16 * MIN_CYCLES, false, 33); // 16 min above 32 °C
    assert.equal(s.level('tHigh'), 'critical');
    s.events.length = 0;
    await s.cycles(cycles, true);
    assert.deepEqual(s.events.filter(([change, key]) => change === 'cleared' && key !== 'gateway'), [], 'nothing of the room cleared');
    assert.equal(s.level('tHigh'), 'critical', 'during the outage');
    await s.cycle(false, 33);
    assert.equal(s.level('tHigh'), 'critical', 'once it answers');
  });
}

test('a hot room whose gateway drops for under a minute again and again keeps its alarm and still turns Critical', async (t) => {
  const s = setup(t);
  for (let i = 0; i < 6; i++) { await s.cycles(8, false, 33); await s.cycles(4, true); } // 40 s answering, 20 s not, for 6 min
  await s.cycles(8 * MIN_CYCLES, false, 33);
  assert.equal(s.level('tHigh'), 'critical');
  assert.deepEqual(s.events.filter(([change]) => change === 'cleared'), []);
});

test('a gateway silent one cycle in four hides nothing: the dead aircon and the hot room raise their alarms', async (t) => {
  const s = setup(t, { relay: false, acNeverAnswers: true, crops: false });
  for (let i = 0; i < 30 * MIN_CYCLES; i++) await s.cycle(i % 4 === 0, 30);
  assert.equal(s.level('machine.ac'), 'serious');
  assert.ok(s.level('tHigh'), 'the room above its band');
  assert.equal(s.level('gateway'), null, 'mostly answering: no gateway alarm');
});

test('the gateway alarm: raised when down most of a minute, cleared when it answers in more than three quarters of 10 min; no pair per short return', async (t) => {
  const s = setup(t);
  await s.cycles(2 * MIN_CYCLES, false);
  for (let i = 0; i < 5; i++) { await s.cycles(MIN_CYCLES + 2, true); await s.cycle(false); } // down 70 s, up 5 s, five times
  const raised = s.events.filter(([change, key]) => change === 'raised' && key === 'gateway').length;
  assert.equal(raised, 1, 'one alarm for the whole flapping outage');
  await s.cycles(79, false); // 80 answers in a row (6 min 40 s): over a quarter of the last 10 min still silent
  assert.equal(s.level('gateway'), 'serious', 'not yet mostly answering');
  await s.cycles(20, false); // 100 answers: under a quarter
  assert.equal(s.level('gateway'), null);
  assert.deepEqual(s.events.filter(([change, key]) => key === 'gateway').map(([c]) => c), ['raised', 'cleared']);
});

// ---- the final review (2026-11-12) ----

for (const dead of ['probe', 'aircon']) {
  test(`a gateway back but silent one cycle in 11 holds nothing for long: a dead ${dead} behind it raises its alarm`, async (t) => {
    const s = setup(t, { acNeverAnswers: dead === 'aircon' });
    await s.cycles(3 * MIN_CYCLES, true); // a 3 min outage: the gateway alarm on
    assert.equal(s.level('gateway'), 'serious');
    for (let i = 0; i < 20 * MIN_CYCLES; i++) {
      const down = i % 11 === 10;
      if (dead === 'probe' && !down) {
        // the gateway answers, the T/RH probe does not
        await s.cycleWith({ down: false, trh: { ok: false, error: 'timeout' } });
      } else await s.cycle(down);
    }
    assert.equal(s.level('gateway'), null, 'mostly answering: the gateway alarm cleared');
    assert.equal(s.level(dead === 'probe' ? 'sensorTrh' : 'machine.ac'), 'serious');
  });
}

test('after a long outage the counts start again from the first reading back: Warning after its 5 min, Serious and Critical after theirs', async (t) => {
  const s = setup(t);
  await s.cycles(2 * MIN_CYCLES, false);
  await s.cycle(false, 33); // one reading above the hot limit
  await s.cycles(120 * MIN_CYCLES, true); // 2 h of outage
  s.events.length = 0;
  await s.cycles(2, false, 33);
  assert.deepEqual(s.events.filter(([, key]) => key === 'tHigh'), [], 'nothing at once after the outage');
  await s.cycles(5 * MIN_CYCLES, false, 33);
  assert.equal(s.level('tHigh'), 'warning', 'Warning after its own 5 min');
  await s.cycles(4 * MIN_CYCLES, false, 33);
  assert.equal(s.level('tHigh'), 'warning', 'the 10 min Critical hold counts from the first reading back');
  await s.cycles(2 * MIN_CYCLES, false, 33);
  assert.equal(s.level('tHigh'), 'critical');
  assert.match(s.db.activeAlarms(s.room.id).find((a) => a.key === 'tHigh').text, /for 10 min$/);
});

test('after a long outage a room over its band turns Serious once 30 min out of band were seen, the outage not counted', async (t) => {
  const s = setup(t, { crops: false });
  await s.cycles(MIN_CYCLES, false);
  await s.cycles(6 * MIN_CYCLES, false, 30); // 6 min seen over the band: Warning
  assert.equal(s.level('tHigh'), 'warning');
  await s.cycles(120 * MIN_CYCLES, true); // 2 h not seen
  await s.cycles(22 * MIN_CYCLES, false, 30); // 28 min seen
  assert.equal(s.level('tHigh'), 'warning', 'the 2 h outage does not count');
  await s.cycles(3 * MIN_CYCLES, false, 30); // 31 min seen
  assert.equal(s.level('tHigh'), 'serious');
});

test('after a long outage a probe fault left over from it does not raise an alarm for a reading or two', async (t) => {
  const s = setup(t);
  await s.cycles(2 * MIN_CYCLES, false);
  await s.cycles(120 * MIN_CYCLES, true);
  s.events.length = 0;
  await s.cycles(3 * MIN_CYCLES, false);
  assert.deepEqual(s.events.filter(([change, key]) => change === 'raised' && key !== 'gateway'), []);
});

test('a probe dead from the first reading back raises its fault a minute later', async (t) => {
  const s = setup(t);
  await s.cycles(2 * MIN_CYCLES, false);
  await s.cycles(120 * MIN_CYCLES, true);
  for (let i = 0; i < MIN_CYCLES + 4; i++) await s.cycleWith({ down: false, trh: { ok: false, error: 'timeout' } });
  assert.equal(s.level('sensorTrh'), 'serious');
});

// ---- review #12 (2026-11-12): a long gap shifts the counts by its length, it does not restart them ----
for (const [name, downCycles, upCycles, warnBy, criticalBy] of [
  ['90 s down / 4 min up', 18, 48, 2, 3], // observed 4 min an up period: Warning (5 min) in the 2nd, Critical (10 min) in the 3rd
  ['65 s down / 65 s up', 13, 13, 5, 10], // observed 65 s an up period: Warning in the 5th, Critical in the 10th
]) {
  test(`a hot room behind a gateway out ${name}: the observed time adds up across the outages`, async (t) => {
    const s = setup(t, { relay: false });
    let periods = 0;
    let warned = null;
    let critical = null;
    while (periods < criticalBy + 1) {
      await s.cycles(upCycles, false, 33);
      periods++;
      if (warned === null && s.level('tHigh')) warned = periods;
      if (critical === null && s.level('tHigh') === 'critical') critical = periods;
      await s.cycles(downCycles, true);
    }
    assert.equal(warned, warnBy, 'the up period it turned Warning');
    assert.equal(critical, criticalBy, 'the up period it turned Critical');
    assert.deepEqual(s.events.filter(([change, key]) => change === 'cleared' && key === 'tHigh'), []);
  });
}

test('a gateway out 65 s in every 130 s for an hour is one gateway alarm, not a raise and a Cleared every two minutes', async (t) => {
  const s = setup(t, { relay: false });
  await s.cycles(MIN_CYCLES, false);
  for (let i = 0; i < 28; i++) { await s.cycles(13, true); await s.cycles(13, false); }
  assert.deepEqual(s.events.filter(([, key]) => key === 'gateway').map(([change]) => change), ['raised']);
  await s.cycles(10 * MIN_CYCLES + 1, false); // steady again for ten minutes
  assert.deepEqual(s.events.filter(([, key]) => key === 'gateway').map(([change]) => change), ['raised', 'cleared']);
});

