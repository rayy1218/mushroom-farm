import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readoutStatus, fromRoom, fromSim, isNight, view, describe } from '../web/mimic-math.js';

// ---- readout chips ----

test('readoutStatus covers every sensor state and band position', () => {
  assert.deepEqual(readoutStatus(undefined, 1, 0, 2), { lvl: 'none', icon: '', text: 'Not wired' });
  assert.equal(readoutStatus({ status: 'not-wired' }, null).text, 'Not wired');
  assert.equal(readoutStatus({ status: 'no-data' }, null).text, 'No data yet');
  assert.deepEqual(readoutStatus({ status: 'timeout' }, 20, 18, 25), { lvl: 'serious', icon: '!', text: 'Timeout' });
  assert.equal(readoutStatus({ status: 'offline' }, 20, 18, 25).text, 'Offline');
  assert.equal(readoutStatus({ status: 'online' }, null, 18, 25).text, 'No data yet');
  assert.equal(readoutStatus({ status: 'online' }, 20).text, 'Online');
  assert.deepEqual(readoutStatus({ status: 'online' }, 20, 18, 25), { lvl: 'good', icon: '✓', text: 'In band' });
  assert.deepEqual(readoutStatus({ status: 'online' }, 17, 18, 25), { lvl: 'warning', icon: '▼', text: 'Below band' });
  assert.deepEqual(readoutStatus({ status: 'online' }, 26, 18, 25), { lvl: 'warning', icon: '▲', text: 'Above band' });
  assert.deepEqual(readoutStatus({ status: 'online' }, 5000, 800, 1200, 5000), { lvl: 'critical', icon: '▲', text: 'Safety level' });
});

// ---- the room page ----

const relay = (over = {}) => ({ address: 2, machines: ['intake', 'exhaust', 'circulation', 'humidifier'].map((key) => ({ key, commanded: false, reported: false, running: false, status: 'off', ...over[key] })) });
const ac = (over = {}) => ({ address: 3, commanded: {}, reported: { power: true, mode: 'cool', setpoint: 23.5, fan: 'auto' }, roomT: 24, errorCode: 0, status: 'on', ...over });
const sensors = {
  trh: { status: 'online', lastOk: { t: 24.1, rh: 86.4, at: 1 } },
  co2: { status: 'online', lastOk: { co2: 1234.4, at: 1 } },
};
const control = { auto: true, exchange: true, tLow: 18, tHigh: 25, rhLow: 80, rhHigh: 90, co2Low: 800, co2High: 1200, co2Safety: 3000 };

test('fromRoom with nothing never throws and draws "no data"', () => {
  for (const input of [undefined, {}, { room: null, sensors: null, machines: null, control: null }, { sensors: { trh: undefined, co2: undefined }, machines: { relay: {}, ac: {} } }]) {
    const d = fromRoom(input);
    assert.equal(d.T, null);
    assert.equal(d.out, null);
    assert.equal(d.units.ac.known, false);
    assert.equal(d.units.intake.known, false);
    assert.equal(d.note, '');
    const v = view(d);
    assert.equal(v.readouts.T.val, '--');
    assert.match(describe(v), /Temperature no data/);
  }
});

test('fromRoom: readings, bands and the control note', () => {
  const d = fromRoom({ room: { name: 'Fruiting 1' }, sensors, machines: { relay: relay(), ac: ac() }, control });
  assert.equal(d.name, 'Fruiting 1');
  assert.deepEqual([d.T, d.RH, d.CO2], [24.1, 86.4, 1234.4]);
  assert.equal(d.status.T.text, 'In band');
  assert.equal(d.status.RH.text, 'In band');
  assert.equal(d.status.CO2.text, 'Exchange running', 'CO₂ in the air exchange\'s words');
  assert.equal(d.note, 'Automatic control · air exchange on');
  assert.equal(fromRoom({ control: { auto: true, exchange: false } }).note, 'Automatic control on');
  assert.equal(fromRoom({ control: { auto: false } }).note, 'Automatic control off');
  assert.equal(d.out, null);
  assert.equal(d.night, false);
  assert.ok(d.co2Rate > 0 && d.co2Rate < 1);
});

