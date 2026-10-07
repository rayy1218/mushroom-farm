/*
 * runtime.js: connects an I/O adapter to the controller.
 *
 * The same loop runs in the browser (simulation adapter) and later on a device (hardware adapter).
 * An adapter has two functions (see docs/contract.md):
 *   io.read()     -> the last sensor reading { seq, t, hour, T, RH, CO2, tOut, rhOut, ... }
 *                    (seq changes when a new reading is available)
 *   io.write(cmd) -> send the commands { ac, hu, fan, lights, circ } to the machines
 *
 * The controller acts only on a new reading. Between readings the machines keep the last command.
 */
(function (global) {
  'use strict';

  // skipCurrent: the controller has already used the present reading (for example a copy for a test run).
  function createRuntime({ io, ctl, onReading, skipCurrent = false }) {
    let lastSeq = skipCurrent ? io.read().seq : -1, cmd = null, reading = null;
    // Check for a new reading. If there is one, the controller decides and the commands go out.
    function poll() {
      const r = io.read();
      if (!r || r.seq === lastSeq) return false;
      lastSeq = r.seq; reading = r;
      cmd = ctl.update(r);
      io.write(cmd);
      if (onReading) onReading(r, cmd);
      return true;
    }
    return { poll, get reading() { return reading; }, get cmd() { return cmd; } };
  }

  // Simulation adapter: the simulation takes the place of the hardware. advance(dt) moves the
  // simulated time with the last command.
  function simIO(sim) {
    let cmd = null;
    return {
      read: () => sim.read(),
      write: c => { cmd = c; },
      advance: dt => { if (cmd) sim.step(dt, cmd); },
      sim,
    };
  }

  global.ClimateRuntime = { createRuntime, simIO };
})(typeof window !== 'undefined' ? window : globalThis);
