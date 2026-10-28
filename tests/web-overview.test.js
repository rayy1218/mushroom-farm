// Pure helpers of the Overview page and the nav badge (web/overview-math.js) and the new default route.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  farmStatus, sortRooms, phoneAlarms,
  roomCard, sparkPath, tiles, badgeCount, withTitlePrefix, sensorText, exchangeText, alarmLevelRank, sortAlarms, alarmTimeText, SPARKS,
  roomReadings,
} from '../web/overview-math.js';
import { parseRoute, isCanonical } from '../web/route.js';

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();

test('a sparkline: path in a w x h box, band shaded, last point; fewer than 2 points gives null', () => {
  assert.equal(sparkPath([], 100, 30, null), null);
  assert.equal(sparkPath([{ at: 1, v: 5 }], 100, 30, null), null);
  const s = sparkPath([{ at: 0, v: 10 }, { at: 10, v: 20 }, { at: 20, v: 10 }], 100, 30, { low: 12, high: 18 });
  assert.match(s.d, /^M3 27 L50 3 L97 27$/);
  assert.deepEqual(s.last, { x: 97, y: 27 });
  assert.ok(s.band.y > 3 && s.band.y + s.band.h < 27 && s.band.h > 0);
  assert.equal(s.min, 10);
  assert.equal(s.max, 20);
});

test('a sparkline over a fixed window: x follows the window, a gap of more than gapMs breaks the line', () => {
  const win = { from: 0, to: 100, gapMs: 30 };
  const s = sparkPath([{ at: 50, v: 10 }, { at: 70, v: 20 }, { at: 100, v: 10 }], 100, 30, null, win);
  assert.match(s.d, /^M50 27 L68.8 3 L97 27$/); // x 3 + at/100 * 94, not stretched to the first point
  const g = sparkPath([{ at: 10, v: 10 }, { at: 20, v: 20 }, { at: 80, v: 10 }, { at: 90, v: 12 }], 100, 30, null, win);
  assert.equal(g.d.match(/M/g).length, 2);
  assert.equal(g.d.match(/L/g).length, 2);
});

test('a flat line is drawn in the middle; a band outside the data stretches the scale', () => {
  const flat = sparkPath([{ at: 0, v: 5 }, { at: 1, v: 5 }], 100, 30, null);
  assert.match(flat.d, /^M3 15 L97 15$/);
  const s = sparkPath([{ at: 0, v: 50 }, { at: 1, v: 51 }], 100, 30, { low: 10, high: 20 });
  assert.ok(s.band.y + s.band.h <= 30 && s.band.y >= 0);
});

test('points that are not numbers are skipped', () => {
  const s = sparkPath([{ at: 0, v: 1 }, { at: 1, v: NaN }, { at: 2, v: null }, { at: 3, v: 2 }], 100, 30, null);
  assert.match(s.d, /^M3 27 L97 3$/);
});

test('the three sparklines: temperature, humidity, CO2 with their band keys', () => {
  assert.deepEqual(SPARKS.map((s) => [s.key, s.low, s.high]), [['t', 'tLow', 'tHigh'], ['rh', 'rhLow', 'rhHigh'], ['co2', 'co2Low', 'co2High']]);
});

const room = (over = {}) => ({ alarms: { count: 0, level: null }, exchange: false, ...over });

test('tiles: rooms OK, active alarms with the highest level, exchanges running', () => {
  assert.deepEqual(tiles([]), { rooms: 0, roomsOk: 0, alarms: 0, level: null, exchanges: 0 });
  const t = tiles([
    room(),
    room({ alarms: { count: 2, level: 'warning' }, exchange: true }),
    room({ alarms: { count: 1, level: 'critical' }, exchange: true }),
    room(),
  ]);
  assert.deepEqual(t, { rooms: 4, roomsOk: 2, alarms: 3, level: 'critical', exchanges: 2 });
});

test('alarm levels rank critical, serious, warning; the list is critical first then newest', () => {
  assert.ok(alarmLevelRank('critical') > alarmLevelRank('serious') && alarmLevelRank('serious') > alarmLevelRank('warning'));
  const list = [
    { id: 1, level: 'warning', raisedAt: 30 },
    { id: 2, level: 'critical', raisedAt: 10 },
    { id: 3, level: 'serious', raisedAt: 20 },
    { id: 4, level: 'critical', raisedAt: 15 },
  ];
  assert.deepEqual(sortAlarms(list).map((a) => a.id), [4, 2, 1, 3]);
});

test('the nav badge counts alarms that are active and not acknowledged', () => {
  assert.equal(badgeCount([]), 0);
  assert.equal(badgeCount(null), 0);
  assert.equal(badgeCount([
    { clearedAt: null, ackedAt: null },
    { clearedAt: null, ackedAt: 5 },
    { clearedAt: 5, ackedAt: null },
    { clearedAt: null, ackedAt: null },
  ]), 2);
});

