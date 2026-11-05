// Making blocks on the Batches pages (spec 2026-11-05-batches-design.md 4, 5 and 7), the pure parts in web/batches-math.js:
// a recipe's amounts and lines, the dialogs' boxes and bodies, the status line, the Making card's steps, the made rows of the
// page and of the myGAP 4-2 sheet.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recipeAmounts, waterGuide, recipeLine, recipeSum, sumText, recipeValues, recipeBody, mixValues, recipeFill, mixBody,
  inoculateValues, inoculateBody, loadValues, loadBody, incubateValues, incubateBody, readyBody, qtyText, bagsText, pctText,
  statusText, placeable, pageGroups, placedLine, detailFacts, makingSteps, loadLine, sterilisedNote, madePriceNote, sheetRows,
} from '../web/batches-math.js';

const nb = '\u00a0';
const dot = `${nb}· `;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5, 4); // 5 Nov 2026 12:00 farm time
const RECIPE = { id: 3, name: 'Sawdust 78', crop: 'oyster', sawdustPct: 78, branPct: 20, limePct: 1, gypsumPct: 1, otherPct: 0, otherName: null, waterPct: 60, bagKg: 2.3, archived: false };
const b = (o) => ({ id: 1, parentId: null, kind: 'made', crop: 'oyster', supplier: null, receivedAt: NOW - 2 * DAY, mixedAt: NOW - 2 * DAY, blocks: 400,
  lost: 0, good: 400, pricePerBlock: null, spawnBatch: null, strain: null, inoculatedAt: null, blockKg: 2.3, waterPct: 60, recipeId: null,
  incubation: null, incubatedFrom: null, incubatedTo: null, sterilisedAt: null, spawn: null, runId: null, roomId: null, roomName: null,
  placedAt: null, note: null, status: 'making', ...o });

test("a recipe's amounts: each part's dry kg to 0.1 kg, the bags, the water guide; its line", () => {
  assert.deepEqual(recipeAmounts(RECIPE, 400), {
    dryKgPerBag: 0.92,
    lines: [
      { item: 'sawdust', name: null, qty: 287, unit: 'kg' }, { item: 'bran', name: null, qty: 73.6, unit: 'kg' },
      { item: 'lime', name: null, qty: 3.7, unit: 'kg' }, { item: 'gypsum', name: null, qty: 3.7, unit: 'kg' },
      { item: 'bags', name: null, qty: 400, unit: 'pcs' },
    ],
    waterL: 552,
  });
  const cotton = { ...RECIPE, sawdustPct: 70, otherPct: 8, otherName: 'Cotton waste' };
  assert.deepEqual(recipeAmounts(cotton, 100).lines.find((l) => l.item === 'other'), { item: 'other', name: 'Cotton waste', qty: 7.4, unit: 'kg' });
  assert.equal(waterGuide(RECIPE, 400), `Water: about 552${nb}L for 400${nb}bags, less the water the dry ingredients already hold.`);
  assert.equal(recipeLine(RECIPE), `Grey oyster${dot}Sawdust 78${nb}%${dot}Bran 20${nb}%${dot}Lime 1${nb}%${dot}Gypsum 1${nb}%${dot}60${nb}% water${dot}2.30${nb}kg a bag`);
  assert.equal(recipeLine({ ...cotton, crop: null }).split(dot).slice(0, 2).join('|'), `Any crop|Sawdust 70${nb}%`);
  assert.ok(recipeLine(cotton).includes(`Cotton waste 8${nb}%`));
});

test('the formatter for making: bags, %, a material in its unit', () => {
  assert.equal(bagsText(1), `1${nb}bag`);
  assert.equal(bagsText(2.5), `2.5${nb}bags`);
  assert.equal(pctText(78.5), `78.5${nb}%`);
  assert.equal(qtyText(1248.333, 'kg'), `1,248.33${nb}kg`);
  assert.equal(qtyText(400, 'pcs'), `400${nb}pcs`);
  assert.equal(qtyText(30, 'bags'), `30${nb}bags`);
  assert.equal(qtyText(null, 'kg'), '—');
});

