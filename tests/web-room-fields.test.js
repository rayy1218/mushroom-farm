// Every room field in one place (spec 2026-10-26-room-profile-equipment-design.md section 4): the Add room dialog and the
// room page's Room profile and Equipment tabs build their inputs and check them from web/room-fields.js. The ranges, defaults
// and words are the server's (server/rooms.js): compared here field by field.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRoom, RATINGS, FILTER, NAME_MAX as SERVER_NAME_MAX } from '../server/rooms.js';
import {
  ROOM_GROUPS, ROOM_FIELDS, NAME_MAX, PROFILE_NAMES, EQUIPMENT_NAMES, fieldsOf, fieldLabel, fieldTexts, parseRoomFields,
  roomBody, isShown, volumeText,
} from '../web/room-fields.js';

const field = (name) => ROOM_FIELDS.find((f) => f.name === name);
// A good room as the server keeps it (GET /api/rooms/:id), with what the page does not edit.
const ROOM = {
  id: 7, name: 'Room 1', length: 4, width: 3, height: 2.5, volume: 30, createdAt: 1, filterChangedAt: 2,
  trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4, meterAddress: null, dpAddress: 9,
  intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050,
  dehumidifierW: 380, dehumidifierLday: 20, lightsW: 60, dehumidifier: false, lights: true,
  fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30,
};

test('the groups, in the order of the dialog and the tabs, and each field in one of them', () => {
  assert.deepEqual(ROOM_GROUPS.map((g) => [g.key, g.title]), [
    ['profile', 'Room profile'],
    ['sensors', 'Sensors (Modbus address)'],
    ['machines', 'Machines'],
    ['power', 'Power and water (for the usage estimates)'],
    ['filter', 'Intake filter'],
  ]);
  assert.deepEqual(fieldsOf('profile').map((f) => f.name), ['name', 'length', 'width', 'height']);
  assert.deepEqual(fieldsOf('sensors').map((f) => f.name), ['trhAddress', 'co2Address', 'meterAddress', 'dpAddress']);
  assert.deepEqual(fieldsOf('machines').map((f) => f.name), ['relayAddress', 'acAddress', 'dehumidifier', 'lights']);
  assert.deepEqual(fieldsOf('power').map((f) => f.name), ['intakeW', 'exhaustW', 'circulationW', 'humidifierW', 'humidifierLH', 'acInputW', 'dehumidifierW', 'dehumidifierLday', 'lightsW']);
  assert.deepEqual(fieldsOf('filter').map((f) => f.name), ['fanMaxPa', 'filterCleanPa', 'filterFinalPa', 'filterChangeDays']);
  assert.deepEqual(PROFILE_NAMES, ['name', 'length', 'width', 'height']);
  assert.equal(EQUIPMENT_NAMES.length + PROFILE_NAMES.length, ROOM_FIELDS.length);
  // The gateway is set on the Equipment tab only: its group is none of the dialog's.
  assert.deepEqual(ROOM_FIELDS.filter((f) => !ROOM_GROUPS.some((g) => g.key === f.group)).map((f) => [f.name, f.group]), [['gateway', 'gateway']]);
});

test('the ranges and defaults are the server\'s', () => {
  assert.equal(NAME_MAX, SERVER_NAME_MAX);
  for (const r of RATINGS) {
    const f = field(r.field);
    assert.deepEqual([f.label, f.unit, f.def, f.min, f.max], [r.label, r.unit, r.default, r.min, r.max], r.field);
  }
  for (const r of FILTER) {
    const f = field(r.field);
    assert.deepEqual([f.label, f.unit, f.def, f.min, f.max], [r.label, r.unit, r.default, r.min, r.max], r.field);
  }
  assert.deepEqual(['length', 'width', 'height'].map((n) => [field(n).min, field(n).max]), [[0.5, 100], [0.5, 100], [0.5, 10]]);
});

