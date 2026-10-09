/*
 * equipment.js: EQUIPMENT CHECK (docs/contracts/equipment.md, C8)
 *
 *   checkEquipment(eq)             -> problems[] ([] = valid)
 *   geometry(volume, height)       -> { floor, walls, roof } m²
 *   shell(eq, volume)              -> { floor, walls, roof, ua, solarPeakW } | null
 *   plantOf(eq, room)              -> ClimateSim plant overrides for one room's machines
 *   estimate(room, mix, opts)      -> { needW, stage, perStage, hp }
 *   runCheckSteps(room, mix, opts) -> generator: one Progress per simulated day, returns the Report
 *   runCheck(room, mix, opts), runCheckAsync(room, mix, opts)
 *
 * At load it reads only ClimateSim. ClimateAir, ClimateController, ClimateCapacity and ClimateCycle are read when
 * estimate or a check runs (the server loads this file before capacity.js and cycle.js).
 */
(function (global) {
'use strict';

function deepFreeze(v) {
  if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) deepFreeze(v[k]);
    Object.freeze(v);
  }
  return v;
}

const AC_SIZES = deepFreeze([
  { hp: 1, w: 2640 }, { hp: 1.5, w: 3500 }, { hp: 2, w: 5280 }, { hp: 2.5, w: 6810 },
  { hp: 3, w: 7910 }, { hp: 4, w: 10550 }, { hp: 5, w: 13480 }, { hp: 6, w: 16120 },
]);

const CONSTRUCTIONS = deepFreeze({
  zinc:     { label: 'Zinc sheet, no insulation', u: 8.5,   roof: true },
  brick115: { label: 'Brick 115 mm, plastered',   u: 2.1,   roof: false },
  brick230: { label: 'Brick 230 mm',              u: 2.2,   roof: false },
  eps50:    { label: 'EPS panel 50 mm',           u: 0.715, roof: true },
  eps75:    { label: 'EPS panel 75 mm',           u: 0.475, roof: true },
  eps100:   { label: 'EPS panel 100 mm',          u: 0.305, roof: true },
  pu50:     { label: 'PU panel 50 mm',            u: 0.38,  roof: true },
  pu75:     { label: 'PU panel 75 mm',            u: 0.275, roof: true },
  pu100:    { label: 'PU panel 100 mm',           u: 0.2,   roof: true },
});

const FOGGER_SIZES = deepFreeze([3, 6, 14, 24]);
const AIR_SIZES = deepFreeze([600, 900, 1200, 1800, 2400, 3600]);
const DEFAULTS = deepFreeze({ ac_hp: 1.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, walls: null, roof: null, height: 3 });
const LIMITS = deepFreeze({ ac_units: [1, 4], fog_lph: [0.5, 50], air_m3h: [50, 10000], height: [2, 6] });
const SOL_AIR_K = 26;
const MARGIN = 1.2;
const SHARE = deepFreeze({ poor: 40, fair: 25, freshAir: 45 });
const RUNS = deepFreeze({ ac: 6, margin: 1, fogger: 1, air: 1 });
const MAX_RUNS = RUNS.ac + RUNS.margin + RUNS.fogger + RUNS.air;

const WALL_KEYS = Object.keys(CONSTRUCTIONS);
const ROOF_KEYS = WALL_KEYS.filter(k => CONSTRUCTIONS[k].roof);

function inRange(v, [lo, hi]) { return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi; }

