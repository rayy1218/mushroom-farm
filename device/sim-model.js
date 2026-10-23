// Pure single-zone climate model for the device app simulation (spec 2026-10-19 section 3).
// No I/O, no clock. State { T, W, CO2, Tm, Hs, Lf }: air °C, air water g/m3, ppm, the room's mass (blocks, racks, the inner
// layer of floor and walls) °C, the water held by its surfaces as an RH in % (above 100: free water on them), and the
// intake filter's loading (0 clean, 1 at its change pressure).

import { fanWattFactor } from './sim-power.js';

const SUB = 5;                 // max sub-step, seconds
const LEAK_PER_H = 0.3;        // vol/h
const SINGLE_FAN = 0.3;        // one fan of the pair alone moves this share of the pair's flow (the rest is blocked by the leaks)
const CO2_OUT = 420;
const LATENT = 2.45;           // kJ per g evaporated
const AIR_CP = 1.2 * 1.006;    // kJ/(m3 K)

// Heat: the air node (air, light contents) and the mass node, coupled through their surfaces.
const AIR_CONTENTS = 3;        // the air node holds this many times the air's own heat capacity
const MASS_KJ_PER_M3 = 10;     // racks, the inner layer of floor and walls, kJ/(K m3 of room)
const BLOCK_KJ = 4;            // a 1.2 kg block at 60 % water, kJ/K
const SURFACE_W_PER_M3 = 5;    // air to mass, W/K per m3 of room (about 1.5 m2 of surface per m3 at 3.3 W/(m2 K))
const BLOCK_SURFACE_W = 0.4;   // air to one block, W/K

// Moisture held by the surfaces (wood, blocks, concrete): this many times the air's own water at the same RH,
// exchanged with the air over MOIST_TAU. Water taken up or condensed gives its latent heat to the air.
const MOIST_BUFFER = 3;
const MOIST_TAU = 1200;        // s
const HS_MAX = 200;            // %: free water on the surfaces at most this much
const SURFACE_G_PER_PCT = (v) => (MOIST_BUFFER * v * satW(25)) / 100; // g of water on the surfaces per % of their RH

// A fruiting block (1 to 1.2 kg): its CO2 comes from the room setting; its heat from respiration (glucose oxidation,
// 467 kJ per mol CO2 at 24.5 L/mol) less the evaporation of its water, which falls as the air gets wetter.
const RESP_KJ_PER_ML = 467 / 24.5 / 1000;
const BLOCK_GH = 0.3;          // g/h of water at 90 % RH; in proportion to the dryness (100 − RH), 3 times at most

// Aircon: capacity acKW at 27 °C / 19 °C wet bulb indoors and 35 °C outdoors; more with a wetter room, less on a hot day.
// The coil's apparatus dew point (ADP) splits it into sensible and latent: the room air is taken toward the ADP.
const BAND = 0.5;              // K, proportional band of the AC
const ADP = { low: 9, auto: 11, high: 13 }; // a slower fan gives a colder coil
const DRY_ADP = 7, DRY_CAP = 0.4;
const CAP_PER_WB = 0.03, CAP_PER_OUT = 0.012;

// Machine heat into the room air (W).
const CIRC_W = 60;             // circulation fan
const INTAKE_W = 60;           // intake fan motor, in the incoming air (the exhaust fan's goes outside)
const HUMIDIFIER_W_PER_LH = 40; // ultrasonic humidifier

// Dehumidifier (spec 2026-10-21-dehumidifier-design.md 5): rated in L/day at 30 °C 80 % RH (the usual label). It takes out
// water in proportion to the air's water above its coil's (5 °C dew point), at most 1.2 times the rating; its power and
// the condensation heat go into the air.
const DEHUM_COIL = 5;
const DEHUM_MAX = 1.2;
const dehumShare = (W) => clamp((W - satW(DEHUM_COIL)) / (wOf(30, 80) - satW(DEHUM_COIL)), 0, DEHUM_MAX);

