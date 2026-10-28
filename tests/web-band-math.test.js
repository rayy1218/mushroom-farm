// The shared band words (web/band-math.js): CO₂ in the air exchange's words, and the exchange's two points.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { co2Status, exchangePoints, nearEdge } from '../web/band-math.js';

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
});

test('the exchange points carry their unit on both numbers, grouped', () => {
  assert.equal(exchangePoints(700, 900), 'starts at 900 ppm, stops at 700 ppm');
  assert.equal(exchangePoints(800, 1200), 'starts at 1,200 ppm, stops at 800 ppm');
});
