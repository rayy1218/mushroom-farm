// Unit tests for controller.js. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
require('../air.js');
require('../controller.js');
const CC = globalThis.ClimateController;

// Tests that need a reading to count as new use `(t % 60 ? 1 : 0)`: it changes the value a little every other
// 30 s step, so that no sensor looks frozen and no reading repeats exactly.
// A controller with default oyster-fruiting settings: target 25 °C / 88 %, CO2 limit 1000,
// purge 900 -> 700 ppm, at most 180 s, 60 s off, air exchange 1800 m³/h, safety level 1500, AC command every 2 min.
function make({ rules = {}, protect = {}, stage } = {}) {
  const cfg = CC.defaultSettings();
  Object.assign(cfg.rules, rules);
  Object.assign(cfg.protect, protect);
  if (stage) cfg.stage = stage;
  const events = [];
  const ctl = CC.create(cfg, null, e => events.push(e));
  let seq = 0;
  // Feed one reading. A small change each time, so that no sensor looks frozen.
  const feed = (t, o = {}) => ctl.update({ seq: ++seq, t, T: 25 + (seq % 2) * 0.01, RH: 88 + (seq % 2) * 0.1, CO2: 800 + (seq % 2), tOut: 30, rhOut: 70, ...o });
  return { cfg, ctl, events, feed };
}

test('alarm delay: a short excursion gives no alarm; 5 min gives one', () => {
  const { feed, ctl } = make();
  feed(0, { RH: 79 }); feed(120, { RH: 79.1 }); feed(150, { RH: 86 });
  assert.equal(ctl.state.alarms.rhLo, undefined);
  feed(180, { RH: 79 }); feed(480, { RH: 79.1 });
  assert.equal(ctl.state.alarms.rhLo.active, true);
});

test('the AC is too small: a warning after 1 h at its limit with the room too warm', () => {
  const { feed, ctl } = make();
  for (let t = 0; t <= 3 * 3600; t += 30) feed(t, { T: 27.2 + (t % 60) * 0.001 });
  assert.equal(ctl.state.alarms.acTooSmall.active, true);
  for (let t = 3 * 3600 + 30; t <= 3 * 3600 + 120; t += 30) feed(t, { T: 25.2 + (t % 60) * 0.001 });
  assert.equal(ctl.state.alarms.acTooSmall.active, false);
});

test('a single spike is not used, but a real jump that stays is accepted', () => {
  const { feed, ctl } = make();
  feed(0, { T: 25 });
  feed(30, { T: 40 });                                         // spike
  assert.equal(ctl.state.v.T, 25);
  feed(60, { T: 25.02 });
  assert.equal(ctl.state.sensors.T.fault, false);
  feed(90, { T: 28 });                                         // real jump (door open)
  feed(120, { T: 28.05 });
  assert.equal(ctl.state.v.T, 25.02, 'two readings are not enough');
  feed(150, { T: 28.1 });                                      // 3 readings agree -> accepted
  assert.equal(ctl.state.v.T, 28.1);
});

test('a frozen CO2 value gives a fault after 60 min', () => {
  const { feed, ctl } = make();
  let t = 0;
  for (; t <= 60 * 60 + 90; t += 30) feed(t, { CO2: 812 });
  assert.equal(ctl.state.sensors.CO2.fault, true);
  assert.match(ctl.state.sensors.CO2.why, /frozen/);
});

test('a wet RH sensor at 100 % is not a frozen sensor', () => {
  const { feed, ctl } = make();
  for (let t = 0; t <= 3 * 3600; t += 30) feed(t, { RH: 100 });
  assert.equal(ctl.state.sensors.RH.fault, false);
});

test('a value out of range gives a fault; the AC then uses its own thermostat at the target', () => {
  const { feed, ctl } = make();
  for (let t = 0; t <= 90; t += 30) feed(t, { T: -40 });
  assert.equal(ctl.state.sensors.T.fault, true);
  const ac = feed(300, { T: -40 }).ac;
  assert.equal(ac.setpoint, 25);
  assert.match(ctl.state.why.ac, /own thermostat/);
});

test('alarms stay until a person acknowledges them', () => {
  const { feed, ctl } = make();
  feed(0, { RH: 79 }); feed(300, { RH: 79.1 });                // 88 - 8 = 80 -> low alarm after the 5 min delay
  assert.equal(ctl.state.alarms.rhLo.active, true);
  feed(330, { RH: 85 });                                       // cleared, but not acknowledged
  assert.equal(ctl.state.alarms.rhLo.active, false);
  assert.ok(ctl.state.alarms.rhLo, 'cleared alarm stays in the list');
  ctl.ack();
  assert.equal(ctl.state.alarms.rhLo, undefined);
});

test('low humidity is critical during pinning', () => {
  const { feed, ctl } = make({ stage: 'pinning' });
  feed(0, { RH: 79 }); feed(60, { RH: 79.1 });                 // critical: 60 s delay
  assert.equal(ctl.state.alarms.rhLo.lvl, 'critical');
});

test('one low reading does not change the AC to heat; 5 min of low readings do', () => {
  const { feed, ctl } = make();
  feed(0, { T: 25 });
  feed(60, { T: 23.4 });                                       // below target - 1.5, one reading (rate 1.6 °C/min: plausible)
  feed(120, { T: 25.0 });
  assert.equal(ctl.state.acMode, 'cool');
  for (let t = 180; t <= 520; t += 30) feed(t, { T: 23.4 + (t % 60) * 0.001 });
  assert.equal(ctl.state.acMode, 'heat');
});

// ---------- 2.1 stage program ----------
function makeProg(over = {}) {
  const cfg = CC.defaultSettings();
  Object.assign(cfg, over);
  cfg.program.harvest.on = false;
  const events = [];
  const ctl = CC.create(cfg, null, e => events.push(e));
  let seq = 0;
  const feed = (t, o = {}) => ctl.update({ seq: ++seq, t, hour: (6 + t / 3600) % 24, T: cfg.spT + (seq % 2) * 0.01, RH: cfg.spRH + (seq % 2) * 0.1, CO2: 800 + (seq % 2), tOut: 30, rhOut: 70, ...o });
  return { cfg, ctl, events, feed };
}

test('a ready-to-fruit farm has no spawn run or pinning', () => {
  const { ctl, cfg, feed } = makeProg();
  feed(0);
  ctl.setFarmType('ready', 0);
  assert.deepEqual(CC.FARM_TYPES.ready.stages, ['fruiting', 'rest']);
  assert.equal(ctl.setStage('pinning', 30), false);
  assert.equal(ctl.setStage('spawn', 30), false);
  assert.equal(cfg.stage, 'fruiting');
});

test('a stage change moves the targets slowly (ramp)', () => {
  const { ctl, cfg, feed } = makeProg();
  feed(0);
  ctl.setStage('pinning', 0);                                  // oyster: 25 -> 24 °C, 88 -> 92 %, 1000 -> 800 ppm, in 4 h
  // The CO2 limit and its start and stop levels are lower, so they apply at once (lead decision 56); the rest ramps.
  assert.deepEqual([cfg.co2Lim, cfg.rules.fanOn, cfg.rules.fanOff, cfg.rules.co2SafetyAt, cfg.spT, cfg.spRH], [800, 700, 600, 1500, 25, 88]);
  feed(2 * 3600);
  assert.deepEqual([cfg.spT, cfg.spRH, cfg.co2Lim, cfg.rules.fanOn, cfg.rules.fanOff, cfg.rules.co2SafetyAt], [24.5, 90, 800, 700, 600, 1400]);
  feed(4 * 3600 + 30);
  assert.deepEqual([cfg.spT, cfg.spRH, cfg.co2Lim, cfg.rules.fanOn, cfg.rules.fanOff, cfg.rules.co2SafetyAt], [24, 92, 800, 700, 600, 1300]);
  assert.equal(ctl.programStatus(4 * 3600 + 30).ramp, null);
});

