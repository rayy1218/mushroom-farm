/*
 * cycle.js: CROP CYCLE SIMULATION
 *
 * Runs one whole crop cycle (every stage, every flush) for a room and a crop mix, with the real
 * controller (controller.js) against the simulated room (sim.js) through the runtime (runtime.js),
 * on the region's design-day weather. Answers "can this room hold this mix for a full cycle?" one
 * stage at a time, and keeps an hourly series so a later module can lay it over the real readings
 * of the same room and calibrate.
 *
 *   runCycleSteps(room, mix, opts) -> generator, yields Progress once per simulated day, returns Result
 *   runCycle(room, mix, opts)      -> Result, synchronous
 *   runCycleAsync(room, mix, opts) -> Promise<Result>, yields to the browser between days
 *   cycleDays(farmType, program)  -> total simulated days
 *   DT                            -> time step (s)
 *
 * Contract: docs/contracts/cycle.md
 */
(function (global) {
  'use strict';
  const SIM = global.ClimateSim, CC = global.ClimateController, RT = global.ClimateRuntime, CAP = global.ClimateCapacity;

  const DT = 10; // s

  // ---------- cycleDays (C7 5.1) ----------
  const roundDay = v => Math.max(1, Math.round(v));
  function cycleDays(farmType, program) {
    if (farmType !== 'full' && farmType !== 'ready') throw new Error(`Unknown farm type: ${farmType}`);
    const spawn = roundDay(program.days.spawn), pinning = roundDay(program.days.pinning);
    const fruiting = roundDay(program.days.fruiting), rest = roundDay(program.days.rest);
    const flushes = roundDay(program.flushes);
    return farmType === 'full'
      ? spawn + pinning + flushes * fruiting + (flushes - 1) * rest
      : flushes * fruiting + (flushes - 1) * rest;
  }

  // ---------- The run ----------
  function* runCycleSteps(room, mix, opts = {}) {
    // ---- C7 3: input checks, in order ----
    if (room === null || typeof room !== 'object') throw new TypeError('runCycle: room must be an object');
    if (!Array.isArray(mix)) throw new TypeError('runCycle: mix must be a list');
    if (opts.settings !== undefined && (opts.settings === null || typeof opts.settings !== 'object' || Array.isArray(opts.settings))) {
      throw new TypeError('runCycle: settings must be an object');
    }
    if (opts.tariff !== undefined && !(Number.isFinite(opts.tariff) && opts.tariff >= 0)) {
      throw new TypeError('runCycle: tariff must be a number of at least 0');
    }
    const region = opts.region || 'my-lowland';
    if (!Object.hasOwn(CAP.DESIGN_DAYS, region)) throw new Error(`Unknown region: ${region}`);
    const tariff = opts.tariff !== undefined ? opts.tariff : 0.57;

    let cfg, warnings;
    if (opts.settings !== undefined) {
      const imp = CC.importSettings(CC.exportSettings(opts.settings));
      cfg = imp.settings; warnings = imp.warnings;
    } else {
      cfg = CC.defaultSettings(); warnings = [];
    }

    const tg = CAP.commonTargets(mix);
    if (tg.impossible) return { verdict: 'impossible', why: tg.conflict };

    // ---- C7 4.2: settings for the run ----
    const farmType = cfg.farmType;
    const S = CC.FARM_TYPES[farmType].stages;
    cfg.program.days.spawn = roundDay(cfg.program.days.spawn);
    cfg.program.days.pinning = roundDay(cfg.program.days.pinning);
    cfg.program.days.fruiting = roundDay(cfg.program.days.fruiting);
    cfg.program.days.rest = roundDay(cfg.program.days.rest);
    cfg.program.flushes = roundDay(cfg.program.flushes);
    cfg.crop = tg.crop;
    cfg.stage = S[0];
    cfg.program.auto = false;
    cfg.program.harvest.on = false;
    cfg.offsets = { T: 0, RH: 0, CO2: 0 };
    cfg.airM3h = room.airM3h ?? SIM.PLANT.air.m3h;
    cfg.manual.ac.auto = true; cfg.manual.hu.auto = true; cfg.manual.air.auto = true;
    cfg.manual.lights.auto = true; cfg.manual.circ.auto = true;
    CC.applyProfile(cfg);
    if (S[0] === 'fruiting') { cfg.spT = tg.spT; cfg.spRH = tg.spRH; }

    const D = cycleDays(farmType, cfg.program);

    // ---- C7 4.1: targets per stage ----
    const coreMax = CC.CROPS[tg.crop].limits.coreMax, coreTarget = CC.CROPS[tg.crop].coreTarget;
    const targetsFor = stage => {
      if (stage === 'fruiting') return { spT: tg.spT, spRH: tg.spRH, co2Lim: tg.co2Lim, coreMax };
      const pt = CC.profileTargets(tg.crop, stage);
      return { spT: pt.spT, spRH: pt.spRH, co2Lim: pt.co2Lim, coreMax };
    };

    // ---- C7 6: weather sequence ----
    const days3 = CAP.DESIGN_DAYS[region].days;
    const full = [];
    for (let j = 0; j <= D; j++) {
      const day = j === 0 ? days3[0] : days3[(j - 1) % 3];
      for (let h = 0; h < 24; h++) full.push({ t: (j * 24 + h) * 3600, T: day.T[h], RH: day.RH[h] });
    }
    { const cd = days3[D % 3]; full.push({ t: (D + 1) * 86400, T: cd.T[0], RH: cd.RH[0] }); }

    // ---- C7 7.1: setup ----
    const counted = m => Number.isFinite(m.blocks) && m.blocks > 0;
    const n = Math.max(1, Math.round(mix.filter(counted).reduce((s, m) => s + m.blocks, 0)));
    const c = CAP.mixCo2(room, mix);
    const e = structuredClone(SIM.DEFAULT_ENV);
    Object.assign(e, {
      startHour: 0, blocks: n, co2PerBlock: c, blockStage: S[0], airM3h: room.airM3h ?? null,
      noise: false, sensorQuality: 'ideal', harvestDoors: false, randomWeather: false, dailyCycle: false,
    });
    e.room = CAP.roomOf(room);
    e.weatherSeries = full;

    const st0 = targetsFor(S[0]);
    const sim = SIM.create(e);
    sim.setRoom({ T: st0.spT, RH: st0.spRH, CO2: st0.co2Lim - 200 });
    const ctl = CC.create(cfg, null, null);
    const sio = RT.simIO(sim);
    const io = { ...sio, read: () => { const r = sio.read(); return r && { ...r, CO2: r.CO2 + (r.seq % 2) * 1e-6 }; } };

    const W = 86400, END = W + D * 86400;

    // ---- Scoring state ----
    let openSeg = null, prevShockActive = false;
    const rawSegments = [];
    let openHour = null;
    const finishedHours = [];

    function newSegCounters(ps, startDay) {
      return {
        stage: ps.stage, flush: ps.flush, startDay, targets: targetsFor(ps.stage),
        n: 0, inT: 0, tHi: 0, tLo: 0, rhOk: 0, lowRh: 0, wet: 0, co2Below: 0, maxCore: -Infinity, alarms: {},
      };
    }
    function patchFruiting() {
      const ramp = ctl.state.stage.ramp;
      if (ctl.state.stage.shock) {
        if (ramp) ramp.to.spRH = tg.spRH; else cfg.spRH = tg.spRH;
      } else if (ramp) {
        ramp.to.spT = tg.spT; ramp.to.spRH = tg.spRH;
      } else {
        cfg.spT = tg.spT; cfg.spRH = tg.spRH;
      }
    }

    function onReading(r) {
      if (r.t < W) return;
      // C7 10: energy and the hourly series
      const K = Object.values(r.kwh).reduce((s, x) => s + x, 0);
      const hourIdx = Math.floor((r.t - W) / 3600);
      if (openHour && hourIdx !== openHour.hIndex) {
        finishedHours.push({
          h: openHour.hIndex, stage: openHour.stage, flush: openHour.flush,
          T: openHour.sumT / openHour.n, RH: openHour.sumRH / openHour.n,
          CO2: openHour.sumCO2 / openHour.n, core: openHour.sumCore / openHour.n,
          kwh: K - openHour.k0,
        });
        openHour = null;
      }
      if (r.t < END && !openHour) {
        openHour = { hIndex: hourIdx, k0: K, sumT: 0, sumRH: 0, sumCO2: 0, sumCore: 0, n: 0, stage: undefined, flush: undefined };
      }
      if (r.t >= END) return;

      // C7 8.1 step 4: segments and the fruiting replacement
      const ps = ctl.programStatus(r.t);
      if (!openSeg || ps.stage !== openSeg.stage || ps.flush !== openSeg.flush) {
        if (openSeg) rawSegments.push(openSeg);
        openSeg = newSegCounters(ps, (r.t - W) / 86400);
        if (openSeg.stage === 'fruiting') patchFruiting();
      } else if (openSeg.stage === 'fruiting' && prevShockActive && !ctl.state.stage.shock) {
        patchFruiting();
      }
      prevShockActive = !!ctl.state.stage.shock;

      // C7 8.2: counters per segment
      const v = sim.view(), g = openSeg.targets;
      const diff = v.T - g.spT, inBand = Math.abs(diff) <= CC.BANDS.T;
      const excuse = openSeg.stage === 'spawn' && cfg.program.coreControl && diff < -CC.BANDS.T && (v.core - coreTarget) > diff;
      openSeg.n++;
      if (inBand || excuse) openSeg.inT++;
      else if (diff > 0) openSeg.tHi++;
      else openSeg.tLo++;
      if (v.RH >= g.spRH - CC.BANDS.RH) openSeg.rhOk++;
      if (v.RH < g.spRH - CC.BANDS.RHAlarm) openSeg.lowRh++;
      if (v.RH > CAP.PASS.wetRH) openSeg.wet++;
      if (v.CO2 <= g.co2Lim) openSeg.co2Below++;
      if (v.core > openSeg.maxCore) openSeg.maxCore = v.core;

      // C7 10: the hour's running means (stage/flush of its first reading)
      if (openHour.stage === undefined) { openHour.stage = openSeg.stage; openHour.flush = openSeg.flush; }
      openHour.sumT += v.T; openHour.sumRH += v.RH; openHour.sumCO2 += v.CO2; openHour.sumCore += v.core; openHour.n++;

      // C7 9: alarms
      for (const a of ctl.alarmList()) {
        if (a.active && a.since === r.t) openSeg.alarms[a.id] = (openSeg.alarms[a.id] || 0) + 1;
      }
    }

    const rt = RT.createRuntime({ io, ctl, onReading });

    // ---- C7 7.2: loop ----
    rt.poll(); // the reading at t = 0, warm-up
    let started = false, daySeg = null;
    const STEPS = 86400 / DT;
    for (let day = -1; day < D; day++) {
      const j = day + 1;
      if (!opts.fullWeather) e.weatherSeries = full.slice(Math.max(0, 24 * j - 1), 24 * (j + 1) + 2);
      for (let i = 0; i < STEPS; i++) {
        if (i === STEPS - 1) daySeg = openSeg ? { stage: openSeg.stage, flush: openSeg.flush } : null;
        e.blockStage = cfg.stage;
        io.advance(DT);
        if (!started && io.read().t >= W) {
          started = true;
          cfg.program.auto = true;
          ctl.setStage(S[0], W, false);
          if (S[0] === 'fruiting') { cfg.spT = tg.spT; cfg.spRH = tg.spRH; }
        }
        rt.poll();
      }
      if (day >= 0) yield { day: day + 1, days: D, stage: daySeg.stage, flush: daySeg.flush };
    }
    if (openSeg) rawSegments.push(openSeg);

    // ---- C7 8.3, 8.4, 10, 12: build segments, totals, series ----
    const stages = rawSegments.map(seg => {
      const segN = seg.n, days = segN / 2880, hours = days * 24;
      const inT = seg.inT / segN * 100, rhOk = seg.rhOk / segN * 100, lowRhMin = seg.lowRh / segN * 1440;
      const wet = seg.wet / segN * 100, co2Below = seg.co2Below / segN * 100;
      const fails = [];
      if (inT < CAP.PASS.inT) fails.push(seg.tHi >= seg.tLo ? 'temperature too high' : 'temperature too low');
      if (seg.stage !== 'spawn') {
        if (rhOk < CAP.PASS.rhOk) fails.push('humidity too low');
        if (lowRhMin > CAP.PASS.lowRhMin) fails.push('humidity at the low alarm');
        if (wet > CAP.PASS.wetMax) fails.push('humidity near saturation');
        if (co2Below < CAP.PASS.co2Below) fails.push('CO₂ above the limit');
      } else if (seg.maxCore > coreMax) fails.push('block core too hot');
      const h0 = seg.startDay * 24, h1 = h0 + hours;
      const kwh = finishedHours.filter(h => h.h >= h0 && h.h < h1).reduce((s, h) => s + h.kwh, 0);
      return {
        stage: seg.stage, flush: seg.flush, startDay: seg.startDay, days, hours,
        targets: seg.targets, inT, rhOk, lowRhMin, wet, co2Below, maxCore: seg.maxCore,
        alarms: seg.alarms, kwh, rm: kwh * tariff, fails, pass: fails.length === 0,
      };
    });
    const totalsKwh = stages.reduce((s, x) => s + x.kwh, 0), totalsRm = stages.reduce((s, x) => s + x.rm, 0);
    const totals = { days: D, kwh: totalsKwh, rm: totalsRm, rmPerBlock: totalsRm / n, pass: stages.every(x => x.pass) };

    return {
      verdict: 'ok',
      targets: tg,
      inputs: { farmType, days: { ...cfg.program.days }, flushes: cfg.program.flushes, region, blocks: n, co2PerBlock: c, tariff, warnings },
      stages, totals, series: finishedHours,
    };
  }

  function runCycle(room, mix, opts = {}) {
    const g = runCycleSteps(room, mix, opts);
    let s = g.next();
    while (!s.done) {
      if (opts.onProgress) opts.onProgress(s.value);
      s = g.next();
    }
    return s.value;
  }

  async function runCycleAsync(room, mix, opts = {}) {
    const g = runCycleSteps(room, mix, opts);
    let s = g.next();
    while (!s.done) {
      if (opts.onProgress) opts.onProgress(s.value);
      await new Promise(resolve => setTimeout(resolve, 0));
      s = g.next();
    }
    return s.value;
  }

  global.ClimateCycle = { runCycleSteps, runCycle, runCycleAsync, cycleDays, DT };
})(typeof window !== 'undefined' ? window : globalThis);
