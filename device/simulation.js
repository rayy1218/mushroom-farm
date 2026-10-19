// The simulation runner: every tick, each enabled simulated room reads what its linked machines really do
// on the device, steps the model, and writes the new values into its linked sensors.

import * as defaultModel from './sim-model.js';
import { BTU_PER_KW } from './sim-store.js';

const MODES = ['cool', 'heat', 'dry', 'fan'];
const FANS = ['auto', 'low', 'high'];
const OUTPUT = { intake: 0, exhaust: 1, humidifier: 3 }; // circulation (2) has no effect in a one-zone model
export const DEFAULT_TICK_MS = 1000;
export const PERSIST_MS = 10_000;

// The model works in kW and g/h; the room is set in BTU/h and L/h.
function modelParams({ acBTU, humidifierLH, ...rest }) {
  return { ...rest, acKW: acBTU / BTU_PER_KW, humidifierGH: humidifierLH * 1000 };
}

export function createSimulation({ sensors, sims, model = defaultModel, tickMs = DEFAULT_TICK_MS, now = Date.now } = {}) {
  let timer = null;
  let lastSaved = now();

  // The linked device if it is still there and still of the right kind.
  const device = (address, kind) => {
    const d = address === null ? undefined : sensors.get(address);
    return d?.kind === kind ? d : undefined;
  };

  function inputsOf(room) {
    const relay = device(room.relay, 'relay');
    const running = (name) => relay?.running[OUTPUT[name]] === true;
    const ac = device(room.ac, 'ac');
    const works = ac && ac.power === true && ac.error === 0;
    return {
      intake: running('intake'),
      exhaust: running('exhaust'),
      humidifier: running('humidifier'),
      ac: works ? { mode: MODES[ac.mode], setpoint: ac.setpoint, fan: FANS[ac.fan] } : null,
    };
  }

  function tick() {
    const dt = sims.getSpeed();
    for (const room of sims.list()) {
      if (!room.enabled) continue;
      const { state, acting } = model.step(room.state, inputsOf(room), modelParams(room), dt);
      sims.setState(room.id, state, acting);
      const { T, W, CO2 } = state;
      if (device(room.trh, 'trh')) sensors.simWrite(room.trh, { t: T, rh: model.rhOf(T, W) });
      if (device(room.co2, 'co2')) sensors.simWrite(room.co2, { co2: CO2 });
      if (device(room.ac, 'ac')) sensors.simWrite(room.ac, { roomT: T });
    }
    if (now() - lastSaved >= PERSIST_MS) flush();
  }

  // Writes the state file if the air state moved since the last save.
  function flush() {
    lastSaved = now();
    try {
      sims.persist();
    } catch (err) {
      console.warn(`Could not save the simulation state (${err.message})`);
    }
  }

  function start() {
    if (timer || !tickMs) return;
    timer = setInterval(() => {
      try {
        tick();
      } catch (err) {
        console.error(err);
      }
    }, tickMs);
    timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    flush();
  }

  return { tick, start, stop, flush };
}
