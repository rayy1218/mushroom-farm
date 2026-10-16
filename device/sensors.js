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

const KINDS = ['trh', 'co2'];
const DEFAULTS = {
  trh: { t: 25, rh: 85, co2: null },
  co2: { t: null, rh: null, co2: 800 },
};
const LIMITS = {
  t: { min: -40, max: 80, whole: false, label: 'Temperature', unit: '°C' },
  rh: { min: 0, max: 100, whole: false, label: 'Humidity', unit: '%' },
  co2: { min: 0, max: 10000, whole: true, label: 'CO₂', unit: 'ppm' },
};
const FIELDS_OF = { trh: ['t', 'rh'], co2: ['co2'] };

const isAddress = (n) => Number.isInteger(n) && n >= 1 && n <= 247;

function checkValue(field, value) {
  const { min, max, whole, label, unit } = LIMITS[field];
  const ok = typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && (!whole || Number.isInteger(value));
  if (!ok) {
    throw new SensorError(400, `${label} must be ${whole ? 'a whole number' : 'a number'} from ${min} to ${max} ${unit}`, field);
  }
  return whole ? value : Math.round(value * 10) / 10;
}

export function createSensors({ statePath } = {}) {
  const byAddress = new Map();

  function save() {
    if (!statePath) return;
    const tmp = `${statePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(list(), null, 2));
    renameSync(tmp, statePath);
  }

  function list() {
    return [...byAddress.values()].sort((a, b) => a.address - b.address).map((s) => ({ ...s }));
  }

  function get(address) {
    const s = byAddress.get(address);
    return s && { ...s };
  }

  function make({ address, kind }) {
    if (!isAddress(address)) throw new SensorError(400, 'Address must be a whole number from 1 to 247', 'address');
    if (!KINDS.includes(kind)) throw new SensorError(400, 'Kind must be trh or co2', 'kind');
    if (byAddress.has(address)) throw new SensorError(409, `Address ${address} is already used`, 'address');
    return { address, kind, ...DEFAULTS[kind], answering: true };
  }

  function add(input) {
    const sensor = make(input ?? {});
    byAddress.set(sensor.address, sensor);
    save();
    return { ...sensor };
  }

  function update(address, patch) {
    const sensor = byAddress.get(address);
    if (!sensor) throw new SensorError(404, `No sensor with address ${address}`);
    const next = {};
    for (const field of ['t', 'rh', 'co2']) {
      if (patch?.[field] === undefined) continue;
      if (!FIELDS_OF[sensor.kind].includes(field)) {
        throw new SensorError(400, `A ${sensor.kind === 'trh' ? 'T/RH' : 'CO₂'} sensor has no ${field} value`, field);
      }
      next[field] = checkValue(field, patch[field]);
    }
    if (patch?.answering !== undefined) {
      if (typeof patch.answering !== 'boolean') throw new SensorError(400, 'Answering must be true or false', 'answering');
      next.answering = patch.answering;
    }
    Object.assign(sensor, next);
    save();
    return { ...sensor };
  }

  function remove(address) {
    if (!byAddress.delete(address)) throw new SensorError(404, `No sensor with address ${address}`);
    save();
  }

  // Load: a missing or broken file means an empty device; bad entries are skipped.
  if (statePath) {
    let saved = [];
    try {
      saved = JSON.parse(readFileSync(statePath, 'utf8'));
    } catch { /* first start or unreadable file */ }
    if (Array.isArray(saved)) {
      for (const entry of saved) {
        try {
          const sensor = make(entry ?? {});
          for (const field of FIELDS_OF[sensor.kind]) if (entry[field] !== undefined) sensor[field] = checkValue(field, entry[field]);
          if (typeof entry.answering === 'boolean') sensor.answering = entry.answering;
          byAddress.set(sensor.address, sensor);
        } catch { /* skip this entry */ }
      }
    }
  }

  return { list, get, add, update, remove };
}
