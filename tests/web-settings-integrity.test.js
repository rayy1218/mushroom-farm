// Data integrity on Settings (spec 2026-11-12-data-integrity-design.md 6.2 and 8.1): the Electricity tariff card in place of
// the price box, and Yield's Keeps fresh column. Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tariffRows, rateBody, rateVoidTitle, RATE_VOID_LEAD } from '../web/tariff-math.js';
import { yieldBody, EXTRA_FIELDS, parseExtraSettings } from '../web/settings-math.js';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const NB = ' ';
const plain = (s) => s.replace(/ /g, ' ');

const TARIFFS = [ // the server's list: newest first, voided ones too
  { id: 3, from: '2026-10-01', to: null, rate: 0.515, afa: 0.0275, price: 0.5425, note: 'TNB bill Oct 2026', voided: null, first: false, edits: 1 },
  { id: 4, from: '2026-09-15', to: null, rate: 0.6, afa: 0, price: 0.6, note: '', voided: { at: Date.UTC(2026, 10, 10, 2), by: 'Lim', reason: 'Wrong day' }, first: false, edits: 0 },
  { id: 2, from: '2025-06-01', to: '2026-09-30', rate: 0.515, afa: -0.01, price: 0.505, note: '', voided: null, first: false, edits: 0 },
  { id: 1, from: '2020-01-01', to: '2025-05-31', rate: 0.55, afa: 0, price: 0.55, note: "Settings' price before the tariff", voided: null, first: true, edits: 0 },
];

test('the tariff\'s rows: newest first, the To worked out ("and on" for the last), the figures to 4 places, a voided one said', () => {
  const rows = tariffRows(TARIFFS);
  assert.deepEqual(rows.map((r) => [plain(r.from), plain(r.to), r.rate, r.afa, r.price, r.note]), [
    ['1 Oct 2026', 'and on', '0.5150', '+0.0275', '0.5425', 'TNB bill Oct 2026'],
    ['15 Sep 2026', '—', '0.6000', '0.0000', '0.6000', ''],
    ['1 Jun 2025', 'to 30 Sep 2026', '0.5150', '−0.0100', '0.5050', ''],
    ['1 Jan 2020', 'to 31 May 2025', '0.5500', '0.0000', '0.5500', "Settings' price before the tariff"],
  ]);
  assert.deepEqual(rows.map((r) => [r.voided, r.edited, r.mayVoid]), [
    ['', true, true], ['Voided 10 Nov by Lim: Wrong day', false, false], ['', false, true], ['', false, false],
  ], 'the first rate is never voided');
  assert.ok(rows[0].from.includes(NB), 'a day never breaks inside');
});

test('a rate\'s body from its boxes: the day, the rate and the AFA to 4 places; each box named when wrong', () => {
  assert.deepEqual(rateBody({ from: '2026-11-01', rate: '0.515', afa: '0.0275', note: ' TNB Nov ' }), { body: { from: '2026-11-01', rate: 0.515, afa: 0.0275, note: 'TNB Nov' } });
  assert.deepEqual(rateBody({ from: '2026-11-01', rate: '0,515', afa: '', note: '' }).body, { from: '2026-11-01', rate: 0.515, afa: 0, note: '' }, 'a decimal comma; an empty AFA is 0');
  assert.deepEqual(rateBody({ from: '2026-11-01', rate: '0.5', afa: '-0.01', note: '' }).body.afa, -0.01, 'a rebate');
  assert.equal(rateBody({ from: '', rate: '0.5', afa: '' }).field, 'from');
  for (const rate of ['', '11', '-1', 'x', '0.55555']) assert.equal(rateBody({ from: '2026-11-01', rate, afa: '' }).field, 'rate', rate);
  for (const afa of ['1.5', '-2', 'x']) assert.equal(rateBody({ from: '2026-11-01', rate: '0.5', afa }).field, 'afa', afa);
  assert.equal(rateBody({ from: '2026-11-01', rate: '0.5', afa: '', note: 'x'.repeat(201) }).field, 'note');
});

test('the void confirm\'s words', () => {
  assert.equal(plain(rateVoidTitle(TARIFFS[0])), 'Void the rate from 1 Oct 2026?');
  assert.equal(RATE_VOID_LEAD, 'Its days take the rate before it.');
});

test('Settings: the tariff card in place of the price box; Settings\' save no longer sends a price', () => {
  const page = src('settings-page.js');
  assert.ok(!page.includes('f-electricityPrice'));
  assert.ok(page.includes("import { mountTariff } from './tariff-card.js';"));
  assert.ok(page.includes('<div data-tariff></div>'));
  assert.ok(page.includes("mountTariff(q('[data-tariff]'))"));
  assert.deepEqual(EXTRA_FIELDS.map((f) => f.name), ['outdoorAddress', 'waterPrice']);
  assert.deepEqual(parseExtraSettings({ outdoorAddress: '', waterPrice: '' }), { body: { outdoorAddress: null, waterPrice: null } });
});

test('the tariff card: its table, Add a rate, a quiet Edit each, Void (not the first), Restore and History; the asks under From', () => {
  const card = src('tariff-card.js');
  assert.ok(card.includes('<h2 id="tf-title">Electricity tariff</h2>'));
  for (const head of ['From', 'To', 'Rate', 'AFA', 'RM per kWh', 'Note']) assert.ok(card.includes(`<th scope="col"${head === 'Rate' || head === 'AFA' || head === 'RM per kWh' ? ' class="num"' : ''}>${head}</th>`), head);
  assert.ok(card.includes("request('GET', '/api/tariffs')"));
  assert.ok(card.includes("request('POST', '/api/tariffs', b"));
  assert.ok(card.includes('request(\'PUT\', `/api/tariffs/${rate.id}`, b'));
  assert.ok(card.includes('path: `/api/tariffs/${rate.id}/void`'));
  assert.ok(card.includes('path: `/api/tariffs/${rate.id}/restore`'));
  assert.ok(card.includes("addHistory({ kind: 'tariff', id: rate.id })"));
  assert.ok(card.includes("askingSend({ value: 'save'"));
  assert.ok(card.includes("label: 'Void this rate'") && card.includes('row?.mayVoid'));
  assert.ok(card.includes('Add a rate'));
  assert.ok(card.includes("live.on('costs'"), 'a rate set from elsewhere (Settings\' old route) reads again');
});

test('Yield: Keeps fresh (days), 1 to 60 whole, empty the crop\'s default (shown as the placeholder)', () => {
  assert.deepEqual(yieldBody([{ crop: 'pink', dryKg: '', priceKg: '', keepDays: '4' }, { crop: 'oyster', dryKg: '0.9', priceKg: '', keepDays: '' }]),
    { cropYield: { pink: { dryKg: null, priceKg: null, keepDays: 4 }, oyster: { dryKg: 0.9, priceKg: null } } });
  for (const keepDays of ['0', '61', '2.5', 'x']) {
    const r = yieldBody([{ crop: 'oyster', dryKg: '', priceKg: '', keepDays }]);
    assert.equal(r.field, 'keepDays:oyster', keepDays);
    assert.match(r.error, /Grey oyster: keeps fresh must be 1 to 60 days, or empty/);
  }
  const card = src('yield-card.js');
  assert.ok(card.includes("{ key: 'keepDays', label: 'Keeps fresh (days)'"));
  assert.ok(card.includes('KEEP_DAYS[crop]'), 'the default as the placeholder');
  assert.ok(card.includes('keepDays: inputs[`keepDays:${crop}`].input.value'));
});
