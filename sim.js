/*
 * sim.js: SIMULATION (the plant)
 *
 * This file models the world around the controller: the weather with a day/night cycle,
 * the fruiting room, the growing blocks, the machines, the sensors, and the meters.
 * It does not know how the controller works.
 *
 *   commands from the controller -> sim.step(dt, commands)   (physics runs every 1 s)
 *   sim.read() -> the last sensor reading                     (sensors report every env.sensorPeriod s)
 *
 * Model
 *   - Two air zones, low (bottom shelf) and high (top shelf), each half of the room. They mix
 *     naturally, more with the circulation fan and with the AC airflow. CO2 collects low; heat rises.
 *   - Air exchange: a filtered intake fan (SF-203) and an exhaust fan (EF-206), each with a motorised
 *     damper, switched on and off together (command air.on). Balanced: the room stays at neutral pressure.
 *     With the fans off the dampers are closed and only wall leakage exchanges air (unfiltered).
 *     The intake and the exhaust can each be low or high.
 *   - Blocks: their own stage, CO2 and heat per stage, water from fruit bodies, a block core temperature.
 *   - The AC is a split unit with its own thermostat (setpoint, return-air sensor, restart delay,
 *     full speed after each start). Its fan speed sets the coil temperature (low fan = colder coil =
 *     more water removed).
 *   - Sensors: position, offset, drift, delay, a wet RH sensor, faults for a test.
 *   - Disturbances: doors and workers at harvest, floor watering, rain, cloudy days.
 *
 * A real farm replaces this file. The controller does not change.
 */
