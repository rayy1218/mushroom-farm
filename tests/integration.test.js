// Integration tests: the simulation and the controller together over 2-3 simulated days.
// The scores use the real room (sim.view), not the sensors. Limits have a margin over the measured values.
const test = require('node:test');
const assert = require('node:assert/strict');
const { run, CC } = require('./harness.js');
// Steady control tests switch the harvest windows off; the harvest has its own test.
const noHarvest = () => { const p = CC.defaultProgram(); p.harvest.on = false; return { program: p }; };
const fault = (faults, faultAt = 30) => ({ hours: 72, measureFrom: 48, faultAt, faults, cfg: noHarvest() });

test('default oyster fruiting, tropical weather: in band, few starts', () => {
  const r = run({ cfg: noHarvest() });
  assert.ok(r.inT >= 98, `temperature in band ${r.inT}`);
  assert.ok(r.inRH >= 97, `humidity in band ${r.inRH}`);
  assert.ok(r.overMin <= 10, `CO2 over limit ${r.overMin} min`);
  assert.ok(r.acStarts <= 30, `AC compressor starts ${r.acStarts}/day`);
  assert.ok(r.fanStarts <= 120, `fan starts ${r.fanStarts}/day`);
});

test('purge mode: a 0.5 °C setback keeps the AC compressor running; "AC off" restarts it at each purge', () => {
  const small = run({ rules: { airMode: 'purge', acSetbackC: 0.5 }, cfg: noHarvest() }), off = run({ rules: { airMode: 'purge', acAction: 'off' }, cfg: noHarvest() });
  assert.ok(small.acStarts <= 6, `setback 0.5: ${small.acStarts} starts/day`);
  assert.ok(off.acStarts >= 50, `AC off: ${off.acStarts} starts/day`);
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
test('old layout (exhaust, purge): AC fan speed control reduces the water that the AC removes and the fogger adds back', () => {
  // With the supply fan and steady air (the defaults) the effect is small; this test keeps the rule correct.
  const on = run({ cfg: noHarvest(), rules: { airMode: 'purge' }, env: { vent: 'exhaust', inletAt: 'low', exhaustAt: 'high' } }), off = run({ cfg: noHarvest(), rules: { airMode: 'purge', acFanRH: false }, env: { vent: 'exhaust', inletAt: 'low', exhaustAt: 'high' } });
  const fogOn = on.sim.view().water.fogKg, fogOff = off.sim.view().water.fogKg;
  assert.ok(fogOn < fogOff * 0.85, `fog water ${fogOn.toFixed(1)} < ${fogOff.toFixed(1)} kg`);
  assert.ok(on.inRH >= off.inRH, 'humidity control is not worse');
});

test('a filtered supply fan cuts the unfiltered air by more than 80 %', () => {
  const ex = run({ cfg: noHarvest(), env: { vent: 'exhaust' } }), sup = run({ cfg: noHarvest(), env: { vent: 'supply' } });
  assert.ok(sup.sim.view().unfilteredM3 < ex.sim.view().unfilteredM3 * 0.2);
  assert.ok(sup.overMin <= 10, 'CO2 still controlled');
});

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

test('steady fresh air (default): no bursts, stable CO2, no unfiltered air', () => {
  const r = run({ cfg: noHarvest() });
  assert.ok(r.fanStarts <= 2, `fan starts ${r.fanStarts}/day`);
  assert.ok(r.overMin === 0 && r.inT >= 98 && r.inRH >= 97, JSON.stringify({ over: r.overMin, inT: r.inT, inRH: r.inRH }));
  assert.equal(r.sim.view().unfilteredM3, 0);
});

test('the AC-too-small warning comes on when the room cannot be held', () => {
  const r = run({ cfg: { ...noHarvest(), spT: 18 } });          // 18 °C on a 33 °C day: below what the AC can hold
  // It comes on in the hot hours (it can clear at night): it stays in the list until a person acknowledges it.
  assert.ok(r.ctl.alarmList().some(a => a.id === 'acTooSmall'));
});
