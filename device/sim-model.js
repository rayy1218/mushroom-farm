// Pure single-zone climate model for the device app simulation (spec 2026-10-19 section 3).
// No I/O, no clock. State { T, W, CO2 }: degC, g/m3 water, ppm.

const SUB = 5;                 // max sub-step, seconds
const LEAK_PER_H = 0.3;        // vol/h
const CO2_OUT = 420;
const LATENT = 2.45;           // kJ per g evaporated
const HEAT_CAP_PER_M3 = 1.2 * 10; // kJ/(m3 K), air plus contents
// A fruiting block (1 to 1.2 kg): water in g/h (respiration plus evaporation from the block and its mushrooms);
// its heat comes from the CO2 it makes (glucose oxidation, 467 kJ per mol CO2 at 24.5 L/mol) less that evaporation.
const BLOCK_GH = 0.3;
const RESP_KJ_PER_ML = 467 / 24.5 / 1000;
const COIL_T = 12;             // degC, AC coil: no condensation once the air's dew point is below it
const BAND = 0.5;              // K, proportional band of the AC
const WATER_FRACTION = { low: 0.35, auto: 0.25, high: 0.15 };
const DRY_FRACTION = 0.6, DRY_CAP = 0.4;

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

// Outdoor air at a time of day (s from midnight): the temperature follows a cosine from the night low at 03:00 to the
// day high at 15:00; the dew point stays the same all day (as on the Malaysian lowlands), so RH is high at night.
export function outdoorAt({ outdoorHigh, outdoorLow, outdoorDew }, clockS) {
  const h = (((clockS / 3600) % 24) + 24) % 24;
  const outdoorT = (outdoorHigh + outdoorLow) / 2 - ((outdoorHigh - outdoorLow) / 2) * Math.cos((2 * Math.PI * (h - 3)) / 24);
  return { outdoorT, outdoorRH: rhOf(outdoorT, satW(outdoorDew)) };
}

export function initialState(params) {
  return { T: params.outdoorT, W: wOf(params.outdoorT, params.outdoorRH), CO2: CO2_OUT };
}

function rates(inputs, params, T, W) {
  const { volume, blocks, fanFlow, acKW, humidifierGH } = params;
  let exchangeM3h;
  if (inputs.intake && inputs.exhaust) exchangeM3h = fanFlow;
  else if (inputs.intake || inputs.exhaust) exchangeM3h = 0.5 * fanFlow;
  else exchangeM3h = LEAK_PER_H * volume;
  let coolKW = 0, heatKW = 0, dryWaterGs = 0; // coolKW: total capacity P (sensible + latent)
  const ac = inputs.ac;
  if (ac) {
    if (ac.mode === 'cool' || ac.mode === 'dry') {
      let p = acKW * clamp((T - ac.setpoint) / BAND, 0, 1);
      let f = WATER_FRACTION[ac.fan] ?? WATER_FRACTION.auto;
      if (ac.mode === 'dry') { p = Math.min(p, DRY_CAP * acKW); f = DRY_FRACTION; }
      const wc = satW(COIL_T), span = satW(T) - wc;
      const wet = span > 0 ? clamp((W - wc) / span, 0, 1) : 0;
      coolKW = p;
      dryWaterGs = (p * f * wet) / LATENT;
    } else if (ac.mode === 'heat') {
      heatKW = acKW * clamp((ac.setpoint - T) / BAND, 0, 1);
    }
  }
  return {
    exchangeM3h, coolKW, heatKW, dryWaterGs,
    humGH: inputs.humidifier ? humidifierGH : 0,
    blocksKW: (blocks * (params.co2PerBlock * RESP_KJ_PER_ML - BLOCK_GH * LATENT)) / 3600,
  };
}

function substep(s, inputs, params, dt) {
  const { volume, outdoorT, outdoorRH, blocks, co2PerBlock, wallUA } = params;
  const r = rates(inputs, params, s.T, s.W);
  const cap = volume * HEAT_CAP_PER_M3;                 // kJ/K
  const outW = wOf(outdoorT, outdoorRH);
  const k = Math.min(1, (r.exchangeM3h / 3600 / volume) * dt); // fraction replaced this step
  const kT = Math.min(1, (r.exchangeM3h * 1.2 / 3600) * dt / cap); // heat moved by exchange (cap is 10x the air)
  const wall = Math.min(1, ((wallUA / 1000) * dt) / cap); // walls and roof: wallUA in W/K

  let T = s.T, W = s.W, CO2 = s.CO2;

  // AC: temperature drop uses the sensible part P - latent; never pushes T past the setpoint in one step
  let sensKJ = Math.max(0, r.coolKW * dt - r.dryWaterGs * dt * LATENT), dryG = r.dryWaterGs * dt, heatKJ = r.heatKW * dt;
  if (inputs.ac) {
    if (sensKJ > 0) {
      const f = Math.min(1, Math.max(0, (T - inputs.ac.setpoint) * cap) / sensKJ);
      sensKJ *= f; dryG *= f;
    }
    if (heatKJ > 0) heatKJ = Math.min(heatKJ, Math.max(0, (inputs.ac.setpoint - T) * cap));
  }
  // evaporation stops at saturation (also bounds the evaporative cooling)
  const humG = Math.min((r.humGH / 3600) * dt, Math.max(0, (satW(T) - W) * volume));
  const netKJ = r.blocksKW * dt + heatKJ - sensKJ - humG * LATENT;
  const waterG = ((blocks * BLOCK_GH) / 3600) * dt + humG - dryG;

  T += netKJ / cap;
  W = Math.max(0, W + waterG / volume);
  CO2 += ((blocks * co2PerBlock) / 1e6 / 3600 / volume) * 1e6 * dt;

  // walls and exchange: move toward the target, never past it
  T += (outdoorT - T) * wall;
  T += (outdoorT - T) * kT;
  W += (outW - W) * k;
  CO2 += (CO2_OUT - CO2) * k;

  W = clamp(W, 0, satW(T)); // excess condenses
  const act = {
    exchangeM3h: r.exchangeM3h,
    acCoolKW: sensKJ / dt,
    acLatentKW: (dryG * LATENT) / dt,
    acHeatKW: heatKJ / dt,
    humidifierGH: (humG / dt) * 3600,
    blocksKW: r.blocksKW,
  };
  return { state: { T, W, CO2: Math.max(0, CO2) }, act };
}

export function step(state, inputs, params, dt) {
  const n = Math.max(1, Math.ceil(dt / SUB - 1e-9));
  const h = dt / n;
  let s = { T: state.T, W: state.W, CO2: state.CO2 };
  if (!(dt > 0)) return { state: s, acting: nominal(rates(inputs, params, s.T, s.W)) };
  let act;
  for (let i = 0; i < n; i++) {
    const out = substep(s, inputs, params, h);
    s = out.state;
    act = out.act;
  }
  return { state: s, acting: act };
}

// dt = 0: nothing happened, report the unlimited rates
function nominal(r) {
  const latent = r.dryWaterGs * LATENT;
  return {
    exchangeM3h: r.exchangeM3h,
    acCoolKW: Math.max(0, r.coolKW - latent),
    acLatentKW: latent,
    acHeatKW: r.heatKW,
    humidifierGH: r.humGH,
    blocksKW: r.blocksKW,
  };
}