test('D56-RAISE a stage change that raises the CO2 limit still ramps', () => {
  const { ctl, cfg, feed } = makeProg();
  feed(0);
  ctl.setStage('rest', 0);
  assert.deepEqual([cfg.co2Lim, cfg.rules.fanOn, cfg.rules.fanOff], [1000, 900, 700]);
  assert.equal(ctl.state.stage.freePurge ?? null, null);
  feed(2 * 3600);
  assert.deepEqual([cfg.co2Lim, cfg.rules.fanOn, cfg.rules.fanOff, cfg.rules.co2SafetyAt], [1500, 1400, 1200, 2000]);
});

// Lowering stage change (oyster fruiting -> pinning, 1000 -> 800 ppm) with the air at 1000 ppm: the first purge has no cap.
function freePurgeRun() {
  const { ctl, feed } = makeProg();
  feed(0, { CO2: 650 });
  ctl.setStage('pinning', 0);
  const S = ctl.state.stats;
  const at = (t, CO2) => feed(t, { CO2 }).air.on;
  return { ctl, S, at, feed };
}

test('D56-FREE the first purge after a lowering stage change has no cap while CO2 is above the limit', () => {
  const { ctl, S, at } = freePurgeRun();
  assert.equal(ctl.state.stage.freePurge, true);
  const co2 = t => 1000 + (t % 60 ? 1 : 0);
  assert.equal(at(30, co2(30)), true);
  for (let t = 60; t <= 1800; t += 30) assert.equal(at(t, co2(t)), true, `on at ${t}`);
  assert.equal(at(1830, co2(1830)), false);
  assert.deepEqual([ctl.state.air.state, ctl.state.air.capRun, S.purges, S.cappedPurges, S.longestPurgeS, ctl.state.stage.freePurge], ['after', 0, 1, 1, 1800, null]);
  let start = null, stop = null;
  for (let t = 1860; t <= 2100 && stop === null; t += 30) {
    const on = at(t, co2(t));
    if (on && start === null) start = t;
    if (!on && start !== null) stop = t;
  }
  assert.deepEqual([start, stop], [1890, 2070]);
  assert.deepEqual([ctl.state.air.capRun, S.cappedPurges], [1, 2]);
});

test('D56-BELOW the free purge ends when CO2 falls below the limit', () => {
  const { ctl, S, at } = freePurgeRun();
  for (let t = 30; t <= 300; t += 30) at(t, 1000 + (t % 60 ? 1 : 0));
  assert.equal(at(330, 750), false);
  assert.deepEqual([ctl.state.air.state, ctl.state.air.capRun, S.cappedPurges, S.longestPurgeS, ctl.state.stage.freePurge], ['after', 0, 1, 300, null]);
});

test('D56-STOP the free purge ends at the stop level and is not capped', () => {
  const { ctl, S, at } = freePurgeRun();
  for (let t = 30; t <= 600; t += 30) at(t, 1000 + (t % 60 ? 1 : 0));
  assert.equal(at(630, 590), false);
  assert.deepEqual([ctl.state.air.state, ctl.state.air.capRun, S.cappedPurges, S.longestPurgeS, ctl.state.stage.freePurge], ['after', 0, 0, 600, null]);
});

test('a person who changes a target stops the ramp', () => {
  const { ctl, cfg, feed } = makeProg();
  feed(0);
  ctl.setStage('pinning', 0);
  feed(3600);
  ctl.cancelRamp(); cfg.spT = 26;
  feed(3 * 3600);
  assert.equal(cfg.spT, 26);
});

test('automatic stage change: fruiting -> rest -> fruiting, then "replace the blocks" after the last flush', () => {
  const { ctl, cfg, feed } = makeProg({ farmType: 'ready' });
  cfg.program.auto = true; cfg.program.rampH = 0; cfg.program.flushes = 2;
  cfg.program.days.fruiting = 1; cfg.program.days.rest = 1;
  let t = 0;
  const day = () => { for (const end = t + 86400 + 60; t <= end; t += 600) feed(t); };
  feed(0);
  assert.equal(cfg.stage, 'fruiting');
  day(); assert.equal(cfg.stage, 'rest');
  day(); assert.equal(cfg.stage, 'fruiting'); assert.equal(ctl.programStatus(t).flush, 2);
  day(); assert.equal(cfg.stage, 'rest');
  assert.equal(ctl.state.alarms.blocksDone.active, true);
  day(); assert.equal(cfg.stage, 'rest', 'no new flush after the last one');
});

test('harvest window: the fogger stops before picking and comes back at the floor', () => {
  const { cfg, ctl, feed } = makeProg();
  cfg.program.harvest.on = true;                               // 08:00, dry 90 min before; t = 0 is 06:00
  // 05:00 (t = 23 h): RH low -> fogger on
  feed(23 * 3600, { RH: 84 });
  assert.ok(ctl.state.cmd.hu.level > 0);
  // 07:00 (t = 25 h): in the window, RH above the floor (82) -> fog off (after the 1 min minimum run)
  feed(25 * 3600, { RH: 84 }); feed(25 * 3600 + 90, { RH: 84.1 });
  assert.equal(ctl.state.harvestOn, true);
  assert.equal(ctl.state.cmd.hu.level, 0);
  // at the floor -> fog level 2
  feed(25 * 3600 + 300, { RH: 82 }); feed(25 * 3600 + 400, { RH: 82.05 });
  assert.equal(ctl.state.cmd.hu.level, 2);
});

// ---------- Phase 2 controller ----------
test('VPD mode: the humidity target moves with the temperature', () => {
  const { ctl, feed } = make();
  feed(0, { T: 25 }); const at25 = ctl.state.rhT;
  feed(30, { T: 25.8 }); const warmer = ctl.state.rhT;
  assert.ok(Math.abs(at25 - 88) < 0.1);
  assert.ok(warmer > at25, 'warmer air: higher RH target for the same evaporation');
});

// No crop in the list uses the flags maxFog, shock and spawnLights now: a test crop checks them.
CC.CROPS.flagTest = { ...CC.CROPS.oyster, name: 'Flag test', maxFog: 2, shock: { T: 20, hours: 24 }, spawnLights: true };

test('every crop can be held by a split AC (16-30 °C) and its targets are inside its own range', () => {
  for (const [key, c] of Object.entries(CC.CROPS)) {
    if (key === 'flagTest') continue;
    for (const s of Object.keys(CC.STAGES)) {
      const [t, h] = c[s];
      assert.ok(t >= CC.MACHINES.acSetMin && t <= CC.MACHINES.acSetMax, `${key} ${s}: ${t} °C`);
      assert.ok(t > c.limits.tMin && t < c.limits.tMax, `${key} ${s}: ${t} °C outside ${c.limits.tMin}-${c.limits.tMax}`);
      assert.ok(h >= 50 && h <= 98, `${key} ${s}: ${h} % RH`);
    }
  }
});

