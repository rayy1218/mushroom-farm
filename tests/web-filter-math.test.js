// The room dialog's Filter section and the room page's Filter card (spec 2026-10-22-filter-design.md 3 and 5): texts, checks
// like the server's, and the card's words.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILTER } from '../server/rooms.js';
import { FILTER_SETTINGS, filterTexts, parseFilter, dpAddressOf, filterCard } from '../web/filter-math.js';

const DAY = 86_400_000;
const now = new Date(2026, 9, 22, 12, 0).getTime();

test('the settings are those of the server (server/rooms.js FILTER)', () => {
  assert.deepEqual(FILTER_SETTINGS.map((f) => [f.name, f.def, f.min, f.max]), FILTER.map((f) => [f.field, f.default, f.min, f.max]));
});

test('texts: the room\'s, else the defaults', () => {
  assert.deepEqual(filterTexts(null), { fanMaxPa: '200', filterCleanPa: '40', filterFinalPa: '150', filterChangeDays: '30' });
  assert.deepEqual(filterTexts({ fanMaxPa: 300, filterCleanPa: 25, filterFinalPa: 120, filterChangeDays: 0 }),
    { fanMaxPa: '300', filterCleanPa: '25', filterFinalPa: '120', filterChangeDays: '0' });
});

test('parse: whole numbers in range, the fan and the change pressure above the clean drop, as the server says it', () => {
  assert.deepEqual(parseFilter(filterTexts(null)), { values: { fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 150, filterChangeDays: 30 } });
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

const room = { fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 150, filterChangeDays: 30, filterChangedAt: now - 12.4 * DAY, dpAddress: 9 };
const sensor = (over = {}) => ({ kind: 'dp', address: 9, status: 'online', failuresInRow: 0, lastOk: { at: now - 5000, pa: 97.2 }, readings: [], ...over });

test('the card: pressure on the bar between clean and the change pressure, days in use and when it is due', () => {
  const c = filterCard({ room, sensor: sensor(), changes: [], now });
  assert.equal(c.pressure.text, '97.2 Pa');
  assert.equal(c.pressure.status, 'Online');
  assert.deepEqual([c.pressure.min, c.pressure.clean, c.pressure.final, c.pressure.max], [0, 40, 150, 200]);
  assert.equal(c.pressure.value, 97.2);
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
