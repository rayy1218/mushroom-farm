// Calibration tests: a log from a "hidden" room; the fit must find the hidden values.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js'); require('../air.js'); require('../controller.js'); require('../calib.js');
const SIM = globalThis.ClimateSim, CC = globalThis.ClimateController, CAL = globalThis.ClimateCalib;

// A log of a "hidden" room, with every reading (30 s), so a replay runs each purge exactly as long as it ran.
// With the air exchange on there is no leakage (C9 4.3), but the purges are short: the fans are off most of the
// day, and then the leakage sets how fast CO2 rises and how the room drifts. That is what the fit finds.
function makeLog(hidden, hours = 24) {
  const e = structuredClone(SIM.DEFAULT_ENV);
  e.room = { ua: hidden.ua, infAch: hidden.infAch, moistBuffer: hidden.moistBuffer };
  e.co2PerBlock = hidden.co2PerBlock;
  const cfg = CC.defaultSettings(); cfg.program.harvest.on = false;
  const sim = SIM.create(e), ctl = CC.create(cfg, null, null);
  let r = sim.read(), cmd = ctl.update(r), seq = r.seq;
  const rows = [];
  for (let s = 0; s < (hours + 6) * 3600; s++) {
    sim.step(1, cmd); r = sim.read(); if (r.seq === seq) continue; seq = r.seq; cmd = ctl.update(r);
    if (r.t < 6 * 3600) continue;                             // 6 h of start-up
    rows.push({ t: r.t - 6 * 3600, T: r.T, RH: r.RH, CO2: r.CO2, tOut: r.tOut, rhOut: r.rhOut, air: cmd.air.on ? 1 : 0, fog: cmd.hu.level,
      acPower: cmd.ac.power ? 1 : 0, acMode: cmd.ac.mode, acSet: cmd.ac.setpoint, acFan: cmd.ac.fan, lights: cmd.lights.on ? 1 : 0, circ: cmd.circ.on ? 1 : 0 });
  }
  return { rows, env: e };
}

test('CSV export and import give the same rows', () => {
  const { rows } = makeLog({ ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45 }, 2);
  const back = CAL.parseCsv(CAL.toCsv(rows));
  assert.equal(back.length, rows.length);
  assert.ok(rows.some(x => x.air === 1) && rows.some(x => x.air === 0), 'the log has purges and pauses');
  assert.deepEqual(back.map(x => x.air), rows.map(x => x.air));
  assert.ok(Math.abs(back[5].T - rows[5].T) < 0.01 && back[5].acMode === rows[5].acMode);
  assert.equal(CAL.toCsv(rows).split('\n')[0].split(',')[6], 'air');
});

test('an old log with a fan column (levels 0-3) reads as air on above 0, and replays the same', () => {
  const air = 'minutes,T,RH,CO2,air\n0,25,85,900,0\n1,25,85,880,1\n2,25,85,860,1\n3,25,85,850,0\n';
  const fan = 'minutes,T,RH,CO2,fan\n0,25,85,900,0\n1,25,85,880,2\n2,25,85,860,3\n3,25,85,850,0\n';
  const a = CAL.parseCsv(air), f = CAL.parseCsv(fan);
  assert.deepEqual(f.map(r => r.air), [0, 1, 1, 0]);
  assert.deepEqual(f, a);
  assert.equal(CAL.parseCsv('minutes,T,RH,CO2,exhaust\n0,25,85,900,3\n1,25,85,880,\n')[1].air, null);
  const base = structuredClone(SIM.DEFAULT_ENV), p = CAL.paramsOf(base);
  assert.deepEqual(CAL.replay(f, base, p), CAL.replay(a, base, p));
  const off = CAL.parseCsv('minutes,T,RH,CO2,air\n0,25,85,900,0\n1,25,85,880,0\n2,25,85,860,0\n3,25,85,850,0\n');
  assert.ok(CAL.replay(a, base, p).series[3].CO2 < CAL.replay(off, base, p).series[3].CO2 - 50, 'the replay runs the air exchange');
});

test('the fit finds the hidden room values from a 24 h log', () => {
  const hidden = { ua: 140, infAch: 0.9, moistBuffer: 4, co2PerBlock: 60 };
  const { rows } = makeLog(hidden);
  const base = structuredClone(SIM.DEFAULT_ENV); base.startHour = 12;    // the log starts at 12:00
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

test('CA1 the heat loss label and note', () => {
  const P = CAL.PARAMS;
  assert.equal(P.ua.label, 'Heat through walls and roof (W/K)');
  assert.equal(P.ua.note, 'Heat flows out when the room is warmer than outside, in when outside is hotter.');
  assert.equal(P.ua.min, 20); assert.equal(P.ua.max, 400); assert.equal(P.ua.where, 'room');
  for (const k of ['infAch', 'moistBuffer', 'co2PerBlock']) assert.equal('note' in P[k], false);
});

test('CA2 replay follows the stage', () => {
  const { rows } = makeLog({ ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45 }, 2);
  const half = rows.length / 2;
  const staged = rows.map((r, i) => ({ ...r, air: 0, stage: i < half ? 'fruiting' : 'rest' }));
  const plain = staged.map(({ stage, ...r }) => r);
  const base = structuredClone(SIM.DEFAULT_ENV), p = CAL.paramsOf(base);
  const a = CAL.replay(staged, base, p).series, b = CAL.replay(plain, base, p).series;
  assert.deepEqual(a.slice(0, half), b.slice(0, half));
  assert.ok(a.at(-1).CO2 < b.at(-1).CO2 - 20, `${a.at(-1).CO2} vs ${b.at(-1).CO2}`);
});

test('CA3 no stage, no change', () => {
  const { rows } = makeLog({ ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45 }, 2);
  const base = structuredClone(SIM.DEFAULT_ENV), p = CAL.paramsOf(base);
  const ref = CAL.replay(rows, base, p);
  assert.deepEqual(CAL.replay(rows.map(r => ({ ...r, stage: null })), base, p), ref);
  assert.deepEqual(CAL.replay(rows.map(r => ({ ...r, stage: 'x' })), base, p), ref);
});
