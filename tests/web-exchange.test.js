// The "Air exchange" section of the Charts tab (spec 2026-10-26-usage-charts-design.md section 4): exchanges started and the
// minutes the fans ran per local hour or day, from the intake's machine log. Local time: Kuala Lumpur (UTC+8, no daylight
// saving), so the hours and days are the same wherever the tests run.

process.env.TZ = 'Asia/Kuala_Lumpur';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatRun,
  ACTIVITY_MODES, activityRange, exchangeRuns, exchangeActivity, activityTotals, activityTotalsText, formatMinutes, activityTip,
} from '../web/exchange-math.js';

const at = (day, hour, minute = 0) => Date.UTC(2026, 9, day, hour - 8, minute); // local time on a day of October 2026
const MIN = 60_000;
const on = (t) => ({ at: t, on: true, source: 'auto' });
const off = (t) => ({ at: t, on: false, source: 'auto' });

test('the two modes: Hourly the last 24 h (default), Daily the last 30 days', () => {
  assert.deepEqual(ACTIVITY_MODES.map((m) => [m.key, m.label, m.hours]), [['hourly', 'Hourly', 24], ['daily', 'Daily', 720]]);
});

test('the range: the last 24 local hours or 30 local days, the running one included', () => {
  const now = at(20, 10, 25);
  assert.deepEqual(activityRange(now, 'hourly'), { from: at(19, 11), to: now, step: 'hour' });
  assert.deepEqual(activityRange(now, 'daily'), { from: at(20, 0) - 29 * 24 * 60 * MIN, to: now, step: 'day' });
});

test('runs: on to off; a row still on (another source) does not start a new one; one still on runs to now', () => {
  const rows = [on(at(20, 1)), { ...on(at(20, 1, 3)), source: 'manual' }, off(at(20, 1, 10)), off(at(20, 2)), on(at(20, 3))];
  assert.deepEqual(exchangeRuns(rows, at(20, 4)), [{ start: at(20, 1), end: at(20, 1, 10) }, { start: at(20, 3), end: at(20, 4) }]);
  assert.deepEqual(exchangeRuns([], at(20, 4)), []);
  assert.deepEqual(exchangeRuns(null, at(20, 4)), []);
});

test('hourly: a run inside one hour, a run across an edge (its start in its first hour, its minutes in both), still on', () => {
  const from = at(20, 0);
  const to = at(20, 3, 30);
  const rows = [on(at(20, 0, 10)), off(at(20, 0, 20)), on(at(20, 1, 50)), off(at(20, 2, 5)), on(at(20, 3, 20))];
  assert.deepEqual(exchangeActivity(rows, from, to, 'hour'), [
    { at: at(20, 0), end: at(20, 1), starts: 1, minutes: 10 },
    { at: at(20, 1), end: at(20, 2), starts: 1, minutes: 10 },
    { at: at(20, 2), end: at(20, 3), starts: 0, minutes: 5 },
    { at: at(20, 3), end: to, starts: 1, minutes: 10 },
  ]);
});

test('a run on before the range counts its minutes inside it but not its start; no runs: zeros', () => {
  const from = at(20, 0);
  const rows = [on(from - 30 * MIN), off(at(20, 0, 15))]; // the history's first row may be moved to its start, before ours
  assert.deepEqual(exchangeActivity(rows, from, at(20, 1), 'hour'), [{ at: from, end: at(20, 1), starts: 0, minutes: 15 }]);
  assert.deepEqual(exchangeActivity([], from, at(20, 2), 'hour').map((b) => [b.starts, b.minutes]), [[0, 0], [0, 0]]);
});

test('daily: local days, a run across midnight split between them', () => {
  const from = at(18, 0);
  const rows = [on(at(18, 23, 50)), off(at(19, 0, 10)), on(at(20, 8)), off(at(20, 8, 1))];
  const days = exchangeActivity(rows, from, at(20, 12), 'day');
  assert.deepEqual(days.map((d) => d.at), [at(18, 0), at(19, 0), at(20, 0)]);
  assert.deepEqual(days.map((d) => [d.starts, d.minutes]), [[1, 10], [0, 10], [1, 1]]);
});

