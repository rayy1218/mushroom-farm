import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageLine, nextLine, rampLine, doneLine, cropWarnings, formFromData, checkCropForm, saveBody, newBlocksBody, startBody, hasCrops, FORM_FIELD_ORDER } from '../web/crop-math.js';

const DAY = 86_400_000;
const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();
const base = {
  crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', stageSince: at(20, 10, 42), flush: 1, flushes: 4,
  days: { spawn: 21, pinning: 4, fruiting: 7, rest: 10 }, rampH: 4, autoAdvance: true, done: false, ramp: null,
  nextStage: { stage: 'rest', flush: 1, at: at(27, 10, 42) }, targets: { bands: { co2Low: 700, co2High: 900, co2Safety: 1500, tLow: 24, tHigh: 26, rhLow: 85, rhHigh: 91 }, warnings: [] },
};

test('the stage line: since, day of days, flush of flushes', () => {
  assert.equal(stageLine(base, at(22, 15, 0)), 'since 20 Oct 10:42 · day 3 of 7 · flush 1 of 4');
  assert.equal(stageLine(base, at(20, 10, 42)), 'since 20 Oct 10:42 · day 1 of 7 · flush 1 of 4');
  assert.equal(stageLine(base, at(30, 10, 42)), 'since 20 Oct 10:42 · day 7 of 7 · flush 1 of 4', 'the change is due: not day 11');
  assert.equal(stageLine({ ...base, stage: 'spawn', flush: 1 }, at(21, 0, 0)), 'since 20 Oct 10:42 · day 1 of 21');
  assert.equal(stageLine({ ...base, autoAdvance: false }, at(30, 10, 42)), 'since 20 Oct 10:42 · day 11 · flush 1 of 4');
  assert.equal(stageLine({ ...base, stageSince: null }, at(30, 10, 42)), '');
  assert.equal(stageLine({ ...base, crops: [] }, at(30, 10, 42)), '');
});

test('the next line', () => {
  assert.equal(nextLine(base), 'Next: Rest between flushes, about 27 Oct 10:42');
  assert.equal(nextLine({ ...base, nextStage: { stage: 'fruiting', flush: 2, at: at(30, 0, 5) } }), 'Next: Fruiting, about 30 Oct 00:05');
  assert.equal(nextLine({ ...base, nextStage: { stage: 'rest', flush: 1, at: null }, autoAdvance: false }), 'Next: Rest between flushes (automatic change is off)');
  assert.equal(nextLine({ ...base, nextStage: null }), '');
  assert.equal(nextLine({ ...base, done: true }), '');
  assert.equal(nextLine({ ...base, nextStage: undefined }), '');
});

test('the ramp line and the done line', () => {
  const ramp = { to: base.targets.bands, endAt: at(20, 14, 42) };
  assert.equal(rampLine({ ...base, ramp }, at(20, 11, 0)), 'Bands moving to fruiting, ready about 14:42');
  assert.equal(rampLine({ ...base, stage: 'rest', ramp }, at(20, 11, 0)), 'Bands moving to rest between flushes, ready about 14:42');
  assert.equal(rampLine({ ...base, ramp: { ...ramp, endAt: at(21, 2, 0) } }, at(20, 23, 0)), 'Bands moving to fruiting, ready about 21 Oct 02:00');
  assert.equal(rampLine({ ...base, ramp }, at(20, 15, 0)), '', 'the ramp has ended');
  assert.equal(rampLine(base, at(20, 11, 0)), '');
  assert.equal(doneLine(base), '');
  assert.equal(doneLine({ ...base, done: true }), 'Flush 4 of 4 done: replace the blocks');
});

test('warnings: those of the mix and those of the crops\' ranges', () => {
  assert.deepEqual(cropWarnings(base), []);
  assert.deepEqual(cropWarnings({ ...base, targets: { ...base.targets, warnings: ['Grey oyster and Milky do not fit one temperature band'] } }), ['Grey oyster and Milky do not fit one temperature band']);
  // the server's targets.warnings already holds the range warnings: shown once, as they are
  const range = "Temperature band 24–26 °C is outside Lion's mane (draft)'s range 16–22 °C";
  assert.deepEqual(cropWarnings({ ...base, crops: [{ crop: 'lionsmane', blocks: 5 }], targets: { ...base.targets, warnings: [range] } }), [range]);
  assert.deepEqual(cropWarnings({ ...base, targets: null }), []);
  assert.deepEqual(cropWarnings({ ...base, crops: [], targets: null }), []);
  assert.equal(hasCrops({ ...base, crops: [] }), false);
  assert.equal(hasCrops(base), true);
});

