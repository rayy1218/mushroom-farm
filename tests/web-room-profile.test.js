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
