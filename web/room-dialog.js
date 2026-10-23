// The Add / Edit room dialog, shared by the list and the detail page. The markup lives in index.html.

import { request, ApiError, OFFLINE } from './api.js';
import { RATING_NAMES, DEHUMIDIFIER_NAMES, ratingTexts, parseRatings, meterAddressOf } from './ratings-math.js';
import { FILTER_NAMES, filterTexts, parseFilter, dpAddressOf } from './filter-math.js';

const $ = (id) => document.getElementById(id);

const dialog = $('room-dialog');
const form = $('room-form');
const title = $('room-title');
const formError = $('form-error');
const volume = $('volume');
const save = $('save');

const FIELDS = ['name', 'length', 'width', 'height', 'trhAddress', 'co2Address', 'meterAddress', 'dpAddress', 'relayAddress', 'acAddress', ...RATING_NAMES, ...DEHUMIDIFIER_NAMES, 'dehumidifier', ...FILTER_NAMES];
const inputs = Object.fromEntries(FIELDS.map((f) => [f, $(`f-${f}`)]));
const errors = Object.fromEntries(FIELDS.map((f) => [f, $(`e-${f}`)]));

const dehumidifierFields = $('dehumidifier-fields');

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

// The dehumidifier's power and capacity show only while it is fitted.
function updateDehumidifier() {
  dehumidifierFields.hidden = !inputs.dehumidifier.checked;
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
  if (room) for (const f of FIELDS) if (f !== 'dehumidifier') inputs[f].value = room[f] ?? '';
  // The ratings start at the defaults for a new room (and for an older server that sends none).
  const texts = { ...ratingTexts(room), ...filterTexts(room) };
  for (const f of [...RATING_NAMES, ...DEHUMIDIFIER_NAMES, ...FILTER_NAMES]) inputs[f].value = texts[f];
  inputs.dehumidifier.checked = room?.dehumidifier === true;
  updateDehumidifier();
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

// A blank address means "none".
function address(input) {
  return input.value.trim() === '' ? null : input.valueAsNumber;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  // The meter and filter sensor addresses, the ratings and the filter settings are checked here as the server does; the first
  // wrong input gets the focus. All four filter settings are sent: the server keeps one that is left out.
  const fitted = inputs.dehumidifier.checked;
  const ratings = parseRatings(Object.fromEntries([...RATING_NAMES, ...DEHUMIDIFIER_NAMES].map((f) => [f, inputs[f].value])), { dehumidifier: fitted });
  const filter = parseFilter(Object.fromEntries(FILTER_NAMES.map((f) => [f, inputs[f].value])));
  const problems = { ...ratings.errors, ...filter.errors };
  const meter = meterAddressOf(inputs.meterAddress.value);
  if (Number.isNaN(meter)) problems.meterAddress = 'Energy meter address must be a whole number from 1 to 247, or empty for none';
  const dp = dpAddressOf(inputs.dpAddress.value);
  if (Number.isNaN(dp)) problems.dpAddress = 'Filter pressure sensor address must be a whole number from 1 to 247, or empty for none';
  const wrong = FIELDS.filter((f) => problems[f]);
  if (wrong.length) {
    for (const f of wrong) {
      errors[f].textContent = problems[f];
      inputs[f].setAttribute('aria-invalid', 'true');
    }
    inputs[wrong[0]].focus();
    return;
  }
  const body = {
    name: inputs.name.value,
    length: inputs.length.valueAsNumber,
    width: inputs.width.valueAsNumber,
    height: inputs.height.valueAsNumber,
    trhAddress: address(inputs.trhAddress),
    co2Address: address(inputs.co2Address),
    relayAddress: address(inputs.relayAddress),
    acAddress: address(inputs.acAddress),
    meterAddress: meter,
    dpAddress: dp,
    dehumidifier: fitted,
    ...ratings.values,
    ...filter.values,
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
inputs.dehumidifier.addEventListener('change', updateDehumidifier);
$('cancel').addEventListener('click', () => dialog.close());
