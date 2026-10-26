// The room simulation (spec 2026-10-20-crops-and-simulation-design.md 4.2 and 4.3): the device app's air model steps 10 s at
// a time while the farm's own control (decide and protect of controller.js) and stage program (program.js) run the room, with
// ideal sensors and machines that follow at once. Pure: no clock, no I/O, the same input gives the same result.

import { step, outdoorAt, wOf, rhOf, hasFilter, changeFilter } from '../device/sim-model.js';
import { fanWattFactor } from '../device/sim-power.js';
import { BTU_PER_KW } from '../device/sim-store.js';
import { CO2_PER_BLOCK, blocksOf, mixBands } from '../web/crops.js';
import { DEFAULTS, decide, protect } from './controller.js';
import { PROGRAM_DEFAULTS, advance, startStage } from './program.js';

const STEP_S = 10; // the controller decides every step
const MODEL_S = 5; // the model's own sub-step (device/sim-model.js), stepped here to add up its water and aircon load
const SAMPLE_S = 300; // a point of the series every 5 min
const DAY_S = 86_400;
const FAN_SHARE = 0.05; // the aircon draws at least this share of its rated input while powered (usage.js)
// The aircon's input at full load from the size asked in the stepper (not the room's rating, which is for its present unit):
// COP 3, about EER 10 BTU/Wh, a typical split unit.
const AC_COP = 3;
const DEHUMIDIFIER_W_PER_LDAY = 18; // a 20 L/day unit draws about 360 W
// The fans and the humidifier are priced by the sizes asked too (the room's ratings are for the machines it has now; a
// suggestion that tries a bigger fan must not get it at the small one's power). Both match the room defaults at the default
// sizes: 600 m³/h → 60 W a fan, 2 L/h → 80 W.
const FAN_W_PER_M3H = 0.1;
const FAN_W_MIN = 20;
const HUMIDIFIER_W_PER_LH = 40;
const MACHINES = ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier'];
const RATING = { intake: 'intakeW', exhaust: 'exhaustW', circulation: 'circulationW', humidifier: 'humidifierW', dehumidifier: 'dehumidifierW' };
const FILTER_DIRTY_S = 600; // with a pressure sensor the filter is changed after this long of intake running at its change pressure

const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;
const percent = (n, total) => round((n / total) * 100, 1);

