// The simulated rooms in memory, saved to a JSON file on every change.
// Which devices a room links, its parameters and its air state (T, W, CO2); the runner is in simulation.js.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { SensorError } from './sensors.js';
import * as defaultModel from './sim-model.js';

const SPEEDS = [1, 10, 60];
const LINKS = ['trh', 'co2', 'relay', 'ac'];
const KIND_NAMES = { trh: 'T/RH sensor', co2: 'CO₂ sensor', relay: 'relay module', ac: 'aircon gateway' };
const PARAMS = {
  volume: { min: 1, max: 10000, whole: false, label: 'Volume', unit: 'm³', value: 60 },
  blocks: { min: 0, max: 100000, whole: true, label: 'Blocks', unit: '', value: 500 },
  outdoorT: { min: -40, max: 60, whole: false, label: 'Outdoor temperature', unit: '°C', value: 32 },
  outdoorRH: { min: 0, max: 100, whole: false, label: 'Outdoor humidity', unit: '%', value: 80 },
  fanFlow: { min: 0, max: 100000, whole: false, label: 'Fan flow', unit: 'm³/h', value: 600 },
  acKW: { min: 0, max: 100, whole: false, label: 'Aircon capacity', unit: 'kW', value: 3.5 },
  humidifierGH: { min: 0, max: 100000, whole: false, label: 'Humidifier output', unit: 'g/h', value: 2000 },
};
const NAME_MAX = 40;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

function checkParam(field, value) {
  const { min, max, whole, label, unit } = PARAMS[field];
  if (!isNumber(value) || value < min || value > max || (whole && !Number.isInteger(value))) {
    throw new SensorError(400, `${label} must be ${whole ? 'a whole number' : 'a number'} from ${min} to ${max}${unit ? ` ${unit}` : ''}`, field);
  }
  return value;
}

function checkName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > NAME_MAX) throw new SensorError(400, `Name must be 1 to ${NAME_MAX} characters`, 'name');
  return name;
}

const paramsOf = (room) => Object.fromEntries(Object.keys(PARAMS).map((k) => [k, room[k]]));
const clone = (room) => ({ ...room, state: { ...room.state } });

export function createSims({ sensors, statePath, model = defaultModel } = {}) {
  const rooms = new Map();
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

  // What callers see: a copy with the humidity worked out and what is acting now.
  function view(room) {
    const { T, W } = room.state;
    return { ...clone(room), rh: Math.round(model.rhOf(T, W) * 10) / 10, acting: room.acting ? { ...room.acting } : null };
  }

  const sorted = () => [...rooms.values()].sort((a, b) => a.id - b.id);
  const find = (id) => {
    const room = rooms.get(id);
    if (!room) throw new SensorError(404, `No simulated room ${id}`);
    return room;
  };

  function checkLink(room, kind, value) {
    if (value === null) return null;
    if (!Number.isInteger(value)) throw new SensorError(400, `${KIND_NAMES[kind]} must be a device address or null`, kind);
    const device = sensors.get(value);
    if (!device) throw new SensorError(400, `No device with address ${value}`, kind);
    if (device.kind !== kind) throw new SensorError(409, `Device ${value} is a ${KIND_NAMES[device.kind]}, not a ${KIND_NAMES[kind]}`, kind);
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
    const room = { id, name, enabled: false, trh: null, co2: null, relay: null, ac: null, ...Object.fromEntries(Object.entries(PARAMS).map(([k, p]) => [k, p.value])) };
    room.state = model.initialState(paramsOf(room));
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
    // One device cannot sit on two links of the same room either.
    const linked = LINKS.map((k) => next[k] ?? room[k]).filter((v) => v !== null);
    if (new Set(linked).size !== linked.length) throw new SensorError(409, 'A device can be linked once', LINKS.find((k) => next[k] !== undefined && next[k] !== null));
    return commit(room, () => Object.assign(room, next));
  }

  function reset(id) {
    const room = find(id);
    return commit(room, () => {
      room.state = model.initialState(paramsOf(room));
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

  // The runner's own writes: in memory, saved by persist().
  function setState(id, state, acting) {
    const room = rooms.get(id);
    if (!room) return;
    room.state = { T: state.T, W: state.W, CO2: state.CO2 };
    room.acting = acting ?? null;
    dirty = true;
  }

  function persist() {
    if (dirty) save();
  }

  // The name of the enabled room that drives this device's values, if any.
  function simulatedBy(address, kind) {
    for (const room of sorted()) if (room.enabled && room[kind] === address) return room.name;
    return null;
  }

  function restore(saved) {
    if (!Number.isInteger(saved?.id) || saved.id < 1) throw new Error('bad id');
    const room = blank(saved.id, checkName(saved.name));
    if (typeof saved.enabled === 'boolean') room.enabled = saved.enabled;
    for (const field of Object.keys(PARAMS)) if (saved[field] !== undefined) room[field] = checkParam(field, saved[field]);
    for (const kind of LINKS) if (Number.isInteger(saved[kind])) room[kind] = saved[kind];
    const s = saved.state;
    room.state = isNumber(s?.T) && isNumber(s?.W) && isNumber(s?.CO2) ? { T: s.T, W: s.W, CO2: s.CO2 } : model.initialState(paramsOf(room));
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

  return {
    list: () => sorted().map(view),
    get: (id) => (rooms.has(id) ? view(rooms.get(id)) : undefined),
    add, update, reset, remove, setSpeed, setState, persist,
    getSpeed: () => speed,
  };
}