// C8 4.3: problems in table order; [] = valid. Missing fields are allowed.
function checkEquipment(eq) {
  if (eq === null || typeof eq !== 'object' || Array.isArray(eq)) return ['equipment: must be an object'];
  const problems = [];
  const present = k => eq[k] !== undefined;
  for (const k of Object.keys(eq)) if (!Object.hasOwn(DEFAULTS, k)) problems.push(`${k}: unknown field`);
  if (present('ac_hp') && !AC_SIZES.some(s => s.hp === eq.ac_hp)) {
    problems.push(`ac_hp: must be one of ${AC_SIZES.map(s => s.hp).join(', ')}`);
  }
  if (present('ac_units') && !(Number.isInteger(eq.ac_units) && inRange(eq.ac_units, LIMITS.ac_units))) {
    problems.push('ac_units: must be a whole number from 1 to 4');
  }
  if (present('fog_lph') && !inRange(eq.fog_lph, LIMITS.fog_lph)) problems.push('fog_lph: must be a number from 0.5 to 50');
  if (present('air_m3h') && !inRange(eq.air_m3h, LIMITS.air_m3h)) problems.push('air_m3h: must be a number from 50 to 10000');
  if (present('height') && !inRange(eq.height, LIMITS.height)) problems.push('height: must be a number from 2 to 6');
  if (present('walls') && eq.walls !== null && !(typeof eq.walls === 'string' && WALL_KEYS.includes(eq.walls))) {
    problems.push(`walls: must be one of ${WALL_KEYS.join(', ')} or null`);
  }
  if (present('roof') && eq.roof !== null && !(typeof eq.roof === 'string' && ROOF_KEYS.includes(eq.roof))) {
    problems.push(`roof: must be one of ${ROOF_KEYS.join(', ')} or null`);
  }
  if (((eq.walls ?? null) === null) !== ((eq.roof ?? null) === null)) problems.push('walls and roof: set both or neither');
  return problems;
}

const SIM = global.ClimateSim;

// C8 4.4: the room shell. Plan 5 : 4; the floor slab is not counted.
function geometry(volume, height) {
  const floor = volume / height, L = Math.sqrt(floor * 5 / 4), W = Math.sqrt(floor * 4 / 5);
  return { floor, walls: 2 * (L + W) * height, roof: floor };
}

function shell(eq, volume) {
  if ((eq.walls ?? null) === null || (eq.roof ?? null) === null) return null;
  const g = geometry(volume, eq.height ?? DEFAULTS.height), uw = CONSTRUCTIONS[eq.walls].u, ur = CONSTRUCTIONS[eq.roof].u;
  return { ...g, ua: uw * g.walls + ur * g.roof, solarPeakW: ur * g.roof * SOL_AIR_K };
}

// C8 4.5: the machines in simulation units. The air exchange size is not a plant key (room.airM3h carries it).
function plantOf(eqIn, room) {
  const eq = { ...DEFAULTS, ...eqIn };
  const P = SIM.PLANT, A = P.ac;
  const capW = AC_SIZES.find(s => s.hp === eq.ac_hp).w * eq.ac_units, f = capW / A.capW, g = eq.fog_lph / 3;
  const plant = {
    ac: { capW, coilM3s: A.coilM3s * f, auxW: A.auxW * f, standbyW: A.standbyW * eq.ac_units },
    fogger: { levels: P.fogger.levels.map(l => ({ ...l, gph: l.gph * g, w: l.w * g })) },
  };
  const sh = room.calib ? null : shell(eq, room.volume || P.room.volume);
  if (sh) { plant.room = { ua: sh.ua }; plant.loads = { solarPeakW: sh.solarPeakW }; }
  return plant;
}

// ---------- shared by estimate and the check ----------
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const idx = hp => AC_SIZES.findIndex(s => s.hp === hp);

// C8 6 step 1: the settings through importSettings(exportSettings()), days and flushes rounded as C7 4.2 step 3.
function settingsOf(opts) {
  const CC = global.ClimateController;
  const cfg = opts.settings !== undefined ? CC.importSettings(CC.exportSettings(opts.settings)).settings : CC.defaultSettings();
  for (const k of ['spawn', 'pinning', 'fruiting', 'rest']) cfg.program.days[k] = Math.max(1, Math.round(cfg.program.days[k]));
  cfg.program.flushes = Math.max(1, Math.round(cfg.program.flushes));
  return cfg;
}
const blocksOf = mix => Math.max(1, Math.round(mix.filter(m => Number.isFinite(m.blocks) && m.blocks > 0).reduce((s, m) => s + m.blocks, 0)));

// Targets and CO2 purge levels of one stage (C8 6 step 2 and 3; fruiting takes the common targets and the default rules).
function stageTargets(tg, st) {
  const CC = global.ClimateController;
  if (st === 'fruiting') {
    const r = CC.defaultRules(tg.co2Lim);
    return { spT: tg.spT, spRH: tg.spRH, co2Lim: tg.co2Lim, start: r.fanOn, stop: r.fanOff };
  }
  const t = CC.profileTargets(tg.crop, st);
  return { spT: t.spT, spRH: t.spRH, co2Lim: t.co2Lim, start: t['rules.fanOn'], stop: t['rules.fanOff'] };
}

