// The room simulation (spec 2026-10-20-crops-and-simulation-design.md 4.2 and 4.3): the device app's air model steps 10 s at
// a time while the farm's own control (decide and protect of controller.js) and stage program (program.js) run the room, with
// ideal sensors and machines that follow at once. Pure: no clock, no I/O, the same input gives the same result.

import { step, outdoorAt, wOf, rhOf } from '../device/sim-model.js';
import { BTU_PER_KW } from '../device/sim-store.js';
import { CO2_PER_BLOCK, blocksOf, mixBands } from '../web/crops.js';
import { DEFAULTS, decide, protect } from './controller.js';
import { PROGRAM_DEFAULTS, advance, startStage } from './program.js';

const STEP_S = 10; // the controller decides every step
const MODEL_S = 5; // the model's own sub-step (device/sim-model.js), stepped here to add up its water and aircon load
const SAMPLE_S = 300; // a point of the series every 5 min
const DAY_S = 86_400;
const FAN_SHARE = 0.05; // the aircon draws at least this share of its rated input while powered (usage.js)
const MACHINES = ['intake', 'exhaust', 'circulation', 'humidifier'];
const RATING = { intake: 'intakeW', exhaust: 'exhaustW', circulation: 'circulationW', humidifier: 'humidifierW' };

const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;
const percent = (n, total) => round((n / total) * 100, 1);

