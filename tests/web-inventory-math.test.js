// Inventory's one formatter (spec 2026-11-05-inventory-design.md 5 Numbers): a qty with its unit, RM, the price per unit,
// a farm day.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  metaLine, needsLook, keptCounts, leaveText, doneText, undoLeft, UNDO_MS, itemGroups, stockHint, useByLine, qtyText, rmText, perUnitText, dayText, longDayText, daysBefore, pillOf, lotPill, countedText, attentionParts, groupItems, lotLabel,
  moveLine, deleteTitle, deleteLead, throwOutTitle, throwOutLead, numberIn, itemBody, purchaseBody, useBody, purchaseEditBody,
  useEditBody, overStock, countBody, sheetCells, sheetRange, sheetEmpty, SHEET_COLUMNS, KIND_OPTIONS, UNIT_OPTIONS,
} from '../web/inventory-math.js';

const plain = (s) => s.replace(/ /g, ' ');

test('a qty: whole units whole, kg and L to 2 decimals, grouped, a true minus, + only when asked', () => {
  assert.equal(plain(qtyText(120, 'pcs')), '120 pcs');
  assert.equal(plain(qtyText(1234, 'blocks')), '1,234 blocks');
  assert.equal(plain(qtyText(250, 'g')), '250 g');
  assert.equal(plain(qtyText(3.5, 'L')), '3.50 L');
  assert.equal(plain(qtyText(0.25, 'kg')), '0.25 kg');
  assert.equal(plain(qtyText(-2, 'L')), '−2.00 L');
  assert.equal(plain(qtyText(5, 'L', { signed: true })), '+5.00 L');
  assert.equal(plain(qtyText(0, 'L', { signed: true })), '0.00 L');
  assert.equal(plain(qtyText(-0.001, 'L')), '0.00 L', 'no minus on a figure that shows as 0');
  assert.equal(qtyText(null, 'L'), '—');
  assert.ok(qtyText(3.5, 'L').includes(' '), 'the unit keeps to its number');
});

test('RM to 2 places with grouping', () => {
  assert.equal(plain(rmText(1240.5)), 'RM 1,240.50');
  assert.equal(plain(rmText(0)), 'RM 0.00');
  assert.equal(rmText(null), '—');
});

test('the price per unit: 2 places from RM 0.10, two significant digits below, never a false 0', () => {
  assert.equal(plain(perUnitText(25, 3, 'L')), 'RM 8.33 per L');
  assert.equal(plain(perUnitText(4, 100, 'pcs')), 'RM 0.04 per piece');
  assert.equal(perUnitText(-1, 3, 'L'), '');
  assert.equal(plain(perUnitText(3.5, 1000, 'mL')), 'RM 0.0035 per mL');
  assert.equal(plain(perUnitText(0.01, 1000, 'g')), 'under RM 0.0001 per g');
  assert.equal(plain(perUnitText(0, 5, 'kg')), 'RM 0.00 per kg');
  assert.equal(perUnitText(25, 0, 'L'), '');
  assert.equal(perUnitText(NaN, 3, 'L'), '');
});

test('a farm day in words', () => {
  assert.equal(dayText('2026-11-12'), '12 Nov');
  assert.equal(longDayText('2026-11-12'), '12 Nov 2026');
  assert.equal(dayText('nonsense'), '—');
});

const at = (date, time = '12:00') => Date.parse(`${date}T${time}:00+08:00`);
const item = (fields) => ({ id: 1, name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: null, archived: false, qty: 0, low: false, useBy: null, lastCountedAt: null, ...fields });

test('a farm day some days before another', () => {
  assert.equal(daysBefore('2026-11-05', 400), '2025-10-01');
  assert.equal(daysBefore('2026-03-01', 1), '2026-02-28');
});