test('the page title gets "(2) " in front when there are alarms, and never twice', () => {
  assert.equal(withTitlePrefix('Overview · Mushroom farm', 2), '(2) Overview · Mushroom farm');
  assert.equal(withTitlePrefix('(2) Overview · Mushroom farm', 3), '(3) Overview · Mushroom farm');
  assert.equal(withTitlePrefix('(2) Overview · Mushroom farm', 0), 'Overview · Mushroom farm');
  assert.equal(withTitlePrefix('Rooms · Mushroom farm', 0), 'Rooms · Mushroom farm');
});

test('sensor text: the value, and the status word when the sensor is not online', () => {
  assert.equal(sensorText({ status: 'online', t: 23.46, rh: 88 }, 't', 1, '°C'), '23.5 °C');
  assert.equal(sensorText({ status: 'online', t: 23.4 }, 'rh', 0, '%'), '—');
  assert.equal(sensorText({ status: 'offline', co2: 650 }, 'co2', 0, 'ppm'), '650 ppm · Offline');
  assert.equal(sensorText({ status: 'timeout', co2: null }, 'co2', 0, 'ppm'), '— · Timeout');
  assert.equal(sensorText({ status: 'not-wired' }, 'co2', 0, 'ppm'), 'Not wired');
  assert.equal(sensorText({ status: 'no-data' }, 'co2', 0, 'ppm'), 'No data yet');
  assert.equal(sensorText({ status: 'online', co2: 1301.2 }, 'co2', 0, 'ppm'), '1,301 ppm', 'grouped, as on the room page');
});

test('exchange line', () => {
  assert.equal(exchangeText({ exchange: true, exchangeSince: at(19, 10, 42) }, at(19, 11)), 'Air exchange on since 10:42');
  assert.equal(exchangeText({ exchange: true, exchangeSince: null }, at(19, 11)), 'Air exchange on');
  assert.equal(exchangeText({ exchange: false }, at(19, 11)), 'Air exchange off');
});

test('alarm times are the clock today and the date and clock before today', () => {
  assert.equal(alarmTimeText(at(19, 10, 42), at(19, 12)), '10:42');
  assert.equal(alarmTimeText(at(12, 10, 42), at(19, 12)), '12 Oct 10:42');
});

test('an empty or unknown hash is the Overview, and so is #/rooms (the Rooms list is folded into it)', () => {
  for (const h of ['', '#', '#/', '#/other', '#/rooms/abc', '#/rooms/0', '#/rooms/1/x', undefined]) {
    assert.deepEqual(parseRoute(h), { name: 'overview' }, String(h));
  }
  assert.deepEqual(parseRoute('#/overview'), { name: 'overview' });
  assert.deepEqual(parseRoute('#/overview/'), { name: 'overview' });
  assert.deepEqual(parseRoute('#/rooms'), { name: 'overview' });
  assert.deepEqual(parseRoute('#/rooms/'), { name: 'overview' });
  assert.equal(isCanonical('#/overview'), true);
  assert.equal(isCanonical('#/overview/'), false);
  assert.equal(isCanonical(''), false);
});

test('farmStatus: one line at the top of the Overview; a room with nothing wired is "not set up", never OK', () => {
  const r = (over) => ({ alarms: { count: 0, level: null }, exchange: false, auto: true, trh: { status: 'online' }, co2: { status: 'online' }, ...over });
  const unwired = { auto: false, trh: { status: 'not-wired' }, co2: { status: 'not-wired' } };
  assert.deepEqual(farmStatus([r({}), r({ exchange: true })]), { text: 'All 2 rooms OK', tone: 'good', facts: ['No alarms', '1 air exchange running'] });
  assert.deepEqual(farmStatus([r({ alarms: { count: 2, level: 'serious' } }), r({ auto: false })]),
    { text: '2 of 2 rooms need attention', tone: 'serious', facts: ['2 alarms', '1 room in Manual', 'No air exchange running'] });
  assert.deepEqual(farmStatus([r({ auto: false })]), { text: '1 of 1 room needs attention', tone: 'amber', facts: ['No alarms', '1 room in Manual', 'No air exchange running'] });
  assert.deepEqual(farmStatus([r({}), r(unwired)]), { text: '1 room OK · 1 not set up', tone: 'good', facts: ['No alarms', 'No air exchange running'] });
  assert.deepEqual(farmStatus([r(unwired)]), { text: '1 room not set up', tone: 'none', facts: ['No alarms', 'No air exchange running'] });
  assert.equal(farmStatus([]), null);
});

test('sortRooms: rooms that need someone first (alarms by level, then Manual), then OK, then the ones not set up', () => {
  const r = (name, over) => ({ name, alarms: { count: 0, level: null }, auto: true, trh: { status: 'online' }, co2: { status: 'online' }, ...over });
  const order = sortRooms([
    r('unwired', { trh: { status: 'not-wired' }, co2: { status: 'not-wired' }, auto: false }), r('ok A'), r('manual', { auto: false }),
    r('warning', { alarms: { count: 1, level: 'warning' } }), r('critical', { alarms: { count: 1, level: 'critical' } }), r('ok B'),
  ]).map((x) => x.name);
  assert.deepEqual(order, ['critical', 'warning', 'manual', 'ok A', 'ok B', 'unwired']);
});

