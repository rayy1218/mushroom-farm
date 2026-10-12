// web/mimic.js: FarmMimic.fromReading, the pure view of a DrawState, compareBars and create (contract C13 2 and 6.3).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../controller.js');
require('../web/ui.js');
require('../web/mimic.js');
const M = globalThis.FarmMimic;

const READING = { t: 1_760_000_000, T: 25.04, RH: 88.4, CO2: 640, t_out: 31.2, rh_out: 70, core: 27.44, ac_mode: 'cool', ac_setpoint: 25, fog: 2, air: 1, lights: 1, circ: 0, power_w: 432 };
const LIVE = { crop: 'oyster', stage: 'fruiting', blocks: 2000, manual: ['ac'], status: { T: { lvl: 'good', icon: '✓', text: 'In band' }, RH: { lvl: 'warning', icon: '▲', text: 'Above band' }, CO2: { lvl: 'good', icon: '✓', text: 'Below limit' } } };
const ROOM = { name: 'Room 1', volume: 60 };
const read = (over = {}) => M.fromReading({ reading: { ...READING, ...(over.reading || {}) }, live: { ...LIVE, ...(over.live || {}) }, room: ROOM, settings: { airM3h: 24 }, level: 'installer', ...(over.top || {}) });

test('API: create, layout, fromReading, view, compareBars', () => {
  for (const k of ['create', 'layout', 'fromReading', 'view', 'compareBars']) assert.equal(typeof M[k], 'function', k);
});

test('fromReading: null reading gives null; no arguments does not throw', () => {
  assert.equal(M.fromReading({ reading: null, live: LIVE, room: ROOM }), null);
  assert.equal(M.fromReading(), null);
});

test('fromReading: texts of the lines, numbers and units', () => {
  const d = read({ reading: { air: 0 } });
  assert.equal(d.title, 'Grey oyster · Fruiting');
  assert.equal(d.roomLine, 'Room 1 · 60 m³');
  assert.equal(d.airLine, 'Fresh air off');
  assert.equal(d.powerLine, 'Power now 432 W');
  assert.equal(d.blocks, '2,000 blocks');
  assert.equal(d.core, 'Core 27.4 °C');
  assert.deepEqual([d.T, d.RH, d.CO2], [25.04, 88.4, 640]);
  assert.deepEqual(d.out, { T: 31.2, RH: 70 });
  assert.equal(d.zones, null);
  assert.equal(d.stage, 'fruiting');
});

test('fromReading: the air line is changes an hour when the air is on', () => {
  const d = read();
  assert.equal(d.airLine, 'Fresh air 0.4 changes an hour');
  assert.equal(d.units.air.state, 'On · 24 m³/h');
  assert.equal(read({ top: { settings: null } }).airLine, 'Fresh air on');
});

test('fromReading: the power line gets the meter when the live has it', () => {
  assert.equal(read({ live: { kwhToday: 12.84 } }).powerLine, 'Power now 432 W · 12.8 kWh today');
  assert.equal(read({ reading: { power_w: 1500 } }).powerLine, 'Power now 1.50 kW');
  assert.equal(read({ reading: { power_w: null } }).powerLine, '');
});

test('fromReading: aircon on/off, run, state and the condenser', () => {
  let a = read().units;
  assert.deepEqual(a.ac, { on: true, run: 1, state: 'Cool 25.0 °C', sub: '', manual: true });
  assert.deepEqual(a.cond, { on: true, state: 'Running' });
  a = read({ reading: { power_w: 150 } }).units;
  assert.equal(a.ac.run, 0.3, '150 W is not above 150 W');
  assert.deepEqual(a.cond, { on: false, state: 'Idle' });
  a = read({ reading: { ac_mode: 'off', power_w: 20 } }).units;
  assert.deepEqual(a.ac, { on: false, run: 0.3, state: 'Off', sub: '', manual: true });
  assert.equal(read({ reading: { ac_mode: 'heat', ac_setpoint: 23.5 } }).units.ac.state, 'Heat 23.5 °C');
  assert.equal(read({ reading: { ac_mode: 'fan', ac_setpoint: 23.5 } }).units.ac.state, 'Fan only 23.5 °C');
});