test('every crop has a good range inside its alarm limits', () => {
  for (const [k, c] of Object.entries(CC.CROPS)) {
    if (k === 'flagTest') continue;
    const [tLo, tHi] = c.range.T, [hLo, hHi] = c.range.RH;
    assert.ok(tLo < tHi && hLo < hHi, `${k}: each range is low < high`);
    assert.ok(tLo <= c.fruiting[0] && c.fruiting[0] <= tHi, `${k}: T target inside its T range`);
    assert.ok(hLo <= c.fruiting[1] && c.fruiting[1] <= hHi, `${k}: RH target inside its RH range`);
    assert.ok(tLo > c.limits.tMin && tHi < c.limits.tMax, `${k}: T range narrower than the alarm limits`);
    assert.ok(hLo >= 50 && hHi <= 98, `${k}: RH range is plausible`);
  }
});

test('lights follow the stage and the clock; the spawnLights flag adds light in spawn run', () => {
  const p = makeProg(); p.feed(0, { hour: 10 }); assert.equal(p.ctl.state.cmd.lights.on, true);       // fruiting, 10:00
  p.feed(30, { hour: 22 }); assert.equal(p.ctl.state.cmd.lights.on, false);                           // 22:00
  const q = makeProg({ crop: 'oyster', stage: 'spawn' }); q.feed(0, { hour: 10 }); assert.equal(q.ctl.state.cmd.lights.on, false);
  const w = makeProg({ crop: 'flagTest', stage: 'spawn' }); w.feed(0, { hour: 10 }); assert.equal(w.ctl.state.cmd.lights.on, true);
});

test('the maxFog flag: the fogger never goes above that level', () => {
  const p = makeProg({ crop: 'flagTest' }); CC.applyProfile(p.cfg);
  p.feed(0, { RH: 80 }); p.feed(30, { RH: 80.1, CO2: 950 });
  assert.ok(p.ctl.state.cmd.hu.level <= 2);
});

test('the shock flag: pinning starts with a cold shock', () => {
  const p = makeProg({ crop: 'flagTest' }); p.cfg.program.rampH = 0;
  p.feed(0); p.ctl.setStage('pinning', 0);
  assert.equal(p.cfg.spT, 20);
  p.feed(25 * 3600);
  assert.equal(p.cfg.spT, 24);
});

test('milky: pinning tells the grower to case the blocks', () => {
  const p = makeProg({ crop: 'milky' }); CC.applyProfile(p.cfg);
  p.feed(0); p.ctl.setStage('pinning', 0);
  assert.ok(p.events.some(e => /Case the blocks/.test(e.text)));
  assert.equal(p.cfg.spT, 30);
});

test('two sensor sets: average, disagreement alarm, and take-over when one fails', () => {
  const { ctl, feed } = make();
  feed(0, { T: 25, T2: 25.4, RH: 88, RH2: 90, CO2: 800, CO2b: 820 });
  assert.equal(ctl.state.v.T, 25.2);
  feed(30, { T: 25, T2: 25.4, RH: 88, RH2: 97, CO2: 800, CO2b: 820 });
  feed(330, { T: 25, T2: 25.4, RH: 88.1, RH2: 97.1, CO2: 800, CO2b: 820 });   // 5 min alarm delay
  assert.equal(ctl.state.alarms.disagree.active, true);
  for (let t = 360; t <= 420; t += 30) feed(t, { T: 25, T2: 25.4, RH: null, RH2: 90, CO2: 800, CO2b: 820 });
  assert.equal(ctl.state.sensors.RH.fault, true);
  assert.equal(ctl.state.f.RH, false, 'the second set takes over');
  assert.equal(ctl.state.v.RH, 90);
});

test('AC fan speed: high when RH is low, low when RH is high', () => {
  const { ctl, feed } = make();
  feed(0, { RH: 85.5 });
  assert.equal(ctl.state.cmd.ac.fan, 'high');
  feed(200, { RH: 91 }); feed(330, { RH: 91.1 });
  assert.equal(ctl.state.cmd.ac.fan, 'low');
});

test('sensor corrections (offsets) apply to the room sensors, not to outdoor', () => {
  const cfg = CC.defaultSettings(); cfg.offsets = { T: 0.5, RH: -2, CO2: -30 };
  const ctl = CC.create(cfg, null, null);
  ctl.update({ seq: 1, t: 0, T: 25, RH: 90, CO2: 800, tOut: 30, rhOut: 70 });
  assert.deepEqual([ctl.state.v.T, ctl.state.v.RH, ctl.state.v.CO2, ctl.state.v.tOut], [25.5, 88, 770, 30]);
});

test('the shock flag: a shock at each new flush, held inside the AC range, with a warning', () => {
  CC.CROPS.coldTest = { ...CC.CROPS.oyster, name: 'Cold test', shock: { T: 12, hours: 24 } };
  const p = makeProg({ crop: 'coldTest' }); p.cfg.program.rampH = 0;
  p.feed(0); p.ctl.setStage('rest', 0); p.feed(30);
  p.ctl.setStage('fruiting', 60);                               // new flush: shock again
  assert.equal(p.cfg.spT, 16, 'the AC lowest setpoint, not 12 °C');
  assert.equal(p.ctl.state.alarms.shockLimit.active, true);
  delete CC.CROPS.coldTest;
});

// ---------- Air exchange (contract C9 section 5) ----------
test('purge cycle: idle, purge at the start level, after at the stop level, idle after the minimum off time', () => {
  const { feed, ctl, events } = make();
  assert.equal(feed(0, { CO2: 850 }).air.on, false);
  assert.equal(ctl.state.air.state, 'idle');
  assert.equal(ctl.state.why.air, 'CO₂ is 850 ppm. The next purge starts at 900 ppm.');
  assert.equal(feed(30, { CO2: 900 }).air.on, true);
  assert.equal(ctl.state.air.state, 'purge');
  assert.equal(ctl.state.air.purgeStart, 30);
  assert.equal(feed(60, { CO2: 750 }).air.on, true, 'above the stop level: still on');
  assert.equal(feed(90, { CO2: 700 }).air.on, false, 'stop level after 60 s');
  assert.equal(ctl.state.air.state, 'after');
  assert.deepEqual([ctl.state.stats.purges, ctl.state.stats.purgeS, ctl.state.stats.cappedPurges, ctl.state.air.capRun], [1, 60, 0, 0]);
  feed(120, { CO2: 720 });
  assert.equal(ctl.state.air.state, 'after', '30 s off');
  assert.equal(ctl.state.why.air, 'Minimum off time: 30 s.');
  feed(150, { CO2: 740 });
  assert.equal(ctl.state.air.state, 'idle', '60 s off');
  assert.ok(events.some(e => e.text === 'Air exchange on: purge'));
  assert.ok(events.some(e => e.text === 'Air exchange off (1:00, CO₂ 700 ppm)'));
});

