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
import { waitingLong, deliveryLine, priceOverNote, itemsFor, itemPicker, timeProblem, lastSpawn, nextStep, rowAction, withWeight } from '../web/batches-math.js';
import { checkMaterials } from '../server/batches-making.js';

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
  assert.equal(recipeLine(RECIPE), `Grey oyster${dot}Sawdust${nb}78${nb}%${dot}Bran${nb}20${nb}%${dot}Lime${nb}1${nb}%${dot}Gypsum${nb}1${nb}%${dot}60${nb}% water${dot}2.30${nb}kg a bag`);
  assert.equal(recipeLine({ ...cotton, crop: null }).split(dot).slice(0, 2).join('|'), `Any crop|Sawdust${nb}70${nb}%`);
  assert.ok(recipeLine(cotton).includes(`Cotton waste${nb}8${nb}%`));
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
  assert.equal(sumText({ ...v, branPct: '21' }), `Sum 101${nb}% of 100${nb}%`, 'the target said');
  assert.equal(sumText({ ...v, branPct: '18' }), `Sum 98${nb}% of 100${nb}%`);
  assert.equal(sumText({ ...v, branPct: 'x' }), 'Sum —');
  assert.equal(sumText(recipeValues(null)), `Sum 0${nb}% of 100${nb}%`, 'nothing typed yet: the target');
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
  assert.deepEqual(steps[0].lines, [`Mixed 3${nb}Nov${dot}recipe Sawdust 78${dot}400${nb}bags`, `Sawdust${dot}287${nb}kg${dot}from Sawdust (Kilang Jaya)`, `Cotton waste${dot}10${nb}kg`]);
  assert.deepEqual(steps[2].lines, [`Inoculated 4${nb}Nov${dot}Spawn Co${dot}PL-27${dot}batch${nb}0912${dot}12${nb}kg spawn`]);
  assert.deepEqual(steps[3].lines, [`In an area since 4${nb}Nov${dot}day 2`]);
  assert.deepEqual(makingSteps({ ...mk, incubatedTo: NOW }, today)[3].lines, [`In an area since 4${nb}Nov${dot}ready to fruit 5${nb}Nov`]);
  const fresh = makingSteps(b({}), today);
  assert.deepEqual([fresh[0].lines[0], fresh[2].lines, fresh[3].can, fresh[3].why], [`Mixed 3${nb}Nov${dot}no recipe${dot}400${nb}bags`, [], false, 'Record the inoculation first']);
  const inRoom = makingSteps(b({ inoculatedAt: NOW - DAY, incubation: 'room', placedAt: NOW, roomName: 'Container 1', status: 'placed' }), today)[3];
  assert.deepEqual([inRoom.lines, inRoom.can, inRoom.why], [[`In a grow room${dot}Container 1`], false, 'Some blocks are in a room']);
  assert.deepEqual(makingSteps(b({ inoculatedAt: NOW - DAY, incubation: 'room' }), today)[3].lines, ['In a grow room: put the blocks into a room']);
});

test('a load\'s line, the amber note of bags not yet sterilised, the price note', () => {
  assert.equal(loadLine({ hotAt: Date.UTC(2026, 10, 4, 0, 12), method: 'steam', bags: 400, tempC: 98, holdH: 6, worker: 'Ali' }, '2026-11-05'),
    `4${nb}Nov${nb}08:12${dot}Atmospheric steam${dot}400${nb}bags${dot}98${nb}°C for 6${nb}h${dot}Ali`);
  assert.equal(sterilisedNote(b({ loads: [{ bags: 300 }] })), `300 of 400${nb}bags sterilised`);
  assert.equal(sterilisedNote(b({ loads: [{ bags: 300 }, { bags: 100 }] })), null);
  assert.equal(sterilisedNote(b({ loads: [] })), null);
  assert.match(madePriceNote(b({ pricePerBlock: 0.71 })), /^The price per block is the materials/);
  assert.match(madePriceNote(b({})), /^No price per block yet/);
  assert.match(madePriceNote(b({ inventory: true })), /^No price per block yet/);
  assert.equal(madePriceNote(b({ inventory: false })), 'The price per block is worked out once Inventory has the materials and their purchase prices.');
});