test('the pills: archived, then expired (red), Low, a use-by (amber); none for a calm item', () => {
  assert.deepEqual(pillOf(item({ archived: true, low: true })), { text: 'Archived', tone: 'none' });
  assert.deepEqual(pillOf(item({ low: true, useBy: { date: '2026-11-04', state: 'expired' } })), { text: 'Expired', tone: 'warn' });
  assert.deepEqual(pillOf(item({ low: true, useBy: { date: '2026-11-12', state: 'soon' } })), { text: 'Low', tone: 'amber' });
  assert.deepEqual(pillOf(item({ useBy: { date: '2026-11-12', state: 'soon' } })), { text: 'Use by 12 Nov', tone: 'amber' });
  assert.equal(pillOf(item()), null);
  assert.deepEqual(lotPill({ state: 'soon', useBy: '2026-11-12' }), { text: 'Use by 12 Nov', tone: 'amber' });
  assert.deepEqual(lotPill({ state: 'expired', useBy: '2026-11-04' }), { text: 'Expired', tone: 'warn' });
  assert.equal(lotPill({ state: null, useBy: '2027-01-01' }), null);
});

test('part of the stock expired (audit #4): the pill says how much; Expired alone only when all of it is', () => {
  const part = item({ unit: 'kg', qty: 29.5, useBy: { date: '2026-11-01', state: 'expired', qty: 4.5 } });
  assert.deepEqual({ ...pillOf(part), text: plain(pillOf(part).text) }, { text: '4.50 kg expired', tone: 'warn' });
  assert.deepEqual(pillOf({ ...part, qty: 4.5 }), { text: 'Expired', tone: 'warn' });
  assert.deepEqual(pillOf({ ...part, qty: 4 }), { text: 'Expired', tone: 'warn' }, 'more expired than in stock (a use beyond the records)');
  assert.deepEqual(pillOf(item({ qty: 2, useBy: { date: '2026-11-01', state: 'expired' } })), { text: 'Expired', tone: 'warn' }, 'no qty sent: as before');
});

test("the In stock tile's use-by line: the qty, the state and the day, toned", () => {
  const part = item({ unit: 'kg', qty: 29.5, useBy: { date: '2026-11-01', state: 'expired', qty: 4.5 } });
  assert.deepEqual({ ...useByLine(part), text: plain(useByLine(part).text) }, { text: '4.50 kg expired 1 Nov', tone: 'warn' });
  const soon = item({ unit: 'kg', qty: 29.5, useBy: { date: '2026-11-12', state: 'soon', qty: 3 } });
  assert.deepEqual({ ...useByLine(soon), text: plain(useByLine(soon).text) }, { text: '3.00 kg use by 12 Nov', tone: 'amber' });
  assert.deepEqual(useByLine(item({ useBy: { date: '2026-11-12', state: 'soon' } })), { text: 'Use by 12 Nov', tone: 'amber' });
  assert.equal(useByLine(item()), null);
});

test("last counted in words; over 7 days or never is muted", () => {
  const now = at('2026-11-05', '09:00');
  assert.deepEqual(countedText(null, now), { text: 'never', stale: true });
  assert.deepEqual(countedText(at('2026-11-05', '08:00'), now), { text: 'today', stale: false });
  assert.deepEqual(countedText(at('2026-11-04'), now), { text: 'yesterday', stale: false });
  assert.deepEqual(countedText(at('2026-10-29'), now), { text: '7 days ago', stale: false });
  assert.deepEqual(countedText(at('2026-10-27'), now), { text: '9 days ago', stale: true }, 'the column head says Last counted (audit #11)');
});

test('the attention line: low and soon amber, expired red; one soon item names its day', () => {
  const soon = item({ useBy: { date: '2026-11-12', state: 'soon' } });
  assert.deepEqual(attentionParts({ low: 2, soon: 1, expired: 1 }, [soon]), [
    { key: 'low', text: '2 low', tone: 'amber' }, { key: 'soon', text: '1 to use by 12 Nov', tone: 'amber' }, { key: 'expired', text: '1 expired', tone: 'warn' },
  ]);
  assert.deepEqual(attentionParts({ low: 0, soon: 2, expired: 0 }, [soon, soon]), [{ key: 'soon', text: '2 to use within 7 days', tone: 'amber' }]);
  assert.deepEqual(attentionParts({ low: 0, soon: 0, expired: 0 }, []), []);
  const old = item({ archived: true, useBy: { date: '2026-11-08', state: 'soon' } });
  assert.equal(attentionParts({ low: 0, soon: 1, expired: 0 }, [old, soon])[0].text, '1 to use by 12 Nov');
});

