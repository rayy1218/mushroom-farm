// Pure helpers of the Overview page and the nav badge (web/overview-math.js) and the new default route.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  farmStatus, phoneAlarms, readingStates, settle, settleRooms, HOLD_MS, WATCH_HOLD_MS,
  roomCard, sparkPath, tiles, badgeCount, withTitlePrefix, sensorText, exchangeText, alarmLevelRank, sortAlarms, alarmTimeText, SPARKS,
  roomReadings, outOfBand, nearEdges,
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

test('the Overview chip says what the room page says: near an edge with its machine not acting is amber; CO₂ in the exchange\'s words', () => {
  const now = at(28, 12);
  const base = {
    id: 1, name: 'Room 1', auto: true, exchange: false, alarms: { count: 0, level: null },
    bands: { tLow: 19, tHigh: 21, rhLow: 87, rhHigh: 93, co2Low: 700, co2High: 800 },
    trh: { status: 'online', t: 20.95, rh: 90 }, co2: { status: 'online', co2: 705 },
    spark: { t: [], rh: [], co2: [] }, machines: { humidifier: true, dehumidifier: null, cooling: false },
  };
  const chips = (room) => Object.fromEntries(roomCard(room, now).values.map((v) => [v.key, v.chip]));
  const c = chips(base);
  assert.deepEqual(c.t, { text: 'Near high', tone: 'amber' }, 'the aircon not cooling');
  assert.deepEqual(chips({ ...base, machines: { ...base.machines, cooling: true } }).t, { text: 'In band', tone: 'good' }, 'the aircon on it: calm');
  assert.deepEqual(chips({ ...base, machines: undefined }).t, { text: 'In band', tone: 'good' }, 'an older server: only after 15 min');
  assert.deepEqual(c.rh, { text: 'In band', tone: 'good' });
  assert.deepEqual(c.co2, { text: 'Exchange off · starts at 800 ppm', tone: 'good' });
  assert.deepEqual(chips({ ...base, co2: { status: 'online', co2: 650 } }).co2, { text: 'Below the stop point', tone: 'good' }, 'low CO₂ is good');
  assert.deepEqual(chips({ ...base, exchange: true, co2: { status: 'online', co2: 850 } }).co2, { text: 'Exchange running', tone: 'neutral' });
  assert.deepEqual(chips({ ...base, co2: { status: 'online', co2: 850 } }).co2, { text: 'Over the start point', tone: 'amber' });
  const safe = { ...base, bands: { ...base.bands, co2Safety: 1500 } };
  assert.deepEqual(chips({ ...safe, exchange: true, co2: { status: 'online', co2: 1420 } }).co2, { text: 'Near the safety level', tone: 'amber' });
  assert.deepEqual(chips({ ...safe, exchange: true, co2: { status: 'online', co2: 1600 } }).co2, { text: 'At the safety level', tone: 'critical' });
  const low = { ...base, trh: { status: 'online', t: 20, rh: 87.4 }, spark: { ...base.spark, rh: [{ at: now - 60 * 60_000, v: 89 }, { at: now - 30 * 60_000, v: 88.2 }] } };
  assert.deepEqual(chips(low).rh, { text: 'In band', tone: 'good' }, 'falling, but the humidifier is on');
  assert.deepEqual(chips({ ...low, machines: { ...base.machines, humidifier: false } }).rh, { text: 'Near low · falling', tone: 'amber' });
  const stayed = { ...low, spark: { ...base.spark, rh: [{ at: now - 45 * 60_000, v: 87.5 }, { at: now - 15 * 60_000, v: 87.6 }] } };
  assert.deepEqual(chips(stayed).rh, { text: 'Near low', tone: 'amber' }, 'near the bottom for over 15 min, the humidifier on');
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

test('the Overview on a phone: the whole card opens the room, the 30 days keep a label, the alarm\'s room link is a thumb\'s size', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../web/overview.js', import.meta.url), 'utf8');
  assert.match(page, /node\('a', 'ov-room-link', c\.name\)/);
  assert.match(page, /last30\.append\(node\('span', 'us-short', '30 d '\), l\.last30\)/);
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.ov-room-link::after \{ content: ""; position: absolute; inset: 0;/);
  assert.match(css, /\.ov-room a:not\(\.ov-room-link\), \.ov-room button \{ position: relative; z-index: 1; \}/);
  assert.match(css, /@media \(max-width: 480px\) \{[^}]*\}[^@]*\.us-short \{ display: inline; \}/);
  assert.match(css, /\.ov-alarm-room \{ grid-column: 2 \/ -1; justify-self: start; display: inline-flex; align-items: center; min-height: 44px; \}/);
  assert.match(css, /\.ov-alarm-time \{ grid-column: 1 \/ 3; grid-row: 3; white-space: normal; \}/, 'the times under the text: the room\'s name is never squeezed');
  assert.match(css, /\.ov-alarm \{ display: grid; grid-template-columns: auto minmax\(0, 20ch\)/, 'room for "Container / Gamma"');
});

test('One Format: the Simulations list head in sentence case like the other tables, no capitals or tracking', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const rule = /\.sim-list-head \{([^}]*)\}/.exec(css)[1];
  assert.doesNotMatch(rule, /text-transform|letter-spacing/);
  assert.doesNotMatch(css, /text-transform: uppercase/, 'no capitals anywhere');
});

