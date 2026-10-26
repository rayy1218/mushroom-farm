// Review fixes of iteration 15 (lights): the relay poll size, unfitting a running machine, the DST-safe window, a finished crop,
// the aircon sizing, the device's default and the pages that show the schedule only with lights fitted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createMachines } from '../server/machines.js';
import { createController } from '../server/controller.js';
import { createPoller } from '../server/poller.js';
import { createSensors } from '../device/sensors.js';
import { createModbusServer } from '../device/modbus-server.js';
import { createSims, PARAMS } from '../device/sim-store.js';
import { PROGRAM_DEFAULTS } from '../server/program.js';
import { estimate } from '../server/sizing.js';
import { lightsNow, localAt, runAt, lightSummary, lightShort, normaliseClock } from '../web/light-math.js';
import { checkCropForm, formFromData } from '../web/crop-math.js';
import { summaryLines, initialState } from '../web/simulate-math.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
const at = (h, m = 0, day = 26) => new Date(2026, 9, day, h, m).getTime();
const fruiting = (over = {}) => ({ ...PROGRAM_DEFAULTS, crops: [{ crop: 'oyster', blocks: 500 }], stage: 'fruiting', ...over });
const src = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

// ---- 1: the relay is read with the outputs it needs ----

test('db: a wired relay says how many outputs to read: 4, 5 with a dehumidifier, 6 with lights', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const a = db.createRoom({ ...ROOM, relayAddress: 3, acAddress: 4 }).id;
  const b = db.createRoom({ ...ROOM, name: 'B', relayAddress: 5, dehumidifier: true }).id;
  const c = db.createRoom({ ...ROOM, name: 'C', relayAddress: 6, lights: true }).id;
  const d = db.createRoom({ ...ROOM, name: 'D', relayAddress: 7, lights: true, dehumidifier: true }).id;
  const relays = db.listWiredMachines().filter((m) => m.kind === 'relay');
  assert.deepEqual(relays.map((m) => [m.roomId, m.outputs]), [[a, 4], [b, 5], [c, 6], [d, 6]]);
  assert.equal(db.listWiredMachines().find((m) => m.kind === 'ac').outputs, undefined);
});

test('poller: a relay is read with its outputs (fn 1 and fn 2); without the number, all six', async () => {
  const calls = [];
  const client = { async readBits(unit, fn, start, qty) { calls.push([unit, fn, start, qty]); return Array(qty).fill(false); }, async readRegisters() { return [0, 0, 0, 0]; } };
  const fake = (machines) => ({
    listWiredSensors: () => [], listWiredMachines: () => machines, listMeters: () => [], listFilterSensors: () => [], outdoorAddress: () => null, addReading() {},
  });
  await createPoller({ db: fake([{ roomId: 1, kind: 'relay', address: 10, outputs: 4 }]), client }).cycle();
  assert.deepEqual(calls, [[10, 1, 0, 4], [10, 2, 0, 4]]);
  calls.length = 0;
  await createPoller({ db: fake([{ roomId: 1, kind: 'relay', address: 10 }]), client }).cycle();
  assert.deepEqual(calls, [[10, 1, 0, 6], [10, 2, 0, 6]]);
});

test('machines: an output the last poll did not read (just fitted) is no-data', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const id = db.createRoom({ ...ROOM, relayAddress: 3, lights: true }).id;
  const polls = [{ at: 1, ok: true, coils: [false, false, true, false, false], inputs: [false, false, true, false, false] }];
  const machines = createMachines({ db, client: {}, poller: { machineState: () => ({ relay: { address: 3, polls }, ac: { address: null, polls: [] } }) }, now: () => 1_000_000 });
  const lights = machines.get(id).relay.machines.find((m) => m.key === 'lights');
  assert.deepEqual(lights, { key: 'lights', commanded: false, reported: null, running: null, status: 'no-data' });
  assert.equal(machines.get(id).relay.machines.find((m) => m.key === 'circulation').status, 'not-following');
});

