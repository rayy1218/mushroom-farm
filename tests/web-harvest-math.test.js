import test from 'node:test';
import assert from 'node:assert/strict';
import { kgText, perBlockText, beText, rmText, costText, summaryLine, flushColumns, sheetRows } from '../web/harvest-math.js';

const nb = ' ';
const dot = `${nb}· `;

test('formats: kg, per block, BE, RM, cost', () => {
  assert.equal(kgText(18.44), `18.4${nb}kg`);
  assert.equal(kgText(2.35, { exact: true }), `2.35${nb}kg`);
  assert.equal(kgText(2, { exact: true }), `2${nb}kg`);
  assert.equal(kgText(1240), `1,240.0${nb}kg`);
  assert.equal(perBlockText(0.314), `0.31${nb}kg per block`);
  assert.equal(beText(34), `BE 34${nb}%`);
  assert.equal(rmText(1240.5), `RM${nb}1,240.50`);
  assert.equal(costText({ costPerKg: 3.1, days: 46, water: true }), `RM${nb}3.10 per${nb}kg${dot}electricity and water over 46${nb}days at today’s prices`);
  assert.equal(costText({ costPerKg: 3.1, days: 1, water: false }), `RM${nb}3.10 per${nb}kg${dot}electricity over 1${nb}day at today’s prices`);
});

test('a missing figure is a dash', () => {
  for (const f of [kgText, perBlockText, beText, rmText]) assert.equal(f(null), '—');
  assert.equal(kgText(undefined, { exact: true }), '—');
  assert.equal(costText({ costPerKg: null, days: 3, water: true }), '—');
});

test('the Crop tab summary line', () => {
  assert.equal(summaryLine({ kg: 18.44, perBlock: 0.31, be: 34 }, 2), `Flush 2${dot}18.4${nb}kg this run${dot}0.31${nb}kg per block${dot}BE 34${nb}%`);
  assert.equal(summaryLine({ kg: 5, perBlock: 0.01, be: null }, 1), `Flush 1${dot}5.0${nb}kg this run${dot}0.01${nb}kg per block`);
  assert.equal(summaryLine({ kg: 0, perBlock: 0, be: null }, 1), 'No harvests recorded in this run yet.');
});

test('flush columns: one kg column per crop in a mixed room', () => {
  assert.deepEqual(flushColumns([{ crop: 'oyster' }]), ['Flush', 'Days', 'kg', 'kg per block', 'BE']);
  assert.deepEqual(flushColumns([{ crop: 'oyster' }, { crop: 'lionsmane' }]), ['Flush', 'Days', 'Grey oyster kg', "Lion's mane (draft) kg", 'kg', 'kg per block', 'BE']);
});

test('sheet rows: the myGAP columns, the sales cells blank', () => {
  const rows = sheetRows([{ date: '2026-11-03', roomName: 'Room 1', crop: 'oyster', runStartedAt: Date.UTC(2026, 9, 2, 16), kg: 3.5 }]);
  assert.deepEqual(rows[0], ['3 Nov 2026', 'Grey oyster', 'Room 1 · run of 3 Oct', '3.5', '', '', '', '', '']);
});
