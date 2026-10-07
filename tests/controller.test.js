// Unit tests for controller.js. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
require('../controller.js');
const CC = globalThis.ClimateController;

// A controller with default oyster-fruiting settings: target 25 °C / 88 %, CO2 limit 1000,
// fan 700-900 ppm, safety level 1500, min on/off 2 min, AC command every 2 min.
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

test('purge mode: the fan starts at the start level and stops at the stop level', () => {
  const { feed } = make({ rules: { airMode: 'purge' } });
  assert.equal(feed(0, { CO2: 850 }).fan.level, 0);
  assert.equal(feed(30, { CO2: 900 }).fan.level, 2);          // start at >= 900, purge level Medium
  assert.equal(feed(150, { CO2: 750 }).fan.level, 2);         // hysteresis: still on
  assert.equal(feed(180, { CO2: 700 }).fan.level, 0);         // stop at <= 700
});

test('purge mode: the fan keeps its minimum run time and minimum off time', () => {
  const { feed, ctl } = make({ rules: { airMode: 'purge' } });
  feed(0, { CO2: 950 });                                       // on at t=0
  assert.equal(feed(60, { CO2: 690 }).fan.level, 2, 'still in minimum run time');
  assert.match(ctl.state.hold.fan, /Minimum run time/);
  assert.equal(feed(120, { CO2: 690 }).fan.level, 0, 'run time done: off');
  assert.equal(feed(150, { CO2: 950 }).fan.level, 0, 'still in minimum off time');
  assert.equal(feed(240, { CO2: 950 }).fan.level, 2, 'off time done: on');
});

test('humidity first (action "stop"): after 5 min of full fog the fan stops at once; the purge continues after recovery', () => {
  const { feed, ctl } = make({ rules: { airMode: 'purge', rhAction: 'stop' } });
  for (let t = 0; t <= 300; t += 30) feed(t, { CO2: 950, RH: 83 + (t % 60) * 0.001 });   // deficit 6: fog level 3 (full)
  assert.equal(ctl.state.cmd.hu.level, 3);
  assert.equal(feed(330, { CO2: 950, RH: 83 }).fan.level, 0, 'full fog for 5 min and RH <= 85: the fan stops without the minimum run time');
  assert.equal(ctl.state.fanBlocked, true);
  assert.equal(feed(360, { CO2: 950, RH: 86 }).fan.level, 0, 'below the allow level 87');
  assert.equal(feed(480, { CO2: 950, RH: 87.2 }).fan.level, 2, 'RH >= 87: purge continues');
});

test('humidity first gives the fogger 5 min at full before the air is reduced', () => {
  const { feed, ctl } = make({ rules: { airMode: 'purge', rhAction: 'stop' } });
  for (let t = 0; t <= 270; t += 30) feed(t, { CO2: 950, RH: 83 + (t % 60) * 0.001 });   // below the stop level, fog at full
  assert.equal(ctl.state.cmd.hu.level, 3);
  assert.equal(ctl.state.rhLocked, false, 'not yet: fog more before less air');
  assert.equal(ctl.state.cmd.fan.level, 2);
  feed(300, { CO2: 950, RH: 83 });
  assert.equal(ctl.state.rhLocked, true, 'after 5 min of full fog');
});

test('steady fresh air: base level Low, one step each 5 min with CO2, never below the base in fruiting', () => {
  const { feed, ctl } = make();
  assert.equal(feed(0, { CO2: 800 }).fan.level, 1, 'fruiting base level Low');
  assert.equal(feed(30, { CO2: 950 }).fan.level, 1, 'next step only after 5 min');
  assert.equal(feed(300, { CO2: 950 }).fan.level, 2);
  assert.equal(feed(600, { CO2: 950 }).fan.level, 3);
  assert.equal(feed(900, { CO2: 680 }).fan.level, 2, 'one step down');
  assert.equal(feed(1200, { CO2: 680 }).fan.level, 1);
  assert.equal(feed(1500, { CO2: 650 }).fan.level, 1, 'never below the base level');
  assert.equal(ctl.state.stats.fanStarts, 1, 'one start only');
});

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

test('humidity first can reduce the fan to Low instead of a stop', () => {
  const { feed } = make({ rules: { rhAction: 'low' } });
  feed(0, { CO2: 950 });
  assert.equal(feed(30, { CO2: 950, RH: 84 }).fan.level, 1);
});

test('the CO2 safety level runs the fan even when humidity is low, with a critical alarm', () => {
  const { feed, ctl } = make();
  feed(0, { CO2: 1550, RH: 80 });
  const cmd = feed(90, { CO2: 1551, RH: 80.1 });                 // critical alarms have a 60 s delay
  assert.equal(cmd.fan.level, 2);
  assert.equal(ctl.state.alarms.co2Safe.lvl, 'critical');
  assert.equal(ctl.state.alarms.co2Safe.active, true);
});