test('the 4-2 sheet: a made batch\'s receipt is its spawn, its use "made into" the blocks, then its placements', () => {
  const range = { from: '2026-11-01', to: '2026-11-30', today: '2026-11-05' };
  const first = b({ id: 5, blocks: 300, supplier: 'Spawn Co', strain: 'PL-27', spawnBatch: '0912', receivedAt: Date.UTC(2026, 10, 1, 4),
    mixedAt: Date.UTC(2026, 10, 1, 4), inoculatedAt: Date.UTC(2026, 10, 3, 4), spawn: { qty: 12, unit: 'kg', unitCost: 8 }, pricePerBlock: 0.71 });
  const part = b({ id: 6, parentId: 5, blocks: 100, strain: 'PL-27', spawnBatch: '0912', placedAt: Date.UTC(2026, 10, 4, 4), usedBlocks: 100, runId: 4,
    roomName: 'Container 1', runStartedAt: Date.UTC(2026, 9, 3, 4), status: 'placed' });
  assert.deepEqual(sheetRows([part, first], range), [
    ['3 Nov 2026', `Grey oyster spawn${dot}PL-27${dot}batch 0912`, `12${nb}kg`, `RM${nb}8.00`, '', '', '', '', '', 'Spawn Co'],
    ['3 Nov 2026', `Grey oyster spawn${dot}PL-27${dot}batch 0912`, '', '', `12${nb}kg`, `made into 400${nb}blocks`, '', '', '', 'made on the farm'],
    ['4 Nov 2026', `Grey oyster blocks made 1${nb}Nov${dot}PL-27${dot}batch 0912`, '', '', `100${nb}blocks`, `Container 1${dot}run of 3 Oct`, '', '', '', 'made on the farm'],
  ]);
  assert.deepEqual(sheetRows([{ ...first, inoculatedAt: null, spawn: null }], range), [], 'not inoculated yet: nothing to write');
  assert.equal(sheetRows([{ ...first, spawn: { qty: 30, unit: 'bags', unitCost: null } }], range)[0][3], '', 'no price: blank to write in');
  assert.equal(sheetRows([{ ...first, spawn: null }], range)[0][2], '', 'no spawn line: blank');
});

test("the Today page's Blocks waiting: a made batch waits from the day it was ready to fruit, not from its mix", () => {
  const ready = b({ status: 'waiting', receivedAt: NOW - 30 * DAY, mixedAt: NOW - 30 * DAY, inoculatedAt: NOW - 29 * DAY, incubation: 'area',
    incubatedFrom: NOW - 29 * DAY, incubatedTo: NOW - DAY });
  assert.deepEqual(waitingLong([ready], NOW), []);
  assert.deepEqual(waitingLong([{ ...ready, incubatedTo: NOW - 4 * DAY }], NOW).map((x) => x.text), [`400 Grey oyster blocks waiting 4${nb}days`]);
});

test("a delivery's row still being made says Making", () => {
  assert.equal(deliveryLine(b({ blocks: 300 })), `300${nb}blocks${dot}Making`);
});

test('the amber note of a made price over RM 1,000 a block', () => {
  assert.equal(priceOverNote(b({ priceOver: true })), `The materials' price comes to over RM${nb}1,000 a block: check Inventory's purchase prices.`);
  assert.equal(priceOverNote(b({ pricePerBlock: 0.71 })), null);
  assert.equal(priceOverNote(b({ priceOver: false })), null);
});

// ---- part 2 UI fixes (2026-11-05) ----

