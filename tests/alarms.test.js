// The alarm evaluation (server/alarms.js, spec 2026-10-19-safety-and-history-design.md section 3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createAlarms } from '../server/alarms.js';

const MIN = 60_000;
const bands = { co2Low: 600, co2High: 750, co2Safety: 1250, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95, exchangeMaxMin: 10 };

// An alarm module on a real database with a clock the test moves. tick(ms, input) evaluates once at that time.
function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 });
  let clock = 1_000_000;
  const alarms = createAlarms({ db, now: () => clock });
  const input = (patch = {}) => ({
    readings: { t: 22, rh: 90, co2: 650 }, bands, faults: { trh: null, co2: null }, cappedInRow: 0, machines: null, ...patch,
  });
  return {
    db, alarms, room,
    input,
    tick(ms, patch) {
      clock += ms;
      alarms.evaluate(room, input(patch));
    },
    keys: () => db.activeAlarms(room.id).map((a) => a.key),
    at: () => clock,
  };
}

const readings = (r) => ({ readings: { t: 22, rh: 90, co2: 650, ...r } });

test('nothing raised for a room in its bands', (t) => {
  const s = setup(t);
  for (let i = 0; i < 20; i++) s.tick(MIN);
  assert.deepEqual(s.db.currentAlarms(), []);
});

test('each process alarm: raised after its delay, with its text, level and threshold', (t) => {
  const cases = [
    ['tHigh', 'warning', { t: 24.3 }, 'Temperature 24.3 °C, above 23 + 1', { t: 24 }],
    ['tLow', 'warning', { t: 19.6 }, 'Temperature 19.6 °C, below 21 − 1', { t: 20 }],
    ['rhLow', 'warning', { rh: 78 }, 'Humidity 78 %, below 85 − 5', { rh: 80 }],
    ['co2High', 'warning', { co2: 880 }, 'CO₂ 880 ppm, above 750 + 100', { co2: 850 }],
  ];
  for (const [key, level, bad, text, edge] of cases) {
    const s = setup(t);
    s.tick(0, readings(edge)); // exactly at the threshold: not an alarm
    s.tick(10 * MIN, readings(edge));
    assert.deepEqual(s.keys(), [], `${key} edge`);
    s.tick(0, readings(bad));
    s.tick(4 * MIN + 59_000, readings(bad));
    assert.deepEqual(s.keys(), [], `${key} before the delay`);
    s.tick(1000, readings(bad));
    assert.deepEqual(s.keys(), [key], `${key} after 5 min`);
    const a = s.db.activeAlarms(s.room.id)[0];
    assert.deepEqual([a.level, a.text, a.raisedAt], [level, text, s.at()]);
  }
});

test('the safety level alarm is critical and waits 60 s', (t) => {
  const s = setup(t);
  s.tick(0, readings({ co2: 1300 }));
  s.tick(59_000, readings({ co2: 1300 }));
  assert.deepEqual(s.keys(), []);
  s.tick(1000, readings({ co2: 1300 }));
  const a = s.db.activeAlarms(s.room.id)[0];
  assert.deepEqual([a.key, a.level, a.text], ['co2Safety', 'critical', 'CO₂ 1300 ppm, at or above the safety level 1250']);
  // exactly at the level counts
  const e = setup(t);
  e.tick(0, readings({ co2: 1250 }));
  e.tick(MIN, readings({ co2: 1250 }));
  assert.deepEqual(e.keys(), ['co2Safety']);
});

test('the high humidity alarm waits 15 min (longer than one air exchange) above the upper limit + 3', (t) => {
  const s = setup(t);
  s.tick(0, readings({ rh: 98 })); // exactly at 95 + 3: not an alarm
  s.tick(20 * MIN, readings({ rh: 98 }));
  assert.deepEqual(s.keys(), []);
  s.tick(0, readings({ rh: 99.5 }));
  s.tick(14 * MIN + 59_000, readings({ rh: 99.5 }));
  assert.deepEqual(s.keys(), [], 'a 10 min exchange that wets the room is not an alarm');
  s.tick(1000, readings({ rh: 99.5 }));
  const a = s.db.activeAlarms(s.room.id)[0];
  assert.deepEqual([a.key, a.level, a.text], ['rhHigh', 'warning', 'Humidity 99.5 %, above 95 + 3']);
  s.tick(5000, readings({ rh: 97.1 }));
  assert.deepEqual(s.keys(), ['rhHigh'], 'stays above 95 + 2');
  s.tick(5000, readings({ rh: 97 }));
  assert.deepEqual(s.keys(), [], 'clears at 95 + 2');
});

