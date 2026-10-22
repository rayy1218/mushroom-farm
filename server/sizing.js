// Suggest machines (spec 2026-10-22-suggest-machines-design.md 3 and 4): starting estimates from formulas, the candidates
// around them, and the ranking of what the simulation says about each. Pure: no clock, no I/O.

import { satW, wOf } from '../device/sim-model.js';
import { BTU_PER_KW } from '../device/sim-store.js';
import { CO2_PER_BLOCK, blocksOf, mixBands } from '../web/crops.js';
import { DEFAULTS } from './controller.js';
import { PROGRAM_DEFAULTS, nextStage } from './program.js';

export const TARGET_DEFAULT = 95;
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

const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;
const nextUp = (sizes, v) => sizes.find((s) => s >= v) ?? sizes.at(-1);
const nearest = (sizes, v) => sizes.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

// The stages searched: the start stage and the one after it. → [stage, …] (one when nothing follows).
function stagesOf(input, ctx) {
  const flushes = Math.max(2, ctx.program?.flushes ?? PROGRAM_DEFAULTS.flushes);
  const next = nextStage({ stage: input.stage, flush: 1, flushes, done: false });
  return next ? [input.stage, next.stage] : [input.stage];
}

// The days both stages last (the program's), at most 30.
export function sizingDays(input, ctx) {
  const days = { ...PROGRAM_DEFAULTS.days, ...ctx.program?.days };
  return Math.min(MAX_DAYS, stagesOf(input, ctx).reduce((sum, s) => sum + days[s], 0));
}

// → { fanFlow, humidifierLH, dehumidifierMaxLday, acBTU, exchangeMaxMin, why: { fanFlow, humidifierLH, dehumidifierLday, acBTU, exchangeMaxMin } }
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
  const acW = AC_MARGIN * (physics.wallUA * dHigh + physics.sunW + blocksW + fanW + FANS_W);
  const acNeed = acW * BTU_PER_KW / 1000;
  const acBTU = nextUp(AC_SIZES, acNeed);

  // Air exchange time limit: longer when the fan runs more than half the time in the strictest stage.
  const duty = fanNeed / fanFlow;
  const roomLimit = ctx.control?.exchangeMaxMin ?? DEFAULTS.exchangeMaxMin;
  const exchangeMaxMin = duty > 0.5 ? LIMIT_MAX_MIN : roomLimit;

  return {
    fanFlow, humidifierLH, dehumidifierMaxLday, acBTU, exchangeMaxMin,
    why: {
      fanFlow: `${blocks} blocks give off ${round(co2LH, 1)} L of CO₂ an hour; ${fanFlow} m³/h holds it at ${holds} ppm`,
      humidifierLH: `One minute of ${humidifierLH} L/h moves humidity about ${round(((humidifierLH * 1000 / 60) * 100) / (volume * satW(tMid)), 1)} % in a room of ${round(volume, 1)} m³ (the narrowest band is ${rhBand} %)`,
      dehumidifierLday: `Up to ${dehumidifierMaxLday} L/day: a 3 min run of a larger one would move humidity more than 80 % of the ${restBand} % band`,
      acBTU: `About ${Math.round(acW)} W of heat at an outdoor ${physics.outdoorHigh} °C with the room at ${round(tMid, 1)} °C (walls, sun, blocks, fan air), with 30 % to spare`,
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

// Orders the evaluated setups: the ones reaching the target (each of t, rh, co2 at least `target`) first by kWh, then the rest
// by their lowest of the three, highest first. → a new array.
export function rank(results, target) {
  const reaches = (r) => lowest(r) >= target;
  return [...results].sort((a, b) => {
    if (reaches(a) !== reaches(b)) return reaches(a) ? -1 : 1;
    if (reaches(a)) return a.kWh - b.kWh;
    return lowest(b) - lowest(a) || a.kWh - b.kWh;
  });
}

const HINTS = {
  rh: 'Humidity stays above the band: the room has more water than these machines take out; fewer blocks or a wider humidity band would help',
  co2: 'CO₂ stays above the band: a bigger fan or fewer blocks',
  t: 'Temperature stays above the band: a bigger aircon or better insulation',
};

// Tries the candidates (each over the days of both stages) and answers the best five.
// input: { physics, crops, farmType, stage, target }; ctx: as for simulate. simulate: injectable; list and days: test overrides.
// → { target, days, estimate, best, reached, notes }.
export function runSizing(input, ctx, { onProgress, simulate, list, days } = {}) {
  const target = input.target ?? TARGET_DEFAULT;
  const est = estimate(input, ctx);
  const tries = list ?? candidates(est);
  const runDays = days ?? sizingDays(input, ctx);
  const results = [];
  tries.forEach((c, i) => {
    const { machines, exchangeMaxMin } = c;
    const out = simulate(
      { physics: { ...input.physics, ...machines }, crops: input.crops, farmType: input.farmType, stage: input.stage, days: runDays },
      { ...ctx, control: { ...ctx.control, exchangeMaxMin } },
    );
    const { inBand, energy, water } = out.summary;
    results.push({ machines, exchangeMaxMin, inBand, kWh: energy.kWh, litres: water.litres, removedLitres: water.removedLitres });
    onProgress?.((i + 1) / tries.length);
  });
  const best = rank(results, target).slice(0, 5);
  const reached = best.length > 0 && lowest(best[0]) >= target;
  const notes = reached || best.length === 0 ? [] : ['rh', 'co2', 't'].filter((k) => best[0].inBand[k] < target).map((k) => HINTS[k]);
  return { target, days: runDays, estimate: est, best, reached, notes };
}
