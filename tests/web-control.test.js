import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, REASONS, reasonsShown, heldLine, exchangeLine, formatHm, reasonLine, checkBand, locateField, stateLine, inputLabel, bandsBody, HUMIDIFIER_LABEL, humidifierOn, AC_FAN_LABEL, AC_FAN_OPTIONS, acFanOf } from '../web/control-math.js';
import { CONTROL_GROUPS } from '../web/control-math.js';
import { readFileSync } from 'node:fs';

const [co2, temp, rh] = BANDS;

test('exchange line shows the start time or off', () => {
  const at = new Date(2026, 9, 19, 10, 42, 30).getTime();
  assert.equal(formatHm(at), '10:42');
  assert.equal(exchangeLine({ exchange: true, exchangeSince: at }, at + 12 * 60000), 'Air exchange on since 10:42 (12 min)');
  assert.equal(exchangeLine({ exchange: true, exchangeSince: null }), 'Air exchange on');
  assert.equal(exchangeLine({ exchange: false, exchangeSince: at }), 'Air exchange off');
});

test('reason lines carry the machine name once', () => {
  assert.equal(reasonLine('Air exchange', 'Air exchange: CO₂ 762 ppm, at or over 750 ppm'), 'Air exchange: CO₂ 762 ppm, at or over 750 ppm');
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
  assert.equal(checkBand(rh, 39, 95).message, 'Humidity band lower limit must be 40 to 100 % RH');
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
  assert.equal(inputLabel(co2, 'low'), 'Air exchange stops at, ppm');
  assert.equal(inputLabel(rh, 'high'), 'Humidity band high limit, % RH');
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
  assert.match(safety.hint, /5,000 ppm over 8 h/);
  const drop = SAFETY_FIELDS.find((f) => f.key === 'acDrop');
  assert.deepEqual([drop.min, drop.max, drop.step], [0, 10, '0.5']);
  assert.equal(checkSafety(750, 1250, 10, 0), null);
  assert.equal(checkSafety(750, 1250, 10, undefined), null);
  assert.deepEqual(checkSafety(750, 1250, 10, 10.5), { field: 'acDrop', message: 'Aircon lower during air exchange must be a number from 0 to 10 °C' });
  assert.equal(checkSafety(750, 1250, 10, Number.NaN).field, 'acDrop');
});

test('Save sends only the fields that differ from what was loaded', async () => {
  const { changedBody } = await import('../web/control-math.js');
  const loaded = { co2Low: 600, co2High: 750, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95, co2Safety: 1500, exchangeMaxMin: 10, acDrop: 0, exchangeEveryMin: 0 };
  const values = { ...loaded };
  assert.deepEqual(changedBody(values, loaded), {});
  assert.deepEqual(changedBody({ ...values, exchangeMaxMin: 15 }, loaded), { exchangeMaxMin: 15 });
  assert.deepEqual(changedBody({ ...values, tLow: 22 }, loaded), { tLow: 22 });
  // co2High and co2Safety travel together
  assert.deepEqual(changedBody({ ...values, co2High: 800 }, loaded), { co2High: 800, co2Safety: 1500 });
  assert.deepEqual(changedBody({ ...values, co2Safety: 1600 }, loaded), { co2High: 750, co2Safety: 1600 });
  // the bands moved on the server while the form was being edited: only the edited field is sent
  assert.deepEqual(changedBody({ ...values, acDrop: 2 }, loaded), { acDrop: 2 });
  // a loaded object without a safety field (older server): the typed value is sent
  assert.deepEqual(changedBody({ ...values }, { ...loaded, acDrop: undefined }), { acDrop: 0 });
});

