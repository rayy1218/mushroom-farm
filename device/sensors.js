// The device's sensors in memory, saved to a JSON file on every change.
// Shares no code with the farm app.

import { readFileSync, writeFileSync, renameSync } from 'node:fs';

export class SensorError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

const KINDS = ['trh', 'co2', 'relay', 'ac', 'meter', 'dp'];
const KIND_NAMES = { trh: 'T/RH sensor', co2: 'CO₂ sensor', relay: 'relay module', ac: 'aircon gateway', meter: 'energy meter', dp: 'filter pressure sensor' };
const LIMITS = {
  t: { min: -40, max: 80, whole: false, label: 'Temperature', unit: '°C' },
  rh: { min: 0, max: 100, whole: false, label: 'Humidity', unit: '%' },
  co2: { min: 0, max: 10000, whole: true, label: 'CO₂', unit: 'ppm' },
  roomT: { min: -40, max: 80, whole: false, label: 'Room temperature', unit: '°C' },
  error: { min: 0, max: 255, whole: true, label: 'Error code', unit: '' },
  power: { min: 0, max: 100000, whole: false, label: 'Power', unit: 'W' },
  energy: { min: 0, max: 1e9, whole: false, label: 'Energy', unit: 'kWh', decimals: 3 },
  pa: { min: -50, max: 2000, whole: false, label: 'Pressure', unit: 'Pa' },
};
// What a patch (and the state file) may carry for each kind.
const FIELDS_OF = { trh: ['t', 'rh'], co2: ['co2'], relay: ['stuck', 'dead'], ac: ['roomT', 'error', 'refuse'], meter: ['power', 'energy'], dp: ['pa'] };
const PATCHABLE = ['t', 'rh', 'co2', 'stuck', 'dead', 'roomT', 'error', 'refuse', 'coils', 'power', 'energy', 'mode', 'setpoint', 'fan', 'pa'];
// The values a simulation drives, per kind. Relays have none: stuck and dead stay editable.
const SIMULATED_FIELDS = { trh: ['t', 'rh'], co2: ['co2'], ac: ['roomT'], meter: ['power', 'energy'], dp: ['pa'] };
const OUTPUTS = 5; // intake, exhaust, circulation, humidifier, dehumidifier
const OLD_OUTPUTS = 4; // a state file from before the dehumidifier
const DEFAULT_SPIN_UP_MS = 2000;

const isAddress = (n) => Number.isInteger(n) && n >= 1 && n <= 247;

function checkValue(field, value) {
  const { min, max, whole, label, unit } = LIMITS[field];
  const ok = typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!whole || Number.isInteger(value));
  if (!ok) {
    throw new SensorError(400, `${label} must be ${whole ? 'a whole number' : 'a number'} from ${min} to ${max}${unit ? ` ${unit}` : ''}`, field);
  }
  if (whole) return value;
  const scale = 10 ** (LIMITS[field].decimals ?? 1);
  return Math.round(value * scale) / scale;
}

function checkSwitches(field, value) {
  if (!Array.isArray(value) || value.length !== OUTPUTS || value.some((v) => typeof v !== 'boolean')) {
    throw new SensorError(400, `${field === 'stuck' ? 'Stuck' : field === 'dead' ? 'Dead' : 'Coils'} must be a list of ${OUTPUTS} true or false values`, field);
  }
  return [...value];
}

function checkFlag(field, value) {
  if (typeof value !== 'boolean') throw new SensorError(400, `${field === 'refuse' ? 'Refuse' : 'Answering'} must be true or false`, field);
  return value;
}

// The four values an aircon gateway takes in one write (function 16), in register codes.
const AC_LIMITS = { mode: 3, fan: 2, setpointMin: 16, setpointMax: 30 };
function checkAc(values) {
  const { power, mode, setpoint, fan } = values ?? {};
  const whole = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
  if (typeof power !== 'boolean') throw new SensorError(400, 'Power must be true or false', 'power');
  if (!whole(mode, AC_LIMITS.mode)) throw new SensorError(400, 'Mode must be a whole number from 0 to 3', 'mode');
  if (!whole(fan, AC_LIMITS.fan)) throw new SensorError(400, 'Fan must be a whole number from 0 to 2', 'fan');
  const ok = typeof setpoint === 'number' && setpoint >= AC_LIMITS.setpointMin && setpoint <= AC_LIMITS.setpointMax && Number.isInteger(setpoint * 2);
  if (!ok) throw new SensorError(400, 'Setpoint must be from 16 to 30 °C in steps of 0.5', 'setpoint');
  return { power, mode, setpoint, fan };
}

const clone = (entry) => ({ ...entry, ...Object.fromEntries(Object.entries(entry).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, [...v]])) });