test('every air run lasts at least 30 s, then stays off for the minimum off time', () => {
  const { feed, ctl } = make();
  assert.equal(feed(0, { T: 25.4, tOut: 20 }).air.on, true, 'free cooling');
  assert.equal(ctl.state.airReason, 'free cooling');
  assert.equal(feed(10, { T: 25.1, tOut: 20 }).air.on, true, 'no longer warm, but the minimum run time');
  assert.equal(ctl.state.hold.air, 'Minimum run time: 20 s to wait.');
  assert.equal(ctl.state.airReason, 'free cooling', 'the run keeps its reason');
  assert.equal(feed(30, { T: 25.1, tOut: 20.1 }).air.on, false);
  assert.equal(ctl.state.airReason, null, 'off: no reason');
  assert.equal(feed(60, { T: 25.4, tOut: 20 }).air.on, false, 'warm again, but the minimum off time (60 s)');
  assert.equal(ctl.state.hold.air, 'Minimum off time: 30 s to wait.');
  assert.equal(feed(90, { T: 25.45, tOut: 20 }).air.on, true);
});

test('a purge ends at the stop level only after 30 s', () => {
  const { feed, ctl } = make();
  feed(0, { CO2: 950 });
  assert.equal(feed(15, { CO2: 690 }).air.on, true, '15 s: still purging');
  assert.equal(ctl.state.air.state, 'purge');
  assert.equal(feed(30, { CO2: 680 }).air.on, false);
});

test('a purge stops at the time cap and counts as capped; the next purge waits for the minimum off time', () => {
  const { feed, ctl, events } = make();
  for (let t = 0; t <= 150; t += 30) assert.equal(feed(t, { CO2: 950 + (t % 60 ? 1 : 0) }).air.on, true, `t=${t}`);
  assert.deepEqual(ctl.purges().cur, { start: 0, end: null, reason: 'purge', co2Start: 950, co2End: null, m3: 75, capped: false }, 'the running purge');
  assert.equal(feed(180, { CO2: 951 }).air.on, false, '180 s: the cap');
  assert.deepEqual([ctl.state.air.state, ctl.state.air.capRun, ctl.state.stats.cappedPurges], ['after', 1, 1]);
  assert.ok(events.some(e => e.text === 'Purge stopped at the time cap (3:00)'));
  assert.equal(ctl.purges().events[0].capped, true);
  assert.equal(ctl.purges().hours[0].cappedN, 1);
  assert.equal(feed(210, { CO2: 950 }).air.on, false, 'minimum off time');
  assert.equal(feed(240, { CO2: 951 }).air.on, true, 'then the next purge');
  assert.equal(ctl.state.stats.purges, 2);
});

test('a CO2 safety run is not a purge: no cap, no count; below the level the normal purge takes over', () => {
  const { feed, ctl } = make();
  assert.equal(feed(0, { CO2: 1550 }).air.on, true);
  assert.deepEqual(ctl.status('CO2'), { lvl: 'serious', icon: '◆', text: 'Safety run' }, 'before the critical alarm (60 s delay)');
  for (let t = 30; t <= 600; t += 30) assert.equal(feed(t, { CO2: 1550 + (t % 60 ? 1 : 0) }).air.on, true, `t=${t}`);
  assert.deepEqual(ctl.status('CO2'), { lvl: 'critical', icon: '◆', text: 'Safety level' }, 'the alarm comes first');
  assert.equal(ctl.state.airReason, 'safety');
  assert.equal(ctl.state.alarms.co2Safe.active, true);
  assert.equal(ctl.state.alarms.co2Safe.lvl, 'critical');
  assert.deepEqual([ctl.state.air.state, ctl.state.air.capRun, ctl.state.stats.purges, ctl.state.stats.cappedPurges], ['idle', 0, 0, 0], '10 min, no cap');
  assert.equal(feed(630, { CO2: 1485 }).air.on, true, 'above 1480 ppm: still the safety run');
  assert.equal(ctl.state.airReason, 'safety');
  assert.equal(feed(660, { CO2: 1470 }).air.on, true, 'below 1480 ppm: a normal purge goes on');
  assert.deepEqual([ctl.state.air.state, ctl.state.air.purgeStart, ctl.state.airReason, ctl.state.stats.purges], ['purge', 660, 'purge', 1]);
  assert.deepEqual([ctl.purges().events.length, ctl.purges().cur.reason], [0, 'safety'], 'one air run; it started as a safety run');
  const b = make();
  b.feed(0, { CO2: 950 }); b.feed(30, { CO2: 1400 }); b.feed(60, { CO2: 1550 });
  const S = b.ctl.state.stats;
  assert.deepEqual([b.ctl.state.air.state, S.purges, S.purgeS, S.cappedPurges, b.ctl.state.airReason], ['idle', 1, 60, 0, 'safety'], 'a running purge ends, not capped');
});

test('the purge record: each air run with reason, CO2, air volume and capped flag, split at the full hour', () => {
  const { feed, ctl } = make({ rules: { purgeMaxS: 900 } });
  feed(3300, { CO2: 950 });                                    // on at 55 min
  feed(3600, { CO2: 950 });
  feed(3900, { CO2: 690 });                                    // off at 1 h 5 min
  const X = ctl.purges();
  assert.equal(X.cur, null);
  assert.deepEqual(X.events, [{ start: 3300, end: 3900, reason: 'purge', co2Start: 950, co2End: 690, m3: 300, capped: false }]);   // 10 min at 1800 m³/h
  const h0 = X.hours.find(b => b.h === 0), h1 = X.hours.find(b => b.h === 1);
  assert.deepEqual([h0.runS, h0.m3, h0.starts, h0.cappedN], [300, 150, 1, 0]);
  assert.deepEqual([h1.runS, h1.m3, h1.starts, h1.cappedN], [300, 150, 0, 0]);
  const S = ctl.state.stats;
  assert.deepEqual([S.airOnS, S.purges, S.purgeS, S.longestPurgeS, S.cappedPurges], [600, 1, 600, 600, 0]);
});

test('status CO2 and the why text while purging; manual control acts at once', () => {
  const { feed, ctl, cfg } = make();
  feed(0, { CO2: 950 });
  assert.deepEqual(ctl.status('CO2'), { lvl: 'info', icon: '▲', text: 'Purging' });
  assert.equal(ctl.state.why.air, 'Purging since 0:00 (at most 3:00). It stops at 700 ppm.');
  feed(60, { CO2: 940 });
  assert.equal(ctl.state.why.air, 'Purging since 1:00 (at most 3:00). It stops at 700 ppm.');
  cfg.manual.air = { auto: false, on: false };
  assert.equal(feed(70, { CO2: 930 }).air.on, false, 'a manual Off acts at once');
  assert.equal(ctl.state.air.state, 'idle');
  assert.equal(ctl.state.airReason, null, 'off: no reason');
  assert.deepEqual(ctl.status('CO2'), { lvl: 'good', icon: '✓', text: 'Below limit' });
  cfg.manual.air.on = true;
  assert.equal(feed(80, { CO2: 920 }).air.on, true, 'a manual On acts at once');
  assert.equal(ctl.state.airReason, 'manual');
});

// ---------- Rise rate and next purge (C9 5.4) ----------
test('next purge: predicted from the CO2 rise with the fans off, shown in the idle why text', () => {
  const { feed, ctl } = make();
  for (let t = 0; t <= 60; t += 30) feed(t, { CO2: 650 + t });
  assert.equal(ctl.state.air.nextPurgeS, null, '3 readings: no rise rate yet');
  assert.equal(ctl.state.why.air, 'CO₂ is 710 ppm. The next purge starts at 900 ppm.');
  feed(90, { CO2: 740 });                                      // 1 ppm/s: 160 s to 900 ppm
  assert.ok(Math.abs(ctl.state.air.nextPurgeS - 160) < 1e-6, `next purge in ${ctl.state.air.nextPurgeS} s`);
  assert.equal(ctl.state.air.state, 'idle');
  assert.equal(ctl.state.why.air, 'CO₂ is 740 ppm. The next purge starts at 900 ppm (in about 3 min).');
  assert.deepEqual(ctl.status('CO2'), { lvl: 'good', icon: '✓', text: 'Below limit' });
  feed(120, { CO2: 900 });
  assert.deepEqual([ctl.state.air.nextPurgeS, ctl.state.air.state], [0, 'purge']);
});

