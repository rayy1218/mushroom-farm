import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, exchangeLine, formatHm, reasonLine, checkBand, locateField, stateLine, inputLabel, bandsBody } from '../web/control-math.js';

const [co2, temp, rh] = BANDS;

test('exchange line shows the start time or off', () => {
  const at = new Date(2026, 9, 19, 10, 42, 30).getTime();
  assert.equal(formatHm(at), '10:42');
  assert.equal(exchangeLine({ exchange: true, exchangeSince: at }, at + 12 * 60000), 'Air exchange on since 10:42 (12 min)');
  assert.equal(exchangeLine({ exchange: true, exchangeSince: null }), 'Air exchange on');
  assert.equal(exchangeLine({ exchange: false, exchangeSince: at }), 'Air exchange off');
});

test('reason lines carry the machine name once', () => {
  assert.equal(reasonLine('Air exchange', 'Air exchange: CO₂ 762 ≥ 750'), 'Air exchange: CO₂ 762 ≥ 750');
  assert.equal(reasonLine('Circulation', 'always on'), 'Circulation: always on');
  assert.equal(reasonLine('Aircon', undefined), 'Aircon: —');
});

test('band check enforces limits and low < high', () => {
  assert.equal(checkBand(co2, 600, 750), null);
  assert.equal(checkBand(co2, 300, 5000), null);
  assert.equal(checkBand(co2, 299, 750).field, 'low');
  assert.equal(checkBand(co2, 600, 5001).field, 'high');
  assert.equal(checkBand(temp, 21, 21).message, 'Temperature band lower limit must be below the upper limit');
  assert.equal(checkBand(temp, 15.5, 23).field, 'low');
  assert.equal(checkBand(rh, NaN, 95).field, 'low');
  assert.equal(checkBand(rh, 85, NaN).field, 'high');
  assert.equal(checkBand(rh, 39, 95).message, 'Humidity band lower limit must be 40 to 100 %');
});

test('server fields find their row', () => {
  assert.equal(locateField('rhHigh').band.key, 'rh');
  assert.equal(locateField('rhHigh').side, 'high');
  assert.equal(locateField('tLow').side, 'low');
  assert.equal(locateField('auto'), null);
  assert.equal(locateField(undefined), null);
});

test('save sends the six band values only', () => {
  const body = bandsBody({ co2Low: 600, co2High: 750, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95, auto: true });
  assert.deepEqual(body, { co2Low: 600, co2High: 750, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95 });
});

test('state line says auto is off; input labels carry the band, side and unit', () => {
  assert.equal(stateLine({ auto: false, exchange: true, exchangeSince: 1 }), 'Automatic control off');
  assert.equal(stateLine({ auto: true, exchange: false }), 'Air exchange off');
  assert.equal(stateLine({ auto: true, exchange: true, exchangeSince: 0 }, 5 * 60000), 'Air exchange on since ' + formatHm(0) + ' (5 min)');
  assert.equal(inputLabel(co2, 'low'), 'CO₂ band low limit, ppm');
  assert.equal(inputLabel(rh, 'high'), 'Humidity band high limit, %');
});

test('low not below high is blamed on the low field, like the server', () => {
  assert.equal(checkBand(temp, 23, 21).field, 'low');
  assert.equal(locateField('co2'), null);
});

test('state line shows how long the exchange has run', () => {
  const at = new Date(2026, 9, 19, 11, 28).getTime();
  assert.equal(exchangeLine({ exchange: true, exchangeSince: at }, at + 12 * 60000), 'Air exchange on since 11:28 (12 min)');
  assert.equal(exchangeLine({ exchange: true, exchangeSince: at }, at + 30000), 'Air exchange on since 11:28 (0 min)');
  assert.equal(exchangeLine({ exchange: true, exchangeSince: at }, at + 135 * 60000), 'Air exchange on since 11:28 (2 h 15 min)');
});
