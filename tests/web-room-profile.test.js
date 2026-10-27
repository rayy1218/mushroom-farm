// The Room profile and Equipment tabs instead of the Edit dialog (spec 2026-10-26-room-profile-equipment-design.md): the Add
// room dialog and both tabs build their inputs from web/room-fields.js; the room page has no Edit button; the Rooms list's Edit
// opens the Room profile tab. Source checks, like the other page tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');

test('the Add room dialog: every field built from the shared definitions, checked with them, a POST of the whole room', () => {
  const html = src('index.html');
  const dialog = html.slice(html.indexOf('<dialog id="room-dialog"'), html.indexOf('</dialog>', html.indexOf('<dialog id="room-dialog"')));
  assert.match(dialog, /<form id="room-form" novalidate>/);
  assert.match(dialog, /<h2 id="room-title">Add room<\/h2>/);
  assert.match(dialog, /<div id="room-fields"><\/div>/);
  assert.doesNotMatch(dialog, /<input/, 'no inputs written by hand');
  const js = src('room-dialog.js');
  assert.match(js, /import \{ ROOM_GROUPS, fieldTexts, parseRoomFields, roomBody \} from '\.\/room-fields\.js';/);
  assert.match(js, /import \{ createRoomForm \} from '\.\/room-form\.js';/);
  assert.match(js, /createRoomForm\(ROOM_GROUPS, \{ idPrefix: 'f-' \}\)/);
  assert.match(js, /request\('POST', '\/api\/rooms', roomBody\(null, checked\.values\)\)/);
  assert.doesNotMatch(js, /'PUT'/, 'the dialog only adds');
});

test('the shared inputs: a fitted machine\'s ratings follow its box, a bad number is not read as blank, errors under the fields', () => {
  const js = src('room-form.js');
  assert.match(js, /import \{ fieldsOf, fieldLabel, isShown, volumeText, NAME_MAX \} from '\.\/room-fields\.js';/);
  assert.match(js, /wrap\.hidden = !isShown\(f, t\)/);
  assert.match(js, /input\.validity\?\.badInput \? '\?' : input\.value/);
  assert.match(js, /input\.setAttribute\('aria-invalid', 'true'\)/);
  assert.match(js, /input\.setAttribute\('aria-describedby', err\.id\)/);
});

const page = src('room-detail.js');
const template = page.slice(page.indexOf('const TEMPLATE'), page.indexOf('`;', page.indexOf('const TEMPLATE')));

test('the room page has no Edit button and no Edit dialog: the two tabs replace them', () => {
  assert.doesNotMatch(template, /data-edit|>Edit</);
  assert.doesNotMatch(page, /room-dialog\.js|openRoomDialog/);
  assert.doesNotMatch(page, /'Edit room'/);
});

test('the Rooms list: Edit opens the room\'s Room profile tab, Add room the dialog', () => {
  const list = src('rooms-list.js');
  assert.match(list, /if \(b\.dataset\.action === 'edit'\) location\.hash = roomHash\(room\.id, 'profile'\);/);
  assert.match(list, /openRoomDialog\(\{ onSaved: /);
  assert.match(list, /els\.add\.addEventListener\('click', openAdd\);/);
});

test('the two tabs: the profile fields in one card, the equipment in four, each tab its own form with one Save and Reset', () => {
  assert.match(page, /import \{ createRoomEdit, createDeleteCard \} from '\.\/room-edit\.js';/);
  assert.match(page, /createRoomEdit\(els\.profileHost, \{ roomId: id, groups: \['profile'\], idPrefix: 'rp-'/);
  assert.match(page, /createRoomEdit\(els\.equipmentHost, \{ roomId: id, groups: \['sensors', 'machines', 'power', 'filter'\], idPrefix: 're-'/);
  assert.match(page, /profileTab\.update\(room\);\n\s*equipmentTab\.update\(room\);/);
  const edit = src('room-edit.js');
  assert.match(edit, /import \{ ROOM_GROUPS, fieldsOf, fieldTexts, parseRoomFields, roomBody \} from '\.\/room-fields\.js';/);
  assert.match(edit, /import \{ createRoomForm \} from '\.\/room-form\.js';/);
  assert.match(edit, /const names = groups\.flatMap\(\(key\) => fieldsOf\(key\)\.map\(\(f\) => f\.name\)\);/);
  assert.match(edit, /parseRoomFields\(fields\.texts\(\), names\)/);
  // PUT replaces what is left out: the tab's values go over the loaded room.
  assert.match(edit, /request\('PUT', `\/api\/rooms\/\$\{roomId\}`, roomBody\(loaded, checked\.values\), SAVE_TIMEOUT\)/);
  assert.match(edit, /reset\.hidden = !dirty;/);
});

test('a refresh never replaces what the person is editing or has edited and not saved (like the Crop card)', () => {
  const edit = src('room-edit.js');
  assert.match(edit, /const holding = dirty \|\| saving \|\| form\.contains\(document\.activeElement\);\n\s*if \(!holding\) fields\.fill\(fieldTexts\(room\)\);/);
  assert.match(edit, /loaded = room;/, 'the room is kept: a Save sends the newest one');
});

test('Delete room: a danger button, the Rooms list\'s confirm, then the Rooms list', () => {
  const edit = src('room-edit.js');
  assert.match(edit, /deleteText\.textContent = `Delete \$\{room\.name\}\? This can't be undone\.`;/);
  assert.match(edit, /button\('Delete room', 'danger'\)/);
  assert.match(edit, /await request\('DELETE', `\/api\/rooms\/\$\{roomId\}`\);/);
  assert.match(edit, /location\.hash = '#\/rooms';/);
  assert.match(page, /createDeleteCard\(els\.deleteHost, \{ roomId: id, getRoom: \(\) => room, onGone: /);
});

test('"Set address" on a sensor or machine without one opens the Equipment tab at that field', () => {
  assert.match(page, /pendingField = field;\n\s*location\.hash = roomHash\(id, 'equipment'\);/);
  assert.match(page, /if \(tab === 'equipment' && pendingField\)/);
  const machines = src('machines.js');
  assert.match(machines, /notWired\('No relay module address set', \(\) => onEdit\('relayAddress'\)\)/);
  assert.match(machines, /notWired\('No aircon gateway address set', \(\) => onEdit\('acAddress'\)\)/);
  assert.match(machines, /button\('Set address'\)/);
});
