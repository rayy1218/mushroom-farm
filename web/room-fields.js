// Every field of a room, in one place (spec 2026-10-26-room-profile-equipment-design.md section 4): the Add room dialog and the
// room page's Room profile and Equipment tabs build their inputs and check them from here, so they cannot drift. Pure (no DOM,
// so it can be tested in Node). The ranges, defaults and words are those of server/rooms.js, which stays the reference (a test
// compares them field by field).

export const NAME_MAX = 60;

// The cards of the tabs and the sections of the dialog, in order. hint: a line under the group's inputs.
export const ROOM_GROUPS = [
  { key: 'profile', title: 'Room profile' },
  { key: 'sensors', title: 'Sensors (Modbus address)' },
  { key: 'machines', title: 'Machines' },
  { key: 'power', title: 'Power and water (for the usage estimates)' },
  {
    key: 'filter', title: 'Intake filter',
    hint: "Filter change pressure: the pressure sensor's reading at which to change the filter (with the intake running). It must be above the clean drop and below the fan's maximum pressure.",
  },
];

// kind: text (the name), size (m), address (1 to 247, blank: none), check (a box), rating (from 0, two decimals at most),
// whole (a filter setting, a whole number). word: the field in the server's messages, when not its label. fitted: the box that
// shows the field (and makes it required). def: a new room's value. note: added to the unit in the label.
export const ROOM_FIELDS = [
  { name: 'name', group: 'profile', kind: 'text', label: 'Name' },
  { name: 'length', group: 'profile', kind: 'size', label: 'Length', unit: 'm', min: 0.5, max: 100, step: '0.1' },
  { name: 'width', group: 'profile', kind: 'size', label: 'Width', unit: 'm', min: 0.5, max: 100, step: '0.1' },
  { name: 'height', group: 'profile', kind: 'size', label: 'Height', unit: 'm', min: 0.5, max: 10, step: '0.1' },
  { name: 'trhAddress', group: 'sensors', kind: 'address', label: 'T/RH probe', word: 'T/RH sensor' },
  { name: 'co2Address', group: 'sensors', kind: 'address', label: 'CO₂ sensor' },
  { name: 'meterAddress', group: 'sensors', kind: 'address', label: 'Energy meter' },
  { name: 'dpAddress', group: 'sensors', kind: 'address', label: 'Filter pressure sensor' },
  { name: 'relayAddress', group: 'machines', kind: 'address', label: 'Relay module' },
  { name: 'acAddress', group: 'machines', kind: 'address', label: 'Aircon gateway' },
  { name: 'dehumidifier', group: 'machines', kind: 'check', label: 'Dehumidifier fitted (output 5 of the relay module)' },
  { name: 'lights', group: 'machines', kind: 'check', label: 'Lights fitted (output 6 of the relay module)' },
  { name: 'intakeW', group: 'power', kind: 'rating', label: 'Intake fan power', unit: 'W', def: 60, min: 0, max: 5000 },
  { name: 'exhaustW', group: 'power', kind: 'rating', label: 'Exhaust fan power', unit: 'W', def: 60, min: 0, max: 5000 },
  { name: 'circulationW', group: 'power', kind: 'rating', label: 'Circulation fan power', unit: 'W', def: 60, min: 0, max: 5000 },
  { name: 'humidifierW', group: 'power', kind: 'rating', label: 'Humidifier power', unit: 'W', def: 80, min: 0, max: 5000 },
  { name: 'humidifierLH', group: 'power', kind: 'rating', label: 'Humidifier output', unit: 'L/h', def: 2, min: 0, max: 100 },
  { name: 'acInputW', group: 'power', kind: 'rating', label: 'Aircon rated input', unit: 'W', def: 1050, min: 0, max: 20000 },
  { name: 'dehumidifierW', group: 'power', kind: 'rating', label: 'Dehumidifier power', unit: 'W', def: 380, min: 0, max: 5000, fitted: 'dehumidifier' },
  { name: 'dehumidifierLday', group: 'power', kind: 'rating', label: 'Dehumidifier capacity', unit: 'L/day', def: 20, min: 0, max: 200, fitted: 'dehumidifier' },
  { name: 'lightsW', group: 'power', kind: 'rating', label: 'Lights power', unit: 'W', def: 60, min: 0, max: 5000, fitted: 'lights' },
  { name: 'fanMaxPa', group: 'filter', kind: 'whole', label: 'Intake fan maximum pressure', unit: 'Pa', def: 200, min: 20, max: 2000 },
  { name: 'filterCleanPa', group: 'filter', kind: 'whole', label: 'Clean filter pressure drop', unit: 'Pa', def: 40, min: 5, max: 1000 },
  { name: 'filterFinalPa', group: 'filter', kind: 'whole', label: 'Filter change pressure', unit: 'Pa', def: 80, min: 5, max: 2000 },
  { name: 'filterChangeDays', group: 'filter', kind: 'whole', label: 'Change the filter every', unit: 'days', def: 30, min: 0, max: 365, note: '0: no reminder' },
];

export const fieldsOf = (group) => ROOM_FIELDS.filter((f) => f.group === group);
export const PROFILE_NAMES = fieldsOf('profile').map((f) => f.name);
export const EQUIPMENT_NAMES = ROOM_FIELDS.filter((f) => f.group !== 'profile').map((f) => f.name);