test('the groups: by kind in order, empty kinds left out, the items that need a look first', () => {
  const groups = groupItems([
    item({ id: 1, name: 'Alcohol', kind: 'chemical' }), item({ id: 2, name: 'Bleach', kind: 'chemical', low: true }),
    item({ id: 3, name: 'Punnets', kind: 'packaging', unit: 'pcs' }), item({ id: 4, name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' }),
  ]);
  assert.deepEqual(groups.map((g) => [g.name, g.items.map((i) => i.id)]), [['Blocks', [4]], ['Chemicals', [2, 1]], ['Packaging', [3]]]);
});

test("a lot's name and a move's line", () => {
  assert.equal(lotLabel({ refKind: 'purchase', at: at('2026-11-01') }), 'Bought 1 Nov');
  assert.equal(lotLabel({ refKind: 'batch', refId: 14, at: 0 }), 'Batch 14');
  assert.equal(lotLabel({ refKind: 'adjust', at: at('2026-11-03') }), 'Count 3 Nov');
  const bleach = item();
  const line = (m) => {
    const l = moveLine({ roomId: null, roomName: null, reason: null, worker: null, lotId: null, supplier: null, useBy: null, ...m }, bleach);
    return { ...l, what: l.what.replace(/\u00a0/g, ' '), qty: l.qty.replace(/\u00a0/g, ' ') };
  };
  assert.deepEqual(line({ refKind: 'purchase', at: at('2026-11-03'), qty: 5, total: 25, supplier: 'Kedai Ali', useBy: '2026-12-01' }), {
    when: '3 Nov', what: 'Bought from Kedai Ali · RM 25.00 · use by 1 Dec', qty: '+5.00 L', edit: 'edit',
  });
  assert.equal(line({ refKind: 'use', at: at('2026-11-03', '08:12'), qty: -1, roomId: 2, roomName: 'Container 2', reason: 'Footbath', worker: 'Ali' }).what, 'Used in Container 2 · Footbath · Ali');
  assert.equal(line({ refKind: 'use', at: 0, qty: -1, roomId: 9, roomName: null }).what, 'Used in a deleted room');
  assert.equal(line({ refKind: 'use', at: 0, qty: -1 }).what, 'Used');
  assert.equal(line({ refKind: 'use', at: at('2026-11-03', '08:12'), qty: -1 }).when, '3 Nov 08:12');
  assert.equal(line({ refKind: 'use', at: 0, qty: -3, lotId: 4, reason: 'Expired', worker: 'Ali' }).what, 'Thrown out · expired · Ali');
  const count = line({ refKind: 'adjust', at: 0, qty: -1.5, counted: 3.5, worker: 'Ali' });
  assert.equal(count.what, 'Counted 3.50 L · Ali');
  assert.equal(count.edit, 'delete');
  const batch = line({ refKind: 'batch', refId: 14, at: 0, qty: 500 });
  assert.equal(batch.what, 'Batch 14 · received');
  assert.equal(batch.edit, null);
  assert.equal(moveLine({ refKind: 'batch', refId: 14, at: 0, qty: -500, roomName: 'Container 2' }, item({ kind: 'blocks', unit: 'blocks' })).what.replace(/\u00a0/g, ' '), 'Batch 14 · into Container 2');
  assert.equal(moveLine({ refKind: 'batch', refId: 16, at: 0, qty: -2, roomName: null }, item({ kind: 'spawn', unit: 'kg' })).what.replace(/\u00a0/g, ' '), 'Batch 16 · made');
});

test('the confirms: delete and throw out', () => {
  const bleach = item();
  const plain = (s) => s.replace(/\u00a0/g, ' ');
  assert.equal(plain(deleteTitle({ refKind: 'purchase', qty: 5, at: at('2026-11-03') }, bleach)), 'Delete the purchase of 5.00 L of Bleach on 3 Nov?');
  assert.equal(plain(deleteTitle({ refKind: 'use', qty: -1, at: at('2026-11-03'), lotId: null }, bleach)), 'Delete the use of 1.00 L of Bleach on 3 Nov?');
  assert.equal(plain(deleteTitle({ refKind: 'use', qty: -1, at: at('2026-11-03'), lotId: 4 }, bleach)), 'Delete the throw-out of 1.00 L of Bleach on 3 Nov?');
  assert.equal(plain(deleteTitle({ refKind: 'adjust', qty: 0, at: at('2026-11-03') }, bleach)), 'Delete the count of Bleach on 3 Nov?');
  assert.equal(deleteLead({ refKind: 'purchase' }, { throwOuts: true }), 'The throw-outs taken from it go with it.');
  assert.equal(deleteLead({ refKind: 'purchase' }, { throwOuts: false }), null);
  assert.equal(deleteLead({ refKind: 'adjust' }, {}), 'In stock goes back to what the records said without it.');
  const lot = { left: 3, at: at('2026-11-01'), useBy: '2026-11-04', state: 'expired' };
  assert.equal(plain(throwOutTitle(lot, item({ name: 'Spawn', unit: 'kg' }))), 'Throw out 3.00 kg of Spawn bought 1 Nov?');
  assert.equal(throwOutLead(lot), 'Its use-by was 4 Nov.');
  assert.equal(throwOutLead({ ...lot, state: 'soon' }), 'Its use-by is 4 Nov.');
});

test('a number typed for a unit', () => {
  assert.deepEqual(numberIn('3.5', 'L'), { value: 3.5 });
  assert.deepEqual(numberIn('12', 'pcs'), { value: 12 });
  assert.equal(numberIn('1.5', 'pcs').error, 'Give a whole number of pcs over 0 up to 100,000');
  assert.equal(numberIn('1.234', 'kg').error, 'Give the kg as a number over 0 up to 100,000, at most 2 decimals');
  assert.equal(numberIn('0', 'kg').error, 'Give the kg as a number over 0 up to 100,000, at most 2 decimals');
  assert.deepEqual(numberIn('0', 'kg', { zero: true }), { value: 0 });
  assert.equal(numberIn('', 'kg').error, 'Give the qty');
  assert.equal(numberIn('1,5', 'kg').error, 'Give the kg as a number over 0 up to 100,000, at most 2 decimals');
});

test("the item dialog's body: a chemical's fields; a block item's level only", () => {
  assert.deepEqual(itemBody({ name: ' Bleach ', kind: 'chemical', unit: 'L', reorderAt: '2', ingredient: 'Sodium hypochlorite', lrmpNo: '' }), {
    name: 'Bleach', kind: 'chemical', unit: 'L', ingredient: 'Sodium hypochlorite', lrmpNo: null, reorderAt: 2,
  });
  assert.deepEqual(itemBody({ name: 'Bags', kind: 'bags', unit: 'pcs', reorderAt: '' }), { name: 'Bags', kind: 'bags', unit: 'pcs', reorderAt: null });
  assert.deepEqual(itemBody({ name: '', kind: 'bags', unit: 'pcs' }), { error: 'Give the name', field: 'name' });
  assert.equal(itemBody({ name: 'Bags', kind: 'bags', unit: 'pcs', reorderAt: '2.5' }).field, 'reorderAt');
  assert.deepEqual(itemBody({ reorderAt: '200' }, item({ kind: 'blocks', unit: 'blocks' })), { reorderAt: 200 });
});

test('Record use and Purchase start on no item (audit #1): the body asks for one on the Item box', () => {
  const now = at('2026-11-05', '09:00');
  const shown = { date: '2026-11-05', time: '09:00' };
  assert.deepEqual(useBody({ qty: '1', worker: 'Ali', date: '2026-11-05', time: '09:00' }, null, { now, shown }), { error: 'Pick an item', field: 'itemId' });
  assert.deepEqual(purchaseBody({ qty: '1', total: '5', day: '2026-11-05' }, null, '2026-11-05'), { error: 'Pick an item', field: 'itemId' });
});

test("the Item picker's groups by kind, in the list's order of kinds; the stock under the box, never cut in an option", () => {
  const groups = itemGroups([
    item({ id: 4, name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' }), item({ id: 1, name: 'Alcohol', kind: 'chemical' }),
    item({ id: 3, name: 'Punnets', kind: 'packaging', unit: 'pcs' }), item({ id: 2, name: 'Bleach', kind: 'chemical' }),
  ]);
  assert.deepEqual(groups.map((g) => [g.label, g.items.map((i) => i.id)]), [['Blocks', [4]], ['Chemicals', [1, 2]], ['Packaging', [3]]]);
  assert.equal(plain(stockHint(item({ qty: 1.2 }))), '1.20 L in stock');
  assert.equal(stockHint(null), '');
});

test("Purchase's body", () => {
  const bleach = item();
  assert.deepEqual(purchaseBody({ qty: '3', total: '25', supplier: ' Kedai Ali ', day: '2026-11-05', useBy: '' }, bleach, '2026-11-05'), {
    itemId: 1, qty: 3, total: 25, supplier: 'Kedai Ali', useBy: null, day: '2026-11-05',
  });
  assert.equal(purchaseBody({ qty: '3', total: 'free', day: '2026-11-05' }, bleach, '2026-11-05').field, 'total');
  assert.equal(purchaseBody({ qty: '3', total: '1', day: '2026-11-06' }, bleach, '2026-11-05').field, 'day');
  assert.equal(purchaseBody({ qty: '3', total: '1', day: '2026-11-05', useBy: '2026-11-01' }, bleach, '2026-11-05').field, 'useBy');
  assert.equal(purchaseBody({ qty: '3', total: '1', day: '2025-09-30' }, bleach, '2026-11-05').field, 'day');
  assert.equal(purchaseBody({ qty: '3', total: '1', day: '2025-09-30' }, bleach, '2026-11-05').error, 'Pick a day from the last 400 days up to today');
  assert.equal(purchaseBody({ qty: '3', total: '1', day: '2025-10-01' }, bleach, '2026-11-05').error, undefined);
});

test("Record use's body: the time only when changed, not in the future", () => {
  const bleach = item();
  const now = at('2026-11-05', '09:00');
  const shown = { date: '2026-11-05', time: '09:00' };
  const v = { qty: '1', roomId: '2', reason: 'Footbath', worker: 'Ali', date: '2026-11-05', time: '09:00' };
  assert.deepEqual(useBody(v, bleach, { now, shown }), { itemId: 1, qty: 1, roomId: 2, reason: 'Footbath', worker: 'Ali' });
  assert.equal(useBody({ ...v, time: '8:30' }, bleach, { now, shown }).at, at('2026-11-05', '08:30'));
  assert.equal(useBody({ ...v, roomId: '' }, bleach, { now, shown }).roomId, null);
  assert.equal(useBody({ ...v, worker: '' }, bleach, { now, shown }).field, 'worker');
  assert.equal(useBody({ ...v, time: '10:30' }, bleach, { now, shown }).field, 'time');
  assert.equal(useBody({ ...v, time: 'soon' }, bleach, { now, shown }).field, 'time');
  const old = useBody({ ...v, date: '2025-09-30' }, bleach, { now, shown });
  assert.deepEqual(old, { error: 'Pick a date from the last 400 days', field: 'date' });
  assert.equal(useBody({ ...v, date: '2025-10-01' }, bleach, { now, shown }).error, undefined);
});

test('the edit bodies carry only what changed', () => {
  const bleach = item();
  const buy = { qty: 5, total: 25, supplier: 'Kedai Ali', useBy: null, at: at('2026-11-03') };
  assert.deepEqual(purchaseEditBody({ qty: '5', total: '30', supplier: 'Kedai Ali', day: '2026-11-03', useBy: '' }, buy, bleach, '2026-11-05'), { total: 30 });
  const use = { qty: -1, roomId: null, reason: 'Footbath', worker: 'Ali', at: at('2026-11-03', '08:12') };
  const shown = { date: '2026-11-03', time: '08:12' };
  assert.deepEqual(useEditBody({ qty: '2', roomId: '', reason: 'Footbath', worker: 'Ali', date: '2026-11-03', time: '08:12' }, use, bleach, { now: at('2026-11-05'), shown }), { qty: 2 });
});

test('an old purchase can be fixed, its day bound applies only when the day changes', () => {
  const bleach = item();
  const old = { qty: 5, total: 25, supplier: 'Kedai Ali', useBy: null, at: at('2025-01-10') };
  const v = { qty: '5', total: '30', supplier: 'Kedai Ali', day: '2025-01-10', useBy: '' };
  assert.deepEqual(purchaseEditBody(v, old, bleach, '2026-11-05'), { total: 30 });
  const moved = purchaseEditBody({ ...v, day: '2025-02-01' }, old, bleach, '2026-11-05');
  assert.equal(moved.field, 'day');
  assert.equal(moved.error, 'Pick a day from the last 400 days up to today');
});

test('a throw-out edit without a Room box sends no roomId', () => {
  const bleach = item();
  const out = { qty: -1, roomId: null, lotId: 3, reason: 'Expired', worker: 'Ali', at: at('2026-11-03', '08:12') };
  const shown = { date: '2026-11-03', time: '08:12' };
  const v = { qty: '2', reason: 'Expired', worker: 'Ali', date: '2026-11-03', time: '08:12' };
  assert.deepEqual(useEditBody(v, out, bleach, { now: at('2026-11-05'), shown }), { qty: 2 });
});

test('more than in stock asks', () => {
  assert.equal(overStock(5, item({ qty: 2 })).replace(/\u00a0/g, ' '), 'Only 2.00 L in stock. Record 5.00 L anyway?');
  assert.equal(overStock(2, item({ qty: 2 })), null);
  assert.equal(overStock(1, item({ qty: -3 })).replace(/\u00a0/g, ' '), 'Only 0.00 L in stock. Record 1.00 L anyway?');
});

test("Count stock's body: typed boxes only, each checked; who once", () => {
  const entries = [{ itemId: 1, unit: 'L', text: '3.5' }, { itemId: 2, unit: 'pcs', text: '' }, { itemId: 3, unit: 'pcs', text: '0' }];
  assert.deepEqual(countBody(entries, 'Ali'), { worker: 'Ali', counts: [{ itemId: 1, qty: 3.5 }, { itemId: 3, qty: 0 }] });
  assert.deepEqual(countBody(entries, ''), { error: 'Pick who counted', field: 'worker' });
  assert.deepEqual(countBody([{ itemId: 2, unit: 'pcs', text: '1.5' }], 'Ali'), { error: 'Give a whole number of pcs from 0 up to 100,000', field: 'count-2' });
  assert.deepEqual(countBody([{ itemId: 2, unit: 'pcs', text: '' }], 'Ali'), { error: 'Type at least one count', field: null });
});

test('the 4-5 sheet: twelve columns; a row in the farm words; the range; the empty line', () => {
  assert.equal(SHEET_COLUMNS.length, 12);
  const row = { date: '2026-11-03', kind: 'use', crop: 'Grey oyster', location: 'Container 1', product: 'Bleach (Sodium hypochlorite)', lrmpNo: '', price: null, qty: 1, unit: 'L', reason: 'Footbath', operator: 'Ali' };
  assert.deepEqual(sheetCells(row).map((c) => c.replace(/\u00a0/g, ' ')), ['3 Nov 2026', 'Grey oyster', 'Container 1', 'Bleach (Sodium hypochlorite)', '', '', '1.00 L used', 'Footbath', '', 'Ali', '', '']);
  assert.equal(sheetCells({ ...row, kind: 'purchase', price: 25, qty: 5 })[5].replace(/\u00a0/g, ' '), 'RM 25.00');
  assert.equal(sheetCells({ ...row, kind: 'purchase', price: 25, qty: 5 })[6].replace(/\u00a0/g, ' '), '5.00 L bought');
  assert.equal(sheetRange({ from: '2026-10-07', to: '2026-11-05' }), '7 Oct 2026 – 5 Nov 2026');
  assert.equal(sheetEmpty(90), 'No chemical purchases or uses in the last 90 days.');
});

test("the pickers' options", () => {
  assert.deepEqual(KIND_OPTIONS.map(([k]) => k), ['spawn', 'bags', 'chemical', 'packaging', 'other']);
  assert.deepEqual(UNIT_OPTIONS.map(([u]) => u), ['pcs', 'kg', 'g', 'L', 'mL']);
});

test('the line after a record (audit #2): what was saved, in the farm words', () => {
  assert.equal(plain(doneText({ kind: 'use', qty: 1, unit: 'L', name: 'Bleach', room: 'Container 1', worker: 'Sara' })), 'Used 1.00 L of Bleach in Container 1 by Sara');
  assert.equal(plain(doneText({ kind: 'use', qty: 2, unit: 'pcs', name: 'Punnets', room: null, worker: 'Sara' })), 'Used 2 pcs of Punnets by Sara');
  assert.equal(plain(doneText({ kind: 'purchase', qty: 10, unit: 'L', name: 'Bleach' })), 'Bought 10.00 L of Bleach');
  assert.equal(plain(doneText({ kind: 'throwOut', qty: 4.5, unit: 'kg', name: 'Lime', worker: 'Ali' })), 'Threw out 4.50 kg of Lime by Ali');
  assert.equal(doneText({ kind: 'count', count: 3, worker: 'Sara' }), 'Saved 3 counts by Sara');
  assert.equal(doneText({ kind: 'count', count: 1, worker: 'Sara' }), 'Saved 1 count by Sara');
  assert.equal(doneText({ kind: 'added', name: 'Bleach' }), 'Added Bleach');
  assert.equal(doneText({ kind: 'deleted' }), 'Deleted');
  assert.equal(doneText({ kind: 'deleted', name: 'Bleach' }), 'Deleted Bleach');
  assert.equal(doneText({ kind: 'saved' }), 'Saved');
  assert.equal(UNDO_MS, 60_000);
  assert.equal(undoLeft(1000, 21_000), 40_000);
  assert.equal(undoLeft(1000, 61_000), 0);
  assert.equal(undoLeft(1000, 500), UNDO_MS, 'a clock behind: never more than the minute');
  assert.equal(undoLeft(undefined, 500), 0);
});

test("Count stock's typed figures kept until saved (audit #3): only the items still to count, only typed ones", () => {
  const items = [item({ id: 1 }), item({ id: 2 }), item({ id: 3, archived: true })];
  assert.deepEqual(keptCounts({ 1: '3.5', 2: '  ', 3: '4', 9: '1' }, items), { 1: '3.5' });
  assert.deepEqual(keptCounts(null, items), {});
  assert.deepEqual(keptCounts('nonsense', items), {});
  assert.deepEqual(keptCounts({ 1: 5 }, items), {}, 'text only');
  assert.equal(leaveText(1), 'Leave Count stock? 1 typed count is not saved yet.');
  assert.equal(leaveText(3), 'Leave Count stock? 3 typed counts are not saved yet.');
});

test("the list's phone line (audit #12): the level and when counted in one muted line", () => {
  const now = at('2026-11-05', '09:00');
  assert.equal(plain(metaLine(item({ reorderAt: 2, lastCountedAt: at('2026-11-05', '08:00') }), now)), 'Reorder at 2.00 L · counted today');
  assert.equal(metaLine(item({ lastCountedAt: at('2026-10-26') }), now), 'Counted 10 days ago');
  assert.equal(metaLine(item(), now), 'Never counted');
  assert.equal(plain(metaLine(item({ reorderAt: 2 }), now)), 'Reorder at 2.00 L · never counted');
});

test("the attention line's parts filter the list (audit #13): the items each part counts", () => {
  const low = item({ id: 1, low: true });
  const soon = item({ id: 2, useBy: { date: '2026-11-12', state: 'soon' } });
  const expired = item({ id: 3, low: true, useBy: { date: '2026-11-01', state: 'expired', qty: 1 } });
  const old = item({ id: 4, low: true, archived: true });
  const all = [low, soon, expired, old];
  assert.deepEqual(all.filter((i) => needsLook(i, 'low')).map((i) => i.id), [1, 3]);
  assert.deepEqual(all.filter((i) => needsLook(i, 'soon')).map((i) => i.id), [2]);
  assert.deepEqual(all.filter((i) => needsLook(i, 'expired')).map((i) => i.id), [3]);
  assert.equal(needsLook(low, null), true, 'no filter: every item');
});