test('a reading out of band is not OK: the pill says Out of band, the status counts it and names it (critique 2026-10-28)', () => {
  const bands = { tLow: 19, tHigh: 21, rhLow: 87, rhHigh: 93, co2Low: 700, co2High: 900, co2Safety: 1500 };
  const r = (name, over) => ({
    id: 1, name, alarms: { count: 0, level: null }, exchange: false, auto: true, bands,
    trh: { status: 'online', t: 20, rh: 90 }, co2: { status: 'online', co2: 800 }, spark: { t: [], rh: [], co2: [] }, ...over,
  });
  const dry = r('Container Alpha', { trh: { status: 'online', t: 20, rh: 84.2 } });
  assert.deepEqual(outOfBand(dry), [{ key: 'rh', text: 'Humidity low' }]);
  assert.deepEqual(outOfBand(r('A', { trh: { status: 'online', t: 22, rh: 95 } })).map((x) => x.text), ['Temperature high', 'Humidity high']);
  assert.deepEqual(outOfBand(r('A', { trh: { status: 'offline', t: 30, rh: 50 } })), [], 'an offline sensor\'s last value is not now');
  assert.deepEqual(outOfBand(r('A', { co2: { status: 'online', co2: 950 } })), [{ key: 'co2', text: 'CO₂ high' }], 'over the start point, the exchange off');
  assert.deepEqual(outOfBand(r('A', { exchange: true, co2: { status: 'online', co2: 950 } })), [], 'over the start point with the exchange running');
  assert.deepEqual(outOfBand(r('A', { exchange: true, co2: { status: 'online', co2: 1600 } })), [{ key: 'co2', text: 'CO₂ high' }], 'at the safety level');
  assert.deepEqual(roomCard(dry, at(28, 12)).state, { text: 'Out of band', tone: 'amber' });
  assert.deepEqual(roomCard({ ...dry, alarms: { count: 1, level: 'warning' } }, at(28, 12)).state, { text: '1 alarm', tone: 'warning' }, 'alarms first');
  assert.deepEqual(roomCard({ ...dry, auto: false }, at(28, 12)).state, { text: 'Out of band', tone: 'amber' }, 'before Manual');
  assert.deepEqual(farmStatus([dry, r('Container Beta')]),
    { text: '1 of 2 rooms needs attention', tone: 'amber', facts: ['No alarms', 'Humidity low in Container Alpha', 'No air exchange running'] });
  const hot = r('Container Beta', { trh: { status: 'online', t: 22, rh: 90 } });
  assert.deepEqual(farmStatus([dry, hot]).facts, ['No alarms', '2 readings out of band', 'No air exchange running']);
  assert.deepEqual(farmStatus([r('A'), r('B')]).text, 'All 2 rooms OK');
});