test('fromReading: mister level is fog, state Level n or Off', () => {
  assert.deepEqual(read().units.hu, { level: 2, state: 'Level 2', sub: '', manual: false });
  assert.deepEqual(read({ reading: { fog: 0 } }).units.hu, { level: 0, state: 'Off', sub: '', manual: false });
});

test('fromReading: fresh air, positions from the settings when present, else intake high and exhaust low', () => {
  assert.deepEqual(read().units.air, { on: true, state: 'On · 24 m³/h', manual: false, inletAt: 'high', exhaustAt: 'low' });
  const d = read({ top: { settings: { airM3h: 24, inletAt: 'low', exhaustAt: 'high' } }, reading: { air: 0 } });
  assert.deepEqual(d.units.air, { on: false, state: 'Off · dampers closed', manual: false, inletAt: 'low', exhaustAt: 'high' });
});

test('fromReading: lights and circulation fan follow the reading', () => {
  const u = read().units;
  assert.deepEqual(u.lights, { on: true, state: 'Lights on', manual: false });
  assert.deepEqual(u.circ, { on: false, state: 'Off', manual: false });
  const v = read({ reading: { lights: 0, circ: 1 } }).units;
  assert.equal(v.lights.on, false); assert.equal(v.circ.on, true);
});

test('fromReading: manual comes from live.manual, per machine', () => {
  const u = read({ live: { manual: ['hu', 'air', 'lights', 'circ'] } }).units;
  assert.deepEqual([u.ac.manual, u.hu.manual, u.air.manual, u.lights.manual, u.circ.manual], [false, true, true, true, true]);
  assert.equal(read({ live: { manual: undefined } }).units.ac.manual, false);
});

test('fromReading: farmer level hides the codes and uses the plain words; installer keeps the controller words', () => {
  const f = read({ top: { level: 'farmer' } }), i = read();
  assert.equal(f.codes, false);
  assert.equal(i.codes, true);
  assert.equal(f.status.T.text, 'OK');
  assert.equal(f.status.RH.text, 'A bit wet');
  assert.equal(f.status.CO2.text, 'Fresh air OK');
  assert.equal(i.status.T.text, 'In band');
  assert.equal(f.status.RH.lvl, 'warning');
});

test('fromReading: status is null per key when the live has none', () => {
  assert.deepEqual(read({ live: { status: null } }).status, { T: null, RH: null, CO2: null });
});

test('fromReading: co2Rate from the block count', () => {
  assert.equal(read({ live: { blocks: 0 } }).co2Rate, 0);
  assert.equal(read({ live: { blocks: 1000 } }).co2Rate, 0.5);
  assert.equal(read({ live: { blocks: 2000 } }).co2Rate, 1);
  assert.equal(read({ live: { blocks: 5000 } }).co2Rate, 1);
  const none = read({ live: { blocks: null } });
  assert.equal(none.co2Rate, 0); assert.equal(none.blocks, '');
});

test('fromReading: night is 19:00 to 07:00 farm time (UTC+8)', () => {
  const at = h => Date.UTC(2026, 9, 12, h - 8, 0, 0) / 1000;
  const night = h => read({ reading: { t: at(h) } }).night;
  assert.equal(night(18), false);
  assert.equal(night(19), true);
  assert.equal(night(23), true);
  assert.equal(night(0), true);
  assert.equal(night(6), true);
  assert.equal(night(7), false);
  assert.equal(night(12), false);
});

test('fromReading: missing outdoor numbers, core, room and stage do not throw', () => {
  const d = M.fromReading({ reading: { t: 1, ac_mode: 'off', fog: 0, air: 0, lights: 0, circ: 0 }, live: null, room: null, settings: null });
  assert.equal(d.out, null);
  assert.equal(d.core, '');
  assert.equal(d.roomLine, '');
  assert.equal(d.title, '');
  assert.deepEqual([d.T, d.RH, d.CO2], [null, null, null]);
  assert.equal(d.powerLine, '');
  assert.equal(d.stage, null);
  assert.doesNotThrow(() => M.view(d));
});

