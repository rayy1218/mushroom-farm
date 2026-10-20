// Pure helpers of the outdoor sensor on the pages (web/outdoor-math.js, clipSeries, fromRoom with an outdoor reading).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNightHour, dewPoint, outdoorForDrawing, outdoorPoints, outdoorLine, outdoorCard } from '../web/outdoor-math.js';
import { clipSeries } from '../web/chart-math.js';
import { fromRoom, view } from '../web/mimic-math.js';

const at = (h, m = 0) => new Date(2026, 9, 20, h, m).getTime();

test('night is 19:00 to 07:00 local', () => {
  assert.equal(isNightHour(new Date(at(19))), true);
  assert.equal(isNightHour(new Date(at(23, 59))), true);
  assert.equal(isNightHour(new Date(at(6, 59))), true);
  assert.equal(isNightHour(new Date(at(7))), false);
  assert.equal(isNightHour(new Date(at(18, 59))), false);
});

test('dew point: 30 degC at 60 % is about 21.4; missing input is null', () => {
  assert.ok(Math.abs(dewPoint(30, 60) - 21.4) < 0.2);
  assert.ok(Math.abs(dewPoint(20, 100) - 20) < 1e-9);
  assert.equal(dewPoint(null, 50), null);
  assert.equal(dewPoint(20, 0), null);
});

test('the drawing: no sensor, no answer or no address is "No outdoor sensor"; a sensor gives T, RH and day or night', () => {
  assert.deepEqual(outdoorForDrawing(null, at(12)), { out: null, night: false });
  assert.deepEqual(outdoorForDrawing({ address: null, status: 'not-wired', last: null }, at(12)), { out: null, night: false });
  assert.deepEqual(outdoorForDrawing({ address: 9, last: { at: 1, t: 31.2, rh: 64, dew: 23 } }, at(12)), { out: { T: 31.2, RH: 64 }, night: false });
  assert.deepEqual(outdoorForDrawing({ address: 9, last: { t: 27, rh: 80 } }, at(21)), { out: { T: 27, RH: 80 }, night: true });
  assert.deepEqual(outdoorForDrawing({ address: 9, last: null }, at(12)).out, { T: null, RH: null }); // set, no answer yet
});

test('fromRoom carries the outdoor values into the drawing text', () => {
  const none = view(fromRoom({ room: { name: 'A' } }));
  assert.equal(none.outLine, 'No outdoor sensor');
  assert.equal(none.night, false);
  const out = view(fromRoom({ room: { name: 'A' }, outdoor: { address: 9, last: { t: 31.24, rh: 64 } }, now: at(20) }));
  assert.equal(out.hasOut, true);
  assert.equal(out.outLine, '31.2 °C · 64 % RH');
  assert.equal(out.night, true);
});

test('outdoor history points from the room shape (rows under trh) and from one series per field', () => {
  const rows = { bucketS: 60, pollSeconds: 5, trh: [{ at: 1000, t: 30, rh: 60 }, { at: 61000, t: 31, rh: 61 }] };
  assert.deepEqual(outdoorPoints(rows, 't'), [{ at: 1000, value: 30 }, { at: 61000, value: 31 }]);
  assert.deepEqual(outdoorPoints(rows, 'rh').map((p) => p.value), [60, 61]);
  const series = { bucketS: 60, t: [{ at: 1000, v: 30 }], rh: [{ at: 1000, v: 60 }, { at: 61000, v: 62 }] };
  assert.deepEqual(outdoorPoints(series, 't'), [{ at: 1000, value: 30 }]);
  assert.deepEqual(outdoorPoints(series, 'rh').map((p) => p.value), [60, 62]);
});

test('a gap of more than 3 buckets breaks the outdoor line; nothing to draw gives no line', () => {
  const h = { bucketS: 60, trh: [{ at: 0, t: 30 }, { at: 600000, t: 31 }] };
  assert.deepEqual(outdoorPoints(h, 't').map((p) => p.value), [30, null, 31]);
  assert.equal(outdoorLine(null, 't'), null);
  assert.equal(outdoorLine({ trh: [] }, 't'), null);
  assert.equal(outdoorLine({ bucketS: 60, trh: [{ at: 0, t: 30 }] }, 't').label, 'Outdoor');
  assert.deepEqual(outdoorPoints({}, 't'), []);
});

test('clipSeries cuts a line to the window and adds the points on the edges', () => {
  const pts = [{ at: 0, value: 0 }, { at: 100, value: 10 }, { at: 200, value: 20 }];
  assert.deepEqual(clipSeries(pts, 50, 150), [{ at: 50, value: 5 }, { at: 100, value: 10 }, { at: 150, value: 15 }]);
  assert.deepEqual(clipSeries(pts, 0, 200), pts);
  assert.deepEqual(clipSeries(pts, 300, 400), []);
  assert.deepEqual(clipSeries([{ at: 0, value: 1 }, { at: 10, value: null }, { at: 20, value: 2 }], 5, 25).map((p) => p.value), [null, 2]);
  assert.deepEqual(clipSeries(null, 0, 1), []);
});