// Critique 2026-10-28: a room with minutes of data drew a hook at the right edge of a flat 24 h band.
test('roomCard: traces of less than 2 hours are scaled to the data and say since when', () => {
  const now = at(28, 17, 30);
  const room = {
    id: 1, name: 'A', auto: true, exchange: false, alarms: { count: 0, level: null },
    bands: { tLow: 19, tHigh: 21, rhLow: 87, rhHigh: 93, co2Low: 700, co2High: 900 },
    trh: { status: 'online', t: 20, rh: 90 }, co2: { status: 'online', co2: 800 },
    spark: { t: [{ at: at(28, 17, 8), v: 20.2 }], rh: [{ at: at(28, 17, 8), v: 89 }], co2: [{ at: at(28, 17, 10), v: 790 }] },
  };
  const c = roomCard(room, now);
  assert.equal(c.traces, 'since 17:08');
  assert.match(c.values[0].spark.d, /^M3 /, 'the first point at the left edge, not at the right of a 24 h window');
  const day = roomCard({ ...room, spark: { ...room.spark, t: [{ at: at(28, 9), v: 20 }, ...room.spark.t] } }, now);
  assert.equal(day.traces, 'last 24 hours');
  assert.doesNotMatch(day.values[0].spark.d, /^M3 /);
});

test('critique 2026-10-28 layout (the farm cards side by side, 2026-10-29 as tall as each other), the energy table\'s rooms a thumb\'s size, the name fits a phone', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.ov-farm \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(300px, 1fr\)\); gap: 16px;/);
  assert.match(css, /\.us-room a \{ display: inline-flex; align-items: center; justify-self: start; min-height: 44px; \}/);
  assert.match(css, /\.brand-text strong \{ white-space: normal; overflow: visible; line-height: 1\.1; \}/);
  assert.match(css, /@container \(max-width: 100px\) \{ \.brand-top \.brand-text \{ display: none; \} \}/);
});

