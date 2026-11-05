// The Sales page's pure parts (spec 2026-11-05-sales-design.md 3 and 6): the formatter, the tiles, a delivery's row, the
// tables, the dialog's line totals, the price pre-fill, the unlikely-value check, the body, and the myGAP sheet's rows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  priceText, ageText, linesShort, paidMark, pageTiles, deliveryRow, cropRows, buyerRows, CROP_COLUMNS, BUYER_COLUMNS,
  lineTotal, footText, prefill, unlikely, saleBody, sheetWithSales, sheetTotals, emptyText, deleteTitle, deleteLead, num,
} from '../web/sales-math.js';

const nb = '\u00a0';
const NOW = Date.UTC(2026, 10, 5, 2); // Thu 5 Nov 2026 10:00 at the farm
const DAY = 86_400_000;
const dot = `${nb}· `;

test('the formatter: RM per kg, days owed', () => {
  assert.equal(priceText(12), `RM${nb}12.00`);
  assert.equal(priceText(null), '—');
  assert.equal(ageText(NOW - 12 * DAY, NOW), '12 days');
  assert.equal(ageText(NOW - DAY, NOW), '1 day');
  assert.equal(ageText(NOW - 3_600_000, NOW), 'today');
});

const delivery = {
  id: 4, soldAt: NOW - DAY, buyerId: 1, buyer: 'Kedai Ah Seng', invoiceNo: 'R-1', note: null, paidAt: null, kg: 16.5, total: 214.5,
  lines: [{ crop: 'oyster', kg: 12, priceKg: 13, total: 156 }, { crop: 'pink', kg: 4.5, priceKg: 13, total: 58.5 }],
};

test('a delivery\'s row: day, buyer, lines in short, total, the paid mark, the reference', () => {
  assert.equal(linesShort(delivery.lines), `Grey oyster 12.00${nb}kg${dot}Pink oyster 4.50${nb}kg`);
  assert.deepEqual(paidMark(delivery), { text: 'Unpaid', unpaid: true });
  assert.deepEqual(paidMark({ ...delivery, paidAt: Date.UTC(2026, 10, 9, 2) }), { text: `Paid 9${nb}Nov`, unpaid: false });
  assert.deepEqual(deliveryRow(delivery), { day: 'Wed 4 Nov', buyer: 'Kedai Ah Seng', lines: linesShort(delivery.lines), total: `RM${nb}214.50`, paid: paidMark(delivery), reference: 'R-1' });
});

test('the tiles: sold of harvested, income, owed all time', () => {
  const sales = { days: 30, from: '2026-10-07', totals: { kg: 16.5, total: 214.5, harvestedKg: 64.5, count: 1 }, owed: { total: 214.5, count: 3, oldestAt: NOW - 12 * DAY } };
  assert.deepEqual(pageTiles(sales, NOW), [
    { label: 'Sold', value: `16.5${nb}kg`, line: `of 64.5${nb}kg harvested` },
    { label: 'Income', value: `RM${nb}214.50` },
    { label: 'Owed', value: `RM${nb}214.50`, line: `3 sales${dot}oldest 12 days` },
  ]);
  const old = { ...sales, days: 7, from: '2026-10-30', owed: { total: 10, count: 1, oldestAt: NOW - 40 * DAY } };
  assert.equal(pageTiles(old, NOW)[2].line, `all time${dot}1 sale${dot}oldest 40 days`);
  const edge = (at) => pageTiles({ ...sales, owed: { total: 1, count: 1, oldestAt: at } }, NOW)[2].line;
  assert.equal(edge(Date.UTC(2026, 9, 7, 2)), `1 sale${dot}oldest 29 days`, 'oldest on the first day: not all time');
  assert.equal(edge(Date.UTC(2026, 9, 6, 2)), `all time${dot}1 sale${dot}oldest 30 days`, 'the day before: all time');
  assert.equal(pageTiles({ ...sales, owed: { total: 0, count: 0, oldestAt: null } }, NOW)[2].line, 'All paid');
});

