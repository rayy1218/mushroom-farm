// Suggest machines (spec 2026-10-22-suggest-machines-design.md 3 and 4): starting estimates from formulas, the candidates
// around them, and the ranking of what the simulation says about each. Every setup is tried twice: held in band over the
// days of two stages, and cooled down from outdoor air (2026-10-28, after three containers that started at 32 °C: the setups
// suggested to hold them could not pull them down). Pure: no clock, no I/O.

import { satW, wOf, outdoorAt } from '../device/sim-model.js';
import { BTU_PER_KW } from '../device/sim-store.js';
import { CO2_PER_BLOCK, blocksOf, mixBands } from '../web/crops.js';
import { DEFAULTS } from './controller.js';
import { PROGRAM_DEFAULTS, nextStage } from './program.js';

export const TARGET_DEFAULT = 95;
export const COOL_DOWN_MAX_H = 3; // the longest cool-down a setup may take (the request's coolDownMaxH)
// The cool-down starts in the heat of the day: the sun just past its peak, the outdoor air near its 15:00 high.
export const COOL_START_HOUR = 14;
const COOL_DAYS = 1;
const MAX_DAYS = 30;
const OUTDOOR_CO2 = 420; // ppm
const CO2_MARGIN = 100; // ppm under the upper limit the fan is sized to hold
const FAN_SIZES = [100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 3000];
const HUMIDIFIER_SIZES = [0.3, 0.5, 1, 1.5, 2, 3, 4, 6];
const DEHUMIDIFIER_SIZES = [10, 12, 16, 20, 25, 30, 40, 50, 60];
const AC_SIZES = [9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000];
const LIMIT_MAX_MIN = 60; // the longer air exchange time limit tried
const CO2_J_PER_ML = 19.06; // the heat the blocks give off per mL of CO₂
const AIR_KJ_PER_M3K = 1.2;
const FANS_W = 120; // the room's own fans
const AC_MARGIN = 1.3;
const DEHUM_COIL = 5; // °C, the model's coil dew point
const DEHUM_MAX_SHARE = 1.2;
const DEHUM_RUN_S = 180; // its minimum run
const DEHUM_RH_SHARE = 0.8; // of the narrowest band a minimum run may move RH
// The model's heat capacities (device/sim-model.js): racks, floor and walls per m³ of room, a block.
const MASS_KJ_PER_M3K = 10;
const BLOCK_KJ_PER_K = 4;
const COIL_ADP = 11; // °C, the model's aircon coil (its auto fan)
const LATENT_KJ_PER_G = 2.45;

const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;
const nextUp = (sizes, v) => sizes.find((s) => s >= v) ?? sizes.at(-1);
const grouped = (v) => Math.round(v).toLocaleString('en-US');
const nearest = (sizes, v) => sizes.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

// The stages searched: the start stage and the one after it. → [stage, …] (one when nothing follows).
// The flushes are the room's, as simulate() runs them: one flush that starts at rest has nothing after it.
function stagesOf(input, ctx) {
  const flushes = Math.max(1, ctx.program?.flushes ?? PROGRAM_DEFAULTS.flushes);
  const next = nextStage({ stage: input.stage, flush: 1, flushes, done: false });
  return next ? [input.stage, next.stage] : [input.stage];
}

// The days both stages last (the program's), at most 30.
export function sizingDays(input, ctx) {
  const days = { ...PROGRAM_DEFAULTS.days, ...ctx.program?.days };
  return Math.min(MAX_DAYS, stagesOf(input, ctx).reduce((sum, s) => sum + days[s], 0));
}