// Critique 2026-10-29 (owner): a room in band with an amber near-edge reading is not "OK" beside that amber, and not a room
// that needs attention either: its pill says Watch, the status line names it.
test('a room in band with a reading near an edge, its machine not acting: Watch, named in the status', () => {
  const now = at(29, 12);
  const bands = { tLow: 19, tHigh: 21, rhLow: 87, rhHigh: 93, co2Low: 700, co2High: 900 };
  const r = (name, over) => ({
    id: 1, name, alarms: { count: 0, level: null }, exchange: false, auto: true, bands,
    trh: { status: 'online', t: 20, rh: 90 }, co2: { status: 'online', co2: 800 }, spark: { t: [], rh: [], co2: [] },
    machines: { humidifier: true, dehumidifier: false, cooling: true }, ...over,
  });
  const wet = r('Room 1', { trh: { status: 'online', t: 20, rh: 92.5 } }); // near high, the humidifier on past its off-point (92 % RH)
  const ok = r('Room 2');
  assert.deepEqual(nearEdges(wet), [{ key: 'rh', text: 'Humidity near high' }]);
  assert.deepEqual(nearEdges(ok), []);
  assert.deepEqual(nearEdges(r('A', { trh: { status: 'online', t: 20, rh: 92.5 }, machines: { humidifier: false, dehumidifier: true, cooling: true } })), [],
    'the dehumidifier on it: calm');
  assert.deepEqual(nearEdges(r('A', { trh: { status: 'online', t: 20, rh: 92.5 }, machines: { humidifier: false, dehumidifier: false, cooling: true } })), [],
    'under the dehumidifier\'s on-point (93 % RH) with the humidifier off: acting as told (critique 2026-10-29)');
  assert.deepEqual(nearEdges(r('A', { trh: { status: 'online', t: 19.1, rh: 87.2 }, machines: { humidifier: false, dehumidifier: null, cooling: true } })),
    [{ key: 't', text: 'Temperature near low' }, { key: 'rh', text: 'Humidity near low' }]);
  assert.deepEqual(nearEdges(r('A', { trh: { status: 'offline', t: 20, rh: 92.5 } })), [], 'an offline sensor\'s last value is not now');
  assert.deepEqual(roomCard(wet, now).state, { text: 'Watch', tone: 'amber' });
  assert.deepEqual(roomCard({ ...wet, auto: false }, now).state, { text: 'Manual', tone: 'amber' }, 'Manual before Watch');
  assert.deepEqual(roomCard({ ...wet, alarms: { count: 1, level: 'warning' } }, now).state, { text: '1 alarm', tone: 'warning' });
  assert.deepEqual(roomCard(ok, now).state, { text: 'OK', tone: 'good' });
  assert.deepEqual(farmStatus([wet, ok, r('Room 3'), r('Room 4')]),
    { text: '3 rooms OK · Room 1 humidity near high', tone: 'amber', facts: ['No alarms', 'No air exchange running'] });
  assert.equal(farmStatus([wet]).text, 'Room 1 humidity near high');
  const hot = r('Room 3', { trh: { status: 'online', t: 20.9, rh: 90 }, machines: { humidifier: true, dehumidifier: null, cooling: false } });
  assert.equal(farmStatus([wet, ok, hot]).text, '1 room OK · 2 rooms to watch');
  assert.equal(farmStatus([wet, hot]).text, '2 rooms to watch');
  const both = r('Room 5', { trh: { status: 'online', t: 20.9, rh: 92.5 }, machines: { humidifier: true, dehumidifier: false, cooling: false } });
  assert.equal(farmStatus([both, ok]).text, '1 room OK · Room 5 temperature near high, humidity near high');
  const unwired = r('Room 9', { auto: false, trh: { status: 'not-wired' }, co2: { status: 'not-wired' } });
  assert.equal(farmStatus([wet, ok, unwired]).text, '1 room OK · Room 1 humidity near high · 1 not set up');
  // with a room that needs attention, the room to watch is one of the facts
  assert.deepEqual(farmStatus([wet, r('Room 2', { auto: false })]),
    { text: '1 of 2 rooms needs attention', tone: 'amber', facts: ['No alarms', '1 room in Manual', 'Room 1 humidity near high', 'No air exchange running'] });
  assert.deepEqual(farmStatus([wet, hot, r('Room 2', { auto: false })]).facts, ['No alarms', '1 room in Manual', '2 rooms to watch', 'No air exchange running']);
});

// Critique 2026-10-29: a trace drew a line, then nothing, then a lone dot at the right edge; the gap is now a quiet dashed
// join between the readings either side, so the latest point is never alone.
test('a sparkline gap: a dashed join from the reading before it to the one after it, the latest point joined too', () => {
  const win = { from: 0, to: 100, gapMs: 30 };
  const s = sparkPath([{ at: 10, v: 10 }, { at: 20, v: 20 }, { at: 90, v: 10 }], 100, 30, null, win);
  assert.equal(s.d.match(/M/g).length, 2, 'the line still breaks: no readings are drawn where there were none');
  assert.deepEqual(s.joins, [{ x1: 21.8, y1: 3, x2: 87.6, y2: 27 }]);
  assert.deepEqual(sparkPath([{ at: 10, v: 10 }, { at: 20, v: 20 }], 100, 30, null, win).joins, []);
  assert.deepEqual(sparkPath([{ at: 0, v: 10 }, { at: 1, v: 20 }], 100, 30, null).joins, [], 'without a window, no gaps');
});