test("Inventory's items a line can draw on follow the server's rule; a stored item gone starts the picker on none", () => {
  const items = [
    { id: 1, name: 'Sawdust', kind: 'material', unit: 'kg' }, { id: 2, name: 'Bags 9x14', kind: 'material', unit: 'pcs' },
    { id: 3, name: 'Spawn kg', kind: 'spawn', unit: 'kg' }, { id: 4, name: 'Spawn bags', kind: 'spawn', unit: 'pcs' },
    { id: 5, name: 'Diesel', kind: 'material', unit: 'L' },
  ];
  const itemOf = (id) => items.find((s) => s.id === id) ?? null;
  for (const [item, unit] of [['sawdust', 'kg'], ['bags', 'pcs'], ['spawn', 'kg'], ['spawn', 'bags']]) {
    const offered = itemsFor(items, unit).map((s) => s.id);
    for (const s of items) { // offered exactly when the server takes the line with it
      let ok = true;
      try { checkMaterials([{ item, qty: 1, unit, stockItemId: s.id }], [item], itemOf); } catch { ok = false; }
      assert.equal(offered.includes(s.id), ok, `${item} in ${unit} with ${s.name}`);
    }
  }
  assert.deepEqual(itemPicker(itemsFor(items, 'kg'), ''), { value: '', options: [['', 'No Inventory item'], ['1', 'Sawdust'], ['3', 'Spawn kg']], note: null });
  assert.deepEqual(itemPicker([items[0]], '1', 'Sawdust').value, '1');
  assert.deepEqual(itemPicker([items[0]], '9', 'Old sawdust'), { value: '9', options: [['', 'No Inventory item'], ['1', 'Sawdust'], ['9', 'Old sawdust']], note: null }, 'archived: kept by its name');
  assert.deepEqual(itemPicker([items[0]], '9', null), { value: '', options: [['', 'No Inventory item'], ['1', 'Sawdust']], note: 'Its Inventory item is gone: pick another' });
});

test('the Mix body: an amount of 0 and an unnamed other on their boxes; the lines sent only when changed', () => {
  const v = { ...mixValues(null, '2026-11-05'), crop: 'oyster', blocks: '400', 'qty-sawdust': '287', 'item-sawdust': '4', 'qty-bags': '400' };
  assert.deepEqual(mixBody({ ...v, 'qty-bran': '0' }), { field: 'qty-bran', message: 'Give an amount over 0, or leave it empty' });
  assert.deepEqual(mixBody({ ...v, 'qty-other': '5', otherName: ' ' }), { field: 'otherName', message: 'Name the other ingredient' });
  const stored = [
    { item: 'sawdust', name: null, qty: 287, unit: 'kg', stockItemId: 4 }, { item: 'bags', name: null, qty: 400, unit: 'pcs', stockItemId: null },
    { item: 'spawn', name: null, qty: 12, unit: 'kg', stockItemId: 9 },
  ];
  const edit = { cropEditable: true, blocksEditable: true };
  assert.equal('materials' in mixBody({ ...v, note: 'a note' }, { edit, stored }).body, false, 'unchanged: not sent (a priceOver batch takes a note)');
  assert.equal('materials' in mixBody({ ...v, 'qty-sawdust': '290' }, { edit, stored }).body, true);
  assert.equal('materials' in mixBody({ ...v, 'item-sawdust': '' }, { edit, stored }).body, true, 'a gone item cleared: sent');
  assert.equal('materials' in mixBody(v).body, true, 'a new mix sends them');
});

test('the Inoculate body: the spawn sent only when changed; 0 on its box', () => {
  const v = { inoculatedDate: '2026-11-04', supplier: 'Spawn Co', strain: '', spawnBatch: '0912', spawnQty: '12', spawnUnit: 'kg', spawnItem: '9' };
  const stored = { item: 'spawn', name: null, qty: 12, unit: 'kg', stockItemId: 9 };
  assert.equal('spawn' in inoculateBody(v, { stored }).body, false);
  assert.deepEqual(inoculateBody({ ...v, spawnQty: '13' }, { stored }).body.spawn, { qty: 13, unit: 'kg', stockItemId: 9 });
  assert.equal(inoculateBody({ ...v, spawnQty: '' }, { stored }).body.spawn, null, 'cleared: sent');
  assert.equal('spawn' in inoculateBody({ ...v, spawnQty: '' }, { stored: null }).body, false, 'none, still none');
  assert.equal(inoculateBody({ ...v, spawnQty: '0' }).field, 'spawnQty');
});

test("a server's time refusal on a valid date shows under the time box", () => {
  const p = { field: 'hotDate', message: 'Pick a time from the day mixed to now' };
  assert.deepEqual(timeProblem(p, { date: '2026-11-05', min: '2026-11-03', max: '2026-11-05', dateBox: 'hotDate', timeBox: 'hotTime' }), { ...p, field: 'hotTime' });
  assert.deepEqual(timeProblem(p, { date: '2026-11-02', min: '2026-11-03', max: '2026-11-05', dateBox: 'hotDate', timeBox: 'hotTime' }), p);
  assert.deepEqual(timeProblem({ message: 'x' }, { date: '2026-11-05', min: '', max: '2026-11-05', dateBox: 'hotDate', timeBox: 'hotTime' }), { message: 'x' });
  assert.equal(timeProblem({ ok: true }, { dateBox: 'hotDate', timeBox: 'hotTime' }).ok, true);
});

