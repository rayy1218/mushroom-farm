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

// C11 6: field labels by API key, for plainError.
const LABELS = { crop: 'Mushroom', strain: 'Strain (seed type)', source: 'Bought from', block_count: 'Blocks', block_wet_kg: 'Wet weight per block',
  moisture_pct: 'Moisture', received_at: 'Arrived on', spawn_date: 'Spawn date', flush_gap_days: 'Days between flushes', notes: 'Notes' };
const CONFIRM_FINISH = 'Finish this batch? Its blocks are thrown out and it takes no more crates.';

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
    <button type="button" id="btTabReceived" aria-pressed="false">New</button>
    <button type="button" id="btTabPlaced" aria-pressed="true">Growing</button>
    <button type="button" id="btTabCleared" aria-pressed="false">Finished</button>
  </div>
  <a class="btn btn-link" id="btStickers" href="#/harvest/stickers">Print QR stickers</a>
  <table class="bt-list" id="btList">
    <thead><tr><th>Mushroom</th><th>Strain</th><th>Room</th><th>Age (days)</th><th>kg</th><th>g per block</th><th>BE %</th></tr></thead>
    <tbody></tbody>
  </table>
  <p class="alert" id="btMsg" role="status" hidden></p>
  <form class="bt-form" id="btForm">
    <h3>New batch</h3>
    <div class="form-grid">
      <div class="field" data-field="crop">
        <label for="btCrop">Mushroom</label>
        <div class="field-ctl"><select id="btCrop"></select></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="strain">
        <label for="btStrain">Strain (seed type)</label>
        <div class="field-ctl"><input id="btStrain"></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="source">
        <label for="btSource">Bought from</label>
        <div class="field-ctl"><input id="btSource"></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="block_count">
        <label for="btCount">Blocks</label>
        <div class="field-ctl"><input id="btCount" type="number" min="1" step="1"><span class="unit">blocks</span></div>
        <p class="field-help">How many blocks arrived.</p>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="block_wet_kg">
        <label for="btKg">Wet weight per block</label>
        <div class="field-ctl"><input id="btKg" type="number" step="0.01"><span class="unit">kg</span></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="moisture_pct">
        <label for="btMoist">Moisture</label>
        <div class="field-ctl"><input id="btMoist" type="number" step="any"><span class="unit">%</span></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="received_at">
        <label for="btReceived">Arrived on</label>
        <div class="field-ctl"><input id="btReceived" type="date"></div>
        <p class="field-err" hidden></p>
      </div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" id="btSave" type="submit">Save</button></div>
  </form>
