// web/room-settings.js: the room Settings tab (C12 5.4): the settings panel, the save bar, settings versions, room details, the danger zone.
(function (global) {
'use strict';

// ---------------- pure helpers ----------------
function programText(live) {
  if (!live || !live.crop) return '';
  const CC = global.ClimateController;
  const crop = CC.CROPS[live.crop] ? CC.CROPS[live.crop].name : live.crop;
  const stage = CC.STAGES[live.stage] ?? live.stage;
  return `Running now: ${crop} · ${stage}` + (live.flush != null ? ` · flush ${live.flush}` : '');
}

function commandFromReading(r) {
  if (!r) return null;
  return {
    ac: r.ac_mode !== 'off' ? { power: true, mode: r.ac_mode, setpoint: r.ac_setpoint } : { power: false },
    hu: { level: r.fog }, air: { on: r.air === 1 }, lights: { on: r.lights === 1 }, circ: { on: r.circ === 1 },
  };
}

function detailChanges(room, form) {
  const out = {};
  if (form.name.trim() !== room.name) out.name = form.name.trim();
  if (Number(form.volume) !== room.volume) out.volume = Number(form.volume);
  return out;
}

// The room details as lines for the save confirm: { label, oldText, newText }.
function detailLines(room, changes) {
  const out = [];
  if (changes.name !== undefined) out.push({ label: 'Room name', oldText: room.name, newText: changes.name });
  if (changes.volume !== undefined) out.push({ label: 'Room size', oldText: `${room.volume} m³`, newText: `${changes.volume} m³` });
  return out;
}

const countText = n => (n === 0 ? '' : `${n} unsaved change(s)`);
const changeLines = changes => changes.map(c => `${c.label}: ${c.oldText} → ${c.newText}`);
const versionText = (v, clock, current) => `${clock.stamp(v.saved_at)} · ${v.note ?? '—'}` + (current ? ' · current' : '');

// The save bar shows while something is unsaved or a save is running.
const barVisible = (n, saving) => n > 0 || !!saving;

function rebase(from, edited, to) {
  const SP = global.FarmSettingsPanel;
  const pending = SP.diffSettings(from, edited);
  return { settings: SP.applyChanges(to, pending), kept: pending.length };
}

const helpers = { programText, commandFromReading, detailChanges, detailLines, countText, changeLines, versionText, barVisible, rebase };

// ---------------- DOM ----------------
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k of Object.keys(attrs || {})) {
    if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
  }
  for (const c of kids) e.append(c);
  return e;
}

let teardown = null;
let mountSeq = 0;