// Intake filter (spec 2026-10-22-filter-design.md 2): the pressure a sensor across the filter reads while the intake runs
// rises from clean to the change pressure with the loading (at most the fan's maximum pressure). The fan's curve is a
// straight line from (0, fanMaxPa) through the clean operating point (fanFlow, filterCleanPa): at that pressure it moves
// this share of fanFlow. The filter loads with the air it passes: filterLifeDays of fanFlow takes it to its change pressure.
// A room without these settings has no filter.
export const FILTER_DEFAULTS = { fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterLifeDays: 30 };
export const hasFilter = (p) => [p.fanMaxPa, p.filterCleanPa, p.filterFinalPa].every(Number.isFinite) && p.filterLifeDays > 0;

export function filterOf(params, Lf) {
  if (!hasFilter(params)) return { share: 1, pressurePa: 0 };
  const { fanMaxPa, filterCleanPa, filterFinalPa } = params;
  const pressurePa = Math.min(fanMaxPa, filterCleanPa + (filterFinalPa - filterCleanPa) * Lf);
  const span = fanMaxPa - filterCleanPa;
  return { share: span > 0 ? Math.max(0, (fanMaxPa - pressurePa) / span) : 1, pressurePa };
}

export const changeFilter = (state) => ({ ...state, Lf: 0 });

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function satW(T) {
  const es = 0.6108 * Math.exp((17.27 * T) / (T + 237.3)); // kPa
  return (2167 * es) / (T + 273.15);
}
export function rhOf(T, W) {
  return clamp((W / satW(T)) * 100, 0, 100);
}
export function wOf(T, RH) {
  return (satW(T) * RH) / 100;
}
// The dew point of air holding W g/m3 (inverts satW).
export function dewOf(W) {
  let lo = -60, hi = 80;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (satW(mid) < W) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
// Wet bulb temperature (Stull 2011, within 0.3 °C for RH 5 to 99 %).
export function wetBulb(T, RH) {
  const rh = clamp(RH, 5, 99);
  return T * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(T + rh) - Math.atan(rh - 1.676331)
    + 0.00391838 * rh ** 1.5 * Math.atan(0.023101 * rh) - 4.686035;
}

// Outdoor air at a time of day (s from midnight): the temperature follows a cosine from the night low at 03:00 to the
// day high at 15:00; the dew point stays the same all day (as on the Malaysian lowlands), so RH is high at night.
// sun: the share of the peak sun on the roof, a half sine from 07:00 to 19:00.
export function outdoorAt({ outdoorHigh, outdoorLow, outdoorDew }, clockS) {
  const h = (((clockS / 3600) % 24) + 24) % 24;
  const outdoorT = (outdoorHigh + outdoorLow) / 2 - ((outdoorHigh - outdoorLow) / 2) * Math.cos((2 * Math.PI * (h - 3)) / 24);
  const sun = h > 7 && h < 19 ? Math.sin((Math.PI * (h - 7)) / 12) : 0;
  return { outdoorT, outdoorRH: rhOf(outdoorT, satW(outdoorDew)), sun };
}

export function initialState(params) {
  const T = params.outdoorT, RH = clamp(params.outdoorRH, 0, 100);
  return { T, W: wOf(T, RH), CO2: CO2_OUT, Tm: T, Hs: RH, Lf: 0 };
}

// A state from before the mass and the surfaces: they start level with the air; from before the filter: a clean filter.
const full = (s) => ({
  T: s.T, W: s.W, CO2: s.CO2,
  Tm: Number.isFinite(s.Tm) ? s.Tm : s.T,
  Hs: Number.isFinite(s.Hs) ? s.Hs : rhOf(s.T, s.W),
  Lf: Number.isFinite(s.Lf) ? s.Lf : 0,
});

// share: the intake's share of fanFlow through its filter. With both fans the exhaust keeps pulling and the shortfall comes
// in through the leaks.
function exchangeOf(inputs, params, share = 1) {
  const leak = LEAK_PER_H * params.volume;
  if (inputs.intake && inputs.exhaust) return Math.max(leak, (params.fanFlow * (1 + share)) / 2);
  if (inputs.intake) return Math.max(leak, SINGLE_FAN * params.fanFlow * share);
  if (inputs.exhaust) return Math.max(leak, SINGLE_FAN * params.fanFlow);
  return leak;
}

// The filter now: its pressure while the intake runs, the air through it, and the air the exhaust pulls in through the leaks.
function filterNow(inputs, params, Lf) {
  const { share, pressurePa } = filterOf(params, Lf);
  const flow = params.fanFlow;
  return {
    share,
    filterPa: inputs.intake ? pressurePa : 0,
    throughM3h: inputs.intake ? (inputs.exhaust ? flow : SINGLE_FAN * flow) * share : 0,
    unfilteredM3h: inputs.intake && inputs.exhaust ? (flow * (1 - share)) / 2 : 0,
  };
}

// The intake motor's heat: more against a dirtier filter.
const intakeW = (filter, params) => INTAKE_W * fanWattFactor(filter.filterPa, params.filterCleanPa, params.fanMaxPa);

// The aircon now: total capacity P (kW) and its sensible share, or heat.
function acOf(ac, params, T, W) {
  const none = { coolKW: 0, shr: 1, heatKW: 0, capKW: 0 };
  if (!ac) return none;
  const RH = rhOf(T, W);
  const factor = clamp(1 + CAP_PER_WB * (wetBulb(T, RH) - 19) - CAP_PER_OUT * ((params.outdoorT ?? 35) - 35), 0.6, 1.2);
  if (ac.mode === 'cool' || ac.mode === 'dry') {
    const dry = ac.mode === 'dry';
    const adp = dry ? DRY_ADP : (ADP[ac.fan] ?? ADP.auto);
    let p = params.acKW * factor * clamp((T - ac.setpoint) / BAND, 0, 1);
    if (dry) p = Math.min(p, DRY_CAP * params.acKW);
    const sens = Math.max(0, AIR_CP * (T - adp));
    const lat = Math.max(0, W - satW(adp)) * LATENT;
    if (sens + lat <= 0) return none; // the room is at the coil's temperature: nothing to take out
    return { coolKW: p, shr: sens / (sens + lat), heatKW: 0, capKW: params.acKW * factor };
  }
  if (ac.mode === 'heat') return { coolKW: 0, shr: 1, heatKW: params.acKW * clamp((ac.setpoint - T) / BAND, 0, 1), capKW: params.acKW }; // rated output
  return none;
}

function substep(s, inputs, params, dt) {
  const { volume, outdoorT, outdoorRH, blocks, co2PerBlock, wallUA } = params;
  const capAir = volume * AIR_CP * AIR_CONTENTS;                        // kJ/K
  const capMass = volume * MASS_KJ_PER_M3 + blocks * BLOCK_KJ;          // kJ/K
  const uaMass = (volume * SURFACE_W_PER_M3 + blocks * BLOCK_SURFACE_W) / 1000; // kW/K
  const outW = wOf(outdoorT, outdoorRH);
  let { T, W, CO2, Tm, Hs, Lf } = s;

  const filter = filterNow(inputs, params, Lf);
  const exchangeM3h = exchangeOf(inputs, params, filter.share);

  // Humidifier: evaporation stops at saturation, counting the cooling it causes (a cooler air holds less); its motor
  // and driver warm the air.
  const humOn = inputs.humidifier ? params.humidifierGH : 0;
  const slope = (satW(T) - satW(T - 0.1)) / 0.1;
  const humMax = Math.max(0, (satW(T) - W) * volume) / (1 + (LATENT * volume * slope) / capAir);
  const humG = Math.min((humOn / 3600) * dt, humMax);

  // Blocks: CO2, heat into the mass, water that evaporates less as the air gets wetter.
  const dryness = clamp((100 - rhOf(T, W)) / 10, 0, 3);
  const blockG = ((blocks * BLOCK_GH * dryness) / 3600) * dt;
  const blocksKJ = blocks * co2PerBlock * RESP_KJ_PER_ML * (dt / 3600) - blockG * LATENT;

  const sunKW = ((params.sunW ?? 0) * (params.sun ?? 0)) / 1000;
  const machineKW = ((inputs.circulation ? CIRC_W : 0) + (inputs.intake ? intakeW(filter, params) : 0)
    + (inputs.humidifier ? (HUMIDIFIER_W_PER_LH * humOn) / 1000 : 0)) / 1000;

  T += (-humG * LATENT + (sunKW + machineKW) * dt) / capAir;
  Tm += blocksKJ / capMass;
  W = Math.max(0, W + (blockG + humG) / volume);
  CO2 += ((blocks * co2PerBlock) / 1e6 / 3600 / volume) * 1e6 * dt;

  // Air and mass toward each other (exact for two capacities), then walls and exchange toward outdoor, never past.
  const m = 1 - Math.exp(-uaMass * dt * (1 / capAir + 1 / capMass));
  const flow = ((Tm - T) * m) / (1 / capAir + 1 / capMass); // kJ from the mass to the air
  T += flow / capAir;
  Tm -= flow / capMass;
  T += (outdoorT - T) * Math.min(1, ((wallUA / 1000) * dt) / capAir);
  T += (outdoorT - T) * Math.min(1, ((exchangeM3h * AIR_CP) / 3600) * dt / capAir);
  const k = Math.min(1, (exchangeM3h / 3600 / volume) * dt);
  W += (outW - W) * k;
  CO2 += (CO2_OUT - CO2) * k;

  // Aircon, after every other heat flow of the step: only the sensible part lowers T, never past the setpoint (so the
  // room settles at the setpoint whatever the step length); the latent part is scaled the same.
  const ac = acOf(inputs.ac, params, T, W); // its output from the air as the other flows left it
  let sensKJ = ac.coolKW * ac.shr * dt, dryG = (ac.coolKW * (1 - ac.shr) * dt) / LATENT, heatKJ = ac.heatKW * dt;
  if (sensKJ > 0) {
    const f = Math.min(1, Math.max(0, (T - inputs.ac.setpoint) * capAir) / sensKJ);
    sensKJ *= f; dryG *= f;
  }
  dryG = Math.min(dryG, Math.max(0, W * volume)); // never more water than the air holds
  if (heatKJ > 0) heatKJ = Math.min(heatKJ, Math.max(0, (inputs.ac.setpoint - T) * capAir));
  T += (heatKJ - sensKJ) / capAir;
  W = Math.max(0, W - dryG / volume);

  // Surfaces: air RH and surface RH move toward their weighted level; water taken up gives its heat to the air.
  const airPerPct = (satW(T) * volume) / 100, surfPerPct = SURFACE_G_PER_PCT(volume);
  const rh = W / satW(T) * 100;
  const level = (rh * airPerPct + Hs * surfPerPct) / (airPerPct + surfPerPct);
  let toSurfaceG = (rh - level) * Math.min(1, dt / MOIST_TAU) * airPerPct;
  toSurfaceG = Math.max(toSurfaceG, -(Hs * surfPerPct)); // never more than the surfaces hold
  W -= toSurfaceG / volume;
  Hs += toSurfaceG / surfPerPct;
  T += (toSurfaceG * LATENT) / capAir;

  // Condensation: the excess water goes onto the surfaces and its heat into the air (which lets the air hold more).
  let condensedG = 0;
  for (let i = 0; i < 3; i++) {
    const excess = W - satW(T);
    if (excess <= 0) break;
    const g = (excess * volume) / (1 + (LATENT * volume * (satW(T + 0.1) - satW(T))) / 0.1 / capAir);
    W -= g / volume;
    T += (g * LATENT) / capAir;
    Hs += g / SURFACE_G_PER_PCT(volume);
    condensedG += g;
  }
  W = clamp(W, 0, satW(T));
  Hs = clamp(Hs, 0, HS_MAX); // water beyond it runs off

  // Dehumidifier: water out (never below its coil's dew point), its power and the condensation heat into the air.
  const dehumOn = inputs.dehumidifier && (params.dehumidifierLday ?? 0) > 0;
  let dehumG = 0;
  if (dehumOn) {
    dehumG = Math.min((params.dehumidifierLday * 1000 / 86400) * dehumShare(W) * dt, Math.max(0, (W - satW(DEHUM_COIL)) * volume));
    W -= dehumG / volume;
    T += ((params.dehumidifierW ?? 0) / 1000 * dt + dehumG * LATENT) / capAir;
  }

  if (hasFilter(params) && params.fanFlow > 0) Lf += (filter.throughM3h * dt) / 3600 / (params.filterLifeDays * 24 * params.fanFlow);

  const act = {
    exchangeM3h,
    acCoolKW: sensKJ / dt,
    acLatentKW: (dryG * LATENT) / dt,
    acHeatKW: heatKJ / dt,
    // The share (0 to 1) of its present capacity the aircon delivered: heat or cold, after the setpoint limit.
    acLoad: ac.capKW > 0 ? clamp((sensKJ / dt + (dryG * LATENT) / dt + heatKJ / dt) / ac.capKW, 0, 1) : 0,
    humidifierGH: (humG / dt) * 3600,
    blocksKW: blocksKJ / dt,
    sunKW,
    machineKW,
    surfaceGH: ((toSurfaceG + condensedG) / dt) * 3600, // + taken up by the surfaces, − given back
    condensedGH: (condensedG / dt) * 3600,
    dehumidifierGH: (dehumG / dt) * 3600,
    dehumidifierKW: dehumOn ? (params.dehumidifierW ?? 0) / 1000 : 0,
    filterPa: filter.filterPa,
    intakeShare: filter.share,
    unfilteredM3h: filter.unfilteredM3h,
    filterLoad: Lf,
  };
  return { state: { T, W, CO2: Math.max(0, CO2), Tm, Hs: Math.max(0, Hs), Lf }, act };
}

export function step(state, inputs, params, dt) {
  let s = full(state);
  if (!(dt > 0)) return { state: s, acting: nominal(inputs, params, s) };
  const n = Math.max(1, Math.ceil(dt / SUB - 1e-9));
  const h = dt / n;
  let act;
  for (let i = 0; i < n; i++) {
    const out = substep(s, inputs, params, h);
    s = out.state;
    act = out.act;
  }
  return { state: s, acting: act };
}

// dt = 0: nothing happened, report the unlimited rates
function nominal(inputs, params, s) {
  const ac = acOf(inputs.ac, params, s.T, s.W);
  const humOn = inputs.humidifier ? params.humidifierGH : 0;
  const dryness = clamp((100 - rhOf(s.T, s.W)) / 10, 0, 3);
  const filter = filterNow(inputs, params, s.Lf);
  return {
    exchangeM3h: exchangeOf(inputs, params, filter.share),
    acCoolKW: ac.coolKW * ac.shr,
    acLatentKW: ac.coolKW * (1 - ac.shr),
    acHeatKW: ac.heatKW,
    acLoad: ac.capKW > 0 ? clamp((ac.coolKW + ac.heatKW) / ac.capKW, 0, 1) : 0,
    humidifierGH: humOn,
    blocksKW: (params.blocks * (params.co2PerBlock * RESP_KJ_PER_ML - BLOCK_GH * dryness * LATENT)) / 3600,
    sunKW: ((params.sunW ?? 0) * (params.sun ?? 0)) / 1000,
    machineKW: ((inputs.circulation ? CIRC_W : 0) + (inputs.intake ? intakeW(filter, params) : 0) + (inputs.humidifier ? (HUMIDIFIER_W_PER_LH * humOn) / 1000 : 0)) / 1000,
    surfaceGH: 0,
    condensedGH: 0,
    dehumidifierGH: inputs.dehumidifier && (params.dehumidifierLday ?? 0) > 0 ? (params.dehumidifierLday * 1000 / 24) * dehumShare(s.W) : 0,
    dehumidifierKW: inputs.dehumidifier && (params.dehumidifierLday ?? 0) > 0 ? (params.dehumidifierW ?? 0) / 1000 : 0,
    filterPa: filter.filterPa,
    intakeShare: filter.share,
    unfilteredM3h: filter.unfilteredM3h,
    filterLoad: s.Lf,
  };
}
