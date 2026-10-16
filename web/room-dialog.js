// The Add / Edit room dialog, shared by the list and the detail page. The markup lives in index.html.

import { request, ApiError, OFFLINE } from './api.js';

const $ = (id) => document.getElementById(id);

const dialog = $('room-dialog');
const form = $('room-form');
const title = $('room-title');
const formError = $('form-error');
const volume = $('volume');
const save = $('save');

const FIELDS = ['name', 'length', 'width', 'height', 'trhAddress', 'co2Address'];
const inputs = Object.fromEntries(FIELDS.map((f) => [f, $(`f-${f}`)]));
const errors = Object.fromEntries(FIELDS.map((f) => [f, $(`e-${f}`)]));

const cubic = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

let editingId = null; // null while adding
let opened = 0; // counts openings, so a late save can tell it is stale
let callbacks = {};

function clearErrors() {
  formError.hidden = true;
  for (const f of FIELDS) {
    errors[f].textContent = '';
    inputs[f].removeAttribute('aria-invalid');
  }
}

function updateVolume() {
  const v = inputs.length.valueAsNumber * inputs.width.valueAsNumber * inputs.height.valueAsNumber;
  volume.textContent = Number.isFinite(v) ? `Volume: ${cubic.format(v)} m³` : 'Volume: — m³';
}

// room: a room object to edit, or null to add.
// onSaved(): the room was saved. onGone(): the server says the room no longer exists (404).
export function openRoomDialog(room, { onSaved, onGone } = {}) {
  opened++;
  callbacks = { onSaved, onGone };
  save.disabled = false;
  editingId = room ? room.id : null;
  title.textContent = room ? 'Edit room' : 'Add room';
  form.reset();
  if (room) for (const f of FIELDS) inputs[f].value = room[f] ?? '';
  clearErrors();
  updateVolume();
  dialog.showModal();
}

// For a page that goes away while the dialog is open: drop the dialog and its pending callbacks.
export function closeRoomDialog() {
  opened++;
  callbacks = {};
  if (dialog.open) dialog.close();
}

function showFormError(err) {
  if (err.field && inputs[err.field]) {
    errors[err.field].textContent = err.message;
    inputs[err.field].setAttribute('aria-invalid', 'true');
    inputs[err.field].focus();
  } else {
    formError.textContent = err.message;
    formError.hidden = false;
    formError.focus();
  }
}

// A blank address means "no sensor".
function address(input) {
  return input.value.trim() === '' ? null : input.valueAsNumber;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  const body = {
    name: inputs.name.value,
    length: inputs.length.valueAsNumber,
    width: inputs.width.valueAsNumber,
    height: inputs.height.valueAsNumber,
    trhAddress: address(inputs.trhAddress),
    co2Address: address(inputs.co2Address),
  };
  const mine = opened;
  save.disabled = true;
  try {
    if (editingId === null) await request('POST', '/api/rooms', body);
    else await request('PUT', `/api/rooms/${editingId}`, body);
    // The room is saved either way; only close the dialog if it is still the one that was saved.
    if (mine === opened) dialog.close();
    callbacks.onSaved?.();
  } catch (err) {
    if (mine !== opened) return;
    if (err.status === 404) {
      const { onGone } = callbacks;
      dialog.close();
      onGone?.();
    } else if (err.status === 400 || err.status === 409) showFormError(err);
    else showFormError(new ApiError(0, { error: `${OFFLINE}. Try again.` }));
  } finally {
    if (mine === opened) save.disabled = false;
  }
});

form.addEventListener('input', updateVolume);
$('cancel').addEventListener('click', () => dialog.close());
