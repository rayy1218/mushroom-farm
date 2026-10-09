// Runs the controller with the simulation adapter, without a browser (the same runtime as the page).
// On a farm device, a hardware adapter replaces the simulation adapter.
//   node tools/run-headless.js [--days 2] [--settings file.json]
const fs = require('node:fs'), path = require('node:path');
const D = path.join(__dirname, '..');
require(path.join(D, 'sim.js')); require(path.join(D, 'air.js')); require(path.join(D, 'controller.js')); require(path.join(D, 'runtime.js'));
const SIM = globalThis.ClimateSim, CC = globalThis.ClimateController, RT = globalThis.ClimateRuntime;

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const days = +arg('days', 2);
const cfg = CC.defaultSettings();
const file = arg('settings');
if (file) {
  const { settings, warnings } = CC.importSettings(fs.readFileSync(file, 'utf8'));
  CC.applySettings(cfg, settings);
  for (const w of warnings) console.warn('settings:', w);
}
const env = structuredClone(SIM.DEFAULT_ENV);
const sim = SIM.create(env), io = RT.simIO(sim);
const alarms = [];
const ctl = CC.create(cfg, null, e => { if (/^Alarm/.test(e.text)) alarms.push(e); });
let day = { n: 0, inT: 0, inRH: 0 };
const rt = RT.createRuntime({ io, ctl, onReading: () => {
  const v = sim.view(); day.n++;
  if (Math.abs(v.T - cfg.spT) <= CC.BANDS.T) day.inT++;
  if (Math.abs(v.RH - ctl.state.rhT) <= CC.BANDS.RH) day.inRH++;
} });
rt.poll();
let kwh0 = 0;
console.log(`${CC.CROPS[cfg.crop].name}, ${CC.STAGES[cfg.stage]}, ${days} day(s)`);
for (let d = 1; d <= days; d++) {
  for (let s = 0; s < 86400; s++) { io.advance(1); rt.poll(); }
  const r = rt.reading, kwh = Object.values(r.kwh).reduce((a, b) => a + b, 0);
  console.log(`day ${d}: temperature in band ${(day.inT / day.n * 100).toFixed(0)} %, humidity in band ${(day.inRH / day.n * 100).toFixed(0)} %, `
    + `${(kwh - kwh0).toFixed(2)} kWh, alarms ${alarms.length}`);
  kwh0 = kwh; day = { n: 0, inT: 0, inRH: 0 }; alarms.length = 0;
}