(function (global) {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // Saturation absolute humidity in g/m³ at T °C (Magnus formula).
  const ahSat = T => 6.112 * Math.exp(17.67 * T / (T + 243.5)) * 216.74 / (273.15 + T);
  const rhOf = (T, ah) => clamp(100 * ah / ahSat(T), 0, 100);

  // Fixed facts about the room and the machines (the room part can be changed for calibration: env.room).
  const PLANT = {
    room: { volume: 60, heatCap: 1.2e6, ua: 80, infAch: 0.4, moistBuffer: 3, co2Out: 420, mixNatural: 0.03 },
    loads: { baseW: 30, lightsW: 80, solarPeakW: 500 },
    // Respiration (glucose oxidation): 1 L CO2 = 1.8 g; 10.6 kJ heat and 0.41 g water per g CO2.
    resp: { wPerLpm: 318, gpsPerLpm: 0.0123 },
    // CO2 (and heat) of a block per stage, relative to the measured fruiting value.
    blockStage: { spawn: 1.3, pinning: 1.0, fruiting: 1.0, rest: 0.6, empty: 0 },
    // Water from fruit bodies (transpiration), g/h per block, in fruiting.
    transpGph: 0.2,
    // Block core: heat capacity J/K per block; heat loss W/K per block (stacked and closed in spawn run).
    block: { heatCap: 3500, ua: { spawn: 0.05, other: 0.1 } },
    ac: { capW: 3500, auxW: 35, standbyW: 3, minFrac: 0.2, coil: { low: 9, auto: 11, high: 13 }, coldCoilC: 7, dryMaxFrac: 0.45,
          sensorOffset: 0.3, onBand: 0.5, offBand: 1.0, restartDelayS: 180, startBoostS: 180, kp: 0.5, ti: 600, airMix: 0.1,
          // largest latent part of the coil capacity per fan speed (more air = warmer coil = higher sensible heat ratio)
          latentMax: { low: 0.45, auto: 0.35, high: 0.2, cold: 0.5 } },
    fogger: { standbyW: 2, levels: [
      { name: 'Off', gph: 0, w: 0 }, { name: '1', gph: 1000, w: 70 }, { name: '2', gph: 2000, w: 135 }, { name: '3', gph: 3000, w: 200 },
    ] },
    // Air exchange (intake + exhaust pair) when on. wPerM3h is for both fans: no source yet, replace with equipment data.
    air: { m3h: 1800, wPerM3h: 0.08 },
    circ: { m3s: 0.35, w: 40 },
    person: { co2Lpm: 0.3, w: 100, gph: 50 },
    sensors: {
      ideal:   { T: 0, RH: 0, CO2: 0, gain: 1, tauT: 0, tauRH: 0, tauC: 0, driftRH: 0, wet: false },
      typical: { T: 0.2, RH: 2, CO2: 20, gain: 1.02, tauT: 60, tauRH: 60, tauC: 60, driftRH: 0.02, wet: true },
      poor:    { T: 0.6, RH: 4, CO2: 60, gain: 1.06, tauT: 120, tauRH: 180, tauC: 120, driftRH: 0.08, wet: true },
    },
  };
  const copCool = To => clamp(4.4 - 0.05 * (To - 20), 2, 5);
  const copHeat = To => clamp(2.6 + 0.06 * To, 1.8, 4.5);
  const level = (lv, n) => clamp(Math.round(lv || 0), 0, n - 1);

  // Things the user changes to test the controller. The UI edits this object live.
  const DEFAULT_ENV = {
    dailyCycle: true, tHigh: 33, tLow: 24, tFixed: 30, nightRH: 95,
    blocks: 2000, co2PerBlock: 45, blockStage: 'fruiting', probe: true,
    startHour: 6, noise: false, sensorPeriod: 30, sensorQuality: 'ideal',
    sensorAt: 'mid', sensor2At: 'none',            // 'low' | 'mid' | 'high'; second set: 'none' | 'low' | 'high'
    // Air exchange: airM3h null = PLANT.air.m3h; a number overrides it (held to 50-10000). Air in high, out low (CO2 collects low).
    airM3h: null, inletAt: 'high', exhaustAt: 'low',
    // Sensor faults for a test: 'ok' | 'frozen' | 'missing' | 'range' | 'spike'
    faults: { T: 'ok', RH: 'ok', CO2: 'ok', out: 'ok' },
    acStartBoostMin: 3,
    // Disturbances
    harvestDoors: false, harvestTimes: [8 * 60, 16 * 60], doorMin: 10, workers: 2, workMin: 60,
    randomWeather: false, rainChance: 0.3, cloudyChance: 0.3,
    seed: 1,
    room: {},               // calibration overrides of PLANT.room
    weatherSeries: null,    // calibration: [{ t, T, RH }] replaces the weather model
  };
  const FAULT_GROUP = { T: 'T', RH: 'RH', CO2: 'CO2', tOut: 'out', rhOut: 'out' };
  const FAULT_RANGE = { T: -40, RH: 0, CO2: 0, tOut: -40, rhOut: 0 };
  const SPIKE = { T: 15, RH: 40, CO2: 3000, tOut: 15, rhOut: 40 };

  // CO2 from the blocks in L/min (each block makes co2PerBlock mL/h in fruiting).
  const co2Lpm = e => e.blocks * e.co2PerBlock / 60000 * (PLANT.blockStage[e.blockStage] ?? 1);

  function create(env, snapshot) {
    const e = env || structuredClone(DEFAULT_ENV);
    const R = () => ({ ...PLANT.room, ...(e.room || {}) });
    // Air exchange size (m³/h): env.airM3h held to 50-10000; anything but a number means PLANT.air.m3h.
    const airM3h = () => (Number.isFinite(e.airM3h) ? clamp(e.airM3h, 50, 10000) : PLANT.air.m3h);
    let s = snapshot ? upgrade(structuredClone(snapshot)) : init();

    function init() {
      const T0 = 27, ah0 = 0.62 * ahSat(T0);
      return {
        t: 0,
        z: { lo: { T: T0, AH: ah0, C: 850 }, hi: { T: T0 + 0.3, AH: ah0, C: 800 } },
        core: T0 + 2,
        act: { power: true, mode: 'cool', setpoint: 25, acFan: 'auto', comp: false, acFrac: 0, coil: 'auto', huLevel: 0, air: false, lights: false, circ: false },
        ac: { integ: 0, offSince: -1e9, startUntil: 0, starts: 0 },
        p: { ac: PLANT.ac.standbyW, hu: PLANT.fogger.standbyW, air: 0, lights: 0, circ: 0 },
        kwh: { ac: 0, hu: 0, air: 0, lights: 0, circ: 0 },
        runS: { ac: 0, hu: 0, air: 0 },
        water: { fogKg: 0, acKg: 0 },
        unfilteredM3: 0,
        sens: null, wet: { on: false, since: null, level: 0 },
        frozen: {}, reading: null, seq: 0, nextRead: 0, rng: (e.seed ?? 1) >>> 0,
        dist: { door: 0, workersUntil: 0, workersN: 0, waterUntil: 0, rainUntil: 0, rainAt: null, cloudyDay: -1, dayRolled: -1 },
      };
    }

    // A snapshot from before the air exchange (one fan with levels 0-3): fan level > 0 is "on"; the meters keep their values.
    function upgrade(x) {
      if (x.act && 'fanLevel' in x.act) { x.act.air = x.act.fanLevel > 0; delete x.act.fanLevel; }
      for (const m of [x.p, x.kwh, x.runS, x.reading && x.reading.power, x.reading && x.reading.kwh, x.reading && x.reading.runS]) {
        if (m && 'fan' in m) { m.air = m.fan; delete m.fan; }
      }
      return x;
    }

    // Seeded random number 0..1 (mulberry32); its state is part of the snapshot.
    function rand() {
      let x = (s.rng = (s.rng + 0x6D2B79F5) >>> 0);
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    }
    const hourAt = t => (e.startHour + t / 3600) % 24;
    const dayAt = t => Math.floor((e.startHour * 3600 + t) / 86400);

    // Outdoor air. Temperature is a cosine with its peak at 15:00 and its low at 03:00.
    // The water content stays the same all day, so RH falls when the air warms. Rain cools and wets the air.
    function weather(t) {
      const h = hourAt(t);
      const sunOf = () => (h > 7 && h < 19 ? Math.sin(Math.PI * (h - 7) / 12) : 0);
      if (e.weatherSeries && e.weatherSeries.length) {
        const W = e.weatherSeries;
        let i = W.findIndex(p => p.t >= t); if (i < 0) i = W.length - 1;
        const a = W[Math.max(0, i - 1)], b = W[i], f = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
        const T = a.T + (b.T - a.T) * f, RH = a.RH + (b.RH - a.RH) * f;
        return { T, ah: RH / 100 * ahSat(T), RH, sun: sunOf(), hour: h, rain: false, cloudy: false };
      }
      let T = e.dailyCycle
        ? (e.tHigh + e.tLow) / 2 + (e.tHigh - e.tLow) / 2 * Math.cos(2 * Math.PI * (h - 15) / 24)
        : e.tFixed;
      const coolest = e.dailyCycle ? e.tLow : e.tFixed;
      let ah = Math.min(e.nightRH / 100 * ahSat(coolest), ahSat(T));
      const rain = t < s.dist.rainUntil, cloudy = s.dist.cloudyDay === dayAt(t);
      if (rain) { T -= 3; ah = 0.98 * ahSat(T); }
      let sun = sunOf();
      if (cloudy || rain) sun *= 0.3;
      return { T, ah, RH: 100 * ah / ahSat(T), sun, hour: h, rain, cloudy };
    }

    // Daily disturbances: harvest doors and workers, random rain and cloudy days.
    function disturbances(t) {
      const d = s.dist, m = hourAt(t) * 60, day = dayAt(t);
      if (e.randomWeather && d.dayRolled !== day) {
        d.dayRolled = day;
        if (rand() < e.cloudyChance) d.cloudyDay = day;
        if (rand() < e.rainChance) d.rainAt = day * 86400 - e.startHour * 3600 + (13 + rand() * 5) * 3600;
      }
      if (d.rainAt != null && t >= d.rainAt) { d.rainUntil = t + 2 * 3600; d.rainAt = null; }
      if (e.harvestDoors) {
        for (const at of e.harvestTimes) {
          if (m >= at && m < at + 1 / 60) { d.door = Math.max(d.door, t + e.doorMin * 60); d.workersUntil = Math.max(d.workersUntil, t + e.workMin * 60); d.workersN = e.workers; }
        }
      }
    }
    // Manual disturbances from the UI.
    function trigger(type) {
      const d = s.dist, t = s.t;
      if (type === 'door') d.door = t + e.doorMin * 60;
      if (type === 'workers') { d.workersUntil = t + e.workMin * 60; d.workersN = e.workers; }
      if (type === 'water') d.waterUntil = t + 3600;
      if (type === 'rain') d.rainUntil = t + 2 * 3600;
      if (type === 'cloudy') d.cloudyDay = dayAt(t);
    }

    // Air at a position: 'low', 'high', or 'mid' (the average of the two zones).
    function zoneAt(pos) {
      const { lo, hi } = s.z;
      if (pos === 'low') return { T: lo.T, RH: rhOf(lo.T, lo.AH), C: lo.C };
      if (pos === 'high') return { T: hi.T, RH: rhOf(hi.T, hi.AH), C: hi.C };
      const T = (lo.T + hi.T) / 2, AH = (lo.AH + hi.AH) / 2;
      return { T, RH: rhOf(T, AH), C: (lo.C + hi.C) / 2 };
    }
    // Sensor electronics: delay, offset, gain, drift, and a wet RH sensor. Runs every second.
    function sensorPhysics(dt) {
      const q = PLANT.sensors[e.sensorQuality] || PLANT.sensors.ideal;
      const lag = (prev, x, tau) => (tau > 0 && prev != null ? prev + (x - prev) * Math.min(1, dt / tau) : x);
      const days = s.t / 86400;
      const sens = s.sens || (s.sens = {});
      for (const [key, pos] of [['a', e.sensorAt], ['b', e.sensor2At]]) {
        if (!pos || pos === 'none') { delete sens[key]; continue; }
        const z = zoneAt(pos), p = sens[key] || (sens[key] = { T: z.T, RH: z.RH, C: z.C });
        p.T = lag(p.T, z.T, q.tauT); p.RH = lag(p.RH, z.RH, q.tauRH); p.C = lag(p.C, z.C, q.tauC);
        p.out = { T: p.T + q.T, RH: clamp(p.RH + q.RH + q.driftRH * days, 0, 100), C: (p.C - 400) * q.gain + 400 + q.CO2 };
      }
      // Wet RH sensor (main set): after 10 min of condensation it reads 100 %, then it dries slowly.
      const w = s.wet, a = sens.a;
      if (a && q.wet) {
        if (a.RH >= 98) { if (w.since == null) w.since = s.t; if (s.t - w.since >= 600) w.on = true; } else w.since = null;
        if (w.on && a.RH < 95) w.on = false;
        w.level = w.on ? 1 : Math.max(0, w.level - dt / 1800);
        a.out.RH = a.out.RH + (100 - a.out.RH) * w.level;
      }
    }

    // The sensors take a sample at a fixed period. The controller sees only the last sample.
    function sampleSensors() {
      const w = weather(s.t);
      if (!s.sens) sensorPhysics(0);
      const j = amp => (e.noise ? (rand() * 2 - 1) * amp : 0);
      const A = s.sens.a ? s.sens.a.out : zoneAt('mid');
      const raw = {
        T: A.T + j(0.08), RH: clamp(A.RH + j(0.6), 0, 100), CO2: A.C + j(10),
        tOut: w.T + j(0.1), rhOut: clamp(w.RH + j(0.8), 0, 100),
      };
      const faults = e.faults || {};
      const val = k => {
        const mode = faults[FAULT_GROUP[k]] || 'ok';
        if (mode !== 'frozen') delete s.frozen[k];
        if (mode === 'ok') return raw[k];
        if (mode === 'frozen') {
          if (s.frozen[k] == null) s.frozen[k] = s.reading && s.reading[k] != null ? s.reading[k] : raw[k];
          return s.frozen[k];
        }
        if (mode === 'missing') return null;
        if (mode === 'range') return FAULT_RANGE[k];
        if (mode === 'spike' && rand() < 0.3) {
          const x = raw[k] + SPIKE[k] * (0.4 + 0.6 * rand()) * (rand() < 0.5 ? -1 : 1);   // random size and sign
          return k === 'RH' || k === 'rhOut' ? clamp(x, 1, 100) : x;
        }
        return raw[k];
      };
      s.reading = {
        seq: ++s.seq, t: s.t, hour: w.hour,
        T: val('T'), RH: val('RH'), CO2: val('CO2'), tOut: val('tOut'), rhOut: val('rhOut'),
        power: { ...s.p }, kwh: { ...s.kwh }, runS: { ...s.runS }, water: { ...s.water }, unfilteredM3: s.unfilteredM3,
      };
      if (e.probe) s.reading.core = s.core + j(0.05);
      if (s.sens.b) { const B = s.sens.b.out; s.reading.T2 = B.T + j(0.08); s.reading.RH2 = clamp(B.RH + j(0.6), 0, 100); s.reading.CO2b = B.C + j(10); }
      s.nextRead = s.t + Math.max(1, e.sensorPeriod);
    }

    function step(dt, cmd) {
      const room = R(), A = PLANT.ac, ac = s.ac, a = s.act;
      disturbances(s.t);
      const w = weather(s.t);

      // ---- Machines accept the command inside their limits ----
      a.power = !!cmd.ac.power;
      a.mode = ['cool', 'heat', 'dry', 'fan'].includes(cmd.ac.mode) ? cmd.ac.mode : 'cool';
      a.setpoint = clamp(Number(cmd.ac.setpoint) || 25, 16, 30);
      a.acFan = ['low', 'auto', 'high'].includes(cmd.ac.fan) ? cmd.ac.fan : 'auto';
      a.huLevel = level(cmd.hu.level, PLANT.fogger.levels.length);
      a.air = !!(cmd.air && cmd.air.on);
      // Controllers that do not send lights: the lights follow 07:00-19:00.
      a.lights = cmd.lights ? !!cmd.lights.on : (w.hour >= 7 && w.hour < 19);
      a.circ = cmd.circ ? !!cmd.circ.on : false;

      // ---- AC thermostat (return air = high zone + sensor offset) ----
      const tRet = s.z.hi.T + A.sensorOffset;
      if (!a.power || a.mode === 'fan') {
        if (ac.comp) { ac.comp = false; ac.offSince = s.t; }
      } else {
        const demand = a.mode === 'heat' ? a.setpoint - tRet : tRet - a.setpoint;
        if (!ac.comp) {
          if (demand > A.onBand && s.t - ac.offSince >= A.restartDelayS) {
            ac.comp = true; ac.startUntil = s.t + (e.acStartBoostMin ?? A.startBoostS / 60) * 60; ac.integ = 0; ac.starts++;
          }
        } else if (demand < -A.offBand) { ac.comp = false; ac.offSince = s.t; }
        if (ac.comp) {
          ac.integ = clamp(ac.integ + demand * dt, -A.ti / A.kp, A.ti / A.kp);
          let fr = clamp(A.kp * demand + A.kp * ac.integ / A.ti, A.minFrac, 1);
          if (s.t < ac.startUntil) fr = 1;
          if (a.mode === 'dry') fr = Math.min(fr, A.dryMaxFrac);
          a.acFrac = fr;
        }
      }
      if (!ac.comp) a.acFrac = 0;
      a.comp = ac.comp;
      a.coil = a.mode === 'dry' ? 'cold' : a.acFan;

      // ---- Air flows (m³/s) ----
      // On: filtered air in through the intake, the same flow out through the exhaust, no leakage.
      // Off: the dampers are closed; only wall leakage, half through each zone, unfiltered.
      const m3h = airM3h();
      const qAir = a.air ? m3h / 3600 : 0, leak = a.air ? 0 : room.infAch * room.volume / 3600;
      const d = s.dist, qDoor = s.t < d.door ? 0.25 : 0;
      const inZ = e.inletAt === 'high' ? 'hi' : 'lo', outZ = e.exhaustAt === 'low' ? 'lo' : 'hi';
      const inflow = { lo: 0, hi: 0 }, outflow = { lo: 0, hi: 0 };
      inflow[inZ] += qAir; outflow[outZ] += qAir;
      inflow.lo += leak / 2; inflow.hi += leak / 2; outflow.lo += leak / 2; outflow.hi += leak / 2;
      let unfiltered = leak;
      inflow.lo += qDoor; outflow.lo += qDoor; unfiltered += qDoor;
      // Net flow from low to high (air enters one zone and leaves at the other).
      const qUp = inflow.lo - outflow.lo;
      const qMix = room.mixNatural + (a.circ ? PLANT.circ.m3s : 0) + (a.power ? A.airMix : 0);

      // ---- Sources ----
      const L = PLANT.loads, nb = e.blocks;
      const lpmBlocks = co2Lpm(e);
      const workers = s.t < d.workersUntil ? (d.workersN || 0) : 0;
      const respGps = lpmBlocks * PLANT.resp.gpsPerLpm + (e.blockStage === 'fruiting' ? nb * PLANT.transpGph / 3600 : 0);
      // Block core: heat from respiration flows to the air through the block surface.
      const qBlock = nb > 0 ? lpmBlocks * PLANT.resp.wPerLpm / nb : 0;                 // W per block
      const uaB = e.blockStage === 'spawn' ? PLANT.block.ua.spawn : PLANT.block.ua.other;
      const tAir = (s.z.lo.T + s.z.hi.T) / 2;
      s.core += (qBlock - uaB * (s.core - tAir)) / PLANT.block.heatCap * dt;
      const blockToAir = nb * uaB * (s.core - tAir);                                   // W
      const fog = PLANT.fogger.levels[a.huLevel], fogGps = fog.gph / 3600;
      const waterGps = s.t < d.waterUntil ? 3000 / 3600 : 0;                            // floor watering: 3 kg in 1 h
      let qAc = 0, latent = 0, pAc = a.power ? A.auxW : A.standbyW;
      if (a.comp && (a.mode === 'cool' || a.mode === 'dry')) {
        const total = a.acFrac * A.capW;
        const coil = a.coil === 'cold' ? A.coldCoilC : A.coil[a.coil];
        latent = Math.min(a.acFrac * 0.14 * Math.max(0, s.z.hi.AH - ahSat(coil)), A.latentMax[a.coil] * total / 2450);
        qAc = -Math.max(0, total - latent * 2450);
        pAc = total / copCool(w.T) + A.auxW;
      } else if (a.comp && a.mode === 'heat') {
        const total = a.acFrac * A.capW;
        qAc = total; pAc = total / copHeat(w.T) + A.auxW;
      }
      const lightsW = a.lights ? L.lightsW : 0;

      // ---- Zone balances ----
      const Vz = room.volume / 2, Cz = room.heatCap / 2, Mz = Vz * room.moistBuffer;
      const Z = s.z, out = { T: w.T, AH: w.ah, C: room.co2Out };
      const heat = {
        // The AC takes air from the high zone and blows the cold air down: half of its effect reaches the low zone.
        lo: room.ua * 0.4 * (w.T - Z.lo.T) + L.baseW / 2 + blockToAir / 2 + workers * PLANT.person.w - (fogGps + waterGps) * 2450 + qAc / 2,
        hi: room.ua * 0.6 * (w.T - Z.hi.T) + L.baseW / 2 + lightsW + w.sun * L.solarPeakW + blockToAir / 2 + qAc / 2,
      };
      const water = {
        lo: respGps / 2 + fogGps + waterGps + workers * PLANT.person.gph / 3600,
        hi: respGps / 2 - latent,
      };
      const co2 = {   // ppm·m³/s; CO2 is heavier than air, so more of it stays low
        lo: (lpmBlocks * 0.6 + workers * PLANT.person.co2Lpm) / 60000 * 1e6,
        hi: lpmBlocks * 0.4 / 60000 * 1e6,
      };
      const next = { lo: {}, hi: {} };
      for (const [zn, other] of [['lo', 'hi'], ['hi', 'lo']]) {
        const z = Z[zn], o = Z[other];
        // outdoor air in, zone air out, the net flow between the zones, and mixing
        const fromOther = zn === 'hi' ? Math.max(0, qUp) : Math.max(0, -qUp);
        const toOther = zn === 'lo' ? Math.max(0, qUp) : Math.max(0, -qUp);
        const flux = k => inflow[zn] * out[k] - outflow[zn] * z[k] + fromOther * o[k] - toOther * z[k] + qMix * (o[k] - z[k]);
        next[zn].T = z.T + (flux('T') * 1206 + heat[zn]) / Cz * dt;
        next[zn].AH = clamp(z.AH + (flux('AH') + water[zn]) / Mz * dt, 0.3, ahSat(next[zn].T));
        next[zn].C = Math.max(0, z.C + (flux('C') + co2[zn]) / Vz * dt);
      }
      s.z = next;

      // ---- Meters ----
      s.p.ac = pAc;
      s.p.hu = a.huLevel > 0 ? fog.w : PLANT.fogger.standbyW;
      s.p.air = a.air ? m3h * PLANT.air.wPerM3h : 0;
      s.p.lights = lightsW;
      s.p.circ = a.circ ? PLANT.circ.w : 0;
      for (const k of Object.keys(s.p)) s.kwh[k] += s.p[k] * dt / 3.6e6;
      if (a.comp) s.runS.ac += dt;
      if (a.huLevel > 0) s.runS.hu += dt;
      if (a.air) s.runS.air += dt;
      s.water.fogKg += fogGps * dt / 1000;
      s.water.acKg += latent * dt / 1000;
      s.unfilteredM3 += unfiltered * dt;
      s.t += dt;
      sensorPhysics(dt);
      if (s.t >= s.nextRead) sampleSensors();
    }

    // The last sensor sample: the only data that the controller gets.
    // Its seq number changes when a new sample is available.
    function read() {
      if (!s.reading) sampleSensors();
      return s.reading;
    }

    // Live plant data for the drawing and for scoring a test (the controller must not use it).
    function view() {
      const w = weather(s.t), mid = zoneAt('mid'), lo = zoneAt('low'), hi = zoneAt('high');
      const cop = s.act.mode === 'heat' ? copHeat(w.T) : copCool(w.T);
      const room = R(), qAir = s.act.air ? airM3h() : 0, leak = s.act.air ? 0 : room.infAch * room.volume;
      return {
        t: s.t, act: { ...s.act }, weather: w, lights: s.act.lights, cop,
        T: mid.T, RH: mid.RH, CO2: mid.C, zones: { lo, hi }, core: s.core,
        airM3h: qAir + leak, fogGph: PLANT.fogger.levels[s.act.huLevel].gph,
        power: { ...s.p }, kwh: { ...s.kwh }, water: { ...s.water }, unfilteredM3: s.unfilteredM3,
        nextRead: s.nextRead, acStarts: s.ac.starts, tRet: s.z.hi.T + PLANT.ac.sensorOffset,
        door: s.t < s.dist.door, workers: s.t < s.dist.workersUntil ? (s.dist.workersN || 0) : 0,
        watering: s.t < s.dist.waterUntil, wetSensor: s.wet.on || s.wet.level > 0.05,
      };
    }

    // Calibration: start the room at measured values (both zones the same).
    function setRoom({ T, RH, CO2 }) {
      for (const zn of ['lo', 'hi']) {
        if (Number.isFinite(T)) s.z[zn].T = T;
        if (Number.isFinite(RH)) s.z[zn].AH = RH / 100 * ahSat(s.z[zn].T);
        if (Number.isFinite(CO2)) s.z[zn].C = CO2;
      }
      // block core at its steady state above the air (it changes slowly, so a wrong start disturbs a replay for hours)
      if (Number.isFinite(T)) {
        const nb = e.blocks, uaB = e.blockStage === 'spawn' ? PLANT.block.ua.spawn : PLANT.block.ua.other;
        s.core = T + (nb > 0 ? co2Lpm(e) * PLANT.resp.wPerLpm / nb / uaB : 0);
      }
      s.sens = null; s.reading = null;
    }

    return { step, read, view, trigger, setRoom, snapshot: () => structuredClone(s), env: e };
  }

  global.ClimateSim = { create, PLANT, DEFAULT_ENV, ahSat, co2Lpm };
})(typeof window !== 'undefined' ? window : globalThis);