test('a condition that does not hold for the whole delay gives no alarm', (t) => {
  const s = setup(t);
  s.tick(0, readings({ t: 25 }));
  s.tick(4 * MIN, readings({ t: 25 }));
  s.tick(10_000, readings({ t: 22 })); // back in the band: the count is dropped
  s.tick(10_000, readings({ t: 25 }));
  s.tick(4 * MIN, readings({ t: 25 }));
  assert.deepEqual(s.keys(), []);
  s.tick(MIN, readings({ t: 25 }));
  assert.deepEqual(s.keys(), ['tHigh']);
});

test('clears with hysteresis, at once', (t) => {
  const cases = [
    ['tHigh', { t: 25 }, { t: 23.9 }, { t: 23.8 }],
    ['tLow', { t: 19 }, { t: 20.1 }, { t: 20.2 }],
    ['rhLow', { rh: 70 }, { rh: 80.9 }, { rh: 81 }],
    ['co2High', { co2: 900 }, { co2: 831 }, { co2: 830 }],
    ['co2Safety', { co2: 1300 }, { co2: 1230 }, { co2: 1229 }],
  ];
  for (const [key, bad, between, clear] of cases) {
    const s = setup(t);
    s.tick(0, readings(bad));
    s.tick(key === 'co2Safety' ? MIN : 5 * MIN, readings(bad)); // the safety level alarm waits 60 s (and 1300 is no co2High yet)
    assert.deepEqual(s.keys(), [key], key);
    s.tick(5000, readings(between));
    assert.deepEqual(s.keys(), [key], `${key} stays while between the limits`);
    s.tick(5000, readings(clear));
    assert.deepEqual(s.keys(), [], `${key} clears`);
    assert.equal(s.db.currentAlarms(s.room.id)[0].clearedAt, s.at());
  }
});

test('no alarm from a bad sensor: a missing value stops the count and keeps an active alarm', (t) => {
  const s = setup(t);
  s.tick(0, readings({ co2: 900 }));
  s.tick(4 * MIN, readings({ co2: 900 }));
  s.tick(10_000, readings({ co2: null })); // sensor not usable: the count is dropped
  s.tick(2 * MIN, readings({ co2: 900 }));
  assert.deepEqual(s.keys(), []);
  s.tick(5 * MIN, readings({ co2: 900 }));
  assert.deepEqual(s.keys(), ['co2High']);
  s.tick(MIN, readings({ co2: null, t: null }));
  assert.deepEqual(s.keys(), ['co2High'], 'an active alarm is not cleared by a missing reading');
  const t2 = setup(t);
  for (let i = 0; i < 20; i++) t2.tick(MIN, readings({ t: null, rh: null, co2: null }));
  assert.deepEqual(t2.keys(), []);
});

test('sensor fault alarms: serious, at once, with the fault text; cleared when the fault ends', (t) => {
  const s = setup(t);
  s.tick(5000, { faults: { trh: 'value does not change (frozen)', co2: null } });
  let a = s.db.activeAlarms(s.room.id);
  assert.deepEqual(a.map((x) => [x.key, x.level, x.text]), [['sensorTrh', 'serious', 'T/RH probe fault: value does not change (frozen)']]);
  s.tick(5000, { faults: { trh: 'value does not change (frozen)', co2: 'no reading' } });
  assert.deepEqual(s.keys(), ['sensorTrh', 'sensorCo2']);
  assert.equal(s.db.activeAlarms(s.room.id)[1].text, 'CO₂ sensor fault: no reading');
  s.tick(5000, { faults: { trh: null, co2: 'no reading' } });
  assert.deepEqual(s.keys(), ['sensorCo2']);
});

test('air exchange too small: raised at 3 in a row, cleared when the count is back to 0', (t) => {
  const s = setup(t);
  s.tick(5000, { cappedInRow: 2 });
  assert.deepEqual(s.keys(), []);
  s.tick(5000, { cappedInRow: 3 });
  const a = s.db.activeAlarms(s.room.id)[0];
  assert.deepEqual([a.key, a.level, a.text], ['exchangeTooSmall', 'warning',
    'Air exchange too small: 3 exchanges in a row stopped at the 10 min limit before CO₂ reached 600 ppm']);
  s.tick(5000, { cappedInRow: 4 });
  assert.equal(s.db.activeAlarms(s.room.id).length, 1);
  s.tick(5000, { cappedInRow: 0 });
  assert.deepEqual(s.keys(), []);
});