export function createSensors({ statePath, spinUpMs = DEFAULT_SPIN_UP_MS, now = Date.now } = {}) {
  const byAddress = new Map();
  // Set by the simulation: (address, kind) -> name of the simulated room that drives it, or null.
  let simulatedBy = () => null;
  // Set by the simulation: called with an address once its device is removed.
  let onRemove = () => {};
  // Set when the simulation moved a meter total in memory; the next persist() writes it.
  let dirty = false;

  // What callers see: copies, with a relay's running state worked out and its bookkeeping left out.
  function view(entry) {
    const { since, exact, ...out } = clone(entry);
    if (entry.kind === 'relay') {
      const t = now();
      out.running = entry.coils.map((on, i) => on && !entry.dead[i] && t - since[i] >= spinUpMs);
    }
    return out;
  }

  function save() {
    if (!statePath) return;
    const tmp = `${statePath}.tmp`;
    // Only what was set: the derived running state and the timers are left out.
    dirty = false;
    const stored = [...byAddress.values()].sort((a, b) => a.address - b.address).map(({ since, ...rest }) => rest);
    writeFileSync(tmp, JSON.stringify(stored, null, 2));
    renameSync(tmp, statePath);
  }

  function list() {
    return [...byAddress.values()].sort((a, b) => a.address - b.address).map(view);
  }

  function get(address) {
    const entry = byAddress.get(address);
    return entry && view(entry);
  }

  function make({ address, kind }) {
    if (!isAddress(address)) throw new SensorError(400, 'Address must be a whole number from 1 to 247', 'address');
    if (!KINDS.includes(kind)) throw new SensorError(400, 'Kind must be trh, co2, relay, ac, meter or dp', 'kind');
    if (byAddress.has(address)) throw new SensorError(409, `Address ${address} is already used`, 'address');
    const base = { address, kind };
    if (kind === 'trh') return { ...base, t: 25, rh: 85, co2: null, answering: true };
    if (kind === 'co2') return { ...base, t: null, rh: null, co2: 800, answering: true };
    if (kind === 'relay') {
      return { ...base, coils: Array(OUTPUTS).fill(false), stuck: Array(OUTPUTS).fill(false), dead: Array(OUTPUTS).fill(false), since: Array(OUTPUTS).fill(null), answering: true };
    }
    if (kind === 'meter') return { ...base, power: 0, energy: 0, answering: true };
    if (kind === 'dp') return { ...base, pa: 40, answering: true }; // a clean filter's drop
    return { ...base, power: false, mode: 0, setpoint: 25, fan: 0, roomT: 25, error: 0, refuse: false, answering: true };
  }

  // Applies a change, saves it, and puts everything back if the save fails.
  function commit(entry, change) {
    const before = clone(entry);
    change();
    try {
      save();
    } catch (err) {
      Object.assign(entry, before);
      throw err;
    }
    return view(entry);
  }

  function add(input) {
    const entry = make(input ?? {});
    byAddress.set(entry.address, entry);
    try {
      save();
    } catch (err) {
      byAddress.delete(entry.address);
      throw err;
    }
    return view(entry);
  }

  function checkField(field, value) {
    if (field === 'stuck' || field === 'dead') return checkSwitches(field, value);
    if (field === 'refuse') return checkFlag(field, value);
    return checkValue(field, value);
  }

  function update(address, patch) {
    const entry = byAddress.get(address);
    if (!entry) throw new SensorError(404, `No device with address ${address}`);
    const next = {};
    for (const field of PATCHABLE) {
      if (patch?.[field] === undefined) continue;
      if (SIMULATED_FIELDS[entry.kind]?.includes(field)) {
        const room = simulatedBy(address, entry.kind);
        if (room) throw new SensorError(409, `Sensor ${address} is simulated by ${room}`, field);
      }
      if (!FIELDS_OF[entry.kind].includes(field)) {
        throw new SensorError(400, `A ${KIND_NAMES[entry.kind]} has no ${field} value`, field);
      }
      next[field] = checkField(field, patch[field]);
    }
    if (patch?.answering !== undefined) next.answering = checkFlag('answering', patch.answering);
    if (Object.keys(next).length === 0) throw new SensorError(400, 'Nothing to change');
    // A typed total drops the extra digits kept for the simulation.
    return commit(entry, () => Object.assign(entry, next, next.energy !== undefined && { exact: undefined }));
  }

  // The simulation adds a tick's energy to the meter itself, so the total belongs to the device and never goes down.
  // Kept to the full precision (the register shows Wh); in memory, written by persist().
  function addEnergy(address, kWh) {
    const entry = byAddress.get(address);
    if (entry?.kind !== 'meter' || !Number.isFinite(kWh) || kWh <= 0) return;
    const { max } = LIMITS.energy;
    entry.exact = Math.min(max, (entry.exact ?? entry.energy) + kWh);
    entry.energy = Math.round(entry.exact * 1000) / 1000;
    dirty = true;
  }

  // Writes the file if the simulation moved a total since the last save.
  function persist() {
    if (dirty) save();
  }

  // The simulation's own write: clamped to the limits, in memory only (the next save of any change keeps it).
  function simWrite(address, values) {
    const entry = byAddress.get(address);
    if (!entry) return;
    for (const field of SIMULATED_FIELDS[entry.kind] ?? []) {
      if (field === 'energy') continue; // a meter total is added to, see addEnergy
      const v = values[field];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const { min, max, whole, decimals = 1 } = LIMITS[field];
      const clamped = Math.min(max, Math.max(min, v));
      entry[field] = whole ? Math.round(clamped) : Math.round(clamped * 10 ** decimals) / 10 ** decimals;
    }
  }

  function setSimulatedBy(fn) {
    simulatedBy = fn;
  }

  function setOnRemove(fn) {
    onRemove = fn;
  }

  // The name of the enabled simulated room driving this device's values, or null (also for kinds a simulation cannot drive).
  function simulatedByDevice(address) {
    const kind = byAddress.get(address)?.kind;
    return SIMULATED_FIELDS[kind] ? simulatedBy(address, kind) : null;
  }

  // Modbus function 05: a stuck relay is acknowledged but does not move.
  function writeCoil(address, index, on) {
    const entry = byAddress.get(address);
    if (entry?.kind !== 'relay') throw new SensorError(404, `No device with address ${address}`);
    if (!Number.isInteger(index) || index < 0 || index >= OUTPUTS) throw new SensorError(400, `Coil must be 0 to ${OUTPUTS - 1}`, 'coil');
    if (entry.stuck[index] || entry.coils[index] === on) return view(entry);
    return commit(entry, () => {
      entry.coils[index] = on;
      entry.since[index] = on ? now() : null;
    });
  }

  // Modbus function 16: an aircon gateway that refuses acknowledges but keeps its settings.
  function writeAc(address, values) {
    const entry = byAddress.get(address);
    if (entry?.kind !== 'ac') throw new SensorError(404, `No device with address ${address}`);
    const next = checkAc(values);
    if (entry.refuse) return view(entry);
    return commit(entry, () => Object.assign(entry, next));
  }

  function remove(address) {
    const entry = byAddress.get(address);
    if (!entry) throw new SensorError(404, `No device with address ${address}`);
    byAddress.delete(address);
    try {
      save();
    } catch (err) {
      byAddress.set(address, entry);
      throw err;
    }
    onRemove(address);
  }

  function restore(saved) {
    const entry = make(saved ?? {});
    if (entry.kind === 'relay') {
      // A relay saved with 4 outputs gets the 5th off (the dehumidifier did not exist).
      saved = { ...saved };
      for (const field of ['coils', 'stuck', 'dead']) {
        if (Array.isArray(saved[field]) && saved[field].length === OLD_OUTPUTS) saved[field] = [...saved[field], false];
      }
    }
    if (entry.kind === 'relay') {
      entry.coils = checkSwitches('coils', saved.coils ?? entry.coils);
      entry.since = entry.coils.map((on) => (on ? now() : null));
    }
    if (entry.kind === 'ac') {
      Object.assign(entry, checkAc({ power: saved.power ?? entry.power, mode: saved.mode ?? entry.mode, setpoint: saved.setpoint ?? entry.setpoint, fan: saved.fan ?? entry.fan }));
    }
    for (const field of FIELDS_OF[entry.kind]) if (saved[field] !== undefined) entry[field] = checkField(field, saved[field]);
    // The exact total counts only while it still rounds to the register (a hand-edited file wins).
    if (entry.kind === 'meter' && Number.isFinite(saved.exact) && Math.round(saved.exact * 1000) / 1000 === entry.energy) entry.exact = saved.exact;
    if (typeof saved.answering === 'boolean') entry.answering = saved.answering;
    byAddress.set(entry.address, entry);
  }

  // Load: a missing or broken file means an empty device; bad entries are skipped.
  if (statePath) {
    let saved = [];
    try {
      saved = JSON.parse(readFileSync(statePath, 'utf8'));
    } catch (err) {
      // A missing file is a first start; anything else is worth knowing about.
      if (err.code !== 'ENOENT') console.warn(`Could not read ${statePath} (${err.message}); starting with no sensors`);
    }
    if (!Array.isArray(saved)) {
      console.warn(`${statePath} does not hold a list of sensors; starting with none`);
    } else {
      for (const entry of saved) {
        try {
          restore(entry);
        } catch { /* skip this entry */ }
      }
    }
  }

  return { list, get, add, update, remove, writeCoil, writeAc, simWrite, addEnergy, persist, setSimulatedBy, setOnRemove, simulatedByDevice };
}