test('device: a relay answers start 0 with 1 to 6 coils or inputs, like real hardware', async (t) => {
  const sensors = createSensors({ spinUpMs: 0 });
  sensors.add({ address: 10, kind: 'relay' });
  sensors.writeCoil(10, 0, true);
  sensors.writeCoil(10, 5, true);
  const server = createModbusServer(sensors);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { createModbusClient } = await import('../server/modbus.js');
  const client = createModbusClient({ host: '127.0.0.1', port: server.address().port });
  t.after(() => { client.close(); return new Promise((resolve) => server.close(resolve)); });
  assert.deepEqual(await client.readBits(10, 1, 0, 4), [true, false, false, false]);
  assert.deepEqual(await client.readBits(10, 1, 0, 6), [true, false, false, false, false, true]);
  assert.deepEqual(await client.readBits(10, 2, 0, 1), [true]);
  await assert.rejects(client.readBits(10, 1, 0, 7));
  await assert.rejects(client.readBits(10, 1, 1, 4));
});

// ---- 3: unfitting a running machine ----

test('API: running lights (or a dehumidifier) taken out: the room is saved first, then the off write, which a held send cannot undo', async (t) => {
  const db = openDb(':memory:');
  const writes = [];
  let release = null;
  const client = {
    async writeCoil(...a) { writes.push(a); if (release === null) await new Promise((r) => { release = r; }); },
    async writeRegisters() {},
  };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, client, poller });
  const controller = createController({ db, machines, log: (e) => { throw e; } });
  const server = createApp(db, { machines, controller });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const key of ['lights', 'dehumidifier']) {
    writes.length = 0;
    release = () => {};
    const id = db.createRoom({ ...ROOM, name: key, relayAddress: key === 'lights' ? 3 : 4, [key]: true }).id;
    await machines.command(id, key, { on: true });
    release = null;
    const put = fetch(`${base}/api/rooms/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...ROOM, name: key, relayAddress: key === 'lights' ? 3 : 4, [key]: false }) });
    for (let i = 0; release === null && i < 400; i++) await new Promise((r) => setTimeout(r, 5));
    assert.notEqual(release, null, 'the off write was sent');
    // the off write is held: the room already has none, so nothing (manual or automatic) may switch it on again
    const fittedWhileHeld = db.getRoom(id)[key];
    const again = await machines.command(id, key, { on: true }, { bypassAuto: true }).then(() => null, (err) => err);
    release();
    const res = await put;
    assert.equal(fittedWhileHeld, false);
    assert.equal(again?.status, 400);
    assert.equal(res.status, 200);
    assert.deepEqual(writes.at(-1), [key === 'lights' ? 3 : 4, key === 'lights' ? 5 : 4, false]);
    assert.equal(db.getCommands(id).relay[key], false);
  }
});

// ---- 4: the window is built on the day's clock ----

test('light-math: the window starts at the local time of day (setHours), the run clock at its own midnight', () => {
  assert.equal(localAt(at(12), 7, 0), at(7));
  assert.equal(localAt(at(12), 7, 0, -1), at(7, 0, 25));
  assert.equal(localAt(at(12), 31, 0), at(7, 0, 27), 'past midnight');
  assert.equal(runAt(86_400_000 + 5, 7, 30), 86_400_000 + 7.5 * 3_600_000);
  assert.equal(runAt(5, 20, 0, -1), -4 * 3_600_000);
  // a custom clock is used for the window
  const program = fruiting();
  assert.equal(lightsNow(program, 8 * 3_600_000, runAt).on, true);
  assert.equal(lightsNow(program, 20 * 3_600_000, runAt).on, false);
  const readme = src('README.md');
  assert.match(readme, /time zone[^\n]*Asia\/Kuala_Lumpur/i);
});

// ---- 5: a finished crop ----

test('a done program: lights off, "crop finished"', () => {
  const done = fruiting({ stage: 'rest', done: true, lightHours: { ...PROGRAM_DEFAULTS.lightHours, rest: 12 } });
  assert.deepEqual(lightsNow(done, at(12)), { on: false, reason: 'Lights off: crop finished' });
  assert.equal(lightSummary(done), 'Off: crop finished');
  assert.equal(lightShort(done), 'Crop finished');
});

// ---- 6: sizing ----

test('sizing: fitted lights add their power to the aircon heat', () => {
  const input = { physics: { wallUA: 30, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 100 }, crops: [{ crop: 'lionsmane', blocks: 950 }], farmType: 'ready', stage: 'fruiting', target: 95 };
  const ctx = (ratings) => ({ volume: 32.57, ratings: { intakeW: 60, acInputW: 1000, ...ratings }, control: { exchangeMaxMin: 10 }, program: null, prices: null });
  const plain = estimate(input, ctx({}));
  const lit = estimate(input, ctx({ lights: true, lightsW: 500 }));
  const watts = (e) => Number(/About (\d+) W/.exec(e.why.acBTU)[1]);
  assert.ok(Math.abs(watts(lit) - watts(plain) - 650) <= 1, `${watts(lit)} vs ${watts(plain)}`); // 500 W, 30 % over
  assert.match(lit.why.acBTU, /walls, sun, blocks, fan air, lights/);
  assert.doesNotMatch(plain.why.acBTU, /lights/);
  assert.equal(estimate(input, ctx({ lights: false, lightsW: 500 })).why.acBTU, plain.why.acBTU);
});

// ---- 7: the device's default ----

test('device: a simulated room has no lights power unless set (0, like the dehumidifier)', () => {
  assert.equal(PARAMS.lightsW.value, 0);
  assert.equal(createSims({ sensors: createSensors({}) }).add({ name: 'R' }).lightsW, 0);
});

// ---- 8: the pages ----

test('Lights from: "7:00" and "0700" become 07:00 before the check', () => {
  for (const [given, clock] of [['7:00', '07:00'], ['0700', '07:00'], ['07:00', '07:00'], [' 21:30 ', '21:30'], ['2130', '21:30'], ['7', '7'], ['24:00', '24:00'], ['', '']]) {
    assert.equal(normaliseClock(given), clock, given);
  }
  const crop = fruiting({ farmType: 'ready', flushes: 4, rampH: 4, autoAdvance: true });
  const f = formFromData(crop);
  const ok = checkCropForm({ ...f, lightStart: '0630' });
  assert.deepEqual([ok.errors.lightStart, ok.values.lightStart], [undefined, '06:30']);
  assert.equal(checkCropForm({ ...f, lightStart: '7' }).errors.lightStart, 'Light start must be a time like 07:00');
});

test('Crop tab: the Light rows, the pencil field and Lights from only with lights fitted', () => {
  const card = src('web/crop-card.js');
  assert.match(card, /createCropCard\(host, \{ roomId, onChange, onData, onOffline, onGone, getRoom \}\)/);
  assert.match(card, /const lit = \(\) => getRoom\?\.\(\)\?\.lights === true;/);
  assert.match(card, /stageTargets\(c\.crops, sec\.stage, lit\(\) \? lightOf\(c, sec\.stage\) : null\)/);
  assert.match(card, /light\.closest\('\.field'\)\.hidden = !last\.lightHours \|\| !lit\(\);/);
  assert.match(card, /lightField\.hidden = typeof c\.lightStart !== 'string' \|\| !lit\(\);/);
  assert.match(card, /setLights\(fitted\)/);
  const page = src('web/room-detail.js');
  assert.match(page, /getRoom: \(\) => room,\n\s*onChange: \(\) => \{ if \(alive\(\)\) load\(\); \},/);
  assert.match(page, /cropCard\?\.setLights\(room\?\.lights === true\)/);
});

test('room dialog: Dehumidifier fitted and Lights fitted both in the Machines fieldset', () => {
  const html = src('web/index.html');
  const machines = html.slice(html.indexOf('<legend>Machines'), html.indexOf('<legend>Power and water'));
  assert.match(machines, /id="f-dehumidifier"[^>]*> Dehumidifier fitted/);
  assert.match(machines, /id="f-lights"[^>]*> Lights fitted/);
  const power = html.slice(html.indexOf('<legend>Power and water'), html.indexOf('<legend>Intake filter'));
  assert.doesNotMatch(power, /type="checkbox"/);
  assert.match(power, /id="dehumidifier-fields"/);
  assert.match(power, /id="lights-fields"/);
});

test('simulate dialog: the machines summary mentions the lights when the room has them', () => {
  const room = { id: 1, name: 'R', length: 6, width: 4, height: 2.5, volume: 60, humidifierLH: 2, lights: true, lightsW: 150 };
  const state = initialState({ room });
  const machinesLine = (r) => summaryLines(state, r).find((l) => l.label === 'Machines').text;
  assert.match(machinesLine(room), /, lights 150 W on the room's schedule$/);
  assert.doesNotMatch(machinesLine({ ...room, lights: false }), /lights/);
});