function machineView(overrides = {}, ac = {}) {
  const relay = ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier'].map((key) => ({ key, status: overrides[key] ?? 'on' }));
  return { relay: { machines: relay }, ac: { status: 'on', errorCode: 0, ...ac } };
}

test('machine alarms: serious after 60 s of a bad status, cleared by any other status', (t) => {
  const cases = [
    ['exhaust', 'not-running', 'Exhaust fan: not running (switch on, no current)'],
    ['intake', 'not-following', 'Intake fan: not following its command'],
    ['circulation', 'running-while-off', 'Circulation fan: running while switched off'],
    ['humidifier', 'no-answer', 'Humidifier: no answer from the relay module'],
    ['dehumidifier', 'not-running', 'Dehumidifier: not running (switch on, no current)'],
  ];
  for (const [key, status, text] of cases) {
    const s = setup(t);
    s.tick(0, { machines: machineView({ [key]: status }) });
    s.tick(59_000, { machines: machineView({ [key]: status }) });
    assert.deepEqual(s.keys(), [], `${key} before 60 s`);
    s.tick(1000, { machines: machineView({ [key]: status }) });
    const a = s.db.activeAlarms(s.room.id)[0];
    assert.deepEqual([a.key, a.level, a.text], [`machine.${key}`, 'serious', text]);
    s.tick(5000, { machines: machineView({ [key]: 'switching' }) });
    assert.deepEqual(s.keys(), [], `${key} cleared`);
  }
  const ac = setup(t);
  ac.tick(0, { machines: machineView({}, { status: 'fault', errorCode: 7 }) });
  ac.tick(MIN, { machines: machineView({}, { status: 'fault', errorCode: 7 }) });
  assert.equal(ac.db.activeAlarms(ac.room.id)[0].text, 'Aircon: fault (error code 7)');
  assert.equal(ac.db.activeAlarms(ac.room.id)[0].key, 'machine.ac');
});

test('machine alarms: a short bad status, not-wired and no-data give nothing', (t) => {
  const s = setup(t);
  s.tick(0, { machines: machineView({ exhaust: 'not-running' }) });
  s.tick(30_000, { machines: machineView({ exhaust: 'not-running' }) });
  s.tick(1000, { machines: machineView() });
  s.tick(40_000, { machines: machineView({ exhaust: 'not-running' }) });
  s.tick(30_000, { machines: machineView({ exhaust: 'not-running' }) });
  assert.deepEqual(s.keys(), [], 'the count started again');
  for (const status of ['not-wired', 'no-data']) {
    s.tick(0, { machines: machineView({ intake: status }, { status }) });
    s.tick(5 * MIN, { machines: machineView({ intake: status }, { status }) });
  }
  assert.deepEqual(s.keys(), []);
});

test('machine alarms: a dehumidifier that is not fitted raises nothing and clears an alarm it had', (t) => {
  const s = setup(t);
  s.tick(0, { machines: machineView({ dehumidifier: 'no-answer' }) });
  s.tick(MIN, { machines: machineView({ dehumidifier: 'no-answer' }) });
  assert.deepEqual(s.keys(), ['machine.dehumidifier']);
  s.tick(1000, { machines: machineView({ dehumidifier: 'not-fitted' }) });
  assert.deepEqual(s.keys(), []);
  s.tick(0, { machines: machineView({ dehumidifier: 'not-fitted' }) });
  s.tick(5 * MIN, { machines: machineView({ dehumidifier: 'not-fitted' }) });
  assert.deepEqual(s.keys(), []);
});

test('one active alarm per key: the text is fixed at raise time and a later evaluation adds none', (t) => {
  const s = setup(t);
  s.tick(0, readings({ t: 25 }));
  s.tick(5 * MIN, readings({ t: 25 }));
  s.tick(5 * MIN, readings({ t: 27 }));
  assert.equal(s.db.activeAlarms(s.room.id).length, 1);
  assert.equal(s.db.currentAlarms()[0].text, 'Temperature 25 °C, above 23 + 1');
});

test('after a clear the same condition can raise a new alarm; the old one stays until acknowledged', (t) => {
  const s = setup(t);
  s.tick(0, readings({ t: 25 }));
  s.tick(5 * MIN, readings({ t: 25 }));
  s.tick(5000, readings({ t: 22 }));
  s.tick(0, readings({ t: 25 }));
  s.tick(5 * MIN, readings({ t: 26 }));
  const list = s.db.roomAlarms(s.room.id);
  assert.equal(list.history.length, 2);
  assert.equal(list.current.length, 2, 'the cleared one is not acknowledged yet');
  s.db.ackRoomAlarms(s.room.id, s.at());
  assert.equal(s.db.currentAlarms(s.room.id).length, 1, 'cleared and acknowledged leaves the current list');
});