// → { fanFlow, humidifierLH, dehumidifierMaxLday, acBTU, acCoolBTU, humidifierCoolLH, exchangeMaxMin,
// why: { fanFlow, humidifierLH, dehumidifierLday, acBTU, coolDown, exchangeMaxMin } }. acBTU: the larger of the aircons for the
// day high and for the cool-down (acCoolBTU); humidifierCoolLH: the one that makes up the water that aircon takes out.
export function estimate(input, ctx) {
  const { physics, crops } = input;
  const { volume } = ctx;
  const blocks = blocksOf(crops);
  const bands = stagesOf(input, ctx).map((s) => mixBands(crops, s).bands);
  const co2High = Math.min(...bands.map((b) => b.co2High));
  const rhBand = Math.min(...bands.map((b) => b.rhHigh - b.rhLow));
  const tMid = Math.min(...bands.map((b) => (b.tLow + b.tHigh) / 2));

  // Fan: the flow that holds CO₂ 100 ppm under the limit with the fan on all the time.
  const co2LH = (blocks * CO2_PER_BLOCK) / 1000; // L of CO₂ an hour
  const fanNeed = (blocks * CO2_PER_BLOCK) / Math.max(50, co2High - CO2_MARGIN - OUTDOOR_CO2);
  const fanFlow = nextUp(FAN_SIZES, fanNeed);
  const holds = Math.round(OUTDOOR_CO2 + (blocks * CO2_PER_BLOCK) / fanFlow);

  // Humidifier: one minute of it moves RH a quarter of the narrowest band.
  const humidifierNeed = ((rhBand / 4) * volume * satW(tMid) * 60) / 100_000;
  const humidifierLH = Math.max(HUMIDIFIER_SIZES[0], nearest(HUMIDIFIER_SIZES, humidifierNeed));

  // Dehumidifier: its 3 min minimum run moves RH at most 0.8 of the narrowest band, at the rest stage's middle.
  const rest = mixBands(crops, 'rest').bands;
  const restT = (rest.tLow + rest.tHigh) / 2;
  const restW = wOf(restT, (rest.rhLow + rest.rhHigh) / 2);
  const share = Math.min(DEHUM_MAX_SHARE, Math.max(0.01, (restW - satW(DEHUM_COIL)) / (wOf(30, 80) - satW(DEHUM_COIL))));
  const restBand = Math.min(rhBand, rest.rhHigh - rest.rhLow);
  const gramsMax = (DEHUM_RH_SHARE * restBand * satW(restT) * volume) / 100;
  const dehumidifierNeed = (gramsMax * 86_400) / (DEHUM_RUN_S * share * 1000);
  const dehumidifierMaxLday = DEHUMIDIFIER_SIZES.filter((s) => s <= dehumidifierNeed).at(-1) ?? DEHUMIDIFIER_SIZES[0];

  // Aircon: the heat at the day high, 30 % over.
  const dHigh = Math.max(0, physics.outdoorHigh - tMid);
  const blocksW = (blocks * CO2_PER_BLOCK * CO2_J_PER_ML) / 3600;
  const fanW = (fanFlow * AIR_KJ_PER_M3K * dHigh) / 3.6;
  const lightsW = ctx.ratings?.lights === true ? (ctx.ratings.lightsW ?? 0) : 0; // fitted lights: their power is heat in the room
  const acW = AC_MARGIN * (physics.wallUA * dHigh + physics.sunW + blocksW + fanW + FANS_W + lightsW);
  const acNeed = acW * BTU_PER_KW / 1000;
  const acHighBTU = nextUp(AC_SIZES, acNeed);

  // Cool-down: from outdoor air at COOL_START_HOUR to the band's middle within the longest cool-down, the heat of that hour
  // and the heat of the blocks and the room's mass (with the air) taken down by as much over that time.
  const maxH = input.coolDownMaxH ?? COOL_DOWN_MAX_H;
  const at = outdoorAt(physics, COOL_START_HOUR * 3600);
  const dCool = Math.max(0, at.outdoorT - tMid);
  const massKJ = volume * MASS_KJ_PER_M3K + blocks * BLOCK_KJ_PER_K + volume * AIR_KJ_PER_M3K;
  const massW = (massKJ * dCool * 1000) / (maxH * 3600);
  const hourW = physics.wallUA * dCool + physics.sunW * at.sun + blocksW + (fanFlow * AIR_KJ_PER_M3K * dCool) / 3.6 + FANS_W + lightsW;
  const acCoolBTU = nextUp(AC_SIZES, ((massW + hourW) * BTU_PER_KW) / 1000);
  const acBTU = Math.max(acHighBTU, acCoolBTU);

  // Humidifier for the cool-down: the water the aircon takes out at full load from air as wet as outdoors at the band's
  // middle (its coil splits the load into cooling and drying), at least the one for the band.
  const latent = Math.max(0, satW(physics.outdoorDew) - satW(COIL_ADP)) * LATENT_KJ_PER_G; // kJ a m³ of air gives the coil
  const sensible = AIR_KJ_PER_M3K * Math.max(0, tMid - COIL_ADP);
  const dryShare = latent + sensible > 0 ? latent / (latent + sensible) : 0;
  const condensedLH = ((acBTU / BTU_PER_KW) * dryShare * 3600) / LATENT_KJ_PER_G / 1000;
  const humidifierCoolLH = Math.max(humidifierLH, nearest(HUMIDIFIER_SIZES, condensedLH));

  // Air exchange time limit: longer when the fan runs more than half the time in the strictest stage.
  const duty = fanNeed / fanFlow;
  const roomLimit = ctx.control?.exchangeMaxMin ?? DEFAULTS.exchangeMaxMin;
  const exchangeMaxMin = duty > 0.5 ? LIMIT_MAX_MIN : roomLimit;

  return {
    fanFlow, humidifierLH, dehumidifierMaxLday, acBTU, acCoolBTU, humidifierCoolLH, exchangeMaxMin,
    why: {
      fanFlow: `${blocks} blocks give off ${round(co2LH, 1)} L of CO₂ an hour; ${fanFlow} m³/h holds it at ${holds} ppm`,
      humidifierLH: `One minute of ${humidifierLH} L/h moves humidity about ${round(((humidifierLH * 1000 / 60) * 100) / (volume * satW(tMid)), 1)} % in a room of ${round(volume, 1)} m³ (the narrowest band is ${rhBand} %)`,
      dehumidifierLday: `a 3 min run of a larger one would move humidity more than 80 % of the ${restBand} % band`,
      acBTU: `About ${Math.round(acW)} W of heat at an outdoor ${physics.outdoorHigh} °C with the room at ${round(tMid, 1)} °C (walls, sun, blocks, fan air${lightsW > 0 ? ', lights' : ''}), with 30 % to spare; the search also tries larger ones, since drying a wet room takes part of an aircon's power${acCoolBTU > acHighBTU ? '; the cool-down needs more' : ''}`,
      coolDown: `From outdoor air at ${COOL_START_HOUR}:00 (${round(at.outdoorT, 1)} °C) to ${round(tMid, 1)} °C within ${maxH} h takes about ${grouped(massW + hourW)} W: ${grouped(massW)} W to cool the blocks and the room's mass, ${grouped(hourW)} W of heat at that hour (walls, sun, blocks, fan air${lightsW > 0 ? ', lights' : ''}); the aircon then takes about ${round(condensedLH, 1)} L of water an hour out of air as wet as outdoors, which a humidifier of ${humidifierCoolLH} L/h makes up`,
      exchangeMaxMin: duty > 0.5
        ? `The fan runs about ${Math.round(duty * 100)} % of the time, so a long air exchange (${LIMIT_MAX_MIN} min) is allowed`
        : `The fan runs about ${Math.round(duty * 100)} % of the time, so the room's own limit of ${roomLimit} min stays`,
    },
  };
}