test("the Recipe dialog: its boxes, the live sum, the body", () => {
  assert.equal(recipeValues(null).waterPct, '60');
  assert.deepEqual(recipeValues(RECIPE), { name: 'Sawdust 78', crop: 'oyster', sawdustPct: '78', branPct: '20', limePct: '1', gypsumPct: '1', otherPct: '', otherName: '', waterPct: '60', bagKg: '2.3' });
  const v = recipeValues(RECIPE);
  assert.equal(recipeSum(v), 100);
  assert.equal(sumText(v), `Sum 100${nb}%`);
  assert.equal(sumText({ ...v, branPct: '21' }), `Sum 101${nb}%: the parts must add up to 100${nb}%`);
  assert.equal(sumText({ ...v, branPct: 'x' }), 'Sum —');
  assert.equal(sumText(recipeValues(null)), `Sum 0${nb}%`, 'nothing typed yet: no warning');
  assert.deepEqual(recipeBody(v).body, { name: 'Sawdust 78', crop: 'oyster', sawdustPct: 78, branPct: 20, limePct: 1, gypsumPct: 1, otherPct: 0, otherName: null, waterPct: 60, bagKg: 2.3 });
  assert.deepEqual(recipeBody({ ...v, crop: '', otherPct: '8', otherName: 'Cotton', sawdustPct: '70' }).body.otherName, 'Cotton');
  assert.equal(recipeBody({ ...v, crop: '' }).body.crop, null, 'Any crop');
  assert.equal(recipeBody({ ...v, limePct: '1,5' }).field, 'limePct');
  assert.equal(recipeBody({ ...v, waterPct: '' }).field, 'waterPct');
  assert.equal(recipeBody({ ...v, bagKg: 'two' }).field, 'bagKg');
});

test('the Mix dialog: a new mix\'s boxes, a made batch\'s, a recipe\'s fill, the body', () => {
  const fresh = mixValues(null, '2026-11-05');
  assert.deepEqual([fresh.mixedDate, fresh.recipeId, fresh.blocks, fresh['qty-sawdust'], fresh['item-bags']], ['2026-11-05', '', '', '', '']);
  const one = mixValues(b({ recipeId: 3, note: 'n', materials: [
    { item: 'sawdust', name: null, qty: 287, unit: 'kg', stockItemId: 4 }, { item: 'other', name: 'Cotton', qty: 5, unit: 'kg', stockItemId: null },
    { item: 'spawn', name: null, qty: 12, unit: 'kg', stockItemId: 9 },
  ] }), '2026-11-05');
  assert.deepEqual([one.mixedDate, one.recipeId, one.crop, one.blocks, one['qty-sawdust'], one['item-sawdust'], one['qty-other'], one.otherName, one.blockKg, one.waterPct, one.note],
    ['2026-11-03', '3', 'oyster', '400', '287', '4', '5', 'Cotton', '2.3', '60', 'n']);
  assert.equal('qty-spawn' in one, false, 'the spawn is the Inoculate step\'s');
  assert.deepEqual(recipeFill(RECIPE, 400), {
    blockKg: '2.3', waterPct: '60', otherName: '', 'qty-sawdust': '287', 'qty-bran': '73.6', 'qty-lime': '3.7', 'qty-gypsum': '3.7', 'qty-other': '', 'qty-bags': '400',
  });
  assert.deepEqual(recipeFill(RECIPE, NaN), { blockKg: '2.3', waterPct: '60', otherName: '' }, 'no bags yet: the weight only');
  const v = { ...fresh, crop: 'oyster', blocks: '400', 'qty-sawdust': '287', 'item-sawdust': '4', 'qty-bran': '73.6', 'qty-bags': '400', blockKg: '2.3', waterPct: '60' };
  assert.deepEqual(mixBody(v).body, {
    mixedAt: Date.UTC(2026, 10, 4, 16), recipeId: null, crop: 'oyster', blocks: 400,
    materials: [
      { item: 'sawdust', name: null, qty: 287, unit: 'kg', stockItemId: 4 }, { item: 'bran', name: null, qty: 73.6, unit: 'kg', stockItemId: null },
      { item: 'bags', name: null, qty: 400, unit: 'pcs', stockItemId: null },
    ],
    blockKg: 2.3, waterPct: 60, note: '',
  });
  assert.equal('crop' in mixBody({ ...v, crop: '', recipeId: '3' }).body, false, "an empty crop: the recipe's");
  assert.equal(mixBody({ ...v, blocks: '40.5' }).field, 'blocks');
  assert.equal(mixBody({ ...v, 'qty-lime': 'a bit' }).field, 'qty-lime');
  assert.equal(mixBody({ ...v, mixedDate: '' }).field, 'mixedDate');
  assert.deepEqual(mixBody({ ...v, 'qty-other': '5', otherName: 'Cotton' }).body.materials[2], { item: 'other', name: 'Cotton', qty: 5, unit: 'kg', stockItemId: null });
  const edit = mixBody(v, { edit: { cropEditable: false, blocksEditable: false } }).body;
  assert.equal('crop' in edit || 'blocks' in edit, false);
});

