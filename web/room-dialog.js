// The Add room dialog of the Rooms list: every field of a room (a new room needs its name and size; its equipment can be set
// here or later on the room page's Equipment tab). The fields are built from web/room-fields.js, like the room page's Room
// profile and Equipment tabs; the dialog's frame lives in index.html.

import { request, ApiError, OFFLINE } from './api.js';
import { ROOM_GROUPS, fieldTexts, parseRoomFields, roomBody } from './room-fields.js';
import { createRoomForm } from './room-form.js';

const $ = (id) => document.getElementById(id);

const dialog = $('room-dialog');
const form = $('room-form');
const formError = $('form-error');
const save = $('save');

const fields = createRoomForm(ROOM_GROUPS, { idPrefix: 'f-' });
// The name and sizes first, then a section per group of equipment.
for (const group of ROOM_GROUPS) {
  if (group.key === 'profile') {
    $('room-fields').append(...fields.parts.profile);
    continue;
  }
  const set = document.createElement('fieldset');
  set.className = 'addresses';
  const legend = document.createElement('legend');
  legend.textContent = group.title;
  set.append(legend, ...fields.parts[group.key]);
  $('room-fields').append(set);
}

let opened = 0; // counts openings, so a late save can tell it is stale
let callbacks = {};

function clearErrors() {
  formError.hidden = true;
  fields.clearErrors();
}

// onSaved(): the room was added.
export function openRoomDialog({ onSaved } = {}) {
  opened++;
  callbacks = { onSaved };
  save.disabled = false;
  form.reset();
  fields.fill(fieldTexts(null)); // the ratings and the filter settings start at the defaults
  clearErrors();
  dialog.showModal();
}

// For a page that goes away while the dialog is open: drop the dialog and its pending callbacks.
export function closeRoomDialog() {
  opened++;
  callbacks = {};
  if (dialog.open) dialog.close();
}

function showFormError(err) {
  const input = err.field ? fields.showErrors({ [err.field]: err.message }) : null;
  if (input) input.focus();
  else {
    formError.textContent = err.message;
    formError.hidden = false;
    formError.focus();
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  // Every field is checked here as the server does; the first wrong input gets the focus.
  const checked = parseRoomFields(fields.texts());
  if (checked.errors) {
    fields.showErrors(checked.errors).focus();
    return;
  }
  const mine = opened;
  save.disabled = true;
  try {
    await request('POST', '/api/rooms', roomBody(null, checked.values));
    // The room is saved either way; only close the dialog if it is still the one that was saved.
    if (mine === opened) dialog.close();
    callbacks.onSaved?.();
  } catch (err) {
    if (mine !== opened) return;
    if (err.status === 400 || err.status === 409) showFormError(err);
    else showFormError(new ApiError(0, { error: `${OFFLINE}. Try again.` }));
  } finally {
    if (mine === opened) save.disabled = false;
  }
});

$('cancel').addEventListener('click', () => dialog.close());
