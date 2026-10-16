// The Rooms page: list rooms, add and edit them in one dialog, delete with a confirm.

const $ = (id) => document.getElementById(id);

const els = {
  add: $('add'),
  addEmpty: $('add-empty'),
  banner: $('banner'),
  bannerText: $('banner-text'),
  retry: $('retry'),
  loading: $('loading'),
  empty: $('empty'),
  table: $('rooms'),
  dialog: $('room-dialog'),
  form: $('room-form'),
  title: $('room-title'),
  formError: $('form-error'),
  volume: $('volume'),
  cancel: $('cancel'),
  save: $('save'),
  deleteDialog: $('delete-dialog'),
  deleteText: $('delete-text'),
};

const FIELDS = ['name', 'length', 'width', 'height'];
const inputs = Object.fromEntries(FIELDS.map((f) => [f, $(`f-${f}`)]));
const errors = Object.fromEntries(FIELDS.map((f) => [f, $(`e-${f}`)]));

const metres = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const cubic = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const OFFLINE = "Couldn't reach the farm server";
const GONE = 'That room no longer exists';

let rooms = [];
let loaded = false;
let editingId = null; // null while adding
let opened = 0; // counts dialog openings, so a late save can tell it is stale
let loadSeq = 0;
let rendered = false;
let deletingId = null;

class ApiError extends Error {
  constructor(status, data) {
    super(data?.error ?? OFFLINE);
    this.status = status; // 0 when the server could not be reached
    this.field = data?.field;
  }
}

async function request(method, path, body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  init.signal = AbortSignal.timeout(10000);
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, null);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// ---- banner ----

function showBanner(text, { retry = false } = {}) {
  els.bannerText.textContent = text;
  els.retry.hidden = !retry;
  els.banner.hidden = false;
}

function hideBanner() {
  els.banner.hidden = true;
}

// ---- list ----

async function load() {
  const seq = ++loadSeq;
  try {
    rooms = await request('GET', '/api/rooms');
    if (seq !== loadSeq) return;
    loaded = true;
    // Only the offline banner (the one with Retry) clears here; "That room no longer exists" stays.
    if (!els.retry.hidden) hideBanner();
  } catch {
    if (seq !== loadSeq) return;
    showBanner(OFFLINE, { retry: true });
  }
  els.loading.hidden = true;
  render();
}

function cell(text, label, className) {
  const td = document.createElement('td');
  td.textContent = text;
  td.dataset.label = label;
  if (className) td.className = className;
  return td;
}

function button(text, action, room, className) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.dataset.action = action;
  b.dataset.id = room.id;
  b.setAttribute('aria-label', `${text} ${room.name}`);
  if (className) b.className = className;
  return b;
}

function row(room) {
  const tr = document.createElement('tr');
  const actions = document.createElement('td');
  actions.className = 'row-actions';
  actions.append(button('Edit', 'edit', room), button('Delete', 'delete', room, 'danger-text'));
  tr.append(
    cell(room.name, 'Name', 'name'),
    cell(`${metres.format(room.length)} × ${metres.format(room.width)} × ${metres.format(room.height)}`, 'Size (m)'),
    cell(cubic.format(room.volume), 'Volume (m³)', 'num'),
    cell(day.format(room.createdAt), 'Created'),
    actions,
  );
  return tr;
}

function render() {
  // Keep focus on the same row button across a re-render (the old one is replaced).
  const active = document.activeElement;
  const keep = [els.table, els.empty, els.banner].some((el) => el.contains(active)) || (active === document.body && rendered);
  const { action, id } = active?.dataset ?? {};
  els.table.tBodies[0].replaceChildren(...rooms.map(row));
  els.table.hidden = rooms.length === 0;
  els.empty.hidden = !loaded || rooms.length > 0;
  rendered = true;
  if (keep) (els.table.querySelector(`button[data-action="${action}"][data-id="${id}"]`) ?? els.add).focus();
}

// ---- add / edit dialog ----

function clearErrors() {
  els.formError.hidden = true;
  for (const f of FIELDS) {
    errors[f].textContent = '';
    inputs[f].removeAttribute('aria-invalid');
  }
}

