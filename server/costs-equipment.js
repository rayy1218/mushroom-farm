// Costs' equipment register (spec 2026-11-12-money-truth-design.md 6): an item's checks and its view (what it writes off a
// month, what is written off to today and what is left). Pure: server/costs.js passes what it read; a refusal throws the
// CostError it is given.

import { writeOffCharges } from './costs-math.js';

export const PARTS = ['building', 'cooling', 'humidifier', 'fans', 'racks', 'other'];
export const PART_LABELS = {
  building: 'Building or container', cooling: 'Cooling', humidifier: 'Humidifier', fans: 'Fans and controls', racks: 'Racks', other: 'Other',
};
export const MAX_NAME = 60;
export const MAX_NOTE = 200;
export const MAX_AMOUNT = 10_000_000;
export const MAX_MONTHS = 240;

const realDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const money = (v) => Math.round(v * 100) / 100;

// The fields of an item from a body; old: the item an edit changes (a field left out keeps its value). today: the farm's
// date; roomOf(id): the room or null; fail(status, message, field): throws. → { name, roomId, part, boughtOn, amount,
// lifeMonths, resale, note }.
export function checkEquipment(body, { old = null, today, roomOf, fail }) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Body must be a JSON object');
  const pick = (k) => (body[k] !== undefined ? body[k] : old?.[k]);
  const rawName = pick('name');
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name) fail(400, 'Give the item a name', 'name');
  if (name.length > MAX_NAME) fail(400, `The name must be at most ${MAX_NAME} characters`, 'name');
  const roomId = pick('roomId') ?? null;
  if (roomId !== null && !(Number.isInteger(roomId) && roomOf(roomId))) fail(400, 'That room no longer exists', 'roomId');
  const part = pick('part') ?? 'other';
  if (!PARTS.includes(part)) fail(400, 'Pick a part', 'part');
  const boughtOn = pick('boughtOn');
  if (!realDate(boughtOn) || boughtOn > today) fail(400, 'Pick the day bought, up to today', 'boughtOn');
  const given = pick('amount');
  const amount = typeof given === 'number' && Number.isFinite(given) ? money(given) : NaN;
  if (!(amount > 0 && amount <= MAX_AMOUNT)) fail(400, 'Enter what it cost, over RM 0, up to RM 10,000,000', 'amount');
  const lifeMonths = pick('lifeMonths');
  if (!(Number.isInteger(lifeMonths) && lifeMonths >= 1 && lifeMonths <= MAX_MONTHS)) {
    fail(400, `Written off over must be a whole number of months from 1 to ${MAX_MONTHS}`, 'lifeMonths');
  }
  const r = pick('resale') ?? 0;
  const resale = typeof r === 'number' && Number.isFinite(r) ? money(r) : NaN;
  if (!(resale >= 0)) fail(400, 'Enter a resale value from RM 0', 'resale');
  if (resale > amount) fail(400, 'The resale value can’t be more than what it cost', 'resale');
  const text = pick('note') ?? '';
  if (typeof text !== 'string') fail(400, 'The note must be text', 'note');
  const note = text.trim();
  if (note.length > MAX_NOTE) fail(400, `The note must be at most ${MAX_NOTE} characters`, 'note');
  return { name, roomId, part, boughtOn, amount, lifeMonths, resale, note };
}

// An item as the page shows it: { ...item, roomName, monthly (its first months' write-off), written (to today), left, done }.
export function equipmentView(item, today, roomName) {
  const charges = writeOffCharges(item, '0000-01-01', today, today);
  const written = money(charges.reduce((s, c) => s + c.amount, 0));
  const total = money(item.amount - item.resale);
  return {
    ...item, roomName, monthly: money(Math.floor(((total / item.lifeMonths) * 100) + 1e-9) / 100), written, left: money(total - written),
    done: charges.length === item.lifeMonths,
  };
}