test('phoneAlarms: a line on the Overview when alarms cannot reach a phone, none when they can', () => {
  const ok = { telegramTokenSet: true, telegramChatId: '-100123', telegramLevels: ['critical'], telegramLastError: null };
  assert.equal(phoneAlarms(ok), null);
  assert.equal(phoneAlarms(null), null);
  assert.deepEqual(phoneAlarms({ ...ok, telegramChatId: '@MushroomClimateAlertBot' }),
    { text: "Phone alarms can't be delivered: the chat id is the bot's own name", tone: 'serious', href: '#/settings', link: 'Fix on Settings' });
  assert.equal(phoneAlarms({ ...ok, telegramTokenSet: false }).tone, 'amber');
  assert.equal(phoneAlarms({ ...ok, telegramChatId: '' }).link, 'Set them up on Settings');
  assert.equal(phoneAlarms({ ...ok, telegramLastError: 'Forbidden: bot was blocked by the user' }).text, 'Phone alarms are failing: Forbidden: bot was blocked by the user');
  assert.equal(phoneAlarms({ ...ok, telegramLevels: [] }).text, 'Phone alarms are off for every level');
});

test('the Overview chip says what the room page says: near an edge that hurts is amber; CO₂ in the exchange\'s words', () => {
  const now = at(28, 12);
  const base = {
    id: 1, name: 'Room 1', auto: true, exchange: false, alarms: { count: 0, level: null },
    bands: { tLow: 19, tHigh: 21, rhLow: 87, rhHigh: 93, co2Low: 700, co2High: 800 },
    trh: { status: 'online', t: 20.95, rh: 90 }, co2: { status: 'online', co2: 705 },
    spark: { t: [], rh: [], co2: [] },
  };
  const chips = (room) => Object.fromEntries(roomCard(room, now).values.map((v) => [v.key, v.chip]));
  const c = chips(base);
  assert.deepEqual(c.t, { text: 'In band · near the top', tone: 'amber' });
  assert.deepEqual(c.rh, { text: 'In band', tone: 'good' });
  assert.deepEqual(c.co2, { text: 'Exchange off', tone: 'good' });
  assert.deepEqual(chips({ ...base, co2: { status: 'online', co2: 650 } }).co2, { text: 'Below the stop point', tone: 'good' }, 'low CO₂ is good');
  assert.deepEqual(chips({ ...base, exchange: true, co2: { status: 'online', co2: 850 } }).co2, { text: 'Exchange running', tone: 'neutral' });
  assert.deepEqual(chips({ ...base, co2: { status: 'online', co2: 850 } }).co2, { text: 'Over the start point', tone: 'amber' });
  const safe = { ...base, bands: { ...base.bands, co2Safety: 1500 } };
  assert.deepEqual(chips({ ...safe, exchange: true, co2: { status: 'online', co2: 1420 } }).co2, { text: 'Near the safety level', tone: 'amber' });
  assert.deepEqual(chips({ ...safe, exchange: true, co2: { status: 'online', co2: 1600 } }).co2, { text: 'At the safety level', tone: 'critical' });
  const falling = chips({ ...base, trh: { status: 'online', t: 20, rh: 87.4 }, spark: { ...base.spark, rh: [{ at: now - 60 * 60_000, v: 89 }, { at: now - 30 * 60_000, v: 88.2 }] } });
  assert.deepEqual(falling.rh, { text: 'In band · near the bottom and falling', tone: 'amber' });
});

test('the Overview offline: the last readings greyed with their time, not claimed as now', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../web/overview.js', import.meta.url), 'utf8');
  assert.match(page, /const stale = Boolean\(failed\.overview\) && shown;/);
  assert.match(page, /These are the readings from \$\{alarmTimeText\(okAt\)\}; the farm server can't be reached\./);
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-stale\] \.pill, \[data-stale\] \.ov-band, \[data-stale\] \.ov-status-dot \{ filter: grayscale\(1\)/);
  assert.match(css, /\.ov-rooms \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(320px, 1fr\)\);/);
});

test('the readings beside an Overview alarm: from online sensors only, the filter pressure when the server sends it', () => {
  const r = { trh: { status: 'online', t: 24.2, rh: 84 }, co2: { status: 'offline', co2: 900 }, filterPa: 41.2 };
  assert.deepEqual(roomReadings(r), { t: 24.2, rh: 84, co2: null, pa: 41.2 });
  assert.deepEqual(roomReadings({ trh: { status: 'not-wired' }, co2: { status: 'online', co2: 1301 } }), { t: null, rh: null, co2: 1301, pa: null });
  assert.deepEqual(roomReadings(null), { t: null, rh: null, co2: null, pa: null });
});
