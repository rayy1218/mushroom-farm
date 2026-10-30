// The task rules (spec 2026-10-30-tasks-design.md section 3): the built-in daily stage rules and upkeep rules, the crop
// notes, the farm's local day, and which tasks a room wants on a day. Pure: no database, no clock.
//
// A daily rule is { key, kind: 'daily', text, families: string[] | null, stages: string[] | null, when, slot, amount: { unit, label } | null };
// when is 'daily', 'first' (day 1 of the stage), 'last' (the stage's last day by days[stage]) or { every: N, lastDays: M | null }
// (every N days within the stage's last M days, counted from day 1 of that window; lastDays null: the whole stage).
// An upkeep rule is { key, kind: 'upkeep', text, everyDays, needs } (needs: what the room must have, 'ac' | 'humidifier' |
// 'dehumidifier' | 'co2' | 'trh', null for nothing; see upkeepApplies). The owner's own rules (key `custom:<id>`) take the same
// shapes; an own upkeep rule also carries its slot (the built-in upkeep rules have none: any time of day).

const DAY_MS = 86_400_000;
// The farm's day is Asia/Kuala_Lumpur's: UTC+8 all year (Malaysia has had no daylight saving since 1982), so a fixed offset
// gives the same dates as the time zone, without depending on the host's TZ or its ICU data.
const OFFSET_MS = 8 * 3_600_000;

export const FAMILY_OF = {
  oyster: 'oyster', black: 'oyster', pink: 'oyster', abalone: 'oyster', golden: 'oyster',
  woodear: 'woodear', reishi: 'reishi', milky: 'milky', lionsmane: 'lionsmane',
};
export const SLOTS = ['morning', 'afternoon', 'any'];

const BAGS = { unit: 'bags', label: 'Bags removed' };
const KG = { unit: 'kg', label: 'kg picked' };

export const DAILY_RULES = [
  { key: 'contamWalk', kind: 'daily', text: 'Contamination walk: take out and bag any green, orange, black or slimy bags, away from the room', families: null, stages: null, when: 'daily', slot: 'morning', amount: BAGS },
  { key: 'colonisedCheck', kind: 'daily', text: 'Colonisation check: are the bags fully white? Flag the ready ones', families: null, stages: ['spawn'], when: { every: 2, lastDays: 7 }, slot: 'any', amount: null },
  { key: 'openBags', kind: 'daily', text: "Open the bags (cut or remove the cap). Don't spray the opened bags for 2 days", families: ['oyster', 'woodear', 'lionsmane', 'reishi'], stages: ['pinning'], when: 'first', slot: 'morning', amount: null },
  { key: 'casingApply', kind: 'daily', text: 'Apply the sterilised casing soil (1–2 cm) and keep it moist with light sprays', families: ['milky'], stages: ['pinning'], when: 'first', slot: 'morning', amount: null },
  { key: 'reishiForm', kind: 'daily', text: 'Choose the form: bag closed for antlers, or open for caps (CO₂ under about 800 ppm)', families: ['reishi'], stages: ['pinning'], when: 'first', slot: 'any', amount: null },
  { key: 'humidifierCheck', kind: 'daily', text: 'Humidifier: water in, mist coming out', families: null, stages: ['pinning', 'fruiting'], when: 'daily', slot: 'morning', amount: null },
  { key: 'harvestAm', kind: 'daily', text: 'Harvest check: pick before the cap edge waves or splits; pick before any misting', families: ['oyster', 'lionsmane'], stages: ['fruiting'], when: 'daily', slot: 'morning', amount: KG },
  { key: 'harvestPm', kind: 'daily', text: 'Harvest check (afternoon)', families: ['oyster', 'lionsmane'], stages: ['fruiting'], when: 'daily', slot: 'afternoon', amount: KG },
  { key: 'harvestDaily', kind: 'daily', text: 'Harvest check', families: ['woodear', 'milky'], stages: ['fruiting'], when: 'daily', slot: 'morning', amount: KG },
  { key: 'reishiRim', kind: 'daily', text: "Check the caps' growing rim; harvest by cutting the stem, keeping about 2 cm", families: ['reishi'], stages: ['fruiting'], when: { every: 2, lastDays: null }, slot: 'any', amount: KG },
  { key: 'scrapeRecap', kind: 'daily', text: 'Scrape the bag mouths with a clean tool, leave a day, then recap', families: ['oyster'], stages: ['rest'], when: 'first', slot: 'morning', amount: null },
  { key: 'reopen', kind: 'daily', text: 'Reopen the bags for the next flush', families: ['oyster', 'woodear', 'lionsmane'], stages: ['rest'], when: 'last', slot: 'morning', amount: null },
  { key: 'footbath', kind: 'daily', text: 'Change the footbath at the door', families: null, stages: null, when: 'daily', slot: 'morning', amount: null },
  { key: 'floorClean', kind: 'daily', text: "Sweep and clean the floor after the day's work", families: null, stages: null, when: 'daily', slot: 'afternoon', amount: null },
];