// C8 6: quick heat balance. Fresh air is the average outdoor air of the purges (C9), at least the wall leakage.
function estimate(room, mix, opts = {}) {
  const CC = global.ClimateController, CAP = global.ClimateCapacity;
  const eq = { ...DEFAULTS, ...(room.equipment || {}) }, region = opts.region || 'my-lowland';
  const cfg = settingsOf(opts), tg = CAP.commonTargets(mix), plant = plantOf(eq, room);
  const P = SIM.plantOf(plant), R = CAP.roomOf({ ...room, plant });
  const n = blocksOf(mix), c = CAP.mixCo2(room, mix);
  const perStage = {};
  for (const st of CC.FARM_TYPES[cfg.farmType].stages) {
    const t = stageTargets(tg, st), fac = P.blockStage[st];
    const dC = (t.start + t.stop) / 2 - R.co2Out;
    const q = Math.max(R.infAch * R.volume, n * c * fac / dC) / 3600;                 // m³/s
    const ahT = t.spRH / 100 * SIM.ahSat(t.spT);
    const blockW = n * c * fac / 60000 * P.resp.wPerLpm;
    const blockG = n * c * fac / 60000 * P.resp.gpsPerLpm + (st === 'fruiting' ? n * P.transpGph / 3600 : 0);
    const L = cfg.program.lights, lit = h => !!L.stages[st] && h * 60 >= L.on && h * 60 < L.off;
    // The pass rule allows 5 % of a day out of band: the second-largest hourly need of each design day.
    perStage[st] = Math.max(...CAP.DESIGN_DAYS[region].days.map(d => d.T.map((T, h) => {
      const ah = d.RH[h] / 100 * SIM.ahSat(T), sun = h > 7 && h < 19 ? Math.sin(Math.PI * (h - 7) / 12) : 0;
      const S = (R.ua + 1206 * q) * (T - t.spT) + sun * P.loads.solarPeakW + P.loads.baseW + (lit(h) ? P.loads.lightsW : 0) + blockW;
      return S + 2450 * Math.max(0, q * (ah - ahT) + blockG);
    }).sort((a, b) => b - a)[1]));
  }
  let stage = null;
  for (const st of Object.keys(perStage)) if (stage === null || perStage[st] > perStage[stage]) stage = st;
  const needW = perStage[stage];
  const i = AC_SIZES.findIndex(s => s.w * eq.ac_units >= needW);
  return { needW, stage, perStage, hp: AC_SIZES[i < 0 ? AC_SIZES.length - 1 : i].hp };
}

// ---------- the check ----------
const AC_FAILS = ['temperature too high', 'block core too hot'];
const DRY_FAILS = ['humidity too low', 'humidity at the low alarm'];
const CO2_FAIL = 'CO₂ above the limit';

