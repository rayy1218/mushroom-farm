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

const apiErr = (error, details) => Object.assign(new Error(error), { name: 'ApiError', status: 400, error, details });

test('C11 plainError: known fields get their own line, the alert says where to look', () => {
  const labels = { block_count: 'Blocks', block_wet_kg: 'Wet weight per block' };
  assert.deepEqual(UI.plainError(apiErr('Invalid batch', ['block_count: required', 'block_wet_kg: must be a number from 0.1 to 10']), labels), {
    text: 'Check the marked fields.', fields: { block_count: 'Fill this in.', block_wet_kg: 'Must be a number from 0.1 to 10.' } });
  assert.deepEqual(UI.plainError(apiErr('Invalid batch', ['block_count: required']), labels), { text: 'Check the marked field.', fields: { block_count: 'Fill this in.' } });
  assert.deepEqual(UI.plainError(apiErr('Invalid batch', ['block_count: required', 'room_id: no such room']), labels), {
    text: 'Check the marked fields. Also: room_id: no such room', fields: { block_count: 'Fill this in.' } });
  // no known field: the old errorText line
  assert.deepEqual(UI.plainError(apiErr('Invalid batch', ['room_id: no such room']), labels), { text: 'Invalid batch: room_id: no such room', fields: {} });
  assert.deepEqual(UI.plainError(new Error('boom'), labels), { text: 'boom', fields: {} });
  assert.deepEqual(UI.plainError(apiErr('Unknown room', []), labels), { text: 'Unknown room', fields: {} });
  assert.deepEqual(UI.plainError(apiErr('X', ['kg: Too heavy!']), { kg: 'Kg' }), { text: 'Check the marked field.', fields: { kg: 'Too heavy!' } });
  // C3 room details have no colon: 'name must be 1 to 60 characters'
  assert.deepEqual(UI.plainError(apiErr('Invalid room', ['name must be 1 to 60 characters', 'volume must be a number from 5 to 5000 (m³)']), { name: 'Name', volume: 'Room size' }), {
    text: 'Check the marked fields.', fields: { name: 'Must be 1 to 60 characters.', volume: 'Must be a number from 5 to 5000 (m³).' } });
  assert.deepEqual(UI.plainError(apiErr('Invalid room', ['room 3 is archived']), { name: 'Name' }), { text: 'Invalid room: room 3 is archived', fields: {} });
});

test('C11 say: class, level, text, hidden when empty', () => {
  const classes = new Set();
  const el = { classList: { add: c => classes.add(c) }, dataset: {}, textContent: '', hidden: false };
  UI.say(el, 'error', 'Not saved.');
  assert.ok(classes.has('alert'));
  assert.equal(el.dataset.lvl, 'error');
  assert.equal(el.textContent, 'Not saved.');
  assert.equal(el.hidden, false);
  UI.say(el, 'info', '');
  assert.equal(el.hidden, true);
  UI.say(null, 'info', 'x'); // no element: nothing happens
});

test('C11 markFields: marks known fields, clears the others', () => {
  const ctl = () => ({ attrs: {}, setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; } });
  const box = key => {
    const c = ctl(); const kids = [];
    return { dataset: { field: key }, c, kids,
      querySelector: sel => (sel === '.field-err' ? kids[0] || null : null),
      querySelectorAll: () => [c],
      append(e) { kids.push(e); } };
  };
  const a = box('block_count'), b = box('strain');
  const root = { querySelectorAll: () => [a, b] };
  globalThis.document = { createElement: () => ({ className: '', textContent: '', hidden: false }) };
  UI.markFields(root, { block_count: 'Fill this in.' });
  assert.equal(a.kids[0].className, 'field-err');
  assert.equal(a.kids[0].textContent, 'Fill this in.');
  assert.equal(a.c.attrs['aria-invalid'], 'true');
  assert.equal(b.kids.length, 0);
  assert.equal(b.c.attrs['aria-invalid'], undefined);
  UI.markFields(root, {});
  assert.equal(a.kids[0].hidden, true);
  assert.equal(a.c.attrs['aria-invalid'], undefined);
  delete globalThis.document;
});