test('blocks made over a split delivery: the load defaults, the sterilised note, the Mix line', () => {
  const split = b({ blocks: 300, delivery: [b({ blocks: 300 }), b({ id: 2, parentId: 1, blocks: 100, placedAt: NOW, status: 'placed' })] });
  assert.equal(loadValues(null, { ...split, loads: [{ bags: 250, hotAt: NOW - DAY, method: 'steam', tempC: 98, holdH: 6 }] }, NOW).bags, '150');
  assert.equal(sterilisedNote({ ...split, loads: [{ bags: 300 }] }), `300 of 400${nb}bags sterilised`);
  assert.equal(makingSteps(split, '2026-11-05')[0].lines[0], `Mixed 3${nb}Nov${dot}no recipe${dot}400${nb}bags (this part 300)`);
  assert.equal(makingSteps(b({}), '2026-11-05')[0].lines[0], `Mixed 3${nb}Nov${dot}no recipe${dot}400${nb}bags`);
});

test("a new load's method, temperature and hold from the batch's last load", () => {
  const loads = [
    { id: 1, bags: 200, hotAt: NOW - 2 * DAY, method: 'pressure', tempC: 121, holdH: 2.5 },
    { id: 2, bags: 100, hotAt: NOW - DAY, method: 'steam', tempC: 98, holdH: 6 },
  ];
  assert.deepEqual(loadValues(null, b({ loads }), NOW), { method: 'steam', bags: '100', hotDate: '2026-11-05', hotTime: '12:00', holdH: '6', tempC: '98' });
  assert.deepEqual(loadValues(null, b({ loads: [] }), NOW), { method: 'steam', bags: '400', hotDate: '2026-11-05', hotTime: '12:00', holdH: '', tempC: '' });
});

test('no load recorded once inoculated: the amber note says so', () => {
  assert.equal(sterilisedNote(b({ loads: [], inoculatedAt: NOW, blocks: 250 })), `No load recorded: 250${nb}bags inoculated without a sterilising load`);
  assert.equal(sterilisedNote(b({ loads: [] })), null, 'not inoculated yet: the step says Not yet.');
});

test("the spawn's supplier and strain from the last made batch of the crop", () => {
  const list = [
    b({ id: 1, supplier: 'Old Spawn', strain: 'PL-1', inoculatedAt: NOW - 20 * DAY }),
    b({ id: 2, supplier: 'Spawn Co', strain: 'PL-27', inoculatedAt: NOW - 5 * DAY }),
    b({ id: 3, crop: 'pink', supplier: 'Pink Co', strain: 'P-1', inoculatedAt: NOW - DAY }),
    b({ id: 4, kind: 'bought', supplier: 'Agro', strain: 'X', inoculatedAt: NOW }),
    b({ id: 5, parentId: 2, supplier: 'Spawn Co', strain: 'PL-27', inoculatedAt: NOW - 5 * DAY }),
  ];
  assert.deepEqual(lastSpawn(list, b({ id: 9 })), { supplier: 'Spawn Co', strain: 'PL-27' });
  assert.deepEqual(lastSpawn(list, b({ id: 9, crop: 'golden' })), null);
  assert.equal(lastSpawn(list, b({ id: 2 })).supplier, 'Old Spawn', 'not its own');
  const v = inoculateValues(b({ id: 9 }), '2026-11-05', { supplier: 'Spawn Co', strain: 'PL-27' });
  assert.deepEqual([v.supplier, v.strain, v.spawnBatch], ['Spawn Co', 'PL-27', '']);
  assert.equal(inoculateValues(b({ id: 9, inoculatedAt: NOW, supplier: 'Mine' }), '2026-11-05', { supplier: 'Spawn Co', strain: 'PL-27' }).supplier, 'Mine', 'recorded: its own');
});