// Up to `count` of the sizes from the first to the last, evenly picked.
function spread(list, count) {
  if (list.length <= count) return list;
  return Array.from({ length: count }, (_, k) => list[Math.round((k * (list.length - 1)) / (count - 1))]);
}

// The setups to try around an estimate. → [{ machines: { fanFlow, humidifierLH, dehumidifierLday, acBTU }, exchangeMaxMin }], at most 96.
export function candidates(est) {
  const around = (sizes, v, below, above) => {
    const i = sizes.indexOf(v);
    return sizes.slice(Math.max(0, i - below), i + above + 1);
  };
  const fans = around(FAN_SIZES, est.fanFlow, 1, 1);
  const humidifiers = around(HUMIDIFIER_SIZES, est.humidifierLH, 1, 0);
  const dehumidifiers = [0, ...spread(DEHUMIDIFIER_SIZES.filter((s) => s <= est.dehumidifierMaxLday), 3)];
  const aircons = around(AC_SIZES, est.acBTU, 0, 1);
  const limits = est.exchangeMaxMin === LIMIT_MAX_MIN ? [LIMIT_MAX_MIN] : [est.exchangeMaxMin, LIMIT_MAX_MIN];
  const list = [];
  for (const fanFlow of fans) for (const humidifierLH of humidifiers) for (const dehumidifierLday of dehumidifiers) {
    for (const acBTU of aircons) for (const exchangeMaxMin of limits) list.push({ machines: { fanFlow, humidifierLH, dehumidifierLday, acBTU }, exchangeMaxMin });
  }
  return list;
}

const lowest = (r) => Math.min(r.inBand.t, r.inBand.rh, r.inBand.co2);
// Whether a setup cooled down within maxH (coolDownH null or missing: it did not).
const cools = (r, maxH) => typeof r.coolDownH === 'number' && r.coolDownH <= maxH;