test('fromReading is pure: the inputs are not changed', () => {
  const reading = { ...READING }, live = { ...LIVE, manual: ['ac'] }, settings = { airM3h: 24 };
  const snap = JSON.stringify([reading, live, settings]);
  M.fromReading({ reading, live, room: ROOM, settings, level: 'farmer' });
  assert.equal(JSON.stringify([reading, live, settings]), snap);
});

test('view: null, empty and unknown parts become dashes, never throw', () => {
  for (const s of [null, undefined, {}, { units: { ac: null, air: {} }, status: { T: null }, out: null }]) {
    const v = M.view(s);
    assert.equal(v.readouts.mT.val, '--');
    assert.equal(v.readouts.mRH.val, '--');
    assert.equal(v.readouts.mC.val, '--');
    assert.equal(v.outT, '--');
    assert.equal(v.acState, '--');
    assert.equal(v.huState, '--');
    assert.equal(v.circState, '--');
    assert.equal(v.lampText, '--');
    assert.equal(v.readouts.mT.lvl, 'none');
    assert.equal(v.co2Rate, 0);
  }
});

test('view: texts are drawn as given, units on the readouts, zones only when given', () => {
  const v = M.view({ T: 25.04, RH: 88.4, CO2: 640, status: { T: { lvl: 'good', icon: '✓', text: 'OK' } }, zones: { lo: { T: 24, RH: 85, C: 700 }, hi: { T: 26, RH: 90, C: 600 } },
    title: 'A · B', note: 'door open', roomLine: 'R', airLine: 'AL', powerLine: 'PL', units: { ac: { on: true, run: 0.5, state: 'S', sub: 'W' } } });
  assert.deepEqual(v.readouts.mT, { val: '25.0 °C', ico: '✓', lvl: 'good', zn: 'low 24.0 · high 26.0' });
  assert.equal(v.readouts.mRH.val, '88 % RH');
  assert.equal(v.readouts.mC.val, '640 ppm');
  assert.equal(v.readouts.mC.zn, 'low 700 · high 600');
  assert.equal(M.view({ T: 1 }).readouts.mT.zn, '');
  assert.equal(M.view({ T: 1, status: { T: { lvl: 'good', icon: '✓', text: 'OK' } } }).readouts.mT.zn, 'OK', 'no zones: the chip words');
  assert.deepEqual([v.title, v.note, v.roomLine, v.airLine, v.powerLine, v.acState, v.acSub], ['A · B', 'door open', 'R', 'AL', 'PL', 'S', 'W']);
});

test('view: codes true shows the codes, false the plain names and no sensor bubbles', () => {
  const on = M.view({ codes: true }), dflt = M.view({}), off = M.view({ codes: false });
  assert.deepEqual([on.acTag, on.huTag, on.circTag, on.inlet.tag, on.outlet.tag, on.codes], ['ACU-201', 'HU-202', 'CF-205', 'SF-203', 'EF-206', true]);
  assert.deepEqual(dflt.acTag, 'ACU-201', 'codes default to shown (the bench)');
  assert.deepEqual([off.acTag, off.huTag, off.circTag, off.inlet.tag, off.outlet.tag, off.codes], ['Aircon', 'Mister', 'Fan', 'Fresh-air in', 'Fresh-air out', false]);
  assert.equal(on.outEye, 'OUTDOOR · OT-104');
  assert.equal(off.outEye, 'OUTDOOR');
  assert.equal(on.inlet.label, 'Filtered intake');
  assert.equal(off.inlet.label, '');
});

test('view: manual tags and on flags per unit', () => {
  const v = M.view({ units: { ac: { on: true, run: 0.6, manual: true }, hu: { level: 2, manual: true }, air: { on: true, manual: true }, circ: { on: true }, lights: { manual: true } } });
  assert.deepEqual(v.manual, { ac: true, hu: true, air: true, circ: false, lights: true });
  assert.deepEqual(v.on, { ac: true, cond: false, hu: true, air: true, circ: true, lights: false });
});