test('the reasons: the dehumidifier line comes after the humidifier and shows only when it is fitted', () => {
  assert.deepEqual(REASONS.map((r) => r.key), ['exchange', 'humidifier', 'dehumidifier', 'ac', 'circulation', 'lights']);
  assert.equal(REASONS.find((r) => r.key === 'dehumidifier').label, 'Dehumidifier');
  assert.deepEqual(reasonsShown({ dehumidifier: false }).map((r) => r.key), ['exchange', 'humidifier', 'ac', 'circulation']);
  assert.deepEqual(reasonsShown({ dehumidifier: true }).map((r) => r.key), ['exchange', 'humidifier', 'dehumidifier', 'ac', 'circulation']);
});

test('the dehumidifier reason and its wait text read like the other machines', () => {
  const c = { reasons: { dehumidifier: 'Dehumidifier: RH 94 %, at or over 93 %', held: { dehumidifier: 'Dehumidifier waits: minimum on time, 1 min 20 s to go' } } };
  assert.equal(reasonLine('Dehumidifier', c.reasons.dehumidifier), 'Dehumidifier: RH 94 %, at or over 93 %');
  assert.equal(heldLine(c, 'dehumidifier'), 'Dehumidifier waits: minimum on time, 1 min 20 s to go');
  assert.equal(reasonLine('Dehumidifier', ''), 'Dehumidifier: —');
});

// ---- outdoor air (spec 2026-10-26-live-alarms-outdoor-design.md 4) ----

test('the exchange line names why it runs: free cooling, outdoor drying, CO₂; fresh air says it already', async () => {
  const { exchangeLine: line, formatHm: hm } = await import('../web/control-math.js');
  const base = { exchange: true, exchangeSince: 1_000_000, exchangeEndsAt: 1_600_000 };
  const since = hm(1_000_000);
  const ends = hm(1_600_000);
  assert.equal(line({ ...base, exchangeKind: 'cooling' }), `Air exchange on since ${since} (stops by ${ends})\u00a0·\u00a0free cooling`);
  assert.equal(line({ ...base, exchangeKind: 'drying' }), `Air exchange on since ${since} (stops by ${ends})\u00a0·\u00a0outdoor drying`);
  assert.equal(line({ ...base, exchangeKind: 'co2' }), `Air exchange on since ${since} (stops by ${ends})\u00a0·\u00a0CO₂`);
  assert.equal(line({ ...base, exchangeKind: 'fresh', exchangeForced: true }), `Fresh air on since ${since} (stops by ${ends})`);
  assert.equal(line({ ...base, exchangeEndsAt: null, exchangeKind: 'cooling' }, 1_000_000 + 12 * 60_000), `Air exchange on since ${since} (12 min)\u00a0·\u00a0free cooling`);
  assert.equal(line(base), `Air exchange on since ${since} (stops by ${ends})`);
  assert.equal(line({ exchange: false, exchangeKind: null }), 'Air exchange off');
});

test('the outdoor air setting: label, default on, the note without an outdoor sensor, sent with Save only when changed', async () => {
  const { OUTDOOR_LABEL, outdoorOn, outdoorNote, bandsBody: body, changedBody } = await import('../web/control-math.js');
  assert.equal(OUTDOOR_LABEL, 'Use outdoor air (free cooling, drying, wait out wet air)');
  assert.equal(outdoorOn({}), true);
  assert.equal(outdoorOn({ outdoorAir: false }), false);
  assert.equal(outdoorNote({ outdoorSet: false }), 'needs an outdoor sensor (Settings)');
  assert.equal(outdoorNote({ outdoorSet: true }), '');
  assert.equal(outdoorNote({}), '');
  const six = { co2Low: 600, co2High: 750, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95 };
  assert.equal(body({ ...six, outdoorAir: false }).outdoorAir, false);
  assert.equal('outdoorAir' in body(six), false);
  const loaded = { ...six, co2Safety: 1250, exchangeMaxMin: 10, acDrop: 0, exchangeEveryMin: 15, outdoorAir: true };
  assert.deepEqual(changedBody({ ...loaded }, loaded), {});
  assert.deepEqual(changedBody({ ...loaded, outdoorAir: false }, loaded), { outdoorAir: false });
});

