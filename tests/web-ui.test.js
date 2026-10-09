// web/ui.js: formatting and small DOM helpers (docs/contracts/web.md section 5, table 7.1).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../web/ui.js');
const UI = globalThis.FarmUi;

test('fmtNum', () => {
  assert.equal(UI.fmtNum(1.234, 1), '1.2');
  assert.equal(UI.fmtNum(NaN, 1), '—');
  assert.equal(UI.fmtNum(null, 1), '—');
});

test('moved formatters unchanged', () => {
  assert.equal(UI.fmtDur(1800), '30 min');
  assert.equal(UI.fmtDur(5400), '1.5 h');
  assert.equal(UI.fmtMinSec(75), '1:15');
  assert.equal(UI.watts(950), '950 W');
  assert.equal(UI.watts(1430), '1.43 kW');
  assert.equal(UI.pct(0.256), '26 %');
  assert.equal(UI.nf(12345.6), '12,346');
  assert.equal(UI.clamp(5, 0, 3), 3);
});

test('tables moved', () => {
  assert.equal(UI.ICON.critical, '◆');
  assert.equal(UI.LVL_RANK.serious, 2);
});

test('simClock', () => {
  const c = UI.simClock(6);
  assert.equal(c.offset, 21600);
  assert.equal(c.stamp(0), 'D1 06:00:00');
  assert.equal(c.label(0), 'Day 1 · 06:00');
  assert.equal(c.hm(72000), '02:00');
  assert.equal(c.stamp(72000), 'D2 02:00:00');
});

test('farmClock', () => {
  const c = UI.farmClock();
  assert.equal(c.offset, 28800);
  assert.equal(c.stamp(1791450012), '2026-10-08 17:00:12');
  assert.equal(c.label(1791450012), '2026-10-08 17:00');
  assert.equal(c.hm(1791450012), '17:00');
  assert.equal(c.stamp(0), '1970-01-01 08:00:00');
});

test('errorText', () => {
  const apiErr = Object.assign(new Error('Invalid room'), { name: 'ApiError', status: 400, error: 'Invalid room', details: ['name: a', 'volume: b'] });
  assert.equal(UI.errorText(apiErr), 'Invalid room: name: a; volume: b');
  const apiErr2 = Object.assign(new Error('Invalid room'), { name: 'ApiError', status: 400, error: 'Invalid room', details: [] });
  assert.equal(UI.errorText(apiErr2), 'Invalid room');
  assert.equal(UI.errorText(new Error('boom')), 'boom');
});

test('errorText: no ".:" after a sentence that ends in punctuation', () => {
  const mk = (error, details) => Object.assign(new Error(error), { name: 'ApiError', status: 0, error, details });
  assert.equal(UI.errorText(mk('The farm server cannot be reached.', ['Failed to fetch'])), 'The farm server cannot be reached. Failed to fetch');
  assert.equal(UI.errorText(mk('Is it saved?', ['a', 'b'])), 'Is it saved? a; b');
  assert.equal(UI.errorText(mk('Not saved!', ['a'])), 'Not saved! a');
  assert.equal(UI.errorText(mk('Invalid room', ['a'])), 'Invalid room: a');
});