test('every wrong value gets the server\'s words', () => {
  const texts = fieldTexts(ROOM);
  // A wrong value per field, as typed and as the server would get it.
  const BAD = {
    name: ['', ''], length: ['0.4', 0.4], width: ['101', 101], height: ['10.5', 10.5],
    trhAddress: ['0', 0], co2Address: ['248', 248], relayAddress: ['1.5', 1.5], acAddress: ['-1', -1], meterAddress: ['300', 300], dpAddress: ['0', 0],
    intakeW: ['5001', 5001], exhaustW: ['-1', -1], circulationW: ['5000.5', 5000.5], humidifierW: ['9999', 9999], humidifierLH: ['100.5', 100.5],
    acInputW: ['20001', 20001], dehumidifierW: ['5001', 5001], dehumidifierLday: ['201', 201], lightsW: ['5001', 5001],
    fanMaxPa: ['10', 10], filterCleanPa: ['1001', 1001], filterFinalPa: ['2001', 2001], filterChangeDays: ['366', 366],
  };
  const body = roomBody(ROOM, parseRoomFields(texts).values);
  for (const [name, [typed, sent]] of Object.entries(BAD)) {
    const mine = parseRoomFields({ ...texts, dehumidifier: true, lights: true, [name]: typed }).errors?.[name];
    const server = validateRoom({ ...body, dehumidifier: true, lights: true, [name]: sent });
    assert.equal(server.field, name, `the server blames ${name}`);
    assert.equal(mine, server.error, name);
  }
  assert.equal(parseRoomFields({ ...texts, name: 'x'.repeat(61) }).errors.name, validateRoom({ ...body, name: 'x'.repeat(61) }).error);
});

test('the filter pairs and the address clashes, as the server says them', () => {
  const texts = fieldTexts(ROOM);
  const body = roomBody(ROOM, parseRoomFields(texts).values);
  const cases = [
    [{ fanMaxPa: '40' }, { fanMaxPa: 40 }, 'fanMaxPa'],
    [{ filterFinalPa: '30' }, { filterFinalPa: 30 }, 'filterFinalPa'],
    [{ filterFinalPa: '200' }, { filterFinalPa: 200 }, 'filterFinalPa'],
    [{ co2Address: '1' }, { co2Address: 1 }, 'co2Address'],
    [{ dpAddress: '3' }, { dpAddress: 3 }, 'dpAddress'],
    [{ acAddress: '2' }, { acAddress: 2 }, 'acAddress'],
  ];
  for (const [typed, sent, name] of cases) {
    const server = validateRoom({ ...body, ...sent });
    assert.equal(server.field, name);
    assert.deepEqual(parseRoomFields({ ...texts, ...typed }).errors, { [name]: server.error }, JSON.stringify(typed));
  }
  assert.equal(parseRoomFields({ ...texts, trhAddress: '', co2Address: '', meterAddress: '', dpAddress: '', relayAddress: '', acAddress: '' }).errors, undefined, 'blanks do not clash');
});

test('texts: the room\'s values; a new room: blank sizes and addresses, the default ratings and filter settings', () => {
  const t = fieldTexts(ROOM);
  assert.deepEqual([t.name, t.length, t.height, t.trhAddress, t.meterAddress, t.humidifierLH, t.lights, t.dehumidifier], ['Room 1', '4', '2.5', '1', '', '2', true, false]);
  const fresh = fieldTexts(null);
  assert.deepEqual([fresh.name, fresh.length, fresh.trhAddress, fresh.intakeW, fresh.acInputW, fresh.fanMaxPa, fresh.filterChangeDays, fresh.lights],
    ['', '', '', '60', '1050', '200', '30', false]);
  assert.equal(fieldTexts({ ...ROOM, acInputW: null }).acInputW, '1050', 'a missing rating: the default');
});

test('parse: the values to send, only of the fields asked for', () => {
  assert.deepEqual(parseRoomFields({ name: '  Room 2 ', length: '5', width: '4.5', height: '3' }, PROFILE_NAMES),
    { values: { name: 'Room 2', length: 5, width: 4.5, height: 3 } });
  const { values } = parseRoomFields(fieldTexts(ROOM), EQUIPMENT_NAMES);
  assert.equal(values.name, undefined);
  assert.deepEqual([values.trhAddress, values.meterAddress, values.dehumidifier, values.lights, values.humidifierLH, values.filterChangeDays], [1, null, false, true, 2, 30]);
});