test('the Inoculate, Sterilise, Incubate and Ready to fruit dialogs: boxes and bodies', () => {
  const inoculated = b({ inoculatedAt: NOW - DAY, supplier: 'Spawn Co', spawnBatch: '0912', materials: [{ item: 'spawn', qty: 30, unit: 'bags', stockItemId: 9 }] });
  assert.deepEqual(inoculateValues(inoculated, '2026-11-05'), { inoculatedDate: '2026-11-04', supplier: 'Spawn Co', strain: '', spawnBatch: '0912', spawnQty: '30', spawnUnit: 'bags', spawnItem: '9' });
  assert.deepEqual(inoculateValues(b({}), '2026-11-05').inoculatedDate, '2026-11-05', 'today by default');
  const v = { inoculatedDate: '2026-11-04', supplier: 'Spawn Co', strain: '', spawnBatch: '0912', spawnQty: '12', spawnUnit: 'kg', spawnItem: '7' };
  assert.deepEqual(inoculateBody(v).body, { inoculatedAt: Date.UTC(2026, 10, 3, 16), supplier: 'Spawn Co', strain: '', spawnBatch: '0912', spawn: { qty: 12, unit: 'kg', stockItemId: 7 } });
  assert.equal(inoculateBody({ ...v, spawnQty: '' }).body.spawn, null, 'no amount: no spawn line');
  assert.equal(inoculateBody({ ...v, spawnQty: 'x' }).field, 'spawnQty');
  assert.equal(inoculateBody({ ...v, inoculatedDate: '' }).field, 'inoculatedDate');

  assert.deepEqual(loadValues(null, b({ loads: [{ bags: 300 }] }), NOW), { method: 'steam', bags: '100', hotDate: '2026-11-05', hotTime: '12:00', holdH: '', tempC: '' }, 'the bags not yet sterilised');
  assert.equal(loadValues(null, b({ loads: [{ bags: 400 }] }), NOW).bags, '400', 'every bag was: all of them again');
  const load = { method: 'pressure', bags: 200, hotAt: Date.UTC(2026, 10, 4, 0, 12), holdH: 2.5, tempC: 121, worker: 'Ali' };
  assert.deepEqual(loadValues(load, b({}), NOW), { method: 'pressure', bags: '200', hotDate: '2026-11-04', hotTime: '08:12', holdH: '2.5', tempC: '121' });
  const lv = { method: 'steam', bags: '400', hotDate: '2026-11-04', hotTime: '8:12', holdH: '6', tempC: '98', worker: 'Ali' };
  assert.deepEqual(loadBody(lv).body, { method: 'steam', bags: 400, hotAt: Date.UTC(2026, 10, 4, 0, 12), holdH: 6, tempC: 98, worker: 'Ali' });
  assert.equal(loadBody({ ...lv, hotTime: '25:00' }).field, 'hotTime');
  assert.equal(loadBody({ ...lv, hotDate: '' }).field, 'hotDate');
  assert.equal(loadBody({ ...lv, bags: '' }).field, 'bags');
  assert.equal(loadBody({ ...lv, holdH: '' }).field, 'holdH');
  assert.equal(loadBody({ ...lv, tempC: 'hot' }).field, 'tempC');
  assert.equal('worker' in loadBody({ ...lv, worker: '' }, { edit: true }).body, false, 'an Edit with no name keeps the stored one');

  assert.deepEqual(incubateValues(b({ inoculatedAt: NOW - DAY })), { incubation: '', fromDate: '2026-11-04', toDate: '' });
  assert.deepEqual(incubateValues(b({ inoculatedAt: NOW - 2 * DAY, incubation: 'area', incubatedFrom: NOW - DAY, incubatedTo: NOW })), { incubation: 'area', fromDate: '2026-11-04', toDate: '2026-11-05' });
  assert.deepEqual(incubateBody({ incubation: 'area', fromDate: '2026-11-04', toDate: '' }).body, { incubation: 'area', incubatedFrom: Date.UTC(2026, 10, 3, 16), incubatedTo: null });
  assert.deepEqual(incubateBody({ incubation: 'room', fromDate: '2026-11-04', toDate: '2026-11-05' }).body, { incubation: 'room', incubatedFrom: null, incubatedTo: null });
  assert.deepEqual(incubateBody({ incubation: '', fromDate: '', toDate: '' }).body, { incubation: null, incubatedFrom: null, incubatedTo: null }, 'not yet');
  assert.equal(incubateBody({ incubation: 'area', fromDate: '', toDate: '' }).field, 'fromDate');
  assert.deepEqual(readyBody({ readyDate: '2026-11-05' }).body, { incubatedTo: Date.UTC(2026, 10, 4, 16) });
  assert.equal(readyBody({ readyDate: '' }).field, 'readyDate');
});
test('a made batch\'s status line, step by step; Put into a room once it can go in', () => {
  const today = '2026-11-05';
  assert.equal(statusText(b({}), today), `Mixed 3${nb}Nov`);
  assert.equal(statusText(b({ sterilisedAt: NOW - DAY - 3_600_000 }), today), `Sterilised 4${nb}Nov`);
  assert.equal(statusText(b({ sterilisedAt: NOW - DAY, inoculatedAt: NOW - DAY }), today), `Inoculated 4${nb}Nov`);
  assert.equal(statusText(b({ inoculatedAt: NOW - 12 * DAY, incubation: 'area', incubatedFrom: NOW - 11 * DAY }), today), `Incubating since 25${nb}Oct${dot}day 12`);
  assert.equal(statusText(b({ incubation: 'area', incubatedFrom: NOW - 11 * DAY, incubatedTo: NOW, status: 'waiting' }), today), 'Ready to fruit');
  assert.equal(statusText(b({ status: 'placed', roomName: 'Container 2' }), today), `In${nb}Container${nb}2`);
  assert.equal(statusText(b({ kind: 'bought', status: 'waiting' }), today), 'Waiting');
  assert.equal(placeable(b({})), false, 'not inoculated');
  assert.equal(placeable(b({ inoculatedAt: NOW - DAY })), true, 'to incubate in a grow room');
  assert.equal(placeable(b({ inoculatedAt: NOW - DAY, incubation: 'area', incubatedFrom: NOW - DAY })), false, 'in an area until ready');
  assert.equal(placeable(b({ status: 'waiting' })), true);
  assert.equal(placeable(b({ status: 'placed' })), false);
});