// The order of evaluated setups by lowestOf (their share in band that counts): those reaching the target and cooling down
// within maxH first, by kWh; then those reaching only the target, the quickest cool-down first; then the rest by lowestOf,
// highest first (equal ones by kWh).
function order(lowestOf, target, maxH) {
  const tier = (r) => (lowestOf(r) < target ? 2 : cools(r, maxH) ? 0 : 1);
  const coolH = (r) => (typeof r.coolDownH === 'number' ? r.coolDownH : Infinity);
  return (a, b) => {
    if (tier(a) !== tier(b)) return tier(a) - tier(b);
    if (tier(a) === 0) return a.kWh - b.kWh;
    if (tier(a) === 1) return (coolH(a) === coolH(b) ? 0 : coolH(a) - coolH(b)) || a.kWh - b.kWh;
    return lowestOf(b) - lowestOf(a) || a.kWh - b.kWh;
  };
}

// Orders the evaluated setups: the ones reaching the target (each of t, rh, co2 at least `target`) and cooling down within
// coolDownMaxH first by kWh, then the ones reaching only the target by their cool-down, then the rest by their lowest of the
// three, highest first. → a new array.
export function rank(results, target, coolDownMaxH = COOL_DOWN_MAX_H) {
  return [...results].sort(order(lowest, target, coolDownMaxH));
}

const HINTS = {
  rh: 'Humidity stays out of its band (in this climate usually too wet): fewer blocks, a wider humidity band or a different dehumidifier size would help',
  co2: 'CO₂ stays above the band: a bigger fan or fewer blocks',
  t: 'Temperature stays above the band: a bigger aircon or better insulation',
  coolDown: (maxH) => `It does not cool down within ${maxH} h from outdoor air at ${COOL_START_HOUR}:00: a bigger humidifier (the aircon dries the air as it cools it), a bigger aircon or fewer blocks`,
};

// The two-phase search (2026-10-22, after Room 1: a sensible-heat estimate of 9000 BTU/h for a wet 120 m³ room whose 1 °C
// band needs about 24 000). Phase 1: the fan and the aircon over a wide range (one size below the estimates, the aircon up to
// three above), with the cool-down's humidifier and a middle dehumidifier, judged on temperature and CO₂ and the cool-down.
// Phase 2: around the KEEP best of phase 1, the humidifier (around its estimate, and up to the cool-down's), the dehumidifier
// and the time limit. → { phase1, phase2(of) } and the total count of setups.
const KEEP = 2;
export function searchPlan(est) {
  const around = (sizes, v, below, above) => {
    const i = Math.max(0, sizes.indexOf(v));
    return sizes.slice(Math.max(0, i - below), i + above + 1);
  };
  const allowed = DEHUMIDIFIER_SIZES.filter((s) => s <= est.dehumidifierMaxLday);
  const middle = spread(allowed, 3)[Math.min(1, allowed.length - 1)] ?? 0;
  const limits = est.exchangeMaxMin === LIMIT_MAX_MIN ? [LIMIT_MAX_MIN] : [est.exchangeMaxMin, LIMIT_MAX_MIN];
  // The search runs with the settings that suit a fan that runs most of the time: no aircon drop during an exchange (it
  // pulls a room below a narrow band) and no forced humidifier (Malaysian outdoor air is wet already); the reply names them.
  const settings = { acDrop: 0, humidifierDuringExchange: false };
  const coolLH = est.humidifierCoolLH ?? est.humidifierLH;
  const phase1 = [];
  for (const fanFlow of around(FAN_SIZES, est.fanFlow, 1, 1)) for (const acBTU of around(AC_SIZES, est.acBTU, 1, 3)) {
    phase1.push({ machines: { fanFlow, humidifierLH: coolLH, dehumidifierLday: middle, acBTU }, exchangeMaxMin: est.exchangeMaxMin, ...settings });
  }
  // One size either side of the estimate; when the cool-down's is further up, the estimate, the size above it, and the
  // cool-down's with the size below it (the one to hold the band, the other to recover from outdoor air).
  const h = HUMIDIFIER_SIZES.indexOf(est.humidifierLH), c = HUMIDIFIER_SIZES.indexOf(coolLH);
  const humidifiers = c <= h + 1 ? around(HUMIDIFIER_SIZES, est.humidifierLH, 1, 1)
    : [...new Set([h, h + 1, c - 1, c].map((k) => HUMIDIFIER_SIZES[k]))];
  // Without the core itself: it was tried in phase 1 (its humidifier, middle dehumidifier and limit are among these).
  const phase2 = (core) => {
    const list = [];
    for (const humidifierLH of humidifiers) for (const dehumidifierLday of [0, ...spread(allowed, 3)]) {
      for (const exchangeMaxMin of limits) {
        const m = core.machines;
        if (humidifierLH === m.humidifierLH && dehumidifierLday === m.dehumidifierLday && exchangeMaxMin === core.exchangeMaxMin) continue;
        list.push({ machines: { ...m, humidifierLH, dehumidifierLday }, exchangeMaxMin, ...settings });
      }
    }
    return list;
  };
  const kept = Math.min(KEEP, phase1.length);
  return { phase1, phase2, total: phase1.length + kept * phase2(phase1[0]).length };
}