test('the Overview card: older server or failed read gives no card; no sensor gives the hint', () => {
  assert.equal(outdoorCard(null), null);
  assert.deepEqual(outdoorCard({ address: null, status: 'not-wired', last: null, check: null, spark: { t: [], rh: [] } }), { set: false });
});

test('the Overview card with a sensor: T, RH, dew point, status, sparklines and the fault chip', () => {
  const now = at(12);
  const spark = (v) => Array.from({ length: 6 }, (_, i) => ({ at: now - (6 - i) * 1800000, v: v + i }));
  const c = outdoorCard({
    address: 9, status: 'online', last: { at: now - 5000, t: 31.24, rh: 64.4, dew: 23.1 },
    check: { ok: true, why: null, fault: false }, spark: { t: spark(28), rh: spark(60) },
  }, now);
  assert.equal(c.set, true);
  assert.equal(c.statusText, 'Online');
  assert.deepEqual(c.values.map((v) => v.text), ['31.2 °C', '64 %RH', '23.1 °C']);
  assert.ok(c.values[0].spark && c.values[1].spark);
  assert.equal(c.values[2].spark, null);
  assert.equal(c.fault, null);
  const f = outdoorCard({ address: 9, status: 'online', last: null, check: { ok: false, why: 'frozen value', fault: true }, spark: {} }, now);
  assert.deepEqual(f.fault, { level: 'serious', text: 'Sensor fault: frozen value' });
  assert.deepEqual(f.values.map((v) => v.text), ['—', '—', '—']);
  assert.equal(f.values[0].spark, null);
  const w = outdoorCard({ address: 9, status: 'timeout', last: { t: 20, rh: 50 }, check: { ok: false, why: 'jump', fault: false } }, now);
  assert.equal(w.fault.level, 'warning');
  assert.equal(w.statusText, 'Timeout');
  assert.ok(Math.abs(Number.parseFloat(w.values[2].text) - 9.3) < 0.2); // dew point worked out here when the server sent none
});

import { pushOutdoorTail, liveOutdoor } from '../web/outdoor-math.js';

test('live outdoor: the newest readings are appended after the hour of history', () => {
  const base = { bucketS: 5, pollSeconds: 5, trh: [{ at: 1000, t: 30, rh: 60 }, { at: 6000, t: 31, rh: 61 }] };
  let tail = [];
  tail = pushOutdoorTail(tail, { at: 6000, t: 31, rh: 61 }); // the same reading as the history's last row
  tail = pushOutdoorTail(tail, { at: 11000, t: 32, rh: 62 });
  const merged = liveOutdoor(base, tail);
  assert.deepEqual(merged.trh.map((r) => r.at), [1000, 6000, 11000]);
  assert.equal(merged.bucketS, 5);
  const line = outdoorLine(merged, 't');
  assert.deepEqual(clipSeries(line.points, 0, 11000).map((p) => p.value), [30, 31, 32]);
});

test('live outdoor: the tail alone draws before the history arrives; nothing gives null', () => {
  assert.equal(liveOutdoor(null, []), null);
  let tail = pushOutdoorTail([], { at: 1000, t: 30, rh: 60 });
  tail = pushOutdoorTail(tail, { at: 2000, t: 30.5, rh: 60 });
  const merged = liveOutdoor(null, tail);
  assert.equal(outdoorLine(merged, 't').points.length, 2);
  assert.equal(outdoorLine(merged, 'rh').points[1].value, 60);
});

test('live outdoor: an old, repeated or empty reading adds nothing; the tail is capped', () => {
  const tail = pushOutdoorTail([], { at: 5000, t: 30, rh: 60 });
  assert.equal(pushOutdoorTail(tail, { at: 5000, t: 31, rh: 60 }), tail);
  assert.equal(pushOutdoorTail(tail, { at: 4000, t: 31, rh: 60 }), tail);
  assert.equal(pushOutdoorTail(tail, null), tail);
  assert.equal(pushOutdoorTail(tail, { at: 6000 }), tail);
  let big = [];
  for (let i = 1; i <= 200; i++) big = pushOutdoorTail(big, { at: i, t: 20, rh: 50 });
  assert.equal(big.length, 120);
  assert.equal(big[0].at, 81);
});

test('live outdoor: a history newer than the tail drops the tail rows it covers', () => {
  const base = { bucketS: 5, pollSeconds: 5, trh: [{ at: 20000, t: 30, rh: 60 }] };
  const tail = [{ at: 10000, t: 29, rh: 59 }, { at: 25000, t: 31, rh: 61 }];
  assert.deepEqual(liveOutdoor(base, tail).trh.map((r) => r.at), [20000, 25000]);
});
