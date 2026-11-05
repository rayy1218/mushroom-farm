// Making blocks (spec 2026-11-05-batches-design.md 5): the checks of a recipe, a made batch's step fields, its material lines
// and a sterilising load. Pure: server/batches.js passes what it read from the database; a refusal throws a BatchError.

import { CROP_KEYS } from '../web/crops.js';
import { localDate } from './task-rules.js';
import { bad, isPlain, intIn, numIn, isTime, textOf, weightOf, MAX_BLOCKS, MAX_NOTE } from './batches-fields.js';

// A recipe's five parts of the dry weight (spec 2), each 0–100, together 100 (to 0.1).
export const PARTS = ['sawdustPct', 'branPct', 'limePct', 'gypsumPct', 'otherPct'];
const RECIPE_KEYS = ['name', 'crop', ...PARTS, 'otherName', 'waterPct', 'bagKg', 'archived'];

// A recipe's fields (spec 5), checked. was: the stored recipe (an edit: a field not given keeps its value; `{ archived: true }`
// alone archives it); taken(name): an unarchived recipe other than this one has that name, case aside. → its columns' fields.
export function checkRecipe(body, { was = null, taken = () => false } = {}) {
  if (!isPlain(body)) throw bad('Body must be a JSON object');
  const v = { ...(was ?? {}), ...Object.fromEntries(RECIPE_KEYS.filter((k) => Object.hasOwn(body, k)).map((k) => [k, body[k]])) };
  const name = textOf(v.name, 'name', 'Name');
  if (!name) throw bad('Give the recipe a name', 'name');
  const crop = v.crop || null;
  if (crop !== null && !CROP_KEYS.includes(crop)) throw bad('Pick a crop, or Any crop', 'crop');
  const parts = {};
  for (const k of PARTS) {
    const x = k === 'otherPct' ? v[k] ?? 0 : v[k];
    if (!numIn(x, 0, 100)) throw bad('Each part must be 0–100 %', k);
    parts[k] = Math.round(x * 10) / 10;
  }
  const sum = Math.round(PARTS.reduce((s, k) => s + parts[k], 0) * 10);
  if (sum !== 1000) throw bad(`The parts must add up to 100 % (now ${sum / 10} %)`, 'sawdustPct');
  const otherName = parts.otherPct > 0 ? textOf(v.otherName, 'otherName', 'The other ingredient') : null;
  if (parts.otherPct > 0 && !otherName) throw bad('Name the other ingredient', 'otherName');
  if (!numIn(v.waterPct, 30, 80)) throw bad('Water must be 30–80 %', 'waterPct');
  if (!numIn(v.bagKg, 0.2, 10)) throw bad('A bag must weigh 0.2–10 kg', 'bagKg');
  const archived = v.archived ?? false;
  if (typeof archived !== 'boolean') throw bad('archived must be true or false', 'archived');
  if (!archived && taken(name)) throw bad(`A recipe in use is called ${name} already`, 'name');
  return { name, crop, ...parts, otherName, waterPct: v.waterPct, bagKg: v.bagKg, archived: archived ? 1 : 0 };
}

// The material lines (spec 2 and 5): the mix's ingredients and its plastic bags, and the spawn (its own line, from the
// Inoculate step). Ingredients in kg, the bags in pieces, the spawn in kg or bags.
export const MIX_ITEMS = ['sawdust', 'bran', 'lime', 'gypsum', 'other', 'bags'];
export const UNITS = { sawdust: ['kg'], bran: ['kg'], lime: ['kg'], gypsum: ['kg'], other: ['kg'], bags: ['pcs'], spawn: ['kg', 'bags'] };
const ITEM_NAMES = { sawdust: 'Sawdust', bran: 'Bran', lime: 'Lime', gypsum: 'Gypsum', other: 'The other ingredient', bags: 'Plastic bags', spawn: 'Spawn' };

// lines: the material lines sent ([{ item, name?, qty, unit, stockItemId? }]), one per item of `items`; known(id): that
// Inventory item exists (null without Inventory: no item is kept); field: the field a refusal names. → the lines to store.
export function checkMaterials(lines, items, known, field = 'materials') {
  if (!Array.isArray(lines)) throw bad('Materials must be a list of lines', field);
  const seen = new Set();
  return lines.map((m) => {
    if (!isPlain(m) || !items.includes(m.item)) throw bad(`A material must be one of: ${items.join(', ')}`, field);
    const label = ITEM_NAMES[m.item];
    if (seen.has(m.item)) throw bad(`${label} is listed twice`, field);
    seen.add(m.item);
    if (!numIn(m.qty, 0, 100_000) || m.qty === 0) throw bad(`${label}: the amount must be over 0, up to 100,000`, field);
    if (!UNITS[m.item].includes(m.unit)) throw bad(`${label} is counted in ${UNITS[m.item].join(' or ')}`, field);
    const name = m.item === 'other' ? textOf(m.name, field, "The other ingredient's name") : null;
    if (m.item === 'other' && !name) throw bad('Name the other ingredient', field);
    const id = m.stockItemId ?? null;
    if (id !== null && !(Number.isInteger(id) && id > 0)) throw bad(`${label}: pick an Inventory item from the list`, field);
    if (id !== null && known && !known(id)) throw bad(`${label}: that Inventory item is gone; pick another`, field);
    return { item: m.item, name, qty: Math.round(m.qty * 1000) / 1000, unit: m.unit, stockItemId: known ? id : null };
  });
}

