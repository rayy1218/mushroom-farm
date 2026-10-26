// The lights on the farm pages (spec 2026-10-26-lighting-design.md 8): the Machines card, the Room card's lamp and tile, the
// Climate tab's Lighting group, the Crop tab's Light rows and pencil, the room dialog, the timeline, energy and the runs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MACHINE_NAMES, shownMachines } from '../web/machines-math.js';
import { fromRoom, fromSim, view, describe } from '../web/mimic-math.js';
import { machineTiles, roomCard } from '../web/room-card-math.js';
import { CONTROL_GROUPS, REASONS, reasonsShown, lightingLine, CROP_TAB_LINK } from '../web/control-math.js';
import { stageTargets, formFromData, checkCropForm, saveBody, FORM_FIELD_ORDER } from '../web/crop-math.js';
import { LIGHTS_RATINGS, ratingTexts, parseRatings } from '../web/ratings-math.js';
import { TIMELINE_ROWS, wiredTimelineRows } from '../web/history-math.js';
import { breakdown } from '../web/usage-math.js';
import { timelineRows, energyView } from '../web/simulation-math.js';
import { lightShort } from '../web/light-math.js';

const src = (file) => readFileSync(new URL(`../web/${file}`, import.meta.url), 'utf8');
const KEYS = ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'lights'];
const relay = (over = {}) => ({ address: 2, machines: KEYS.map((key) => ({ key, commanded: false, reported: false, running: false, status: 'off', ...over[key] })) });
const ac = { address: 3, commanded: {}, reported: { power: true, mode: 'cool', setpoint: 21.5, fan: 'auto' }, roomT: 22, errorCode: 0, status: 'on' };
const control = { auto: true, exchange: false, tLow: 21, tHigh: 23, rhLow: 90, rhHigh: 95, co2Low: 600, co2High: 900, co2Safety: 1250, exchangeEveryMin: 15, reasons: {} };
const crop = {
  crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', stageSince: 1, flush: 1, flushes: 4,
  days: { spawn: 21, pinning: 4, fruiting: 7, rest: 10 }, rampH: 4, autoAdvance: true, done: false, ramp: null, nextStage: null, targets: null,
  lightHours: { spawn: 0, pinning: 12, fruiting: 12, rest: 0 }, lightStart: '07:00',
};

// ---- Machines card ----

test('Machines card: a Lights row when fitted, none when not', () => {
  assert.equal(MACHINE_NAMES.lights, 'Lights');
  assert.deepEqual(shownMachines(relay({ lights: { status: 'not-fitted' } }).machines).map((m) => m.key), KEYS.slice(0, 5));
  assert.equal(shownMachines(relay().machines).at(-1).key, 'lights');
});

// ---- Room card: the lamp and the tile ----

test('drawing: the lights unit when fitted (on and off), none when not fitted or without a row', () => {
  const on = fromRoom({ machines: { relay: relay({ lights: { reported: true, running: true, status: 'on' } }), ac } });
  assert.deepEqual([on.units.lights.known, on.units.lights.on, on.units.lights.state], [true, true, 'On']);
  const off = fromRoom({ machines: { relay: relay(), ac } });
  assert.equal(off.units.lights.on, false);
  assert.equal(fromRoom({ machines: { relay: relay({ lights: { status: 'not-fitted', reported: null, running: null } }), ac } }).units.lights, null);
  assert.equal(fromRoom({}).units.lights, null);
  const v = view(on);
  assert.deepEqual([v.lights.name, v.lights.on], ['Lights', true]);
  assert.match(describe(v), /Lights on/);
  assert.equal(view(null).lights, null);
  assert.equal(view(off).lights.on, false);
});

test('drawing on the device page: lights on output 6 when the room has a lights power', () => {
  const room = { relay: 12, lightsW: 60, state: {}, acting: null };
  const dev = [{ address: 12, kind: 'relay', coils: [false, false, false, false, false, true], running: [false, false, false, false, false, true] }];
  assert.equal(fromSim(room, dev).units.lights.on, true);
  assert.equal(fromSim({ ...room, lightsW: 0 }, dev).units.lights, null);
  assert.equal(fromSim({ ...room, relay: null }, dev).units.lights.known, false);
});

