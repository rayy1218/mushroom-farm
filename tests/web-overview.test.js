// Pure helpers of the Overview page and the nav badge (web/overview-math.js) and the new default route.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sparkPath, tiles, badgeCount, withTitlePrefix, sensorText, exchangeText, alarmLevelRank, sortAlarms, alarmTimeText, SPARKS,
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

test('an empty or unknown hash is the Overview; #/rooms stays the Rooms list', () => {
  for (const h of ['', '#', '#/', '#/other', '#/rooms/abc', '#/rooms/0', '#/rooms/1/x', undefined]) {
    assert.deepEqual(parseRoute(h), { name: 'overview' }, String(h));
  }
  assert.deepEqual(parseRoute('#/overview'), { name: 'overview' });
  assert.deepEqual(parseRoute('#/overview/'), { name: 'overview' });
  assert.deepEqual(parseRoute('#/rooms'), { name: 'list' });
  assert.deepEqual(parseRoute('#/rooms/'), { name: 'list' });
  assert.equal(isCanonical('#/overview'), true);
  assert.equal(isCanonical('#/overview/'), false);
  assert.equal(isCanonical(''), false);
});
