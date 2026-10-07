// Makes the test vectors in tests/vectors/: recorded readings and the commands of the JS controller.
// A port (Rust, C++) must give the same commands for the same readings. Run again after an intended
// change of the controller: node tools/make-vectors.js
const fs = require('node:fs'), path = require('node:path');
const D = path.join(__dirname, '..');
require(path.join(D, 'sim.js')); require(path.join(D, 'controller.js')); require(path.join(D, 'runtime.js'));
const SIM = globalThis.ClimateSim, CC = globalThis.ClimateController, RT = globalThis.ClimateRuntime;

const READ_KEYS = ['seq', 't', 'hour', 'T', 'RH', 'CO2', 'tOut', 'rhOut', 'core', 'T2', 'RH2', 'CO2b'];
const round = x => (x == null ? x : Math.round(x * 1e4) / 1e4);
// Compact command: [acPower, acMode, acSetpoint, acFan, fogLevel, fanLevel, lights, circ]
const packCmd = c => [c.ac.power ? 1 : 0, c.ac.mode, c.ac.setpoint, c.ac.fan, c.hu.level, c.fan.level, c.lights.on ? 1 : 0, c.circ.on ? 1 : 0];

function record(name, description, { hours = 6, env = {}, cfg: cfgOver = {}, events = [] }) {
  const e = { ...structuredClone(SIM.DEFAULT_ENV), ...env };
  const cfg = CC.defaultSettings(); Object.assign(cfg, cfgOver);
  if (cfgOver.applyProfile) { delete cfg.applyProfile; CC.applyProfile(cfg); }
  const settings = structuredClone(cfg);
  const sim = SIM.create(e), ctl = CC.create(cfg, null, null);
  const simIo = RT.simIO(sim);
  // The controller sees the rounded reading, the same as the file.
  const io = { read: () => { const r = simIo.read(); const o = {}; for (const k of READ_KEYS) if (r[k] !== undefined) o[k] = round(r[k]); return o; }, write: simIo.write };
  const steps = [], actions = [];
  const rt = RT.createRuntime({ io, ctl, onReading: (r, c) => steps.push({ r, c: packCmd(c) }) });
  rt.poll();
  for (let s = 1; s <= hours * 3600; s++) {
    for (const ev of events) if (ev.at === s) {
      if (ev.faults) Object.assign(e.faults, ev.faults);
      if (ev.call) { ctl[ev.call](...ev.args, s); actions.push({ beforeStep: steps.length, call: ev.call, args: ev.args, t: s }); }
    }
    simIo.advance(1); rt.poll();
  }
  const file = { format: 'mushroom-climate-vectors', version: 1, name, description, controller: 'controller.js', settings,
    cmdFields: ['acPower', 'acMode', 'acSetpoint', 'acFan', 'fogLevel', 'fanLevel', 'lights', 'circ'], actions, steps };
  fs.writeFileSync(path.join(D, 'tests/vectors', `${name}.json`), JSON.stringify(file));
  console.log(`${name}: ${steps.length} steps, ${(JSON.stringify(file).length / 1024).toFixed(0)} KB`);
}

record('tropical-fruiting', 'Grey oyster fruiting, tropical day 06:00-12:00, harvest window at 08:00.', {});
record('co2-sensor-missing', 'The CO2 sensor stops after 1 h: timed purge from the setting (not enough history).', { events: [{ at: 3600, faults: { CO2: 'missing' } }] });
record('spikes', 'Spikes on all sensors after 1 h.', { events: [{ at: 3600, faults: { T: 'spike', RH: 'spike', CO2: 'spike', out: 'spike' } }] });
record('dry-weather', 'Dry outdoor air and 4000 blocks: humidity first and the CO2 safety level.', { env: { nightRH: 55, blocks: 4000 } });
record('two-sensor-sets', 'A second sensor set low in the room; the main RH sensor stops after 1 h.', { env: { sensor2At: 'low' }, events: [{ at: 3600, faults: { RH: 'missing' } }] });
record('stage-changes', 'Black oyster: fruiting, then pinning after 1 h, ramps.', { cfg: { crop: 'black', stage: 'fruiting', applyProfile: true }, events: [{ at: 3600, call: 'setStage', args: ['pinning'] }] });
record('cold-weather', 'Cold outdoor air (14 °C, no day cycle): the AC changes to heat mode.', { env: { dailyCycle: false, tFixed: 14, nightRH: 90 } });
record('crowded-dry', 'Dry air and 6000 blocks for 12 h, humidity action "reduce to Low", fan level High: reduced purges and the CO2 safety level.',
  { hours: 12, env: { nightRH: 50, blocks: 6000 }, cfg: { rules: { ...CC.defaultRules(1000), rhAction: 'low', fanLevel: 3 } } });
