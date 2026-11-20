// The Changes page, #/business/changes (spec 2026-11-12-data-integrity-design.md 11): its pure words in web/changes-math.js
// (the periods, the What filter, a row, a record's link, the empty words) and the page's wiring, styles and the router.
// Source checks for the page. Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CHANGE_PERIODS, KIND_FILTERS, recordHref, whenText, changeRow, changeRows, changesEmpty, CHANGES_LEAD, CHANGES_OWNER,
} from '../web/changes-math.js';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const at = (d, hh = 12, mm = 0) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), hh - 8, mm);
const plain = (s) => s.replace(/ /g, ' ');

test('the periods and the What filter: the spec\'s words, every kind once', () => {
  assert.deepEqual(CHANGE_PERIODS, [[7, '7 days'], [30, '30 days'], [90, '13 weeks'], [365, '12 months']]);
  assert.deepEqual(KIND_FILTERS, [
    ['', 'All'], ['sale', 'Sales'], ['cost', 'Costs'], ['equipment', 'Equipment'], ['harvest', 'Harvests'], ['move', 'Inventory'],
    ['not-sold', 'Not sold'], ['tariff', 'Tariff'], ['month', 'Months'], ['room', 'Rooms'],
  ]);
  assert.equal(CHANGES_LEAD, 'Every change to a money record: who, when, before and after.');
  assert.match(CHANGES_OWNER, /Ask the owner\.$/);
});

test('a record\'s link: the page that keeps it; none for a deleted room or a harvest of one', () => {
  const e = (kind, rec, rowId = 4) => ({ kind, rowId, before: null, after: rec });
  assert.equal(recordHref(e('sale', { soldAt: at('2026-11-05') })), '#/business/sales');
  assert.equal(recordHref(e('cost', { date: '2026-10-31', category: 'rent' })), '#/business/costs?month=2026-10');
  assert.equal(recordHref(e('equipment', { name: 'Fan 40 cm' })), '#/business/costs');
  assert.equal(recordHref(e('harvest', { roomId: 3, roomName: 'Container 3', crop: 'oyster', kg: 12 })), '#/rooms/3/harvest');
  assert.equal(recordHref(e('harvest', { roomId: 3, roomName: null, crop: 'oyster', kg: 12 })), null, 'its room is gone');
  assert.equal(recordHref(e('move', { itemId: 9, itemName: 'Gas cylinder' })), '#/business/inventory/9');
  assert.equal(recordHref(e('not-sold', { crop: 'oyster', kg: 12 })), '#/business/sales');
  assert.equal(recordHref(e('tariff', { from: '2026-10-01' })), '#/settings');
  assert.equal(recordHref(e('month', null, 202610)), '#/business/costs?month=2026-10');
  assert.equal(recordHref({ kind: 'room', rowId: 2, before: { name: 'Room 2' }, after: null }), null);
  assert.equal(recordHref({ kind: 'cost', rowId: 5, before: { date: '2026-09-02' }, after: null }), '#/business/costs?month=2026-09', 'a void has only before');
});

test('when: the day and time, the year added when it is not this year\'s', () => {
  assert.equal(whenText(at('2026-11-10', 14, 3), '2026-11-13'), '10 Nov 14:03');
  assert.equal(whenText(at('2025-12-30', 9, 5), '2026-11-13'), '30 Dec 2025 09:05');
});

test('a row: when, who, what with its link, the change in words (its reason in Why, not twice), why (— when none)', () => {
  const sale = { soldAt: at('2026-11-05', 9), buyer: 'Kedai Ah Seng', lines: [{ crop: 'oyster', kg: 4, priceKg: 13.5, total: 54 }] };
  const row = changeRow({ id: 31, at: at('2026-11-10', 14, 3), by: 'Lim', role: 'owner', kind: 'sale', rowId: 7, action: 'void', before: sale, after: null, reason: 'Entered twice' }, '2026-11-13');
  assert.deepEqual({ ...row, change: plain(row.change) }, {
    id: 31, when: '10 Nov 14:03', who: 'Lim', what: 'Sale of 5 Nov to Kedai Ah Seng', href: '#/business/sales', change: 'Voided', why: 'Entered twice',
  });
  const added = changeRow({ id: 32, at: at('2026-11-10', 15), by: 'Aminah', role: 'worker', kind: 'harvest', rowId: 8, action: 'add', before: null,
    after: { roomId: 4, roomName: 'Container 4', crop: 'oyster', kg: 38.4, pickedAt: at('2026-11-10', 7, 50) }, reason: null }, '2026-11-13');
  assert.deepEqual([plain(added.what), added.href, added.change, added.why], ['Grey oyster, 38.40 kg in Container 4 on 10 Nov', '#/rooms/4/harvest', 'Recorded', '—']);
});