// input: { physics: { wallUA, outdoorHigh, outdoorLow, outdoorDew, sunW, fanFlow, acBTU, humidifierLH }, crops, farmType, stage,
// days }. ctx: { volume, ratings (the room's machine ratings), control (the room's control settings), program (its stored
// numbers: flushes, days, rampH; null: the defaults), prices: { electricity, water } | null }.
// onProgress(share 0 to 1) is called at least every 1 %. → { series, machines, stages, summary }.
export function simulate(input, ctx, { onProgress } = {}) {
  const { physics, crops, farmType, stage: startName, days } = input;
  const { volume, ratings, control = DEFAULTS } = ctx;
  const prices = ctx.prices ?? { electricity: null, water: null };
  const stored = ctx.program ?? {};
  const totalS = days * DAY_S;
  const steps = totalS / STEP_S;

  let program = {
    ...PROGRAM_DEFAULTS,
    ...(stored.flushes === undefined ? {} : { flushes: stored.flushes }),
    ...(stored.rampH === undefined ? {} : { rampH: stored.rampH }),
    days: { ...PROGRAM_DEFAULTS.days, ...stored.days },
    crops, farmType, stage: startName, flush: 1, autoAdvance: true, done: false, ramp: null,
  };
  let bands = mixBands(crops, startName).bands;
  program = startStage(program, startName, 0, bands, { ramp: false });
  bands = { ...program.ramp.to };

  const modelParams = {
    volume, blocks: blocksOf(crops), co2PerBlock: CO2_PER_BLOCK, wallUA: physics.wallUA, sunW: physics.sunW, fanFlow: physics.fanFlow,
    acKW: physics.acBTU / BTU_PER_KW, humidifierGH: physics.humidifierLH * 1000,
  };

  const T0 = (bands.tLow + bands.tHigh) / 2;
  const RH0 = (bands.rhLow + bands.rhHigh) / 2;
  let state = { T: T0, W: wOf(T0, RH0), CO2: 420, Tm: T0, Hs: RH0 };

  // The controller's memory and the machines' commands (all off to start; the aircon's first command is free of the hold).
  let memory = {
    exchange: false, exchangeSince: null, exchangeEndedAt: null, exchangeForced: false, freshFrom: null,
    cappedInRow: 0, humidifier: false, humidifierSince: null,
  };
  let commands = { relay: { intake: false, exhaust: false, circulation: false, humidifier: false }, ac: { power: false, mode: 'cool', setpoint: 25, fan: 'auto' } };
  const changedAt = {};
  const extra = { exchangeMaxMin: control.exchangeMaxMin ?? DEFAULTS.exchangeMaxMin, exchangeEveryMin: control.exchangeEveryMin ?? 0, acDrop: control.acDrop ?? 0 };
  const humidifierDuringExchange = control.humidifierDuringExchange ?? DEFAULTS.humidifierDuringExchange;
  const acFan = control.acFan ?? DEFAULTS.acFan;

  const series = [];
  const spans = { intake: [], exhaust: [], circulation: [], humidifier: [], ac: [] };
  const open = {}; // the span being on now, by machine
  const stages = [{ stage: startName, flush: 1, from: 0, to: totalS }];
  const count = () => ({ t: 0, rh: 0, co2: 0, all: 0, n: 0 });
  const total = count();
  const stageCount = [count()];
  const onS = { intake: 0, exhaust: 0, circulation: 0, humidifier: 0 };
  let acKWh = 0;
  const dayKWh = new Array(days).fill(0);
  const dayLitres = new Array(days).fill(0);
  const ext = { tMin: Infinity, tMax: -Infinity, rhMin: Infinity, rhMax: -Infinity, co2Max: -Infinity };
  let litres = 0;
  let lastShare = -1;

  const closeSpan = (name, at) => {
    const sp = open[name];
    if (!sp) return;
    sp.to = at;
    delete open[name];
  };
  const openSpan = (name, at, extraFields) => {
    const sp = { from: at, to: at, ...extraFields };
    open[name] = sp;
    spans[name].push(sp);
  };

  for (let i = 0; i < steps; i++) {
    const s = i * STEP_S;
    const ms = s * 1000;
    const dayIndex = Math.floor(s / DAY_S);

    // The program: stage changes that are due, and the bands while they move.
    const adv = advance(program, ms, bands);
    program = adv.program;
    if (adv.bands) bands = adv.bands;
    for (const c of adv.changed) {
      const at = c.at / 1000;
      stages.at(-1).to = at;
      stages.push({ stage: c.stage, flush: c.flush, from: at, to: totalS });
      stageCount.push(count());
    }

    const { T, W, CO2 } = state;
    const rh = rhOf(T, W);

    // The time in band at this moment, with the bands of this moment.
    const inT = T >= bands.tLow && T <= bands.tHigh;
    const inRH = rh >= bands.rhLow && rh <= bands.rhHigh;
    const inCO2 = CO2 <= bands.co2High;
    for (const c of [total, stageCount.at(-1)]) {
      c.n++;
      if (inT) c.t++;
      if (inRH) c.rh++;
      if (inCO2) c.co2++;
      if (inT && inRH && inCO2) c.all++;
    }
    if (T < ext.tMin) ext.tMin = T;
    if (T > ext.tMax) ext.tMax = T;
    if (rh < ext.rhMin) ext.rhMin = rh;
    if (rh > ext.rhMax) ext.rhMax = rh;
    if (CO2 > ext.co2Max) ext.co2Max = CO2;

    const out = outdoorAt(physics, s);
    if (s % SAMPLE_S === 0) {
      series.push({
        s, t: round(T, 2), rh: round(rh, 1), co2: Math.round(CO2), outT: round(out.outdoorT, 1), outRH: round(out.outdoorRH, 1),
        tLow: bands.tLow, tHigh: bands.tHigh, rhLow: bands.rhLow, rhHigh: bands.rhHigh, co2Low: bands.co2Low, co2High: bands.co2High,
        stage: program.stage,
      });
    }

    // The control decides from ideal readings; the commands go to the machines at once.
    const decided = decide({
      bands: { ...extra, ...bands }, state: memory, readings: { co2: CO2, rh }, faults: null, now: ms, humidifierDuringExchange, acFan,
    });
    memory = decided.state;
    const { desired } = protect({ desired: decided.desired, commands, changedAt, now: ms });
    if (desired.humidifier !== commands.relay.humidifier) changedAt.humidifier = ms;
    const a = desired.ac, c = commands.ac;
    if (a.power !== c.power || a.mode !== c.mode || a.fan !== c.fan || a.setpoint !== c.setpoint) changedAt.ac = ms;
    commands = { relay: { intake: desired.intake, exhaust: desired.exhaust, circulation: desired.circulation, humidifier: desired.humidifier }, ac: { ...a } };

    for (const name of MACHINES) {
      if (desired[name]) {
        if (!open[name]) openSpan(name, s);
        open[name].to = s + STEP_S;
        onS[name] += STEP_S;
      } else closeSpan(name, s);
    }
    if (a.power) {
      if (open.ac && open.ac.setpoint !== a.setpoint) closeSpan('ac', s);
      if (!open.ac) openSpan('ac', s, { setpoint: a.setpoint });
      open.ac.to = s + STEP_S;
    } else closeSpan('ac', s);

    // The model, in its own sub-steps, with the commanded machines; adds up the humidifier's water and the aircon's load.
    const inputs = { intake: desired.intake, exhaust: desired.exhaust, circulation: desired.circulation, humidifier: desired.humidifier,
      ac: a.power ? { mode: a.mode, setpoint: a.setpoint, fan: a.fan } : null };
    const params = { ...modelParams, ...out };
    let load = 0, grams = 0;
    for (let k = 0; k < STEP_S / MODEL_S; k++) {
      const r = step(state, inputs, params, MODEL_S);
      state = r.state;
      load += r.acting.acLoad * MODEL_S;
      grams += (r.acting.humidifierGH * MODEL_S) / 3600;
    }
    const acStepKWh = a.power ? (ratings.acInputW / 1000) * (Math.max(FAN_SHARE * STEP_S, load) / 3600) : 0;
    acKWh += acStepKWh;
    litres += grams / 1000;
    let relayKWh = 0;
    for (const name of MACHINES) if (desired[name]) relayKWh += (ratings[RATING[name]] / 1000) * (STEP_S / 3600);
    dayKWh[dayIndex] += acStepKWh + relayKWh;
    dayLitres[dayIndex] += grams / 1000;

    const share = Math.floor(((i + 1) / steps) * 100);
    if (share !== lastShare) {
      lastShare = share;
      onProgress?.(share / 100);
    }
  }
  for (const name of Object.keys(open)) closeSpan(name, totalS);

  const byMachine = {};
  for (const name of MACHINES) byMachine[name] = round((ratings[RATING[name]] / 1000) * (onS[name] / 3600), 2);
  byMachine.ac = round(acKWh, 2);
  const kWh = round(Object.values(byMachine).reduce((x, y) => x + y, 0), 2);
  const litresRounded = round(litres, 1);
  const bandShares = (c) => ({ t: percent(c.t, c.n), rh: percent(c.rh, c.n), co2: percent(c.co2, c.n), all: percent(c.all, c.n) });

  return {
    series,
    machines: spans,
    stages,
    summary: {
      days,
      inBand: bandShares(total),
      perStage: stages.map((st, i) => ({ stage: st.stage, flush: st.flush, from: st.from, to: st.to, inBand: bandShares(stageCount[i]) })),
      energy: { byMachine, kWh, cost: prices.electricity == null ? null : round(kWh * prices.electricity, 2) },
      water: { litres: litresRounded, cost: prices.water == null ? null : round((litresRounded / 1000) * prices.water, 2) },
      perDay: dayKWh.map((k, d) => ({ day: d + 1, kWh: round(k, 2), litres: round(dayLitres[d], 1) })),
      extremes: {
        tMin: round(ext.tMin, 1), tMax: round(ext.tMax, 1), rhMin: round(ext.rhMin, 1), rhMax: round(ext.rhMax, 1), co2Max: Math.round(ext.co2Max),
      },
    },
  };
}
