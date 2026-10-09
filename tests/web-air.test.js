// web/simulator.js: airText, the air exchange texts of the status card, the glance panel and the ladder (C9 section 7).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js');
require('../air.js');
require('../controller.js');
require('../runtime.js');
require('../calib.js');
require('../capacity.js');
require('../room-rules.js');
require('../web/ui.js');
require('../web/api.js');
require('../web/charts.js');
require('../web/settings-panel.js');
require('../web/shell.js');
const { airText } = require('../web/simulator.js');
const SIM = globalThis.ClimateSim, CC = globalThis.ClimateController, RT = globalThis.ClimateRuntime;

// The controller state of C9 5.3 (st.air), 5.1 (st.cmd.air) and 5.7 (st.airReason), built by hand: at the stream's
// base the controller still has the old shape.
function stOf(air = {}, on = false, airReason = on ? 'purge' : null) {
  return {
    air: { state: 'idle', since: null, purgeStart: null, capRun: 0, nextPurgeS: null, delayed: false, timed: false, sizeText: null, ...air },
    cmd: { air: { on } },
    airReason,
  };
}
const rules = { fanOn: 900, fanOff: 700, purgeMaxS: 180 };
const run = (reason, start) => ({ start, end: null, reason, co2Start: 950, co2End: null, m3: 0, capped: false });
const IDLE = { lvl: 'none', icon: '○', text: 'Idle' };
const MANUAL = { auto: false, on: false };

test('airText: idle, with and without a predicted purge', () => {
  assert.deepEqual(airText({ st: stOf(), cur: null, rules, t: 100 }), { state: 'Idle', glance: 'Idle', chip: IDLE });
  assert.deepEqual(airText({ st: stOf({ nextPurgeS: 600 }), cur: null, rules, t: 100 }),
    { state: 'Idle · purge in about 10 min', glance: 'Next purge in about 10 min', chip: IDLE });
  assert.deepEqual(airText({ st: stOf({ state: 'after' }), cur: null, rules, t: 100 }), { state: 'Idle', glance: 'Idle', chip: IDLE });
});

test('airText: the next purge is rounded to whole minutes, at least 1', () => {
  assert.deepEqual(airText({ st: stOf({ nextPurgeS: 150 }), cur: null, rules, t: 100 }),
    { state: 'Idle · purge in about 3 min', glance: 'Next purge in about 3 min', chip: IDLE });
  assert.deepEqual(airText({ st: stOf({ nextPurgeS: 20 }), cur: null, rules, t: 100 }),
    { state: 'Idle · purge in about 1 min', glance: 'Next purge in about 1 min', chip: IDLE });
});

test('airText: a CO₂ purge shows its time and the cap', () => {
  const st = stOf({ state: 'purge', purgeStart: 1000 }, true);
  assert.deepEqual(airText({ st, cur: run('purge', 1000), rules, t: 1045 }),
    { state: 'Purge 0:45 of 3:00', glance: 'Purging 0:45', chip: { lvl: 'info', icon: '▲', text: 'Purging' } });
  assert.equal(airText({ st, cur: run('purge', 1000), rules: { ...rules, purgeMaxS: 240 }, t: 1125 }).state, 'Purge 2:05 of 4:00');
});

test('airText: humidity first delays the purge', () => {
  assert.deepEqual(airText({ st: stOf({ delayed: true, nextPurgeS: 0 }), cur: null, rules, t: 100 }),
    { state: 'Delayed (humidity first)', glance: 'Delayed (humidity first)', chip: { lvl: 'info', icon: '❚❚', text: 'Delayed' } });
});

test('airText: Manual and Off', () => {
  assert.deepEqual(airText({ st: stOf({ nextPurgeS: 120 }), cur: null, rules, manual: MANUAL, t: 100 }),
    { state: 'Manual off', glance: 'Manual off', chip: { lvl: 'none', icon: '○', text: 'Manual off' } });
  assert.equal(airText({ st: stOf({}, true, 'manual'), cur: run('manual', 1000), rules, manual: { auto: false, on: true }, t: 1010 }).state, 'Manual on');
});

test('airText: runs that are not CO₂ purges', () => {
  const cases = [['timed', 'Timed purge'], ['free cooling', 'Free cooling'], ['drying', 'Drying'], ['manual', 'Manual on']];
  for (const [reason, text] of cases) {
    assert.deepEqual(airText({ st: stOf({}, true, reason), cur: run(reason, 1000), rules, t: 1090 }),
      { state: text, glance: text, chip: { lvl: 'info', icon: '●', text } }, reason);
  }
});

test('airText: a safety run, also one that began as a purge (C9 5.7 airReason)', () => {
  const want = { state: 'Safety run', glance: 'Safety run', chip: { lvl: 'serious', icon: '◆', text: 'Safety run' } };
  assert.deepEqual(airText({ st: stOf({}, true, 'safety'), cur: run('safety', 1000), rules, t: 1090 }), want);
  assert.deepEqual(airText({ st: stOf({ state: 'purge', purgeStart: 1000 }, true, 'safety'), cur: run('purge', 1000), rules, t: 1400 }), want);
});

// Runs once the simulation and controller streams are merged (C9 4.2, 5.3, 5.7): the names airText reads exist on
// a real controller.
const C9 = !!(SIM.PLANT.air && CC.defaultSettings().manual.air);
test('airText on a real run: a purge reads "Purge m:ss of 3:00"', { skip: C9 ? false : 'needs the C9 simulation and controller (lead step 2)' }, () => {
  const env = structuredClone(SIM.DEFAULT_ENV); env.blocks = 6000;
  const cfg = CC.defaultSettings(); cfg.program.harvest.on = false;
  const sim = SIM.create(env), ctl = CC.create(cfg, null, null), io = RT.simIO(sim);
  let seen = null;
  const rt = RT.createRuntime({ io, ctl, onReading: r => {
    const cur = ctl.purges().cur;
    if (!seen && ctl.state.cmd.air.on && ctl.state.airReason === 'purge' && cur && r.t - cur.start >= 30) seen = airText({ st: ctl.state, cur, rules: cfg.rules, manual: cfg.manual.air, t: r.t });
  } });
  for (let i = 0; i < 4 * 3600 && !seen; i++) { io.advance(1); rt.poll(); }
  assert.ok(seen, 'no purge of 30 s or more in 4 h');
  assert.match(seen.state, /^Purge \d:\d{2} of 3:00$/);
  assert.match(seen.glance, /^Purging \d:\d{2}$/);
  assert.deepEqual(seen.chip, { lvl: 'info', icon: '▲', text: 'Purging' });
});