test('during a purge the AC setpoint goes up (setback); the AC is not turned off', () => {
  const { feed } = make();
  const a0 = feed(0, { CO2: 800 }).ac;
  assert.equal(a0.power, true);
  const base = a0.setpoint;
  feed(30, { CO2: 950 });                                      // purge starts; AC command must wait 2 min
  const a1 = feed(150, { CO2: 950 }).ac;
  assert.equal(a1.power, true);
  assert.equal(a1.setpoint, base + 1);
  feed(300, { CO2: 690 });                                     // purge ends
  assert.equal(feed(450, { CO2: 690 }).ac.setpoint, base);
});

test('the old rule "AC off during purge" is still available for comparison', () => {
  const { feed } = make({ rules: { acAction: 'off' } });
  feed(0, { CO2: 800 });
  feed(30, { CO2: 950 });
  assert.equal(feed(150, { CO2: 950 }).ac.power, false);
});

test('the setback ends at the longest setback time', () => {
  const { feed, ctl } = make({ rules: { maxSetback: 5 } });
  feed(0, { CO2: 950 });
  feed(30, { CO2: 950 });
  assert.equal(ctl.state.setbackOn, true);
  feed(30 + 5 * 60 + 30, { CO2: 950 });
  assert.equal(ctl.state.setbackOn, false);
  assert.match(ctl.state.why.ac, /cancelled: it reached 5 min/);
});

test('purge mode: the fogger never stops for a purge, and fogs one level more', () => {
  const { feed } = make({ rules: { airMode: 'purge' } });
  feed(0, { CO2: 800, RH: 85.5 });                             // RH < 86: fogger on, deficit 3.5 -> level 2
  const lvNoPurge = feed(30, { CO2: 800, RH: 85.6 }).hu.level;
  assert.equal(lvNoPurge, 2);
  const lvPurge = feed(60, { CO2: 950, RH: 86.5 }).hu.level;   // purge, RH above the stop level
  assert.equal(lvPurge, 3, 'fogger stays on during the purge, one level more (deficit 2.5 -> 2, +1)');
});

test('a missing CO2 sensor gives a fault after 3 readings and starts the timed purge', () => {
  const { feed, ctl } = make();
  feed(0, { CO2: 800 });
  feed(30, { CO2: null });
  feed(60, { CO2: null });
  assert.equal(ctl.state.sensors.CO2.fault, false);
  feed(90, { CO2: null });
  assert.equal(ctl.state.sensors.CO2.fault, true);
  assert.equal(ctl.state.alarms.sensor_CO2.active, true);
  // timed purge: 5 min on every 30 min (by the clock)
  assert.equal(feed(1800 + 60, { CO2: null }).fan.level, 2);
  assert.equal(feed(1800 + 600, { CO2: null }).fan.level, 0);
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

test('the exhaust record counts each exhaust and splits the air volume at the full hour', () => {
  const { feed, ctl } = make({ rules: { airMode: 'purge' } });
  feed(3000, { CO2: 950 });                                    // on at 50 min, Medium = 600 m³/h
  feed(3300, { CO2: 950 });
  feed(3600 + 600, { CO2: 690 });                              // off at 1 h 10 min
  const X = ctl.exhaust();
  assert.equal(X.events.length, 1);
  const e = X.events[0];
  assert.equal(e.end - e.start, 1200);
  assert.equal(Math.round(e.m3), 200);                         // 20 min at 600 m³/h
  const h0 = X.hours.find(b => b.h === 0), h1 = X.hours.find(b => b.h === 1);
  assert.equal(h0.runS, 600); assert.equal(Math.round(h0.m3), 100); assert.equal(h0.starts, 1);
  assert.equal(h1.runS, 600); assert.equal(Math.round(h1.m3), 100); assert.equal(h1.starts, 0);
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
  feed(2 * 3600);
  assert.equal(cfg.spT, 24.5);
  assert.equal(cfg.spRH, 90);
  assert.equal(cfg.co2Lim, 900);
  feed(4 * 3600 + 30);
  assert.equal(cfg.spT, 24); assert.equal(cfg.spRH, 92); assert.equal(cfg.co2Lim, 800);
  assert.equal(ctl.programStatus(4 * 3600 + 30).ramp, null);
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

// No crop in the list uses the flags maxFog, noFogBoost, shock and spawnLights now: a test crop checks them.
CC.CROPS.flagTest = { ...CC.CROPS.oyster, name: 'Flag test', maxFog: 2, noFogBoost: true, shock: { T: 20, hours: 24 }, spawnLights: true };

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
