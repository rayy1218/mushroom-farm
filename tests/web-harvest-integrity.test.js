// Data integrity on the Harvest tab and page (spec 2026-11-12-data-integrity-design.md 5.1, 6.1, 7.2, 11 and 12): a voided
// harvest in place, struck, with who and why; Not sold on the run card, its records under the harvests and its Undo line;
// the server's asks in Record, Edit and Done (the browser's pick check gone); the energy per kg's estimated and unseen parts.
// Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runTiles, pageTiles, unseenText, sheetRows } from '../web/harvest-math.js';
import { harvestMarks, notSoldLine, notSoldSaid } from '../web/harvest-integrity-math.js';

const NB = ' ';
const plain = (s) => s.replace(/ /g, ' ');
const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const at = (d, hh, mm = 0) => Date.UTC(2026, 10, d, hh - 8, mm); // the farm's clock, November 2026

test('a voided harvest says so (who, when, why); an edited one is marked', () => {
  const h = { id: 4, crop: 'oyster', kg: 6.25, flush: 1, pickedAt: at(10, 8), worker: 'Aminah', taskId: null, edits: 0, voided: { at: at(10, 10), by: 'Lim', reason: 'Weighed with the crate' } };
  assert.deepEqual(harvestMarks(h), { voided: 'Voided 10 Nov by Lim: Weighed with the crate', edited: false });
  assert.deepEqual(harvestMarks({ ...h, voided: null, edits: 2 }), { voided: '', edited: true });
  assert.deepEqual(harvestMarks({ ...h, voided: null }), { voided: '', edited: false });
});

test('a run\'s Not sold record: "12.00 kg spoiled · Aminah · 10 Nov 16:20"; the crop named in a mixed room; voided said', () => {
  const r = { id: 2, at: at(10, 16, 20), crop: 'oyster', kg: 12, reason: 'spoiled', worker: 'Aminah', voided: null, edits: 0 };
  assert.deepEqual(Object.fromEntries(Object.entries(notSoldLine(r)).map(([k, v]) => [k, typeof v === 'string' ? plain(v) : v])),
    { kg: '12.00 kg', text: 'spoiled · Aminah · 10 Nov 16:20', voided: '', edited: false });
  assert.equal(plain(notSoldLine({ ...r, crop: 'lionsmane', reason: 'rejected' }, { mixed: true }).text), 'Lion\'s mane, rejected by the buyer · Aminah · 10 Nov 16:20');
  assert.equal(notSoldLine({ ...r, worker: null }).text.includes('· ·'), false, 'no name: left out');
  assert.equal(notSoldLine({ ...r, voided: { at: at(10, 17), by: 'Lim', reason: 'They sold after all' } }).voided, 'Voided 10 Nov by Lim: They sold after all');
  assert.equal(notSoldLine({ ...r, edits: 1 }).edited, true);
  assert.equal(plain(notSoldSaid(r)), '12.00 kg of Grey oyster recorded not sold (spoiled)');
});

test('energy per kg: "incl. RM 9.85 estimated" when any of it is, the time the room was not seen when any', () => {
  assert.equal(unseenText(6 * 3_600_000), `6${NB}h`);
  assert.equal(unseenText(7 * 3_600_000 + 10 * 60_000), `7${NB}h 10${NB}min`);
  assert.equal(unseenText((2 * 24 + 3) * 3_600_000), `2${NB}days 3${NB}h`);
  assert.equal(unseenText(40 * 60_000), `40${NB}min`);
  assert.equal(unseenText(6 * 3_600_000 + 55 * 60_000), `6${NB}h 55${NB}min`, 'to the 5 minutes, as Costs\' note and the Energy card');
  assert.equal(unseenText(2 * 60_000), '', 'under 5 minutes: not said');
  const run = {
    kg: 100, perBlock: 0.2, be: 30, value: 1200, crops: [{ crop: 'oyster', blocks: 500 }], byCrop: [],
    cost: { costPerKg: 0.7422, cost: 74.22, days: 12, water: false, estimated: 9.85, unseenMs: 6 * 3_600_000 },
  };
  const tile = runTiles(run).find((t) => t.label === 'Energy per kg');
  assert.equal(plain(tile.line), 'electricity · 12 days · incl. RM 9.85 estimated · 6 h not seen');
  const bare = runTiles({ ...run, cost: { costPerKg: 0.7422, cost: 74.22, days: 12, water: false } }).find((t) => t.label === 'Energy per kg');
  assert.equal(plain(bare.line), 'electricity · 12 days');
  const farm = { totals: { kg: 100, value: 1200, cost: { costPerKg: 0.2, cost: 20, days: 30, water: true, estimated: 20 } }, rooms: [], crops: [] };
  assert.equal(plain(pageTiles(farm).find((t) => t.label === 'Energy per kg').line), 'electricity and water · 30 days · incl. RM 20.00 estimated');
});

