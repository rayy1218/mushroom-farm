// The room dialog's ratings and meter address, the meter card, and the Settings page's new fields (web/ratings-math.js, web/settings-math.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATINGS, DEHUMIDIFIER_RATINGS, ratingTexts, parseRatings, meterAddressOf, meterCard } from '../web/ratings-math.js';
import {
  parseOutdoorAddress, parseElectricityPrice, parseWaterPrice, parseExtraSettings, EXTRA_FIELDS,
  OUTDOOR_MESSAGE, ELECTRICITY_MESSAGE, WATER_MESSAGE,
} from '../web/settings-math.js';

test('a new room starts with the spec defaults: 60, 60, 60, 80, 2.0 and 1050', () => {
  assert.deepEqual(ratingTexts(null), { intakeW: '60', exhaustW: '60', circulationW: '60', humidifierW: '80', humidifierLH: '2', acInputW: '1050', dehumidifierW: '380', dehumidifierLday: '20' });
  assert.equal(RATINGS.length, 6);
  assert.deepEqual(DEHUMIDIFIER_RATINGS.map((r) => r.name), ['dehumidifierW', 'dehumidifierLday']);
});

test('an edited room shows its own ratings; a missing one falls back to the default', () => {
  const t = ratingTexts({ intakeW: 45, humidifierLH: 1.5, acInputW: null });
  assert.equal(t.intakeW, '45');
  assert.equal(t.humidifierLH, '1.5');
  assert.equal(t.acInputW, '1050');
});

test('ratings: valid texts give numbers', () => {
  const r = parseRatings({ intakeW: '0', exhaustW: '5000', circulationW: ' 60 ', humidifierW: '80', humidifierLH: '2.5', acInputW: '20000' });
  assert.deepEqual(r.values, { intakeW: 0, exhaustW: 5000, circulationW: 60, humidifierW: 80, humidifierLH: 2.5, acInputW: 20000 });
});

test('ratings: each wrong input is named with its range', () => {
  const r = parseRatings({ intakeW: '5001', exhaustW: '-1', circulationW: '', humidifierW: 'abc', humidifierLH: '100.5', acInputW: '20001' });
  assert.deepEqual(Object.keys(r.errors), ['intakeW', 'exhaustW', 'circulationW', 'humidifierW', 'humidifierLH', 'acInputW']);
  assert.equal(r.errors.intakeW, 'Intake fan must be a number from 0 to 5000 W');
  assert.equal(r.errors.humidifierLH, 'Humidifier water must be a number from 0 to 100 L/h');
  assert.equal(r.errors.acInputW, 'Aircon rated input must be a number from 0 to 20000 W');
});

test('the meter address: blank is none, 1 to 247 is kept, anything else is NaN', () => {
  assert.equal(meterAddressOf(''), null);
  assert.equal(meterAddressOf('  '), null);
  assert.equal(meterAddressOf('12'), 12);
  assert.equal(meterAddressOf('247'), 247);
  assert.ok(Number.isNaN(meterAddressOf('0')));
  assert.ok(Number.isNaN(meterAddressOf('248')));
  assert.ok(Number.isNaN(meterAddressOf('1.5')));
});

test('the Energy meter card: only when a meter is set; values are null until the first answer', () => {
  assert.equal(meterCard(undefined), null);
  assert.equal(meterCard({ address: null, status: 'not-wired', lastOk: null }), null);
  assert.equal(meterCard({ address: 5, status: 'not-wired' }), null);
  assert.deepEqual(meterCard({ address: 5, status: 'no-data', lastOk: null }), { address: 5, status: 'no-data', power: null, energy: null, at: null, failures: 0 });
  assert.deepEqual(meterCard({ address: 5, status: 'online', lastOk: { at: 99, power: 412.5, energy: 1234.5 }, failuresInRow: 0 }),
    { address: 5, status: 'online', power: 412.5, energy: 1234.5, at: 99, failures: 0 });
});

test('outdoor address: blank, 1 to 247, else the message', () => {
  assert.deepEqual(parseOutdoorAddress(''), { value: null });
  assert.deepEqual(parseOutdoorAddress('9'), { value: 9 });
  assert.deepEqual(parseOutdoorAddress('247'), { value: 247 });
  for (const bad of ['0', '248', '1.5', 'x', '-3']) assert.deepEqual(parseOutdoorAddress(bad), { error: OUTDOOR_MESSAGE });
});

