// Making blocks (spec 2026-11-05-batches-design.md 5): the checks of a recipe, a made batch's step fields, its material lines
// and a sterilising load. Pure: server/batches.js passes what it read from the database; a refusal throws a BatchError.

import { CROP_KEYS } from '../web/crops.js';
import { bad, isPlain, numIn, textOf } from './batches-fields.js';

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