test('fromRoom: a timed-out sensor keeps its last value with a warning chip', () => {
  const d = fromRoom({ sensors: { trh: { status: 'timeout', lastOk: { t: 20, rh: 80 } }, co2: { status: 'no-data', lastOk: null } }, control });
  assert.equal(d.T, 20);
  assert.equal(d.status.T.text, 'Timeout');
  assert.equal(d.CO2, null);
  assert.equal(d.co2Rate, 0);
});

test('fromRoom: every relay status', () => {
  const states = {
    on: { status: 'on', reported: true, running: true },
    off: { status: 'off' },
    switching: { status: 'switching', commanded: true, reported: false },
    'not-following': { status: 'not-following', commanded: true, reported: false },
    'not-running': { status: 'not-running', commanded: true, reported: true, running: false },
    'running-while-off': { status: 'running-while-off', commanded: false, reported: false, running: true },
    'not-wired': { status: 'not-wired', reported: null, running: null },
    'no-data': { status: 'no-data', reported: null, running: null },
    'no-answer': { status: 'no-answer', reported: null, running: null },
  };
  const expected = { on: [true, true, false, 'On'], off: [true, false, false, 'Off'], switching: [true, false, false, 'Switching…'],
    'not-following': [true, false, true, 'Not following'], 'not-running': [true, false, true, 'Not running'],
    'running-while-off': [true, true, true, 'Running while off'], 'not-wired': [false, false, false, 'Not wired'],
    'no-data': [false, false, false, 'No data yet'], 'no-answer': [false, false, false, 'No answer'] };
  for (const [name, over] of Object.entries(states)) {
    const u = fromRoom({ machines: { relay: relay({ intake: over }), ac: ac() } }).units.intake;
    assert.deepEqual([u.known, u.on, u.warn, u.state], expected[name], name);
  }
  // running unknown: the coil decides
  const u = fromRoom({ machines: { relay: relay({ humidifier: { status: 'on', reported: true, running: null } }) } }).units.hu;
  assert.equal(u.on, true);
  // the four machines land on their own units
  const d = fromRoom({ machines: { relay: relay({ circulation: { status: 'on', reported: true, running: true } }) } });
  assert.deepEqual([d.units.intake.on, d.units.exhaust.on, d.units.circ.on, d.units.hu.on], [false, false, true, false]);
});

test('fromRoom: aircon modes, off, faults and missing data', () => {
  const unit = (a) => fromRoom({ machines: { ac: a } }).units.ac;
  let u = unit(ac());
  assert.deepEqual([u.on, u.mode, u.state, u.sub], [true, 'cool', 'Cool 23.5 °C', 'fan Auto']);
  assert.equal(u.level, 0.6);
  u = unit(ac({ reported: { power: true, mode: 'heat', setpoint: 20, fan: 'high' } }));
  assert.deepEqual([u.mode, u.state, u.sub], ['heat', 'Heat 20.0 °C', 'fan High']);
  u = unit(ac({ reported: { power: true, mode: 'dry', setpoint: 22, fan: 'low' } }));
  assert.equal(u.mode, 'dry');
  u = unit(ac({ reported: { power: true, mode: 'fan', setpoint: 22, fan: 'low' } }));
  assert.deepEqual([u.mode, u.level], ['fan', 0.3]);
  u = unit(ac({ reported: { power: false, mode: 'cool', setpoint: 22, fan: 'low' }, status: 'off' }));
  assert.deepEqual([u.on, u.mode, u.state, u.level], [false, null, 'Off', 0]);
  u = unit(ac({ status: 'fault', errorCode: 7 }));
  assert.deepEqual([u.state, u.warn], ['Fault (code 7)', true]);
  assert.equal(unit(ac({ status: 'fault', errorCode: 0 })).state, 'Fault');
  u = unit(ac({ status: 'not-following' }));
  assert.deepEqual([u.sub, u.warn], ['not following the farm', true]);
  for (const [status, word] of [['not-wired', 'Not wired'], ['no-data', 'No data yet'], ['no-answer', 'No answer']]) {
    u = unit({ status, reported: null });
    assert.deepEqual([u.known, u.state], [false, word], status);
  }
  assert.equal(unit({ status: 'on', reported: null }).known, false); // a status without values
  assert.equal(unit(undefined).state, 'No data');
});

