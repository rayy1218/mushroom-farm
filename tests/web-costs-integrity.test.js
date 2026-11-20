// Data integrity on the Costs page's pure parts (spec 2026-11-12-data-integrity-design.md 7, 8 and 11): electricity from the
// meter and from machine run time, a bill below the counted, the warned notes, voided entries and items, re-priced months.
// Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCE_WORDS, categoryRows, monthNotes, entryLine, equipmentLine, runParts, runRow, energyWords, repricedText, profitBars,
} from '../web/costs-math.js';

const NB = '\u00a0';
const plain = (s) => s.replace(/\u00a0/g, ' ');

test('electricity\'s two lines say where each comes from; a bill\'s line is the bill less the counted', () => {
  const rows = categoryRows([
    { label: 'Electricity · measured', source: 'measured', amount: 64.37, share: 10 },
    { label: 'Electricity · estimated', source: 'estimated', amount: 9.85, share: 2 },
    { label: 'Electricity bill', source: 'bill', amount: -4.2, share: -1 },
  ]);
  assert.deepEqual(rows.map((r) => r.source), ['from the meter', 'from machine run time', `bill${NB}−${NB}counted`]);
  assert.equal(SOURCE_WORDS.estimated, 'from machine run time');
});

test('estimates over a fifth, a room unseen and sales over the harvest are warned', () => {
  const notes = monthNotes({ pending: false, notes: [
    { kind: 'estimated-high', text: 'a' }, { kind: 'unseen', text: 'b' }, { kind: 'oversold', text: 'c' }, { kind: 'not-shared', text: 'd' },
  ] });
  assert.deepEqual(notes.map((n) => n.warn), [true, true, true, false]);
});

test('a bill below the counted lowers it', () => {
  const bill = { date: '2026-10-31', category: 'utilities', utility: 'electricity', roomName: null, amount: 410, repeat: null };
  assert.equal(plain(entryLine({ ...bill, topUp: { amount: -23.5, month: '2026-10' } }).topUp), 'lowers the counted electricity by RM 23.50');
  assert.equal(plain(entryLine({ ...bill, date: '2026-11-03', topUp: { amount: -23.5, month: '2026-10' } }).topUp), 'lowers the counted electricity by RM 23.50 to October');
});

test('a voided entry or item says so; an edited one is marked', () => {
  const at = Date.UTC(2026, 10, 10, 2); // 10 Nov, 10:00 at the farm
  const cost = { date: '2026-11-04', category: 'transport', roomName: null, amount: 85, repeat: null, voided: { at, by: 'Lim', reason: 'Entered twice' }, edits: 0 };
  assert.deepEqual([entryLine(cost).voided, entryLine(cost).edited], ['Voided 10 Nov by Lim: Entered twice', false]);
  assert.deepEqual([entryLine({ ...cost, voided: null, edits: 2 }).voided, entryLine({ ...cost, voided: null, edits: 2 }).edited], ['', true]);
  const item = { name: 'Fan 40 cm', roomId: null, part: 'other', boughtOn: '2026-09-01', amount: 240, monthly: 4, lifeMonths: 60, left: 228, done: false };
  assert.equal(equipmentLine({ ...item, voided: { at, by: 'Lim', reason: 'Never bought' } }).left, 'not written off: voided');
  assert.equal(equipmentLine({ ...item, voided: { at, by: 'Lim', reason: 'Never bought' } }).voided, 'Voided 10 Nov by Lim: Never bought');
  assert.equal(equipmentLine({ ...item, voided: null }).voided, '');
});

test('a run\'s electricity split into measured and estimated; its kg not sold; its re-priced months', () => {
  const run = {
    id: 3, parts: { blocks: 0, energy: 74.22, energyEstimated: 9.85, water: 0, own: 0, equipment: 0, shared: 0 }, notes: [],
    income: 900, kgHarvested: 120, kgSold: 100, kgNotSold: 6.5, repriced: ['2026-09'],
  };
  const parts = Object.fromEntries(runParts(run));
  assert.equal(plain(parts.Electricity), 'RM 64.37 measured · RM 9.85 estimated');
  assert.equal(parts['Not sold'], `6.5${NB}kg`);
  assert.equal(parts['Re-priced'], 'September 2026');
  assert.equal(plain(energyWords({ energy: 9.85, energyEstimated: 9.85 })), 'RM 9.85 estimated');
  const bare = Object.fromEntries(runParts({ ...run, parts: { ...run.parts, energyEstimated: 0 }, kgNotSold: 0, repriced: [] }));
  assert.equal(plain(bare.Electricity), 'RM 74.22');
  assert.equal('Not sold' in bare || 'Re-priced' in bare, false);
  const row = { ...run, startedAt: Date.UTC(2026, 8, 1), endedAt: null, roomName: 'Room 2', roomId: 2, crops: [{ crop: 'grey-oyster', kg: 120 }], costs: 400, profit: 500, profitPerKg: 4.17 };
  assert.equal(runRow(row).repriced, true);
  assert.equal(runRow({ ...row, repriced: [] }).repriced, false);
});

test('a re-priced month: what its profit was and is; its bar says so', () => {
  const r = { closedAt: Date.UTC(2026, 10, 15, 1), closedOn: '2026-11-14', was: { profit: 2045.3 }, now: { profit: 2012.85 } };
  assert.equal(plain(repricedText(r)), 'Re-priced since 14 Nov: profit was RM 2,045.30, now RM 2,012.85.', 'G16: the close day, not the day kept');
  assert.equal(repricedText(null), null);
  const bars = profitBars([{ month: '2026-09', income: 3000, costs: 1000, profit: 2000, pending: false, repriced: true }], '2026-09', 600, 160);
  assert.match(bars.bars[0].words, /September 2026: profit .*, re-priced$/);
  // the dot over the bar: over its value when there is room, else beside the value; none on a month not re-priced
  const two = profitBars([
    { month: '2026-08', income: 900, costs: 800, profit: 100, pending: false, repriced: true },
    { month: '2026-09', income: 3000, costs: 1000, profit: 2000, pending: false, repriced: true },
    { month: '2026-10', income: 300, costs: 1000, profit: -700, pending: false, repriced: true },
    { month: '2026-11', income: 300, costs: 100, profit: 200, pending: false },
  ], '2026-09', 600, 160);
  const [low, tall, loss, plainBar] = two.bars;
  assert.equal(plainBar.dot, null);
  assert.equal(low.dot.cx, low.x + low.w / 2);
  assert.ok(low.dot.cy < low.y - 14, 'over the value');
  assert.ok(tall.dot.cy >= 4 && tall.dot.cx > tall.x + tall.w / 2, 'no room over the tallest: beside its value');
  assert.ok(loss.dot.cy < two.zeroY, 'a loss hangs below zero: the dot over the zero line');
});

test('the run page: its re-priced months in a line', async () => {
  const { repricedLine } = await import('../web/runs-math.js');
  assert.equal(repricedLine({ repriced: ['2026-09'] }), 'Re-priced: September 2026’s figures changed after it closed.');
  assert.equal(repricedLine({ repriced: ['2026-08', '2026-09'] }), 'Re-priced: the figures of August 2026 and September 2026 changed after they closed.');
  assert.equal(repricedLine({ repriced: [] }), null);
});