test('the page: making batches in their own group; a made batch in a room says when it was made; its facts', () => {
  const g = pageGroups([b({ id: 1 }), b({ id: 2, kind: 'bought', status: 'waiting' }), b({ id: 3, status: 'waiting', incubation: 'area', incubatedTo: NOW })]);
  assert.deepEqual([g.making.map((x) => x.id), g.waiting.map((x) => x.id)], [[1], [2, 3]]);
  assert.equal(placedLine(b({ supplier: 'Spawn Co', spawnBatch: '0912' }), '2026-11-05'), `Spawn Co${dot}spawn batch 0912${dot}made 3${nb}Nov`);
  const one = b({ supplier: 'Spawn Co', spawnBatch: '0912', deliveryRef: 'never shown', dryKg: 0.92, pricePerBlock: 0.7119,
    delivery: [b({ blocks: 300 }), b({ id: 2, parentId: 1, blocks: 100 })] });
  assert.deepEqual(detailFacts(one), [
    ['Spawn supplier', 'Spawn Co'], ['Spawn batch', '0912'], ['Block weight', `2.30${nb}kg${dot}60${nb}% water${dot}0.92${nb}kg dry`],
    ['Price per block', `RM${nb}0.71`], ['Blocks made', `400${nb}blocks${dot}RM${nb}284.76`],
  ]);
});

