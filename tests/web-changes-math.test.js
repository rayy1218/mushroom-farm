// The change log's words (web/changes-math.js, spec 2026-11-12-data-integrity-design.md 3.3): every action, a record's title
// for every kind, an entry's line. Made-up figures (the golden case G2's four entries).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeWords, recordTitle, entryLine, diffWords, BEFORE_LOG, monthOfRow } from '../web/changes-math.js';

const at = (d, hh = 12, mm = 0) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), hh - 8, mm);
const plain = (s) => s.replace(/\u00a0/g, ' ');
const SALE = { soldAt: at('2026-11-03', 10), buyer: 'Restoran Wong', buyerId: 2, invoiceNo: null, note: null, paidAt: null,
  lines: [{ crop: 'pink', kg: 3.2, priceKg: 18, total: 57.6, roomId: null, roomName: null }] };

test("G2: a paid sale's four entries in words", () => {
  const e = (action, extra) => ({ at: at('2026-11-10', 14, 3), by: 'Lim', kind: 'sale', rowId: 7, action, before: null, after: null, reason: null, ...extra });
  const edited = { ...SALE, lines: [{ ...SALE.lines[0], priceKg: 0.1, total: 0.32 }] };
  assert.deepEqual([
    e('add', { after: SALE }), e('paid', { before: { paidAt: null }, after: { paidAt: at('2026-11-06') } }),
    e('unpaid', { before: { paidAt: at('2026-11-06') }, reason: "The buyer's transfer bounced" }), e('edit', { before: SALE, after: edited }),
  ].map((x) => plain(changeWords(x))), [
    'Recorded', 'Marked paid on 6 Nov', "Marked unpaid (was paid 6 Nov): The buyer's transfer bounced",
    'Edited: Pink oyster RM 18.00 → RM 0.10 a kg; total RM 57.60 → RM 0.32',
  ]);
  assert.equal(plain(entryLine(e('void', { reason: 'Entered twice' }))), '10 Nov 14:03 · Lim · Voided: Entered twice');
  assert.equal(recordTitle(e('add', { after: SALE })), 'Sale of 3 Nov to Restoran Wong');
});

test('a sale edit: a line added and removed, the kg, the room, the date, buyer and reference', () => {
  const after = { ...SALE, soldAt: at('2026-11-04'), invoiceNo: 'INV-88', lines: [{ crop: 'oyster', kg: 4, priceKg: 13.5, total: 54, roomName: 'Container 4' }] };
  assert.equal(plain(diffWords('sale', SALE, after)),
    'Grey oyster 4.00 kg added; Pink oyster 3.20 kg removed; total RM 57.60 → RM 54.00; date 3 Nov → 4 Nov; reference none → “INV-88”');
});

test('the other kinds: titles and edits', () => {
  const cost = { date: '2026-11-10', category: 'packaging', amount: 45, roomName: null, worker: null, note: '' };
  assert.equal(plain(recordTitle({ kind: 'cost', after: cost })), 'Packaging, RM 45.00 on 10 Nov');
  assert.equal(plain(diffWords('cost', cost, { ...cost, amount: 50, roomName: 'Container 4' })), 'amount RM 45.00 → RM 50.00; for the farm → Container 4');
  const pick = { crop: 'oyster', kg: 38.4, pickedAt: at('2026-11-10', 7, 50), roomName: 'Container 4', worker: 'Aminah' };
  assert.equal(plain(recordTitle({ kind: 'harvest', after: pick })), 'Grey oyster, 38.40 kg in Container 4 on 10 Nov');
  assert.equal(diffWords('harvest', pick, { ...pick, kg: 3.84 }), 'kg 38.40 → 3.84');
  assert.equal(plain(recordTitle({ kind: 'move', after: { itemName: 'Bleach', refKind: 'purchase', qty: 10, unit: 'L', at: at('2026-11-03') } })), 'Bleach: purchase of 10.00 L on 3 Nov');
  assert.equal(plain(recordTitle({ kind: 'not-sold', after: { crop: 'woodear', kg: 166, at: at('2026-11-10') } })), 'Not sold: Black jelly (wood ear) 166.00 kg on 10 Nov');
  assert.equal(recordTitle({ kind: 'tariff', after: { from: '2026-10-01' } }), 'Electricity rate from 1 Oct 2026');
  assert.equal(diffWords('tariff', { from: '2026-10-01', rate: 0.515, afa: 0, note: '' }, { from: '2026-10-01', rate: 0.515, afa: 0.0275, note: '' }), 'AFA RM 0.0000 a kWh → RM 0.0275 a kWh');
  assert.equal(recordTitle({ kind: 'equipment', after: { name: 'Steel rack' } }), 'Steel rack (equipment)');
  assert.equal(recordTitle({ kind: 'month', rowId: 202610 }), "October 2026's figures");
  assert.equal(monthOfRow(202611), 'November 2026');
});

test('the actions without a diff', () => {
  assert.equal(changeWords({ action: 'restore', reason: null }), 'Restored');
  assert.equal(changeWords({ action: 'undo' }), 'Undone within a minute');
  assert.equal(plain(changeWords({ action: 'change', before: { amount: 1500 }, after: { from: '2026-12', amount: 1600 } })), 'From Dec 2026: RM 1,500.00 → RM 1,600.00 a month');
  assert.equal(changeWords({ action: 'stop', after: { repeatUntil: '2026-10' } }), 'Stopped after Oct 2026');
  assert.equal(plain(changeWords({ action: 'keep', before: { profit: 2045.3 }, after: { profit: 2012.85 } })), 'New figures kept: profit RM 2,045.30 → RM 2,012.85');
  assert.equal(plain(changeWords({ action: 'delete', before: { name: 'Room 2', runs: 2, harvests: 14, kg: 63.4 } })), 'Room 2 deleted with 2 runs and 14 harvests, 63.40 kg');
  assert.equal(BEFORE_LOG(at('2026-11-12')), 'Recorded before the change log began (12 Nov 2026)');
});