test('the Harvest page\'s records: a voided pick its own row, said as voided (the sheet\'s figures leave it out)', () => {
  const rows = sheetRows([
    { date: '2026-11-10', roomName: 'Container 4', crop: 'oyster', runStartedAt: at(1, 9), kg: 30 },
    { date: '2026-11-10', roomName: 'Container 4', crop: 'oyster', runStartedAt: at(1, 9), kg: 6.25, voided: { at: at(10, 10), by: 'Lim', reason: 'Weighed with the crate' } },
  ]);
  assert.equal(rows[0].voided, undefined);
  assert.deepEqual(rows[1].voided, { at: at(10, 10), by: 'Lim', reason: 'Weighed with the crate' }, 'the void itself: the page says it (voidLine)');
  assert.equal(rows[1][3], '6.25', 'its kg kept, struck on the page');
});

test('the run card: Not sold beside Record (owner and worker), its records under the harvests, the Undo line for its minute', () => {
  const card = src('harvest-card.js');
  assert.ok(card.includes("const notSold = button('Not sold');"));
  assert.ok(!/notSold\.dataset\.ownerOnly/.test(card), 'a worker records Not sold too');
  assert.ok(card.includes('openNotSold({'));
  assert.ok(card.includes('undoNotSold(made.id)'));
  assert.ok(card.includes('notSoldSaid(made)'));
  assert.ok(card.includes("el('h3', 'hv-ns-title', 'Not sold')"));
  assert.ok(card.includes('notSoldLine(r, { mixed })'));
});

test('a voided harvest stays, struck, for owner and worker; Edit has Void this harvest and its History; a voided one opens as itself', () => {
  const card = src('harvest-card.js');
  assert.ok(card.includes("li.classList.add('dx-voided');"));
  assert.ok(card.includes("el('span', 'dx-chip', 'Voided')"));
  assert.ok(card.includes("el('span', 'hv-kg dx-figure', l.kg)"));
  assert.ok(card.includes("el('p', 'dx-void-line', marks.voided)"));
  assert.ok(card.includes("el('span', 'dx-edited', 'edited')"));
  assert.ok(card.includes("label: 'Void this harvest'"));
  assert.ok(card.includes('path: `/api/harvests/${h.id}/void`'));
  assert.ok(card.includes('path: `/api/harvests/${h.id}/restore`'));
  assert.ok(card.includes("addHistory({ kind: 'harvest', id: h.id });"));
  assert.ok(!card.includes("'DELETE'"), 'a harvest is voided, never deleted');
});

test('Record, Edit and Done send through the server\'s asks; the browser\'s own pick check is gone', () => {
  const card = src('harvest-card.js');
  const dialogs = src('task-dialogs.js');
  assert.ok(card.includes("askingSend({ value: 'record', label: 'Record', fields: ['crop', 'kg', 'pickedDate', 'pickedTime'] })"));
  assert.ok(card.includes("askingSend({ value: 'save', label: 'Save', fields: ['kg', 'pickedDate', 'pickedTime'] })"));
  assert.ok(dialogs.includes("askingSend({ value: 'done', label: 'Done', fields: amounts.map((f) => f.name) })"));
  for (const gone of ['pickGuard', 'recordPicks', 'editPicks', 'donePicks', 'pickWarnings']) {
    assert.ok(!card.includes(gone) && !dialogs.includes(gone) && !src('harvest-math.js').includes(`export const ${gone}`), gone);
  }
});

test('the Harvest page\'s records table strikes a voided row', () => {
  const page = src('harvest-page.js');
  assert.ok(page.includes("if (cells.voided) {\n        tr.classList.add('dx-voided');"));
  assert.ok(page.includes('voidLine(cells.voided)'));
});

// UI check: the day and month never part at a line's end on a phone ("12 / Nov 17:00").
test('a Not sold record\'s time keeps its day and month together', () => {
  const r = { kg: 12, crop: 'pink', reason: 'spoiled', worker: 'Aminah', at: Date.UTC(2026, 10, 12, 8, 20), voided: null, edits: 0 };
  assert.match(notSoldLine(r).text, /12 Nov 16:20$/);
});

test('the Not sold line offers Undo 2 s less than the server allows (the Harvest tab, the Sales page)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = (n) => readFileSync(new URL(`../web/${n}`, import.meta.url), 'utf8');
  assert.ok(src('harvest-card.js').includes('const SAID_MS = 58_000;'));
  assert.ok(src('sales-page.js').includes('els.nsStatus.replaceChildren(); }, 58_000);'));
});
