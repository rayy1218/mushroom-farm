/*
 * calib.js: CALIBRATION (2.13) - make the simulation agree with a farm log.
 *
 *   1. parseCsv(text)                    -> rows of a farm log
 *   2. replay(rows, envBase, params)     -> the simulation driven by the logged machine states and the
 *                                           logged outdoor weather; error against the measured room
 *   3. fit(rows, envBase, params, keys)  -> a search for the room values with the smallest error
 *   4. toCsv(rows)                       -> a log file (the dashboard exports a sample log from the simulation)
 *
 * CSV columns (header names, any order; aliases in COLS):
 *   time (ISO date/time, or minutes from the start), T, RH, CO2, tOut, rhOut,
 *   air (0/1; an old fan column 0-3 counts as on above 0), fog (0-3), acPower (0/1), acMode (cool/heat/dry/fan), acSet (°C), acFan (low/auto/high), lights (0/1), circ (0/1)
 */
(function (global) {
  'use strict';
  const SIM = global.ClimateSim;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const COLS = {
    time: ['time', 'timestamp', 'datetime', 'date', 'minutes', 'min'],
    T: ['t', 'temp', 'temperature', 'room_t', 'roomtemp'],
    RH: ['rh', 'humidity', 'room_rh'],
    CO2: ['co2', 'co2_ppm', 'co₂'],
    tOut: ['tout', 'outdoor_t', 'outdoortemp', 't_out'],
    rhOut: ['rhout', 'outdoor_rh', 'rh_out'],
    air: ['air', 'fan', 'fan_level', 'exhaust'],
    fog: ['fog', 'fogger', 'fog_level', 'humidifier'],
    acPower: ['acpower', 'ac_on', 'ac'],
    acMode: ['acmode', 'ac_mode'],
    acSet: ['acset', 'ac_setpoint', 'setpoint'],
    acFan: ['acfan', 'ac_fan'],
    lights: ['lights', 'light'],
    circ: ['circ', 'circulation', 'circ_fan'],
  };
  // Room values that a fit can change. [min, max] keeps the search physical.
  const PARAMS = {
    ua: { label: 'Room heat loss (W/K)', min: 20, max: 400, where: 'room' },
    infAch: { label: 'Air leakage (changes/h)', min: 0.05, max: 3, where: 'room' },
    moistBuffer: { label: 'Moisture buffer (×)', min: 1, max: 10, where: 'room' },
    co2PerBlock: { label: 'CO₂ per block (mL/h)', min: 5, max: 300, where: 'env' },
  };

  function parseCsv(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (lines.length < 3) throw new Error('The file has fewer than 2 data rows.');
    const head = lines[0].split(',').map(h => h.trim().toLowerCase());
    const idx = {};
    for (const [k, names] of Object.entries(COLS)) { const i = head.findIndex(h => names.includes(h)); if (i >= 0) idx[k] = i; }
    for (const k of ['time', 'T', 'RH', 'CO2']) if (idx[k] == null) throw new Error(`Column "${k}" is missing. Columns found: ${head.join(', ')}`);
    let t0 = null;
    const rows = [];
    for (const line of lines.slice(1)) {
      const c = line.split(',').map(x => x.trim());
      const raw = c[idx.time];
      let t;
      if (/^-?\d+(\.\d+)?$/.test(raw)) t = parseFloat(raw) * 60;            // minutes from the start
      else { const d = Date.parse(raw); if (!Number.isFinite(d)) continue; t = d / 1000; }
      if (t0 == null) t0 = t;
      const num = k => (idx[k] == null || c[idx[k]] === '' ? null : parseFloat(c[idx[k]]));
      const str = k => (idx[k] == null ? null : c[idx[k]].toLowerCase());
      const onOff = x => (x == null || !Number.isFinite(x) ? null : x > 0 ? 1 : 0);
      rows.push({ t: t - t0, T: num('T'), RH: num('RH'), CO2: num('CO2'), tOut: num('tOut'), rhOut: num('rhOut'),
        air: onOff(num('air')), fog: num('fog'), acPower: num('acPower'), acMode: str('acMode'), acSet: num('acSet'), acFan: str('acFan'), lights: num('lights'), circ: num('circ'),
        hour: /^-?\d/.test(raw) ? null : new Date(Date.parse(raw)).getHours() + new Date(Date.parse(raw)).getMinutes() / 60 });
    }
    rows.sort((a, b) => a.t - b.t);
    return rows;
  }

  function toCsv(rows) {
    const head = ['minutes', 'T', 'RH', 'CO2', 'tOut', 'rhOut', 'air', 'fog', 'acPower', 'acMode', 'acSet', 'acFan', 'lights', 'circ'];
    const f = (x, d) => (x == null || !Number.isFinite(x) ? '' : x.toFixed(d));
    return [head.join(',')].concat(rows.map(r => [f(r.t / 60, 2), f(r.T, 2), f(r.RH, 1), f(r.CO2, 0), f(r.tOut, 2), f(r.rhOut, 1),
      r.air ?? '', r.fog ?? '', r.acPower ?? '', r.acMode ?? '', f(r.acSet, 1), r.acFan ?? '', r.lights ?? '', r.circ ?? ''].join(','))).join('\n');
  }

  // Apply a parameter set to a copy of the base environment.
  function envWith(envBase, params) {
    const e = structuredClone(envBase);
    e.room = { ...(e.room || {}) };
    for (const [k, v] of Object.entries(params)) { if (PARAMS[k].where === 'room') e.room[k] = v; else e[k] = v; }
    e.faults = { T: 'ok', RH: 'ok', CO2: 'ok', out: 'ok' };
    e.noise = false; e.sensorQuality = 'ideal'; e.harvestDoors = false; e.randomWeather = false;
    return e;
  }

  // Replay the log in the simulation and compare. dt = simulation step (s); 10 s is fast and stable.
  function replay(rows, envBase, params, dt = 10) {
    if (!rows || rows.length < 2) throw new Error('The log has fewer than 2 rows.');
    const e = envWith(envBase, params);
    const W = rows.filter(r => Number.isFinite(r.tOut) && Number.isFinite(r.rhOut)).map(r => ({ t: r.t, T: r.tOut, RH: r.rhOut }));
    if (W.length >= 2) e.weatherSeries = W;
    if (rows[0].hour != null) e.startHour = rows[0].hour;
    const sim = SIM.create(e);
    const first = rows.find(r => Number.isFinite(r.T) && Number.isFinite(r.RH) && Number.isFinite(r.CO2)) || rows[0];
    sim.setRoom({ T: first.T, RH: first.RH, CO2: first.CO2 });
    const cmdOf = r => ({
      ac: { power: r.acPower == null ? true : r.acPower > 0, mode: r.acMode || 'cool', setpoint: r.acSet ?? 25, fan: r.acFan || 'auto' },
      hu: { level: r.fog ?? 0 }, air: { on: (r.air ?? 0) > 0 }, lights: r.lights == null ? undefined : { on: r.lights > 0 },
      circ: { on: (r.circ ?? 0) > 0 },
    });
    const out = [];
    let i = 0, cmd = cmdOf(rows[0]);
    if (cmd.lights === undefined) delete cmd.lights;
    const sq = { T: [0, 0], RH: [0, 0], CO2: [0, 0] };
    for (let t = 0; i < rows.length; t += dt) {
      while (i < rows.length && rows[i].t <= t) {
        const r = rows[i], v = sim.view();
        out.push({ t: r.t, T: v.T, RH: v.RH, CO2: v.CO2 });
        for (const k of ['T', 'RH', 'CO2']) if (Number.isFinite(r[k])) { const d = v[k] - r[k]; sq[k][0] += d * d; sq[k][1]++; }
        cmd = cmdOf(r); if (cmd.lights === undefined) delete cmd.lights;
        i++;
      }
      if (i >= rows.length) break;
      sim.step(dt, cmd);
    }
    const rmse = {}; for (const k of Object.keys(sq)) rmse[k] = sq[k][1] ? Math.sqrt(sq[k][0] / sq[k][1]) : NaN;
    // One number for the search: errors in units of a typical sensor error.
    const score = (rmse.T || 0) / 0.5 + (rmse.RH || 0) / 3 + (rmse.CO2 || 0) / 100;
    return { series: out, rmse, score };
  }

  // Nelder-Mead search on the logarithm of each parameter (inside its limits). It handles parameters that
  // act together (for example air leakage and CO2 per block) better than a search on one parameter at a time.
  // Written as a generator: it yields after each simulation run, so a page can stay responsive (fitAsync).
  function* fitSteps(rows, envBase, params, keys = Object.keys(PARAMS), maxEval = 400) {
    const P = keys.map(k => PARAMS[k]);
    const toX = p => keys.map(k => Math.log(p[k]));
    const toP = x => { const p = { ...params }; keys.forEach((k, i) => { p[k] = clamp(Math.exp(x[i]), P[i].min, P[i].max); }); return p; };
    let evals = 0, best = null;
    function* f(x) { evals++; const r = replay(rows, envBase, toP(x)); const v = { x, s: r.score, r }; if (!best || v.s < best.s) best = v; yield { evals, maxEval, best: toP(best.x), score: best.s }; return v; }
    const n = keys.length, x0 = toX(params);
    let simplex = [yield* f(x0)];
    for (let i = 0; i < n; i++) { const x = x0.slice(); x[i] += 0.35; simplex.push(yield* f(x)); }
    while (evals < maxEval) {
      simplex.sort((a, b) => a.s - b.s);
      const lo = simplex[0], worst = simplex[n], second = simplex[n - 1];
      if (worst.s - lo.s < 1e-4) break;
      const c = x0.map((_, i) => simplex.slice(0, n).reduce((acc, v) => acc + v.x[i], 0) / n);
      const at = k => c.map((ci, i) => ci + k * (worst.x[i] - ci));
      const refl = yield* f(at(-1));
      if (refl.s < lo.s) { const exp = yield* f(at(-2)); simplex[n] = exp.s < refl.s ? exp : refl; }
      else if (refl.s < second.s) simplex[n] = refl;
      else {
        const con = yield* f(refl.s < worst.s ? at(-0.5) : at(0.5));
        if (con.s < Math.min(worst.s, refl.s)) simplex[n] = con;
        else for (let i = 1; i <= n; i++) simplex[i] = yield* f(simplex[i].x.map((xi, j) => lo.x[j] + 0.5 * (xi - lo.x[j])));
      }
    }
    simplex.sort((a, b) => a.s - b.s);
    return { params: toP(simplex[0].x), result: simplex[0].r, evals };
  }
  function fit(rows, envBase, params, keys, onStep, maxEval) {
    const g = fitSteps(rows, envBase, params, keys, maxEval);
    for (;;) { const s = g.next(); if (s.done) return s.value; if (onStep) onStep(s.value); }
  }
  // Same search; it gives the page a moment between runs and reports the progress.
  async function fitAsync(rows, envBase, params, onProgress, maxEval) {
    const g = fitSteps(rows, envBase, params, undefined, maxEval);
    for (let i = 0; ; i++) {
      const s = g.next();
      if (s.done) return s.value;
      if (onProgress) onProgress(s.value);
      if (i % 2 === 0) await new Promise(r => setTimeout(r, 0));
    }
  }

  // Present values of the parameters in an environment.
  function paramsOf(envBase) {
    const room = { ...SIM.PLANT.room, ...(envBase.room || {}) };
    return { ua: room.ua, infAch: room.infAch, moistBuffer: room.moistBuffer, co2PerBlock: envBase.co2PerBlock };
  }

  global.ClimateCalib = { parseCsv, toCsv, replay, fit, fitAsync, paramsOf, PARAMS };
})(typeof window !== 'undefined' ? window : globalThis);