test('critique 2026-10-29 layout: a reading\'s status on the label line across the row, the gap joined dashed, the Outdoor traces fill the card', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../web/overview.js', import.meta.url), 'utf8');
  assert.match(page, /for \(const j of s\.joins\) el\.append\(svg\('line', \{ x1: j\.x1, y1: j\.y1, x2: j\.x2, y2: j\.y2, class: 'ov-spark-gap'/);
  assert.match(page, /with gaps in the readings/);
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const block = css.slice(css.indexOf('/* critique 2026-10-29: status and Overview */'));
  assert.ok(block.length > 50, 'the block at the end of the file');
  assert.match(css, /\.ov-value \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.ov-value-text \{ display: contents; \}/);
  assert.match(css, /\.ov-value-label \{ grid-column: 1 \/ -1; display: flex; flex-wrap: wrap;/, 'a status that does not fit goes whole under its name');
  assert.match(css, /\.ov-band \{ white-space: nowrap;/);
  assert.match(block, /\.ov-value > \.ov-spark, \.ov-value > \.ov-spark-none \{ grid-column: 2; grid-row: 2; \}/);
  assert.match(block, /\.ov-spark-gap \{[^}]*stroke-dasharray: 2 3;/);
  assert.match(block, /\.ov-outdoor \.ov-spark \{[^}]*width: 100%;/);
});

// Critique 2026-10-29 (owner): the Overview flapped and reordered as the machines cycled. The cards keep the server's order (by
// name); a reading's Watch or Out of band counts only once it has held: out of band for the alarm's own hold for that reading
// (server/alarms.js), near an edge for 2 min; until then the room stays as it was.
test('the out-of-band holds are the alarms\' own delays', async () => {
  const { PROCESS_DELAYS } = await import('../server/alarms.js');
  for (const key of ['tHigh', 'tLow', 'rhHigh', 'rhLow', 'co2High', 'co2Safety']) assert.equal(HOLD_MS[key], PROCESS_DELAYS[key], key);
  assert.equal(WATCH_HOLD_MS, 2 * 60_000);
  assert.equal(HOLD_MS.rhNearHigh, WATCH_HOLD_MS);
  assert.equal(HOLD_MS.calm, WATCH_HOLD_MS);
});

test('readingStates: each reading\'s state now, by the same rules as the pill', () => {
  const bands = { tLow: 19, tHigh: 21, rhLow: 87, rhHigh: 93, co2Low: 700, co2High: 900, co2Safety: 1500 };
  const r = (over) => ({ bands, exchange: false, trh: { status: 'online', t: 20, rh: 90 }, co2: { status: 'online', co2: 800 }, spark: {},
    machines: { humidifier: false, dehumidifier: false, cooling: true }, ...over });
  assert.deepEqual(readingStates(r()), { t: 'calm', rh: 'calm', co2: 'calm' });
  assert.deepEqual(readingStates(r({ trh: { status: 'online', t: 21.5, rh: 86 } })), { t: 'tHigh', rh: 'rhLow', co2: 'calm' });
  assert.deepEqual(readingStates(r({ trh: { status: 'online', t: 20, rh: 87.5 } })).rh, 'rhNearLow', 'under the on-point (88 % RH), the humidifier off');
  assert.deepEqual(readingStates(r({ co2: { status: 'online', co2: 950 } })).co2, 'co2High');
  assert.deepEqual(readingStates(r({ co2: { status: 'online', co2: 1500 } })).co2, 'co2Safety');
  assert.deepEqual(readingStates(r({ trh: { status: 'offline', t: 30, rh: 50 } })), { t: 'calm', rh: 'calm', co2: 'calm' }, 'no reading now: nothing to hold');
});

test('settle: the first state is shown at once; a new one once it has held for its time, the old one until then', () => {
  const t0 = 1_000_000;
  const first = settle(null, 'rhNearHigh', t0);
  assert.deepEqual(first, { state: 'rhNearHigh', since: t0, shown: 'rhNearHigh' }, 'nothing known before: what it is now');
  const calm = settle(first, 'calm', t0 + 10_000);
  assert.deepEqual(calm, { state: 'calm', since: t0 + 10_000, shown: 'rhNearHigh' }, 'back in band 10 s: still Watch');
  const near = settle(settle(calm, 'calm', t0 + 60_000), 'rhNearHigh', t0 + 70_000);
  assert.deepEqual(near, { state: 'rhNearHigh', since: t0 + 70_000, shown: 'rhNearHigh' }, 'flapping keeps what was shown');
  const quiet = settle(settle({ state: 'calm', since: 0, shown: 'calm' }, 'rhNearHigh', t0), 'rhNearHigh', t0 + WATCH_HOLD_MS - 1);
  assert.equal(quiet.shown, 'calm', 'near the edge for less than 2 min');
  assert.equal(settle(quiet, 'rhNearHigh', t0 + WATCH_HOLD_MS).shown, 'rhNearHigh', '2 min: Watch');
  const wet = settle({ state: 'calm', since: 0, shown: 'calm' }, 'rhHigh', t0);
  assert.equal(settle(wet, 'rhHigh', t0 + 14 * 60_000).shown, 'calm', 'humidity over the band 14 min: the alarm waits 15');
  assert.equal(settle(wet, 'rhHigh', t0 + 15 * 60_000).shown, 'rhHigh');
});

test('settleRooms: the pill and the status line follow the held states; a short spell over the band changes nothing', () => {
  const t0 = at(29, 12);
  const bands = { tLow: 19, tHigh: 21, rhLow: 87, rhHigh: 93, co2Low: 700, co2High: 900, co2Safety: 1500 };
  const room = (rh, over = {}) => ({ id: 1, name: 'Room 1', alarms: { count: 0, level: null }, auto: true, exchange: false, bands,
    trh: { status: 'online', t: 20, rh }, co2: { status: 'online', co2: 800 }, spark: { t: [], rh: [], co2: [] },
    machines: { humidifier: false, dehumidifier: false, cooling: true }, ...over });
  let memory = new Map();
  const step = (r, now) => { const out = settleRooms(memory, [r], now); memory = out.memory; return out.rooms[0]; };
  assert.deepEqual(roomCard(step(room(90), t0), t0).state, { text: 'OK', tone: 'good' });
  const over = step(room(93.4), t0 + 60_000);
  assert.deepEqual(roomCard(over, t0 + 60_000).state, { text: 'OK', tone: 'good' }, '1 min over the band: still OK');
  assert.deepEqual(roomCard(over, t0 + 60_000).values[1].chip, { text: 'Above band', tone: 'neutral' }, 'the words say it, without amber yet');
  assert.equal(farmStatus([over]).text, 'All 1 room OK');
  const near = step(room(87.5), t0 + 2 * 60_000);
  assert.deepEqual(roomCard(near, t0).state, { text: 'OK', tone: 'good' }, 'near low just now');
  assert.deepEqual(roomCard(near, t0).values[1].chip, { text: 'In band', tone: 'good' });
  const held = step(room(87.5), t0 + 4 * 60_000);
  assert.deepEqual(roomCard(held, t0).state, { text: 'Watch', tone: 'amber' }, 'near low 2 min with the humidifier off');
  assert.deepEqual(roomCard(held, t0).values[1].chip, { text: 'Near low', tone: 'amber' });
  assert.equal(farmStatus([held]).text, 'Room 1 humidity near low');
  const dry = step(room(86), t0 + 5 * 60_000);
  assert.deepEqual(roomCard(dry, t0).state, { text: 'Watch', tone: 'amber' }, 'under the band now, for less than the alarm\'s 5 min: still Watch');
  assert.deepEqual(nearEdges(dry), [{ key: 'rh', text: 'Humidity near low' }]);
  assert.deepEqual(outOfBand(dry), []);
  const out = step(room(86), t0 + 10 * 60_000);
  assert.deepEqual(roomCard(out, t0).state, { text: 'Out of band', tone: 'amber' });
  assert.equal(farmStatus([out]).facts[1], 'Humidity low in Room 1');
  assert.equal(memory.size, 1);
  assert.equal(settleRooms(memory, [], t0).memory.size, 0, 'a room gone is forgotten');
});

test('the Overview keeps the server\'s order (by name), remembers the held states per room and announces only a changed status', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../web/overview.js', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /sortRooms/);
  assert.match(page, /settleRooms\(held, list, now\)/);
  assert.match(page, /<p class="ov-status-text" data-status-text aria-live="polite"><span class="ov-status-dot"><\/span><span data-status-words><\/span><\/p>/);
  assert.doesNotMatch(page, /data-status aria-live/, 'not the whole card, rebuilt on every refresh');
  assert.match(page, /held\.clear\(\);/, 'forgotten on leaving the page');
  assert.match(page, /if \(said !== st\.text\)/, 'the live line is written only when its words change');
});