test('the rise rate uses only readings with the fans off', () => {
  const { ctl, feed } = make();
  for (let t = 0; t <= 90; t += 30) feed(t, { CO2: 650 + t });
  assert.equal(ctl.state.airPts.length, 4);
  feed(120, { CO2: 950 });                                      // purge
  feed(150, { CO2: 690 });                                      // the fans were on: points cleared
  assert.deepEqual(ctl.state.airPts, []);
  assert.equal(ctl.state.air.nextPurgeS, null, 'no rise rate yet');
  for (let t = 180; t <= 30 * 40; t += 30) feed(t, { CO2: 690 + (t - 150) * 0.1 });
  assert.equal(ctl.state.airPts.length, 20, 'at most the last 20 readings');
});

// Drier outdoor air (30 °C, 40 %): a purge would dry the room. RH 83 % is 5 % under the target: fog level 3 (full).
const DRY = { tOut: 30, rhOut: 40 };
const lowRH = t => ({ RH: 83 + (t % 60 ? 0.01 : 0), ...DRY });

test('humidity first: after 5 min of full fog a purge that would dry the room waits, at most until the CO2 limit', () => {
  const { feed, ctl, events } = make();
  for (let t = 0; t <= 270; t += 30) feed(t, { CO2: 850 + (t % 60 ? 1 : 0), ...lowRH(t) });
  assert.equal(ctl.state.cmd.hu.level, 3);
  assert.equal(ctl.state.rhLocked, false, 'fog more before less air');
  feed(300, { CO2: 851, ...lowRH(300) });
  assert.equal(ctl.state.rhLocked, true, 'after 5 min of full fog');
  assert.equal(feed(330, { CO2: 950, ...lowRH(330) }).air.on, false, 'start level, but the purge waits');
  assert.equal(ctl.state.air.delayed, true);
  assert.deepEqual(ctl.status('CO2'), { lvl: 'info', icon: '❚❚', text: 'Purge delayed (RH)' });
  assert.match(ctl.state.why.air, /^Humidity first: RH 83\.0 % is at or below 85 %/);
  assert.ok(events.some(e => e.text === 'Purge delayed: humidity first'));
  assert.equal(feed(360, { CO2: 1000, ...lowRH(360) }).air.on, true, 'CO2 limit: purge anyway');
  assert.equal(ctl.state.air.delayed, false);
  assert.equal(ctl.state.stats.delayedS, 30);
});

test('humidity first: the purge goes when RH recovers; a running purge is never stopped; wet outdoor air never delays', () => {
  const a = make();
  for (let t = 0; t <= 300; t += 30) a.feed(t, { CO2: 850 + (t % 60 ? 1 : 0), ...lowRH(t) });
  assert.equal(a.feed(330, { CO2: 950, ...lowRH(330) }).air.on, false);
  assert.equal(a.feed(360, { CO2: 950, RH: 87.2, ...DRY }).air.on, true, 'RH at the allow level 87 %');
  assert.ok(a.events.some(e => e.text === 'Purge allowed again: humidity recovered'));
  const b = make({ rules: { purgeMaxS: 600 } });
  for (let t = 0; t <= 360; t += 30) b.feed(t, { CO2: 950 + (t % 60 ? 1 : 0), ...lowRH(t) });
  assert.equal(b.ctl.state.rhLocked, true);
  assert.equal(b.ctl.state.cmd.air.on, true, 'the purge that started before the lock goes on');
  assert.equal(b.ctl.state.air.delayed, false);
  const c = make();
  for (let t = 0; t <= 300; t += 30) c.feed(t, { CO2: 850 + (t % 60 ? 1 : 0), RH: 83 + (t % 60 ? 0.01 : 0), tOut: 33, rhOut: 90 });
  assert.equal(c.ctl.state.rhLocked, false, 'wetter outdoor air: a purge does not dry the room');
  assert.equal(c.feed(330, { CO2: 950, RH: 83, tOut: 33, rhOut: 90 }).air.on, true);
});

test('a CO2 sensor fault: timed purge from the setting, run capped at purgeMaxS, period with the minimum off time', () => {
  const { feed, ctl, events } = make();
  feed(0, { CO2: 800 });
  feed(30, { CO2: null });
  feed(60, { CO2: null });
  assert.equal(ctl.state.sensors.CO2.fault, false);
  // share 10 / 30 min; run min(180 s, 600 s) = 180 s; period max(180 s / share, 180 s + 60 s) = 540 s:
  // each period starts its run at its first reading and keeps the fans on for 180 s from it
  assert.equal(feed(90, { CO2: null }).air.on, true);
  assert.equal(ctl.state.sensors.CO2.fault, true);
  assert.equal(ctl.state.alarms.sensor_CO2.active, true);
  assert.equal(ctl.state.air.timed, true);
  assert.equal(ctl.state.airReason, 'timed');
  assert.equal(ctl.state.why.air, 'CO₂ sensor fault: timed purge, 180 s of each 540 s (from the setting).');
  assert.ok(events.some(e => e.text === 'CO₂ sensor fault: timed purge started'));
  assert.equal(feed(240, { CO2: null }).air.on, true, 'the run lasts 180 s from the first reading');
  assert.equal(feed(270, { CO2: null }).air.on, false);
  assert.equal(ctl.state.why.air, 'CO₂ sensor fault: timed purge. The air exchange is in the off part of the cycle.');
  assert.equal(ctl.purges().events.at(-1).reason, 'timed');
  assert.equal(feed(540, { CO2: null }).air.on, true);
  assert.equal(feed(710, { CO2: null }).air.on, true);
  assert.equal(feed(740, { CO2: null }).air.on, false);
  assert.deepEqual(ctl.status('CO2'), { lvl: 'serious', icon: '!', text: 'Sensor fault' });
  feed(770, { CO2: 800 }); feed(800, { CO2: 801 });
  assert.equal(ctl.state.air.timed, false);
  assert.ok(events.some(e => e.text === 'CO₂ sensor back: timed purge ended'));
});

test('a CO2 sensor fault: the timed purge share is learned from the hours before the fault', () => {
  const a = make(); a.feed(0);
  const snap = a.ctl.snapshot();
  snap.purgeRec.hours = [0, 1, 2, 3].map(h => ({ h, runS: 600, starts: 2, m3: 300, cappedN: 0, fogLS: 0, acHighS: 0, acLowS: 0 }));
  const ctl = CC.create(a.cfg, snap, null);
  let seq = 100;
  const feed = (t, o) => ctl.update({ seq: ++seq, t, T: 25 + (seq % 2) * 0.01, RH: 88 + (seq % 2) * 0.1, CO2: 800 + (seq % 2), tOut: 30, rhOut: 70, ...o });
  feed(14400);
  for (const t of [14430, 14460, 14490]) feed(t, { CO2: null });
  assert.equal(ctl.state.air.timed, true);
  // 600 s per hour x 1.1: share 0.1833; run min(180 s, 330 s) = 180 s; period 180 / 0.1833 = 982 s: on from 15 x 982 = 14727 s
  assert.equal(feed(14730, { CO2: null }).air.on, true);
  assert.equal(ctl.state.why.air, 'CO₂ sensor fault: timed purge, 180 s of each 982 s (from this hour of an earlier day).');
});