// Tries the setups (each over the days of both stages, and a day's cool-down from outdoor air at COOL_START_HOUR) and answers
// the best five: the two-phase search, or `list` (tests). input: { physics, crops, farmType, stage, target, coolDownMaxH,
// baseline }; ctx: as for simulate. simulate: injectable; list and days: test overrides. onProgress: the share of the setups
// tried. → { target, coolDownMaxH, coolDownStartHour, days, estimate, best, reached, notes, baseline }; a row of best has
// coolDownH (hours, one decimal, null: not within the day). baseline (owner 2026-10-29, only when asked): the room's machines
// as they are ({ fanFlow, acBTU, humidifierLH, dehumidifierLday }), tried first like a setup with the room's own settings and
// answered as a row of its own; it is never in best (best is what to buy).
export function runSizing(input, ctx, { onProgress, simulate, list, days } = {}) {
  const target = input.target ?? TARGET_DEFAULT;
  const maxH = input.coolDownMaxH ?? COOL_DOWN_MAX_H;
  const est = estimate(input, ctx);
  const runDays = days ?? sizingDays(input, ctx);
  const plan = list ? null : searchPlan(est);
  const total = (list ? list.length : plan.total) + (input.baseline ? 1 : 0);
  let tried = 0;
  const results = [];
  const tryOne = (c) => {
    const { machines, exchangeMaxMin } = c;
    // control: the settings the setup was tried with (the time limit, and from the search the aircon drop and the humidifier)
    const control = { exchangeMaxMin, ...(c.acDrop === undefined ? {} : { acDrop: c.acDrop }),
      ...(c.humidifierDuringExchange === undefined ? {} : { humidifierDuringExchange: c.humidifierDuringExchange }) };
    const run = { physics: { ...input.physics, ...machines }, crops: input.crops, farmType: input.farmType, stage: input.stage };
    const runCtx = { ...ctx, control: { ...ctx.control, ...control } };
    const out = simulate({ ...run, days: runDays }, runCtx);
    const cool = simulate({ ...run, days: COOL_DAYS, start: 'outdoor', startHour: COOL_START_HOUR }, runCtx).summary.coolDownS;
    const { inBand, energy, water } = out.summary;
    const r = { machines, exchangeMaxMin, control, inBand, kWh: energy.kWh, litres: water.litres, removedLitres: water.removedLitres,
      coolDownH: typeof cool === 'number' ? round(cool / 3600, 1) : null };
    onProgress?.(++tried / total);
    return r;
  };
  const baseline = input.baseline
    ? tryOne({ machines: input.baseline, exchangeMaxMin: ctx.control?.exchangeMaxMin ?? DEFAULTS.exchangeMaxMin }) : null;
  const tryOther = (c) => {
    const r = tryOne(c);
    results.push(r);
    return r;
  };
  if (list) {
    list.forEach(tryOther);
  } else {
    // phase 1: judged on temperature and CO₂ held, and the cool-down (the humidity machines come next)
    const core = plan.phase1.map(tryOther);
    core.sort(order((r) => Math.min(r.inBand.t, r.inBand.co2), target, maxH));
    for (const c of core.slice(0, KEEP)) plan.phase2(c).forEach(tryOther);
  }
  const best = rank(results, target, maxH).slice(0, 5);
  const reached = best.length > 0 && lowest(best[0]) >= target && cools(best[0], maxH);
  const notes = reached || best.length === 0 ? []
    : [...['rh', 'co2', 't'].filter((k) => best[0].inBand[k] < target).map((k) => HINTS[k]), ...(cools(best[0], maxH) ? [] : [HINTS.coolDown(maxH)])];
  return { target, coolDownMaxH: maxH, coolDownStartHour: COOL_START_HOUR, days: runDays, estimate: est, best, reached, notes,
    ...(baseline ? { baseline } : {}) };
}