// ---- view and words ----

test('view is null-safe and flags the compressor, air flow and levels', () => {
  const v0 = view(undefined);
  assert.equal(v0.sky, 'Day');
  assert.equal(v0.outLine, 'No outdoor sensor');
  assert.equal(v0.hasOut, false);
  assert.equal(v0.units.ac.state, 'No data');
  assert.equal(v0.acFlow, 0);
  assert.equal(v0.airOn, false);
  assert.equal(v0.capScale, 0);
  const d = fromRoom({ sensors, control, machines: { relay: relay({ exhaust: { status: 'on', reported: true, running: true } }), ac: ac() } });
  const v = view(d);
  assert.equal(v.comp, true);
  assert.ok(v.acFlow > 0.35);
  assert.equal(v.airOn, true);
  assert.equal(v.readouts.CO2.val, '1,234 ppm');
  assert.equal(v.readouts.T.val, '24.1 °C');
  assert.equal(v.readouts.RH.val, '86 % RH');
  assert.equal(v.readouts.T.ico, '✓');
  const fanOnly = view(fromRoom({ machines: { ac: ac({ reported: { power: true, mode: 'fan', setpoint: 22, fan: 'auto' } }) } }));
  assert.equal(fanOnly.comp, false);
  assert.equal(fanOnly.acFlow, 0.2);
});

test('describe says the state in words', () => {
  const text = describe(view(fromRoom({ sensors, control, machines: { relay: relay({ intake: { status: 'on', reported: true, running: true } }), ac: ac() } })));
  assert.match(text, /Temperature 24\.1 °C \(in band\)/);
  assert.match(text, /CO₂ 1,234 ppm \(exchange running\)/);
  assert.match(text, /Aircon cool 23\.5 °C, fan Auto/);
  assert.match(text, /Intake fan on/);
  assert.match(text, /Exhaust fan off/);
  assert.match(text, /No outdoor sensor/);
  assert.match(text, /Automatic control · air exchange on\./);
});

// ---- the device's simulated room ----

test('isNight: 19:00 to 07:00', () => {
  const at = (h, m = 0) => h * 3600 + m * 60;
  assert.equal(isNight(at(6, 59)), true);
  assert.equal(isNight(at(7)), false);
  assert.equal(isNight(at(12)), false);
  assert.equal(isNight(at(18, 59)), false);
  assert.equal(isNight(at(19)), true);
  assert.equal(isNight(0), true);
  assert.equal(isNight(at(24) + at(12)), false); // wraps
  assert.equal(isNight(undefined), false);
  assert.equal(isNight(-3600), true); // 23:00
});

const simRoom = (over = {}) => ({
  id: 1, name: 'Sim', enabled: true, trh: 10, co2: 11, relay: 12, ac: 13, volume: 60, blocks: 2000, co2PerBlock: 60, fanFlow: 400, acBTU: 12000, humidifierLH: 2,
  state: { T: 21.26, W: 0.01, CO2: 1500.4 }, rh: 87.5, outdoor: { T: 31.2, RH: 62 }, clock: 12 * 3600,
  acting: { exchangeM3h: 200, acCoolKW: 1.76, acLatentKW: 0, acHeatKW: 0, humidifierGH: 1000, blocksKW: 0.1 }, ...over,
});
const devices = [
  { address: 12, kind: 'relay', coils: [true, true, false, true], running: [true, true, false, true] },
  { address: 13, kind: 'ac', power: true, mode: 1, setpoint: 21, fan: 2, roomT: 21, error: 0 },
];