const AIR = globalThis.ClimateAir;
// A sealed 60 m³ room: CO2 output prodM3h (m³/h), the air exchange r.airM3h when on, 420 ppm outside.
// step(on, dt) moves r.C with the exact solution of V dC/dt = prod × 10⁶ − Q (C − 420).
function room({ prodM3h = 0.27, airM3h = 900, C = 800 } = {}) {
  const r = {
    C, airM3h,
    step(on, dt) {
      if (!on) { r.C += prodM3h * 1e6 / 60 * dt / 3600; return; }
      const css = 420 + prodM3h * 1e6 / r.airM3h, k = r.airM3h / 60 / 3600;
      r.C = css + (r.C - css) * Math.exp(-k * dt);
    },
  };
  return r;
}

test('3 capped purges in a row raise the size alarm with an estimate; a purge that reaches the stop level clears it', () => {
  assert.ok(CC.ALARMS.some(a => a.id === 'airTooSmall' && a.lvl() === 'warning' && a.label === 'Air exchange too small for the CO₂ load'));
  const { feed, ctl, events, cfg } = make();
  cfg.airM3h = 900;
  const r = room({ airM3h: 900 });                             // 6000 blocks: steady 720 ppm at 900 m³/h, never 700 ppm
  let on = false, t = 0;
  for (; t <= 1800; t += 30) { if (t) r.step(on, 30); on = feed(t, { CO2: r.C }).air.on; }
  const X = ctl.purges();
  assert.ok(X.events.length >= 3, `${X.events.length} purges`);
  for (const e of X.events) assert.deepEqual([e.end - e.start, e.capped, e.reason], [180, true, 'purge']);
  assert.ok(ctl.state.air.capRun >= 3);
  const a = ctl.state.alarms.airTooSmall;
  assert.deepEqual([a.active, a.lvl, a.label], [true, 'warning', 'Air exchange too small for the CO₂ load']);
  const m = /^Purges don't reach 700 ppm in 3 min\. The air exchange needs about (\d+) m³\/h \(now 900 m³\/h\)\.$/.exec(ctl.state.air.sizeText);
  assert.ok(m, ctl.state.air.sizeText);
  const truth = AIR.sizeFor({ volume: 60, co2Out: 420, prodM3h: 0.27, start: 900, stop: 700, capS: 180 }).needM3h;
  assert.ok(Math.abs(Number(m[1]) - truth) / truth <= 0.15, `estimate ${m[1]}, truth ${truth}`);
  assert.ok(ctl.state.why.air.endsWith(` ${ctl.state.air.sizeText}`));
  assert.ok(events.some(e => e.lvl === 'warning' && e.text === `Alarm: Air exchange too small for the CO₂ load. ${ctl.state.air.sizeText}`));
  // A bigger air exchange: the next purge reaches the stop level and the alarm clears.
  cfg.airM3h = 1800; r.airM3h = 1800;
  for (const end = t + 900; t <= end; t += 30) { r.step(on, 30); on = feed(t, { CO2: r.C }).air.on; }
  assert.equal(ctl.state.air.capRun, 0);
  assert.equal(ctl.state.alarms.airTooSmall.active, false);
  assert.equal(ctl.state.air.sizeText, null);
  assert.equal(ctl.purges().events.at(-1).capped, false);
});

test('the size alarm before a rise rate is measured says so', () => {
  const { feed, ctl } = make();
  let t = 0;
  for (let n = 0; n < 3; n++) {                                // CO2 jumps above the start level: no rise rate with the fans off
    for (const end = t + 180; t <= end; t += 30) feed(t, { CO2: 950 + (t % 60 ? 1 : 0) });
    for (const end = t + 30; t <= end; t += 30) feed(t, { CO2: 950 + (t % 60 ? 1 : 0) });
  }
  assert.equal(ctl.state.air.capRun, 3);
  assert.equal(ctl.state.air.sizeText, "Purges don't reach 700 ppm in 3 min. The air exchange is too small; the size needed is not measured yet.");
});

test('an old snapshot (one fan with levels) is upgraded by create()', () => {
  const { ctl, feed } = make(); feed(0); feed(30);
  const s = ctl.snapshot();                                     // made old by hand: the fields a version 1 controller saved
  delete s.air; delete s.airReason; delete s.airPts; delete s.airRate; delete s.purgeRec;
  Object.assign(s, { fanCo2On: true, co2Timed: false, purgeHeld: false, purgeReduced: false, setbackReq: true, setbackOn: true, setbackS: 120,
    setbackAlarmStop: false, setbackTimeStop: false, fanReason: 'CO₂ purge', fanBlocked: false, airLevel: 2, airStepT: 0, timedOnS: 300, timedSource: 'setting' });
  for (const g of ['cmd', 'req']) { delete s[g].air; s[g].fan = { level: 2 }; }
  s.out.fan = { since: 0 }; delete s.out.air;
  s.hold.fan = ''; delete s.hold.air;
  s.why.fan = 'CO₂ is 950 ppm. Purge at Medium.'; delete s.why.air;
  s.stats = { fanOnS: 3600, fanStarts: 12, fogStarts: 3, setbackS: 600, acOffS: 0, fanBlockedS: 0, acCmds: 7 };
  s.exh = { cur: { start: 0, end: null, maxLevel: 2, reason: 'CO₂ purge', co2Start: 950, co2End: null, m3: 5 },
    events: [{ start: -600, end: -300, maxLevel: 2, reason: 'CO₂ purge', co2Start: 950, co2End: 700, m3: 50 }],
    hours: [{ h: 0, runS: 300, starts: 1, m3: 50, fogLS: 30, acHighS: 0, acLowS: 0 }] };
  s.prev = { power: true, mode: 'cool', setback: true, fanOn: true, fanReason: 'CO₂ purge', fogOn: false, lights: true, blocked: false, reduced: false, safety: false, timed: false };
  const events = [];
  const up = CC.create(CC.defaultSettings(), s, e => events.push(e));
  const st = up.state;
  for (const k of ['fanCo2On', 'co2Timed', 'purgeHeld', 'purgeReduced', 'setbackReq', 'setbackOn', 'setbackS', 'setbackAlarmStop', 'setbackTimeStop',
    'fanReason', 'fanBlocked', 'airLevel', 'airStepT', 'timedOnS', 'timedSource', 'exh']) assert.equal(k in st, false, k);
  assert.deepEqual([st.cmd.air, st.req.air, 'fan' in st.cmd, 'fan' in st.req], [{ on: false }, { on: false }, false, false]);
  assert.deepEqual(st.air, { state: 'idle', since: null, purgeStart: null, capRun: 0, nextPurgeS: null, delayed: false, timed: false, timedK: null, timedFrom: null, sizeText: null });
  assert.deepEqual([st.out.air, st.hold.air, st.why.air, 'fan' in st.out, 'fan' in st.hold, 'fan' in st.why], [{ since: 0 }, '', 'CO₂ is 950 ppm. Purge at Medium.', false, false, false]);
  assert.deepEqual(up.purges(), { cur: null, events: [], hours: [{ h: 0, runS: 300, starts: 1, m3: 50, cappedN: 0, fogLS: 30, acHighS: 0, acLowS: 0 }] });
  assert.deepEqual(st.stats, { airOnS: 3600, purges: 12, purgeS: 0, longestPurgeS: 0, cappedPurges: 0, delayedS: 0, fogStarts: 3, acCmds: 7 });
  assert.equal(st.prev, null);
  const cmd = up.update({ seq: 99, t: 60, T: 25, RH: 88, CO2: 800, tOut: 30, rhOut: 70 });
  assert.equal(cmd.air.on, false, 'the next step runs on the new model');
  assert.deepEqual(events.filter(e => /Air exchange/.test(e.text)), [], 'no event from the old log state');
  const again = CC.create(CC.defaultSettings(), up.snapshot(), null);
  assert.deepEqual(again.state, up.state, 'a version 2 snapshot is not changed');
});

