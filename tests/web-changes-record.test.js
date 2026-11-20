// The Changes page for one record (spec 2026-11-12-data-integrity-design.md 11): a History fold's "All changes" opens the page
// filtered to its record; a worker who opens the page reads whose it is. Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRoute, changesHash, canonicalHash, workerHash } from '../web/route.js';
import { recordLead } from '../web/changes-math.js';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');

test('the address of one record\'s changes; an id only with its kind', () => {
  assert.equal(changesHash({ kind: 'sale', id: 8 }), '#/business/changes?kind=sale&id=8');
  assert.deepEqual(parseRoute('#/business/changes?kind=sale&id=8'), { name: 'changes', days: 30, kind: 'sale', by: null, id: 8 });
  assert.equal(parseRoute('#/business/changes?id=8').id, null, 'no kind: no record');
  assert.equal(parseRoute('#/business/changes?kind=sale&id=x').id, null);
  assert.equal(canonicalHash(parseRoute('#/business/changes?kind=cost&id=12')), '#/business/changes?kind=cost&id=12');
});

test('a worker opens the page and reads whose it is (the server refuses the log)', () => {
  assert.equal(workerHash(parseRoute('#/business/changes')), null);
  assert.ok(src('changes-page.js').includes('if (err.status === 403) {'));
});

test('one record\'s page: what it is, its entries newest first, a link to all the changes of its kind', () => {
  const entries = [
    { id: 1, at: Date.UTC(2026, 10, 3, 2), by: 'Lim', role: 'owner', kind: 'sale', rowId: 8, action: 'add', after: { soldAt: Date.UTC(2026, 10, 3, 2), buyer: 'Restoran Wong', lines: [] } },
  ];
  assert.equal(recordLead(entries, 'sale'), 'Every change to this record: Sale of 3 Nov to Restoran Wong.');
  assert.equal(recordLead([], 'sale'), 'No changes to this record.');
  const page = src('changes-page.js');
  assert.ok(page.includes("const query = () => (id !== null ? `kind=${kind}&id=${id}`"));
  assert.ok(page.includes('changesHash({ kind })'));
  assert.ok(src('changes-fold.js').includes('all.href = changesHash({ kind, id });'));
});

test('a bill is named as the bill it is', async () => {
  const { recordTitle } = await import('../web/changes-math.js');
  const bill = (utility) => recordTitle({ kind: 'cost', rowId: 4, after: { category: 'utilities', utility, amount: 50, date: '2026-11-03' } });
  assert.match(bill('electricity'), /^Electricity bill, RM.50\.00 on 3 Nov$/);
  assert.match(bill('water'), /^Water bill, /);
  assert.match(bill('other'), /^Utilities, /);
});