test('the totals: exchanges started in the range, the minutes in all and the longest run', () => {
  const from = at(20, 0);
  const rows = [on(from - 5 * MIN), off(at(20, 0, 2)), on(at(20, 1)), off(at(20, 1, 10)), on(at(20, 5)), off(at(20, 6, 35))];
  const t = activityTotals(rows, from, at(20, 12));
  assert.deepEqual(t, { exchanges: 2, minutes: 2 + 10 + 95, longest: 95 });
  assert.equal(activityTotalsText(t, 'hourly'), '24 h: 2 exchanges, 1 h 47 min in all\u00a0· longest 1 h 35 min');
  assert.equal(activityTotalsText({ exchanges: 41, minutes: 155, longest: 10 }, 'hourly'), '24 h: 41 exchanges, 2 h 35 min in all\u00a0· longest 10 min');
  assert.equal(activityTotalsText({ exchanges: 1, minutes: 4, longest: 4 }, 'daily'), '30 days: 1 exchange, 4 min in all\u00a0· longest 4 min');
  assert.equal(activityTotalsText({ exchanges: 0, minutes: 0, longest: 0 }, 'daily'), '30 days: no exchanges');
  // a run under 10 min keeps its seconds (critique 2026-10-29c: "1 h 2 min in all · longest 2 min" beside an average of 2.1 min)
  assert.equal(activityTotalsText({ exchanges: 29, minutes: 62, longest: 2 + 10 / 60 }, 'hourly'), '24 h: 29 exchanges, 1 h 2 min in all\u00a0· longest 2 min 10 s');
});

test('a run in words: seconds under 10 min', () => {
  assert.deepEqual([0, 0.5, 2, 2 + 10 / 60, 9.99, 10, 10.4, 95].map(formatRun), ['0 s', '30 s', '2 min', '2 min 10 s', '9 min 59 s', '10 min', '10 min', '1 h 35 min']);
});

test('minutes in words', () => {
  assert.deepEqual([0, 0.4, 5, 59.6, 60, 155, 1500].map(formatMinutes), ['0 min', '0 min', '5 min', '1 h', '1 h', '2 h 35 min', '25 h']);
});

test('the tooltips: the hour or the day, and the number', () => {
  const hour = { at: at(20, 14), end: at(20, 15), starts: 3, minutes: 12 };
  const now = at(20, 16);
  assert.equal(activityTip(hour, 'hourly', 'starts', now), '14:00  3 exchanges');
  assert.equal(activityTip(hour, 'hourly', 'minutes', now), '14:00  12 min');
  assert.equal(activityTip({ ...hour, at: at(19, 14) }, 'hourly', 'starts', now), '19 Oct 14:00  3 exchanges');
  assert.equal(activityTip({ at: at(12, 0), end: at(13, 0), starts: 1, minutes: 75 }, 'daily', 'starts', now), '12 Oct  1 exchange');
  assert.equal(activityTip({ at: at(12, 0), end: at(13, 0), starts: 1, minutes: 75 }, 'daily', 'minutes', now), '12 Oct  1 h 15 min');
});

test('the page: the section after Electricity and water, before the machine timeline, shown with a relay module', () => {
  const page = readFileSync(new URL('../web/room-detail.js', import.meta.url), 'utf8');
  const template = page.slice(page.indexOf('const TEMPLATE'), page.indexOf('`;', page.indexOf('const TEMPLATE')));
  const usageAt = template.indexOf('data-usage-charts'), exchange = template.indexOf('data-exchange'), timeline = template.indexOf('data-timeline');
  assert.ok(usageAt > 0 && exchange > usageAt && timeline > exchange);
  assert.match(page, /import \{ createExchangeSection \} from '\.\/exchange-section\.js';/);
  assert.match(page, /exchangeSection\.update\(room\)/);
  assert.match(page, /exchangeSection\?\.destroy\(\)/);
  const section = readFileSync(new URL('../web/exchange-section.js', import.meta.url), 'utf8');
  assert.match(section, /room\?\.relayAddress != null/, 'hidden without a relay module');
  assert.match(section, /'Air exchange'/);
  assert.match(section, /'Exchanges started'/);
  assert.match(section, /'Minutes the fans ran'/);
  assert.match(section, /\/history\?hours=\$\{mode\.hours\}/, 'its own history request');
  assert.match(section, /machines\?\.intake/);
});
