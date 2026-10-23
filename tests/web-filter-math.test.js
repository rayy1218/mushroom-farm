// The room dialog's Filter section and the room page's Filter card (spec 2026-10-22-filter-design.md 3 and 5): texts, checks
// like the server's, and the card's words.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILTER } from '../server/rooms.js';
import { FILTER_SETTINGS, filterTexts, parseFilter, dpAddressOf, filterCard, filterBar, changesStale } from '../web/filter-math.js';

const DAY = 86_400_000;
const now = new Date(2026, 9, 22, 12, 0).getTime();

test('the settings are those of the server (server/rooms.js FILTER)', () => {
  assert.deepEqual(FILTER_SETTINGS.map((f) => [f.name, f.def, f.min, f.max]), FILTER.map((f) => [f.field, f.default, f.min, f.max]));
});

test('texts: the room\'s, else the defaults', () => {
  assert.deepEqual(filterTexts(null), { fanMaxPa: '200', filterCleanPa: '40', filterFinalPa: '80', filterChangeDays: '30' });
  assert.deepEqual(filterTexts({ fanMaxPa: 300, filterCleanPa: 25, filterFinalPa: 120, filterChangeDays: 0 }),
    { fanMaxPa: '300', filterCleanPa: '25', filterFinalPa: '120', filterChangeDays: '0' });
});

test('parse: whole numbers in range, the fan and the change pressure above the clean drop, as the server says it', () => {
  assert.deepEqual(parseFilter(filterTexts(null)), { values: { fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30 } });
  assert.deepEqual(parseFilter({ ...filterTexts(null), filterFinalPa: '200' }).errors, { filterFinalPa: "Filter change pressure must be below the fan's maximum pressure" });
  assert.deepEqual(parseFilter({ fanMaxPa: '10', filterCleanPa: '40.5', filterFinalPa: '150', filterChangeDays: '366' }).errors, {
    fanMaxPa: 'Intake fan maximum pressure must be a whole number from 20 to 2000 Pa',
    filterCleanPa: 'Clean filter pressure drop must be a whole number from 5 to 1000 Pa',
    filterChangeDays: 'Change the filter every must be a whole number from 0 to 365 days',
  });
  assert.deepEqual(parseFilter({ fanMaxPa: '40', filterCleanPa: '40', filterFinalPa: '30', filterChangeDays: '' }).errors, {
    fanMaxPa: "Fan maximum pressure must be above the clean filter's pressure drop",
    filterFinalPa: "Filter change pressure must be above the clean filter's pressure drop",
    filterChangeDays: 'Change the filter every must be a whole number from 0 to 365 days',
  });
});

test('the pressure sensor address: blank is none, else 1 to 247', () => {
  assert.equal(dpAddressOf(''), null);
  assert.equal(dpAddressOf(' 12 '), 12);
  assert.ok(Number.isNaN(dpAddressOf('0')));
  assert.ok(Number.isNaN(dpAddressOf('2.5')));
});

const room = { fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30, filterChangedAt: now - 12.4 * DAY, dpAddress: 9 };
const sensor = (over = {}) => ({ kind: 'dp', address: 9, status: 'online', failuresInRow: 0, lastOk: { at: now - 5000, pa: 62.4 }, readings: [], ...over });

test('the card: pressure on the bar between clean and the change pressure, days in use and when it is due', () => {
  const c = filterCard({ room, sensor: sensor(), changes: [], now });
  assert.equal(c.pressure.text, '62.4 Pa');
  assert.equal(c.pressure.status, 'Online');
  assert.deepEqual([c.pressure.min, c.pressure.clean, c.pressure.final, c.pressure.max], [0, 40, 80, 200]);
  assert.equal(c.pressure.value, 62.4);
  assert.equal(c.pressure.over, false);
  assert.equal(c.age, '12 days in use');
  const due = new Date(room.filterChangedAt + 30 * DAY);
  assert.equal(c.due, `Change by ${due.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][due.getMonth()]} (every 30 days)`);
  assert.equal(c.overdue, false);
  assert.equal(c.changes.length, 0);
});

test('the card without a sensor, without a reminder, overdue, at the change pressure, with past changes', () => {
  const plain = filterCard({ room: { ...room, dpAddress: null, filterChangeDays: 0 }, sensor: null, changes: [], now });
  assert.equal(plain.pressure, null);
  assert.equal(plain.noSensor, 'No pressure sensor');
  assert.equal(plain.due, 'No reminder');
  const late = filterCard({ room: { ...room, filterChangedAt: now - 33 * DAY }, sensor: sensor({ lastOk: { at: now - 5000, pa: 162 } }), changes: [], now });
  assert.equal(late.overdue, true);
  assert.match(late.due, /^Due since \d+ \w+ \(every 30 days\)$/);
  assert.equal(late.pressure.over, true);
  assert.equal(late.age, '33 days in use');
  const waiting = filterCard({ room, sensor: sensor({ status: 'no-data', lastOk: null }), changes: [], now });
  assert.equal(waiting.pressure.text, 'No reading yet');
  assert.equal(waiting.pressure.value, null);
  const changes = Array.from({ length: 7 }, (_, i) => ({ at: now - (i + 1) * 30 * DAY, paBefore: i === 0 ? null : 140 + i }));
  const c = filterCard({ room, sensor: sensor(), changes, now });
  assert.equal(c.changes.length, 5);
  assert.match(c.changes[0], /^Changed \d+ \w+ \d\d:\d\d$/);
  assert.match(c.changes[1], /^Changed \d+ \w+ \d\d:\d\d at 141 Pa$/);
  assert.equal(filterCard({ room: { ...room, filterChangedAt: now - 0.4 * DAY }, sensor: null, changes: [], now }).age, 'Changed today');
  assert.equal(filterCard({ room: { ...room, filterChangedAt: now - 1.2 * DAY }, sensor: null, changes: [], now }).age, '1 day in use');
});