test('fromSim: values, outdoor, night, machines and acting amounts', () => {
  const d = fromSim(simRoom(), devices);
  assert.deepEqual([d.T, d.RH, d.CO2], [21.26, 87.5, 1500.4]);
  assert.deepEqual(d.out, { T: 31.2, RH: 62 });
  assert.equal(d.night, false);
  assert.equal(d.units.intake.on, true);
  assert.equal(d.units.intake.level, 0.5); // 200 of 400 m³/h
  assert.equal(d.units.circ.on, false);
  assert.equal(d.units.circ.state, 'Off');
  assert.equal(d.units.hu.level, 0.5); // 1000 g/h of 2 L/h
  assert.equal(d.units.ac.mode, 'heat');
  assert.equal(d.units.ac.state, 'Heat 21.0 °C');
  assert.equal(d.units.ac.sub, 'fan High');
  assert.equal(d.blocks, '2,000 blocks');
  assert.ok(d.co2Rate > 0 && d.co2Rate <= 1);
  assert.equal(fromSim(simRoom({ clock: 22 * 3600 }), devices).night, true);
  assert.equal(fromSim(simRoom({ clock: 3 * 3600 }), devices).night, true);
});

test('fromSim: ac level follows the cooling power, modes map from the register code', () => {
  const cap = 12000 * 0.00029307; // 3.52 kW
  const cool = [{ ...devices[1], mode: 0 }];
  let u = fromSim(simRoom({ acting: { exchangeM3h: 0, acCoolKW: cap / 2, acHeatKW: 0, humidifierGH: 0, blocksKW: 0 } }), [devices[0], ...cool]).units.ac;
  assert.deepEqual([u.mode, Math.round(u.level * 100)], ['cool', 50]);
  u = fromSim(simRoom({ acting: { exchangeM3h: 0, acCoolKW: 0, acHeatKW: 0, humidifierGH: 0, blocksKW: 0 } }), [devices[0], ...cool]).units.ac;
  assert.equal(u.level, 0.15); // on but idle: a little
  u = fromSim(simRoom({ acting: null }), [devices[0], ...cool]).units.ac;
  assert.equal(u.level, 0.6);
  for (const [code, mode] of [[2, 'dry'], [3, 'fan']]) assert.equal(fromSim(simRoom(), [devices[0], { ...devices[1], mode: code }]).units.ac.mode, mode);
  u = fromSim(simRoom(), [devices[0], { ...devices[1], power: false }]).units.ac;
  assert.deepEqual([u.on, u.state, u.level], [false, 'Off', 0]);
  u = fromSim(simRoom(), [devices[0], { ...devices[1], error: 4 }]).units.ac;
  assert.deepEqual([u.state, u.warn], ['Fault (code 4)', true]);
  // the compressor: not with an error code, not while idle at the setpoint, yes while it cools or dries
  assert.equal(view({ units: { ac: u } }).comp, false, 'fault');
  const idle = fromSim(simRoom({ acting: { exchangeM3h: 0, acCoolKW: 0, acLatentKW: 0, acHeatKW: 0, humidifierGH: 0, blocksKW: 0 } }), [devices[0], ...cool]).units.ac;
  assert.equal(view({ units: { ac: idle } }).comp, false, 'idle');
  const drying = fromSim(simRoom({ acting: { exchangeM3h: 0, acCoolKW: 0, acLatentKW: 0.5, acHeatKW: 0, humidifierGH: 0, blocksKW: 0 } }), [devices[0], ...cool]).units.ac;
  assert.equal(view({ units: { ac: drying } }).comp, true, 'drying');
});

test('fromSim: relay states running, on but not running (stuck or dead) and off', () => {
  const states = fromSim(simRoom(), [{ address: 12, kind: 'relay', coils: [true, false, true, false], running: [true, true, false, false] }, devices[1]]).units;
  assert.deepEqual([states.intake.state, states.intake.warn], ['Running', false]);
  assert.deepEqual([states.exhaust.state, states.exhaust.warn, states.exhaust.on], ['Running', true, true]); // running while off
  assert.deepEqual([states.circ.state, states.circ.warn, states.circ.on], ['On, not running', true, false]);
  assert.deepEqual([states.hu.state, states.hu.warn], ['Off', false]);
});