test('electricity price: 0 to 10 with up to 4 decimals, required', () => {
  assert.deepEqual(parseElectricityPrice('0.55'), { value: 0.55 });
  assert.deepEqual(parseElectricityPrice('0.5068'), { value: 0.5068 });
  assert.deepEqual(parseElectricityPrice('10'), { value: 10 });
  assert.deepEqual(parseElectricityPrice('0'), { value: 0 });
  for (const bad of ['', '10.01', '-1', 'abc', '0.55555', '1e2']) assert.deepEqual(parseElectricityPrice(bad), { error: ELECTRICITY_MESSAGE });
});

test('water price: blank is none, else 0 to 100', () => {
  assert.deepEqual(parseWaterPrice(''), { value: null });
  assert.deepEqual(parseWaterPrice('2.07'), { value: 2.07 });
  assert.deepEqual(parseWaterPrice('100'), { value: 100 });
  for (const bad of ['100.5', '-2', 'abc']) assert.deepEqual(parseWaterPrice(bad), { error: WATER_MESSAGE });
});

test('the three settings together: a body, or an error per wrong field', () => {
  assert.deepEqual(parseExtraSettings({ outdoorAddress: '', electricityPrice: '0.55', waterPrice: '' }),
    { body: { outdoorAddress: null, electricityPrice: 0.55, waterPrice: null } });
  const r = parseExtraSettings({ outdoorAddress: '300', electricityPrice: '0.55', waterPrice: 'x' });
  assert.deepEqual(Object.keys(r.errors), ['outdoorAddress', 'waterPrice']);
});

test('the inputs show the server values; an older server (no fields) shows the default price and blanks', () => {
  const show = Object.fromEntries(EXTRA_FIELDS.map((f) => [f.name, f.show]));
  assert.equal(show.outdoorAddress(9), '9');
  assert.equal(show.outdoorAddress(null), '');
  assert.equal(show.outdoorAddress(undefined), '');
  assert.equal(show.electricityPrice(0.5068), '0.5068');
  assert.equal(show.electricityPrice(undefined), '0.55');
  assert.equal(show.waterPrice(null), '');
  assert.equal(show.waterPrice(2.07), '2.07');
});

// The browser checks step before the dialog's own check runs, so a rating of 62.5 W must not be blocked by the markup.
test('the ratings inputs take any step the parser takes (two decimals)', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.deepEqual(parseRatings({ intakeW: '62.5', exhaustW: '60', circulationW: '60', humidifierW: '80', humidifierLH: '2.25', acInputW: '1050.75' }).errors, undefined);
  for (const r of RATINGS) {
    const tag = html.match(new RegExp(`<input id="f-${r.name}"[^>]*>`))?.[0];
    assert.ok(tag, r.name);
    assert.match(tag, /step="any"/, r.name);
  }
});

const SIX = { intakeW: '60', exhaustW: '60', circulationW: '60', humidifierW: '80', humidifierLH: '2', acInputW: '1050' };

test('dehumidifier ratings: an edited room shows its own; a room without them shows the defaults 380 W and 20 L/day', () => {
  const t = ratingTexts({ dehumidifierW: 450, dehumidifierLday: 12.5 });
  assert.equal(t.dehumidifierW, '450');
  assert.equal(t.dehumidifierLday, '12.5');
  assert.equal(ratingTexts({}).dehumidifierLday, '20');
});

test('dehumidifier ratings: checked (0 to 5000 W, 0 to 200 L/day) only when the dehumidifier is fitted', () => {
  const bad = { ...SIX, dehumidifierW: '5001', dehumidifierLday: '201' };
  const r = parseRatings(bad, { dehumidifier: true });
  assert.deepEqual(Object.keys(r.errors), ['dehumidifierW', 'dehumidifierLday']);
  assert.equal(r.errors.dehumidifierW, 'Dehumidifier power must be a number from 0 to 5000 W');
  assert.equal(r.errors.dehumidifierLday, 'Dehumidifier capacity must be a number from 0 to 200 L/day');
  const ok = parseRatings({ ...SIX, dehumidifierW: '400', dehumidifierLday: '200' }, { dehumidifier: true });
  assert.equal(ok.values.dehumidifierW, 400);
  assert.equal(ok.values.dehumidifierLday, 200);
});

test('dehumidifier ratings: not fitted, wrong ones are not an error and are left out of the values', () => {
  const r = parseRatings({ ...SIX, dehumidifierW: 'abc', dehumidifierLday: '15' });
  assert.equal(r.errors, undefined);
  assert.equal('dehumidifierW' in r.values, false);
  assert.equal(r.values.dehumidifierLday, 15);
});
