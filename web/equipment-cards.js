// The Equipment tab's cards (spec 2026-10-27-equipment-cards-design.md): a card per sensor and machine, with its settings (the
// room fields of web/room-fields.js) in it, and the Modbus gateway the room's devices sit behind. Pure (no DOM, so it can be
// tested in Node): the card list, the line under a card's title, its status line and hint from the data the room page loads,
// and a card's check over the newest room.

import { ROOM_GROUPS, EQUIPMENT_NAMES, fieldTexts, parseRoomFields } from './room-fields.js';
import { STATUS_WORDS as MACHINE_WORDS } from './machines-math.js';

const FILTER_HINT = ROOM_GROUPS.find((g) => g.key === 'filter').hint;

// The gateway card's hint, with the farm's gateway (FARM_GATEWAY, from GET /api/settings) once it is known.
export const gatewayHint = (farm) => `Empty: the farm's gateway${farm ? ` (${farm})` : ''}. A room behind its own Modbus gateway, such as a `
  + "container, takes that gateway's address; device addresses then only need to differ within that gateway.";

// section: gateway, sensors or machines. fields: its settings, in order. labels: an input's label where the card already names the device
// (the field's own label otherwise; the unit is added). sensor: the sensors reply's kind; output: the relay output (from 1);
// fitted: the box that says the room has the machine; note: a muted line under the inputs.
export const EQUIPMENT_CARDS = [
  { key: 'gateway', section: 'gateway', title: 'Modbus gateway', fields: ['gateway'], hint: gatewayHint(null) },
  { key: 'trh', section: 'sensors', title: 'T/RH probe', fields: ['trhAddress'], labels: { trhAddress: 'Address' }, sensor: 'trh' },
  { key: 'co2', section: 'sensors', title: 'CO₂ sensor', fields: ['co2Address'], labels: { co2Address: 'Address' }, sensor: 'co2' },
  { key: 'meter', section: 'sensors', title: 'Energy meter', fields: ['meterAddress'], labels: { meterAddress: 'Address' }, sensor: 'meter' },
  {
    key: 'filter', section: 'sensors', title: 'Intake filter', fields: ['dpAddress', 'filterCleanPa', 'filterFinalPa', 'filterChangeDays'],
    labels: { dpAddress: 'Pressure sensor address' }, sensor: 'dp', hint: FILTER_HINT,
  },
  {
    key: 'relay', section: 'machines', title: 'Relay module', fields: ['relayAddress'], labels: { relayAddress: 'Address' },
    note: 'Outputs: 1 intake, 2 exhaust, 3 circulation, 4 humidifier, 5 dehumidifier, 6 lights',
  },
  { key: 'intake', section: 'machines', title: 'Intake fan', fields: ['intakeW', 'fanMaxPa'], labels: { intakeW: 'Power', fanMaxPa: 'Maximum pressure' }, output: 1 },
  { key: 'exhaust', section: 'machines', title: 'Exhaust fan', fields: ['exhaustW'], labels: { exhaustW: 'Power' }, output: 2 },
  { key: 'circulation', section: 'machines', title: 'Circulation fan', fields: ['circulationW'], labels: { circulationW: 'Power' }, output: 3 },
  { key: 'humidifier', section: 'machines', title: 'Humidifier', fields: ['humidifierW', 'humidifierLH'], labels: { humidifierW: 'Power', humidifierLH: 'Output' }, output: 4 },
  {
    key: 'dehumidifier', section: 'machines', title: 'Dehumidifier', fields: ['dehumidifier', 'dehumidifierW', 'dehumidifierLday'],
    labels: { dehumidifier: 'Fitted', dehumidifierW: 'Power', dehumidifierLday: 'Capacity' }, output: 5, fitted: 'dehumidifier',
  },
  { key: 'lights', section: 'machines', title: 'Lights', fields: ['lights', 'lightsW'], labels: { lights: 'Fitted', lightsW: 'Power' }, output: 6, fitted: 'lights' },
  { key: 'ac', section: 'machines', title: 'Aircon', fields: ['acAddress', 'acInputW'], labels: { acAddress: 'Gateway address', acInputW: 'Rated input' } },
];

export const EQUIPMENT_SECTIONS = [{ key: 'gateway', title: 'Gateway' }, { key: 'sensors', title: 'Sensors' }, { key: 'machines', title: 'Machines' }];

// The card that holds a field (a "Set address" button names the field).
export const cardOf = (name) => EQUIPMENT_CARDS.find((c) => c.fields.includes(name));

// The card as a group of web/room-form.js: its fields stacked in order, with its labels, hint and note.
export const cardGroup = (c) => ({ key: c.key, names: c.fields, labels: c.labels, hint: c.hint, note: c.note });

// The address as typed, or null (blank or not an address yet).
function address(text) {
  const s = String(text ?? '').trim();
  return /^[0-9]{1,3}$/.test(s) ? Number(s) : null;
}