test('the Making card\'s steps: what each recorded, and what can be done next', () => {
  const today = '2026-11-05';
  const mk = b({
    recipe: { name: 'Sawdust 78' }, supplier: 'Spawn Co', strain: 'PL-27', spawnBatch: '0912', inoculatedAt: NOW - DAY, incubation: 'area', incubatedFrom: NOW - DAY,
    materials: [
      { item: 'sawdust', qty: 287, unit: 'kg', itemName: 'Sawdust (Kilang Jaya)' }, { item: 'other', name: 'Cotton waste', qty: 10, unit: 'kg' },
      { item: 'spawn', qty: 12, unit: 'kg' },
    ],
    loads: [],
  });
  const steps = makingSteps(mk, today);
  assert.deepEqual(steps.map((s) => [s.key, s.done, s.can]), [['mix', true, true], ['sterilise', false, true], ['inoculate', true, true], ['incubate', true, true]]);
  assert.deepEqual(steps[0].lines, [`Mixed 3 Nov${dot}recipe Sawdust 78${dot}400${nb}bags`, `Sawdust${dot}287${nb}kg${dot}from Sawdust (Kilang Jaya)`, `Cotton waste${dot}10${nb}kg`]);
  assert.deepEqual(steps[2].lines, [`Inoculated 4 Nov${dot}Spawn Co${dot}PL-27${dot}batch 0912${dot}12${nb}kg spawn`]);
  assert.deepEqual(steps[3].lines, [`In an area since 4 Nov${dot}day 2`]);
  assert.deepEqual(makingSteps({ ...mk, incubatedTo: NOW }, today)[3].lines, [`In an area since 4 Nov${dot}ready to fruit 5 Nov`]);
  const fresh = makingSteps(b({}), today);
  assert.deepEqual([fresh[0].lines[0], fresh[2].lines, fresh[3].can, fresh[3].why], [`Mixed 3 Nov${dot}no recipe${dot}400${nb}bags`, [], false, 'Record the inoculation first']);
  const inRoom = makingSteps(b({ inoculatedAt: NOW - DAY, incubation: 'room', placedAt: NOW, roomName: 'Container 1', status: 'placed' }), today)[3];
  assert.deepEqual([inRoom.lines, inRoom.can, inRoom.why], [[`In a grow room${dot}Container 1`], false, 'Some blocks are in a room']);
  assert.deepEqual(makingSteps(b({ inoculatedAt: NOW - DAY, incubation: 'room' }), today)[3].lines, ['In a grow room: put the blocks into a room']);
});

test('a load\'s line, the amber note of bags not yet sterilised, the price note', () => {
  assert.equal(loadLine({ hotAt: Date.UTC(2026, 10, 4, 0, 12), method: 'steam', bags: 400, tempC: 98, holdH: 6, worker: 'Ali' }, '2026-11-05'),
    `4 Nov 08:12${dot}Atmospheric steam${dot}400${nb}bags${dot}98${nb}°C for 6${nb}h${dot}Ali`);
  assert.equal(sterilisedNote(b({ loads: [{ bags: 300 }] })), '300 of 400 bags sterilised');
  assert.equal(sterilisedNote(b({ loads: [{ bags: 300 }, { bags: 100 }] })), null);
  assert.equal(sterilisedNote(b({ loads: [] })), null);
  assert.match(madePriceNote(b({ pricePerBlock: 0.71 })), /^The price per block is the materials/);
  assert.match(madePriceNote(b({})), /^No price per block yet/);
});

test('the 4-2 sheet: a made batch\'s receipt is its spawn, its use "made into" the blocks, then its placements', () => {
  const range = { from: '2026-11-01', to: '2026-11-30', today: '2026-11-05' };
  const first = b({ id: 5, blocks: 300, supplier: 'Spawn Co', strain: 'PL-27', spawnBatch: '0912', receivedAt: Date.UTC(2026, 10, 1, 4),
    mixedAt: Date.UTC(2026, 10, 1, 4), inoculatedAt: Date.UTC(2026, 10, 3, 4), spawn: { qty: 12, unit: 'kg', unitCost: 8 }, pricePerBlock: 0.71 });
  const part = b({ id: 6, parentId: 5, blocks: 100, strain: 'PL-27', spawnBatch: '0912', placedAt: Date.UTC(2026, 10, 4, 4), usedBlocks: 100, runId: 4,
    roomName: 'Container 1', runStartedAt: Date.UTC(2026, 9, 3, 4), status: 'placed' });
  assert.deepEqual(sheetRows([part, first], range), [
    ['3 Nov 2026', `Grey oyster spawn${dot}PL-27${dot}batch 0912`, `12${nb}kg`, `RM${nb}8.00`, '', '', '', '', '', 'Spawn Co'],
    ['3 Nov 2026', `Grey oyster spawn${dot}PL-27${dot}batch 0912`, '', '', `12${nb}kg`, `made into 400${nb}blocks`, '', '', '', ''],
    ['4 Nov 2026', `Grey oyster blocks${dot}PL-27${dot}batch 0912`, '', '', `100${nb}blocks`, `Container 1${dot}run of 3 Oct`, '', '', '', ''],
  ]);
  assert.deepEqual(sheetRows([{ ...first, inoculatedAt: null, spawn: null }], range), [], 'not inoculated yet: nothing to write');
  assert.equal(sheetRows([{ ...first, spawn: { qty: 30, unit: 'bags', unitCost: null } }], range)[0][3], '', 'no price: blank to write in');
  assert.equal(sheetRows([{ ...first, spawn: null }], range)[0][2], '', 'no spawn line: blank');
});