// input: { physics: { wallUA, outdoorHigh, outdoorLow, outdoorDew, sunW, fanFlow, acBTU, humidifierLH, dehumidifierLday (0 or
// missing: no dehumidifier), the intake filter (spec 2026-10-22-filter-design.md 8; missing: no filter): fanMaxPa, filterCleanPa,
// filterFinalPa, filterLifeDays, filterChangeDays (0: no reminder), filterUsedDays, filterSensor }, crops, farmType, stage,
// days }. ctx: { volume, ratings (the room's machine ratings), control (the room's control settings), program (its stored
// numbers: flushes, days, rampH; null: the defaults), prices: { electricity, water } | null }.
// onProgress(share 0 to 1) is called at least every 1 %. → { series, machines, stages, summary }.
export function simulate(input, ctx, { onProgress } = {}) {
  const { physics, crops, farmType, stage: startName, days } = input;
  const { volume, ratings, control = DEFAULTS } = ctx;
  const prices = ctx.prices ?? { electricity: null, water: null };
  const acInputKW = physics.acBTU / BTU_PER_KW / AC_COP;
  const dehumidifierLday = physics.dehumidifierLday ?? 0;
  const dehumidifierW = dehumidifierLday * DEHUMIDIFIER_W_PER_LDAY; // its own rating, not the room's (like the aircon's size)
  const fanW = Math.max(FAN_W_MIN, FAN_W_PER_M3H * physics.fanFlow);
  const watts = { ...ratings, intakeW: fanW, exhaustW: fanW, humidifierW: HUMIDIFIER_W_PER_LH * physics.humidifierLH, dehumidifierW };
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
    dehumidifierLday, dehumidifierW,
  };
  // The filter: loaded as if it had passed fanFlow all its days in use; changed on the reminder or, with a sensor, at its
  // change pressure. lastChange: when it was last changed, in s from the start (before it: its days in use).
  const filterOn = hasFilter(physics);
  if (filterOn) {
    for (const key of ['fanMaxPa', 'filterCleanPa', 'filterFinalPa', 'filterLifeDays']) modelParams[key] = physics[key];
  }
  const changeS = filterOn ? (physics.filterChangeDays ?? 0) * DAY_S : 0;
  let lastChange = filterOn ? -(physics.filterUsedDays ?? 0) * DAY_S : 0;
  // intake running at or above the change pressure, added up across exchanges like the filterDirty alarm (alarms.js): it
  // starts again only below the change pressure − 10 (between the two it waits)
  let dirtyS = 0;
  const changes = [];
  const sums = { exchange: 0, exchangeIntake: 0, unfiltered: 0, pa: 0, paS: 0 };

  const T0 = (bands.tLow + bands.tHigh) / 2;
  const RH0 = (bands.rhLow + bands.rhHigh) / 2;
  let state = { T: T0, W: wOf(T0, RH0), CO2: 420, Tm: T0, Hs: RH0, Lf: filterOn ? (physics.filterUsedDays ?? 0) / physics.filterLifeDays : 0 };

  // The controller's memory and the machines' commands (all off to start; the aircon's first command is free of the hold).
  let memory = {
    exchange: false, exchangeSince: null, exchangeEndedAt: null, exchangeForced: false, freshFrom: null,
    cappedInRow: 0, humidifier: false, humidifierSince: null, dehumidifier: false,
  };
  let commands = { relay: { intake: false, exhaust: false, circulation: false, humidifier: false, dehumidifier: false }, ac: { power: false, mode: 'cool', setpoint: 25, fan: 'auto' } };
  const changedAt = {};
  const extra = { exchangeMaxMin: control.exchangeMaxMin ?? DEFAULTS.exchangeMaxMin, exchangeEveryMin: control.exchangeEveryMin ?? DEFAULTS.exchangeEveryMin, acDrop: control.acDrop ?? 0, outdoorAir: control.outdoorAir ?? DEFAULTS.outdoorAir };
  const humidifierDuringExchange = control.humidifierDuringExchange ?? DEFAULTS.humidifierDuringExchange;
  const acFan = control.acFan ?? DEFAULTS.acFan;

  const series = [];
  const spans = { intake: [], exhaust: [], circulation: [], humidifier: [], dehumidifier: [], ac: [] };
  const open = {}; // the span being on now, by machine
  const stages = [{ stage: startName, flush: 1, from: 0, to: totalS }];
  const count = () => ({ t: 0, rh: 0, co2: 0, all: 0, n: 0 });
  const total = count();
  const stageCount = [count()];
  const onS = { intake: 0, exhaust: 0, circulation: 0, humidifier: 0, dehumidifier: 0 };
  let acKWh = 0;
  let intakeKWh = 0; // the intake's own: its watts follow the filter
  const dayKWh = new Array(days).fill(0);
  const dayLitres = new Array(days).fill(0);
  const ext = { tMin: Infinity, tMax: -Infinity, rhMin: Infinity, rhMax: -Infinity, co2Max: -Infinity };
  let litres = 0;
  let removed = 0; // grams of water the dehumidifier took out
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

    if (filterOn && ((changeS > 0 && s - lastChange >= changeS) || (physics.filterSensor && dirtyS >= FILTER_DIRTY_S))) {
      state = changeFilter(state);
      lastChange = s;
      dirtyS = 0;
      changes.push(s);
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
      bands: { ...extra, ...bands }, state: memory, readings: { co2: CO2, rh, t: T, outdoor: { t: out.outdoorT, rh: out.outdoorRH } }, faults: null, now: ms, humidifierDuringExchange, acFan,
      dehumidifierFitted: dehumidifierLday > 0,
    });
    memory = decided.state;
    const { desired } = protect({ desired: decided.desired, commands, changedAt, now: ms });
    for (const name of ['humidifier', 'dehumidifier']) if (desired[name] !== commands.relay[name]) changedAt[name] = ms;
    const a = desired.ac, c = commands.ac;
    if (a.power !== c.power || a.mode !== c.mode || a.fan !== c.fan || a.setpoint !== c.setpoint) changedAt.ac = ms;
    commands = { relay: { intake: desired.intake, exhaust: desired.exhaust, circulation: desired.circulation, humidifier: desired.humidifier, dehumidifier: desired.dehumidifier }, ac: { ...a } };

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
    const inputs = { intake: desired.intake, exhaust: desired.exhaust, circulation: desired.circulation, humidifier: desired.humidifier, dehumidifier: desired.dehumidifier,
      ac: a.power ? { mode: a.mode, setpoint: a.setpoint, fan: a.fan } : null };
    const params = { ...modelParams, ...out };
    let load = 0, grams = 0, takenOut = 0, intakeStepKWh = 0;
    for (let k = 0; k < STEP_S / MODEL_S; k++) {
      const r = step(state, inputs, params, MODEL_S);
      state = r.state;
      load += r.acting.acLoad * MODEL_S;
      grams += (r.acting.humidifierGH * MODEL_S) / 3600;
      takenOut += (r.acting.dehumidifierGH * MODEL_S) / 3600;
      sums.exchange += r.acting.exchangeM3h * MODEL_S;
      if (inputs.intake) {
        const pa = r.acting.filterPa;
        intakeStepKWh += ((watts.intakeW * fanWattFactor(pa, physics.filterCleanPa, physics.fanMaxPa)) / 1000) * (MODEL_S / 3600);
        sums.exchangeIntake += r.acting.exchangeM3h * MODEL_S;
        sums.unfiltered += r.acting.unfilteredM3h * MODEL_S;
        sums.pa += pa * MODEL_S;
        sums.paS += MODEL_S;
        if (filterOn && pa >= physics.filterFinalPa) dirtyS += MODEL_S;
        else if (pa < physics.filterFinalPa - 10) dirtyS = 0;
      }
    }
    intakeKWh += intakeStepKWh;
    const acStepKWh = a.power ? (acInputKW * Math.max(FAN_SHARE * STEP_S, load)) / 3600 : 0;
    acKWh += acStepKWh;
    litres += grams / 1000;
    removed += takenOut / 1000;
    let relayKWh = intakeStepKWh;
    for (const name of MACHINES) if (desired[name] && name !== 'intake') relayKWh += (watts[RATING[name]] / 1000) * (STEP_S / 3600);
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
  for (const name of MACHINES) byMachine[name] = round((watts[RATING[name]] / 1000) * (onS[name] / 3600), 2);
  byMachine.intake = round(intakeKWh, 2);
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
      water: { litres: litresRounded, removedLitres: round(removed, 1), cost: prices.water == null ? null : round((litresRounded / 1000) * prices.water, 2) },
      perDay: dayKWh.map((k, d) => ({ day: d + 1, kWh: round(k, 2), litres: round(dayLitres[d], 1) })),
      extremes: {
        tMin: round(ext.tMin, 1), tMax: round(ext.tMax, 1), rhMin: round(ext.rhMin, 1), rhMax: round(ext.rhMax, 1), co2Max: Math.round(ext.co2Max),
      },
      // changes: s from the start; the mean pressure is while the intake ran; the unfiltered share is of all the air that came
      // in while the intake ran (with the exhaust or alone): the part the exhaust pulled in through the leaks (none with the
      // intake alone).
      filter: filterOn ? {
        changes,
        meanExchangeM3h: round(sums.exchange / totalS, 1),
        meanFilterPa: sums.paS > 0 ? round(sums.pa / sums.paS, 1) : null,
        unfilteredPct: sums.exchangeIntake > 0 ? round((sums.unfiltered / sums.exchangeIntake) * 100, 1) : 0,
      } : null,
    },
  };
}