</div>`;

const DETAIL_HTML = `
<div class="bd-page">
  <h2 id="bdHead"></h2>
  <p class="tag" id="bdWait" hidden></p>
  <form class="bd-form" id="bdForm">
    <h3>Blocks</h3>
    <div class="form-grid">
      <div class="field" data-field="crop">
        <label for="bdCrop">Mushroom</label>
        <div class="field-ctl"><select id="bdCrop"></select></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="strain">
        <label for="bdStrain">Strain (seed type)</label>
        <div class="field-ctl"><input id="bdStrain"></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="source">
        <label for="bdSource">Bought from</label>
        <div class="field-ctl"><input id="bdSource"></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="block_count">
        <label for="bdCount">Blocks</label>
        <div class="field-ctl"><input id="bdCount" type="number" min="1" step="1"><span class="unit">blocks</span></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="block_wet_kg">
        <label for="bdKg">Wet weight per block</label>
        <div class="field-ctl"><input id="bdKg" type="number" step="any"><span class="unit">kg</span></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="moisture_pct">
        <label for="bdMoist">Moisture</label>
        <div class="field-ctl"><input id="bdMoist" type="number" step="any"><span class="unit">%</span></div>
        <p class="field-err" hidden></p>
      </div>
    </div>
    <h3>Dates</h3>
    <div class="form-grid">
      <div class="field" data-field="spawn_date">
        <label for="bdSpawn">Spawn date</label>
        <div class="field-ctl"><input id="bdSpawn" type="date"></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="received_at">
        <label for="bdReceived">Arrived on</label>
        <div class="field-ctl"><input id="bdReceived" type="date"></div>
        <p class="field-err" hidden></p>
      </div>
      <div class="field" data-field="flush_gap_days">
        <label for="bdGap">Days between flushes</label>
        <div class="field-ctl"><input id="bdGap" type="number" min="1" step="1"><span class="unit">days</span></div>
        <p class="field-err" hidden></p>
      </div>
    </div>
    <h3>Notes</h3>
    <div class="form-grid">
      <div class="field span-all" data-field="notes">
        <label for="bdNotes">Notes</label>
        <div class="field-ctl"><textarea id="bdNotes" rows="3"></textarea></div>
        <p class="field-err" hidden></p>
      </div>
    </div>
    <div class="btn-row"><button class="btn btn-primary" id="bdSave" type="submit">Save changes</button></div>
  </form>
  <div class="bd-actions btn-row">
    <select id="bdRoom" hidden></select>
    <button class="btn" id="bdPlace" type="button" hidden>Place in room</button>
    <button class="btn btn-danger" id="bdClear" type="button" hidden>Finish batch</button>
    <button class="btn btn-danger" id="bdDelete" type="button" hidden>Delete</button>
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
  <p class="alert" id="bdMsg" role="status" hidden></p>
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

  const say = (lvl, text) => global.FarmUi.say($('#btMsg'), lvl, text);
  const tabs = { received: $('#btTabReceived'), placed: $('#btTabPlaced'), cleared: $('#btTabCleared') };
  let state = 'placed';

  async function load() {
    const mine = ++gen;
    let list;
    try { list = await global.FarmApi.listBatches({ state }); }
    catch (err) { if (live() && mine === gen) say('error', errText(err)); return; }
    if (!live() || mine !== gen) return;
    say('info', '');
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
    global.FarmUi.markFields($('#btForm'), {});
    try {
      const fields = {
        crop: $('#btCrop').value, strain: $('#btStrain').value, source: $('#btSource').value, block_count: $('#btCount').value,
        block_wet_kg: $('#btKg').value, moisture_pct: $('#btMoist').value, received_at: $('#btReceived').value,
      };
      const made = await global.FarmApi.createBatch(batchBody({ edit: false, fields }));
      if (!live()) return;
      say('good', 'Saved.');
      global.location.hash = `#/batches/${made.id}`;
    } catch (err) {
      if (live()) {
        const p = global.FarmUi.plainError(err, LABELS);
        say('error', p.text);
        global.FarmUi.markFields($('#btForm'), p.fields);
      }
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
  const msg = (text, lvl) => global.FarmUi.say(msgEl, lvl || (text ? 'good' : 'info'), text);
  const fail = err => msg(errText(err), 'error');

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
    const where = b.state === 'received' ? 'New' : b.state === 'placed' ? `In ${b.room_name}` : 'Finished';
    $('#bdHead').textContent = `${cropName(b.crop)} · ${b.strain || '–'} · ${where}`;
    const wait = $('#bdWait');
    wait.hidden = b.placed_at == null;
    wait.textContent = b.placed_at == null ? '' : `Arrived to placed: ${ageDays(b.received_at, b.placed_at)} days`;
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
      if (err && err.name === 'ApiError' && err.status === 404) notFound(); else fail(err);
      return false;
    }
    if (!live() || mine !== gen) return false;
    paint(b);
    return true;
  }

  // Runs one action on a button: disabled while it runs; the reload follows a success.
  async function act(button, fn, okText, reloadOnError) {
    button.disabled = true;
    global.FarmUi.markFields($('#bdForm'), {});
    try {
      await fn();
      if (!live()) return;
      if (await load()) msg(okText || '');
    } catch (err) {
      if (live()) {
        const p = global.FarmUi.plainError(err, LABELS);
        msg(p.text, 'error');
        global.FarmUi.markFields($('#bdForm'), p.fields);
        if (reloadOnError) await load();
      }
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
    global.FarmUi.markFields($('#bdForm'), {});
    if (Object.keys(body).length === 0) { msg('Nothing to change.', 'info'); return; }
    act($('#bdSave'), () => global.FarmApi.updateBatch(id, body), 'Saved.');
  });

  $('#bdPlace').addEventListener('click', () =>
    act($('#bdPlace'), () => global.FarmApi.placeBatch(id, { room_id: Number($('#bdRoom').value) })));

  $('#bdClear').addEventListener('click', () => {
    if (!global.confirm(CONFIRM_FINISH)) return;
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
      if (live()) { fail(err); button.disabled = false; }
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
    global.FarmApi.listRooms().catch(err => { if (live()) fail(err); return []; }),
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
