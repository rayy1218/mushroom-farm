// Pure single-zone climate model for the device app simulation (spec 2026-10-19 section 3).
// No I/O, no clock. State { T, W, CO2 }: degC, g/m3 water, ppm.

const SUB = 5;                 // max sub-step, seconds
const WALL_TAU = 3600;         // s
const LEAK_PER_H = 0.02;       // vol/h
const CO2_OUT = 420;
const LATENT = 2.45;           // kJ per g evaporated
const HEAT_CAP_PER_M3 = 1.2 * 10; // kJ/(m3 K), air plus contents
const BLOCK_W = 1, BLOCK_GH = 2, BLOCK_CO2_LH = 0.3;
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
export function initialState(params) {
  return { T: params.outdoorT, W: wOf(params.outdoorT, params.outdoorRH), CO2: CO2_OUT };
}

function rates(inputs, params, T) {
  const { volume, blocks, fanFlow, acKW, humidifierGH } = params;
  let exchangeM3h;
  if (inputs.intake && inputs.exhaust) exchangeM3h = fanFlow;
  else if (inputs.intake || inputs.exhaust) exchangeM3h = 0.5 * fanFlow;
  else exchangeM3h = LEAK_PER_H * volume;
  let coolKW = 0, heatKW = 0, dryWaterGs = 0;
  const ac = inputs.ac;
  if (ac) {
    if (ac.mode === 'cool' || ac.mode === 'dry') {
      let p = acKW * clamp(T - ac.setpoint, 0, 1);
      let f = WATER_FRACTION[ac.fan] ?? WATER_FRACTION.auto;
      if (ac.mode === 'dry') { p = Math.min(p, DRY_CAP * acKW); f = DRY_FRACTION; }
      coolKW = p;
      dryWaterGs = (p * f) / LATENT;
    } else if (ac.mode === 'heat') {
      heatKW = acKW * clamp(ac.setpoint - T, 0, 1);
    }
  }
  return {
    exchangeM3h, coolKW, heatKW, dryWaterGs,
    humGH: inputs.humidifier ? humidifierGH : 0,
    blocksKW: (blocks * BLOCK_W) / 1000,
  };
}

function substep(s, inputs, params, dt) {
  const { volume, outdoorT, outdoorRH, blocks } = params;
  const r = rates(inputs, params, s.T);
  const cap = volume * HEAT_CAP_PER_M3;                 // kJ/K
  const outW = wOf(outdoorT, outdoorRH);
  const k = Math.min(1, (r.exchangeM3h / 3600 / volume) * dt); // fraction replaced this step
  const wall = Math.min(1, dt / WALL_TAU);

  let T = s.T, W = s.W, CO2 = s.CO2;

  // AC never pushes T past its setpoint within one step
  let coolKJ = r.coolKW * dt, dryG = r.dryWaterGs * dt, heatKJ = r.heatKW * dt;
  if (inputs.ac) {
    if (coolKJ > 0) {
      const f = Math.min(1, Math.max(0, (T - inputs.ac.setpoint) * cap) / coolKJ);
      coolKJ *= f; dryG *= f;
    }
    if (heatKJ > 0) heatKJ = Math.min(heatKJ, Math.max(0, (inputs.ac.setpoint - T) * cap));
  }
  // evaporation stops at saturation (also bounds the evaporative cooling)
  const humG = Math.min((r.humGH / 3600) * dt, Math.max(0, (satW(T) - W) * volume));
  const netKJ = r.blocksKW * dt + heatKJ - coolKJ - humG * LATENT;
  const waterG = ((blocks * BLOCK_GH) / 3600) * dt + humG - dryG;

  T += netKJ / cap;
  W = Math.max(0, W + waterG / volume);
  CO2 += ((blocks * BLOCK_CO2_LH) / 1000 / 3600 / volume) * 1e6 * dt;

  // walls and exchange: move toward the target, never past it
  T += (outdoorT - T) * wall;
  T += (outdoorT - T) * k;
  W += (outW - W) * k;
  CO2 += (CO2_OUT - CO2) * k;

  W = clamp(W, 0, satW(T)); // excess condenses
  return { state: { T, W, CO2: Math.max(0, CO2) }, r };
}

export function step(state, inputs, params, dt) {
  const n = Math.max(1, Math.ceil(dt / SUB - 1e-9));
  const h = dt / n;
  let s = { T: state.T, W: state.W, CO2: state.CO2 };
  let r = rates(inputs, params, s.T);
  if (!(dt > 0)) return { state: s, acting: acting(r) };
  for (let i = 0; i < n; i++) {
    const out = substep(s, inputs, params, h);
    s = out.state;
    r = out.r;
  }
  return { state: s, acting: acting(r) };
}

function acting(r) {
  return {
    exchangeM3h: r.exchangeM3h,
    acCoolKW: r.coolKW,
    acHeatKW: r.heatKW,
    humidifierGH: r.humGH,
    blocksKW: r.blocksKW,
  };
}