test('fromSim: missing links, missing data and a switched off room never throw', () => {
  const d = fromSim(simRoom({ relay: null, ac: null, acting: null }), []);
  assert.equal(d.units.intake.state, 'No relay linked');
  assert.equal(d.units.intake.known, false);
  assert.equal(d.units.ac.state, 'No aircon linked');
  const off = fromSim(simRoom({ enabled: false }), devices);
  assert.equal(off.note, 'Simulation switched off');
  assert.equal(off.co2Rate, 0);
  for (const input of [[undefined, undefined], [{}, null], [null, []]]) {
    const x = fromSim(...input);
    assert.equal(x.T, null);
    assert.equal(x.out, null);
    assert.equal(x.night, false);
    assert.equal(x.blocks, '');
    view(x);
  }
  assert.equal(fromSim(simRoom({ outdoor: null }), devices).out, null);
  assert.equal(fromSim(simRoom({ fanFlow: 0 }), devices).units.intake.level, 1); // no flow figure: full speed
  assert.equal(fromSim(simRoom({ blocks: 0 }), devices).co2Rate, 0);
  const v = view(fromSim(simRoom(), devices));
  assert.equal(v.outLine, '31.2 °C · 62 % RH');
  assert.equal(v.readouts.T.zn, 'Simulated');
  assert.match(describe(v), /Outdoor 31\.2 °C · 62 % RH, day/);
  assert.equal(view(fromSim(simRoom({ clock: 23 * 3600 }), devices)).sky, 'Night');
});

test('fromRoom: an aircon with a fault shows no running compressor', () => {
  const ac = (status) => ({ status, errorCode: 3, reported: { power: true, mode: 'cool', setpoint: 22, fan: 'auto' } });
  assert.equal(view(fromRoom({ machines: { ac: ac('fault') } })).comp, false);
  assert.equal(view(fromRoom({ machines: { ac: ac('on') } })).comp, true);
});

// ---- the dehumidifier (drawn only when the room has one) ----

const withDh = (dh) => ({ address: 2, machines: [...relay().machines, { key: 'dehumidifier', commanded: false, reported: false, running: false, status: 'off', ...dh }] });

test('fromRoom: a fitted dehumidifier is a unit; not fitted (or an older server) is none', () => {
  const on = fromRoom({ machines: { relay: withDh({ status: 'on', commanded: true, reported: true, running: true }), ac: ac() } });
  assert.deepEqual([on.units.dh.known, on.units.dh.on, on.units.dh.state], [true, true, 'On']);
  assert.equal(fromRoom({ machines: { relay: withDh({ status: 'not-fitted', reported: null, running: null }), ac: ac() } }).units.dh, null);
  assert.equal(fromRoom({ machines: { relay: relay(), ac: ac() } }).units.dh, null, 'no row at all');
  assert.equal(fromRoom({}).units.dh, null);
  // fitted but the relay module is not wired: drawn as no data
  const nw = fromRoom({ machines: { relay: withDh({ status: 'not-wired', reported: null, running: null }) } }).units.dh;
  assert.deepEqual([nw.known, nw.state], [false, 'Not wired']);
});

test('fromSim: a dehumidifier when the simulated room has a capacity; its level from the water it takes out', () => {
  const dev = [{ ...devices[0], coils: [true, true, false, true, true], running: [true, true, false, true, true] }, devices[1]];
  const d = fromSim(simRoom({ dehumidifierLday: 24, acting: { ...simRoom().acting, dehumidifierGH: 500 } }), dev);
  assert.equal(d.units.dh.on, true);
  assert.equal(d.units.dh.level, 0.5); // 500 g/h of 1000 g/h (24 L/day)
  assert.equal(fromSim(simRoom(), dev).units.dh, null, 'no capacity: none');
  assert.equal(fromSim(simRoom({ dehumidifierLday: 0 }), dev).units.dh, null);
  const stuck = fromSim(simRoom({ dehumidifierLday: 20 }), [{ ...devices[0], coils: [false, false, false, false, true], running: [false, false, false, false, false] }, devices[1]]);
  assert.deepEqual([stuck.units.dh.on, stuck.units.dh.warn, stuck.units.dh.state], [false, true, 'On, not running']);
});

