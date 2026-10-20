import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, exchangeLine, formatHm, reasonLine, checkBand, locateField, stateLine, inputLabel, bandsBody, HUMIDIFIER_LABEL, humidifierOn, AC_FAN_LABEL, AC_FAN_OPTIONS, acFanOf } from '../web/control-math.js';

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
  assert.equal(checkBand(co2, 450, 5000), null);
  assert.equal(checkBand(co2, 449, 750).field, 'low'); // below about 450 cannot be reached with outdoor air
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

test('the humidifier switch has its label and reads the setting, on when missing', () => {
  assert.equal(HUMIDIFIER_LABEL, 'Humidifier on during air exchange');
  assert.equal(humidifierOn({ humidifierDuringExchange: false }), false);
  assert.equal(humidifierOn({ humidifierDuringExchange: true }), true);
  assert.equal(humidifierOn({}), true);
  assert.equal(humidifierOn(null), true);
  // it is not part of the band body
  assert.equal('humidifierDuringExchange' in bandsBody({ co2Low: 1, co2High: 2, tLow: 3, tHigh: 4, rhLow: 5, rhHigh: 6, humidifierDuringExchange: false }), false);
});

test('the aircon fan choice has its label and options, reads the setting, auto when missing', () => {
  assert.equal(AC_FAN_LABEL, 'Aircon fan');
  assert.deepEqual(AC_FAN_OPTIONS, [{ value: 'auto', label: 'Auto' }, { value: 'low', label: 'Low' }, { value: 'high', label: 'High' }]);
  assert.equal(acFanOf({ acFan: 'low' }), 'low');
  assert.equal(acFanOf({ acFan: 'high' }), 'high');
  assert.equal(acFanOf({ acFan: 'auto' }), 'auto');
  assert.equal(acFanOf({ acFan: 'turbo' }), 'auto');
  assert.equal(acFanOf({}), 'auto');
  assert.equal(acFanOf(null), 'auto');
  assert.equal('acFan' in bandsBody({ co2Low: 1, co2High: 2, tLow: 3, tHigh: 4, rhLow: 5, rhHigh: 6, acFan: 'low' }), false);
});

test('the card shows typical crop bands, the CO₂ minimum of 450 and the aircon drop setting', async () => {
  const { BANDS, SAFETY_FIELDS, checkSafety } = await import('../web/control-math.js');
  assert.equal(BANDS.find((b) => b.key === 'co2').min, 450);
  for (const b of BANDS) assert.ok(b.hint && b.hint.length > 10, `${b.key} has a hint`);
  assert.match(BANDS.find((b) => b.key === 't').hint, /grey oyster about 24 to 28, lion’s mane about 18 to 22/);
  const safety = SAFETY_FIELDS.find((f) => f.key === 'co2Safety');
  assert.match(safety.label, /for the crop/);
  assert.match(safety.hint, /5000 ppm over 8 h/);
  const drop = SAFETY_FIELDS.find((f) => f.key === 'acDrop');
  assert.deepEqual([drop.min, drop.max, drop.step], [0, 10, '0.5']);
  assert.equal(checkSafety(750, 1250, 10, 0), null);
  assert.equal(checkSafety(750, 1250, 10, undefined), null);
  assert.deepEqual(checkSafety(750, 1250, 10, 10.5), { field: 'acDrop', message: 'Aircon lower during air exchange must be a number from 0 to 10 °C' });
  assert.equal(checkSafety(750, 1250, 10, Number.NaN).field, 'acDrop');
});