test('view: the fan positions follow the air unit, the compressor follows the condenser', () => {
  const v = M.view({ units: { air: { on: false, inletAt: 'low', exhaustAt: 'high' }, ac: { on: true, run: 0.4 }, cond: { on: false } } });
  assert.deepEqual([v.inlet.band, v.outlet.band], ['low', 'high']);
  assert.equal(v.comp, false);
  assert.equal(M.view({ units: { ac: { on: true, run: 0.4 } } }).comp, true, 'no condenser: the run says it');
});

test('view: animation inputs are clamped', () => {
  const v = M.view({ co2Rate: 4, units: { hu: { level: 9 }, ac: { on: true, run: 3 } }, stage: 'pinning' });
  assert.equal(v.co2Rate, 1); assert.equal(v.fogF, 1); assert.equal(v.acRun, 1); assert.equal(v.capScale, 0.35);
  assert.equal(M.view({ stage: 'x' }).capScale, 0);
});

test('compareBars: change from your rules, better and worse, and "same" under 0.5', () => {
  const mine = { inT: 90, inRH: 80, total: 10 };
  const [a] = M.compareBars(mine, [{ name: 'No humidity priority', x: { inT: 92, inRH: 70, total: 10.2 } }]);
  assert.equal(a.name, 'No humidity priority');
  assert.equal(a.same, false);
  assert.deepEqual(a.rows.map(r => [r.key, r.verdict]), [['inT', 'better'], ['inRH', 'worse'], ['kwh', 'same']]);
  assert.equal(a.rows[0].delta, 2); assert.equal(a.rows[0].unit, 'points'); assert.equal(a.rows[2].unit, 'kWh');
});

test('compareBars: less energy is better, more is worse', () => {
  const mine = { inT: 90, inRH: 80, total: 10 };
  const [a, b] = M.compareBars(mine, [{ name: 'a', x: { ...mine, total: 9 } }, { name: 'b', x: { ...mine, total: 11 } }]);
  assert.equal(a.rows[2].verdict, 'better'); assert.equal(b.rows[2].verdict, 'worse');
});

test('compareBars: every change under 0.5 is "No difference"; 0.5 itself counts', () => {
  const mine = { inT: 90, inRH: 80, total: 10 };
  assert.equal(M.compareBars(mine, [{ name: 'x', x: { inT: 90.4, inRH: 79.6, total: 10.49 } }])[0].same, true);
  assert.equal(M.compareBars(mine, [{ name: 'x', x: { inT: 90.5, inRH: 80, total: 10 } }])[0].same, false);
  assert.deepEqual(M.compareBars(mine, []), []);
});

// create(): the drawing is a string the browser parses, so here only its ids are checked (the rest is checked in the browser).
const markupOf = pfx => {
  let html = '';
  try { M.create({ insertAdjacentHTML: (_where, h) => { html = h; throw new Error('stop'); } }, { idPrefix: pfx }); } catch (e) { assert.equal(e.message, 'stop'); }
  return html;
};
const idsOf = h => [...h.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);

test('create: every id and url() reference carries the idPrefix, so two drawings can share a page', () => {
  const a = markupOf('rm-'), b = markupOf('');
  assert.ok(idsOf(a).length > 40);
  assert.ok(idsOf(a).every(i => i.startsWith('rm-')), 'every id carries the prefix');
  assert.ok(idsOf(b).every(i => !i.startsWith('rm-')));
  assert.ok(a.includes('url(#rm-hatch)') && a.includes('url(#rm-arAc)') && a.includes('aria-labelledby="rm-mimicTitle rm-mimicDesc"'));
  assert.ok(!/url\(#(?!rm-)/.test(a));
  assert.equal(new Set(idsOf(a)).size, idsOf(a).length, 'ids are unique inside one drawing');
  assert.deepEqual(idsOf(a).map(i => i.slice(3)), idsOf(b), 'the prefixed drawing has the same ids as the plain one');
});
