// Runs the simulation and the controller together, without a browser (the same loop as app.js).
require('../sim.js');
require('../controller.js');
require('../runtime.js');
const SIM = globalThis.ClimateSim, CC = globalThis.ClimateController, RT = globalThis.ClimateRuntime;

// faults + faultAt: start sensor faults at that hour (so the controller has history before the fault).
function run({ hours = 48, measureFrom = 24, env = {}, rules = {}, protect = {}, cfg: cfgOver = {}, faults = null, faultAt = 0 } = {}) {
  const e = { ...structuredClone(SIM.DEFAULT_ENV), ...env };
  const cfg = CC.defaultSettings();
  Object.assign(cfg, cfgOver);
  Object.assign(cfg.rules, rules);
  Object.assign(cfg.protect, protect);
  const sim = SIM.create(e);
  const ctl = CC.create(cfg, null, null);
  const io = RT.simIO(sim);
  let r = null, base = null, n = 0, inT = 0, inRH = 0, over = 0, rhLow = 0;
  const rt = RT.createRuntime({ io, ctl, onReading: x => { r = x; measure(); } });
  function measure() {
    if (r.t < measureFrom * 3600) return;
    const room = sim.view();   // score the real room, not the sensors
    if (!base) base = { kwh: { ...r.kwh }, stats: { ...ctl.state.stats }, acStarts: sim.view().acStarts, t: r.t };
    n++;
    if (Math.abs(room.T - cfg.spT) <= CC.BANDS.T) inT++;
    if (Math.abs(room.RH - cfg.spRH) <= CC.BANDS.RH) inRH++;
    if (room.CO2 > cfg.co2Lim) over++;
    if (room.RH < cfg.spRH - CC.BANDS.RHAlarm) rhLow++;
  }
  rt.poll();
  for (let s = 0; s < hours * 3600; s++) {
    if (faults && s === faultAt * 3600) Object.assign(e.faults, faults);
    io.advance(1);
    rt.poll();
  }
  const days = (r.t - base.t) / 86400, s1 = ctl.state.stats, k = x => (r.kwh[x] - base.kwh[x]) / days;
  return {
    kwhDay: k('ac') + k('hu') + k('fan'), acKwh: k('ac'), fogKwh: k('hu'), fanKwh: k('fan'),
    fanH: (s1.fanOnS - base.stats.fanOnS) / 3600 / days,
    fanStarts: (s1.fanStarts - base.stats.fanStarts) / days,
    acStarts: (sim.view().acStarts - base.acStarts) / days,
    acCmds: (s1.acCmds - base.stats.acCmds) / days,
    inT: inT / n * 100, inRH: inRH / n * 100, overMin: over / n * 1440, rhLowMin: rhLow / n * 1440,
    ctl, sim,
  };
}
module.exports = { run, SIM, CC };