test('the picture draws a lamp under the ceiling with its glow and light below while on', () => {
  const m = src('mimic.js');
  assert.match(m, /h\.lights = S\('g'/);
  assert.match(m, /class: 'light-cone'/);
  assert.match(m, /class: 'light-glow'/);
  assert.match(m, /h\.lights\.style\.display = v\.lights \? '' : 'none'/);
  assert.match(m, /h\.units\.lights\.classList\.toggle\('lit', Boolean\(v\.lights\?\.on\)\)|mark\('lights', v\.lights, v\.lights\.on\)/);
  const css = readFileSync(new URL('../web/mimic.css', import.meta.url), 'utf8');
  assert.match(css, /\.mimic-svg \.light-cone/);
  assert.match(css, /\.on \.light-cone|\.lit \.light-cone/);
});

test('tiles: Lights · Light for the crop after the circulation (before the exhaust), only when fitted', () => {
  const draw = fromRoom({ machines: { relay: relay({ lights: { reported: true, running: true, status: 'on' } }), ac } });
  const tiles = machineTiles(draw, control, null, crop);
  assert.deepEqual(tiles.map((t) => t.key), ['intake', 'ac', 'circ', 'lights', 'hu', 'dh', 'exhaust']);
  const t = tiles[3];
  assert.deepEqual([t.step, t.name, t.effect, t.on, t.pill.text, t.detail], [4, 'Lights', 'Light for the crop', true, 'On', '07:00–19:00']);
  assert.equal(machineTiles(draw, { ...control, auto: false }, null, crop)[3].detail, 'Set by hand');
  assert.equal(machineTiles(draw, control, null, null)[3].detail, 'No crop set');
  const unfitted = fromRoom({ machines: { relay: relay({ lights: { status: 'not-fitted' } }), ac } });
  assert.equal(machineTiles(unfitted, control, null, crop).some((x) => x.key === 'lights'), false);
  assert.equal(roomCard({ draw, control, crop }).machines[3].key, 'lights');
});

test('lightShort: the tile\'s schedule', () => {
  assert.equal(lightShort(crop), '07:00–19:00');
  assert.equal(lightShort({ ...crop, stage: 'rest' }), 'Off in this stage');
  assert.equal(lightShort({ ...crop, lightHours: { ...crop.lightHours, fruiting: 24 } }), 'All day');
  assert.equal(lightShort({ ...crop, crops: [] }), 'No crop set');
  assert.equal(lightShort(null), 'No crop set');
});

// ---- Climate tab ----

test('Climate: a Lighting group after Air circulation, its reason line shown when fitted', () => {
  assert.deepEqual(CONTROL_GROUPS.map((g) => g.key), ['co2', 't', 'rh', 'air', 'light']);
  assert.deepEqual(CONTROL_GROUPS.at(-1), { key: 'light', title: 'Lighting', fields: [], own: ['lightToday'], reasons: ['lights'], fitted: 'lights' });
  assert.deepEqual(REASONS.find((r) => r.key === 'lights'), { key: 'lights', label: 'Lights', fitted: 'lights' });
  assert.deepEqual(reasonsShown({ dehumidifier: false, lights: false }).map((r) => r.key), ['exchange', 'humidifier', 'ac', 'circulation']);
  assert.deepEqual(reasonsShown({ dehumidifier: true, lights: true }).map((r) => r.key), ['exchange', 'humidifier', 'dehumidifier', 'ac', 'circulation', 'lights']);
  assert.deepEqual(reasonsShown(null).map((r) => r.key), ['exchange', 'humidifier', 'ac', 'circulation']);
});

test('Climate: today\'s window and the link to the Crop tab', () => {
  assert.equal(lightingLine(crop), 'On 07:00–19:00 (12 h) for fruiting');
  assert.equal(lightingLine({ ...crop, farmType: 'full', stage: 'spawn' }), 'Off all day in the spawn run');
  assert.equal(lightingLine(null), 'Off: no crop set');
  assert.equal(CROP_TAB_LINK, 'Change the hours on the Crop tab');
  const card = src('control.js');
  assert.match(card, /CROP_TAB_LINK/);
  assert.match(card, /cropHref/);
  assert.match(card, /box\.hidden = /);
  assert.match(src('room-detail.js'), /createControl\(els\.controlHost, \{[\s\S]*cropHref: roomHash\(id, 'crop'\)/);
  assert.match(src('room-detail.js'), /control\?\.setCrop\(cropData\)/);
});

// ---- Crop tab ----

test('Crop: each stage\'s Targets gain a Light row', () => {
  const rows = stageTargets(crop.crops, 'fruiting', { hours: 12, start: '07:00' });
  assert.deepEqual(rows.at(-1), { key: 'light', name: 'Light', value: '12 h a day from 07:00' });
  assert.deepEqual(stageTargets(crop.crops, 'rest', { hours: 0, start: '07:00' }).at(-1).value, 'Off');
  assert.equal(stageTargets(crop.crops, 'fruiting').length, 4, 'without a schedule (an older server): no Light row');
  assert.deepEqual(stageTargets([], 'fruiting', { hours: 12, start: '07:00' }), []);
});

test('Crop: the form carries the light hours and start; checks and the body of what changed', () => {
  const f = formFromData(crop);
  assert.deepEqual(f.lightHours, { spawn: '0', pinning: '12', fruiting: '12', rest: '0' });
  assert.equal(f.lightStart, '07:00');
  assert.ok(FORM_FIELD_ORDER.includes('lightHours.fruiting') && FORM_FIELD_ORDER.includes('lightStart'));
  const ok = checkCropForm({ ...f, lightHours: { ...f.lightHours, fruiting: '10' }, lightStart: '06:30' });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(saveBody(ok.values, crop), { lightHours: { fruiting: 10 }, lightStart: '06:30' });
  const bad = checkCropForm({ ...f, lightHours: { ...f.lightHours, pinning: '25' }, lightStart: '7:00' });
  assert.equal(bad.errors['lightHours.pinning'], 'Light hours must be a whole number from 0 to 24');
  assert.equal(bad.errors.lightStart, 'Light start must be a time like 07:00');
  assert.deepEqual(saveBody(checkCropForm(f).values, crop), {}, 'nothing changed');
  // an older server without the schedule: the form leaves it out of the body
  const old = { ...crop };
  delete old.lightHours;
  delete old.lightStart;
  assert.deepEqual(saveBody(checkCropForm(formFromData(old)).values, old), {});
});

test('Crop card: the stage pencil edits its light hours, the program row has Lights from', () => {
  const card = src('crop-card.js');
  assert.match(card, /fieldOf\(`lightHours\.\$\{stage\}`, 'Light hours \(0–24\)'\)/);
  assert.match(card, /'Lights from'/);
  assert.match(card, /light: '/, 'an icon for the Light row');
  assert.match(card, /stageTargets\(c\.crops, sec\.stage, lightOf\(c, sec\.stage\)\)/);
});

// ---- room dialog ----

test('room dialog: Lights fitted in Machines, Lights power in Power and water (shown while fitted)', () => {
  assert.deepEqual(LIGHTS_RATINGS, [{ name: 'lightsW', label: 'Lights power', unit: 'W', def: 60, max: 5000, step: 1 }]);
  assert.equal(ratingTexts(null).lightsW, '60');
  assert.equal(ratingTexts({ lightsW: 90 }).lightsW, '90');
  const texts = { ...ratingTexts(null), lightsW: 'x' };
  assert.equal(parseRatings(texts, { lights: true }).errors.lightsW, 'Lights power must be a number from 0 to 5000 W');
  assert.equal(parseRatings(texts).values.lightsW, undefined, 'not fitted: a bad value is left out');
  assert.equal(parseRatings({ ...texts, lightsW: '120' }, { lights: true }).values.lightsW, 120);
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const machines = html.slice(html.indexOf('<legend>Machines'), html.indexOf('<legend>Power and water'));
  assert.match(machines, /<input id="f-lights" name="lights" type="checkbox"[^>]*> Lights fitted \(output 6 of the relay module\)/);
  const power = html.slice(html.indexOf('<legend>Power and water'), html.indexOf('<legend>Intake filter'));
  assert.match(power, /<div class="sizes two" id="lights-fields" hidden>[\s\S]*<label for="f-lightsW">Lights power \(W\)<\/label>/);
  const dialog = src('room-dialog.js');
  assert.match(dialog, /lights: lit/);
  assert.match(dialog, /inputs\.lights\.addEventListener\('change', updateLights\)/);
});

// ---- timeline, energy, simulation runs ----

test('timeline: a Lights row when fitted', () => {
  assert.deepEqual(TIMELINE_ROWS.map((r) => r.key), ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'lights', 'ac']);
  assert.deepEqual(wiredTimelineRows({ relayAddress: 3, acAddress: 4, lights: true }).map((r) => r.key), ['intake', 'exhaust', 'circulation', 'humidifier', 'lights', 'ac']);
  assert.deepEqual(wiredTimelineRows({ relayAddress: 3, acAddress: 4, lights: false }).map((r) => r.key), ['intake', 'exhaust', 'circulation', 'humidifier', 'ac']);
});

test('energy breakdown: a Lights row when fitted or when they used energy', () => {
  const day = (lights) => ({ date: '2026-10-26', kWh: 1, metered: false, byMachine: { intake: 0.1, exhaust: 0.1, circulation: 0.1, humidifier: 0.1, dehumidifier: 0, lights, ac: 0.5, rest: 0 } });
  assert.equal(breakdown([day(0)], 0.5).rows.some((r) => r.key === 'lights'), false);
  assert.equal(breakdown([day(0)], 0.5, { lights: true }).rows.find((r) => r.key === 'lights').label, 'Lights');
  assert.equal(breakdown([day(0.7)], 0.5).rows.find((r) => r.key === 'lights').kWh, 0.7);
});

test('simulation results: Lights in the energy table and the timeline when the run had them', () => {
  const input = { physics: {}, ctx: { ratings: { lights: true } } };
  const summary = { energy: { kWh: 2, byMachine: { intake: 0.5, exhaust: 0.5, circulation: 0, humidifier: 0, dehumidifier: 0, lights: 0.72, ac: 0.28 } }, water: {} };
  assert.equal(energyView(summary, input).rows.find((r) => r.key === 'lights').label, 'Lights');
  assert.equal(energyView({ ...summary, energy: { ...summary.energy, byMachine: { ...summary.energy.byMachine, lights: 0 } } }, { physics: {} }).rows.some((r) => r.key === 'lights'), false);
  const machines = { intake: [], exhaust: [], circulation: [], humidifier: [], dehumidifier: [], lights: [{ from: 25200, to: 68400 }], ac: [] };
  assert.equal(timelineRows(machines, 0, input).find((r) => r.key === 'lights').spans.length, 1);
  assert.equal(timelineRows({ ...machines, lights: [] }, 0, { physics: {} }).some((r) => r.key === 'lights'), false);
});
