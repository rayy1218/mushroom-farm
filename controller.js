/*
 * controller.js: CLIMATE CONTROLLER
 *
 * This file reads the sensor values, applies the grower's settings, and sends commands to
 * the machines. It has no access to the simulation, so the same logic can run on a PLC or
 * on a microcontroller.
 *
 *   reading  { seq, t, T, RH, CO2, tOut, rhOut }        (one new reading per sensor period;
 *                                                        a value can be null when a sensor fails)
 *   ctl.update(reading) -> commands
 *   commands { ac: { power, mode, setpoint, fan }, hu: { level }, air: { on }, lights: { on }, circ: { on } }
 *
 * The air conditioner is a split unit with its own thermostat: the controller sends a mode and a
 * setpoint. The fogger has fixed power levels. The air exchange is a filtered intake fan (SF-203) and an
 * exhaust fan (EF-206), each with a motorised damper, switched on and off together (contract C9).
 *
 * Each update has these steps:
 *   0. Stage program: slow change of the targets after a stage change (ramp), automatic stage change
 *      after the set days, flush count, and the daily harvest windows (fogger off before picking).
 *   1. Check each sensor value. A bad value is not used; 3 bad readings = sensor fault.
 *   2. Purge cycle: idle -> purge -> after -> idle. The CO2 rise with the fans off predicts the next purge
 *      (shown to the grower). The AC and the fogger keep their normal targets through a purge.
 *      A purge runs from the start level (fanOn) to the stop level (fanOff), at most purgeMaxS.
 *      3 capped purges in a row: the "air exchange too small" alarm, with the size the room needs.
 *   3. Rules for the air exchange, highest priority first:
 *        Manual  the grower's on/off.
 *        P1  CO2 safety level: on, ignoring the time cap and the minimum off time.
 *        P2  Humidity first:   a purge that would dry the room waits while RH is low, at most until the CO2 limit.
 *        P3  CO2 purge, or a timed purge when the CO2 sensor fails.
 *        P4  Free cooling and outdoor drying.
 *      Then the temperature and humidity loops. A failed sensor puts its loop in a safe state.
 *   4. Machine protection: the air exchange runs at least 30 s and stays off rules.minOffS; minimum on/off
 *      times for the fogger; a minimum time between AC commands.
 *   5. Purge record: each air run (start, end, reason, CO2, air volume, capped) and a total per hour.
 */