test('the tables: by crop with the price against expected, by buyer', () => {
  assert.deepEqual(CROP_COLUMNS, ['Crop', 'Sold', 'Harvested', 'Income', 'Average RM per kg', 'Expected RM per kg']);
  const [row] = cropRows({ byCrop: [{ crop: 'oyster', kg: 15, harvestedKg: 20, total: 165, avgPriceKg: 11, expectedPriceKg: 12 }] });
  assert.deepEqual(row, { crop: 'oyster', name: 'Grey oyster', cells: [`15.0${nb}kg`, `20.0${nb}kg`, `RM${nb}165.00`, `RM${nb}11.00`, `RM${nb}12.00`], diff: `RM${nb}1.00 under expected` });
  assert.equal(cropRows({ byCrop: [{ crop: 'oyster', kg: 1, harvestedKg: 0, total: 12.8, avgPriceKg: 12.8, expectedPriceKg: 12 }] })[0].diff, `RM${nb}0.80 over expected`);
  assert.equal(cropRows({ byCrop: [{ crop: 'oyster', kg: 1, harvestedKg: 0, total: 12, avgPriceKg: 12, expectedPriceKg: 12 }] })[0].diff, 'as expected');
  assert.equal(cropRows({ byCrop: [{ crop: 'oyster', kg: 0, harvestedKg: 3, total: 0, avgPriceKg: null, expectedPriceKg: null }] })[0].diff, null);
  assert.deepEqual(BUYER_COLUMNS, ['Buyer', 'kg', 'Income', 'Owed']);
  assert.deepEqual(buyerRows({ byBuyer: [{ buyerId: 1, buyer: 'Borong Lim', kg: 10, total: 100, owed: 0 }] }), [{ name: 'Borong Lim', cells: [`10.0${nb}kg`, `RM${nb}100.00`, `RM${nb}0.00`] }]);
  assert.equal(emptyText(30), 'No sales in the last 30 days.');
  assert.equal(emptyText(90), 'No sales in the last 13 weeks.');
});

test('the dialog: a line\'s total, the foot, the price pre-fill (buyer, expected, empty)', () => {
  assert.equal(lineTotal('12', '10.5'), `RM${nb}126.00`);
  assert.equal(lineTotal('', '10'), '');
  assert.equal(footText([{ kg: '12', priceKg: '13' }, { kg: '4.5', priceKg: '13' }]), `16.50${nb}kg${dot}RM${nb}214.50`);
  const buyer = { prices: { oyster: 13 } };
  const cropYield = { oyster: { priceKg: 12 }, pink: { priceKg: 14 } };
  assert.deepEqual(prefill('oyster', buyer, cropYield), { value: '13.00', expected: false });
  assert.deepEqual(prefill('pink', buyer, cropYield), { value: '14.00', expected: true });
  assert.deepEqual(prefill('black', buyer, cropYield), { value: '', expected: false });
});

test('the unlikely-value check: over 3 times the expected price, over 500 kg', () => {
  const cropYield = { oyster: { priceKg: 12 } };
  assert.deepEqual(unlikely([{ crop: 'oyster', kg: 10, priceKg: 41 }], cropYield), [{ field: 'lines.0.priceKg', message: `That's 3.4 times the expected RM${nb}12.00 per kg. Is RM${nb}41.00 right?` }]);
  assert.deepEqual(unlikely([{ crop: 'oyster', kg: 650, priceKg: 12 }], cropYield), [{ field: 'lines.0.kg', message: `Is 650.00${nb}kg right?` }]);
  assert.deepEqual(unlikely([{ crop: 'black', kg: 10, priceKg: 999 }], cropYield), [], 'no expected price: no price check');
  assert.deepEqual(unlikely([{ crop: 'oyster', kg: 10, priceKg: 36 }], cropYield), []);
});

