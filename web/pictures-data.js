// The farm's pictures as markup (spec 2026-11-03-pictures-design.md), and which picture a crop, a task, an equipment card or
// a Machines row takes. Pure (no DOM, so it can be tested in Node); web/pictures.js makes the <svg>. Every picture is the
// inside of a 48 × 48 viewBox, coloured only by the --p-* tokens of web/styles.css and a crop's two hues (--c, --c2), and the
// markup is constant: no text a person typed ever goes into it.

import { CROP_HUES, CROPS, bag, STAGE_KEYS } from './pictures-crops.js';
import { MACHINES, SENSORS } from './pictures-machines.js';
import { TASKS } from './pictures-tasks.js';

export { CROPS, MACHINES, SENSORS, TASKS, STAGE_KEYS };

const DEFAULT_CROP = 'oyster';
const has = (table, key) => typeof key === 'string' && Object.hasOwn(table, key);
const cropKey = (key) => (has(CROPS, key) ? key : DEFAULT_CROP);

// A crop's two hues as token names: [cap, gills and stems]; the grey oyster's for no crop or one this page does not know.
export const hues = (key) => CROP_HUES[cropKey(key)];

// The markup of a picture. kind: 'crop', 'bag' (stage: a stage or 'done'), 'machine', 'sensor' or 'task' (crop: the room's
// main crop, which a harvest task holds). An unknown key: the crop's grey oyster, the task's generic picture, '' otherwise.
export function markup(kind, key, { crop = null, stage = 'fruiting' } = {}) {
  if (kind === 'crop') return CROPS[cropKey(key)];
  if (kind === 'bag') return bag(cropKey(key), STAGE_KEYS.includes(stage) ? stage : 'fruiting');
  if (kind === 'machine') return has(MACHINES, key) ? MACHINES[key] : '';
  if (kind === 'sensor') return has(SENSORS, key) ? SENSORS[key] : '';
  if (kind === 'task') return (has(TASKS, key) ? TASKS[key] : TASKS.generic).replace('CROP', CROPS[cropKey(crop)]);
  return '';
}

// A task row's picture: its rule's, 'own' for a rule of the owner's (custom:<id>), 'longTerm' for a long-term task, else
// 'generic' (a rule this page does not know yet).
export function taskPicture(task) {
  if (task?.kind === 'longterm') return 'longTerm';
  const key = task?.ruleKey ?? '';
  if (key.startsWith('custom:')) return 'own';
  return has(TASKS, key) ? key : 'generic';
}

// An Equipment card's picture (the card keys of web/equipment-cards.js): [kind, key].
const EQUIPMENT = {
  gateway: ['sensor', 'gateway'], trh: ['sensor', 'trh'], co2: ['sensor', 'co2'], meter: ['sensor', 'meter'], filter: ['sensor', 'dp'],
  relay: ['sensor', 'relay'], ac: ['machine', 'aircon'],
};
export const equipmentPicture = (cardKey) => EQUIPMENT[cardKey] ?? ['machine', cardKey];

// A Machines row's picture (the row keys of web/room-card-math.js).
const ROWS = { ac: 'aircon', circ: 'circulation', hu: 'humidifier', dh: 'dehumidifier' };
export const machinePicture = (rowKey) => ROWS[rowKey] ?? rowKey;
