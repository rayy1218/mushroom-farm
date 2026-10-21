// The simulated rooms in memory, saved to a JSON file on every change.
// Which devices a room links, its parameters and its air state (T, W, CO2); the runner is in simulation.js.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { SensorError } from './sensors.js';
import * as defaultModel from './sim-model.js';
import { outdoorAt } from './sim-model.js';

const SPEEDS = [1, 10, 60];
const LINKS = ['trh', 'co2', 'relay', 'ac', 'outdoorProbe', 'meter'];
// The kind of device each link takes: the outdoor probe is a T/RH sensor of its own.
const LINK_KIND = { trh: 'trh', co2: 'co2', relay: 'relay', ac: 'ac', outdoorProbe: 'trh', meter: 'meter' };
const KIND_NAMES = { trh: 'T/RH sensor', co2: 'CO₂ sensor', relay: 'relay module', ac: 'aircon gateway', meter: 'energy meter' };
const LINK_NAMES = { ...KIND_NAMES, outdoorProbe: 'outdoor T/RH sensor' };
const withArticle = (name) => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
const KWH_MAX = 1e9;
export const PARAMS = {
  volume: { min: 1, max: 10000, whole: false, label: 'Volume', unit: 'm³', value: 60 },
  blocks: { min: 0, max: 100000, whole: true, label: 'Blocks', unit: '', value: 500 },
  co2PerBlock: { min: 0, max: 1000, whole: false, label: 'CO₂ per block', unit: 'mL/h', value: 60 },
  wallUA: { min: 0, max: 100000, whole: false, label: 'Wall heat transfer', unit: 'W/K', value: 80 },
  // Lowland Malaysia (Subang 2015-2024): mean daily high 32.9 °C, low 25.0 °C, dew point about 24 °C.
  outdoorHigh: { min: -40, max: 60, whole: false, label: 'Outdoor day high', unit: '°C', value: 33 },
  outdoorLow: { min: -40, max: 60, whole: false, label: 'Outdoor night low', unit: '°C', value: 25 },
  outdoorDew: { min: -40, max: 60, whole: false, label: 'Outdoor dew point', unit: '°C', value: 24 },
  // Peak sun heat through the roof at 13:00: about 300 W for an insulated 20 m² roof, several kW for bare zinc.
  sunW: { min: 0, max: 100000, whole: false, label: 'Sun on the roof', unit: 'W', value: 300 },
  fanFlow: { min: 0, max: 100000, whole: false, label: 'Fan flow', unit: 'm³/h', value: 600 },
  acBTU: { min: 0, max: 200000, whole: true, label: 'Aircon capacity', unit: 'BTU/h', value: 12000 },
  humidifierLH: { min: 0, max: 100, whole: false, label: 'Humidifier output', unit: 'L/h', value: 2 },
  dehumidifierLday: { min: 0, max: 200, whole: false, label: 'Dehumidifier capacity', unit: 'L/day', value: 0 },
  dehumidifierW: { min: 0, max: 5000, whole: false, label: 'Dehumidifier power', unit: 'W', value: 380 },
};
export const BTU_PER_KW = 3412.142;
const NAME_MAX = 40;
const DAY_S = 86_400;
const OUTDOOR = ['outdoorHigh', 'outdoorLow', 'outdoorDew'];
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

function checkParam(field, value) {
  const { min, max, whole, label, unit } = PARAMS[field];
  if (!isNumber(value) || value < min || value > max || (whole && !Number.isInteger(value))) {
    throw new SensorError(400, `${label} must be ${whole ? 'a whole number' : 'a number'} from ${min} to ${max}${unit ? ` ${unit}` : ''}`, field);
  }
  return value;
}

// The outdoor values must fit together: night low at most the day high, dew point at most the night low.
export function outdoorProblem({ outdoorHigh, outdoorLow, outdoorDew }) {
  if (outdoorLow > outdoorHigh) return { message: 'Outdoor night low must not be above the day high', field: 'outdoorLow' };
  if (outdoorDew > outdoorLow) return { message: 'Outdoor dew point must not be above the night low', field: 'outdoorDew' };
  return null;
}

function checkName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > NAME_MAX) throw new SensorError(400, `Name must be 1 to ${NAME_MAX} characters`, 'name');
  return name;
}

// The air state to keep: T, W, CO2 and, when the model gives them, the mass temperature Tm and the surfaces' Hs.
const airState = (s) => ({ T: s.T, W: s.W, CO2: s.CO2, ...(isNumber(s.Tm) ? { Tm: s.Tm } : {}), ...(isNumber(s.Hs) ? { Hs: s.Hs } : {}) });
const paramsOf = (room) => Object.fromEntries(Object.keys(PARAMS).map((k) => [k, room[k]]));
const clone = (room) => ({ ...room, state: { ...room.state } });