test('forget drops the delay counts of a room', (t) => {
  const s = setup(t);
  s.tick(0, readings({ t: 25 }));
  s.tick(4 * MIN, readings({ t: 25 }));
  s.alarms.forget(s.room.id);
  s.tick(2 * MIN, readings({ t: 25 }));
  assert.deepEqual(s.keys(), []);
});

test('a faulty or unwired sensor clears its process alarms and drops the delay count; others stay', (t) => {
  const s = setup(t);
  const hot = { t: 24.5, rh: 70, co2: 900 };
  for (let i = 0; i < 6; i++) s.tick(MIN, { readings: hot });
  assert.deepEqual(s.keys().sort(), ['co2High', 'rhLow', 'tHigh']);
  s.tick(MIN, { readings: { ...hot, t: null }, clear: { t: true } });
  assert.deepEqual(s.keys().sort(), ['co2High', 'rhLow']);
  s.tick(MIN, { readings: { ...hot, rh: null, co2: null }, clear: { rh: true, co2: true } });
  assert.deepEqual(s.keys(), []);
  s.tick(MIN, { readings: hot });
  assert.deepEqual(s.keys(), []);
  for (let i = 0; i < 5; i++) s.tick(MIN, { readings: hot });
  assert.deepEqual(s.keys().sort(), ['co2High', 'rhLow', 'tHigh']);
});

test('a missing reading (not faulty) keeps an active process alarm', (t) => {
  const s = setup(t);
  for (let i = 0; i < 6; i++) s.tick(MIN, readings({ t: 24.5 }));
  assert.deepEqual(s.keys(), ['tHigh']);
  s.tick(MIN, readings({ t: null }));
  assert.deepEqual(s.keys(), ['tHigh']);
});

// ---- the humidifier too small ----

const humidifier = (status) => ({ relay: { machines: [{ key: 'humidifier', status }] }, ac: null });

test('humidifier too small: running 30 min with the humidity still below the band', (t) => {
  const s = setup(t);
  const low = { ...readings({ rh: 80 }), machines: humidifier('on') };
  for (let i = 0; i <= 29; i++) s.tick(MIN, low);
  assert.deepEqual(s.keys(), [], 'not before 30 min');
  s.tick(MIN, low);
  assert.deepEqual(s.keys(), ['humidifierTooSmall']);
  const [alarm] = s.db.activeAlarms(s.room.id);
  assert.equal(alarm.level, 'warning');
  assert.equal(alarm.text, 'Humidifier too small: running 30 min and the humidity is still 80 %, below 85');
  s.tick(MIN, { ...readings({ rh: 85 }), machines: humidifier('on') });
  assert.deepEqual(s.keys(), [], 'cleared at the lower limit');
});

test('humidifier too small: the count stops when the humidifier is off or the humidity reaches the band', (t) => {
  const s = setup(t);
  const low = { ...readings({ rh: 80 }), machines: humidifier('on') };
  for (let i = 0; i < 20; i++) s.tick(MIN, low);
  s.tick(MIN, { ...readings({ rh: 80 }), machines: humidifier('off') });
  for (let i = 0; i < 20; i++) s.tick(MIN, low);
  assert.deepEqual(s.keys(), []);
  s.tick(MIN, { ...readings({ rh: 86 }), machines: humidifier('on') });
  for (let i = 0; i < 20; i++) s.tick(MIN, low);
  assert.deepEqual(s.keys(), []);
  for (let i = 0; i < 11; i++) s.tick(MIN, low);
  assert.deepEqual(s.keys(), ['humidifierTooSmall']);
  s.tick(MIN, { ...readings({ rh: 80 }), machines: humidifier('off') });
  assert.deepEqual(s.keys(), [], 'cleared when the humidifier stops');
});

test('humidifier too small: not from a faulty humidity probe or a humidifier that is not running', (t) => {
  const s = setup(t);
  for (let i = 0; i < 40; i++) s.tick(MIN, { ...readings({ rh: 80 }), machines: humidifier('not-running') });
  assert.ok(!s.keys().includes('humidifierTooSmall'));
  const t2 = setup(t);
  for (let i = 0; i < 40; i++) t2.tick(MIN, { ...readings({ rh: 80 }), machines: humidifier('on'), clear: { rh: true } });
  assert.deepEqual(t2.keys(), []);
});