test('the empty words say the period, and the filter when one is on', () => {
  assert.equal(changesEmpty({ days: 30 }), 'No changes in the last 30 days.');
  assert.equal(changesEmpty({ days: 90 }), 'No changes in the last 13 weeks.');
  assert.equal(changesEmpty({ days: 7, kind: 'cost' }), 'No changes to Costs in the last 7 days.');
  assert.equal(changesEmpty({ days: 365, kind: 'sale', by: 'Lim' }), 'No changes to Sales by Lim in the last 12 months.');
});

// ---- the page ----
const page = src('changes-page.js');
const app = src('app.js');
const css = src('styles.css');
const dxCss = css.slice(css.indexOf('/* The Changes page (Data integrity 11) */'), css.indexOf('/* Sales (Data integrity 11)'));

test('the router mounts the page on its own with a back link to the Summary', () => {
  assert.ok(app.includes("import * as changes from './changes-page.js'; // ---- Data integrity ----"));
  assert.ok(app.includes(": route.name === 'changes' ? changes.mount(view, { days: route.days, kind: route.kind, by: route.by, id: route.id }) // ---- Data integrity ----"));
  assert.ok(page.includes('<a class="back" href="${BUSINESS_HASH}" data-back>Summary</a>'));
  assert.ok(page.includes('<h1 class="page-title" tabindex="-1">Changes</h1>'));
});

test('it reads the period\'s entries with its filters, keeps them in the address, and exports the period', () => {
  assert.ok(page.includes("request('GET', `/api/changes?${query()}`)"));
  assert.ok(page.includes("history.replaceState(null, '', changesHash(shown()));"));
  assert.ok(page.includes('els.csv.href = `/api/changes.csv?days=${days}${kind ? `&kind=${kind}` : \'\'}`;'));
  assert.ok(page.includes('if (!alive() || mine !== seq) return;'));
  // a worker (403): the page says whose it is, no banner to retry
  assert.ok(page.includes('if (err.status === 403) {'));
  assert.ok(page.includes('CHANGES_OWNER'));
});

test('a table with its caption on a desk; each entry a block on a phone; 44 px targets', () => {
  assert.ok(page.includes("const COLUMNS = ['When', 'Who', 'What', 'Change', 'Why'];"));
  assert.ok(page.includes("td.dataset.label = COLUMNS[i];"));
  assert.match(dxCss, /@media \(max-width: 600px\) \{[\s\S]*\.dx-changes-table tr \{ display: grid;/);
  assert.match(dxCss, /min-height: 44px/);
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(dxCss), 'tokens only');
});

// UI check (2026-11-13): a Mark paid or unpaid keeps only the paid day; the page names its sale from the sale's other entries
// in the reply, else by its number ("Sale of — to a buyer" read as a broken record).
test('a paid or unpaid entry is named by its sale', () => {
  const sale = { soldAt: at('2026-11-06', 10), buyer: 'Restoran Wong', lines: [{ crop: 'pink', kg: 3.2, priceKg: 18, total: 57.6 }] };
  const entries = [
    { id: 40, at: at('2026-11-12', 17, 49), by: 'Lim', role: 'owner', kind: 'sale', rowId: 8, action: 'unpaid', before: { paidAt: at('2026-11-08', 15) }, after: null, reason: 'The buyer\'s transfer bounced' },
    { id: 12, at: at('2026-11-12', 17, 48), by: 'Lim', role: 'owner', kind: 'sale', rowId: 8, action: 'add', before: null, after: sale, reason: null },
    { id: 9, at: at('2026-11-12', 17, 47), by: 'Lim', role: 'owner', kind: 'sale', rowId: 5, action: 'paid', before: { paidAt: null }, after: { paidAt: at('2026-11-08', 15) }, reason: null },
  ];
  const rows = changeRows(entries, '2026-11-13');
  assert.equal(rows[0].what, 'Sale of 6 Nov to Restoran Wong');
  assert.equal(rows[2].what, 'Sale no. 5', 'its sale not in the reply: its number');
  assert.equal(rows[2].href, '#/business/sales');
  assert.ok(src('changes-page.js').includes('for (const r of changeRows(entries, today)) {'));
});

test('a period of more than the page holds says so and points to the CSV', async () => {
  const { CHANGES_MORE } = await import('../web/changes-math.js');
  assert.equal(CHANGES_MORE(500), 'Showing the newest 500 changes. Export CSV holds every one.');
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../web/changes-page.js', import.meta.url), 'utf8');
  assert.ok(page.includes("paintTable(reply.entries, reply.more ? [el('p', 'muted dx-changes-more', CHANGES_MORE(reply.entries.length))] : []);"));
});
