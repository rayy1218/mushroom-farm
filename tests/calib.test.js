// Calibration tests: a log from a "hidden" room; the fit must find the hidden values.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js'); require('../air.js'); require('../controller.js'); require('../calib.js');
const SIM = globalThis.ClimateSim, CC = globalThis.ClimateController, CAL = globalThis.ClimateCalib;
const EXHAUST = { vent: 'exhaust', inletAt: 'low', exhaustAt: 'high' };

function makeLog(hidden, hours = 24) {
  const e = structuredClone(SIM.DEFAULT_ENV);
  e.room = { ua: hidden.ua, infAch: hidden.infAch, moistBuffer: hidden.moistBuffer };
  e.co2PerBlock = hidden.co2PerBlock;
  Object.assign(e, EXHAUST);   // leakage matters only under suction; a supply fan that always runs hides it
  const cfg = CC.defaultSettings(); cfg.program.harvest.on = false;
  const sim = SIM.create(e), ctl = CC.create(cfg, null, null);
  let r = sim.read(), cmd = ctl.update(r), seq = r.seq;
  const rows = [];
  for (let s = 0; s < (hours + 6) * 3600; s++) {
    sim.step(1, cmd); r = sim.read(); if (r.seq === seq) continue; seq = r.seq; cmd = ctl.update(r);
    if (r.t < 6 * 3600 || r.t % 60 !== 0) continue;         // a 1 min log after 6 h of start-up (machine states need <= 1 min)
    rows.push({ t: r.t - 6 * 3600, T: r.T, RH: r.RH, CO2: r.CO2, tOut: r.tOut, rhOut: r.rhOut, fan: cmd.fan.level, fog: cmd.hu.level,
      acPower: cmd.ac.power ? 1 : 0, acMode: cmd.ac.mode, acSet: cmd.ac.setpoint, acFan: cmd.ac.fan, lights: cmd.lights.on ? 1 : 0, circ: cmd.circ.on ? 1 : 0 });
  }
  return { rows, env: e };
}

test('CSV export and import give the same rows', () => {
  const { rows } = makeLog({ ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45 }, 2);
  const back = CAL.parseCsv(CAL.toCsv(rows));
  assert.equal(back.length, rows.length);
  assert.ok(Math.abs(back[5].T - rows[5].T) < 0.01 && back[5].fan === rows[5].fan && back[5].acMode === rows[5].acMode);
});

test('the fit finds the hidden room values from a 24 h log', () => {
  const hidden = { ua: 140, infAch: 0.9, moistBuffer: 4, co2PerBlock: 60 };
  const { rows } = makeLog(hidden);
  const base = { ...structuredClone(SIM.DEFAULT_ENV), ...EXHAUST }; base.startHour = 12;    // the log starts at 12:00
  const start = CAL.paramsOf(base);
  const before = CAL.replay(rows, base, start);
  const { params, result } = CAL.fit(rows, base, start);
  assert.ok(result.score < before.score * 0.3, `score ${before.score.toFixed(2)} -> ${result.score.toFixed(2)}`);
  for (const k of ['ua', 'infAch', 'co2PerBlock']) {
    const err = Math.abs(params[k] - hidden[k]) / hidden[k];
    assert.ok(err < 0.25, `${k}: found ${params[k].toFixed(2)}, hidden ${hidden[k]} (${(err * 100).toFixed(0)} %)`);
  }
  assert.ok(result.rmse.T < 0.3 && result.rmse.CO2 < 50, JSON.stringify(result.rmse));
});