test('the body from the boxes: the day at the time typed (today: now; another day: 12:00), numbers, room or mixed', () => {
  const body = saleBody({ date: '2026-11-05', buyerId: '3', invoiceNo: ' R-1 ', note: '', lines: [{ crop: 'oyster', kg: '12', priceKg: '10.5', roomId: '' }, { crop: 'pink', kg: '4,5', priceKg: '14', roomId: '2' }] }, { now: NOW });
  assert.deepEqual(body, { soldAt: NOW, buyerId: 3, invoiceNo: 'R-1', note: null, lines: [{ crop: 'oyster', kg: 12, priceKg: 10.5, roomId: null }, { crop: 'pink', kg: 4.5, priceKg: 14, roomId: 2 }] });
  assert.equal(saleBody({ date: '2026-11-03', buyerId: '3', lines: [{ crop: 'oyster', kg: '1', priceKg: '1', roomId: '' }] }, { now: NOW }).soldAt, Date.UTC(2026, 10, 3, 4));
  assert.deepEqual(saleBody({ date: '2026-11-03', buyerId: '3', lines: [{ crop: 'oyster', kg: 'x', priceKg: '1', roomId: '' }] }, { now: NOW }), { error: 'Give the kg as a number', field: 'lines.0.kg' });
  assert.deepEqual(saleBody({ date: '', buyerId: '3', lines: [] }, { now: NOW }), { error: 'Give the date', field: 'date' });
  assert.deepEqual(saleBody({ date: '2026-11-03', buyerId: '', lines: [] }, { now: NOW }), { error: 'Pick a buyer', field: 'buyerId' });
});

test('delete confirm: the title and the lead', () => {
  assert.equal(deleteTitle(delivery), 'Delete the sale of 4 Nov to Kedai Ah Seng?');
  assert.equal(deleteLead(delivery), `RM${nb}214.50${dot}Grey oyster 12.00${nb}kg, Pink oyster 4.50${nb}kg.`);
});

test('the myGAP sheet: a day\'s harvest rows, then its sale lines; the totals', () => {
  const records = [{ date: '2026-11-04', roomName: 'Container 1', crop: 'oyster', runStartedAt: Date.UTC(2026, 9, 3), kg: 20 }];
  const lines = [
    { date: '2026-11-03', soldAt: 1, crop: 'pink', roomName: null, runStartedAt: null, kg: 1, priceKg: 14, total: 14, invoiceNo: null, buyer: 'Borong Lim' },
    { date: '2026-11-04', soldAt: 2, crop: 'oyster', roomName: 'Container 1', runStartedAt: Date.UTC(2026, 9, 3), kg: 12, priceKg: 10.5, total: 126, invoiceNo: 'R-1', buyer: 'Kedai Ah Seng' },
  ];
  const rows = sheetWithSales(records, lines);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0].slice(3), ['', '1.00', '14.00', '14.00', '', 'Borong Lim']);
  assert.equal(rows[0][2], 'Mixed');
  assert.equal(rows[1][3], '20.00', 'the harvest row before the same day\'s sale');
  assert.deepEqual(rows[2].slice(2), [`Container 1${dot}run of 3 Oct`, '', '12.00', '10.50', '126.00', 'R-1', 'Kedai Ah Seng']);
  assert.deepEqual(sheetTotals({ totals: { kg: 20 } }, lines), { harvested: '20.00', sold: '13.00', total: '140.00' });
  assert.deepEqual(sheetTotals({ totals: { kg: 20 } }, null), { harvested: '20.00', sold: '', total: '' });
});