test('the room dialog has an input and an error line for the sensor address and each setting, and sends them', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  for (const name of ['dpAddress', ...FILTER_SETTINGS.map((f) => f.name)]) {
    assert.match(html, new RegExp(`<input id="f-${name}" name="${name}"`), name);
    assert.match(html, new RegExp(`id="e-${name}"`), name);
  }
  const js = readFileSync(new URL('../web/room-dialog.js', import.meta.url), 'utf8');
  assert.match(js, /\.\.\.FILTER_NAMES/);
  assert.match(js, /dpAddress: dp,/);
  assert.match(js, /\.\.\.filter\.values,/);
});

test('the room page shows the Filter card with the room and its dp sensor; the card uses the two filter routes', () => {
  const page = readFileSync(new URL('../web/room-detail.js', import.meta.url), 'utf8');
  assert.match(page, /import \{ createFilterCard \} from '\.\/filter-card\.js';/);
  assert.match(page, /<section data-filter hidden><\/section>/);
  assert.match(page, /dp: list\.find\(\(s\) => s\.kind === 'dp'\) \?\? null/);
  assert.match(page, /filterCard\.update\(room, sensors\.dp\)/);
  assert.match(page, /filterCard\?\.destroy\(\);[\s\S]*filterCard\?\.destroy\(\);/); // a missing room and unmount
  const card = readFileSync(new URL('../web/filter-card.js', import.meta.url), 'utf8');
  assert.match(card, /request\('POST', `\/api\/rooms\/\$\{roomId\}\/filter\/changed`\)/);
  assert.match(card, /request\('GET', `\/api\/rooms\/\$\{roomId\}\/filter\/changes`\)/);
  assert.doesNotMatch(card, /'meter'/, 'a plain bar, not a <meter>');
  assert.match(card, /if \(loading \|\| !room \|\| !changesStale\(seen, room\)\) return;/);
  assert.match(card, /update\(r, s\) \{\n      room = r;\n      sensor = s \?\? null;\n      paint\(\);\n      loadChanges\(\);/);
});

test('the bar: the fill is the reading over the scale, clamped; ticks at clean and change; its colour by range', () => {
  const room = { fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80 };
  assert.deepEqual(filterBar(room, 62.4), { fill: 62.4 / 200, cleanAt: 0.2, finalAt: 0.4, tone: 'ok' });
  assert.deepEqual(filterBar(room, 19.9), { fill: 19.9 / 200, cleanAt: 0.2, finalAt: 0.4, tone: 'warn' }, 'below half the clean drop: missing or torn');
  assert.equal(filterBar(room, 20).tone, 'ok');
  assert.equal(filterBar(room, 79.9).tone, 'ok');
  assert.equal(filterBar(room, 80).tone, 'bad');
  assert.deepEqual(filterBar(room, 250), { fill: 1, cleanAt: 0.2, finalAt: 0.4, tone: 'bad' }, 'above the fan maximum: full');
  assert.equal(filterBar(room, -5).fill, 0);
  assert.deepEqual(filterBar(room, null), { fill: 0, cleanAt: 0.2, finalAt: 0.4, tone: null });
  const now = new Date(2026, 9, 22, 12).getTime();
  const card = filterCard({ room: { ...room, filterChangeDays: 30, filterChangedAt: now, dpAddress: 9 }, sensor: { status: 'online', lastOk: { at: now, pa: 62.4 } }, changes: [], now });
  assert.deepEqual(card.pressure.bar, filterBar(room, 62.4));
});

test('wording: one day is "1 day"; Changed today means the same local calendar day', () => {
  const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
  const card = (changedAt, now, every = 30) => filterCard({ room: { fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: every, filterChangedAt: changedAt, dpAddress: null }, sensor: null, changes: [], now });
  assert.equal(card(at(22, 0, 30), at(22, 23, 30)).age, 'Changed today', '23 h, the same day');
  assert.equal(card(at(21, 23), at(22, 1)).age, '1 day in use', '2 h, but yesterday');
  assert.equal(card(at(20, 12), at(22, 9)).age, '2 days in use');
  assert.match(card(at(22, 8), at(22, 9), 1).due, /^Change by \d+ \w+ \(every 1 day\)$/);
  assert.match(card(at(22, 8), at(22, 9), 2).due, /\(every 2 days\)$/);
});

test('the changes list is asked again when the change time moved or the last load failed; a failed load says so', () => {
  assert.equal(changesStale({ seenChangedAt: 100, failed: false }, { filterChangedAt: 100 }), false);
  assert.equal(changesStale({ seenChangedAt: 100, failed: false }, { filterChangedAt: 200 }), true, 'a change made elsewhere');
  assert.equal(changesStale({ seenChangedAt: 100, failed: true }, { filterChangedAt: 100 }), true);
  assert.equal(changesStale({ seenChangedAt: undefined, failed: false }, { filterChangedAt: 100 }), true, 'never loaded');
  const now = new Date(2026, 9, 22, 12).getTime();
  const room = { fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30, filterChangedAt: now, dpAddress: null };
  assert.equal(filterCard({ room, sensor: null, changes: [], now, changesFailed: true }).changesError, "Couldn't load the filter changes");
  assert.equal(filterCard({ room, sensor: null, changes: [], now }).changesError, null);
});
