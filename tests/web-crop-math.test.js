import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomBandNote, runningTargets, stageTargets, stageLine, nextLine, rampLine, doneLine, cropWarnings, formFromData, checkCropForm, saveBody, newBlocksBody, startBody, hasCrops, FORM_FIELD_ORDER } from '../web/crop-math.js';

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
  const range = "Temperature band 24–26 °C goes past the guide's 16–22 °C for Lion's mane (draft)";
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

test("roomBandNote: on the current stage, the bands the room really runs when they differ from the stage's targets (changed by hand)", () => {
  const crops = [{ crop: 'lionsmane', blocks: 950 }];
  const t = Object.fromEntries(stageTargets(crops, 'fruiting').map((r) => [r.key, r.value]));
  const same = { tLow: 0, tHigh: 0 };
  // the room's bands from the stage's own targets: no note
  const targets = { ...same };
  for (const [k, v] of Object.entries({ t: ['tLow', 'tHigh'], rh: ['rhLow', 'rhHigh'] })) {
    const [lo, hi] = t[k].replace(/[^0-9–]/g, '').split('–').map(Number);
    targets[v[0]] = lo; targets[v[1]] = hi;
  }
  const [, start, stop] = /starts at ([0-9,]+), stops at ([0-9,]+) ppm/.exec(t.co2).map((x) => Number(String(x).replace(/,/g, '')));
  targets.co2High = start; targets.co2Low = stop;
  targets.co2Safety = Number(t.safety.replace(/[^0-9]/g, ''));
  assert.equal(roomBandNote(crops, 'fruiting', targets), '');
  assert.equal(roomBandNote(crops, 'fruiting', { ...targets, co2High: targets.co2High - 100, co2Safety: 1000 }),
    `The room runs the air exchange starting at ${(targets.co2High - 100).toLocaleString('en-US')} and stopping at ${targets.co2Low} ppm and a CO₂ safety level of 1,000 ppm: changed by hand on the Setup tab, until the next stage sets the targets again.`);
  assert.equal(roomBandNote(crops, 'fruiting', { ...targets, tLow: 18.5 }),
    `The room runs temperature 18.5–${targets.tHigh} °C: changed by hand on the Setup tab, until the next stage sets the targets again.`);
  assert.equal(roomBandNote(crops, 'fruiting', null), '', 'before the control settings loaded');
  assert.equal(roomBandNote([], 'fruiting', targets), '');
  assert.equal(roomBandNote(crops, 'fruiting', { ...targets, tLow: 18.5 }, { ramp: { endAt: Date.now() + 3_600_000 } }), '', 'while the stage ramps the bands differ by design');
});

test("runningTargets: the current stage's rows show the bands the room runs first, the stage's own value second when they differ", () => {
  const crops = [{ crop: 'lionsmane', blocks: 950 }];
  const rows = stageTargets(crops, 'fruiting');
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const co2 = /starts at ([0-9,]+), stops at ([0-9,]+)/.exec(byKey.co2).slice(1).map((x) => Number(x.replace(',', ''))).reverse(); // [stop, start]
  const t = /([0-9.]+)–([0-9.]+)/.exec(byKey.t).slice(1).map(Number);
  const rh = /([0-9.]+)–([0-9.]+)/.exec(byKey.rh).slice(1).map(Number);
  const safety = Number(byKey.safety.replace(/[^0-9]/g, ''));
  const same = { tLow: t[0], tHigh: t[1], rhLow: rh[0], rhHigh: rh[1], co2Low: co2[0], co2High: co2[1], co2Safety: safety };
  assert.deepEqual(runningTargets(rows, same).map((r) => [r.value, r.stageValue]), rows.map((r) => [r.value, null]), 'the same: as before');
  const out = runningTargets(rows, { ...same, co2High: co2[1] - 100, co2Safety: 1000 });
  const c = out.find((r) => r.key === 'co2');
  assert.equal(c.value, `starts at ${(co2[1] - 100).toLocaleString('en-US')}, stops at ${co2[0]} ppm`);
  assert.equal(c.stageValue, byKey.co2);
  const s = out.find((r) => r.key === 'safety');
  assert.deepEqual([s.value, s.stageValue], ['1,000 ppm', byKey.safety]);
  assert.equal(out.find((r) => r.key === 't').stageValue, null);
  assert.deepEqual(runningTargets(rows, null), rows.map((r) => ({ ...r, stageValue: null })), 'before the control settings loaded');
});