test('sensor check: a falling CO2 is no spike while the fans run and for one reading after; a rise still is', () => {
  const { feed, ctl } = make({ rules: { co2Safety: false, purgeMaxS: 60 } });
  feed(0, { CO2: 3000 });                                       // purge
  feed(30, { CO2: 2400 });                                      // -1200 ppm/min with the fans on
  assert.deepEqual([ctl.state.v.CO2, ctl.state.sensors.CO2.why], [2400, '']);
  assert.equal(feed(60, { CO2: 1800 }).air.on, false, 'the cap: off at 60 s');
  assert.equal(ctl.state.v.CO2, 1800);
  feed(90, { CO2: 1200 });                                      // the one reading after the fans stopped
  assert.equal(ctl.state.v.CO2, 1200);
  feed(120, { CO2: 600 });                                      // the fans were off for a whole interval: tested again
  assert.deepEqual([ctl.state.v.CO2, ctl.state.sensors.CO2.why], [1200, 'sudden jump (spike)']);
  const b = make({ rules: { co2Safety: false } });
  b.feed(0, { CO2: 1000 });
  assert.equal(b.ctl.state.cmd.air.on, true);
  b.feed(30, { CO2: 1700 });                                    // +1400 ppm/min with the fans on: a rise is still tested
  assert.deepEqual([b.ctl.state.v.CO2, b.ctl.state.sensors.CO2.why], [1000, 'sudden jump (spike)']);
});

// ---------- Spec review fixes (C9 5.5, 5.6, 5.7) ----------
test('the size text when outside air alone cannot reach the stop level', () => {
  const { feed, ctl, cfg } = make({ rules: { fanOff: 410 } });
  cfg.airM3h = 900;
  const r = room({ airM3h: 900 });
  let on = false;
  for (let t = 0; t <= 1800; t += 30) { if (t) r.step(on, 30); on = feed(t, { CO2: r.C }).air.on; }
  assert.ok(ctl.state.air.capRun >= 3);
  assert.equal(ctl.state.air.sizeText, "Purges don't reach 410 ppm in 3 min: outside air alone cannot bring CO₂ this low; raise the stop level.");
});

test('"Purge allowed again" is said only when RH recovers, not when the lock drops for another reason', () => {
  const delayed = () => {
    const a = make();
    for (let t = 0; t <= 300; t += 30) a.feed(t, { CO2: 850 + (t % 60 ? 1 : 0), ...lowRH(t) });
    a.feed(330, { CO2: 950, ...lowRH(330) });
    assert.equal(a.ctl.state.air.delayed, true);
    return a;
  };
  const a = delayed();
  a.cfg.manual.air = { auto: false, on: false };
  a.feed(360, { CO2: 950, ...lowRH(360) });
  assert.equal(a.ctl.state.air.delayed, false);
  assert.equal(a.events.some(e => e.text === 'Purge allowed again: humidity recovered'), false, 'manual control');
  const b = delayed();
  b.feed(360, { CO2: 950, RH: 87.2, ...DRY });
  assert.ok(b.events.some(e => e.text === 'Purge allowed again: humidity recovered'), 'RH recovered');
  const allowed = () => b.events.filter(e => e.text === 'Purge allowed again: humidity recovered').length;
  assert.equal(allowed(), 1);
  for (let t = 390; t <= 960; t += 30) b.feed(t, { CO2: 850 + (t % 60 ? 1 : 0), ...lowRH(t) });   // fog to full again, lock again
  b.feed(990, { CO2: 950, ...lowRH(990) });
  assert.equal(b.ctl.state.air.delayed, true, 'delayed again');
  b.cfg.manual.air = { auto: false, on: false };
  b.feed(1020, { CO2: 950, ...lowRH(1020) });
  assert.equal(allowed(), 1, 'manual control: no second event');
});

test('switching to manual during a CO2 sensor fault does not say the sensor is back', () => {
  const { feed, ctl, cfg, events } = make();
  feed(0, { CO2: 800 });
  for (const t of [30, 60, 90]) feed(t, { CO2: null });
  assert.equal(ctl.state.air.timed, true);
  cfg.manual.air = { auto: false, on: false };
  feed(120, { CO2: null });
  assert.equal(ctl.state.air.timed, false);
  assert.equal(events.some(e => e.text === 'CO₂ sensor back: timed purge ended'), false);
});

// ---------- Quality review fixes ----------
test('timed purge: each period runs once at its first reading, whatever the reading times are', () => {
  const a = make(); a.feed(0);
  const snap = a.ctl.snapshot();
  snap.purgeRec.hours = [0, 1, 2, 3].map(h => ({ h, runS: 60, starts: 1, m3: 30, cappedN: 0, fogLS: 0, acHighS: 0, acLowS: 0 }));
  const ctl = CC.create(a.cfg, snap, null);
  let seq = 100;
  const feed = (t, o) => ctl.update({ seq: ++seq, t, T: 25 + (seq % 2) * 0.01, RH: 88 + (seq % 2) * 0.1, CO2: 800 + (seq % 2), tOut: 30, rhOut: 70, ...o });
  feed(14440);
  // 60 s per hour x 1.1 is under the 2 % floor: share 0.02, run 36 s, period 1800 s. Readings each 60 s at 40 s past the minute never hit t mod 1800 < 36.
  const seen = new Set();
  for (let t = 14500; t <= 14440 + 6 * 3600; t += 60) { if (feed(t, { CO2: null }).air.on) seen.add(Math.floor(t / 1800)); }
  assert.equal(ctl.state.air.timed, true);
  for (let k = Math.floor(14560 / 1800) + 1; k < Math.floor((14440 + 6 * 3600) / 1800); k++) assert.ok(seen.has(k), `period ${k}`);
});

test('timed purge: the timed text is used only for a timed run or when the fans are off; free cooling keeps its text', () => {
  const { feed, ctl } = make();
  const o = { T: 25.4, tOut: 20 };
  feed(0, { CO2: 800, ...o });
  for (const t of [30, 60, 90]) feed(t, { CO2: null, ...o });
  assert.equal(ctl.state.airReason, 'timed');
  feed(270, { CO2: null, ...o });
  assert.equal(ctl.state.airReason, 'free cooling');
  assert.match(ctl.state.why.air, /^Outdoor air is 5\.4 °C cooler\. The air exchange runs to help the AC\./);
  feed(630, { CO2: null, T: 25, tOut: 30 });
  assert.equal(ctl.state.air.timed, true);
});