// now: for the simulated time of day of a new or reset room, which starts at the local time.
export function createSims({ sensors, statePath, model = defaultModel, now = Date.now } = {}) {
  const rooms = new Map();
  const clockNow = () => {
    const d = new Date(now());
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  };
  // The air of a room that starts now: the outdoor air at its time of day.
  const startState = (room) => model.initialState({ ...paramsOf(room), ...outdoorAt(room, room.clock) });
  let speed = 1;
  let nextId = 1;
  let dirty = false;

  function save() {
    if (!statePath) return;
    const tmp = `${statePath}.tmp`;
    const stored = { speed, rooms: [...rooms.values()].map(({ acting, ...rest }) => rest) };
    writeFileSync(tmp, JSON.stringify(stored, null, 2));
    renameSync(tmp, statePath);
    dirty = false;
  }

  // What callers see: a copy with the humidity and the outdoor air now worked out and what is acting now.
  function view(room) {
    const { T, W } = room.state;
    const { outdoorT, outdoorRH } = outdoorAt(room, room.clock);
    return {
      ...clone(room), rh: Math.round(model.rhOf(T, W) * 10) / 10,
      outdoor: { T: Math.round(outdoorT * 10) / 10, RH: Math.round(outdoorRH * 10) / 10 },
      acting: room.acting ? { ...room.acting } : null,
    };
  }

  const sorted = () => [...rooms.values()].sort((a, b) => a.id - b.id);
  const find = (id) => {
    const room = rooms.get(id);
    if (!room) throw new SensorError(404, `No simulated room ${id}`);
    return room;
  };

  function checkLink(room, kind, value) {
    if (value === null) return null;
    if (!Number.isInteger(value)) throw new SensorError(400, `${LINK_NAMES[kind]} must be a device address or null`, kind);
    const device = sensors.get(value);
    if (!device) throw new SensorError(400, `No device with address ${value}`, kind);
    if (device.kind !== LINK_KIND[kind]) {
      throw new SensorError(409, `Device ${value} is ${withArticle(KIND_NAMES[device.kind])}, not ${withArticle(LINK_NAMES[kind])}`, kind);
    }
    for (const other of rooms.values()) {
      if (other !== room && LINKS.some((k) => other[k] === value)) throw new SensorError(409, `Device ${value} is already linked to ${other.name}`, kind);
    }
    return value;
  }

  // Applies a change, saves it, and puts everything back if the save fails.
  function commit(room, change) {
    const before = clone(room);
    const had = rooms.has(room.id);
    change();
    try {
      save();
    } catch (err) {
      if (had) Object.assign(room, before);
      else rooms.delete(room.id);
      throw err;
    }
    return view(room);
  }

  function blank(id, name) {
    const room = { id, name, enabled: false, trh: null, co2: null, relay: null, ac: null, outdoorProbe: null, meter: null, meterKWh: 0, ...Object.fromEntries(Object.entries(PARAMS).map(([k, p]) => [k, p.value])) };
    room.clock = clockNow();
    room.state = startState(room);
    room.acting = null;
    return room;
  }

  function add(input) {
    const name = input?.name === undefined ? `Sim room ${nextId}` : checkName(input.name);
    const room = blank(nextId, name);
    const idBefore = nextId;
    nextId += 1;
    rooms.set(room.id, room);
    try {
      save();
    } catch (err) {
      rooms.delete(room.id);
      nextId = idBefore;
      throw err;
    }
    return view(room);
  }

  function update(id, patch) {
    const room = find(id);
    const next = {};
    if (patch?.name !== undefined) next.name = checkName(patch.name);
    if (patch?.enabled !== undefined) {
      if (typeof patch.enabled !== 'boolean') throw new SensorError(400, 'Enabled must be true or false', 'enabled');
      next.enabled = patch.enabled;
    }
    for (const kind of LINKS) if (patch?.[kind] !== undefined) next[kind] = checkLink(room, kind, patch[kind]);
    for (const field of Object.keys(PARAMS)) if (patch?.[field] !== undefined) next[field] = checkParam(field, patch[field]);
    if (Object.keys(next).length === 0) throw new SensorError(400, 'Nothing to change');
    const outdoor = outdoorProblem({ ...room, ...next });
    if (outdoor) throw new SensorError(400, outdoor.message, outdoor.field);
    // One device cannot sit on two links of the same room either.
    const linked = LINKS.map((k) => next[k] ?? room[k]).filter((v) => v !== null);
    if (new Set(linked).size !== linked.length) throw new SensorError(409, 'A device can be linked once', LINKS.find((k) => next[k] !== undefined && next[k] !== null));
    return commit(room, () => Object.assign(room, next));
  }

  function reset(id) {
    const room = find(id);
    return commit(room, () => {
      room.clock = clockNow();
      room.state = startState(room);
      room.acting = null;
    });
  }

  function remove(id) {
    const room = find(id);
    rooms.delete(id);
    try {
      save();
    } catch (err) {
      rooms.set(id, room);
      throw err;
    }
  }

  function setSpeed(value) {
    if (!SPEEDS.includes(value)) throw new SensorError(400, `Speed must be ${SPEEDS.join(', ')}`, 'speed');
    const before = speed;
    speed = value;
    try {
      save();
    } catch (err) {
      speed = before;
      throw err;
    }
    return speed;
  }

  // The runner's own writes: in memory, saved by persist(). clock: the simulated time of day (s), kept when not given.
  // meterKWh: the room's meter total, kept when not given.
  function setState(id, state, acting, clock, meterKWh) {
    const room = rooms.get(id);
    if (!room) return;
    room.state = airState(state);
    if (isNumber(clock)) room.clock = ((clock % DAY_S) + DAY_S) % DAY_S;
    room.acting = acting ?? null;
    if (isNumber(meterKWh)) room.meterKWh = Math.min(KWH_MAX, Math.max(0, meterKWh));
    dirty = true;
  }

  function persist() {
    if (dirty) save();
  }

  // The name of the enabled room that drives this device's values, if any (a T/RH sensor may be a room's outdoor probe).
  function simulatedBy(address, kind) {
    const links = LINKS.filter((link) => LINK_KIND[link] === kind);
    for (const room of sorted()) if (room.enabled && links.some((link) => room[link] === address)) return room.name;
    return null;
  }

  // A device was removed: forget the link, so a new device at that address is not silently taken over.
  // The room keeps running with that machine or sensor off.
  function unlink(address) {
    const touched = [];
    for (const room of rooms.values()) {
      for (const kind of LINKS) {
        if (room[kind] === address) {
          room[kind] = null;
          touched.push(room);
        }
      }
    }
    if (touched.length === 0) return;
    try {
      save();
    } catch (err) {
      console.warn(`Could not save the simulation state (${err.message})`);
    }
  }

  const claimed = new Set();

  function restore(saved) {
    if (!Number.isInteger(saved?.id) || saved.id < 1) throw new Error('bad id');
    const room = blank(saved.id, checkName(saved.name));
    if (typeof saved.enabled === 'boolean') room.enabled = saved.enabled;
    // Files from before the unit change hold kW and g/h.
    const old = {};
    if (isNumber(saved.acKW)) old.acBTU = Math.round(saved.acKW * BTU_PER_KW);
    if (isNumber(saved.humidifierGH)) old.humidifierLH = Math.round(saved.humidifierGH / 100) / 10;
    for (const field of Object.keys(PARAMS)) if ((saved[field] ?? old[field]) !== undefined) room[field] = checkParam(field, saved[field] ?? old[field]);
    // Outdoor values that do not fit together go back to the defaults (a file from before the day cycle has none).
    if (outdoorProblem(room)) for (const field of OUTDOOR) room[field] = PARAMS[field].value;
    if (isNumber(saved.clock) && saved.clock >= 0 && saved.clock < DAY_S) room.clock = saved.clock;
    // The meter total is kept across a restart and a reset, as a real meter does.
    if (isNumber(saved.meterKWh) && saved.meterKWh >= 0 && saved.meterKWh <= KWH_MAX) room.meterKWh = saved.meterKWh;
    // A device belongs to one room (and one link) only: the first claim wins.
    for (const kind of LINKS) {
      if (!Number.isInteger(saved[kind]) || claimed.has(saved[kind])) continue;
      claimed.add(saved[kind]);
      room[kind] = saved[kind];
    }
    const s = saved.state;
    room.state = isNumber(s?.T) && isNumber(s?.W) && isNumber(s?.CO2) ? airState(s) : startState(room);
    rooms.set(room.id, room);
    nextId = Math.max(nextId, room.id + 1);
  }

  if (statePath) {
    let saved = null;
    try {
      saved = JSON.parse(readFileSync(statePath, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`Could not read ${statePath} (${err.message}); starting with no simulated rooms`);
    }
    if (saved !== null) {
      if (SPEEDS.includes(saved?.speed)) speed = saved.speed;
      if (!Array.isArray(saved?.rooms)) {
        console.warn(`${statePath} does not hold a list of simulated rooms; starting with none`);
      } else {
        for (const room of saved.rooms) {
          try {
            restore(room);
          } catch { /* skip this room */ }
        }
      }
    }
  }
  sensors.setSimulatedBy(simulatedBy);
  sensors.setOnRemove?.(unlink);

  return {
    list: () => sorted().map(view),
    get: (id) => (rooms.has(id) ? view(rooms.get(id)) : undefined),
    add, update, reset, remove, setSpeed, setState, persist,
    getSpeed: () => speed,
  };
}