test('the form holds the texts of the room, and checks them like the server', () => {
  const f = formFromData(base);
  assert.deepEqual(f, { crops: [{ crop: 'oyster', blocks: '500' }], farmType: 'ready', flushes: '4', days: { spawn: '21', pinning: '4', fruiting: '7', rest: '10' }, rampH: '4', autoAdvance: true });
  const ok = checkCropForm(f);
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.values, { crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', flushes: 4, days: { fruiting: 7, rest: 10 }, rampH: 4, autoAdvance: true });
  assert.deepEqual(checkCropForm({ ...f, farmType: 'full' }).values.days, { spawn: 21, pinning: 4, fruiting: 7, rest: 10 });
  const bad = checkCropForm({ ...f, crops: [{ crop: 'oyster', blocks: '0' }], flushes: '11', days: { ...f.days, rest: '91', spawn: 'x' }, rampH: '49' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['crops', 'days.rest', 'flushes', 'rampH']); // spawn is not in a ready farm
  assert.equal(bad.errors.flushes, 'Flushes must be a whole number from 1 to 10');
  assert.equal(bad.errors['days.rest'], 'Days of each stage must be a whole number from 1 to 90');
  assert.equal(bad.errors.rampH, 'Ramp must be a number from 0 to 48 h');
  assert.equal(FORM_FIELD_ORDER.indexOf('crops') < FORM_FIELD_ORDER.indexOf('flushes'), true);
  // no crops is allowed: a room whose bands are set by hand
  assert.deepEqual(checkCropForm({ ...f, crops: [] }).errors, {});
  assert.equal(checkCropForm({ ...f, rampH: '0.5' }).values.rampH, 0.5);
  assert.equal(checkCropForm({ ...f, rampH: '12.25' }).values.rampH, 12.25, 'any decimal from 0 to 48');
  assert.equal(checkCropForm({ ...f, rampH: '48' }).errors.rampH, undefined);
  assert.equal(checkCropForm({ ...f, rampH: '48.5' }).errors.rampH, 'Ramp must be a number from 0 to 48 h');
  assert.equal(checkCropForm({ ...f, rampH: '' }).errors.rampH, 'Ramp must be a number from 0 to 48 h');
});

test('Save sends only what differs from the loaded view; a done room is not restarted by another field', () => {
  const same = checkCropForm(formFromData(base)).values;
  assert.deepEqual(saveBody(same, base), {}, 'nothing changed: nothing to send');
  const change = (patch) => checkCropForm({ ...formFromData(base), ...patch }).values;
  assert.deepEqual(saveBody(change({ flushes: '5' }), base), { flushes: 5 });
  assert.deepEqual(saveBody(change({ rampH: '2.5' }), base), { rampH: 2.5 });
  assert.deepEqual(saveBody(change({ autoAdvance: false }), base), { autoAdvance: false });
  assert.deepEqual(saveBody(change({ farmType: 'full' }), base), { farmType: 'full' });
  assert.deepEqual(saveBody(change({ days: { ...formFromData(base).days, rest: '12' } }), base), { days: { rest: 12 } });
  assert.deepEqual(saveBody(change({ crops: [{ crop: 'oyster', blocks: '600' }] }), base), { crops: [{ crop: 'oyster', blocks: 600 }] });
  assert.deepEqual(saveBody(change({ crops: [{ crop: 'oyster', blocks: '500' }] }), base), {}, 'the same rows are not sent');
  const done = { ...base, done: true };
  assert.deepEqual(saveBody(change({ flushes: '6' }), done), { flushes: 6 }, 'raising the flushes of a done room sends no crops');
  // a room without crops: its first crops go with the chosen start stage
  const empty = { ...base, crops: [], stageSince: null };
  const first = checkCropForm({ ...formFromData(base) }).values;
  assert.deepEqual(saveBody(first, empty, 'spawn').crops, first.crops);
  assert.equal(saveBody(first, empty, 'spawn').stage, 'spawn');
  assert.equal(saveBody(first, base, 'spawn').stage, undefined);
});

test('New blocks sends the rows with newBlocks', () => {
  const crops = [{ crop: 'oyster', blocks: 500 }];
  assert.deepEqual(newBlocksBody({ crops }), { crops, newBlocks: true });
});

test('the bodies of the two buttons', () => {
  const ok = checkCropForm(formFromData(base));
  assert.deepEqual(startBody('rest', false), { stage: 'rest' });
  assert.deepEqual(startBody('rest', true), { stage: 'rest', applyNow: true });
});