test('review pins: numbers, the edit keeps its time, the sheet order, the wording, rounding', () => {
  const body = (kg, extra = {}, opts = {}) => saleBody({ date: '2026-11-05', buyerId: '3', lines: [{ crop: 'oyster', kg, priceKg: '1', roomId: '' }], ...extra }, { now: NOW, ...opts });
  assert.deepEqual(body('1,234'), { error: 'Give the kg as a number', field: 'lines.0.kg' });
  assert.deepEqual(body('1,000'), { error: 'Give the kg as a number', field: 'lines.0.kg' });
  assert.equal(body('12.').lines[0].kg, 12);
  assert.equal(body('.5').lines[0].kg, 0.5);
  assert.equal(body('4,5').lines[0].kg, 4.5);
  assert.deepEqual(saleBody({ date: '2026-11-05', buyerId: '3', lines: [{ crop: 'oyster', kg: '1', priceKg: 'x', roomId: '' }] }, { now: NOW }), { error: 'Give RM per kg as a number', field: 'lines.0.priceKg' });
  const was = Date.UTC(2026, 10, 3, 6, 30);
  assert.equal(body('1', { date: '2026-11-03' }, { soldAt: was }).soldAt, was, 'same date keeps the time');
  assert.equal(body('1', { date: '2026-11-02' }, { soldAt: was }).soldAt, Date.UTC(2026, 10, 2, 4), 'another day: 12:00');
  assert.deepEqual(body('1', { date: '2026-13-01' }), { error: 'Give the date', field: 'date' });

  const cropYield = { oyster: { priceKg: 12 }, black: { priceKg: 0 } };
  assert.deepEqual(unlikely([{ crop: 'oyster', kg: 500, priceKg: 12 }], cropYield), [], '500 kg exactly: no question');
  assert.deepEqual(unlikely([{ crop: 'black', kg: 1, priceKg: 50 }], cropYield), [], 'expected 0: no price check');
  assert.equal(unlikely([{ crop: 'oyster', kg: 1, priceKg: 36.1 }], cropYield)[0].message, `That's over 3 times the expected RM${nb}12.00 per kg. Is RM${nb}36.10 right?`);
  assert.deepEqual(prefill('oyster', { prices: { oyster: 1000 } }, {}), { value: '1000.00', expected: false });
  assert.equal(footText([{ kg: '0.1', priceKg: '1' }, { kg: '0.2', priceKg: '1' }]), `0.30${nb}kg${dot}RM${nb}0.30`);
  assert.deepEqual(sheetTotals({ totals: { kg: 1 } }, [{ kg: 0.1, total: 0.1 }, { kg: 0.2, total: 0.2 }]), { harvested: '1.00', sold: '0.30', total: '0.30' });

  const mk = (soldAt, kg, roomName = null, runStartedAt = null) => ({ date: '2026-11-04', soldAt, crop: 'pink', roomName, runStartedAt, kg, priceKg: 1, total: kg, invoiceNo: null, buyer: 'B' });
  const rows = sheetWithSales([], [mk(20, 2), mk(10, 1), mk(10, 3, 'Container 1')]);
  assert.deepEqual(rows.map((r) => r[4]), ['1.00', '3.00', '2.00'], 'by time, then given order');
  assert.equal(rows[1][2], 'Container 1', 'a room without a run: just the room');
});

test('num: a box as a number (a decimal comma read, a grouped number refused)', () => {
  assert.equal(num('12'), 12);
  assert.equal(num(' 4,5 '), 4.5);
  assert.equal(num('12.'), 12);
  assert.equal(num('.5'), 0.5);
  for (const t of ['1,234', '1,000', '1,000.50', '', 'x', '1e3', '-1', '0x10', null, undefined]) assert.ok(Number.isNaN(num(t)), String(t));
});

test('saleBody refuses what the server refuses: kg over 0 up to 10,000, RM per kg 0 to 1,000', () => {
  const body = (kg, priceKg) => saleBody({ date: '2026-11-05', buyerId: '3', lines: [{ crop: 'oyster', kg: '1', priceKg: '1', roomId: '' }, { crop: 'pink', kg, priceKg, roomId: '' }] }, { now: NOW });
  assert.deepEqual(body('10000.01', '1'), { error: 'kg must be over 0 up to 10,000', field: 'lines.1.kg' });
  assert.deepEqual(body('0', '1'), { error: 'kg must be over 0 up to 10,000', field: 'lines.1.kg' });
  assert.equal(body('10000', '1').lines[1].kg, 10000);
  assert.deepEqual(body('1', '1000.5'), { error: 'RM per kg must be 0 to 1,000', field: 'lines.1.priceKg' });
  assert.equal(body('1', '1000').lines[1].priceKg, 1000);
  assert.equal(body('1', '0').lines[1].priceKg, 0, 'a free sample');
});
