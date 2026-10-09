// Integration tests: the simulation and the controller together over 2-3 simulated days.
// The scores use the real room (sim.view), not the sensors. Limits have a margin over the measured values.
const test = require('node:test');
const assert = require('node:assert/strict');
const { run, CC } = require('./harness.js');
const AIR = globalThis.ClimateAir;
// Steady control tests switch the harvest windows off; the harvest has its own test.
const noHarvest = () => { const p = CC.defaultProgram(); p.harvest.on = false; return { program: p }; };
const fault = (faults, faultAt = 30) => ({ hours: 72, measureFrom: 48, faultAt, faults, cfg: noHarvest() });

test('default oyster fruiting, tropical weather: in band, few starts', () => {
  const r = run({ cfg: noHarvest() });
  assert.ok(r.inT >= 98, `temperature in band ${r.inT}`);
  assert.ok(r.inRH >= 97, `humidity in band ${r.inRH}`);
  assert.ok(r.overMin <= 10, `CO2 over limit ${r.overMin} min`);
  assert.ok(r.acStarts <= 30, `AC compressor starts ${r.acStarts}/day`);
  assert.equal(r.cappedPurges, 0, 'capped purges');
});

test('CO2 sensor fault: the timed purge copies earlier days and holds CO2', () => {
  const r = run(fault({ CO2: 'missing' }));
  assert.ok(r.overMin <= 60, `CO2 over limit ${r.overMin} min`);
  assert.ok(r.inRH >= 90, `humidity in band ${r.inRH}`);
});

test('humidity sensor fault: fog and AC fan copy the same hour of an earlier day; no low-humidity time', () => {
  const r = run(fault({ RH: 'missing' }));
  assert.ok(r.inRH >= 50, `humidity in band ${r.inRH}`);       // open loop: wider than the band, inside the alarm limits
  assert.equal(r.rhLowMin, 0);
});

test('a second sensor set next to the main set takes over when the main humidity sensor fails', () => {
  // In another position the second set measures other air (low near the fogger, high near the inlet).
  const one = run(fault({ RH: 'missing' })), two = run({ ...fault({ RH: 'missing' }), env: { sensor2At: 'mid' } });
  assert.ok(two.inRH >= 95 && two.inRH > one.inRH, `with a second set ${two.inRH} > ${one.inRH}`);
});

test('temperature sensor fault: the AC thermostat holds the room', () => {
  const r = run(fault({ T: 'range' }));
  assert.ok(r.inT >= 95, `temperature in band ${r.inT}`);
});

test('spikes on all sensors are filtered', () => {
  const r = run(fault({ T: 'spike', RH: 'spike', CO2: 'spike', out: 'spike' }));
  assert.ok(r.inT >= 90, `temperature in band ${r.inT}`);
  assert.ok(r.inRH >= 90, `humidity in band ${r.inRH}`);
});

test('harvest windows dry the room for picking without a low-humidity alarm', () => {
  const on = run(), off = run({ cfg: noHarvest() });
  assert.ok(on.inRH < off.inRH, 'the room is drier with harvest windows');
  assert.equal(on.rhLowMin, 0, 'the harvest floor keeps RH above the alarm limit');
  assert.ok(on.inT >= 98, `temperature in band ${on.inT}`);
});

// ---------- Phase 2 ----------
test('spawn run with a block probe keeps the core below its alarm limit', () => {
  const p = CC.defaultProgram(); p.harvest.on = false;
  const base = { cfg: { program: p, stage: 'spawn', spT: 24, spRH: 70, co2Lim: 5000, rules: CC.defaultRules(5000) }, env: { blockStage: 'spawn', blocks: 3000 } };
  const withCore = run(base);
  const p2 = CC.defaultProgram(); p2.harvest.on = false; p2.coreControl = false;
  const noCore = run({ ...base, cfg: { ...base.cfg, program: p2, rules: CC.defaultRules(5000) } });
  assert.ok(withCore.sim.view().core < noCore.sim.view().core - 1, `core ${withCore.sim.view().core.toFixed(1)} vs ${noCore.sim.view().core.toFixed(1)}`);
  assert.ok(withCore.sim.view().core < 32, 'below the oyster core alarm limit');
});

test('a frozen humidity sensor is found within 60 min (response check)', () => {
  const r = run({ hours: 32, measureFrom: 30, faultAt: 30, faults: { RH: 'frozen' }, cfg: noHarvest() });
  const s = r.ctl.state.sensors.RH;
  assert.equal(s.fault, true);
  assert.ok(s.faultSince - 30 * 3600 <= 3600, `found after ${((s.faultSince - 30 * 3600) / 60).toFixed(0)} min`);
});

test('harvest doors, workers, and rain cause no false sensor faults', () => {
  const r = run({ cfg: noHarvest(), env: { harvestDoors: true, randomWeather: true, rainChance: 1 } });
  assert.ok(Object.values(r.ctl.state.sensors).every(s => !s.fault));
  assert.equal(r.rhLowMin, 0);
});

test('the AC-too-small warning comes on when the room cannot be held', () => {
  const r = run({ cfg: { ...noHarvest(), spT: 18 } });          // 18 °C on a 33 °C day: below what the AC can hold
  // It comes on in the hot hours (it can clear at night): it stays in the list until a person acknowledges it.
  assert.ok(r.ctl.alarmList().some(a => a.id === 'acTooSmall'));
});

// ---------- Air exchange (C9) ----------
const crowded = { blocks: 6000, airM3h: 1800 };

test('6000 blocks at 1800 m³/h: every purge within the cap, CO₂ never above the limit', () => {
  const r = run({ env: crowded, cfg: noHarvest() });
  assert.ok(r.purges > 100, `purges ${r.purges}/day`);
  assert.equal(r.cappedPurges, 0);
  assert.ok(r.longestPurgeS <= 180, `longest purge ${r.longestPurgeS} s`);
  assert.ok(r.overMin <= 1, `CO₂ over the limit ${r.overMin} min/day`);
  assert.ok(!r.alarmIds.some(id => id.startsWith('sensor_')), `frequent purges cause no false sensor faults: ${r.alarmIds}`);
});

test('6000 blocks at 900 m³/h: the size alarm, with an estimate near the true need', () => {
  const r = run({ hours: 12, measureFrom: 6, env: { blocks: 6000, airM3h: 900 }, cfg: { ...noHarvest(), airM3h: 900 } });
  assert.ok(r.alarmIds.includes('airTooSmall'), `alarms ${r.alarmIds}`);
  const R = CC.defaultRules(CC.defaultSettings().co2Lim);
  const truth = AIR.sizeFor({ volume: 60, co2Out: 420, prodM3h: 6000 * 45 / 1e6, start: R.fanOn, stop: R.fanOff, capS: 180 }).needM3h;
  const est = Number(/needs about (\d+)/.exec(r.sizeText)[1]);
  assert.ok(Math.abs(est - truth) / truth <= 0.15, `estimate ${est}, truth ${truth}`);
});

test('2000 blocks at 1800 m³/h: short purges keep the room in band', () => {
  const r = run({ env: { blocks: 2000, airM3h: 1800 }, cfg: noHarvest() });
  assert.ok(r.inT >= 98, `temperature in band ${r.inT}`);
  assert.ok(r.inRH >= 97, `humidity in band ${r.inRH}`);
  assert.equal(r.cappedPurges, 0);
  assert.ok(!r.alarmIds.some(id => id.startsWith('sensor_')), `no false sensor faults: ${r.alarmIds}`);
});