test('C12 plainChip: farmer words, unknown texts kept, chip not changed in place', () => {
  const c = { lvl: 'good', icon: '✓', text: 'In band' };
  assert.deepEqual(UI.plainChip('T', c), { lvl: 'good', icon: '✓', text: 'OK' });
  assert.equal(c.text, 'In band');
  assert.equal(UI.plainChip('T', { lvl: 'info', icon: '▲', text: 'Above band' }).text, 'A bit warm');
  assert.equal(UI.plainChip('RH', { lvl: 'warning', icon: '▼', text: 'Low alarm' }).text, 'Too dry');
  assert.equal(UI.plainChip('CO2', { lvl: 'good', icon: '✓', text: 'Below limit' }).text, 'Fresh air OK');
  assert.equal(UI.plainChip('CO2', { lvl: 'info', icon: '▲', text: 'Purging' }).text, 'Airing out');
  assert.equal(UI.plainChip('T', { lvl: 'serious', icon: '▼', text: 'Outside crop range' }).text, 'Too cold for this mushroom');
  assert.equal(UI.plainChip('T', { lvl: 'serious', icon: '▲', text: 'Outside crop range' }).text, 'Too hot for this mushroom');
  assert.equal(UI.plainChip('T', { lvl: 'info', icon: '?', text: 'Something new' }).text, 'Something new');
  assert.equal(UI.plainChip('T', null), null);
});

test('C12 pageHead: title, optional subtitle and actions', () => {
  const mk = tag => ({ tag, className: '', textContent: '', kids: [], append(...k) { this.kids.push(...k); } });
  globalThis.document = { createElement: mk };
  const h = UI.pageHead({ title: 'Rooms', sub: 'Your grow rooms.', actions: [{ tag: 'a' }] });
  assert.equal(h.tag, 'header'); assert.equal(h.className, 'page-head');
  assert.equal(h.kids[0].kids[0].textContent, 'Rooms');
  assert.equal(h.kids[0].kids[0].className, 'page-title');
  assert.equal(h.kids[0].kids[1].textContent, 'Your grow rooms.');
  assert.equal(h.kids[1].className, 'page-actions btn-row');
  const bare = UI.pageHead({ title: 'Settings' });
  assert.equal(bare.kids.length, 1); assert.equal(bare.kids[0].kids.length, 1);
  delete globalThis.document;
});

test('C12 roomStatus and manualText match the Rooms home rules (C11 5.1)', () => {
  const R = live => ({ live });
  const good = { lvl: 'good' }, info = { lvl: 'info' };
  assert.equal(UI.roomStatus(R(null)).text, 'Stopped');
  assert.equal(UI.roomStatus(R({ running: false, alarms: 0 })).lvl, 'serious');
  assert.equal(UI.roomStatus(R({ running: true, alarms: 1 })).text, '1 alarm');
  assert.equal(UI.roomStatus(R({ running: true, alarms: 3 })).text, '3 alarms');
  assert.deepEqual(UI.roomStatus(R({ running: true, alarms: 0, status: { T: info, RH: good, CO2: good } })), { lvl: 'warning', icon: '▲', text: 'Check room' });
  assert.equal(UI.roomStatus(R({ running: true, alarms: 0, status: { T: good, RH: good, CO2: info }, air: { state: 'purge' } })).text, 'All good');
  assert.equal(UI.roomStatus(R({ running: true, alarms: 0, status: { T: good, RH: good, CO2: info }, air: { state: 'idle' } })).text, 'Check room');
  assert.equal(UI.roomStatus(R({ running: true, alarms: 0, status: null })).text, 'All good');
  assert.equal(UI.manualText(['ac', 'hu']), 'Manual: Aircon, Mister');
  assert.equal(UI.manualText([]), '');
  assert.equal(UI.manualText(undefined), '');
});
