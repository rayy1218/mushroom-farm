// The Room profile and Equipment tabs instead of the Edit dialog (spec 2026-10-26-room-profile-equipment-design.md; the
// Equipment tab's cards: 2026-10-27-equipment-cards-design.md): the Add room dialog and both tabs build their inputs from
// web/room-fields.js; the room page has no Edit button; the Rooms list's Edit opens the Room profile tab. Source checks, like
// the other page tests.

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
  assert.match(js, /import \{ ROOM_FIELDS, fieldsOf, fieldLabel, isShown, volumeText, NAME_MAX \} from '\.\/room-fields\.js';/);
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

test('the Room profile tab: the profile fields in one card, its own form with one Save and Reset', () => {
  assert.match(page, /import \{ createRoomEdit, createDeleteCard, createSaveQueue \} from '\.\/room-edit\.js';/);
  assert.match(page, /queue: createSaveQueue\(\), /, 'one save queue for both tabs');
  assert.match(page, /createRoomEdit\(els\.profileHost, \{ roomId: id, groups: \['profile'\], idPrefix: 'rp-'/);
  assert.match(page, /profileTab\.update\(room\);\n\s*equipmentTab\.update\(room, \{ sensors, machines: machineData \?\? lastMachines \}\);/);
  const edit = src('room-edit.js');
  assert.match(edit, /import \{ ROOM_GROUPS, fieldsOf, fieldTexts, parseRoomFields, roomBody \} from '\.\/room-fields\.js';/);
  assert.match(edit, /import \{ createRoomForm \} from '\.\/room-form\.js';/);
  assert.match(edit, /const names = groups\.flatMap\(\(key\) => fieldsOf\(key\)\.map\(\(f\) => f\.name\)\);/);
  assert.match(edit, /check: \(texts\) => parseRoomFields\(texts, names\)/);
  assert.match(edit, /const checked = check\(fields\.texts\(\), loaded\);/);
  // PUT replaces what is left out: the form's values go over the loaded room.
  assert.match(edit, /const now = check\(fields\.texts\(\), loaded\);\n\s*if \(now\.errors\) return now;\n\s*const room = await request\('PUT', `\/api\/rooms\/\$\{roomId\}`, roomBody\(loaded, now\.values\), SAVE_TIMEOUT\)/);
  assert.match(edit, /reset\.hidden = !dirty;/);
  assert.match(edit, /if \(saveWhenDirty\) sendRow\.hidden = !dirty;/, 'only the Equipment cards hide their Save');
});

test('a refresh never replaces what the person is editing or has edited and not saved (like the Crop card)', () => {
  const edit = src('room-edit.js');
  assert.match(edit, /const holding = dirty \|\| saving \|\| form\.contains\(document\.activeElement\);\n\s*if \(!holding\) fill\(room\);/);
  assert.match(edit, /loaded = room;/, 'the room is kept: a Save sends the newest one');
});

test('a Save with nothing changed sends nothing: it shows the newest room instead of writing old values over it', () => {
  const edit = src('room-edit.js');
  assert.match(edit, /if \(!dirty\) \{\n\s*fill\(loaded\);\n\s*return;\n\s*\}\n\s*const showChecks/);
  assert.match(edit, /function fill\(room\) \{\n\s*fields\.fill\(fieldTexts\(room\)\);/);
});

test('while saving the Save and Reset only look disabled, so the cursor stays on the Save (a disabled button loses it to the page)', () => {
  const edit = src('room-edit.js');
  assert.doesNotMatch(edit, /(save|reset)\.disabled = /);
  assert.match(edit, /if \(on\) b\.setAttribute\('aria-disabled', 'true'\);/);
  assert.match(edit, /reset\.addEventListener\('click', \(\) => \{\n\s*if \(saving\) return;/);
  assert.match(edit, /if \(saving \|\| !loaded\) return;/, 'a second submit while saving does nothing');
  assert.match(src('styles.css'), /button:disabled, button\[aria-disabled="true"\] \{ opacity: 0\.55;/);
});

test('the Equipment tab: two sections of cards, one form per card with its own Save, its values over the newest room', () => {
  assert.match(template, /<div class="equipment" data-equipment><\/div>/);
  assert.match(page, /import \{ createEquipment \} from '\.\/equipment\.js';/);
  assert.match(page, /equipmentTab = createEquipment\(els\.equipmentHost, \{ roomId: id, idPrefix: 're-', \.\.\.saved \}\);/);
  const eq = src('equipment.js');
  assert.match(eq, /import \{ createEditForm \} from '\.\/room-edit\.js';/);
  assert.match(eq, /for \(const s of EQUIPMENT_SECTIONS\)/);
  assert.match(eq, /const form = el\('form', 'card eq-card'\);\n\s*form\.noValidate = true;/);
  assert.match(eq, /groups: \[cardGroup\(c\)\],/);
  assert.match(eq, /check: \(texts, room\) => parseCard\(c, texts, room\),/);
  assert.match(eq, /saveWhenDirty: true,/);
  // After a save the other cards take the saved room; one holding an unsent edit keeps it (createEditForm's update).
  assert.match(eq, /for \(const \[key, other\] of cards\) if \(key !== c\.key\) other\.edit\.update\(room\);/);
  assert.match(eq, /form\.classList\.toggle\('unfitted', unfitted\);/);
  assert.match(eq, /const c = cardOf\(name\);\n\s*if \(c\) cards\.get\(c\.key\)\.edit\.focus\(name\);/, 'Set address: the card of that field');
  const edit = src('room-edit.js');
  assert.match(edit, /fields\.showErrors\(checked\.errors\)\?\.focus\(\);\n\s*showError\(formErr, checked\.other \?\? ''\);/, 'a rule that blames another card: under the Save');
});

test('the Equipment grid: cards at least 260 px wide, 16 px apart, one column on a phone; an unfitted card dimmed', () => {
  const css = src('styles.css');
  assert.match(css, /\.eq-grid \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(260px, 1fr\)\); gap: 16px; \}/);
  assert.match(css, /@media \(max-width: 600px\) \{ \.eq-grid \{ grid-template-columns: 1fr;/);
  assert.match(css, /\.eq-card\.unfitted \{/);
  // The four sensors two by two (owner 2026-10-27); a phone keeps one column.
  assert.match(css, /@media \(min-width: 601px\) \{ \.eq-section\[data-section="sensors"\] \.eq-grid \{ grid-template-columns: repeat\(2, 1fr\); \} \}/);
  assert.doesNotMatch(css, /\.equipment[^{]*\{[^}]*max-width/, 'the tab is not capped at 760 px');
});

test('Delete room: a danger button, the Rooms list\'s confirm, then the Rooms list', () => {
  const edit = src('room-edit.js');
  assert.match(edit, /deleteText\.textContent = `Delete \$\{room\.name\}\? This can't be undone\.`;/);
  assert.match(edit, /button\('Delete room', 'danger'\)/);
  assert.match(edit, /await request\('DELETE', `\/api\/rooms\/\$\{roomId\}`\);/);
  assert.match(edit, /location\.hash = '#\/rooms';/);
  assert.match(page, /createDeleteCard\(els\.deleteHost, \{ roomId: id, getRoom: \(\) => room, onGone: /);
});

test('"Set address" on a sensor or machine without one opens the Setup tab (where the equipment cards are) at that field', () => {
  assert.match(page, /pendingField = field;\n\s*location\.hash = roomHash\(id, 'setup'\);/);
  assert.match(page, /if \(tab === 'setup' && pendingField\)/);
  const machines = src('machines.js');
  assert.match(machines, /notWired\('No relay module address set', \(\) => onEdit\('relayAddress'\)\)/);
  assert.match(machines, /notWired\('No aircon gateway address set', \(\) => onEdit\('acAddress'\)\)/);
  assert.match(machines, /button\('Set address'\)/);
});

test('two-column fields share their label, input and error rows: a two-line label or an error never moves the input beside it', () => {
  const css = src('styles.css');
  assert.match(css, /\.room-form \.sizes\.two \.field, #room-fields \.sizes\.two \.field \{ display: grid; grid-row: span 3; grid-template-rows: subgrid; row-gap: 4px; \}/);
  assert.match(css, /\.room-form \.sizes\.two \.field label, #room-fields \.sizes\.two \.field label \{ align-self: end; \}/);
});
