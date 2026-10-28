// The shared band words (web/band-math.js): CO₂ in the air exchange's words, and the exchange's two points.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { co2Status, exchangePoints, nearEdge, nearChip, nearFor, NEAR_DWELL_MS } from '../web/band-math.js';

const points = { stop: 700, start: 900, safety: 1500 };

test('CO₂ says what the air exchange is doing, not "in band" (low CO₂ is fine)', () => {
  assert.deepEqual(co2Status(650, { ...points, exchange: false }), { text: 'Below the stop point', tone: 'good' });
  assert.deepEqual(co2Status(800, { ...points, exchange: false }), { text: 'Exchange off', tone: 'good' });
  assert.deepEqual(co2Status(800, { ...points, exchange: true }), { text: 'Exchange running', tone: 'neutral' });
  assert.deepEqual(co2Status(1000, { ...points, exchange: true }), { text: 'Exchange running', tone: 'neutral' }, 'over the start point and running: not amber');
  assert.deepEqual(co2Status(900, { ...points, exchange: false }), { text: 'Over the start point', tone: 'amber' });
  assert.deepEqual(co2Status(1000, { ...points, exchange: null }), { text: 'Over the start point', tone: 'amber' }, 'not known: as not running');
});

test('CO₂ near and at the safety level: amber within 15 % of the gap from the start point, red at it', () => {
  // the gap 900 → 1500 is 600 ppm: from 1,410 ppm on it is near
  assert.deepEqual(co2Status(1409, { ...points, exchange: true }), { text: 'Exchange running', tone: 'neutral' });
  assert.deepEqual(co2Status(1410, { ...points, exchange: true }), { text: 'Near the safety level', tone: 'amber' });
  assert.deepEqual(co2Status(1499, { ...points, exchange: false }), { text: 'Near the safety level', tone: 'amber' });
  assert.deepEqual(co2Status(1500, { ...points, exchange: true }), { text: 'At the safety level', tone: 'critical' });
  assert.deepEqual(co2Status(1450, { stop: 700, start: 900, safety: null, exchange: false }), { text: 'Over the start point', tone: 'amber' }, 'no safety level known');
});

test('CO₂ without a value or its points has no words', () => {
  assert.equal(co2Status(null, points), null);
  assert.equal(co2Status(800, { stop: null, start: 900 }), null);
});

test('the Near-Edge Rule is for temperature and humidity; CO₂ has its own words', () => {
  assert.equal(nearEdge('co2', 795, 700, 800), null);
  assert.equal(nearEdge('t', 20.9, 19, 21), 'top');
  assert.equal(nearChip('co2', 795, 700, 800, { machines: {} }), null);
});

test('the exchange points carry their unit on both numbers, grouped', () => {
  assert.equal(exchangePoints(700, 900), 'starts at 900 ppm, stops at 700 ppm');
  assert.equal(exchangePoints(800, 1200), 'starts at 1,200 ppm, stops at 800 ppm');
});

// Critique 2026-10-28 (owner): near an edge is amber only when the machine that should act is not acting, or after 15 min
// there; otherwise the calm state. The words fit one line: "Near low · falling", "Near high".
test('nearEdge: where an in-band temperature or humidity sits, both edges', () => {
  assert.equal(nearEdge('t', 19.2, 19, 21), 'bottom');
  assert.equal(nearEdge('rh', 92.5, 87, 93), 'top');
  assert.equal(nearEdge('rh', 87.5, 87, 93), 'bottom');
  assert.equal(nearEdge('rh', 90, 87, 93), null);
  assert.equal(nearEdge('rh', 86, 87, 93), null, 'out of band is not near');
});

test('nearChip: humidity near low is amber with the humidifier off, calm with it on', () => {
  assert.deepEqual(nearChip('rh', 87.4, 87, 93, { machines: { humidifier: false } }), { edge: 'bottom', text: 'Near low' });
  assert.deepEqual(nearChip('rh', 87.4, 87, 93, { machines: { humidifier: false }, trend: -0.5 }), { edge: 'bottom', text: 'Near low · falling' });
  assert.equal(nearChip('rh', 87.4, 87, 93, { machines: { humidifier: true }, trend: -0.5 }), null, 'the humidifier is on it');
  assert.equal(nearChip('rh', 87.4, 87, 93), null, 'machines not known: only after 15 min');
});

test('nearChip: humidity near high is amber with a fitted dehumidifier off; without one only after 15 min', () => {
  assert.deepEqual(nearChip('rh', 92.6, 87, 93, { machines: { dehumidifier: false } }), { edge: 'top', text: 'Near high' });
  assert.deepEqual(nearChip('rh', 92.6, 87, 93, { machines: { dehumidifier: false }, trend: 0.5 }), { edge: 'top', text: 'Near high · rising' });
  assert.equal(nearChip('rh', 92.6, 87, 93, { machines: { dehumidifier: true } }), null);
  assert.equal(nearChip('rh', 92.6, 87, 93, { machines: { dehumidifier: null } }), null, 'none fitted');
  const stayed = [{ at: 0, value: 92.5 }, { at: NEAR_DWELL_MS / 2, value: 92.7 }, { at: NEAR_DWELL_MS, value: 92.6 }];
  assert.deepEqual(nearChip('rh', 92.6, 87, 93, { machines: { dehumidifier: null }, points: stayed }), { edge: 'top', text: 'Near high' }, '15 min near the top');
  assert.deepEqual(nearChip('rh', 92.6, 87, 93, { machines: { dehumidifier: true }, points: stayed }), { edge: 'top', text: 'Near high' }, 'running but not enough');
});

test('nearChip: temperature near high is amber with the aircon not cooling; near low with it cooling', () => {
  assert.deepEqual(nearChip('t', 20.8, 19, 21, { machines: { cooling: false } }), { edge: 'top', text: 'Near high' });
  assert.equal(nearChip('t', 20.8, 19, 21, { machines: { cooling: true } }), null);
  assert.equal(nearChip('t', 20.8, 19, 21, { machines: { cooling: null } }), null, 'no aircon: only after 15 min');
  assert.deepEqual(nearChip('t', 19.1, 19, 21, { machines: { cooling: true } }), { edge: 'bottom', text: 'Near low' }, 'cooling a room already near its bottom');
  assert.equal(nearChip('t', 19.1, 19, 21, { machines: { cooling: false } }), null, 'nothing heats: only after 15 min');
  const stayed = [{ at: 0, value: 19.2 }, { at: NEAR_DWELL_MS, value: 19.1 }];
  assert.deepEqual(nearChip('t', 19.1, 19, 21, { machines: { cooling: false }, points: stayed }), { edge: 'bottom', text: 'Near low' });
  assert.equal(nearChip('co2', 890, 700, 900, { machines: {} }), null, 'CO₂ has its own words');
});

test('nearFor: how long a reading has stayed near that edge, the latest stretch only', () => {
  const pts = [{ at: 0, value: 20.8 }, { at: 10, value: 20 }, { at: 20, value: 20.8 }, { at: 25, value: null }, { at: 40, value: 21.2 }];
  assert.equal(nearFor(pts, 19, 21, 'top'), 20, 'from 20 to 40 (over the edge counts; a failed poll does not break it)');
  assert.equal(nearFor(pts, 19, 21, 'bottom'), 0);
  assert.equal(nearFor([], 19, 21, 'top'), 0);
});
