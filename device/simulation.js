// The simulation runner: every tick, each enabled simulated room reads what its linked machines really do
// on the device, steps the model, and writes the new values into its linked sensors.

import * as defaultModel from './sim-model.js';
import { BTU_PER_KW } from './sim-store.js';
import { outdoorAt } from './sim-model.js';
import { electricW } from './sim-power.js';

const MODES = ['cool', 'heat', 'dry', 'fan'];
const FANS = ['auto', 'low', 'high'];
const OUTPUT = { intake: 0, exhaust: 1, circulation: 2, humidifier: 3 }; // circulation only adds its motor heat (one zone)
export const DEFAULT_TICK_MS = 1000;
export const PERSIST_MS = 10_000;

// The model works in kW and g/h; the room is set in BTU/h and L/h. The outdoor air is the one at the room's time of day.
function modelParams({ acBTU, humidifierLH, ...rest }) {
  return { ...rest, ...outdoorAt(rest, rest.clock), acKW: acBTU / BTU_PER_KW, humidifierGH: humidifierLH * 1000 };
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
      circulation: running('circulation'),
      humidifier: running('humidifier'),
      ac: works ? { mode: MODES[ac.mode], setpoint: ac.setpoint, fan: FANS[ac.fan] } : null,
    };
  }

  function tick() {
    const dt = sims.getSpeed();
    for (const room of sims.list()) {
      if (!room.enabled) continue;
      const inputs = inputsOf(room);
      const params = modelParams(room);
      const { state, acting } = model.step(room.state, inputs, params, dt);
      // The room's electrical power; its meter adds up power x simulated time and is never reset.
      const w = Math.round(electricW({ acting, inputs, params }) * 10) / 10;
      const kWh = room.meterKWh + (w * dt) / 3.6e6;
      const clock = (((room.clock + dt) % 86_400) + 86_400) % 86_400;
      sims.setState(room.id, state, { ...acting, electricW: w }, room.clock + dt, kWh);
      const { T, W, CO2 } = state;
      const out = outdoorAt(room, clock);
      if (device(room.outdoorProbe, 'trh')) sensors.simWrite(room.outdoorProbe, { t: out.outdoorT, rh: out.outdoorRH });
      if (device(room.meter, 'meter')) {
        sensors.simWrite(room.meter, { power: w });
        sensors.addEnergy(room.meter, (w * dt) / 3.6e6);
      }
      if (device(room.trh, 'trh')) sensors.simWrite(room.trh, { t: T, rh: model.rhOf(T, W) });
      if (device(room.co2, 'co2')) sensors.simWrite(room.co2, { co2: CO2 });
      if (device(room.ac, 'ac')) sensors.simWrite(room.ac, { roomT: T });
    }
    if (now() - lastSaved >= PERSIST_MS) flush();
  }

  // Puts each enabled room's outdoor air into its probe, so a first poll after a start is not a stale typed value.
  function prime() {
    for (const room of sims.list()) {
      if (!room.enabled || !device(room.outdoorProbe, 'trh')) continue;
      const out = outdoorAt(room, room.clock);
      sensors.simWrite(room.outdoorProbe, { t: out.outdoorT, rh: out.outdoorRH });
    }
  }

  // Writes the state files if the air state or a meter total moved since the last save.
  function flush() {
    lastSaved = now();
    try {
      sims.persist();
      sensors.persist();
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

  return { tick, start, stop, flush, prime };
}