// The server compares the addresses in this order and blames the later one of a clashing pair.
const ADDRESS_ORDER = ['trhAddress', 'co2Address', 'relayAddress', 'acAddress', 'meterAddress', 'dpAddress'];

const cubic = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

// The input's label: the unit (and the note) in brackets.
export function fieldLabel(f) {
  if (!f.unit) return f.label;
  return `${f.label} (${f.unit}${f.note ? `, ${f.note}` : ''})`;
}

// Whether a field shows: a fitted machine's rating only while its box is ticked. texts: the form's texts (boxes: true/false).
export const isShown = (f, texts) => !f.fitted || texts?.[f.fitted] === true;

// A room (or null, for a new room) → the text of each input (a box: true or false). A missing number: the default, or blank.
export function fieldTexts(room) {
  return Object.fromEntries(ROOM_FIELDS.map((f) => {
    const v = room?.[f.name];
    if (f.kind === 'check') return [f.name, v === true];
    if (f.kind === 'text') return [f.name, typeof v === 'string' ? v : ''];
    return [f.name, finite(v) ? String(v) : f.def !== undefined ? String(f.def) : ''];
  }));
}

// One field's text → { value } or { error } in the server's words.
function check(f, text, texts) {
  const s = String(text ?? '').trim();
  if (f.kind === 'check') return { value: text === true };
  if (f.kind === 'text') {
    if (s === '') return { error: 'Name is required' };
    if (s.length > NAME_MAX) return { error: `Name must be ${NAME_MAX} characters or fewer` };
    return { value: s };
  }
  if (f.kind === 'size') {
    const n = s === '' ? NaN : Number(s);
    return n >= f.min && n <= f.max ? { value: n } : { error: `${f.label} must be a number from ${f.min} to ${f.max} m` };
  }
  if (f.kind === 'address') {
    if (s === '') return { value: null };
    const n = /^[0-9]{1,3}$/.test(s) ? Number(s) : NaN;
    return n >= 1 && n <= 247 ? { value: n } : { error: `${f.word ?? f.label} address must be a whole number from 1 to 247` };
  }
  if (f.kind === 'rating') {
    const n = /^[0-9]{1,5}(\.[0-9]{1,2})?$/.test(s) ? Number(s) : NaN;
    if (n >= f.min && n <= f.max) return { value: n };
    // A machine not fitted: its rating is not needed; a bad one is left out (the room keeps its own, a new room the default).
    return isShown(f, texts) ? { error: `${f.label} must be a number from ${f.min} to ${f.max} ${f.unit}` } : {};
  }
  const n = /^[0-9]{1,4}$/.test(s) ? Number(s) : NaN;
  return n >= f.min && n <= f.max ? { value: n } : { error: `${f.label} must be a whole number from ${f.min} to ${f.max} ${f.unit}` };
}

// The form's texts → { values } or { errors: { name: message } } (in field order), checked as the server does, for the fields
// named (all by default): each on its own, then the filter's pressures against each other and the addresses against each other.
export function parseRoomFields(texts, names = ROOM_FIELDS.map((f) => f.name)) {
  const values = {};
  const errors = {};
  for (const f of ROOM_FIELDS) {
    if (!names.includes(f.name)) continue;
    const r = check(f, texts?.[f.name], texts);
    if (r.error) errors[f.name] = r.error;
    else if ('value' in r) values[f.name] = r.value;
  }
  const has = (name) => name in values;
  if (has('filterCleanPa')) {
    if (has('fanMaxPa') && values.fanMaxPa <= values.filterCleanPa) errors.fanMaxPa = "Fan maximum pressure must be above the clean filter's pressure drop";
    if (has('filterFinalPa') && values.filterFinalPa <= values.filterCleanPa) errors.filterFinalPa = "Filter change pressure must be above the clean filter's pressure drop";
  }
  if (has('fanMaxPa') && has('filterFinalPa') && !errors.fanMaxPa && !errors.filterFinalPa && values.filterFinalPa >= values.fanMaxPa) {
    errors.filterFinalPa = "Filter change pressure must be below the fan's maximum pressure";
  }
  const seen = ADDRESS_ORDER.filter(has);
  seen.forEach((name, i) => {
    if (values[name] === null || errors[name] || !seen.slice(0, i).some((other) => values[other] === values[name])) return;
    errors[name] = name === 'co2Address' ? 'The two sensors need different addresses' : 'The devices in a room need different addresses';
  });
  if (Object.keys(errors).length === 0) return { values };
  return { errors: Object.fromEntries(ROOM_FIELDS.filter((f) => errors[f.name]).map((f) => [f.name, errors[f.name]])) };
}

// The body of a PUT (or POST): every room field, the form's values over the loaded room (null for a new room). PUT replaces a
// field left out, so a tab sends the fields of the other tab as the room has them.
export function roomBody(room, values) {
  return Object.fromEntries(ROOM_FIELDS.map((f) => {
    if (f.name in values) return [f.name, values[f.name]];
    if (f.kind === 'check') return [f.name, room?.[f.name] === true];
    return [f.name, room?.[f.name] ?? null];
  }));
}

// "Volume: 30.0 m³" from the three sizes as typed; a dash until all three are numbers.
export function volumeText(texts) {
  const n = (name) => (String(texts?.[name] ?? '').trim() === '' ? NaN : Number(texts[name]));
  const v = n('length') * n('width') * n('height');
  return Number.isFinite(v) ? `Volume: ${cubic.format(v)} m³` : 'Volume: — m³';
}
