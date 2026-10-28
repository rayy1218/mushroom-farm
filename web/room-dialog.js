// The Add room dialog of the Overview: a new room's name and size (its equipment is set next, on the room's Setup tab). The fields are built from web/room-fields.js, like the room page's Room
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
// Only the name and size (critique 2026-10-28: the equipment waits until the room exists): the other fields keep their
// defaults, and the new room opens on its Setup tab to wire its sensors and machines.
$('room-fields').append(...fields.parts.profile);
const next = document.createElement('p');
next.className = 'muted s-hint';
next.textContent = 'Sensors and machines come next, on the room\'s Setup tab.';
$('room-fields').append(next);

let opened = 0; // counts openings, so a late save can tell it is stale
let callbacks = {};

function clearErrors() {
  formError.hidden = true;
  fields.clearErrors();
}

// onSaved(room): the room was added (the server's reply).
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
    const room = await request('POST', '/api/rooms', roomBody(null, checked.values));
    // The room is saved either way; only close the dialog if it is still the one that was saved.
    if (mine === opened) dialog.close();
    callbacks.onSaved?.(room);
  } catch (err) {
    if (mine !== opened) return;
    if (err.status === 400 || err.status === 409) showFormError(err);
    else showFormError(new ApiError(0, { error: `${OFFLINE}. Try again.` }));
  } finally {
    if (mine === opened) save.disabled = false;
  }
});

$('cancel').addEventListener('click', () => dialog.close());
