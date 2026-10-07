/*
 * capacity.js: ROOM CAPACITY CHECK
 *
 * How many blocks of a crop mix can a room carry in fruiting, on the design days of its region?
 *
 *   commonTargets(mix)                 -> { spT, spRH, co2Lim, crop } or { impossible: true, conflict }
 *   balance(room, mix, targets, region) -> step 1: { fan, ac, fog, estimate, limit }, most blocks per machine, instant
 *   trial(room, mix, targets, blocks)  -> step 2: one simulated run with the real controller, pass/fail per design day
 *   checkSteps(room, mix, opts)        -> generator for the full check; yields progress, returns the report
 *   check(room, mix, opts)             -> the same, run to the end
 *
 * room = { name, volume, vent, calib: { ua, infAch, moistBuffer, co2PerBlock, rmse: { T, RH, CO2 }, date } | null }
 * mix  = [{ crop, blocks, co2PerBlock? }]   (co2PerBlock in mL/h; default: the room's calibrated value)
 * Machine sizes are the simulation's (ClimateSim.PLANT). Choosing other machines is a later step.
 * Spec: docs/superpowers/specs/2026-10-07-room-capacity-design.md
 */
(function (global) {
  'use strict';
  const SIM = global.ClimateSim, CC = global.ClimateController, RT = global.ClimateRuntime;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ahSat = SIM.ahSat;

  // Pass rules for one design day. RH is one-sided: above the target does no harm, near saturation does.
  const PASS = { inT: 95, rhOk: 90, lowRhMin: 60, wetRH: 95, wetMax: 10, co2Below: 98 };
  const SEARCH = { step: 1.15, resolution: 0.05, maxRuns: 8, lowAt: 0.05, minRuns: 4, disagree: 0.15 };
  const VERDICT = { tight: 90, dense: 100, emptyBelow: 50 };
  const CALIB = { maxT: 0.5, maxRH: 5, maxCO2: 100, maxAgeDays: 90 };
  // Reasons that more blocks make worse ("dense") or fewer blocks make worse ("empty").
  const EMPTY_REASONS = ['temperature too low', 'humidity near saturation'];

  // Design days: 24 hourly outdoor values. T follows a cosine (low 03:00, high 15:00); RH falls as T rises.
  function makeDay(name, tLo, tHi, rhLo, rhHi) {
    const T = [], RH = [];
    for (let h = 0; h < 24; h++) {
      const f = (1 - Math.cos(2 * Math.PI * (h - 3) / 24)) / 2;        // 0 at 03:00, 1 at 15:00
      T.push(+(tLo + (tHi - tLo) * f).toFixed(2));
      RH.push(+(rhHi - (rhHi - rhLo) * f).toFixed(1));
    }
    return { name, T, RH };
  }
  // ESTIMATES for lowland Peninsular Malaysia: replace with MetMalaysia data when available.
  const DESIGN_DAYS = {
    'my-lowland': {
      name: 'Lowland Peninsular Malaysia (estimates)',
      days: [makeDay('Hot-dry', 24, 34, 50, 90), makeDay('Hot-humid', 25, 32, 70, 95), makeDay('Mild / rainy', 23, 28, 85, 98)],
    },
  };

  // ---------- 1. Common targets ----------
  function commonTargets(mix) {
    const items = mix.filter(m => Number.isFinite(m.blocks) && m.blocks > 0);
    if (!items.length) return { impossible: true, conflict: 'Add at least one crop with blocks.' };
    const unknown = items.find(m => !CC.CROPS[m.crop] || !CC.CROPS[m.crop].range);
    if (unknown) return { impossible: true, conflict: `Unknown crop: ${unknown.crop}.` };
    const total = items.reduce((s, m) => s + m.blocks, 0);
    const crop = m => CC.CROPS[m.crop];
    const pick = (key, idx) => {
      const lo = Math.max(...items.map(m => crop(m).range[key][0]));
      const hi = Math.min(...items.map(m => crop(m).range[key][1]));
      const avg = items.reduce((s, m) => s + crop(m).fruiting[idx] * m.blocks, 0) / total;
      return { lo, hi, value: clamp(avg, lo, hi) };
    };
    const conflict = (key, unit, r) => {
      const a = items.find(m => crop(m).range[key][1] === r.hi), b = items.find(m => crop(m).range[key][0] === r.lo);
      return `${crop(a).name} needs at most ${r.hi} ${unit}, ${crop(b).name} needs at least ${r.lo} ${unit}: no common ${key === 'T' ? 'temperature' : 'humidity'}.`;
    };
    const T = pick('T', 0), H = pick('RH', 1);
    if (T.lo > T.hi) return { impossible: true, conflict: conflict('T', '°C', T) };
    if (H.lo > H.hi) return { impossible: true, conflict: conflict('RH', '% RH', H) };
    // The most CO2-sensitive crop sets the limit; with a tie, the crop with more blocks.
    const sens = items.slice().sort((a, b) => crop(a).fruiting[2] - crop(b).fruiting[2] || b.blocks - a.blocks)[0];
    return { spT: Math.round(T.value * 2) / 2, spRH: Math.round(H.value), co2Lim: crop(sens).fruiting[2], crop: sens.crop };
  }

  // CO2 per block of the mix (block-weighted), mL/h.
  function mixCo2(room, mix) {
    const def = (room.calib && room.calib.co2PerBlock) || SIM.DEFAULT_ENV.co2PerBlock;
    const items = mix.filter(m => Number.isFinite(m.blocks) && m.blocks > 0);
    const total = items.reduce((s, m) => s + m.blocks, 0);
    return total ? items.reduce((s, m) => s + m.blocks * (m.co2PerBlock || def), 0) / total : def;
  }
  const roomOf = room => ({
    ...SIM.PLANT.room,
    ...(room.calib ? { ua: room.calib.ua, infAch: room.calib.infAch, moistBuffer: room.calib.moistBuffer } : {}),
    volume: room.volume || SIM.PLANT.room.volume,
  });

  // ---------- 2. Balance (step 1) ----------
  // Largest n in [0, max] with need(n) <= cap. The need can be U-shaped (the fog need falls with the first blocks,
  // which add water, then rises with the fresh air), so a high need at n = 0 does not end the search.
  // Never within the limit gives 0; no limit up to max gives Infinity.
  function maxBlocks(need, cap, max = 200000) {
    let ok = need(0) <= cap ? 0 : null, bad = null;
    for (let n = 100; n <= max; n *= 2) {
      if (need(n) <= cap) ok = n; else if (ok != null) { bad = n; break; }
    }
    if (ok == null) return 0;
    if (bad == null) return Infinity;
    while (bad - ok > 1) { const m = Math.floor((ok + bad) / 2); if (need(m) > cap) bad = m; else ok = m; }
    return ok;
  }
  // Per hour of each design day, with the room at target + band (the pass rule allows the band edge):
  //   S = sensible heat gain (W), G = water gain (g/s) from the outdoor air and the blocks.
  //   The fog replaces the water the AC coil takes out, and its evaporation cools the air, so the AC
  //   carries S + 2450·G. When the coil cannot take out G, the room runs wetter than the target (allowed)
  //   and the coil's water removal (at most latentMax of its output) is lost for cooling: S / (1 - latentMax).
  // Each day's worst hour is left out: the pass rule allows 5 % of the day out of band.
  function balance(room, mix, tg, region = 'my-lowland') {
    const P = SIM.PLANT, R = roomOf(room), c = mixCo2(room, mix), rules = CC.defaultRules(tg.co2Lim);
    const leak = room.vent === 'exhaust' ? R.infAch * R.volume : 0;               // m³/h; supply fan: no leak in
    const fanBase = P.fan.levels[rules.baseFan.fruiting].m3h + leak;
    const fanTop = P.fan.levels[P.fan.levels.length - 1].m3h + leak;
    const fogTop = P.fogger.levels[P.fogger.levels.length - 1].gph / 3600;         // g/s
    const dC = rules.fanOn - R.co2Out;                                              // CO2 held at the fan start level
    const air = n => Math.max(fanBase, n * c / dC) / 3600;                          // m³/s of outdoor air
    const blockW = c / 60000 * P.resp.wPerLpm, blockGps = c / 60000 * P.resp.gpsPerLpm + P.transpGph / 3600;
    const tRoom = tg.spT + CC.BANDS.T, ahT = tg.spRH / 100 * ahSat(tRoom), share = P.ac.latentMax.auto;
    const coilRate = 0.14 * Math.max(0, ahT - ahSat(P.ac.coil.auto));              // g/s at full output
    const latent = A => Math.min(coilRate * A / P.ac.capW, share * A / 2450);
    const days = DESIGN_DAYS[region].days;
    const hours = days.map(d => d.T.map((T, h) => ({ T, ah: d.RH[h] / 100 * ahSat(T),
      sun: h > 7 && h < 19 ? Math.sin(Math.PI * (h - 7) / 12) : 0, lights: h >= 7 && h < 19 })));
    const at = (n, x) => {
      const q = air(n), dT = x.T - tRoom;
      const S = R.ua * dT + q * 1206 * dT + P.loads.baseW + (x.lights ? P.loads.lightsW : 0) + x.sun * P.loads.solarPeakW + n * blockW;
      const G = q * (x.ah - ahT) + n * blockGps;
      const A1 = S + 2450 * G, L = latent(Math.max(0, A1));
      return L >= G ? { ac: A1, fog: L - G } : { ac: S / (1 - Math.min(share, coilRate * 2450 / P.ac.capW)), fog: 0 };
    };
    const secondWorst = key => n => Math.max(...hours.map(day => day.map(x => at(n, x)[key]).sort((a, b) => b - a)[1]));
    const out = { fan: maxBlocks(n => n * c / dC, fanTop), ac: maxBlocks(secondWorst('ac'), P.ac.capW), fog: maxBlocks(secondWorst('fog'), fogTop) };
    out.estimate = Math.min(out.fan, out.ac, out.fog);
    out.limit = ['fan', 'ac', 'fog'].find(k => out[k] === out.estimate);
    return out;
  }

  // ---------- 3. Trial (step 2) ----------
  // One run: a warm-up day (the first design day), then each design day. The real room air is scored.
  function trial(room, mix, tg, blocks, region = 'my-lowland', dt = 10) {
    const days = DESIGN_DAYS[region].days, seq = [days[0], ...days];
    const n = Math.max(0, Math.round(blocks));
    const e = structuredClone(SIM.DEFAULT_ENV);
    Object.assign(e, { startHour: 0, blocks: n, co2PerBlock: mixCo2(room, mix), blockStage: 'fruiting', vent: room.vent || e.vent,
      noise: false, sensorQuality: 'ideal', harvestDoors: false, randomWeather: false, dailyCycle: false });
    e.room = roomOf(room);
    e.weatherSeries = [];
    seq.forEach((d, k) => d.T.forEach((T, h) => e.weatherSeries.push({ t: (k * 24 + h) * 3600, T, RH: d.RH[h] })));
    const last = days[days.length - 1];
    e.weatherSeries.push({ t: seq.length * 86400, T: last.T[0], RH: last.RH[0] });
    const cfg = CC.defaultSettings();
    cfg.crop = tg.crop; cfg.stage = 'fruiting'; CC.applyProfile(cfg);
    cfg.spT = tg.spT; cfg.spRH = tg.spRH;
    cfg.program.harvest.on = false;                       // harvest windows lower RH on purpose
    const sim = SIM.create(e);
    sim.setRoom({ T: tg.spT, RH: tg.spRH, CO2: tg.co2Lim - 200 });
    const ctl = CC.create(cfg, null, null), io = RT.simIO(sim);
    const score = seq.map(() => ({ n: 0, inT: 0, tHi: 0, tLo: 0, rhOk: 0, lowRh: 0, wet: 0, co2Below: 0 }));
    let kwh0 = null, kwh1 = null;
    const rt = RT.createRuntime({ io, ctl, onReading: r => {
      const k = Math.floor(r.t / 86400);
      if (k < 1 || k >= seq.length) return;
      const v = sim.view(), s = score[k];
      if (!kwh0) kwh0 = { ...r.kwh };
      kwh1 = r.kwh;
      s.n++;
      if (Math.abs(v.T - tg.spT) <= CC.BANDS.T) s.inT++; else if (v.T > tg.spT) s.tHi++; else s.tLo++;
      if (v.RH >= tg.spRH - CC.BANDS.RH) s.rhOk++;
      if (v.RH < tg.spRH - CC.BANDS.RHAlarm) s.lowRh++;
      if (v.RH > PASS.wetRH) s.wet++;
      if (v.CO2 <= tg.co2Lim) s.co2Below++;
    } });
    rt.poll();
    for (let t = 0; t < seq.length * 86400; t += dt) { io.advance(dt); rt.poll(); }
    const result = score.slice(1).map((s, i) => {
      const pc = x => x / s.n * 100;
      const d = { name: days[i].name, inT: pc(s.inT), rhOk: pc(s.rhOk), lowRhMin: s.lowRh / s.n * 1440, wet: pc(s.wet), co2Below: pc(s.co2Below) };
      d.fails = [
        d.inT < PASS.inT && (s.tHi >= s.tLo ? 'temperature too high' : 'temperature too low'),
        d.rhOk < PASS.rhOk && 'humidity too low',
        d.lowRhMin > PASS.lowRhMin && 'humidity at the low alarm',
        d.wet > PASS.wetMax && 'humidity near saturation',
        d.co2Below < PASS.co2Below && 'CO₂ above the limit',
      ].filter(Boolean);
      d.pass = d.fails.length === 0;
      return d;
    });
    const kwhDay = kwh1 ? Object.keys(kwh1).reduce((sum, k) => sum + kwh1[k] - kwh0[k], 0) / days.length : 0;
    const fails = result.flatMap(d => d.fails);
    const side = !fails.length ? null : fails.every(f => EMPTY_REASONS.includes(f)) ? 'empty' : 'dense';
    return { blocks: n, days: result, pass: !fails.length, side, kwhDay };
  }

  global.ClimateCapacity = { commonTargets, balance, trial, DESIGN_DAYS, PASS, VERDICT, SEARCH };
})(typeof window !== 'undefined' ? window : globalThis);