// The done program's one rule (after the last flush), instead of the stage rules.
export const CLEAR_OUT = {
  key: 'clearOut', kind: 'daily', text: 'Clear out the spent blocks, then clean and disinfect the room before new blocks go in',
  families: null, stages: null, when: 'daily', slot: 'morning', amount: null,
};

export const UPKEEP_RULES = [
  { key: 'acFilter', kind: 'upkeep', text: 'Wash the aircon filter and clear the drain tray', everyDays: 7, needs: 'ac' },
  { key: 'humidifierDescale', kind: 'upkeep', text: 'Descale and sanitise the humidifier (RO water; no bleach on the disc)', everyDays: 7, needs: 'humidifier' },
  { key: 'flyTraps', kind: 'upkeep', text: 'Check the yellow fly traps; replace the full ones', everyDays: 7, needs: null },
  { key: 'dehumidifierFilter', kind: 'upkeep', text: 'Clean the dehumidifier filter and check its drain', everyDays: 14, needs: 'dehumidifier' },
  { key: 'co2Check', kind: 'upkeep', text: 'Check the CO₂ sensor against outdoor air (about 420 ppm)', everyDays: 30, needs: 'co2' },
  { key: 'rhCheck', kind: 'upkeep', text: 'Check the RH sensor (it reads high after long spells above 90 %)', everyDays: 90, needs: 'trh' },
  { key: 'acService', kind: 'upkeep', text: 'Aircon service', everyDays: 120, needs: 'ac' },
  { key: 'acChemWash', kind: 'upkeep', text: 'Aircon chemical wash', everyDays: 180, needs: 'ac' },
];

// harvest: the note of every harvest rule; a rule key: the note of that rule.
export const CROP_NOTES = {
  pink: { harvest: 'Keeps 1–3 days after picking: pick on sale days' },
  golden: { harvest: 'Fragile when mature: pick early, handle gently' },
  black: { harvest: 'Heavy spores: wear a mask' },
  abalone: { contamWalk: 'Black droplets on the mycelium are normal, not contamination' },
  lionsmane: { harvest: 'Spines 6–13 mm and still white; brown or yellow means now', humidifierCheck: 'Mist the air, never the mushroom' },
  woodear: { harvest: 'Ears 3–5 cm, before the edges thin; leave the small ones' },
};
const HARVEST_KEYS = new Set(['harvestAm', 'harvestPm', 'harvestDaily', 'reishiRim']);
// The crop's name before its note in a room of several crops.
const NOTE_NAMES = { pink: 'Pink oyster', golden: 'Golden oyster', black: 'Black oyster', abalone: 'Abalone oyster', lionsmane: "Lion's mane", woodear: 'Wood ear' };

// The rules of the room itself (made with or without crops, and while the program is done).
const isRoomRule = (r) => r.key === 'footbath' || r.key === 'floorClean' || r.key.startsWith('custom:');

const midnightUtc = (date) => Date.parse(`${date}T00:00:00Z`);

// 'YYYY-MM-DD' of `ms` on the farm's clock.
export const localDate = (ms) => new Date(ms + OFFSET_MS).toISOString().slice(0, 10);

// 'HH:MM' of `ms` on the farm's clock.
export const localTime = (ms) => new Date(ms + OFFSET_MS).toISOString().slice(11, 16);

// The ms when the farm's day `date` starts.
export const dayStart = (date) => midnightUtc(date) - OFFSET_MS;

export const addDays = (date, n) => new Date(midnightUtc(date) + n * DAY_MS).toISOString().slice(0, 10);

// b − a in whole days.
export const daysBetween = (a, b) => Math.round((midnightUtc(b) - midnightUtc(a)) / DAY_MS);