// The muted line under the title, from the form's texts (it follows the box and the address as typed).
export function cardLine(c, texts) {
  if (c.key === 'gateway') {
    const gateway = String(texts?.gateway ?? '').trim();
    return gateway === '' ? "The farm's gateway" : `Own gateway ${gateway}`;
  }
  if (c.fitted && texts?.[c.fitted] !== true) return 'Not fitted';
  if (c.output) return `Relay output ${c.output}`;
  const n = address(texts?.[c.fields[0]]);
  if (c.key === 'filter') return n === null ? 'No pressure sensor' : `Pressure sensor address ${n}`;
  if (c.key === 'ac') return n === null ? 'No address' : `Aircon gateway address ${n}`;
  return n === null ? 'No address' : `Modbus address ${n}`;
}

const SENSOR_WORDS = { 'no-data': 'No data yet', online: 'Online', timeout: 'Timeout', offline: 'Offline' };

const fixed = (v, digits) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : null);

// A sensor's latest good value: "20.1 °C · 92.0 % RH", "638 ppm", "372 W", "40 Pa"; '' before the first.
function sensorValue(kind, ok) {
  if (!ok) return '';
  const parts = kind === 'trh' ? [[fixed(ok.t, 1), '°C'], [fixed(ok.rh, 1), '% RH']]
    : kind === 'co2' ? [[fixed(ok.co2, 0), 'ppm']]
      : kind === 'meter' ? [[fixed(ok.power, 0), 'W']]
        : [[fixed(ok.pa, 0), 'Pa']];
  return parts.filter(([v]) => v !== null).map(([v, unit]) => `${v} ${unit}`).join(' · ');
}

// The relay module from its machines: no answer from the last poll, waiting for the first, or online.
function relayState(relay) {
  const fitted = (relay.machines ?? []).filter((m) => m.status !== 'not-fitted');
  if (fitted.some((m) => m.status === 'no-answer')) return 'no-answer';
  return fitted.every((m) => m.status === 'no-data') ? 'no-data' : 'online';
}

// The status line from the room page's replies: { status, word, value } or null where the page has no such data, or where the
// device has no address (the line under the title says so already).
// sensors: { trh, co2, meter, dp } of the sensors reply; machines: the machines reply.
export function cardStatus(c, { sensors, machines }) {
  if (c.key === 'gateway') return null; // its devices say whether it answers
  if (c.sensor) {
    const s = sensors?.[c.sensor];
    if (!s || s.status === 'not-wired') return null;
    const word = SENSOR_WORDS[s.status] ?? s.status;
    const n = s.failuresInRow;
    const failing = (s.status === 'timeout' || s.status === 'offline') && Number.isInteger(n) && n > 0;
    // The filter's pressure has one home, the Intake filter card under the equipment (with the last reading taken with the
    // intake on): its equipment card keeps only the settings.
    if (c.sensor === 'dp') return null;
    const value = sensorValue(c.sensor, s.lastOk);
    return { status: s.status, word: failing ? `${word} · ${n} failed ${n === 1 ? 'poll' : 'polls'} in a row` : word, value };
  }
  if (c.key === 'relay') {
    if (machines?.relay?.address == null) return null;
    const status = relayState(machines.relay);
    return { status, word: status === 'online' ? 'Online' : MACHINE_WORDS[status], value: '' };
  }
  const m = c.key === 'ac' ? machines?.ac : machines?.relay?.machines?.find((x) => x.key === c.key);
  if (!m || (c.key === 'ac' && m.status === 'not-wired')) return null;
  return { status: m.status, word: MACHINE_WORDS[m.status] ?? m.status, value: '' };
}

// The line under a card's inputs. replies: as for cardStatus, with farmGateway (GET /api/settings) for the gateway card.
export const cardHint = (c, replies) => (c.key === 'gateway' ? gatewayHint(replies?.farmGateway ?? null) : c.hint);

// A card's check: its texts over the newest room, checked as the whole room is (so a clash with another card's saved address
// or the filter pressures against the fan's maximum are caught). → { values } of its fields, or { errors } of its fields and
// other: the words of a rule that blames another card's field ('' when none).
export function parseCard(c, texts, room) {
  const merged = { ...fieldTexts(room) };
  for (const name of c.fields) merged[name] = texts?.[name];
  const checked = parseRoomFields(merged, EQUIPMENT_NAMES);
  if (checked.errors) {
    const errors = {};
    let other = '';
    for (const [name, message] of Object.entries(checked.errors)) {
      if (c.fields.includes(name)) errors[name] = message;
      else other ||= message;
    }
    return { errors, other };
  }
  return { values: Object.fromEntries(c.fields.filter((name) => name in checked.values).map((name) => [name, checked.values[name]])) };
}
