/*
 * capacity.js: ROOM CAPACITY CHECK
 *
 * How many blocks of a crop mix can a room carry in fruiting, on the design days of its region?
 *
 *   commonTargets(mix)                 -> { spT, spRH, co2Lim, crop } or { impossible: true, conflict }
 *   balance(room, mix, targets)        -> step 1: most blocks per machine (fan, AC, fogger), instant estimate
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

  global.ClimateCapacity = { commonTargets, DESIGN_DAYS, PASS, VERDICT, SEARCH };
})(typeof window !== 'undefined' ? window : globalThis);