// The Mix, Inoculate and Incubate fields of a made batch (spec 5), checked; the materials apart (checkMaterials). was: the
// first row as stored (an edit: only the fields given are checked, against the rest as stored); null: a new mix (mixed today
// unless given; the crop and the weight from the recipe unless given). recipeOf(id): the recipe, or null. → camelCase fields
// (receivedAt with mixedAt: a made batch is received the day it is mixed).
export function checkMade(body, { was = null, now, recipeOf }) {
  if (!isPlain(body)) throw bad('Body must be a JSON object');
  const has = (k) => Object.hasOwn(body, k);
  const asked = (k) => !was || has(k);
  if (has('pricePerBlock')) throw bad("A made block's price is worked out from its materials", 'pricePerBlock');
  const out = {};
  let recipe = null;
  if (asked('recipeId')) {
    const id = body.recipeId ?? null;
    recipe = Number.isInteger(id) ? recipeOf(id) : null;
    // an archived recipe is not offered for a new mix; a batch keeps its own
    if (id !== null && (!recipe || (recipe.archived && id !== was?.recipeId))) throw bad('Pick a recipe in use, or none', 'recipeId');
    out.recipeId = id;
  }
  if (asked('mixedAt')) {
    const t = has('mixedAt') ? body.mixedAt : now;
    if (!isTime(t, now)) throw bad('Pick the day mixed, not in the future', 'mixedAt');
    out.mixedAt = t;
    out.receivedAt = t;
  }
  if (asked('crop')) {
    const crop = body.crop || recipe?.crop || null;
    if (!CROP_KEYS.includes(crop)) throw bad('Pick a crop', 'crop');
    out.crop = crop;
  }
  if (asked('blocks')) {
    if (!intIn(body.blocks, 1, MAX_BLOCKS)) throw bad('Bags must be a whole number from 1 to 100,000', 'blocks');
    out.blocks = body.blocks;
  }
  if (!was && recipe && !has('blockKg') && !has('waterPct')) Object.assign(out, { blockKg: recipe.bagKg, waterPct: recipe.waterPct });
  else if (asked('blockKg') || asked('waterPct')) Object.assign(out, weightOf(body, was));
  if (asked('note')) out.note = textOf(body.note, 'note', 'Note', MAX_NOTE);
  for (const [key, label] of [['supplier', 'Spawn supplier'], ['strain', 'Strain'], ['spawnBatch', 'Spawn batch']]) {
    if (has(key)) out[key] = textOf(body[key], key, label);
  }
  if (has('inoculatedAt')) {
    const t = body.inoculatedAt ?? null;
    if (t !== null && !isTime(t, now)) throw bad('Pick the day inoculated, not in the future', 'inoculatedAt');
    out.inoculatedAt = t;
  }
  if (has('incubation')) {
    if (![null, 'room', 'area'].includes(body.incubation)) throw bad('Pick where the blocks incubate', 'incubation');
    out.incubation = body.incubation;
  }
  for (const [key, message] of [['incubatedFrom', 'Pick the day the incubation began, not in the future'], ['incubatedTo', 'Pick the day they were ready, not in the future']]) {
    if (!has(key)) continue;
    const t = body[key] ?? null;
    if (t !== null && !isTime(t, now)) throw bad(message, key);
    out[key] = t;
  }
  // the steps' order (spec 5): inoculated on or after the mix; the incubation after the inoculation
  const after = { ...(was ?? {}), ...out };
  const day = (t) => localDate(t);
  if (after.inoculatedAt != null && day(after.inoculatedAt) < day(after.mixedAt)) {
    throw bad('Inoculated must be on or after the day mixed', has('inoculatedAt') ? 'inoculatedAt' : 'mixedAt');
  }
  if (after.incubation != null && after.inoculatedAt == null) {
    throw has('incubation') ? bad('Record the inoculation first', 'incubation') : bad('Clear the incubation before the inoculation', 'inoculatedAt');
  }
  if (after.incubation === 'area') {
    if (after.incubatedFrom == null) out.incubatedFrom = after.incubatedFrom = after.inoculatedAt; // from the inoculation by default
    if (day(after.incubatedFrom) < day(after.inoculatedAt)) {
      throw bad('The incubation begins on or after the day inoculated', has('incubatedFrom') ? 'incubatedFrom' : 'inoculatedAt');
    }
    if (after.incubatedTo != null && day(after.incubatedTo) < day(after.incubatedFrom)) throw bad('Ready must be on or after the incubation began', 'incubatedTo');
  } else {
    // in a grow room, or not yet: no area dates (an area's are cleared when it changes)
    if ((has('incubatedFrom') && body.incubatedFrom != null) || (has('incubatedTo') && body.incubatedTo != null)) {
      throw bad('Only an incubation in an area has dates', 'incubation');
    }
    if (was?.incubatedFrom != null || was?.incubatedTo != null) Object.assign(out, { incubatedFrom: null, incubatedTo: null });
  }
  return out;
}