test('the card in groups (owner, 2026-10-26): CO₂, Temperature, Humidity, Air circulation, each with its band, its settings and why its machines do what they do', () => {
  assert.deepEqual(CONTROL_GROUPS, [
    { key: 'co2', title: 'CO₂', fields: ['co2', 'co2Safety', 'exchangeMaxMin', 'exchangeEveryMin'], own: [], reasons: ['exchange'] },
    { key: 't', title: 'Temperature', fields: ['t', 'acDrop'], own: ['acFan'], reasons: ['ac'] },
    { key: 'rh', title: 'Humidity', fields: ['rh'], own: ['humidifier'], reasons: ['humidifier', 'dehumidifier'] },
    { key: 'air', title: 'Air circulation', fields: [], own: [], reasons: ['circulation'] },
    { key: 'light', title: 'Lighting', fields: [], own: ['lightToday'], reasons: ['lights'], fitted: 'lights' },
  ]);
  const card = readFileSync(new URL('../web/control.js', import.meta.url), 'utf8');
  assert.match(card, /for \(const g of CONTROL_GROUPS\)/);
  assert.match(card, /el\('h3', 'c-group-title', g\.title\)/);
  assert.match(card, /for \(const list of reasonLists\) list\.hidden = !c\.auto;/);
});

// Owner, 2026-10-28: "make it from low and high to air exchange starting point and air exchange ending point".
test('the CO₂ row: Air exchange (ppm), Starts at first, then Stops at; its checks name those points', async () => {
  const { BANDS, inputLabel, checkBand } = await import('../web/control-math.js');
  const co2 = BANDS.find((b) => b.key === 'co2');
  assert.deepEqual(co2.order, ['high', 'low']);
  assert.deepEqual(co2.sides, { high: 'Starts at', low: 'Stops at' });
  assert.equal(inputLabel(co2, 'high'), 'Air exchange starts at, ppm');
  assert.equal(checkBand(co2, 900, 800).message, 'Air exchange stop point must be below the start point');
  assert.equal(checkBand(co2, 300, 800).message, 'Air exchange stop point must be 450 to 5000 ppm');
  const t = BANDS.find((b) => b.key === 't');
  assert.equal(inputLabel(t, 'low'), 'Temperature band low limit, °C', 'the other bands keep low and high');
});

test('Setup keeps the By-Hand Rule: a band set by hand in the accent text with the stage\'s value under it, and one way back', () => {
  const src = readFileSync(new URL('../web/control.js', import.meta.url), 'utf8');
  assert.match(src, /const diffs = byHandValues\(crop, last\);/);
  assert.match(src, /input\.classList\.toggle\('by-hand', text !== ''\);/);
  assert.match(src, /const backBtn = button\('Back to stage values'\);/);
  assert.match(src, /request\('PUT', `\/api\/rooms\/\$\{roomId\}\/control`, stageBody\(crop\.crops, crop\.stage\), COMMAND_TIMEOUT\)/);
  const crop = readFileSync(new URL('../web/crop-card.js', import.meta.url), 'utf8');
  assert.match(crop, /stageBody\(last\.crops, stage\)/, 'the Crop tab\'s button sends the same body');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.c-band \.ctl\.by-hand \{ color: var\(--accent-text\); \}/);
});

test('Setup: Save sits right under the inputs it saves, the "What the farm is doing now" readout after it (critique 2026-10-28)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../web/control.js', import.meta.url), 'utf8');
  assert.match(src, /host\.append\(cols, byHandRow, backErr, sendRow, saveErr, statusBox\);/);
});

// Critique 2026-10-29: the readout's last line ("Air exchange off") was larger and darker than the reasons above it.
test('Setup\'s What the farm is doing now: the state line set like the reasons above it', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.control \.c-status \.c-state \{ margin: 2px 0 0; color: var\(--muted\); font-size: var\(--fs-sm\); font-weight: 400; \}/);
  assert.match(css, /\.c-reasons \{ color: var\(--muted\); font-size: var\(--fs-sm\); \}/);
});