(function (global) {
  'use strict';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  // The controller calculates absolute humidity from its own sensors (Magnus formula).
  const ahSat = T => 6.112 * Math.exp(17.67 * T / (T + 243.5)) * 216.74 / (273.15 + T);
  const ahOf = (T, RH) => RH / 100 * ahSat(T);
  const roundHalf = v => Math.round(v * 2) / 2;

  // Typical start values per crop and stage: [temperature °C, RH %, CO2 limit ppm]. Tune them to the farm.
  // rest = rest between flushes: drier, less fresh air.
  // limits: alarm range for the air (tMin-tMax) and the block core (coreMax).
  // coreTarget: block core temperature that the AC holds in spawn run (with a block probe).
  // range: the good fruiting band (T °C, RH %), narrower than the alarm limits; a mixed room needs targets inside every crop's range.
  // Only crops that fruit near tropical room temperature (a split AC cannot hold 16-21 °C on a 33 °C day).
  // Flags: casing (milky: soil casing before pinning, a manual step). Flags for other crops:
  // maxFog (no direct fog on the crop), shock { T, hours } (cold shock at pinning), spawnLights (light in spawn run).
  const CROPS = {
    oyster:    { name: 'Grey oyster', spawn: [24, 70, 5000], pinning: [24, 92, 800], fruiting: [25, 88, 1000], rest: [25, 80, 2000],
                 limits: { tMin: 20, tMax: 30, coreMax: 32 }, coreTarget: 28, range: { T: [23, 27], RH: [85, 92] } },
    // Dark-cap strain: cooler air and light give the darker cap colour.
    black:     { name: 'Black oyster', spawn: [25, 70, 5000], pinning: [23, 92, 800], fruiting: [23, 88, 900], rest: [24, 80, 2000],
                 limits: { tMin: 16, tMax: 28, coreMax: 30 }, coreTarget: 27, range: { T: [21, 25], RH: [85, 92] } },
    // Fast and very tropical. Short shelf life; cold storage damages it.
    pink:      { name: 'Pink oyster', spawn: [27, 70, 5000], pinning: [26, 92, 800], fruiting: [26, 88, 1000], rest: [27, 80, 2000],
                 limits: { tMin: 20, tMax: 32, coreMax: 33 }, coreTarget: 29, range: { T: [24, 29], RH: [85, 92] } },
    // Black spore stalks on the block surface are normal, not a mould.
    abalone:   { name: 'Abalone oyster', spawn: [27, 70, 5000], pinning: [26, 90, 1000], fruiting: [27, 87, 1000], rest: [27, 80, 2000],
                 limits: { tMin: 22, tMax: 32, coreMax: 33 }, coreTarget: 29, range: { T: [25, 30], RH: [85, 90] } },
    // Very sensitive to CO2 (long thin stems); brittle caps.
    golden:    { name: 'Golden oyster', spawn: [26, 70, 5000], pinning: [24, 92, 700], fruiting: [24, 88, 800], rest: [25, 80, 2000],
                 limits: { tMin: 18, tMax: 30, coreMax: 31 }, coreTarget: 27, range: { T: [22, 26], RH: [85, 92] } },
    // Takes more CO2 and direct water; needs light for a dark colour.
    woodear:   { name: 'Black jelly (wood ear)', spawn: [27, 70, 5000], pinning: [26, 92, 1500], fruiting: [26, 90, 1500], rest: [27, 80, 3000],
                 limits: { tMin: 20, tMax: 32, coreMax: 33 }, coreTarget: 29, range: { T: [24, 29], RH: [88, 95] } },
    // Long cycle. CO2 sets the shape: below about 1000 ppm kidney caps, above 2000 ppm antlers.
    reishi:    { name: 'Reishi (lingzhi)', spawn: [28, 70, 5000], pinning: [27, 90, 1000], fruiting: [27, 88, 1000], rest: [27, 80, 2000],
                 limits: { tMin: 22, tMax: 32, coreMax: 34 }, coreTarget: 29, range: { T: [25, 30], RH: [85, 92] } },
    // Heat-loving (30-35 °C). Held at 30 °C: the highest split AC setpoint.
    milky:     { name: 'Milky (Calocybe indica)', spawn: [30, 70, 5000], pinning: [30, 90, 1000], fruiting: [30, 85, 1000], rest: [30, 80, 2000],
                 limits: { tMin: 25, tMax: 36, coreMax: 38 }, coreTarget: 32, range: { T: [28, 34], RH: [80, 90] }, casing: true },
  };
  const STAGES = { spawn: 'Spawn run', pinning: 'Pinning', fruiting: 'Fruiting', rest: 'Rest between flushes' };
  // Farms that buy ready-to-fruit blocks never have a spawn run or pinning in their rooms.
  const FARM_TYPES = {
    full: { name: 'Full cycle (own spawn run and pinning)', stages: ['spawn', 'pinning', 'fruiting', 'rest'] },
    ready: { name: 'Ready-to-fruit blocks (bought in)', stages: ['fruiting', 'rest'] },
  };
  // Values that move slowly (ramp) after a stage change. "rules.x" = cfg.rules.x
  const RAMP_KEYS = ['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff'];
  const RAMP_ROUND = { spT: 0.1, spRH: 1 };     // others: 10 ppm
  const getK = (cfg, k) => (k.startsWith('rules.') ? cfg.rules[k.slice(6)] : cfg[k]);
  const setK = (cfg, k, v) => { if (k.startsWith('rules.')) cfg.rules[k.slice(6)] = v; else cfg[k] = v; };
  const hhmm = min => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
  // Band = "in band" range. Alarm = alarm limit. Both are +/- around the target.
  const BANDS = { T: 1, TAlarm: 2, RH: 3, RHAlarm: 8 };

  // What the controller knows about the machines (from their data sheets).
  const MACHINES = {
    airTags: ['SF-203', 'EF-206'],       // the air exchange: filtered intake fan and exhaust fan, on and off together
    foggerLevels: ['Off', '1', '2', '3'],
    acModes: ['cool', 'heat', 'dry', 'fan'],
    acSetMin: 16, acSetMax: 30,
  };

  // Plausible sensor values. rate = largest believable change per minute.
  // stuckMin = the same exact value for this long means a frozen sensor. It is long, because a
  // real sensor with 0.1 resolution can show the same value for a while in a stable room.
  const SENSORS = {
    T:     { name: 'Room temperature', min: -10, max: 60, rate: 2, stuckMin: 120 },
    RH:    { name: 'Room humidity', min: 1, max: 100, rate: 15, stuckMin: 120 },
    CO2:   { name: 'CO₂', min: 300, max: 10000, rate: 1000, stuckMin: 60 },
    tOut:  { name: 'Outdoor temperature', min: -20, max: 60, rate: 2, stuckMin: 120 },
    rhOut: { name: 'Outdoor humidity', min: 1, max: 100, rate: 15, stuckMin: 120 },
    // optional sensors: not installed = the value is undefined in the reading
    core:  { name: 'Block probe', min: -10, max: 70, rate: 1, stuckMin: 360, optional: true },
    T2:    { name: 'Second temperature', min: -10, max: 60, rate: 2, stuckMin: 120, optional: true },
    RH2:   { name: 'Second humidity', min: 1, max: 100, rate: 15, stuckMin: 120, optional: true },
    CO2b:  { name: 'Second CO₂', min: 300, max: 10000, rate: 1000, stuckMin: 60, optional: true },
  };
  // Saturation vapour pressure in kPa (for VPD).
  const es = T => 0.6112 * Math.exp(17.67 * T / (T + 243.5));
  const RESP_WIN_RH = 900, RESP_WIN_CO2 = 600;   // s; a sensor must respond to its machine in this time
  const OFFSET_OF = { T: 'T', T2: 'T', RH: 'RH', RH2: 'RH', CO2: 'CO2', CO2b: 'CO2' };   // sensor -> correction
  const FAULT_COUNT = 3;          // bad readings in a row before a sensor fault
  const TRIM_TI = 1800;           // s; speed of the AC setpoint correction
  const MODE_HOLD_S = 300;         // a mode change (heat/cool, dry) needs its condition for this long
  const AIR_MIN_ON_S = 30;         // every air run lasts at least this long, so a noisy reading cannot stop it at once
  const AIR_POINTS = 20;           // CO2 readings kept for the rise rate
  const CO2_OUT = 420;             // ppm; outdoor CO2 for the size estimate
  const FOG_FULL_S = 300;          // humidity first acts only after the fogger is at its maximum for this long
  const RESP_PUSH_AH = 0.4;        // g/m³: a purge opens the humidity response window only above this push
  const ALARM_DELAY_S = 300;       // a process alarm needs its condition for this long (critical alarms: 60 s)

  function defaultRules(lim) {
    return {
      // P1 CO2 safety level
      co2Safety: true, co2SafetyAt: lim + 500,
      // P2 humidity first: a purge that would dry the room waits while RH is low
      rhLock: true, rhStop: 3, rhResume: 1,
      // P3 CO2 purge: start and stop levels (ppm), time cap (s), minimum off time (s)
      fanOn: lim - 100, fanOff: Math.max(450, lim - 300), purgeMaxS: 180, minOffS: 60,
      // P4 the air exchange also runs for free cooling and outdoor drying
      freeCool: true, outdoorDry: true,
      // 2.6: fog cools first when the room is warm; AC fan speed follows humidity (high fan = warmer coil = less water out)
      fogCool: true, acFanRH: true,
    };
  }
  function defaultProtect() {
    return {
      fogMinOn: 1, fogMinOff: 1, acMinCmd: 2,                                  // minutes
      timedPurgeOn: 10, timedPurgeEvery: 30, faultFogLevel: 1,                 // safe states (fallback)
      learnSafe: true,                       // safe states copy the average of the hours before the fault
    };
  }
  function defaultProgram() {
    return {
      auto: false,                            // change the stage automatically after the set days
      rampH: 4,                               // hours for the targets to move to the new stage
      days: { spawn: 21, pinning: 4, fruiting: 7, rest: 10 },
      flushes: 4,                             // flushes per block, then replace the blocks
      // Daily harvest windows during fruiting: fogger off dryMin before each time, until pickMin after it.
      // floorDrop: lowest RH in the window = target - floorDrop (fog level 2-3 below it, so no low-humidity alarm).
      harvest: { on: true, times: [8 * 60, 16 * 60], dryMin: 90, pickMin: 60, floorDrop: 6 },
      // Lights: daily on/off time and the stages with light (crop flag spawnLights adds the spawn run).
      lights: { on: 7 * 60, off: 19 * 60, stages: { spawn: false, pinning: true, fruiting: true, rest: false } },
      coreControl: true,                      // spawn run: hold the block core (probe) at the crop core target
    };
  }
  // Targets of a crop and stage, for all ramp keys.
  function profileTargets(crop, stage) {
    const [t, h, c] = CROPS[crop][stage], d = defaultRules(c);
    return { spT: t, spRH: h, co2Lim: c, 'rules.co2SafetyAt': d.co2SafetyAt, 'rules.fanOn': d.fanOn, 'rules.fanOff': d.fanOff };
  }
  function defaultSettings() {
    const [spT, spRH, co2Lim] = CROPS.oyster.fruiting;
    return {
      farmType: 'full', crop: 'oyster', stage: 'fruiting', spT, spRH, co2Lim,
      humMode: 'vpd',                        // 'vpd': humidity target moves with temperature to hold the evaporation; 'rh'
      sensorMode: 'average',                 // two sensor sets: 'average' | 'worst' | 'main'
      circ: 'auto',                          // circulation fan: 'auto' | 'on' | 'off'
      offsets: { T: 0, RH: 0, CO2: 0 },      // sensor corrections (from a salt test or a reference meter), added to the readings
      program: defaultProgram(),
      roomM3: 60,                            // room volume, for air changes per hour and the size estimate
      airM3h: 1800,                          // airflow of the air exchange when on (m³/h)
      rules: defaultRules(co2Lim),
      protect: defaultProtect(),
      manual: {
        ac: { auto: true, power: true, mode: 'cool', setpoint: spT },
        hu: { auto: true, level: 1 },
        air: { auto: true, on: false },
        lights: { auto: true, on: true },
        circ: { auto: true, on: true },
      },
    };
  }

  // Apply the crop + stage targets at once (no ramp). The CO2 levels follow the new limit; the switches stay.
  function applyProfile(cfg) {
    const to = profileTargets(cfg.crop, cfg.stage);
    for (const k of RAMP_KEYS) setK(cfg, k, to[k]);
  }

  // Alarm list. c = context { spT, rhT (humidity target now), co2Lim, rules, stage, limits }.
  // Severity follows the crop and the stage: low RH is critical during pinning; the crop range is serious;
  // a hot block core is critical.
  const RH_LO_LVL = { pinning: 'critical', fruiting: 'serious' };
  const ALARMS = [
    { id: 'tHi', label: 'Temperature above target + 2 °C', lvl: () => 'warning', on: (v, c) => v.T > c.spT + BANDS.TAlarm, off: (v, c) => v.T < c.spT + BANDS.TAlarm - 0.2, uses: 'T' },
    { id: 'tLo', label: 'Temperature below target − 2 °C', lvl: () => 'warning', on: (v, c) => v.T < c.spT - BANDS.TAlarm && !c.coreCooling, off: (v, c) => v.T > c.spT - BANDS.TAlarm + 0.2, uses: 'T' },
    { id: 'tCrop', label: 'Temperature outside the crop range', lvl: () => 'serious', on: (v, c) => v.T > c.limits.tMax || v.T < c.limits.tMin, off: (v, c) => v.T < c.limits.tMax - 0.3 && v.T > c.limits.tMin + 0.3, uses: 'T' },
    { id: 'coreHi', label: 'Block core too hot', lvl: () => 'critical', on: (v, c) => v.core > c.limits.coreMax, off: (v, c) => v.core < c.limits.coreMax - 0.5, uses: 'core' },
    { id: 'rhHi', label: 'High humidity', lvl: () => 'warning', on: (v, c) => v.RH > c.rhT + BANDS.RHAlarm, off: (v, c) => v.RH < c.rhT + BANDS.RHAlarm - 1, uses: 'RH' },
    { id: 'rhLo', label: 'Low humidity', lvl: c => RH_LO_LVL[c.stage] || 'warning', on: (v, c) => v.RH < c.rhT - BANDS.RHAlarm, off: (v, c) => v.RH > c.rhT - BANDS.RHAlarm + 1, uses: 'RH' },
    { id: 'co2Hi', label: 'CO₂ above limit', lvl: () => 'warning', on: (v, c) => v.CO2 > c.co2Lim, off: (v, c) => v.CO2 < c.co2Lim - 20, uses: 'CO2' },
    { id: 'co2Safe', label: 'CO₂ at safety level', lvl: () => 'critical', on: (v, c) => v.CO2 >= c.rules.co2SafetyAt, off: (v, c) => v.CO2 < c.rules.co2SafetyAt - 20, uses: 'CO2' },
    // Raised and cleared by the purge cycle (endPurge), not by the loop in alarms(): 3 capped purges in a row.
    { id: 'airTooSmall', label: 'Air exchange too small for the CO₂ load', lvl: () => 'warning' },
    { id: 'disagree', label: 'The two sensor sets disagree: check the air movement or a sensor', lvl: () => 'warning', on: v => v.disagree, off: v => !v.disagree, uses: null },
  ];
  const LVL_RANK = { critical: 3, serious: 2, warning: 1 };
  // m:ss for a number of seconds
  const mss = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  // State of the purge cycle (contract C9 section 5.3)
  function airInit() {
    return { state: 'idle', since: null, purgeStart: null, capRun: 0, nextPurgeS: null, delayed: false, timed: false, timedK: null, timedFrom: null, sizeText: null };
  }
  function freshState(cfg) {
    return {
      lastT: null, sensors: {}, alarms: {}, v: {}, f: {},
      rhLocked: false, rhRecovered: false, co2SafetyOn: false,
      trim: 0, acMode: 'cool', dryOn: false, heatSince: null, coolSince: null, drySince: null,
      stage: { since: null, flush: 1, ramp: null, done: false }, harvestOn: false, harvestWin: null, harvestFog: false,
      huOn: false, fanDryOn: false, fogCoolOn: false, fogFullSince: null,
      acLimitSince: null, alarmPend: {}, rhT: cfg.spRH, vpd: null, vpdT: null,
      resp: { RH: { n: 0, win: null, fault: false }, CO2: { n: 0, win: null, fault: false } },
      air: airInit(), airReason: null, airPts: [], airRate: null, airRunCapped: false,
      req: { ac: { power: true, mode: 'cool', setpoint: cfg.spT, fan: 'auto' }, hu: { level: 0 }, air: { on: false }, lights: { on: false }, circ: { on: false } },
      cmd: { ac: { power: true, mode: 'cool', setpoint: cfg.spT, fan: 'auto' }, hu: { level: 0 }, air: { on: false }, lights: { on: false }, circ: { on: false } },
      out: { air: { since: null }, hu: { since: null }, ac: { last: null } },
      hold: { ac: '', hu: '', air: '' },
      why: { ac: '', hu: '', air: '', lights: '', circ: '' },
      stats: { airOnS: 0, purges: 0, purgeS: 0, longestPurgeS: 0, cappedPurges: 0, delayedS: 0, fogStarts: 0, acCmds: 0 },
      purgeRec: { cur: null, events: [], hours: [] },
      prev: null,
    };
  }
  // A snapshot saved before C9 (one fan with levels 0-3): bring it to the air exchange shape (C9 5.7).
  const OLD_STATE = ['fanCo2On', 'co2Timed', 'purgeHeld', 'purgeReduced', 'setbackReq', 'setbackOn', 'setbackS', 'setbackAlarmStop',
    'setbackTimeStop', 'fanReason', 'fanBlocked', 'airLevel', 'airStepT', 'timedOnS', 'timedSource'];
  function upgradeState(s, cfg) {
    if (!s.air) upgradeOld(s);
    // Fields added later: take the start value from a fresh state (also the keys of st.air).
    const fresh = freshState(cfg);
    for (const k of Object.keys(fresh)) if (!(k in s)) s[k] = fresh[k];
    for (const k of Object.keys(fresh.air)) if (!(k in s.air)) s.air[k] = fresh.air[k];
    return s;
  }
  function upgradeOld(s) {
    for (const k of OLD_STATE) delete s[k];
    for (const g of ['cmd', 'req']) { s[g].air = { on: false }; delete s[g].fan; }   // off: the next update decides (no run record to match)
    s.out.air = s.out.fan || { since: null }; delete s.out.fan;
    for (const g of ['hold', 'why']) { s[g].air = s[g].fan || ''; delete s[g].fan; }
    const hours = (s.exh && s.exh.hours) || [];
    s.purgeRec = { cur: null, events: [], hours: hours.map(b => ({ h: b.h, runS: b.runS || 0, starts: b.starts || 0, m3: b.m3 || 0, cappedN: 0, fogLS: b.fogLS || 0, acHighS: b.acHighS || 0, acLowS: b.acLowS || 0 })) };
    delete s.exh;
    const S = s.stats || {};
    s.stats = { airOnS: S.fanOnS || 0, purges: S.fanStarts || 0, purgeS: 0, longestPurgeS: 0, cappedPurges: 0, delayedS: 0, fogStarts: S.fogStarts || 0, acCmds: S.acCmds || 0 };
    s.prev = null;                       // the event log compares with the step before: start it again
  }

  function create(cfg, snapshot, onEvent) {
    const emit = onEvent || (() => {});
    let st = snapshot ? upgradeState(structuredClone(snapshot), cfg) : freshState(cfg);
    const say = (t, lvl, text) => emit({ t, lvl, text });
    const ppm = v => Math.round(v);
    const alarmOn = id => !!(st.alarms[id] && st.alarms[id].active);

    // ---------- 0. Stage program ----------
    // Change the stage. The targets move from their present values to the new ones over rampH hours.
    function setStage(stage, t, ramp = true) {
      if (!FARM_TYPES[cfg.farmType].stages.includes(stage)) return false;
      const to = profileTargets(cfg.crop, stage), from = {};
      for (const k of RAMP_KEYS) from[k] = getK(cfg, k);
      cfg.stage = stage;
      st.stage.since = t;
      let hours = cfg.program.rampH;
      // Crop flag "shock": pinning starts with a cold shock (fast drop), then the normal pinning targets.
      const shock = CROPS[cfg.crop].shock, prev = st.stage.prevStage;
      st.stage.shock = null;
      // A shock at pinning and at each new flush (rest -> fruiting). The AC cannot go below its lowest setpoint.
      if (shock && (stage === 'pinning' || (stage === 'fruiting' && prev === 'rest'))) {
        const T = Math.max(shock.T, MACHINES.acSetMin);
        st.stage.shock = { until: t + shock.hours * 3600, T };
        to.spT = T; hours = Math.min(hours, 1);
        say(t, 'info', `Cold shock: ${T} °C for ${shock.hours} h. Soak the blocks in cold water for 12–24 h (manual step).`);
        if (shock.T < MACHINES.acSetMin) raise('shockLimit', `The cold shock needs ${shock.T} °C, but the AC goes down to ${MACHINES.acSetMin} °C only: the cold-water soak must give the shock`, 'warning', t);
      }
      st.stage.prevStage = stage;
      if (stage === 'pinning' && CROPS[cfg.crop].casing) say(t, 'info', 'Case the blocks with 2–3 cm of pasteurised soil (manual step). Pins come about 10 days after casing.');
      if (ramp && hours > 0) st.stage.ramp = { from, to, t0: t, dur: hours * 3600 };
      else { st.stage.ramp = null; for (const k of RAMP_KEYS) setK(cfg, k, to[k]); }
      say(t, 'info', `Stage: ${STAGES[stage]}${stage === 'fruiting' || stage === 'rest' ? `, flush ${st.stage.flush} of ${cfg.program.flushes}` : ''}. Targets ${to.spT} °C, ${to.spRH} % RH, CO₂ limit ${to.co2Lim} ppm${st.stage.ramp ? `, reached in ${hours} h` : ''}.`);
      return true;
    }
    function setCrop(crop, t) { cfg.crop = crop; setStage(cfg.stage, t, true); }
    function setFarmType(type, t) {
      cfg.farmType = type;
      st.stage.flush = 1; st.stage.done = false; clear('blocksDone', null, t);
      const S = FARM_TYPES[type].stages;
      setStage(S.includes(cfg.stage) ? cfg.stage : S[0], t, true);
    }
    // A person changed a target: the ramp stops, so it does not overwrite the change.
    function cancelRamp() { st.stage.ramp = null; }
    function nextFlushStage(t) {
      const P = cfg.program, from = cfg.stage, S = FARM_TYPES[cfg.farmType].stages;
      if (from === 'fruiting') {
        if (st.stage.flush >= P.flushes) {
          st.stage.done = true;
          raise('blocksDone', `Flush ${st.stage.flush} of ${P.flushes} finished: replace the blocks`, 'warning', t);
          return 'rest';
        }
        return 'rest';
      }
      if (from === 'rest') { if (st.stage.done) return null; st.stage.flush++; return 'fruiting'; }
      return S[S.indexOf(from) + 1];
    }
    function program(r) {
      const t = r.t, P = cfg.program, sg = st.stage;
      if (sg.since == null) sg.since = t;
      // end of a cold shock: move to the normal pinning targets
      if (sg.shock && t >= sg.shock.until) {
        const to = profileTargets(cfg.crop, cfg.stage), from = {};
        for (const k of RAMP_KEYS) from[k] = getK(cfg, k);
        sg.shock = null;
        sg.ramp = cfg.program.rampH > 0 ? { from, to, t0: t, dur: cfg.program.rampH * 3600 } : null;
        if (!sg.ramp) for (const k of RAMP_KEYS) setK(cfg, k, to[k]);
        say(t, 'info', `Cold shock ended: pinning at ${to.spT} °C`);
      }
      // ramp
      if (sg.ramp) {
        const f = clamp((t - sg.ramp.t0) / sg.ramp.dur, 0, 1);
        for (const k of RAMP_KEYS) {
          const step = RAMP_ROUND[k] || 10, v = sg.ramp.from[k] + (sg.ramp.to[k] - sg.ramp.from[k]) * f;
          setK(cfg, k, Math.round(v / step) * step);
        }
        if (f >= 1) { for (const k of RAMP_KEYS) setK(cfg, k, sg.ramp.to[k]); sg.ramp = null; say(t, 'info', `Targets for ${STAGES[cfg.stage].toLowerCase()} reached`); }
      }
      // automatic stage change
      if (P.auto && P.days[cfg.stage] > 0 && t - sg.since >= P.days[cfg.stage] * 86400) {
        const next = nextFlushStage(t);
        if (next) setStage(next, t, true); else sg.since = t;
      }
      // daily harvest window (fruiting only): fogger off before picking
      st.harvestWin = null;
      const H = P.harvest;
      if (H.on && cfg.stage === 'fruiting' && r.hour != null && Number.isFinite(r.hour)) {
        const m = r.hour * 60;
        for (const at of H.times) {
          const a = at - H.dryMin, into = ((m - a) % 1440 + 1440) % 1440;
          if (into < H.dryMin + H.pickMin) { st.harvestWin = { at, from: a, to: at + H.pickMin }; break; }
        }
      }
      const was = st.harvestOn;
      st.harvestOn = !!st.harvestWin;
      if (st.harvestOn && !was) say(t, 'info', `Harvest window ${hhmm(st.harvestWin.at)}: fogger off from ${hhmm(st.harvestWin.from)} to ${hhmm(st.harvestWin.to)}`);
      if (!st.harvestOn && was) say(t, 'info', 'Harvest window ended: normal fog');
    }
    function programStatus(t) {
      const P = cfg.program, sg = st.stage, days = P.days[cfg.stage];
      const out = { stage: cfg.stage, day: sg.since == null ? 1 : Math.floor((t - sg.since) / 86400) + 1, days, flush: sg.flush, flushes: P.flushes,
        done: sg.done, auto: P.auto, harvestOn: st.harvestOn, harvestWin: st.harvestWin, ramp: null, nextHarvest: null,
        shock: sg.shock ? { leftS: Math.max(0, sg.shock.until - t), T: sg.shock.T } : null };
      if (sg.ramp) out.ramp = { leftS: Math.max(0, sg.ramp.t0 + sg.ramp.dur - t), to: sg.ramp.to };
      return out;
    }

    // ---------- 1. Sensor checks ----------
    // co2FallFree (C9 5.6): the air exchange ran in the last interval or stopped at the last reading, so CO2 may fall fast.
    function validate(r, co2FallFree) {
      const v = {}, f = {};
      for (const k of Object.keys(SENSORS)) {
        const L = SENSORS[k];
        if (L.optional && r[k] === undefined) { delete st.sensors[k]; v[k] = undefined; f[k] = true; continue; }   // not installed
        const s = st.sensors[k] || (st.sensors[k] = { good: null, goodT: null, last: null, lastT: null, sameSince: null, pend: null, pendN: 0, bad: 0, fault: false, why: '', faultSince: null });
        const off = (cfg.offsets && cfg.offsets[OFFSET_OF[k]]) || 0;
        const x = r[k] != null && Number.isFinite(r[k]) && !k.startsWith('core') && !k.endsWith('Out') ? r[k] + off : r[k];
        const valid = x != null && Number.isFinite(x);
        let ok = true, why = '';
        if (!valid) { ok = false; why = 'no reading'; }
        else if (x < L.min || x > L.max) { ok = false; why = 'value out of range'; }
        else if (s.good != null && r.t > s.goodT) {
          const perMin = Math.abs(x - s.good) / ((r.t - s.goodT) / 60);
          // A purge really lowers CO2 faster than the rate limit (C9 5.6): a falling CO2 is not tested then.
          const purgeFall = co2FallFree && (k === 'CO2' || k === 'CO2b') && x < s.good;
          if (perMin > L.rate && !purgeFall) {
            // A real fast change stays; a spike does not. Accept the jump when 3 readings in a row agree.
            const agrees = s.pend != null && Math.abs(x - s.pend) <= L.rate * Math.max(0.25, (r.t - (s.lastT ?? r.t)) / 60);
            s.pendN = agrees ? s.pendN + 1 : 1;
            s.pend = x;
            if (s.pendN < 3) { ok = false; why = 'sudden jump (spike)'; }
          }
        }
        if (ok) { s.pend = null; s.pendN = 0; }
        // Frozen sensor: the same exact value for a long time. A wet RH sensor reads 100 %, so 100 % is not "frozen".
        const wet = (k === 'RH' || k === 'rhOut') && valid && x >= 99.9;
        if (valid && x === s.last && !wet) { if (s.sameSince == null) s.sameSince = s.lastT; }
        else s.sameSince = null;
        s.last = valid ? x : null; s.lastT = r.t;
        // While the fogger runs, the room RH always moves: the same exact RH for 30 min is a frozen sensor.
        const stuckMin = (k === 'RH' || k === 'RH2') && st.cmd.hu.level > 0 ? Math.min(30, L.stuckMin) : L.stuckMin;
        if (ok && s.sameSince != null && r.t - s.sameSince >= stuckMin * 60) { ok = false; why = 'value does not change (frozen)'; }
        if (ok) { s.good = x; s.goodT = r.t; s.bad = 0; s.why = ''; }
        else { s.bad++; s.why = why; }
        const was = s.fault, resp = st.resp[k];
        s.fault = s.bad >= FAULT_COUNT || !!(resp && resp.fault);
        if (resp && resp.fault && s.bad < FAULT_COUNT) why = 'does not respond to its machine';
        if (s.fault && !was) { s.faultSince = r.t; raise(`sensor_${k}`, `${L.name} sensor fault: ${why || s.why}`, 'serious', r.t); }
        if (!s.fault && was) clear(`sensor_${k}`, `${L.name} sensor`, r.t);
        v[k] = s.good;
        f[k] = s.fault || s.good == null;
      }
      f.out = f.tOut || f.rhOut;
      combine(v, f);
      return { v, f };
    }
    // Two sensor sets (2.10): use the average, the worst, or the main set. If one set fails, use the other.
    function combine(v, f) {
      v.disagree = false;
      const pairs = [['T', 'T2', 1.5], ['RH', 'RH2', 6], ['CO2', 'CO2b', 300]];
      if (pairs.every(([, b]) => v[b] === undefined && f[b])) return;
      for (const [a, b, lim] of pairs) {
        const okA = !f[a], okB = !f[b] && v[b] !== undefined;
        v[a + 'Main'] = v[a];
        if (okA && okB) {
          if (Math.abs(v[a] - v[b]) > lim) v.disagree = true;
          if (cfg.sensorMode === 'average') v[a] = (v[a] + v[b]) / 2;
          else if (cfg.sensorMode === 'worst') {
            if (a === 'CO2') v[a] = Math.max(v[a], v[b]);
            else if (a === 'RH') v[a] = Math.min(v[a], v[b]);
            else v[a] = Math.abs(v[b] - cfg.spT) > Math.abs(v[a] - cfg.spT) ? v[b] : v[a];
          }
        } else if (!okA && okB) { v[a] = v[b]; f[a] = false; }       // redundancy: the second set takes over
      }
    }

    // ---------- Alarms (with acknowledgement) ----------
    function raise(id, label, lvl, t, note) {
      const a = st.alarms[id];
      if (a && a.active) return;
      st.alarms[id] = { id, label, lvl, active: true, acked: false, since: t };
      say(t, lvl, `Alarm: ${label}${note ? `. ${note}` : ''}`);
    }
    function clear(id, label, t) {
      const a = st.alarms[id];
      if (!a || !a.active) return;
      a.active = false;
      if (a.acked) delete st.alarms[id];
      say(t, 'good', `Cleared: ${label || a.label}`);
    }
    function alarms(v, f, t) {
      const c = { spT: cfg.spT, rhT: st.rhT, co2Lim: cfg.co2Lim, rules: cfg.rules, stage: cfg.stage, limits: CROPS[cfg.crop].limits, coreCooling: !!st.coreCooling };
      for (const a of ALARMS) {
        if (!a.on) continue;                                                  // raised elsewhere (airTooSmall)
        if (a.uses && f[a.uses]) { delete st.alarmPend[a.id]; continue; }   // no alarm from a failed or missing sensor
        if (a.id === 'co2Safe' && !cfg.rules.co2Safety) { clear(a.id, a.label, t); continue; }
        if (!alarmOn(a.id)) {
          // Alarm delay: the condition must stay (5 min; 60 s for critical alarms), so short changes give no alarm.
          if (a.on(v, c)) {
            const since = st.alarmPend[a.id] ?? (st.alarmPend[a.id] = t), lvl = a.lvl(c);
            if (t - since >= (lvl === 'critical' ? 60 : ALARM_DELAY_S)) { raise(a.id, a.label, lvl, t); delete st.alarmPend[a.id]; }
          } else delete st.alarmPend[a.id];
        } else if (a.off(v, c)) clear(a.id, a.label, t);
      }
      // The AC is too small: it is at its limit and the room stays more than 1 °C above the target for 1 h.
      const atLimit = st.acMode !== 'heat' && !f.T && (st.trim <= -2.9 || st.cmd.ac.setpoint <= MACHINES.acSetMin) && v.T > cfg.spT + 1;
      st.acLimitSince = atLimit ? (st.acLimitSince ?? t) : null;
      if (atLimit && t - st.acLimitSince >= 3600) raise('acTooSmall', 'The AC is at its limit and cannot hold the target: it is too small for this crop in this weather', 'warning', t);
      else if (alarmOn('acTooSmall') && !f.T && v.T <= cfg.spT + 0.5) clear('acTooSmall', null, t);
    }
    function ack(id) {
      for (const a of Object.values(st.alarms)) {
        if (id && a.id !== id) continue;
        a.acked = true;
        if (!a.active) delete st.alarms[a.id];
      }
    }
    function alarmList() {
      return Object.values(st.alarms).sort((a, b) => (LVL_RANK[b.lvl] || 0) - (LVL_RANK[a.lvl] || 0));
    }

    // ---------- 2. Purge cycle (contract C9 section 5) ----------
    function setState(state, t) {
      if (st.air.state !== state) { st.air.state = state; st.air.since = t; }
    }
    function startPurge(t) {
      setState('purge', t);
      st.air.purgeStart = t;
      st.stats.purges++;
    }
    // End of a purge. capped: true = the time cap, false = the stop level, null = manual control, a CO2 fault or a safety run.
    function endPurge(t, capped) {
      const A = st.air, runS = t - A.purgeStart;
      st.stats.purgeS += runS;
      st.stats.longestPurgeS = Math.max(st.stats.longestPurgeS, runS);
      A.purgeStart = null;
      setState('after', t);
      if (capped === true) {
        A.capRun++;
        st.stats.cappedPurges++;
        hourBucket(Math.floor(t / 3600)).cappedN++;
        st.airRunCapped = true;                // the record's event gets capped: true when the air run ends
        say(t, 'info', `Purge stopped at the time cap (${mss(runS)})`);
        if (A.capRun >= 3) sizeCheck(t);
      } else if (capped === false) {
        A.capRun = 0;
        A.sizeText = null;
        clear('airTooSmall', null, t);
      }
    }
    // 5.5: after 3 capped purges in a row, the size the room needs, from the last rise rate with the fans off.
    function sizeCheck(t) {
      const R = cfg.rules, A = st.air, AIR = global.ClimateAir;
      const head = `Purges don't reach ${R.fanOff} ppm in ${+(R.purgeMaxS / 60).toFixed(1)} min`;
      if (st.airRate > 0) {
        const prod = AIR.prodFromRise({ ratePpmS: st.airRate, volume: cfg.roomM3, co2: st.v.CO2, co2Out: CO2_OUT });
        const need = AIR.sizeFor({ volume: cfg.roomM3, co2Out: CO2_OUT, prodM3h: prod, start: R.fanOn, stop: R.fanOff, capS: R.purgeMaxS });
        A.sizeText = Number.isFinite(need.needM3h)
          ? `${head}. The air exchange needs about ${need.needM3h} m³/h (now ${cfg.airM3h} m³/h).`
          : `${head}: outside air alone cannot bring CO₂ this low; raise the stop level.`;
      } else A.sizeText = `${head}. The air exchange is too small; the size needed is not measured yet.`;
      raise('airTooSmall', ALARMS.find(a => a.id === 'airTooSmall').label, 'warning', t, A.sizeText);
    }
    // Push of humidity (5.4): outdoor minus room absolute humidity (g/m³); null with an outdoor, T or RH fault.
    const ahPush = (v, f) => (f.out || f.T || f.RH ? null : ahOf(v.tOut, v.rhOut) - ahOf(v.T, v.RH));
    // P2 humidity first: RH low, the fogger at its maximum for FOG_FULL_S, and a purge that would dry the room.
    // The lock holds a purge that has not started; a running purge goes on. The CO2 limit ends the wait.
    function humidityFirst(v, f, t, pushAH) {
      const R = cfg.rules, A = st.air;
      const stopAt = st.rhT - R.rhStop, resumeAt = st.rhT - R.rhResume;
      if (!R.rhLock || f.RH || st.harvestOn) st.rhLocked = false;
      else if (!st.rhLocked && v.RH <= stopAt && st.fogFullSince != null && t - st.fogFullSince >= FOG_FULL_S && pushAH != null && pushAH <= -0.5) st.rhLocked = true;
      else if (st.rhLocked && v.RH >= resumeAt) { st.rhLocked = false; st.rhRecovered = true; }
      A.delayed = st.rhLocked && A.state !== 'purge' && v.CO2 >= R.fanOn && v.CO2 < cfg.co2Lim;
    }
    // Rise rate and next purge, P1 CO2 safety level, P2 humidity first and the purge states. Runs before the AC and the fogger.
    function airPlan(v, f, t, prevOn) {
      const R = cfg.rules, A = st.air, AIR = global.ClimateAir;
      st.rhRecovered = false;                                                // set by humidityFirst when RH ends the lock
      // Rise rate (5.4): the good CO2 readings since the last air run ended (at most AIR_POINTS)
      if (prevOn) st.airPts = [];
      else if (!f.CO2 && ['CO2', 'CO2b'].some(k => st.sensors[k] && st.sensors[k].goodT === t)) {
        st.airPts.push({ t, C: v.CO2 });
        if (st.airPts.length > AIR_POINTS) st.airPts.shift();
      }
      const rate = AIR.riseRate(st.airPts);
      if (rate != null) st.airRate = rate;                                   // kept for the size estimate (5.5)
      // P1 CO2 safety level, off 20 ppm below it
      st.co2SafetyOn = R.co2Safety && !f.CO2 && v.CO2 >= (st.co2SafetyOn ? R.co2SafetyAt - 20 : R.co2SafetyAt);
      const manual = !cfg.manual.air.auto;
      A.timed = !manual && !!f.CO2;
      if (manual || f.CO2 || st.co2SafetyOn) {
        // No purge cycle: the grower, the timed purge or the safety run (airExchange) runs the air exchange.
        // A safety run is not a purge (5.3): a purge running when it starts ends here, not capped.
        if (A.state === 'purge') endPurge(t, null);
        setState('idle', t);
        A.nextPurgeS = st.co2SafetyOn ? 0 : null; A.delayed = false;
        if (!st.co2SafetyOn) st.rhLocked = false;
        return;
      }
      A.nextPurgeS = v.CO2 >= R.fanOn ? 0 : rate > 0 ? (R.fanOn - v.CO2) / rate : null;   // shown to the grower (5.4)
      humidityFirst(v, f, t, ahPush(v, f));
      // States (5.3). offFor: how long the air exchange has been off (0 while on).
      const on = st.cmd.air.on, offFor = on ? 0 : st.out.air.since == null ? Infinity : t - st.out.air.since;
      if (A.state === 'purge') {
        const runS = t - A.purgeStart;
        if (v.CO2 <= R.fanOff && runS >= AIR_MIN_ON_S) endPurge(t, false);
        else if (runS >= R.purgeMaxS) endPurge(t, true);
      }
      // The fans must be off: free cooling or drying keep them on, and then CO2 is being removed anyway.
      if (A.state === 'after' && !on && offFor >= R.minOffS) setState('idle', t);
      // The minimum off time is also kept in protectAir (a purge request while the fans are off waits there).
      if (A.state === 'idle' && v.CO2 >= R.fanOn && !A.delayed && (on || offFor >= R.minOffS)) startPurge(t);
    }
    // P4: AC by mode and setpoint.
    function airConditioner(v, f, dt) {
      const m = cfg.manual.ac, q = st.req.ac, R = cfg.rules;
      if (!m.auto) {
        q.power = m.power; q.mode = m.mode; q.setpoint = clamp(roundHalf(m.setpoint), MACHINES.acSetMin, MACHINES.acSetMax); q.fan = m.fan || 'auto';
        st.why.ac = 'Manual control. The controller does not change this output.';
        return;
      }
      if (f.T) {
        // Safe state: the AC thermostat controls alone at the target.
        st.dryOn = false;
        q.power = true; q.mode = st.acMode === 'heat' ? 'heat' : 'cool';
        // Keep the learned setpoint correction: it holds the difference between the AC sensor and the room.
        q.setpoint = clamp(roundHalf(cfg.spT + st.trim), MACHINES.acSetMin, MACHINES.acSetMax); q.fan = 'auto';
        st.why.ac = `Temperature sensor fault: the AC uses its own thermostat at the target, with the learned correction ${st.trim >= 0 ? '+' : ''}${st.trim.toFixed(1)} °C.`;
        return;
      }
      const t = st.lastT, crop = CROPS[cfg.crop];
      let e = v.T - cfg.spT, coreNote = '';
      // Spawn run with a block probe: colonising blocks run hotter than the air. Cool for the core too.
      if (cfg.stage === 'spawn' && cfg.program.coreControl && !f.core && v.core !== undefined) {
        const eCore = v.core - crop.coreTarget;
        if (eCore > e) { e = eCore; coreNote = ` Block core ${v.core.toFixed(1)} °C is above ${crop.coreTarget} °C: the AC cools for the core.`; }
      }
      st.coreCooling = !!coreNote;
      // Mode changes only when the condition stays for MODE_HOLD_S (one wrong reading must not change the mode).
      // Heat starts inside the band edge (-0.8 °C), so the room cannot stay below the band in cool mode.
      st.heatSince = e < -0.8 ? (st.heatSince ?? t) : null;
      st.coolSince = e > 0.5 ? (st.coolSince ?? t) : null;
      if (st.acMode !== 'heat' && st.heatSince != null && t - st.heatSince >= MODE_HOLD_S) st.acMode = 'heat';
      else if (st.acMode === 'heat' && st.coolSince != null && t - st.coolSince >= MODE_HOLD_S) st.acMode = 'cool';
      // Slow correction: the AC measures its own return air, which is not the room sensor.
      // Room too warm -> setpoint down; room too cold -> setpoint up (in both modes). The error is limited
      // to ±2 °C, so one wrong reading cannot move the correction far.
      st.trim = clamp(st.trim - clamp(e, -2, 2) * dt / TRIM_TI, -3, 3);
      // Dry mode when RH is high and outdoor air cannot dry the room.
      const fanCanDry = R.outdoorDry && !f.out && !f.RH && ahOf(v.tOut, v.rhOut) < ahOf(v.T, v.RH) - 0.5;
      // Dry mode starts just above the band (target + 3.5 %) when the condition stays for 5 min.
      // Not when the room (or the block core) needs cooling: dry mode limits the compressor; cooling with a low fan also dries.
      const dryWanted = !f.RH && v.RH > st.rhT + 3.5 && st.acMode !== 'heat' && !fanCanDry && v.T > cfg.spT - 1 && e < 0.5;
      st.drySince = dryWanted ? (st.drySince ?? t) : null;
      if (f.RH) st.dryOn = false;
      else if (!st.dryOn && st.drySince != null && t - st.drySince >= MODE_HOLD_S) st.dryOn = true;
      else if (st.dryOn && (v.RH < st.rhT + 1 || v.T < cfg.spT - 1.5 || st.acMode === 'heat' || e > 1)) st.dryOn = false;

      const mode = st.dryOn ? 'dry' : st.acMode;
      const sp = cfg.spT + st.trim;
      const corr = `Setpoint correction ${st.trim >= 0 ? '+' : ''}${st.trim.toFixed(1)} °C for the AC sensor.`;
      q.power = true;
      let why = mode === 'dry' ? `Humidity is ${(v.RH - st.rhT).toFixed(0)} % above the target and outdoor air is too wet: dry mode.`
        : Math.abs(e) <= 0.3 ? `Room is at the target. ${corr}`
        : `Room is ${Math.abs(e).toFixed(1)} °C ${e > 0 ? 'above' : 'below'} the target. ${corr}`;
      // AC fan speed (2.6): a high fan makes the coil warmer, so less water comes out of the air.
      let fanTxt = '';
      q.fan = 'auto';
      if (mode === 'dry') q.fan = 'low';
      else if (f.RH) {
        // Safe state: copy the AC fan pattern of this hour on an earlier day, as the fog does.
        const since = st.sensors.RH.faultSince ?? t;
        const hi = historyFor('acHighS', t, since), lo = historyFor('acLowS', t, since);
        if (hi != null && lo != null) {
          const ph = (t % 1800) / 1800, fh = hi / 3600, fl = lo / 3600;
          q.fan = ph < fh ? 'high' : ph < fh + fl ? 'low' : 'auto';
          fanTxt = ' Humidity sensor fault: the AC fan copies this hour of an earlier day.';
        } else { q.fan = 'high'; fanTxt = ' Humidity sensor fault: AC fan high, so the coil takes less water out (humidity first).'; }
      }
      else if (R.acFanRH) {
        if (v.RH < st.rhT - 1) { q.fan = 'high'; fanTxt = ' AC fan high: the coil takes less water out of the air.'; }
        else if (v.RH > st.rhT + 2) { q.fan = 'low'; fanTxt = ' AC fan low: the coil takes more water out of the air.'; }
      }
      q.mode = mode;
      q.setpoint = clamp(roundHalf(sp), MACHINES.acSetMin, MACHINES.acSetMax);
      st.why.ac = why + coreNote + fanTxt;
    }

    function fogger(v, f, t) {
      const m = cfg.manual.hu, q = st.req.hu, R = cfg.rules, P = cfg.protect;
      if (!m.auto) { q.level = m.level; st.why.hu = 'Manual control. The controller does not change this output.'; return; }
      if (st.harvestOn) {
        // Drier caps for picking, but not below the harvest floor (hysteresis 1 %).
        const floor = st.rhT - cfg.program.harvest.floorDrop;
        if (f.RH || alarmOn('rhLo')) st.harvestFog = true;
        else if (!st.harvestFog && v.RH <= floor) st.harvestFog = true;
        else if (st.harvestFog && v.RH >= floor + 1) st.harvestFog = false;
        q.level = !st.harvestFog ? 0 : !f.RH && v.RH < floor - 1 ? 3 : 2;
        st.why.hu = `Harvest window ${hhmm(st.harvestWin.from)}–${hhmm(st.harvestWin.to)}: fog off so the caps are drier for picking.`
          + (st.harvestFog ? ` RH is at the harvest floor ${floor.toFixed(0)} %, so fog level ${q.level}.` : ` Fog comes back below ${floor.toFixed(0)} % RH.`);
        return;
      }
      st.harvestFog = false;
      if (f.RH) {
        // Safe state: copy the average fog of the hours before the fault, in 10 min cycles.
        const learned = P.learnSafe ? historyFor('fogLS', t, st.sensors.RH.faultSince) : null;   // level-seconds per hour
        if (learned != null) {
          const avg = learned / 3600, L = clamp(Math.ceil(avg), 1, 3), onFrac = clamp(avg / L, 0.1, 1);
          q.level = t % 600 < onFrac * 600 ? L : 0;
          st.why.hu = `Humidity sensor fault: fog copies this hour of an earlier day, level ${L} for ${Math.round(onFrac * 10)} min of each 10 min.`;
        } else {
          q.level = t % 1200 < 600 ? P.faultFogLevel : 0;
          st.why.hu = `Humidity sensor fault: fixed fog at level ${P.faultFogLevel}, 10 min on and 10 min off.`;
        }
        return;
      }
      if (!st.huOn && v.RH < st.rhT - 2 && !st.dryOn) st.huOn = true;
      else if (st.huOn && (v.RH >= st.rhT + 0.5 || st.dryOn)) st.huOn = false;
      const deficit = st.rhT + 1 - v.RH;
      let lv = !st.huOn ? 0 : deficit > 4 ? 3 : deficit > 2 ? 2 : 1;
      let why = st.huOn ? `Humidity is ${(st.rhT - v.RH).toFixed(1)} % below the target.`
        : v.RH > st.rhT + 5 ? 'Humidity is above the target. The fogger stays off.'
        : 'Humidity is in the band. The unit is on standby.';
      // Fog-first cooling (2.6): when the room is warm, fog cools it by evaporation before the AC must work more.
      const crop = CROPS[cfg.crop], eT = !f.T ? v.T - cfg.spT : 0;
      if (!R.fogCool || f.T) st.fogCoolOn = false;
      else if (!st.fogCoolOn && eT > 0.5 && v.RH < st.rhT + 1) st.fogCoolOn = true;
      else if (st.fogCoolOn && (eT < 0.1 || v.RH >= st.rhT + 2.5)) st.fogCoolOn = false;
      if (st.fogCoolOn) {
        const want = eT > 1 ? 2 : 1;
        if (lv < want) { lv = want; why = `Room is ${eT.toFixed(1)} °C warm: fog cools it first (evaporation).`; }
      }
      // Crop flag maxFog: a crop that must not get direct fog.
      if (crop.maxFog && lv > crop.maxFog) { lv = crop.maxFog; why += ` ${crop.name}: fog limited to level ${crop.maxFog} (no direct fog on the crop).`; }
      q.level = lv;
      const fogMax = crop.maxFog || 3;
      st.fogFullSince = lv >= fogMax ? (st.fogFullSince ?? t) : null;
      st.why.hu = why + (lv > 0 ? ` Level ${lv}.` : '');
    }

    // The air exchange request (C9 5.6): manual, then P1 safety, P3 purge or timed purge, P4 free cooling and drying.
    // Returns the reason of the request ('' = off).
    function airExchange(v, f, t) {
      const m = cfg.manual.air, q = st.req.air, R = cfg.rules, P = cfg.protect, A = st.air;
      if (!m.auto) { q.on = !!m.on; st.why.air = 'Manual control. The controller does not change this output.'; return q.on ? 'manual' : ''; }
      // Outdoor drying (hysteresis): RH well above the target and drier outdoor air.
      if (!R.outdoorDry || f.out || f.RH || f.T) st.fanDryOn = false;
      else {
        const ahIn = ahOf(v.T, v.RH), ahOut = ahOf(v.tOut, v.rhOut);
        if (!st.fanDryOn && v.RH > st.rhT + 5 && ahOut < ahIn - 0.5) st.fanDryOn = true;
        else if (st.fanDryOn && (v.RH < st.rhT + 1 || ahOut >= ahIn)) st.fanDryOn = false;
      }
      // Free cooling: the room is warm and outdoor air is at least 3 °C cooler.
      const cool = R.freeCool && !f.out && !f.T && v.T - cfg.spT > 0.3 && v.tOut < v.T - 3;
      // Timed purge (CO2 sensor fault): a share of each period, learned from the hours before the fault or from the setting.
      let timed = null;
      if (A.timed) {
        const learned = P.learnSafe ? historyFor('runS', t, st.sensors.CO2.faultSince) : null;   // s per hour
        const share = clamp(learned != null ? learned / 3600 * 1.1 : P.timedPurgeOn / P.timedPurgeEvery, 0.02, 0.9);
        const run = Math.min(R.purgeMaxS, Math.max(AIR_MIN_ON_S, share * P.timedPurgeEvery * 60)), period = Math.max(run / share, run + R.minOffS);
        // Each period starts its run at its first reading, so a reading time that never falls in a fixed window cannot skip it.
        const k = Math.floor(t / period);
        if (A.timedK !== k) { A.timedK = k; if (A.timedFrom == null || t - A.timedFrom >= run) A.timedFrom = t; }   // a run in progress is not restarted
        timed = { on: t - A.timedFrom < run, run, period, learned: learned != null };
      } else { A.timedK = null; A.timedFrom = null; }
      const reason = st.co2SafetyOn ? 'safety' : A.state === 'purge' ? 'purge' : timed && timed.on ? 'timed'
        : cool ? 'free cooling' : st.fanDryOn ? 'drying' : '';
      q.on = reason !== '';
      st.why.air = airWhy(v, reason, timed) + (A.sizeText ? ` ${A.sizeText}` : '');
      return reason;
    }
    // Plain-language reason for the air exchange (C9 5.7)
    function airWhy(v, reason, timed) {
      const R = cfg.rules, A = st.air, t = st.lastT;
      if (reason === 'safety') return `CO₂ is ${ppm(v.CO2)} ppm, at or above the safety level ${R.co2SafetyAt}. The air exchange runs even when humidity is low.`;
      if (timed && (reason === 'timed' || !reason)) return timed.on ? `CO₂ sensor fault: timed purge, ${Math.round(timed.run)} s of each ${Math.round(timed.period)} s (from ${timed.learned ? 'this hour of an earlier day' : 'the setting'}).`
        : 'CO₂ sensor fault: timed purge. The air exchange is in the off part of the cycle.';
      if (A.state === 'purge') return `Purging since ${mss(t - A.purgeStart)} (at most ${mss(R.purgeMaxS)}). It stops at ${R.fanOff} ppm.`;
      if (A.delayed) return `Humidity first: RH ${v.RH.toFixed(1)} % is at or below ${(st.rhT - R.rhStop).toFixed(0)} % and outdoor air is drier. The purge waits until RH is ${(st.rhT - R.rhResume).toFixed(0)} % or CO₂ is ${cfg.co2Lim} ppm.`;
      if (reason === 'free cooling') return `Outdoor air is ${(v.T - v.tOut).toFixed(1)} °C cooler. The air exchange runs to help the AC.`;
      if (reason === 'drying') return 'Humidity is high and outdoor air is drier. The air exchange runs to dry the room.';
      if (A.state === 'after') {
        const offAt = st.cmd.air.on ? t : st.out.air.since ?? t;
        return `Minimum off time: ${Math.max(0, Math.ceil(R.minOffS - (t - offAt)))} s.`;
      }
      const soon = A.nextPurgeS > 0 ? ` (in about ${Math.ceil(A.nextPurgeS / 60)} min)` : '';
      return `CO₂ is ${ppm(v.CO2)} ppm. The next purge starts at ${R.fanOn} ppm${soon}.`;
    }
    // Lights (2.2): a daily window, only in the stages with light.
    function lights(r) {
      const m = cfg.manual.lights, q = st.req.lights, P = cfg.program.lights, crop = CROPS[cfg.crop];
      if (!m.auto) { q.on = !!m.on; st.why.lights = 'Manual control.'; return; }
      const stageOn = cfg.stage === 'spawn' ? !!(P.stages.spawn || crop.spawnLights) : !!P.stages[cfg.stage];
      let inWin = true;
      if (r.hour != null && Number.isFinite(r.hour)) {
        const mm = r.hour * 60;
        inWin = P.on <= P.off ? mm >= P.on && mm < P.off : mm >= P.on || mm < P.off;
      }
      q.on = stageOn && inWin;
      st.why.lights = !stageOn ? `${STAGES[cfg.stage]}: no light in this stage.`
        : q.on ? `Light ${hhmm(P.on)}–${hhmm(P.off)}${cfg.stage === 'spawn' ? ` (${crop.name} needs light in spawn run)` : ''}.` : `Off until ${hhmm(P.on)}.`;
    }
    // Circulation fan (2.10): mixes the low and the high air. Auto = on while the fogger runs, when the sensor
    // sets disagree, and 10 min of each 30 min.
    function circulation(v, t) {
      const m = cfg.manual.circ, q = st.req.circ;
      if (!m.auto) { q.on = !!m.on; st.why.circ = 'Manual control.'; return; }
      if (cfg.circ === 'on' || cfg.circ === 'off') { q.on = cfg.circ === 'on'; st.why.circ = q.on ? 'Always on.' : 'Off (setting).'; return; }
      const fog = st.req.hu.level > 0, cyc = t % 1800 < 600;
      q.on = fog || v.disagree || cyc;
      st.why.circ = fog ? 'On: spreads the fog.' : v.disagree ? 'On: the two sensor sets disagree.' : cyc ? 'On: 10 min of each 30 min.' : 'Off until the next cycle.';
    }
    // Sensor response check (2.7): when its machine switches, a working sensor must move. RH must move
    // >= 0.15 % in 15 min after the fogger switches on or off; CO2 must move >= 5 ppm in 10 min
    // after the air exchange starts. 2 failed checks in a row = the sensor "does not respond".
    function responseCheck(r, prevFog, prevOn) {
      const t = r.t, c = st.cmd;
      const watch = (k, trig, winS, minMove) => {
        const R = st.resp[k], x = r[k];
        if (trig && !R.win) R.win = { t0: t, min: Infinity, max: -Infinity };
        if (!R.win) return;
        if (x != null && Number.isFinite(x)) { R.win.min = Math.min(R.win.min, x); R.win.max = Math.max(R.win.max, x); }
        if (t - R.win.t0 >= winS) {
          const moved = R.win.max - R.win.min >= minMove;
          R.n = moved ? 0 : R.n + 1;
          if (moved && R.fault) { R.fault = false; say(t, 'good', `${SENSORS[k].name} sensor responds again`); }
          if (R.n >= 2) R.fault = true;
          R.win = null;
        }
      };
      // With the fans off between purges the fogger can hold one level for hours (no fog boost any more, C9), so a
      // purge start also opens the window, but only when the outdoor air's water differs from the room's by at least
      // RESP_PUSH_AH: when the two are nearly equal a healthy sensor barely moves. Measured over 2 days each (default
      // 2000 blocks, 6000 blocks, dry weather): every purge window under 0.15 % RH had a push of at most 0.34 g/m³;
      // a sensor frozen at midday sees pushes of 0.43-0.57 g/m³. Two still windows in a row are needed for a fault.
      const push = ahPush(st.v, st.f);
      watch('RH', c.hu.level !== prevFog || (!prevOn && c.air.on && push != null && Math.abs(push) >= RESP_PUSH_AH), RESP_WIN_RH, 0.15);
      watch('CO2', !prevOn && c.air.on, RESP_WIN_CO2, 5);
    }

    // ---------- 4. Machine protection ----------
    // Fogger: on/off changes wait for the minimum on or off time. Level changes while on are free.
    function protectFog(minOnMin, minOffMin, t) {
      const o = st.out.hu, c = st.cmd.hu, want = st.req.hu.level;
      const isOn = c.level > 0, wantOn = want > 0;
      st.hold.hu = '';
      if (isOn === wantOn) { c.level = want; return; }
      const manual = !cfg.manual.hu.auto;
      const min = (isOn ? minOnMin : minOffMin) * 60, age = o.since == null ? Infinity : t - o.since;
      if (manual || age >= min) {
        c.level = want; o.since = t;
        if (wantOn) st.stats.fogStarts++;
      } else {
        st.hold.hu = `${isOn ? 'Minimum run time' : 'Minimum off time'}: ${Math.ceil((min - age) / 60)} min to wait.`;
      }
    }
    // Air exchange: every run lasts AIR_MIN_ON_S, then stays off rules.minOffS. A manual change acts at once;
    // the CO2 safety level starts the fans at once, and its end (safetyExit) stops them at once.
    function protectAir(t, safetyExit) {
      const o = st.out.air, c = st.cmd.air, want = st.req.air.on;
      st.hold.air = '';
      if (c.on === want) return;
      const min = c.on ? AIR_MIN_ON_S : cfg.rules.minOffS, age = o.since == null ? Infinity : t - o.since;
      if (!cfg.manual.air.auto || age >= min || (c.on ? safetyExit : st.co2SafetyOn)) { c.on = want; o.since = t; }
      else st.hold.air = `${c.on ? 'Minimum run time' : 'Minimum off time'}: ${Math.ceil(min - age)} s to wait.`;
    }
    function protectAc(t) {
      const q = st.req.ac, c = st.cmd.ac, o = st.out.ac, P = cfg.protect;
      st.hold.ac = '';
      const changed = q.power !== c.power || q.mode !== c.mode || q.setpoint !== c.setpoint || q.fan !== c.fan;
      if (!changed) return;
      const manual = !cfg.manual.ac.auto, age = o.last == null ? Infinity : t - o.last;
      if (manual || age >= P.acMinCmd * 60) {
        c.power = q.power; c.mode = q.mode; c.setpoint = q.setpoint; c.fan = q.fan;
        o.last = t; st.stats.acCmds++;
      } else st.hold.ac = `Next AC command in ${Math.ceil((P.acMinCmd * 60 - age) / 60)} min (minimum time between commands).`;
    }

    // ---------- 5. Purge record ----------
    function hourBucket(h) {
      const H = st.purgeRec.hours;
      let b = H[H.length - 1];
      if (!b || b.h !== h) { b = { h, runS: 0, starts: 0, m3: 0, cappedN: 0, fogLS: 0, acHighS: 0, acLowS: 0 }; H.push(b); if (H.length > 168) H.shift(); }   // 7 days
      return b;
    }
    // Run time and air volume from t0 to t1 with the air exchange on, split at each full hour.
    function addRun(t0, t1) {
      const q = cfg.airM3h / 3600;
      for (let a = t0; a < t1;) {
        const h = Math.floor(a / 3600), b = Math.min(t1, (h + 1) * 3600), bk = hourBucket(h);
        bk.runS += b - a; bk.m3 += q * (b - a); a = b;
      }
      if (st.purgeRec.cur) st.purgeRec.cur.m3 += q * (t1 - t0);
    }
    function addAcFan(t0, t1, fan) {
      const key = fan === 'high' ? 'acHighS' : fan === 'low' ? 'acLowS' : null;
      if (!key) return;
      for (let a = t0; a < t1;) {
        const h = Math.floor(a / 3600), b = Math.min(t1, (h + 1) * 3600);
        hourBucket(h)[key] += b - a; a = b;
      }
    }
    function addFog(t0, t1, lv) {
      for (let a = t0; a < t1;) {
        const h = Math.floor(a / 3600), b = Math.min(t1, (h + 1) * 3600);
        hourBucket(h).fogLS += lv * (b - a); a = b;
      }
    }
    // Value of one record key for the hour now, from history before the fault:
    // the same hour of an earlier day (the need changes with the time of day). With less than one day
    // of history: the average of the full hours before the fault. null if less than 3 hours.
    function historyFor(key, t, before) {
      const H = st.purgeRec.hours;
      if (!H.length) return null;
      const firstH = H[0].h, faultH = Math.floor(before / 3600), curH = Math.floor(t / 3600);
      for (let h = curH - 24; h >= firstH; h -= 24) {
        if (h < faultH) { const b = H.find(x => x.h === h); return b ? b[key] : 0; }   // no record = no activity
      }
      const span = faultH - firstH;
      if (span < 3) return null;
      return H.filter(b => b.h < faultH).reduce((s, b) => s + b[key], 0) / span;
    }
    // One event per air run (C9 5.7): reason at the start, CO2 at the start and the end, air volume, capped.
    function recordPurges(prevOn, t, v) {
      const on = st.cmd.air.on, X = st.purgeRec;
      if (!prevOn && on) {
        X.cur = { start: t, end: null, reason: st.airReason, co2Start: v.CO2, co2End: null, m3: 0, capped: false };
        st.airRunCapped = false;
        hourBucket(Math.floor(t / 3600)).starts++;
      } else if (prevOn && !on && X.cur) {
        X.cur.end = t; X.cur.co2End = v.CO2; X.cur.capped = st.airRunCapped;
        X.events.push(X.cur); if (X.events.length > 200) X.events.shift();
        X.cur = null;
      }
    }

    // ---------- Event log ----------
    function log(t) {
      const c = st.cmd, A = st.air, X = st.purgeRec;
      const now = { power: c.ac.power, mode: c.ac.mode, airOn: c.air.on, airReason: st.airReason, fogOn: c.hu.level > 0, lights: c.lights.on,
        delayed: A.delayed, safety: st.co2SafetyOn, timed: A.timed };
      const p = st.prev || now;
      const man = d => (cfg.manual[d].auto ? '' : ' (manual)');
      if (now.power !== p.power) say(t, 'info', (now.power ? 'AC on' : 'AC off') + man('ac'));
      if (now.mode !== p.mode) say(t, 'info', `AC mode: ${now.mode}` + man('ac'));
      if (now.safety !== p.safety) say(t, now.safety ? 'critical' : 'good', now.safety ? 'CO₂ safety level: the air exchange runs, ignoring the time cap' : 'CO₂ below the safety level');
      if (now.delayed && !p.delayed) say(t, 'warning', 'Purge delayed: humidity first');
      else if (!now.delayed && p.delayed && st.rhRecovered) say(t, 'good', 'Purge allowed again: humidity recovered');
      if (now.timed && !p.timed) say(t, 'serious', 'CO₂ sensor fault: timed purge started');
      else if (!now.timed && p.timed && !st.f.CO2) say(t, 'good', 'CO₂ sensor back: timed purge ended');
      if (now.fogOn !== p.fogOn) say(t, 'info', (now.fogOn ? 'Fogger on' : 'Fogger off') + man('hu'));
      if (now.lights !== p.lights) say(t, 'info', now.lights ? 'Lights on' : 'Lights off');
      if (now.airOn && !p.airOn) say(t, 'info', `Air exchange on: ${now.airReason}`);
      else if (!now.airOn && p.airOn) {
        const e = X.events[X.events.length - 1];
        say(t, 'info', `Air exchange off (${mss(e && e.end === t ? e.end - e.start : 0)}, CO₂ ${ppm(st.v.CO2)} ppm)`);
      } else if (now.airOn && now.airReason && now.airReason !== p.airReason) say(t, 'info', `Air exchange: ${now.airReason}`);
      st.prev = now;
    }
    // Call once for each new sensor reading. The commands stay the same until the next reading.
    function update(r) {
      const dt = st.lastT == null ? 0 : Math.max(0, r.t - st.lastT);
      const prevOn = st.cmd.air.on, prevFog = st.cmd.hu.level, wasSafe = st.co2SafetyOn;
      const co2FallFree = prevOn || (st.out.air.since != null && st.out.air.since === st.lastT);   // before st.lastT moves
      if (prevOn && dt > 0) addRun(st.lastT, r.t);
      if (prevFog > 0 && dt > 0) addFog(st.lastT, r.t, prevFog);
      if (dt > 0 && st.cmd.ac.power) addAcFan(st.lastT, r.t, st.cmd.ac.fan);
      st.lastT = r.t;
      // Time since the last reading, with the commands that were active in that time.
      if (prevOn) st.stats.airOnS += dt;
      if (st.air.delayed) st.stats.delayedS += dt;

      program(r);
      const { v, f } = validate(r, co2FallFree);
      st.v = v; st.f = f;
      // Humidity target now (2.5). In VPD mode it moves with the temperature, so the evaporation from the caps stays.
      st.vpdT = es(cfg.spT) * (1 - cfg.spRH / 100);
      st.rhT = cfg.humMode === 'vpd' && !f.T ? clamp(100 * (1 - st.vpdT / es(v.T)), 50, 99) : cfg.spRH;
      st.vpd = !f.T && !f.RH ? es(v.T) * (1 - v.RH / 100) : null;
      alarms(v, f, r.t);
      airPlan(v, f, r.t, prevOn);
      airConditioner(v, f, dt);
      fogger(v, f, r.t);
      const reason = airExchange(v, f, r.t);
      lights(r);
      circulation(v, r.t);
      protectAir(r.t, wasSafe && !st.co2SafetyOn);
      st.airReason = st.cmd.air.on ? reason || st.airReason : null;    // C9 5.3: follows the run; null when off
      protectFog(cfg.protect.fogMinOn, cfg.protect.fogMinOff, r.t);
      protectAc(r.t);
      st.cmd.lights.on = st.req.lights.on;
      st.cmd.circ.on = st.req.circ.on;
      responseCheck(r, prevFog, prevOn);
      recordPurges(prevOn, r.t, v);
      log(r.t);
      return st.cmd;
    }
    // Status of one measured value, for the display.
    function status(kind) {
      const s = st.sensors[kind];
      if (s && s.fault) return { lvl: 'serious', icon: '!', text: 'Sensor fault' };
      const v = st.v;
      if (kind === 'T') {
        if (alarmOn('tCrop')) return { lvl: 'serious', icon: v.T > cfg.spT ? '▲' : '▼', text: 'Outside crop range' };
        if (alarmOn('tHi')) return { lvl: 'warning', icon: '▲', text: 'High alarm' };
        if (alarmOn('tLo')) return { lvl: 'warning', icon: '▼', text: 'Low alarm' };
        const e = v.T - cfg.spT;
        return Math.abs(e) <= BANDS.T ? { lvl: 'good', icon: '✓', text: 'In band' } : { lvl: 'info', icon: e > 0 ? '▲' : '▼', text: e > 0 ? 'Above band' : 'Below band' };
      }
      if (kind === 'RH') {
        if (alarmOn('rhHi')) return { lvl: 'warning', icon: '▲', text: 'High alarm' };
        if (alarmOn('rhLo')) return { lvl: st.alarms.rhLo.lvl, icon: '▼', text: 'Low alarm' };
        const e = v.RH - st.rhT;
        return Math.abs(e) <= BANDS.RH ? { lvl: 'good', icon: '✓', text: 'In band' } : { lvl: 'info', icon: e > 0 ? '▲' : '▼', text: e > 0 ? 'Above band' : 'Below band' };
      }
      if (alarmOn('co2Safe')) return { lvl: 'critical', icon: '◆', text: 'Safety level' };
      if (alarmOn('co2Hi')) return { lvl: 'warning', icon: '▲', text: 'Above limit' };
      if (st.airReason === 'safety') return { lvl: 'serious', icon: '◆', text: 'Safety run' };   // before the co2Safe alarm
      if (st.air.delayed) return { lvl: 'info', icon: '❚❚', text: 'Purge delayed (RH)' };
      if (st.air.state === 'purge') return { lvl: 'info', icon: '▲', text: 'Purging' };
      return { lvl: 'good', icon: '✓', text: 'Below limit' };
    }

    return { update, status, ack, alarmList, purges: () => st.purgeRec, setStage, setCrop, setFarmType, cancelRamp, programStatus, get state() { return st; }, snapshot: () => structuredClone(st), cfg };
  }

  // ---------- Settings file (3.1 and device configuration) ----------
  const SETTINGS_FORMAT = 'mushroom-climate-settings', SETTINGS_VERSION = 2;
  // Number limits ("a.b" = cfg.a.b). Numbers without a limit only need the right type.
  const SETTING_LIMITS = {
    spT: [10, 35], spRH: [40, 99], co2Lim: [400, 20000], roomM3: [1, 100000], airM3h: [50, 10000],
    'rules.co2SafetyAt': [500, 20000], 'rules.rhStop': [1, 20], 'rules.rhResume': [0, 19], 'rules.fanOn': [450, 20000],
    'rules.fanOff': [400, 20000], 'rules.purgeMaxS': [60, 900], 'rules.minOffS': [30, 600],
    'protect.fogMinOn': [0, 30], 'protect.fogMinOff': [0, 30],
    'protect.acMinCmd': [0, 30], 'protect.timedPurgeOn': [1, 60], 'protect.timedPurgeEvery': [5, 240], 'protect.faultFogLevel': [1, 3],
    'program.rampH': [0, 48], 'program.flushes': [1, 10], 'program.days.spawn': [1, 90], 'program.days.pinning': [1, 30],
    'program.days.fruiting': [1, 60], 'program.days.rest': [1, 60], 'program.harvest.dryMin': [0, 240],
    'program.harvest.pickMin': [0, 240], 'program.harvest.floorDrop': [1, 15], 'program.lights.on': [0, 1439], 'program.lights.off': [0, 1439],
    'offsets.T': [-5, 5], 'offsets.RH': [-15, 15], 'offsets.CO2': [-500, 500],
    'manual.ac.setpoint': [16, 30], 'manual.hu.level': [0, 3],
  };
  const SETTING_ENUMS = {
    farmType: Object.keys(FARM_TYPES), crop: Object.keys(CROPS), stage: Object.keys(STAGES), humMode: ['vpd', 'rh'],
    sensorMode: ['average', 'worst', 'main'], circ: ['auto', 'on', 'off'], 'manual.ac.mode': ['cool', 'heat', 'dry', 'fan'],
  };
  // Settings of the one fresh-air fan, removed by contract C9. An older file can still have them.
  const REMOVED_SETTINGS = ['rules.airMode', 'rules.baseFan', 'rules.fanLevel', 'rules.fogBoost', 'rules.rhAction', 'rules.acPurge',
    'rules.acAction', 'rules.acSetbackC', 'rules.acOff', 'rules.acOn', 'rules.maxSetback', 'rules.guard', 'protect.fanMinOn', 'protect.fanMinOff'];
  // Bring a settings object of version 1 to version 2 (C9 5.2). Pure: obj is not changed. Keys missing from the
  // new shape are not added here (importSettings fills the defaults). A version 2 object gives no warnings.
  function upgradeSettings(obj) {
    const warnings = [];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { settings: obj, warnings };
    const settings = structuredClone(obj);
    const gone = path => warnings.push(`Setting "${path}" was removed: fresh air now runs as short purges.`);
    for (const path of REMOVED_SETTINGS) {
      const [group, key] = path.split('.'), g = settings[group];
      if (g && typeof g === 'object' && Object.hasOwn(g, key)) { delete g[key]; gone(path); }
    }
    const m = settings.manual;
    if (m && typeof m === 'object' && Object.hasOwn(m, 'fan')) {
      const fan = m.fan;
      if (fan && typeof fan === 'object') m.air = { auto: !!fan.auto, on: (fan.level ?? 0) > 0 };
      delete m.fan;
      gone('manual.fan');
    }
    return { settings, warnings };
  }
  function exportSettings(cfg) {
    return { format: SETTINGS_FORMAT, version: SETTINGS_VERSION, saved: new Date().toISOString(), settings: structuredClone(cfg) };
  }
  // Read a settings file. Only known settings are taken; numbers are held inside their limits; selections must
  // be known names. Returns { settings, warnings }. The file is not trusted.
  function importSettings(input) {
    const file = typeof input === 'string' ? JSON.parse(input) : input;
    if (!file || file.format !== SETTINGS_FORMAT || typeof file.settings !== 'object') throw new Error('This is not a settings file of this controller.');
    const warnings = [];
    let src = file.settings;
    // An older file (version 1, or no version): drop the removed settings first, with a warning for each.
    if (!(file.version >= 2)) { const up = upgradeSettings(src); src = up.settings; warnings.push(...up.warnings); }
    if (file.version > SETTINGS_VERSION) warnings.push(`The file is version ${file.version}; this controller reads version ${SETTINGS_VERSION}. Newer settings are ignored.`);
    const out = defaultSettings();
    (function merge(dst, src, path) {
      for (const k of Object.keys(src)) {
        const key = path ? `${path}.${k}` : k, def = dst[k], val = src[k];
        if (!(k in dst)) { warnings.push(`Unknown setting "${key}" is ignored.`); continue; }
        if (Array.isArray(def)) {
          if (!Array.isArray(val) || !val.every(x => Number.isFinite(x))) { warnings.push(`"${key}" is not a list of numbers: default kept.`); continue; }
          dst[k] = val.map(x => clamp(Math.round(x), 0, 1439)).sort((a, b) => a - b);
        } else if (def && typeof def === 'object') {
          if (val && typeof val === 'object' && !Array.isArray(val)) merge(def, val, key); else warnings.push(`"${key}" has the wrong type: default kept.`);
        } else if (typeof def !== typeof val || (typeof val === 'number' && !Number.isFinite(val))) {
          warnings.push(`"${key}" has the wrong type: default kept.`);
        } else if (typeof val === 'number' && SETTING_LIMITS[key]) {
          const [lo, hi] = SETTING_LIMITS[key], v = clamp(val, lo, hi);
          if (v !== val) warnings.push(`"${key}" = ${val} is outside ${lo}–${hi}: set to ${v}.`);
          dst[k] = v;
        } else if (typeof val === 'string' && SETTING_ENUMS[key] && !SETTING_ENUMS[key].includes(val)) {
          warnings.push(`"${key}" = "${val}" is not known: default "${def}" kept.`);
        } else dst[k] = val;
      }
    })(out, src, '');
    // Settings that must agree with each other
    const R = out.rules;
    if (!FARM_TYPES[out.farmType].stages.includes(out.stage)) { warnings.push(`Stage "${out.stage}" is not used by this farm type: set to "${FARM_TYPES[out.farmType].stages[0]}".`); out.stage = FARM_TYPES[out.farmType].stages[0]; }
    if (R.fanOff > R.fanOn - 50) { warnings.push('Fan stop level must be at least 50 ppm below the start level: corrected.'); R.fanOff = R.fanOn - 50; }
    if (R.rhResume > R.rhStop - 1) { warnings.push('Humidity "until" must be closer to the target than "at": corrected.'); R.rhResume = R.rhStop - 1; }
    return { settings: out, warnings };
  }
  // Copy settings into an existing settings object (the page and the controller keep the same object).
  function applySettings(target, src) {
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') applySettings(target[k], v);
      else target[k] = Array.isArray(v) ? v.slice() : v;
    }
    return target;
  }

  global.ClimateController = { exportSettings, importSettings, upgradeSettings, applySettings, SETTINGS_VERSION, create, defaultSettings, defaultRules, defaultProtect, defaultProgram, applyProfile, profileTargets, hhmm, FARM_TYPES, CROPS, STAGES, BANDS, ALARMS, MACHINES, SENSORS };
})(typeof window !== 'undefined' ? window : globalThis);
