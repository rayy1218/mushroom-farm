// web/room-calibrate.js: the room page's Calibrate tab (docs/contracts/web.md C5 3.6, 3.11).
(function (global) {
'use strict';

const FIELDS7 = ['ac_hp', 'ac_units', 'fog_lph', 'air_m3h', 'walls', 'roof', 'height'];
const FARM_OFFSET = 28800;

function farmMidnight(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3], ms = Date.UTC(y, mo - 1, d), c = new Date(ms);
  if (c.getUTCFullYear() !== y || c.getUTCMonth() !== mo - 1 || c.getUTCDate() !== d) return null;
  return ms / 1000 - FARM_OFFSET;
}
function farmDate(t) {
  const d = new Date((t + FARM_OFFSET) * 1000), p2 = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}
function defaultRange(now) { return { from: farmDate(now - 86400), to: farmDate(now) }; }
function rangeQuery(fromText, toText, now) {
  const a = farmMidnight(fromText), b = farmMidnight(toText);
  if (a === null || b === null) return { error: 'Pick the first and the last day.' };
  if (a > b) return { error: 'The first day is after the last day.' };
  const days = (b - a) / 86400 + 1;
  if (days > 7) return { error: 'Pick at most 7 days.' };
  const to = Math.min(now, b + 86400 - 1);
  if (to < a) return { error: 'The first day is in the future.' };
  return { from: a, to, days };
}

function logFromReadings(readings) {
  const SENS = global.ClimateController.SENSORS;
  const ok = (v, k) => (Number.isFinite(v) && v >= SENS[k].min && v <= SENS[k].max ? v : null);
  const sorted = [...readings].sort((x, y) => x.t - y.t);
  const t0 = sorted.length ? sorted[0].t : 0;
  return sorted.map(r => ({
    t: r.t - t0, hour: ((r.t + FARM_OFFSET) % 86400) / 3600,
    T: ok(r.T, 'T'), RH: ok(r.RH, 'RH'), CO2: ok(r.CO2, 'CO2'), tOut: ok(r.t_out, 'tOut'), rhOut: ok(r.rh_out, 'rhOut'),
    air: r.air, fog: r.fog, lights: r.lights, circ: r.circ,
    acPower: r.ac_mode === 'off' ? 0 : 1, acMode: r.ac_mode === 'off' ? null : r.ac_mode,
    acSet: r.ac_setpoint, acFan: r.ac_fan, stage: r.stage,
  }));
}
function historyGaps(readings) {
  const ts = readings.map(r => r.t).sort((x, y) => x - y);
  let n = 0;
  for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > 600) n++;
  return n;
}

function envBaseFor(room, blocks, rows, equipment, airM3h) {
  const SIM = global.ClimateSim;
  const e = structuredClone(SIM.DEFAULT_ENV);
  e.airM3h = airM3h;
  e.room = { volume: room.volume };
  e.blocks = blocks;
  const withStage = rows.find(r => r.stage);
  e.blockStage = withStage ? withStage.stage : (room.live && room.live.stage) || SIM.DEFAULT_ENV.blockStage;
  if (equipment) e.plant = global.ClimateEquipment.plantOf(equipment, { volume: room.volume, calib: {} });
  return e;
}
function paramsOfRun(run) { return { ua: run.ua, infAch: run.inf_ach, moistBuffer: run.moist_buffer, co2PerBlock: run.co2_per_block }; }
function startParams(runs, envBase) {
  const applied = runs.find(r => r.applied === true);
  return applied ? paramsOfRun(applied) : global.ClimateCalib.paramsOf(envBase);
}
function defaultBlocks(rows, live) {
  const sum = rows.reduce((a, r) => a + (r.blocks || 0), 0);
  if (sum >= 1) return sum;
  return live && live.blocks >= 1 ? live.blocks : null;
}
function parseBlocks(text) {
  const t = String(text).trim();
  if (!/^\d+$/.test(t)) return null;
  const n = +t;
  return n >= 1 && n <= global.ClimateRoomRules.LIM.blocks ? n : null;
}

function pick7(eq) { return eq ? Object.fromEntries(FIELDS7.map(k => [k, eq[k]])) : null; }
function calibBody(fit, rows, source, range, equipment) {
  const fin = v => (Number.isFinite(v) ? v : null), p = fit.params, r = fit.result.rmse;
  const body = { ua: p.ua, inf_ach: p.infAch, moist_buffer: p.moistBuffer, co2_per_block: p.co2PerBlock,
    rmse_t: fin(r.T), rmse_rh: fin(r.RH), rmse_co2: fin(r.CO2), log_rows: rows.length, source };
  if (source === 'history') { body.log_from = range.from; body.log_to = range.to; }
  body.equipment = pick7(equipment);
  return body;
}
function sameMachines(a, b) {
  if (!a || !b) return !a && !b;
  return FIELDS7.every(k => a[k] === b[k]);
}
function staleText(applied) {
  return `The applied calibration (${farmDate(applied.run_at)}) was fitted with other machines than this room has now. Fit again so Simulate uses room values that match the machines.`;
}

function pairSeries(series, buckets, start) {
  const byT = new Map(buckets.map(b => [b.t, b])), out = [];
  for (const s of [...series].sort((x, y) => x.h - y.h)) {
    const b = byT.get(start + s.h * 3600);
    if (b) out.push({ h: s.h, sim: { T: s.T, RH: s.RH, CO2: s.CO2, stage: s.stage }, real: { T: b.T, RH: b.RH, CO2: b.CO2, stage: b.stage } });
  }
  return out;
}
function differences(pairs) {
  const mean = k => {
    const d = pairs.filter(p => Number.isFinite(p.sim[k]) && Number.isFinite(p.real[k])).map(p => Math.abs(p.sim[k] - p.real[k]));
    return d.length ? d.reduce((a, x) => a + x, 0) / d.length : NaN;
  };
  const staged = pairs.filter(p => p.real.stage);
  return { T: mean('T'), RH: mean('RH'), CO2: mean('CO2'), hours: pairs.length,
    stageShare: staged.length ? staged.filter(p => p.real.stage === p.sim.stage).length / staged.length * 100 : null };
}
function differenceLines(d) {
  if (d.hours === 0) return ['No real readings for this run yet.'];
  const lines = [`Average difference: ${d.T.toFixed(1)} °C, RH ${d.RH.toFixed(1)} %, CO₂ ${Math.round(d.CO2)} ppm over ${d.hours} hours.`];
  if (d.stageShare !== null) lines.push(`Stage agreement: ${Math.round(d.stageShare)} % of hours`);
  lines.push('A big gap means: calibrate again.');
  return lines;
}
function predictedRows(series) { return series.map(s => ({ t: s.h * 3600, T: s.T, RH: s.RH, CO2: s.CO2 })); }
function realRows(buckets, start) { return buckets.map(b => ({ t: b.t - start, T: b.T, RH: b.RH, CO2: b.CO2 })); }

const helpers = { farmMidnight, farmDate, defaultRange, rangeQuery, logFromReadings, historyGaps, envBaseFor, paramsOfRun, startParams,
  defaultBlocks, parseBlocks, calibBody, sameMachines, staleText, pairSeries, differences, differenceLines, predictedRows, realRows };
let alive = false;

function mount() { alive = true; }
function unmount() { alive = false; }

global.FarmRoomTabs.register('calibrate', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