test('view and describe: the dehumidifier only when there is one', () => {
  const v = view(fromRoom({ sensors, control, machines: { relay: withDh({ status: 'on', commanded: true, reported: true, running: true }), ac: ac() } }));
  assert.equal(v.dh.name, 'Dehumidifier');
  assert.equal(v.dh.on, true);
  assert.match(describe(v), /Dehumidifier on/);
  const none = view(fromRoom({ sensors, control, machines: { relay: relay(), ac: ac() } }));
  assert.equal(none.dh, null);
  assert.doesNotMatch(describe(none), /Dehumidifier/);
  assert.equal(view(null).dh, null);
});

test('the filter reading: from the room\'s pressure sensor or the one given, from a simulated room\'s filter probe', () => {
  const dp = (over = {}) => ({ trh: sensors.trh, co2: sensors.co2, dp: { status: 'online', lastOk: { pa: 40.4, at: 1 }, ...over } });
  assert.equal(fromRoom({ sensors: dp() }).filterPa, 40.4);
  assert.equal(view(fromRoom({ sensors: dp() })).filter, 'filter 40.4 Pa', 'one decimal, as the Filter card and the Machines row');
  assert.equal(fromRoom({ sensors: dp(), filterPa: 51 }).filterPa, 51, 'the Filter card\'s reading wins (the last one with the intake on)');
  assert.equal(fromRoom({ sensors: dp(), filterPa: null }).filterPa, null);
  assert.equal(fromRoom({ sensors: dp({ status: 'not-wired', lastOk: null }) }).filterPa, null);
  assert.equal(fromRoom({ sensors }).filterPa, null);
  assert.equal(view(fromRoom({ sensors })).filter, '');
  assert.equal(view(undefined).filter, '');
  const acting = { ...simRoom().acting, filterPa: 62.4 };
  assert.equal(fromSim(simRoom({ filterProbe: 14, acting }), devices).filterPa, 62.4);
  assert.equal(view(fromSim(simRoom({ filterProbe: 14, acting }), devices)).filter, 'filter 62.4 Pa');
  assert.equal(fromSim(simRoom({ filterProbe: null, acting }), devices).filterPa, null, 'no filter probe linked');
  assert.equal(fromSim(simRoom({ filterProbe: 14, acting: { ...acting, filterPa: 0 } }), devices).filterPa, null, 'the intake is off');
});

// Critique 2026-10-29: "Aircon · cool 25.0 °C" ran past the aircon's box at 12.5 px and drew under 12 px on a phone.
test('the aircon\'s label fits its box at 13 px: the usual cooling is its setpoint alone, other modes and states say so', () => {
  const label = (over) => view(fromRoom({ machines: { ac: ac(over) } })).acLabel;
  assert.equal(label({}), 'Aircon · 23.5 °C');
  assert.equal(label({ reported: { power: true, mode: 'heat', setpoint: 22, fan: 'auto' } }), 'Aircon · heat 22.0 °C');
  assert.equal(label({ reported: { power: true, mode: 'fan', setpoint: 22, fan: 'auto' } }), 'Aircon · fan 22.0 °C');
  assert.equal(label({ reported: { power: false, mode: 'cool', setpoint: 22, fan: 'auto' }, status: 'off' }), 'Aircon · off');
  assert.equal(label({ status: 'fault', errorCode: 5 }), 'Aircon · ! fault');
  assert.equal(label({ status: 'not-following' }), 'Aircon · ! 23.5 °C');
  assert.equal(view(fromRoom({})).acLabel, 'Aircon · no data');
  const css = readFileSync(new URL('../web/mimic.css', import.meta.url), 'utf8');
  assert.match(css, /\.mimic-svg \.m-ac \{ font-size: 13px;/);
  const page = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(page, /\.rc-scroll \.rc-pic \{ min-width: 840px; \}/, 'on a phone the drawing at its own size: 13 px labels are 13 px');
});

test('the light theme gives the drawing a 1 px edge inside its corners (its pale sky on a white card had none)', () => {
  const css = readFileSync(new URL('../web/mimic.css', import.meta.url), 'utf8');
  assert.match(css, /:root\[data-theme="light"\] \.mimic-host \{ outline: 1px solid var\(--border-strong\); outline-offset: -1px; \}/);
});