// The day of the program's stage on `date` (day 1 = the farm's date of stageSince; not capped at the length) and the stage's
// length (days[stage]). Null without a start.
export function stageDayOn(program, date) {
  if (!Number.isFinite(program?.stageSince)) return null;
  return { day: daysBetween(localDate(program.stageSince), date) + 1, length: program.days?.[program.stage] ?? null };
}

// The rules of one room after the owner's changes: built-in rules turned off are left out, upkeep intervals replaced, and the
// owner's own rules for this room added (key `custom:<id>`; everyDays null: a daily rule, else an upkeep rule).
// settings: [{ key, enabled, everyDays }]; custom: [{ id, text, rooms: number[] | null, everyDays, slot, enabled }].
export function effectiveRules({ settings = [], custom = [], roomId }) {
  const byKey = new Map(settings.map((s) => [s.key, s]));
  const on = (r) => byKey.get(r.key)?.enabled !== false;
  const daily = [CLEAR_OUT, ...DAILY_RULES].filter(on);
  const upkeep = UPKEEP_RULES.filter(on).map((r) => ({ ...r, everyDays: byKey.get(r.key)?.everyDays ?? r.everyDays }));
  for (const c of custom) {
    if (!c.enabled || (c.rooms !== null && !c.rooms.includes(roomId))) continue;
    const key = `custom:${c.id}`;
    if (c.everyDays === null) daily.push({ key, kind: 'daily', text: c.text, families: null, stages: null, when: 'daily', slot: c.slot, amount: null });
    else upkeep.push({ key, kind: 'upkeep', text: c.text, everyDays: c.everyDays, needs: null, slot: c.slot });
  }
  return { daily, upkeep };
}

function whenApplies(when, sd) {
  if (when === 'daily') return true;
  if (sd === null || sd.day < 1) return false;
  if (when === 'first') return sd.day === 1;
  if (when === 'last') return sd.length !== null && sd.day === sd.length;
  let start = 1;
  if (when.lastDays !== null) {
    if (sd.length === null) return false;
    start = Math.max(1, sd.length - when.lastDays + 1);
  }
  return sd.day >= start && (sd.day - start) % when.every === 0;
}

// The note of a rule for the room's crops: one crop's note as it is; several crops' notes each after the crop's name, joined
// with ' · '. Null without a note.
function noteOf(ruleKey, cropKeys) {
  const notes = [];
  for (const crop of cropKeys) {
    const n = CROP_NOTES[crop]?.[ruleKey] ?? (HARVEST_KEYS.has(ruleKey) ? CROP_NOTES[crop]?.harvest : undefined);
    if (n) notes.push({ crop, n });
  }
  if (notes.length === 0) return null;
  if (cropKeys.length === 1) return notes[0].n;
  return notes.map(({ crop, n }) => `${NOTE_NAMES[crop]}: ${n}`).join(' · ');
}

// The daily tasks a room wants on `date`: [{ ruleKey, text, note, slot, unit }] in the rules' order, each rule once (a room of
// several crops gets the notes of each). rules: effectiveRules(...).daily. No crops: the room's own rules only (footbath,
// floorClean, custom); a done program: clearOut and those.
export function wantedDaily({ program, crops = program?.crops ?? [], date, rules }) {
  const cropKeys = [...new Set(crops.map((c) => c.crop))];
  const families = new Set(cropKeys.map((k) => FAMILY_OF[k]).filter(Boolean));
  let picked;
  if (cropKeys.length === 0) picked = rules.filter(isRoomRule);
  else if (program.done) picked = rules.filter((r) => r.key === CLEAR_OUT.key || isRoomRule(r));
  else {
    const sd = stageDayOn(program, date);
    picked = rules.filter((r) => isRoomRule(r) || (r.key !== CLEAR_OUT.key
      && (r.stages === null || r.stages.includes(program.stage))
      && (r.families === null || r.families.some((f) => families.has(f)))
      && whenApplies(r.when, sd)));
  }
  return picked.map((r) => ({ ruleKey: r.key, text: r.text, note: noteOf(r.key, cropKeys), slot: r.slot, unit: r.amount?.unit ?? null }));
}

// Whether an upkeep rule applies to a room (a db room: dehumidifier, co2Address, trhAddress). The aircon and the humidifier
// count as always there (every room has them).
export function upkeepApplies(rule, room) {
  switch (rule.needs) {
    case 'dehumidifier': return room.dehumidifier === true;
    case 'co2': return room.co2Address !== null;
    case 'trh': return room.trhAddress !== null;
    default: return true; // 'ac', 'humidifier', null
  }
}
