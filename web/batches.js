// web/batches.js: the Batches pages (docs/contracts/harvest.md 12.3).
(function (global) {
'use strict';

let current = null;                         // the token of the mounted page; a late reply of an older mount sees it changed

const OFFSET = 8 * 3600;
const TEXT = ['strain', 'source', 'notes'];
const NUM = ['block_count', 'block_wet_kg', 'moisture_pct', 'flush_gap_days'];
const DATE = ['spawn_date', 'received_at'];

// Farm dates (UTC+8) whatever the browser's time zone (lead decision 67).
function dateToSeconds(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof text === 'string' ? text : '');
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return Date.UTC(y, mo - 1, d) / 1000 - OFFSET;
}
function secondsToDate(t) {
  const d = new Date((t + OFFSET) * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
const ageDays = (from, now) => Math.floor((now - from) / 86400);

// form: { edit, fields }. An empty value is left out on create and sent as null on edit.
function batchBody({ edit, fields }) {
  const body = {};
  for (const k of Object.keys(fields)) {
    if (k === 'crop') { body.crop = fields.crop; continue; }
    const text = String(fields[k]).trim();
    if (text === '') { if (edit) body[k] = null; continue; }
    if (TEXT.includes(k)) body[k] = text;
    else if (NUM.includes(k)) body[k] = Number.isFinite(Number(text)) ? Number(text) : text;
    else if (DATE.includes(k)) body[k] = dateToSeconds(text) ?? text;
  }
  return body;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const cropKeys = () => Object.keys(global.ClimateController.CROPS).filter(k => global.ClimateController.CROPS[k].range);
const cropName = k => (global.ClimateController.CROPS[k] ? global.ClimateController.CROPS[k].name : k);
const errText = err => global.FarmUi.errorText(err);

function addCropOptions(select) {
  for (const k of cropKeys()) {
    const o = document.createElement('option');
    o.value = k; o.textContent = cropName(k);
    select.appendChild(o);
  }
}

function td(text) {
  const c = document.createElement('td');
  c.textContent = text;
  return c;
}

function row(cells) {
  const tr = document.createElement('tr');
  for (const c of cells) tr.appendChild(typeof c === 'string' || typeof c === 'number' ? td(String(c)) : c);
  return tr;
}

const LIST_HTML = `
<div class="bt-page">
  <div class="bt-tabs" role="group" aria-label="Batches">
    <button type="button" id="btTabReceived" aria-pressed="false">Received</button>
    <button type="button" id="btTabPlaced" aria-pressed="true">In rooms</button>
    <button type="button" id="btTabCleared" aria-pressed="false">Cleared</button>
  </div>
  <a class="btn" id="btStickers" href="#/harvest/stickers">Print QR stickers</a>
  <table class="bt-list" id="btList">
    <thead><tr><th>Crop</th><th>Strain</th><th>Room</th><th>Age (days)</th><th>kg</th><th>g per block</th><th>BE %</th></tr></thead>
    <tbody></tbody>
  </table>
  <p class="tag" id="btMsg" role="status"></p>
  <form class="bt-form" id="btForm">
    <h3>New batch</h3>
    <label>Crop <select id="btCrop"></select></label>
    <label>Strain <input id="btStrain"></label>
    <label>Source <input id="btSource"></label>
    <label>Blocks <input id="btCount" type="number" min="1" step="1"></label>
    <label>Wet weight per block (kg) <input id="btKg" type="number" step="0.01"></label>
    <label>Moisture % <input id="btMoist" type="number" step="any"></label>
    <label>Received <input id="btReceived" type="date"></label>
    <button class="btn" id="btSave" type="submit">Save</button>
  </form>
</div>`;

const DETAIL_HTML = `
<div class="bd-page">
  <h2 id="bdHead"></h2>
  <p class="tag" id="bdWait" hidden></p>
  <form class="bd-form" id="bdForm">
    <label>Crop <select id="bdCrop"></select></label>
    <label>Strain <input id="bdStrain"></label>
    <label>Source <input id="bdSource"></label>
    <label>Blocks <input id="bdCount" type="number" min="1" step="1"></label>
    <label>Wet weight per block (kg) <input id="bdKg" type="number" step="any"></label>
    <label>Moisture % <input id="bdMoist" type="number" step="any"></label>
    <label>Spawn date <input id="bdSpawn" type="date"></label>
    <label>Received <input id="bdReceived" type="date"></label>
    <label>Days between flushes <input id="bdGap" type="number" min="1" step="1"></label>
    <label>Notes <textarea id="bdNotes" rows="3"></textarea></label>
    <button class="btn" id="bdSave" type="submit">Save changes</button>
  </form>
  <div class="bd-actions">
    <select id="bdRoom" hidden></select>
    <button class="btn" id="bdPlace" type="button" hidden>Place in room</button>
    <button class="btn" id="bdClear" type="button" hidden>Clear</button>
    <button class="btn" id="bdDelete" type="button" hidden>Delete</button>
  </div>
  <h3>Flushes</h3>
  <table class="bd-flushes" id="bdFlushes">
    <thead><tr><th>Flush</th><th>First</th><th>Last</th><th>kg</th><th>g per block</th><th>BE %</th></tr></thead>
    <tbody></tbody>
  </table>
  <h3>Crates</h3>
  <table class="bd-crates" id="bdCrates">
    <thead><tr><th>Time</th><th>kg</th><th>Picker</th><th>–</th></tr></thead>
    <tbody></tbody>
  </table>
  <p class="tag" id="bdMsg" role="status"></p>
</div>`;

// ---- list ----

function mountList(el, live) {
  let gen = 0;                              // bumped by every load: an older reply is dropped
  const $ = s => el.querySelector(s);
  el.innerHTML = LIST_HTML;
  const LIM = global.FarmHarvestRules.LIM;
  addCropOptions($('#btCrop'));
  $('#btStrain').maxLength = LIM.text;
  $('#btSource').maxLength = LIM.text;
  $('#btMoist').value = global.FarmHarvestRules.DEFAULTS.moisture_pct;
  $('#btReceived').value = secondsToDate(nowSec());

  const tabs = { received: $('#btTabReceived'), placed: $('#btTabPlaced'), cleared: $('#btTabCleared') };
  let state = 'placed';

  async function load() {
    const mine = ++gen;
    let list;
    try { list = await global.FarmApi.listBatches({ state }); }
    catch (err) { if (live() && mine === gen) $('#btMsg').textContent = errText(err); return; }
    if (!live() || mine !== gen) return;
    $('#btMsg').textContent = '';
    const now = nowSec();
    const body = $('#btList').querySelector('tbody');
    const rows = list.map(b => {
      const from = b.state === 'received' ? b.received_at : b.placed_at;
      const to = b.state === 'cleared' ? b.cleared_at : now;
      const tr = row([cropName(b.crop), b.strain || '–', b.room_name || '–', ageDays(from, to), b.totals.kg, b.totals.g_per_block, b.totals.be_pct]);
      tr.dataset.id = String(b.id);
      return tr;
    });
    body.replaceChildren(...rows);
  }

  function pick(next) {
    state = next;
    for (const k of Object.keys(tabs)) tabs[k].setAttribute('aria-pressed', String(k === next));
    return load();
  }
  for (const k of Object.keys(tabs)) tabs[k].addEventListener('click', () => pick(k));

  $('#btList').addEventListener('click', e => {
    const tr = e.target && e.target.closest ? e.target.closest('tr[data-id]') : null;
    if (tr) global.location.hash = `#/batches/${tr.dataset.id}`;
  });

  $('#btForm').addEventListener('submit', async e => {
    e.preventDefault();
    const save = $('#btSave');
    save.disabled = true;
    try {
      const fields = {
        crop: $('#btCrop').value, strain: $('#btStrain').value, source: $('#btSource').value, block_count: $('#btCount').value,
        block_wet_kg: $('#btKg').value, moisture_pct: $('#btMoist').value, received_at: $('#btReceived').value,
      };
      await global.FarmApi.createBatch(batchBody({ edit: false, fields }));
      if (!live()) return;
      for (const id of ['#btStrain', '#btSource', '#btCount', '#btKg']) $(id).value = '';
      await pick('received');
      if (live()) $('#btMsg').textContent = 'Saved.';
    } catch (err) {
      if (live()) $('#btMsg').textContent = errText(err);
    } finally {
      if (live()) save.disabled = false;
    }
  });

  return load();
}

// ---- detail ----

async function mountDetail(el, id, live) {
  let gen = 0;
  const $ = s => el.querySelector(s);
  el.innerHTML = DETAIL_HTML;
  const HR = global.FarmHarvestRules;
  addCropOptions($('#bdCrop'));
  $('#bdStrain').maxLength = HR.LIM.text;
  $('#bdSource').maxLength = HR.LIM.text;
  $('#bdNotes').maxLength = HR.LIM.notes;
  let batch = null;

  const roomSel = $('#bdRoom'), msgEl = $('#bdMsg');   // held: notFound() detaches them, writes to them are harmless
  const msg = text => { msgEl.textContent = text; };

  function notFound() {
    const page = document.createElement('div'); page.className = 'bd-page';
    const p = document.createElement('p'); p.className = 'est-note'; p.textContent = 'This batch does not exist.';
    const a = document.createElement('a'); a.href = '#/batches'; a.textContent = 'Batches';
    page.append(p, a);
    el.replaceChildren(page);
  }

  function paint(b) {
    batch = b;
    const clock = global.FarmUi.farmClock();
    const where = b.state === 'received' ? 'Received' : b.state === 'placed' ? `In ${b.room_name}` : 'Cleared';
    $('#bdHead').textContent = `${cropName(b.crop)} · ${b.strain || '–'} · ${where}`;
    const wait = $('#bdWait');
    wait.hidden = b.placed_at == null;
    wait.textContent = b.placed_at == null ? '' : `Received to placed: ${ageDays(b.received_at, b.placed_at)} days`;
    $('#bdCrop').value = b.crop;
    $('#bdStrain').value = b.strain ?? '';
    $('#bdSource').value = b.source ?? '';
    $('#bdCount').value = String(b.block_count);
    $('#bdKg').value = String(b.block_wet_kg);
    $('#bdMoist').value = String(b.moisture_pct);
    $('#bdSpawn').value = b.spawn_date == null ? '' : secondsToDate(b.spawn_date);
    $('#bdReceived').value = secondsToDate(b.received_at);
    $('#bdGap').value = String(b.flush_gap_days);
    $('#bdNotes').value = b.notes ?? '';
    const received = b.state === 'received';
    $('#bdRoom').hidden = !received;
    $('#bdPlace').hidden = !received;
    $('#bdClear').hidden = b.state !== 'placed';
    $('#bdDelete').hidden = b.totals.crates !== 0;
    $('#bdFlushes').querySelector('tbody').replaceChildren(...b.flushes.map(f =>
      row([f.n, secondsToDate(f.from), secondsToDate(f.to), f.kg, f.g_per_block, f.be_pct])));
    $('#bdCrates').querySelector('tbody').replaceChildren(...b.crates.map(c => {
      const undo = document.createElement('button');
      undo.className = 'btn'; undo.type = 'button'; undo.textContent = 'Undo'; undo.dataset.undo = String(c.id);
      const cell = document.createElement('td'); cell.appendChild(undo);
      return row([`${secondsToDate(c.t)} ${clock.hm(c.t)}`, c.kg, c.picker || '–', cell]);
    }));
  }

  // Returns false when the batch is gone or the page was left.
  async function load() {
    const mine = ++gen;
    let b;
    try { b = await global.FarmApi.getBatch(id); }
    catch (err) {
      if (!live() || mine !== gen) return false;
      if (err && err.name === 'ApiError' && err.status === 404) notFound(); else msg(errText(err));
      return false;
    }
    if (!live() || mine !== gen) return false;
    paint(b);
    return true;
  }

  // Runs one action on a button: disabled while it runs; the reload follows a success.
  async function act(button, fn, okText, reloadOnError) {
    button.disabled = true;
    try {
      await fn();
      if (!live()) return;
      if (await load()) msg(okText || '');
    } catch (err) {
      if (live()) { msg(errText(err)); if (reloadOnError) await load(); }
    } finally {
      if (live()) button.disabled = false;
    }
  }

  $('#bdForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!batch) return;
    const names = { crop: '#bdCrop', strain: '#bdStrain', source: '#bdSource', block_count: '#bdCount', block_wet_kg: '#bdKg',
      moisture_pct: '#bdMoist', spawn_date: '#bdSpawn', received_at: '#bdReceived', flush_gap_days: '#bdGap', notes: '#bdNotes' };
    const fields = {};
    for (const k of Object.keys(names)) fields[k] = $(names[k]).value;
    const all = batchBody({ edit: true, fields });
    const body = {};
    for (const k of Object.keys(all)) {
      // A date is unchanged when it is still the same farm day (the stored time may carry an hour).
      const current = DATE.includes(k) && batch[k] != null ? dateToSeconds(secondsToDate(batch[k])) : batch[k];
      if (all[k] !== (current === undefined ? null : current)) body[k] = all[k];
    }
    if (Object.keys(body).length === 0) { msg('Nothing to change.'); return; }
    act($('#bdSave'), () => global.FarmApi.updateBatch(id, body), 'Saved.');
  });

  $('#bdPlace').addEventListener('click', () =>
    act($('#bdPlace'), () => global.FarmApi.placeBatch(id, { room_id: Number($('#bdRoom').value) })));

  $('#bdClear').addEventListener('click', () => {
    if (!global.confirm('Clear this batch? Crates can no longer be added.')) return;
    act($('#bdClear'), () => global.FarmApi.clearBatch(id));
  });

  $('#bdDelete').addEventListener('click', async () => {
    if (!global.confirm('Delete this batch? It cannot be undone.')) return;
    const button = $('#bdDelete');
    button.disabled = true;
    try {
      await global.FarmApi.deleteBatch(id);
      if (live()) global.location.hash = '#/batches';
    } catch (err) {
      if (live()) { msg(errText(err)); button.disabled = false; }
    }
  });

  $('#bdCrates').addEventListener('click', e => {
    const button = e.target && e.target.closest ? e.target.closest('button[data-undo]') : null;
    if (!button) return;
    const crate = batch.crates.find(c => String(c.id) === button.dataset.undo);
    if (!global.confirm(`Undo the crate of ${crate ? crate.kg : ''} kg?`)) return;
    act(button, () => global.FarmApi.undoCrate(Number(button.dataset.undo)), '', true);
  });

  const [rooms] = await Promise.all([
    global.FarmApi.listRooms().catch(err => { if (live()) msg(errText(err)); return []; }),
    load(),
  ]);
  if (!live()) return;
  roomSel.replaceChildren(...rooms.map(r => {
    const o = document.createElement('option');
    o.value = String(r.id); o.textContent = r.name;
    return o;
  }));
}

function mount(el, params) {
  const me = current = {};
  const live = () => current === me;
  if (params && params.id != null) return mountDetail(el, params.id, live);
  return mountList(el, live);
}
function unmount() { current = null; }

global.FarmShell.register('batches', { mount, unmount });

if (typeof module === 'object' && module && module.exports) module.exports = { dateToSeconds, secondsToDate, ageDays, batchBody };
})(typeof window !== 'undefined' ? window : globalThis);