function mount(el, ctx) {
  unmount(); // a mount that was never unmounted must not keep painting
  const api = global.FarmApi, UI = global.FarmUi, SP = global.FarmSettingsPanel;
  const clock = UI.farmClock();
  const id = ctx.id;
  let room = ctx.room();
  let latest = room.live ? room.live.reading : null;
  // a per-mount token, checked after every await, so a late reply never paints into a newer mount of the same element
  const mine = ++mountSeq;
  const alive = () => mine === mountSeq;
  let base = null, saving = false, pendingSettings = null, versions = [];
  let panel = null, ladder = null;
  const offs = [];

  // ---- markup (C12 5.4) ----
  const btn = (txt, attrs) => { const b = h('button', { class: 'btn', type: 'button', ...attrs }); b.textContent = txt; return b; };
  const heading = (tagName, cls, txt) => { const e = h(tagName, cls ? { class: cls } : {}); e.textContent = txt; return e; };
  const span = (attrs, txt) => { const e = h('span', attrs || {}); if (txt) e.textContent = txt; return e; };
  const para = (cls, txt) => { const p = h('p', { class: cls }); p.textContent = txt; return p; };

  const spMsg = h('div', { class: 'room-msg', id: 'spMsg', role: 'status', hidden: '' });
  const head = h('div', { class: 'section-head' }, heading('h2', '', 'Settings'), spMsg);
  const spHost = h('div', { class: 'contents', id: 'spHost' });
  const verList = h('ol', { id: 'lvVersions' });
  const secVer = h('section', { class: 'card room-versions', 'data-level-only': 'installer' }, heading('h2', 'eyebrow', 'Settings versions'), verList);
  const rdName = h('input', { id: 'rdName', type: 'text', maxlength: '60' });
  const rdVolume = h('input', { id: 'rdVolume', type: 'number', min: '5', max: '5000' });
  const rdMsg = h('p', { id: 'rdMsg', role: 'status', hidden: '' });
  const field = (key, forId, label, ctl, unit, help) => {
    const kids = [h('label', { for: forId }, label), h('div', { class: 'field-ctl' }, ctl, ...(unit ? [span({ class: 'unit' }, unit)] : []))];
    if (help) kids.push(para('field-help', help));
    kids.push(h('p', { class: 'field-err', hidden: '' }));
    return h('div', { class: 'field', 'data-field': key }, ...kids);
  };
  const detailsForm = h('div', { class: 'form-grid' }, field('name', 'rdName', 'Name', rdName),
    field('volume', 'rdVolume', 'Room size', rdVolume, 'm³', 'A new size restarts the room\'s loop.'));
  const secDetails = h('section', { class: 'card room-details' }, heading('h2', 'eyebrow', 'Room details'), detailsForm, rdMsg);
  const rdArchive = btn('Archive room', { id: 'rdArchive' });
  rdArchive.classList.add('btn-danger');
  const secDanger = h('section', { class: 'card room-danger' }, heading('h2', 'eyebrow', 'Danger zone'),
    para('est-note', 'Archiving stops the room\'s loop and takes it off the Rooms list. Its data is kept.'), h('div', { class: 'btn-row' }, rdArchive));
  const saveBtn = btn('Save', { id: 'spSave' }), discardBtn = btn('Discard', { id: 'spDiscard' });
  saveBtn.classList.add('btn-primary');
  const spCount = span({ class: 'save-count', id: 'spCount', role: 'status' });
  const saveBar = h('div', { class: 'save-bar', hidden: '' }, spCount, h('div', { class: 'btn-row' }, saveBtn, discardBtn));
  const lvMsg = h('p', { class: 'room-msg', id: 'lvMsg', role: 'status', hidden: '' });
  el.replaceChildren(head, spHost, secVer, secDetails, secDanger, lvMsg, saveBar);

  const fail = (e, target) => { UI.say(target || lvMsg, 'error', UI.errorText(e)); };
  const detailForm = () => ({ name: rdName.value, volume: rdVolume.value });
  const unsaved = () => (panel && base ? panel.diff(base).length : 0) + Object.keys(detailChanges(room, detailForm())).length;
  if (global.FarmShell && global.FarmShell.guardLeave) {
    global.FarmShell.guardLeave(() => { const n = unsaved(); return n ? `${n} unsaved change(s).` : ''; });
  }

  // ---- painting ----
  function drawLadder() {
    if (!ladder || !panel) return;
    const air = room.live ? room.live.air : null;
    const overview = global.FarmRoomTabs.get('overview');
    const chip = overview && overview.helpers ? overview.helpers.airLive(air, base).chip : null;
    ladder.draw(panel.get(), latest ? (latest.CO2 ?? NaN) : NaN, { air: chip });
  }
  function paintProgram() {
    const slot = spHost.querySelector('[data-slot="program-status"]');
    if (!slot) return;
    slot.replaceChildren(para('prog-status', programText(room.live)));
  }
  let painted = null; // { name, volume } as last written to the fields
  function paintDetails(force) {
    const next = { name: room.name, volume: String(room.volume) };
    // a field the user changed keeps its text: only overwrite one that still shows what was painted
    if (force || !painted || rdName.value === painted.name) rdName.value = next.name;
    if (force || !painted || rdVolume.value === painted.volume) rdVolume.value = next.volume;
    painted = next;
  }
  function paintSave() {
    const n = unsaved();
    spCount.textContent = countText(n);
    saveBar.hidden = !barVisible(n, saving);
    saveBtn.disabled = discardBtn.disabled = n === 0 || saving;
    rdName.disabled = rdVolume.disabled = saving;
    verList.querySelectorAll('button').forEach(b => { b.disabled = saving; });
  }
  function setMsg(lines, lvl = 'info') {
    UI.say(spMsg, lvl, lines.join(' '));
    if (lines.length && spMsg.scrollIntoView) spMsg.scrollIntoView({ block: 'nearest' }); // the bar is at the bottom, the message at the top
  }
  function renderVersions() {
    verList.replaceChildren(...versions.map((v, i) => {
      const li = document.createElement('li');
      li.append(span({}, versionText(v, clock, i === 0)));
      if (i > 0) {
        const b = btn('Restore', { 'aria-label': `Restore the version of ${clock.stamp(v.saved_at)}` });
        b.disabled = saving;
        b.addEventListener('click', () => restore(v));
        li.append(b);
      }
      return li;
    }));
  }

  // ---- loads ----
  async function loadVersions() {
    try { const v = await api.listSettingsHistory(id); if (!alive()) return; versions = v; renderVersions(); paintSave(); } catch (e) { if (alive()) fail(e); }
  }
  function createPanel() {
    panel = SP.createSettingsPanel(spHost, { settings: base, readOnly: false, getCommand: () => commandFromReading(latest),
      onChange: () => { paintSave(); drawLadder(); } });
    const slot = spHost.querySelector('[data-slot="rules-side"]');
    if (slot) { const d = document.createElement('div'); slot.append(d); ladder = global.FarmCharts.createLadder(d); }
    paintProgram();
    drawLadder();
    paintSave();
  }
  async function loadSettings() {
    try {
      const s = await api.getSettings(id);
      if (!alive()) return;
      base = s;
      if (!panel) createPanel();
      drawLadder();
      if (pendingSettings) { const d = pendingSettings; pendingSettings = null; onSettings(d); }
    } catch (e) { if (alive()) fail(e); }
    await loadVersions();
  }

  // ---- stream events ----
  function onSettings(data) {
    if (saving) return;
    if (!base || !panel) { pendingSettings = data; return; }
    const { settings, kept } = rebase(base, panel.get(), data.settings);
    base = data.settings;
    panel.set(settings);
    drawLadder();
    loadVersions();
    if (kept > 0) setMsg([`The settings changed on the server; your ${kept} change(s) are kept.`]);
    paintSave();
  }
  function onReading(data) {
    if (!latest || data.t >= latest.t) { latest = data; drawLadder(); }
  }
  function onRoom(data) {
    room = data;
    const rr = room.live && room.live.reading;
    if (rr && (!latest || rr.t >= latest.t)) latest = rr;
    drawLadder(); paintProgram(); paintDetails(false); paintSave();
  }
  async function onReconnect() {
    UI.say(lvMsg, 'info', '');
    const jobs = [loadVersions()];
    if (!saving) {
      jobs.push((async () => {
        try {
          const fresh = await api.getSettings(id);
          if (!alive() || saving) return;
          if (!base || !panel) { base = fresh; if (!panel) createPanel(); drawLadder(); return; }
          const changed = SP.diffSettings(base, fresh).length;
          const { settings, kept } = rebase(base, panel.get(), fresh);
          base = fresh; panel.set(settings); drawLadder();
          if (changed > 0 && kept > 0) setMsg([`The settings changed on the server; your ${kept} change(s) are kept.`]);
          paintSave();
        } catch (e) { if (alive()) fail(e); }
      })());
    }
    await Promise.all(jobs);
  }
  offs.push(ctx.on('reading', onReading), ctx.on('room', onRoom), ctx.on('settings', data => onSettings(data)),
    ctx.on('open', data => { if (data && data.reconnect) onReconnect(); }), ctx.on('down', () => {}));

  // ---- user actions ----
  rdName.addEventListener('input', paintSave);
  rdVolume.addEventListener('input', paintSave);
  saveBtn.addEventListener('click', async () => {
    if (saving) return;
    const changes = panel && base ? panel.diff(base) : [];
    const details = detailChanges(room, detailForm());
    const lines = [...changes, ...detailLines(room, details)];
    if (!lines.length) return;
    const note = await SP.showChanges(lines, { title: `Save these changes to ${room.name}?`, confirmText: 'Save', note: changes.length > 0 });
    if (note === null || !alive()) return;
    saving = true; paintSave();
    UI.markFields(detailsForm, {});
    const messages = [];
    let level = 'good';
    try {
      if (changes.length) {
        const sent = panel.get();
        try {
          const { settings, warnings } = await api.saveSettings(id, sent, note);
          if (!alive()) return;
          base = settings;
          panel.set(rebase(sent, panel.get(), settings).settings);
          if (warnings && warnings.length) { messages.push(...warnings); level = 'info'; }
          drawLadder(); loadVersions();
        } catch (e) { if (alive()) setMsg([UI.errorText(e)], 'error'); return; }
      }
      if (Object.keys(details).length) {
        try {
          const r = await api.updateRoom(id, details);
          if (!alive()) return;
          room = r; paintDetails(true);
        } catch (e) {
          if (!alive()) return;
          const p = UI.plainError(e, { name: 'Name', volume: 'Room size' });
          setMsg([...messages, p.text], 'error'); UI.markFields(detailsForm, p.fields); return;
        }
      }
      setMsg(messages.length ? messages : ['Saved.'], level);
    } finally { if (alive()) { saving = false; paintSave(); } }
  });
  discardBtn.addEventListener('click', () => {
    if (panel) panel.set(base);
    paintDetails(true); UI.markFields(detailsForm, {});
    setMsg([]); drawLadder(); paintSave();
  });
  async function restore(v) {
    if (!global.confirm(`Make the version of ${clock.stamp(v.saved_at)} current? Unsaved changes are lost.`)) return;
    saving = true; paintSave();
    try {
      const { settings, warnings } = await api.restoreSettings(id, v.id);
      if (!alive()) return;
      const old = base;
      base = settings;
      if (panel) panel.set(settings); else createPanel();
      setMsg([...(warnings || []), ...changeLines(SP.diffSettings(old, settings))]);
      drawLadder(); loadVersions();
    } catch (e) { if (alive()) setMsg([UI.errorText(e)], 'error'); }
    finally { if (alive()) { saving = false; paintSave(); renderVersions(); } }
  }
  rdArchive.addEventListener('click', async () => {
    if (!global.confirm(`Archive "${room.name}"? Its loop stops and it leaves the Rooms list. Its data is kept.`)) return;
    try {
      await api.updateRoom(id, { archived: true });
      if (alive()) { if (global.FarmShell && global.FarmShell.guardLeave) global.FarmShell.guardLeave(null); global.location.hash = '#/rooms'; }
    } catch (e) { if (alive()) fail(e, rdMsg); }
  });

  // ---- start ----
  paintDetails(true);
  teardown = () => {
    const step = f => { try { f(); } catch (e) { console.error(e); } };
    step(() => { mountSeq++; });
    step(() => global.FarmShell && global.FarmShell.guardLeave && global.FarmShell.guardLeave(null));
    for (const off of offs) step(off);
    step(() => panel && panel.destroy());
    step(() => ladder && ladder.destroy());
    step(() => { const d = document.querySelector('body > dialog[open]'); if (d) { d.close(); d.remove(); } });
  };
  return loadSettings();
}

function unmount() {
  const t = teardown; teardown = null;
  if (t) t();
}

global.FarmRoomTabs.register('settings', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