const acText = (hp, units) => (units === 1 ? `${hp} hp` : `${units} × ${hp} hp`);
const lc1 = t => t.charAt(0).toLowerCase() + t.slice(1);
const rnd = x => String(Math.round(x));
const int = x => rnd(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const min1 = s => String(Math.round(s / 6) / 10);
const share = x => String(Math.floor(x));
// Whole percent, but never a rounded 95 for a value under the pass line (one decimal, rounded down, then).
const pct = x => (x < global.ClimateCapacity.PASS.inT && Math.round(x) >= global.ClimateCapacity.PASS.inT ? (Math.floor(x * 10) / 10).toFixed(1) : rnd(x));
const joinList = list => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

// One C7 Result as the Run row of C8 11.3 (the internals dryStages, co2Stages, wetStages, heat are dropped from the Report).
function summarise(kind, eq, res, n, cropKey) {
  const CC = global.ClimateController, CAP = global.ClimateCapacity;
  const judged = res.stages.filter(s => s.stage !== 'spawn');
  const fr = res.stages.filter(s => s.stage === 'fruiting'), hours = fr.reduce((s, x) => s + x.hours, 0);
  const heat = {};
  for (const s of fr) for (const [k, v] of Object.entries(s.heat)) heat[k] = (heat[k] || 0) + v;
  let fogWh = 0;
  for (const h of res.series) if (h.stage !== 'spawn' && h.heat.fog > fogWh) fogWh = h.heat.fog;
  const worst = res.stages.reduce((a, b) => (b.inT < a.inT ? b : a));
  const failing = res.stages.filter(s => s.fails.some(f => AC_FAILS.includes(f)));
  const aw = failing.length ? failing.reduce((a, b) => (b.inT < a.inT ? b : a)) : null;
  const segs = list => res.stages.filter(s => s.fails.some(f => list.includes(f)));
  const wetLine = st => (CC.CROPS[cropKey].wetRH && CC.CROPS[cropKey].wetRH[st]) ?? CAP.PASS.wetRH;
  return {
    kind, ac_hp: eq.ac_hp, ac_units: eq.ac_units, fog_lph: eq.fog_lph, air_m3h: eq.air_m3h,
    acPass: failing.length === 0,
    dryPass: !judged.some(s => s.fails.some(f => DRY_FAILS.includes(f))),
    co2Pass: !judged.some(s => s.fails.includes(CO2_FAIL)),
    tooLow: res.stages.some(s => s.fails.includes('temperature too low')),
    tooBig: false,
    pass: res.totals.pass,
    fruitingInT: fr.reduce((s, x) => s + x.inT * x.hours, 0) / hours,
    worst: { stage: worst.stage, flush: worst.flush, inT: worst.inT },
    acFail: aw && { stage: aw.stage, flush: aw.flush, inT: aw.inT, spT: aw.targets.spT, why: aw.fails.includes('temperature too high') ? 'temperature too high' : 'block core too hot' },
    kwh: res.totals.kwh, kwhPerBlock: res.totals.kwh / n, rmPerBlock: res.totals.rmPerBlock,
    fogPeakLph: fogWh * 3600 / 2450 / 1000,
    fails: res.stages.filter(s => !s.pass).map(s => ({ stage: s.stage, flush: s.flush, fails: s.fails })),
    hours,
    dryStages: segs(DRY_FAILS).filter(s => s.stage !== 'spawn').map(s => ({ stage: s.stage, flush: s.flush })),
    co2Stages: segs([CO2_FAIL]).filter(s => s.stage !== 'spawn').map(s => ({ stage: s.stage, flush: s.flush })),
    wetStages: judged.filter(s => s.fails.includes('humidity near saturation')).map(s => ({ stage: s.stage, flush: s.flush, wet: s.wet, limit: wetLine(s.stage) })),
    heat,
  };
}

function* runCheckSteps(room, mix, opts = {}) {
  const CC = global.ClimateController, CAP = global.ClimateCapacity, CY = global.ClimateCycle, AIR = global.ClimateAir;
  // ---- C8 3: input checks, in order ----
  if (!isObj(room)) throw new TypeError('runCheck: room must be an object');
  if (!Array.isArray(mix)) throw new TypeError('runCheck: mix must be a list');
  if (room.equipment != null) {
    const problems = checkEquipment(room.equipment);
    if (problems.length) throw new TypeError(`runCheck: ${problems[0]}`);
  }
  if (opts.settings !== undefined && !isObj(opts.settings)) throw new TypeError('runCheck: settings must be an object');
  if (opts.tariff !== undefined && !(typeof opts.tariff === 'number' && Number.isFinite(opts.tariff) && opts.tariff >= 0)) {
    throw new TypeError('runCheck: tariff must be a number of at least 0');
  }
  const region = opts.region || 'my-lowland';
  if (!Object.hasOwn(CAP.DESIGN_DAYS, region)) throw new Error(`Unknown region: ${region}`);
  const cfg = settingsOf(opts);
  const tg = CAP.commonTargets(mix);
  if (tg.impossible) return { verdict: 'impossible', why: tg.conflict };

  // ---- C8 7.1 setup ----
  const eq = { ...DEFAULTS, ...(room.equipment || {}) }, U = eq.ac_units;
  const n = blocksOf(mix), cropName = CC.CROPS[tg.crop].name, crop = lc1(cropName);
  const est = estimate({ ...room, equipment: eq }, mix, opts);
  const runner = opts.runCycleSteps || CY.runCycleSteps;
  const acRuns = new Map(), extra = [];
  let runNo = 0;

  // ---- C8 7.2 one run ----
  function* run(kind, e2) {
    runNo++;
    const g = runner({ ...room, airM3h: e2.air_m3h, plant: plantOf(e2, room) }, mix, { settings: opts.settings, region: opts.region, tariff: opts.tariff, heat: true });
    let s = g.next();
    while (!s.done) {
      yield { run: runNo, maxRuns: MAX_RUNS, kind, ac_hp: e2.ac_hp, ac_units: e2.ac_units, fog_lph: e2.fog_lph, air_m3h: e2.air_m3h, day: s.value.day, days: s.value.days };
      s = g.next();
    }
    if (s.value.verdict !== 'ok') throw new Error(`runCheck: the cycle did not run (${s.value.why})`);
    return summarise(kind, e2, s.value, n, tg.crop);
  }
  function* acRun(i) {
    if (!acRuns.has(i)) acRuns.set(i, yield* run('ac', { ...eq, ac_hp: AC_SIZES[i].hp }));
    return acRuns.get(i);
  }

  // ---- C8 7.3 aircond search ----
  const last = AC_SIZES.length - 1, own = idx(eq.ac_hp);
  yield* acRun(own);
  let k = idx(est.hp), min = null;
  if ((yield* acRun(k)).acPass) {
    while (k > 0 && (acRuns.has(k - 1) || acRuns.size < RUNS.ac) && (yield* acRun(k - 1)).acPass) k--;
    min = k;
  } else {
    while (k < last && (acRuns.has(k + 1) || acRuns.size < RUNS.ac)) {
      if ((yield* acRun(k + 1)).acPass) { min = k + 1; break; }
      k++;
    }
  }
  if (acRuns.get(own).acPass && (min === null || own < min)) min = own;          // 4b

  // ---- C8 7.4 margin rule ----
  let rec = min;
  const thin = min !== null && AC_SIZES[min].w * U < MARGIN * est.needW;
  if (thin && min < last) {
    const m1 = yield* acRun(min + 1);
    if (m1.acPass && !m1.tooLow) rec = min + 1;
  }
  const noReserve = thin && rec === min ? (min === last ? 'largest' : 'too-big') : null;
  // 6: a size above the minimum that fails or cools the room below the band is too big (the margin run included)
  if (min !== null) for (const [i, r] of acRuns) r.tooBig = i > min && (!r.acPass || r.tooLow);

  // ---- C8 7.5 reference run ----
  let best = null;
  if (rec === null) for (const [i, r] of [...acRuns].sort((a, b) => a[0] - b[0])) if (best === null || r.fruitingInT > acRuns.get(best).fruitingInT) best = i;
  const refIdx = rec ?? best, ref = acRuns.get(refIdx), refEq = { ...eq, ac_hp: AC_SIZES[refIdx].hp };
  const o = acRuns.get(own);

  // ---- C8 8.2 aircond ----
  const ac = { own: eq.ac_hp, units: U, min: min === null ? null : AC_SIZES[min].hp, recommended: rec === null ? null : AC_SIZES[rec].hp, noReserve };
  const A = i => acText(AC_SIZES[i].hp, U), oT = acText(eq.ac_hp, U);
  const stName = x => CC.STAGES[x.stage].toLowerCase();
  const fail = o.acFail === null ? ''
    : o.acFail.why === 'temperature too high' ? ` In ${stName(o.acFail)} ${o.acFail.flush} it keeps the room within 1 °C of ${o.acFail.spT} °C only ${pct(o.acFail.inT)} % of the time.`
      : ' In the spawn run the block core gets too hot.';
  const noReserveText = noReserve === 'largest' ? ' It has no reserve for the hottest days: fix the room first (see the heat breakdown).'
    : noReserve === 'too-big' ? ` It is just enough: it has no reserve for the hottest days, but no bigger size holds this room steadier (${A(min + 1)} is too big).` : '';
  if (min === null) {
    ac.verdict = 'too-small';
    ac.text = `Your ${oT} aircond is too small for ${crop}.${fail} No aircond in the list holds the temperature in this room for the whole cycle`
      + (refIdx !== own ? `: the best, ${A(refIdx)}, keeps it ${pct(ref.fruitingInT)} % of fruiting hours.` : `; none does better than yours (${pct(o.fruitingInT)} % of fruiting hours).`)
      + ' Fix the room first (see the heat breakdown).';
  } else if (own < min) {
    ac.verdict = 'too-small';
    ac.text = `Your ${oT} aircond is too small for ${crop}.${fail} You need at least ${A(min)}.` + (rec !== min ? ` Buy ${A(rec)} for a margin on the hottest days.` : noReserveText);
  } else if (own > min && (!o.acPass || o.tooLow)) {
    ac.verdict = 'too-big';
    ac.text = `Your ${oT} aircond is too big for this room: it switches on and off and the room drifts out of the band (${CC.STAGES[o.worst.stage].toLowerCase()} ${o.worst.flush}: ${pct(o.worst.inT)} % in band, the pass line is ${CAP.PASS.inT} %). ${A(rec)} holds it.`;
  } else if (own >= rec + 2) {
    ac.verdict = 'oversized';
    ac.text = `Your ${oT} aircond is bigger than this room needs: ${A(rec)} is enough. It works, but a too-big aircond switches on and off more often and takes less water out of the air.`;
  } else {
    ac.verdict = 'enough';
    ac.text = `Your ${oT} aircond is enough for ${crop}: it keeps the room within 1 °C of ${tg.spT} °C ${pct(o.fruitingInT)} % of fruiting hours.`
      + (own === min && rec > min ? ` It is just enough: on the hottest days it has no reserve. ${A(rec)} gives a margin.` : own === min ? noReserveText : '');
  }
  const stageList = list => joinList([...new Set(list.map(stName))]);

  // ---- C8 7.6, 8.3 fogger ----
  const fogger = { own: eq.fog_lph, recommended: null, peak: ref.fogPeakLph };
  if (!ref.dryPass) {
    const L = FOGGER_SIZES.find(x => x > eq.fog_lph);
    const r = L !== undefined ? yield* run('fogger', { ...refEq, fog_lph: L }) : null;
    if (r) extra.push(r);
    if (r && r.dryPass && r.acPass && !r.tooLow) {
      fogger.verdict = 'too-small'; fogger.recommended = L;
      fogger.text = `Your ${eq.fog_lph} L/h fogger is too small: the air gets too dry in ${stageList(ref.dryStages)}. A ${L} L/h fogger keeps the humidity up.`;
    } else {
      fogger.verdict = 'not-the-fix'; fogger.tried = L ?? null;
      fogger.text = `The air gets too dry in ${stageList(ref.dryStages)}` + (r ? `, and a ${L} L/h fogger does not fix it` : '')
        + ': the aircond runs so hard that it dries the air. Fix the heat first (see the heat breakdown).';
    }
  } else {
    const smaller = FOGGER_SIZES.filter(x => x < eq.fog_lph && x >= 1.5 * ref.fogPeakLph);
    if (smaller.length) {
      fogger.verdict = 'oversized'; fogger.recommended = smaller[0];
      fogger.text = `Your ${eq.fog_lph} L/h fogger is bigger than needed: it never used more than ${ref.fogPeakLph.toFixed(1)} L/h in an hour. It works; a ${smaller[0]} L/h fogger would do.`;
    } else {
      fogger.verdict = 'enough'; fogger.text = `Your ${eq.fog_lph} L/h fogger is enough.`;
    }
  }

  // ---- C8 8.4 air exchange ----
  const c = CAP.mixCo2(room, mix), plant0 = plantOf(eq, room), R = CAP.roomOf({ ...room, plant: plant0 }), P0 = SIM.plantOf(plant0);
  const capS = cfg.rules.purgeMaxS, V = R.volume;
  let need = null, needStage = null, needT = null;
  for (const st of CC.FARM_TYPES[cfg.farmType].stages.filter(x => x !== 'spawn')) {
    const t = stageTargets(tg, st), prodM3h = n * c * P0.blockStage[st] / 1e6;
    const sz = AIR.sizeFor({ volume: V, co2Out: R.co2Out, leakM3h: 0, prodM3h, start: t.start, stop: t.stop, capS, sizes: AIR_SIZES });
    if (need === null || sz.needM3h > need.needM3h) { need = sz; needStage = st; needT = { ...t, prodM3h }; }
  }
  const purgeS = AIR.purgeTimeS({ volume: V, co2Out: R.co2Out, leakM3h: 0, prodM3h: needT.prodM3h, m3h: eq.air_m3h, start: needT.start, stop: needT.stop });
  const air = { own: eq.air_m3h, needM3h: need.needM3h, recommended: null, margin: need.margin, stage: needStage, purgeS, capS };
  const airN = int(eq.air_m3h), stageName = CC.STAGES[needStage].toLowerCase();
  let airRun = null, airTried = null;
  if (!ref.co2Pass) {
    airTried = need.size !== null && need.size > eq.air_m3h ? need.size : (AIR_SIZES.find(x => x > eq.air_m3h) ?? null);
    if (airTried !== null) { airRun = yield* run('air', { ...refEq, air_m3h: airTried }); extra.push(airRun); }
  }
  const gives = need.size !== null && need.size > need.needM3h ? `; ${int(need.size)} m³/h gives a margin.`
    : need.size !== null && need.size === need.needM3h && need.margin !== null ? `; ${int(need.margin)} m³/h gives a margin.` : '.';
  const ownIdx = AIR_SIZES.reduce((a, x, i) => (x <= eq.air_m3h ? i : a), -1);
  if (need.needM3h === Infinity) {
    air.verdict = 'too-small';
    air.text = `Your ${airN} m³/h air exchange cannot bring CO₂ down to ${needT.stop} ppm in ${stageName}: outside air alone cannot bring CO₂ this low. Raise the stop level.`;
  } else if (need.needM3h > eq.air_m3h) {
    air.verdict = 'too-small'; air.recommended = need.size;
    air.text = `Your ${airN} m³/h air exchange is too small for ${int(n)} blocks in ${stageName}: `
      + (Number.isFinite(purgeS) ? `a purge takes ${min1(purgeS)} min, the limit is ${min1(capS)} min.` : `a purge never brings CO₂ down to ${needT.stop} ppm.`)
      + ` Buy at least ${int(need.needM3h)} m³/h${gives}`;
  } else if (airRun && airRun.co2Pass) {
    air.verdict = 'too-small'; air.recommended = airTried; air.tried = airTried;
    air.text = `Your ${airN} m³/h air exchange is too small: CO₂ goes above the limit in ${stageList(ref.co2Stages)}. A ${int(airTried)} m³/h air exchange keeps it below.`;
  } else if (!ref.co2Pass) {
    air.verdict = 'not-the-fix'; air.tried = airTried;
    air.text = `CO₂ goes above the limit in ${stageList(ref.co2Stages)}` + (airRun ? `, and a ${int(airTried)} m³/h air exchange does not fix it.` : '.');
  } else if (need.size !== null && ownIdx >= AIR_SIZES.indexOf(need.size) + 3) {
    air.verdict = 'oversized'; air.recommended = need.size;
    air.text = `Your ${airN} m³/h air exchange is bigger than this room needs: ${int(need.size)} m³/h is enough. Each purge brings in a lot of hot, wet outside air at once.`;
  } else {
    air.verdict = 'enough';
    air.text = `Your ${airN} m³/h air exchange is enough: a purge takes at most ${min1(purgeS)} min (${stageName}), the limit is ${min1(capS)} min.`;
  }

  // ---- C8 9 heat breakdown ----
  const H = ref.heat, items = [
    { key: 'walls', label: 'Walls and roof (sun included)', kwh: (H.walls + H.sun) / 1000 },
    { key: 'airHeat', label: 'Fresh air: heat', kwh: H.airSens / 1000 },
    { key: 'airWater', label: 'Fresh air: water', kwh: H.airLat / 1000 },
    { key: 'blocks', label: 'Blocks', kwh: (H.blockSens + H.blockLat) / 1000 },
    { key: 'machines', label: 'Machines and lights', kwh: (H.base + H.lights) / 1000 },
  ];
  const total = items.reduce((t, x) => t + Math.max(0, x.kwh), 0);
  for (const x of items) x.share = total > 0 ? Math.max(0, x.kwh) / total * 100 : 0;
  const wallShare = items[0].share, airShare = items[1].share + items[2].share;
  const advice = wallShare >= SHARE.poor ? 'insulate' : airShare >= SHARE.freshAir ? 'fresh-air' : 'bigger-ac';
  const breakdown = {
    ac_hp: refEq.ac_hp, hours: ref.hours, items, advice,
    text: advice === 'insulate' ? `Most of the heat comes through the walls and roof (${share(wallShare)} %). Insulate before you buy a bigger aircond.`
      : advice === 'fresh-air' ? `Most of the heat comes in with the fresh air (${share(airShare)} %: ${share(items[1].share)} % heat, ${share(items[2].share)} % water). Bring in only the fresh air the blocks need, and recover its coolness with an energy-recovery unit that also exchanges moisture before you buy a bigger aircond.`
        : 'The heat comes mostly from the blocks and the room itself, not from the walls or the fresh air: a bigger aircond is the right fix.',
  };

  // ---- C8 8.6 too wet ----
  const wet = ref.wetStages.length ? {
    stages: ref.wetStages,
    text: `The room is too wet in ${joinList(ref.wetStages.map(w => `${stName(w)} ${w.flush} (above ${w.limit} % RH ${pct(w.wet)} % of the time)`))}. A bigger aircond does not fix this: the outside air brings in more water than the aircond can take out without making the room too cold. Dry the fresh air before it comes in: an energy-recovery unit with a moisture-exchanging core (enthalpy wheel or hygroscopic core), a fresh-air dehumidifier, or add a dehumidifier in the room.`,
  } : null;

  // ---- C8 8.5 walls and roof ----
  const uaSource = room.calib ? 'calibration' : (eq.walls ?? null) !== null ? 'construction' : 'typical';
  const insulation = { verdict: wallShare >= SHARE.poor ? 'poor' : wallShare >= SHARE.fair ? 'fair' : 'good', share: wallShare, uaSource, insulatedHp: null };
  if (insulation.verdict !== 'good') insulation.insulatedHp = estimate({ ...room, calib: null, equipment: { ...eq, walls: 'pu75', roof: 'pu75' } }, mix, opts).hp;
  insulation.text = `Walls and roof: ${insulation.verdict}. They bring in ${share(wallShare)} % of the heat.`
    + (insulation.insulatedHp !== null ? ` With PU panel 75 mm walls and roof the room would need about ${acText(insulation.insulatedHp, U)} (quick estimate).` : '')
    + (wet ? ' An insulated room also needs drier fresh air.' : '')
    + (uaSource === 'typical' ? ' (Typical walls: set the walls and roof of this room for a better answer.)' : '');

  // ---- C8 8.8 summary ----
  const summary = [ac.text, ...(wet ? [wet.text] : []), fogger.text, air.text, insulation.text,
    ...(ac.verdict === 'too-small' || wet || noReserve === 'largest' ? [breakdown.text] : [])];

  const strip = ({ heat, dryStages, co2Stages, wetStages, ...r }) => r;
  return {
    verdict: 'ok', crop: cropName, targets: tg,
    inputs: {
      equipment: eq, uaSource, ua: R.ua, solarPeakW: P0.loads.solarPeakW, blocks: n, farmType: cfg.farmType, region, tariff: opts.tariff ?? 0.57,
    },
    estimate: est,
    runs: [...[...acRuns].sort((a, b) => a[0] - b[0]).map(([, r]) => r), ...extra].map(strip),
    ac, fogger, air, insulation, wet, breakdown, pass: ref.pass, summary,
  };
}

function runCheck(room, mix, opts = {}) {
  const g = runCheckSteps(room, mix, opts);
  for (;;) {
    const s = g.next();
    if (s.done) return s.value;
    if (opts.onProgress) opts.onProgress(s.value);
  }
}

async function runCheckAsync(room, mix, opts = {}) {
  const g = runCheckSteps(room, mix, opts);
  for (;;) {
    const s = g.next();
    if (s.done) return s.value;
    if (opts.onProgress) opts.onProgress(s.value);
    await new Promise(r => setTimeout(r, 0));
  }
}

global.ClimateEquipment = {
  AC_SIZES, CONSTRUCTIONS, FOGGER_SIZES, AIR_SIZES, DEFAULTS, LIMITS, SOL_AIR_K, MARGIN, SHARE, RUNS, MAX_RUNS,
  checkEquipment, geometry, shell, plantOf, estimate, runCheckSteps, runCheck, runCheckAsync,
};
})(typeof window !== 'undefined' ? window : globalThis);