test('a manual change during a purge ends it without touching the capped counters', () => {
  const { feed, ctl, cfg } = make();
  for (let t = 0; t <= 180; t += 30) feed(t, { CO2: 950 + (t % 60 ? 1 : 0) });   // one capped purge
  assert.deepEqual([ctl.state.air.capRun, ctl.state.stats.cappedPurges], [1, 1]);
  feed(210, { CO2: 950 }); assert.equal(feed(240, { CO2: 951 }).air.on, true);
  assert.equal(ctl.state.air.state, 'purge');
  cfg.manual.air = { auto: false, on: false };
  feed(270, { CO2: 940 });
  assert.deepEqual([ctl.state.air.state, ctl.state.air.capRun, ctl.state.stats.cappedPurges, ctl.state.stats.purges], ['idle', 1, 1, 2]);
});

test('a purge can start while free cooling already holds the fans on', () => {
  const { feed, ctl } = make();
  assert.equal(feed(0, { T: 25.4, tOut: 20 }).air.on, true);
  assert.equal(ctl.state.airReason, 'free cooling');
  assert.equal(feed(30, { T: 25.4, tOut: 20, CO2: 950 }).air.on, true);
  assert.deepEqual([ctl.state.air.state, ctl.state.air.purgeStart, ctl.state.stats.purges], ['purge', 30, 1]);
});

test('CO2 at the stop level on the step where the time cap is reached is not a capped purge', () => {
  const { feed, ctl } = make({ rules: { purgeMaxS: 60 } });
  feed(0, { CO2: 950 });
  assert.equal(feed(60, { CO2: 690 }).air.on, false);
  assert.deepEqual([ctl.state.air.state, ctl.state.air.capRun, ctl.state.stats.cappedPurges], ['after', 0, 0]);
});

test('a timed run that is still on at a period boundary is not restarted: it never lasts longer than purgeMaxS', () => {
  const { feed, ctl } = make();
  feed(400, { CO2: 800 });
  for (const t of [430, 460]) feed(t, { CO2: null });
  const onAt = [];
  for (let t = 490; t <= 760; t += 30) if (feed(t, { CO2: null }).air.on) onAt.push(t);   // fault seen at 490; period 540, run 180
  assert.equal(ctl.state.air.timed, true);
  assert.equal(onAt[0], 490);
  assert.ok(onAt.at(-1) - 490 < 180, `on until ${onAt.at(-1)}`);
  assert.equal(ctl.state.stats.longestPurgeS, 0, 'a timed run is not a purge');
});

test('an upgraded snapshot starts with the air exchange off; the next steps run a normal purge with a record', () => {
  const { ctl, feed } = make(); feed(0); feed(30);
  const s = ctl.snapshot();
  delete s.air; delete s.airReason; delete s.airPts; delete s.airRate; delete s.purgeRec;
  for (const g of ['cmd', 'req']) { delete s[g].air; s[g].fan = { level: 1 }; }
  s.out.fan = { since: 0 }; delete s.out.air; s.hold.fan = ''; delete s.hold.air; s.why.fan = ''; delete s.why.air;
  s.stats = { fanOnS: 10, fanStarts: 1, fogStarts: 0, acCmds: 0 };
  s.exh = { cur: null, events: [], hours: [] };
  const up = CC.create(CC.defaultSettings(), s, null);
  assert.deepEqual([up.state.cmd.air.on, up.state.req.air.on, up.purges().cur, up.state.airReason], [false, false, null, null]);
  let seq = 500;
  const step = (t, CO2) => up.update({ seq: ++seq, t, T: 25 + (seq % 2) * 0.01, RH: 88 + (seq % 2) * 0.1, CO2, tOut: 30, rhOut: 70 });
  assert.equal(step(60, 950).air.on, true);
  assert.deepEqual([up.purges().cur.start, up.purges().cur.reason, up.state.airReason, up.state.air.state], [60, 'purge', 'purge', 'purge']);
});

test('default purge levels: the stop level is never below 600 ppm, and stays 50 below the start (owner decision 2026-10-09)', () => {
  // Purging close to outdoor air (about 420 ppm) is slow: a 500 ppm stop needed 244 s at 1800 m³/h for 2000 blocks.
  const levels = lim => { const R = CC.defaultRules(lim); return [R.fanOn, R.fanOff]; };
  assert.deepEqual(levels(700), [600, 550]);
  assert.deepEqual(levels(800), [700, 600]);
  assert.deepEqual(levels(1000), [900, 700]);
  assert.deepEqual(levels(5000), [4900, 4700]);
});

// ---------- C8 5.4: lion's mane (draft) ----------
test("LM1 lion's mane is the last crop, with its draft profile", () => {
  assert.deepEqual(CC.CROPS.lionsmane, { name: "Lion's mane", spawn: [23, 80, 5000], pinning: [17, 92, 1000], fruiting: [20, 90, 1000], rest: [21, 80, 2000],
    limits: { tMin: 14, tMax: 27, coreMax: 30 }, coreTarget: 25, range: { T: [16, 22], RH: [85, 92] }, cool: true, wetRH: { pinning: 98 } });
  assert.equal(Object.keys(CC.CROPS).filter(k => k !== 'flagTest').at(-1), 'lionsmane');   // flagTest: a crop that tests add to CROPS
  assert.equal(CC.importSettings(CC.exportSettings({ ...CC.defaultSettings(), crop: 'lionsmane' })).settings.crop, 'lionsmane');
  const p = CC.profileTargets('lionsmane', 'pinning');
  assert.deepEqual([p.spT, p.spRH, p.co2Lim, p['rules.fanOn'], p['rules.fanOff']], [17, 92, 1000, 900, 700]);
});

test("LM2 no other crop has the cool flag or a wet line", () => {
  for (const [k, c] of Object.entries(CC.CROPS)) if (k !== 'lionsmane') { assert.equal('cool' in c, false, k); assert.equal('wetRH' in c, false, k); }
});

// ---------- C8 5.4.3: no heat mode while the outdoor air is warm (cool crops only) ----------
test('COOL2 a cool crop does not heat while the outdoor air is warm', () => {
  const modeOf = (crop, T, out) => {
    const cfg = CC.defaultSettings();
    cfg.crop = crop; cfg.stage = 'fruiting'; CC.applyProfile(cfg); cfg.program.harvest.on = false;
    const ctl = CC.create(cfg, null, null);
    for (let t = 0, seq = 1; t <= 600; t += 30, seq++) {
      ctl.update({ seq, t, hour: 12, T: T + (seq % 2) * 0.01, RH: 90 + (seq % 2) * 0.1, CO2: 600 + (seq % 2), ...out });
    }
    return ctl.state.acMode;
  };
  assert.equal(modeOf('lionsmane', 18.8, { tOut: 30, rhOut: 60 }), 'cool');
  assert.equal(modeOf('lionsmane', 18.8, { tOut: 15, rhOut: 60 }), 'heat');
  assert.equal(modeOf('lionsmane', 18.8, { tOut: 21, rhOut: 60 }), 'heat');
  assert.equal(modeOf('lionsmane', 18.8, { tOut: 21.5, rhOut: 60 }), 'cool');
  assert.equal(modeOf('lionsmane', 18.8, {}), 'heat');
  assert.equal(modeOf('oyster', 23.8, { tOut: 30, rhOut: 60 }), 'heat');
});