function updateVolume() {
  const v = inputs.length.valueAsNumber * inputs.width.valueAsNumber * inputs.height.valueAsNumber;
  els.volume.textContent = Number.isFinite(v) ? `Volume: ${cubic.format(v)} m³` : 'Volume: — m³';
}

function openRoomDialog(room) {
  if (loaded) hideBanner(); // keep the load-failure banner (with Retry) until a load succeeds
  opened++;
  els.save.disabled = false;
  editingId = room ? room.id : null;
  els.title.textContent = room ? 'Edit room' : 'Add room';
  els.form.reset();
  if (room) for (const f of FIELDS) inputs[f].value = room[f];
  clearErrors();
  updateVolume();
  els.dialog.showModal();
}

function showFormError(err) {
  if (err.field && inputs[err.field]) {
    errors[err.field].textContent = err.message;
    inputs[err.field].setAttribute('aria-invalid', 'true');
    inputs[err.field].focus();
  } else {
    els.formError.textContent = err.message;
    els.formError.hidden = false;
    els.formError.focus();
  }
}

async function roomGone() {
  els.dialog.close();
  showBanner(GONE);
  await load();
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors();
  const body = {
    name: inputs.name.value,
    length: inputs.length.valueAsNumber,
    width: inputs.width.valueAsNumber,
    height: inputs.height.valueAsNumber,
  };
  const mine = opened;
  els.save.disabled = true;
  try {
    if (editingId === null) await request('POST', '/api/rooms', body);
    else await request('PUT', `/api/rooms/${editingId}`, body);
    if (mine === opened) els.dialog.close();
    load();
  } catch (err) {
    if (mine !== opened) return;
    if (err.status === 404) await roomGone();
    else if (err.status === 400 || err.status === 409) showFormError(err);
    else showFormError(new ApiError(0, { error: `${OFFLINE}. Try again.` }));
  } finally {
    if (mine === opened) els.save.disabled = false;
  }
});

els.form.addEventListener('input', updateVolume);
els.cancel.addEventListener('click', () => els.dialog.close());

// ---- delete ----

function openDeleteDialog(room) {
  if (loaded) hideBanner(); // keep the load-failure banner (with Retry) until a load succeeds
  deletingId = room.id;
  els.deleteText.textContent = `Delete ${room.name}? This can't be undone.`;
  els.deleteDialog.returnValue = '';
  els.deleteDialog.showModal();
}

els.deleteDialog.addEventListener('close', async () => {
  if (els.deleteDialog.returnValue !== 'delete') return;
  try {
    await request('DELETE', `/api/rooms/${deletingId}`);
    await load();
  } catch (err) {
    if (err.status === 404) {
      showBanner(GONE);
      await load();
    } else {
      showBanner(OFFLINE, { retry: true });
    }
  }
});

// ---- wiring ----

els.add.addEventListener('click', () => openRoomDialog(null));
els.addEmpty.addEventListener('click', () => openRoomDialog(null));
els.retry.addEventListener('click', load);

els.table.addEventListener('click', (event) => {
  const b = event.target.closest('button[data-action]');
  if (!b) return;
  const room = rooms.find((r) => r.id === Number(b.dataset.id));
  if (!room) return;
  if (b.dataset.action === 'edit') openRoomDialog(room);
  else openDeleteDialog(room);
});

load();

// Theme: dark by default; the choice is kept in this browser. index.html applies it before first paint.
const THEME_COLOURS = { dark: '#1c1f22', light: '#f4f5f6' }; // each theme's --surface
const themeButton = $('theme');

function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function showTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const next = theme === 'dark' ? 'light' : 'dark';
  themeButton.textContent = next === 'light' ? 'Light mode' : 'Dark mode';
  themeButton.setAttribute('aria-label', `Switch to ${next} mode`);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', THEME_COLOURS[theme]);
}

themeButton.addEventListener('click', () => {
  const theme = currentTheme() === 'dark' ? 'light' : 'dark';
  showTheme(theme);
  try { localStorage.setItem('farm.theme', theme); } catch { /* not kept */ }
});

showTheme(currentTheme());