test('a fitted machine\'s ratings are checked only while it is fitted; otherwise a bad one is left out (the room keeps its own)', () => {
  const texts = { ...fieldTexts(ROOM), dehumidifier: false, dehumidifierW: 'x', lights: false, lightsW: '' };
  const { values } = parseRoomFields(texts, EQUIPMENT_NAMES);
  assert.equal('dehumidifierW' in values, false);
  assert.equal('lightsW' in values, false);
  assert.equal(values.dehumidifierLday, 20, 'a good one is sent');
  assert.deepEqual(Object.keys(parseRoomFields({ ...texts, dehumidifier: true, lights: true }, EQUIPMENT_NAMES).errors), ['dehumidifierW', 'lightsW']);
  assert.equal(roomBody(ROOM, values).dehumidifierW, 380, 'merged: the stored value');
  assert.equal(isShown(field('dehumidifierW'), texts), false);
  assert.equal(isShown(field('lightsW'), { lights: true }), true);
  assert.equal(isShown(field('intakeW'), texts), true);
});

test('the body sent: every room field, the tab\'s values over the loaded room, nothing else', () => {
  const body = roomBody(ROOM, { name: 'Room 9', length: 6 });
  assert.deepEqual(Object.keys(body), ROOM_FIELDS.map((f) => f.name));
  assert.equal(body.name, 'Room 9');
  assert.equal(body.length, 6);
  assert.equal(body.width, 3);
  assert.equal(body.dpAddress, 9);
  assert.equal(body.lights, true);
  assert.equal(body.fanMaxPa, 200);
  assert.equal('id' in body || 'volume' in body || 'filterChangedAt' in body, false);
  assert.deepEqual(validateRoom(body).room.name, 'Room 9', 'the server takes it');
  const added = roomBody(null, parseRoomFields({ ...fieldTexts(null), name: 'New', length: '2', width: '2', height: '2' }).values);
  assert.equal(validateRoom(added).error, undefined, 'a new room with the defaults is good');
  assert.equal(added.trhAddress, null);
  assert.equal(added.dehumidifier, false);
});

test('labels: the unit in brackets, the hint of the reminder; boxes and addresses as they are', () => {
  assert.equal(fieldLabel(field('name')), 'Name');
  assert.equal(fieldLabel(field('height')), 'Height (m)');
  assert.equal(fieldLabel(field('trhAddress')), 'T/RH probe');
  assert.equal(fieldLabel(field('intakeW')), 'Intake fan power (W)');
  assert.equal(fieldLabel(field('humidifierLH')), 'Humidifier output (L/h)');
  assert.equal(fieldLabel(field('filterChangeDays')), 'Change the filter every (days, 0: no reminder)');
  assert.equal(fieldLabel(field('dehumidifier')), 'Dehumidifier fitted (output 5 of the relay module)');
  assert.equal(fieldLabel(field('lights')), 'Lights fitted (output 6 of the relay module)');
});

test('the volume, worked out live from the three sizes', () => {
  assert.match(volumeText({ length: '4', width: '3', height: '2.5' }), /^Volume: 30[.,]0 m³$/);
  // nothing until the three sizes are given (critique 2026-10-29c: Add room opened on "Volume: — m³")
  assert.equal(volumeText({ length: '4', width: '', height: '2.5' }), '');
  assert.equal(volumeText({ length: 'x', width: '3', height: '2.5' }), '');
  assert.equal(volumeText({}), '');
});

// The browser checks step before the form's own check runs, so a rating of 62.5 W must not be blocked by the markup.
test('ratings take two decimals, and their inputs any step', () => {
  const { values } = parseRoomFields({ ...fieldTexts(ROOM), intakeW: '62.5', humidifierLH: '2.25', acInputW: '1050.75' }, EQUIPMENT_NAMES);
  assert.deepEqual([values.intakeW, values.humidifierLH, values.acInputW], [62.5, 2.25, 1050.75]);
  assert.equal(parseRoomFields({ ...fieldTexts(ROOM), intakeW: '62.125' }, EQUIPMENT_NAMES).errors.intakeW, 'Intake fan power must be a number from 0 to 5000 W');
  const form = readFileSync(new URL('../web/room-form.js', import.meta.url), 'utf8');
  assert.match(form, /rating: \(f\) => \(\{ min: f\.min, max: f\.max, step: 'any',/);
});
