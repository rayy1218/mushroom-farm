// Validation of room input. Pure: no database, no HTTP.

import { parseGateway } from './gateways.js';

export const NAME_MAX = 60;
export const GATEWAY_MAX = 100;
const GATEWAY_ERROR = "Gateway must look like host:port, such as 192.168.1.50:502, or be empty for the farm's gateway";

const SIZES = [
  { field: 'length', label: 'Length', min: 0.5, max: 100 },
  { field: 'width', label: 'Width', min: 0.5, max: 100 },
  { field: 'height', label: 'Height', min: 0.5, max: 10 },
];

const ADDRESSES = [
  { field: 'trhAddress', label: 'T/RH sensor' },
  { field: 'co2Address', label: 'CO₂ sensor' },
  { field: 'relayAddress', label: 'Relay module' },
  { field: 'acAddress', label: 'Aircon gateway' },
  { field: 'meterAddress', label: 'Energy meter' },
  { field: 'dpAddress', label: 'Filter pressure sensor' },
];

// Machine ratings (spec 2026-10-20-energy-water-outdoor-design.md section 4), in the order of the rooms columns.
export const RATINGS = [
  { field: 'intakeW', label: 'Intake fan power', unit: 'W', default: 60, min: 0, max: 5000 },
  { field: 'exhaustW', label: 'Exhaust fan power', unit: 'W', default: 60, min: 0, max: 5000 },
  { field: 'circulationW', label: 'Circulation fan power', unit: 'W', default: 60, min: 0, max: 5000 },
  { field: 'humidifierW', label: 'Humidifier power', unit: 'W', default: 80, min: 0, max: 5000 },
  { field: 'humidifierLH', label: 'Humidifier output', unit: 'L/h', default: 2, min: 0, max: 100 },
  { field: 'acInputW', label: 'Aircon rated input', unit: 'W', default: 1050, min: 0, max: 20000 },
  { field: 'dehumidifierW', label: 'Dehumidifier power', unit: 'W', default: 380, min: 0, max: 5000 },
  { field: 'dehumidifierLday', label: 'Dehumidifier capacity', unit: 'L/day', default: 20, min: 0, max: 200 },
  { field: 'lightsW', label: 'Lights power', unit: 'W', default: 60, min: 0, max: 5000 },
];

// The intake filter (spec 2026-10-22-filter-design.md section 3), whole numbers. One left out stays out: an update keeps the
// stored value (an older page sends none) and a new room gets the default.
export const FILTER = [
  { field: 'fanMaxPa', label: 'Intake fan maximum pressure', unit: 'Pa', default: 200, min: 20, max: 2000 },
  { field: 'filterCleanPa', label: 'Clean filter pressure drop', unit: 'Pa', default: 40, min: 5, max: 1000 },
  { field: 'filterFinalPa', label: 'Filter change pressure', unit: 'Pa', default: 80, min: 5, max: 2000 },
  { field: 'filterChangeDays', label: 'Change the filter every', unit: 'days', default: 30, min: 0, max: 365 },
];

// Returns { room: { name, length, width, height, the six addresses, the ratings, the filter settings and gateway given } } when the input is valid,
// otherwise { error, field } for the first failing field (field is missing
// when the body itself is wrong).
export function validateRoom(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name === '') return { error: 'Name is required', field: 'name' };
  if (name.length > NAME_MAX) {
    return { error: `Name must be ${NAME_MAX} characters or fewer`, field: 'name' };
  }
  const room = { name };
  for (const { field, label, min, max } of SIZES) {
    const value = body[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      return { error: `${label} must be a number from ${min} to ${max} m`, field };
    }
    room[field] = value;
  }
  for (const { field, label } of ADDRESSES) {
    const value = body[field] ?? null;
    if (value !== null && !(Number.isInteger(value) && value >= 1 && value <= 247)) {
      return { error: `${label} address must be a whole number from 1 to 247`, field };
    }
    room[field] = value;
  }
  // A rating left out (or null) is the default; a given one must be a number in range.
  for (const { field, label, unit, default: d, min, max } of RATINGS) {
    const value = body[field] ?? d;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      return { error: `${label} must be a number from ${min} to ${max} ${unit}`, field };
    }
    room[field] = value;
  }
  // Whether the room has a dehumidifier on output 5 of its relay module (spec 2026-10-21-dehumidifier-design.md 2).
  // Left out (an older page): undefined, so an update keeps the stored value and a new room has none.
  if (body.dehumidifier !== undefined && typeof body.dehumidifier !== 'boolean') {
    return { error: 'Dehumidifier fitted must be true or false', field: 'dehumidifier' };
  }
  if (body.dehumidifier !== undefined) room.dehumidifier = body.dehumidifier;
  // Lights on output 6 (spec 2026-10-26-lighting-design.md 2), kept the same way when left out.
  if (body.lights !== undefined && typeof body.lights !== 'boolean') {
    return { error: 'Lights fitted must be true or false', field: 'lights' };
  }
  if (body.lights !== undefined) room.lights = body.lights;
  // The room's own Modbus gateway (a container behind one), kept the same way when left out; null, empty or blank: the farm's.
  if (body.gateway !== undefined) {
    const text = typeof body.gateway === 'string' ? body.gateway.trim() : body.gateway;
    if (text === null || text === '') room.gateway = null;
    else if (typeof text !== 'string' || text.length > GATEWAY_MAX || !parseGateway(text)) return { error: GATEWAY_ERROR, field: 'gateway' };
    else room.gateway = text;
  }
  for (const { field, label, unit, min, max } of FILTER) {
    const value = body[field] ?? null;
    if (value === null) continue;
    if (!Number.isInteger(value) || value < min || value > max) {
      return { error: `${label} must be a whole number from ${min} to ${max} ${unit}`, field };
    }
    room[field] = value;
  }
  // The fan must push above the clean filter, and the filter is changed above its clean pressure drop (one left out: its default).
  const pa = (field) => room[field] ?? FILTER.find((f) => f.field === field).default;
  if (pa('fanMaxPa') <= pa('filterCleanPa')) {
    return { error: "Fan maximum pressure must be above the clean filter's pressure drop", field: 'fanMaxPa' };
  }
  if (pa('filterFinalPa') <= pa('filterCleanPa')) {
    return { error: "Filter change pressure must be above the clean filter's pressure drop", field: 'filterFinalPa' };
  }
  // The sensor cannot read more than the fan pushes: a change pressure at or above it is never reached.
  if (pa('filterFinalPa') >= pa('fanMaxPa')) {
    return { error: "Filter change pressure must be below the fan's maximum pressure", field: 'filterFinalPa' };
  }
  // The later field of a clashing pair is blamed.
  for (let i = 1; i < ADDRESSES.length; i++) {
    const { field } = ADDRESSES[i];
    if (room[field] === null) continue;
    if (!ADDRESSES.slice(0, i).some((a) => room[a.field] === room[field])) continue;
    return {
      error: i === 1 ? 'The two sensors need different addresses' : 'The devices in a room need different addresses',
      field,
    };
  }
  return { room };
}