test("the next step: the card's primary and the list row's action", () => {
  const today = '2026-11-05';
  assert.equal(nextStep(b({ loads: [] }), today), 'load');
  assert.equal(nextStep(b({ loads: [{ bags: 400 }] }), today), 'inoculate');
  assert.equal(nextStep(b({ loads: [{ bags: 400 }], inoculatedAt: NOW }), today), 'incubate');
  assert.equal(nextStep(b({ loads: [{ bags: 400 }], inoculatedAt: NOW, incubation: 'room' }), today), 'put');
  assert.equal(nextStep(b({ loads: [{ bags: 400 }], inoculatedAt: NOW, incubation: 'area', incubatedFrom: NOW }), today), 'ready');
  assert.equal(nextStep(b({ loads: [], inoculatedAt: NOW, incubation: 'room' }), today), 'load', 'no load: still the first');
  assert.equal(nextStep(b({ status: 'waiting', incubation: 'area', incubatedFrom: NOW, incubatedTo: NOW, inoculatedAt: NOW }), today), null, 'made: none');
  // the list row (no loads in a row: the status says how far it is)
  assert.deepEqual(rowAction(b({})), { key: 'load', label: 'Record a load' });
  assert.deepEqual(rowAction(b({ sterilisedAt: NOW })), { key: 'inoculate', label: 'Record the inoculation' });
  assert.deepEqual(rowAction(b({ sterilisedAt: NOW, inoculatedAt: NOW })), { key: 'put', label: 'Put into a room' });
  assert.deepEqual(rowAction(b({ sterilisedAt: NOW, inoculatedAt: NOW, incubation: 'area', incubatedFrom: NOW })), { key: 'ready', label: 'Ready to fruit' });
  assert.deepEqual(rowAction(b({ sterilisedAt: NOW, inoculatedAt: NOW, incubation: 'room' })), { key: 'put', label: 'Put into a room' });
  assert.deepEqual(rowAction(b({ inoculatedAt: NOW, incubation: 'room' })), { key: 'load', label: 'Record a load' }, 'inoculated without a load: as the card');
  assert.equal(rowAction(b({ sterilisedAt: NOW, inoculatedAt: NOW, good: 0, lost: 400 })), null, 'every block lost: nothing to put in');
  assert.deepEqual(rowAction(b({ status: 'waiting', kind: 'bought' })), { key: 'put', label: 'Put into a room' });
  assert.equal(rowAction(b({ status: 'waiting', kind: 'bought', good: 0 })), null, 'every block lost');
});

test('a bag weight or water typed works the amounts out again', () => {
  assert.deepEqual(withWeight(RECIPE, '2.5', '65'), { ...RECIPE, bagKg: 2.5, waterPct: 65 });
  assert.deepEqual(withWeight(RECIPE, '', 'x'), RECIPE, 'empty or not a number: the recipe\'s');
  assert.deepEqual(withWeight(RECIPE, '0', '100'), RECIPE, 'no dry weight: the recipe\'s');
  assert.equal(recipeFill(withWeight(RECIPE, '2.5', '60'), 400)['qty-sawdust'], '312');
});

test('more of the making parts: a bad toDate, a recipe with another ingredient, incubating in a grow room', () => {
  assert.equal(incubateBody({ incubation: 'area', fromDate: '2026-11-04', toDate: 'soon' }).field, 'toDate');
  const cotton = { ...RECIPE, sawdustPct: 70, otherPct: 8, otherName: 'Cotton waste' };
  const fill = recipeFill(cotton, 100);
  assert.deepEqual([fill.otherName, fill['qty-other'], fill['qty-sawdust']], ['Cotton waste', '7.4', '64.4']);
  assert.equal(placeable(b({ inoculatedAt: NOW, incubation: 'room' })), true);
  assert.equal(placeable(b({ incubation: 'room' })), false, 'not inoculated');
});

test("dates in a made batch's facts: the year only when not this one", () => {
  const facts = detailFacts(b({ inoculatedAt: NOW }), '2026-11-05');
  assert.deepEqual(facts.find(([k]) => k === 'Inoculated'), ['Inoculated', '5 Nov']);
  assert.deepEqual(detailFacts(b({ inoculatedAt: Date.UTC(2025, 10, 5, 4) }), '2026-11-05').find(([k]) => k === 'Inoculated'), ['Inoculated', '5 Nov 2025']);
});
