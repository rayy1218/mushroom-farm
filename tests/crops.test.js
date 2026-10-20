// The crop list and its bands (web/crops.js, spec 2026-10-20-crops-and-simulation-design.md section 2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CROPS, CROP_KEYS, STAGES, FARM_TYPES, cropBands, mixBands, rangeWarnings, validateCrops, blocksOf } from '../web/crops.js';
import { validateControl, DEFAULTS } from '../server/controller.js';

test('nine crops with targets for every stage and a fruiting range', () => {
  assert.deepEqual(CROP_KEYS, ['oyster', 'black', 'pink', 'abalone', 'golden', 'woodear', 'reishi', 'milky', 'lionsmane']);
  for (const key of CROP_KEYS) {
    for (const stage of Object.keys(STAGES)) assert.equal(CROPS[key][stage].length, 3, `${key} ${stage}`);
    assert.ok(CROPS[key].range.T[0] < CROPS[key].range.T[1]);
  }
  assert.deepEqual(FARM_TYPES.ready.stages, ['fruiting', 'rest']);
  assert.deepEqual(FARM_TYPES.full.stages, ['spawn', 'pinning', 'fruiting', 'rest']);
});

test('the bands of one crop: T ± 1, RH ± 3 (at most 100), the CO₂ band of v1', () => {
  assert.deepEqual(cropBands('oyster', 'fruiting'), { co2Low: 700, co2High: 900, co2Safety: 1500, tLow: 24, tHigh: 26, rhLow: 85, rhHigh: 91 });
  assert.deepEqual(cropBands('golden', 'fruiting'), { co2Low: 600, co2High: 700, co2Safety: 1300, tLow: 23, tHigh: 25, rhLow: 85, rhHigh: 91 });
  assert.equal(cropBands('oyster', 'spawn').co2High, 4900);
  assert.equal(cropBands('oyster', 'spawn').co2Low, 4700);
});

test('every crop and stage gives bands the controller accepts', () => {
  for (const key of CROP_KEYS) {
    for (const stage of Object.keys(STAGES)) {
      assert.equal(validateControl({ ...DEFAULTS, ...cropBands(key, stage) }), null, `${key} ${stage}`);
    }
  }
});

test('a mix: the overlap of the bands, the CO₂ band of the lowest limit', () => {
  const r = mixBands([{ crop: 'oyster', blocks: 300 }, { crop: 'golden', blocks: 200 }], 'fruiting');
  assert.deepEqual(r.bands, { co2Low: 600, co2High: 700, co2Safety: 1300, tLow: 24, tHigh: 25, rhLow: 85, rhHigh: 91 });
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(mixBands([{ crop: 'oyster', blocks: 500 }], 'fruiting').bands, cropBands('oyster', 'fruiting'));
});

test('a mix without a temperature overlap: the weighted average target ± 1, with a warning', () => {
  const r = mixBands([{ crop: 'oyster', blocks: 300 }, { crop: 'milky', blocks: 100 }], 'fruiting');
  // (25 × 300 + 30 × 100) / 400 = 26.25 → 26.3
  assert.equal(r.bands.tLow, 25.3);
  assert.equal(r.bands.tHigh, 27.3);
  assert.deepEqual(r.warnings, ['Grey oyster and Milky (Calocybe indica) do not fit one temperature band']);
  assert.equal(validateControl({ ...DEFAULTS, ...r.bands }), null);
});

test('range warnings for a fruiting band outside a crop range', () => {
  const bands = { ...cropBands('oyster', 'fruiting'), tLow: 21, tHigh: 23 };
  assert.deepEqual(rangeWarnings([{ crop: 'pink', blocks: 1 }], bands, 'fruiting'), ['Temperature band 21–23 °C is outside Pink oyster\'s range 24–29 °C']);
  assert.deepEqual(rangeWarnings([{ crop: 'oyster', blocks: 1 }], cropBands('oyster', 'fruiting'), 'fruiting'), []);
  assert.deepEqual(rangeWarnings([{ crop: 'pink', blocks: 1 }], bands, 'rest'), []);
});

test('validateCrops', () => {
  assert.equal(validateCrops([{ crop: 'oyster', blocks: 500 }]), null);
  assert.equal(validateCrops([], { allowEmpty: true }), null);
  const err = (list) => validateCrops(list)?.error;
  assert.equal(err([]), 'Add at least one crop');
  assert.equal(err('x'), 'Crops must be a list');
  assert.equal(err([{ crop: 'shiitake', blocks: 1 }]), 'Unknown crop');
  assert.equal(err([{ crop: 'oyster', blocks: 1 }, { crop: 'oyster', blocks: 2 }]), 'Grey oyster is in the list twice');
  for (const blocks of [0, 1.5, 100_001, '5', null]) assert.equal(err([{ crop: 'oyster', blocks }]), 'Blocks must be a whole number from 1 to 100000', String(blocks));
  assert.equal(err(CROP_KEYS.map((crop) => ({ crop, blocks: 1 })).concat([{ crop: 'oyster', blocks: 1 }])), 'At most 9 crops');
  assert.equal(validateCrops([{ crop: 'oyster', blocks: 1 }]) === null && validateCrops([{ crop: 'oyster', blocks: 1 }], {}) === null, true);
  assert.equal(validateCrops([{ crop: 'oyster', blocks: 1 }])?.field, undefined);
  assert.equal(validateCrops([])?.field, 'crops');
  assert.equal(blocksOf([{ crop: 'oyster', blocks: 300 }, { crop: 'golden', blocks: 200 }]), 500);
});
