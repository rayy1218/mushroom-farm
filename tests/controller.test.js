// Unit tests for controller.js. Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
require('../air.js');
require('../controller.js');
const CC = globalThis.ClimateController;

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
