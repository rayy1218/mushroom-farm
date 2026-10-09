// web/room-live.js: the Live tab of a room (docs/contracts/web.md sections 3.4, 3.9, 7.9; air.md section 7).
(function (global) {
'use strict';

const ui = () => global.FarmUi;
const ms = s => ui().fmtMinSec(Math.round(s));

// ---------------- pure helpers (5.2) ----------------
const ON_REASON = { timed: 'Timed purge', 'free cooling': 'Free cooling', drying: 'Drying', manual: 'Manual on' };
const CHIP_IDLE = () => ({ lvl: 'none', icon: '○', text: 'Idle' });

function airLive(air, settings) {
  if (!air) return { state: '–', glance: '–', chip: null, day: '' };
  let state, glance, chip;
  if (air.on && air.reason === 'purge') {
    const t = ms(air.purgeS ?? 0);
    state = settings ? `Purge ${t} of ${ms(settings.rules.purgeMaxS)}` : `Purge ${t}`;
    glance = `Purging ${t}`;
    chip = { lvl: 'info', icon: '▲', text: 'Purging' };
  } else if (air.on && air.reason === 'safety') {
    state = glance = 'Safety run'; chip = { lvl: 'serious', icon: '◆', text: 'Safety run' };
  } else if (air.on) {
    state = glance = ON_REASON[air.reason] ?? 'On'; chip = { lvl: 'info', icon: '●', text: state };
  } else if (air.manual && air.manualOn) {
    state = glance = 'Manual on'; chip = { lvl: 'info', icon: '●', text: 'Manual on' };
  } else if (air.manual) {
    state = glance = 'Manual off'; chip = { lvl: 'none', icon: '○', text: 'Manual off' };
  } else if (air.delayed) {
    state = glance = 'Delayed (humidity first)'; chip = { lvl: 'info', icon: '❚❚', text: 'Delayed' };
  } else if (air.timed) {
    state = glance = 'Timed purge · off'; chip = CHIP_IDLE();
  } else if (air.nextPurgeS > 0) {
    const m = Math.max(1, Math.ceil(air.nextPurgeS / 60));
    state = `Idle · purge in about ${m} min`; glance = `Next purge in about ${m} min`; chip = CHIP_IDLE();
  } else {
    state = glance = 'Idle'; chip = CHIP_IDLE();
  }
  const d = air.today;
  let day = `Purges ${d.purges} · average ${d.purges ? ms(d.avgS) : '–'}`;
  if (d.capped > 0) day += ` · ${d.capped} capped`;
  return { state, glance, chip, day };
}

function airSub(settings) {
  return settings ? `SF-203 + EF-206 · ${ui().nf(settings.airM3h)} m³/h` : 'SF-203 + EF-206';
}

const STEPS = { 3600: undefined, 21600: undefined, 86400: 120, 604800: 900 };
function windowQuery(windowS, now) {
  if (!Object.prototype.hasOwnProperty.call(STEPS, windowS)) throw new RangeError(`Unknown chart window ${windowS}`);
  return { from: now - windowS, to: now, step: STEPS[windowS] };
}
const gapFor = step => 3 * Math.max(30, step || 0);
function reconnectQuery(windowS, lastT, now) {
  if (windowS === 3600 && Number.isFinite(lastT)) {
    const from = Math.max(lastT + 1, now - 3600);
    return from > now ? null : { from, to: now, step: undefined, merge: true };
  }
  return { ...windowQuery(windowS, now), merge: false };
}

function chartTargets(live, base) {
  const rules = base && base.rules;
  const src = live && live.targets ? { spT: live.targets.T, spRH: live.targets.RH, co2Lim: live.targets.CO2 } : base;
  const pick = (o, k) => (o && o[k] != null ? o[k] : NaN);
  return { spT: pick(src, 'spT'), spRH: pick(src, 'spRH'), co2Lim: pick(src, 'co2Lim'), fanOn: pick(rules, 'fanOn'), fanOff: pick(rules, 'fanOff') };
}

function toChartPoint(r, tg) {
  const S = global.ClimateController.SENSORS;
  const v = (x, k) => (x != null && Number.isFinite(x) && x >= S[k].min && x <= S[k].max ? x : NaN);
  return { t: r.t, T: v(r.T, 'T'), RH: v(r.RH, 'RH'), C: v(r.CO2, 'CO2'), tOut: v(r.t_out, 'tOut'), rhOut: v(r.rh_out, 'rhOut'),
    core: v(r.core, 'core'), spT: tg.spT, spRH: tg.spRH, co2Lim: tg.co2Lim, fanOn: tg.fanOn, fanOff: tg.fanOff };
}

const retarget = (pts, tg) => pts.map(p => ({ ...p, spT: tg.spT, spRH: tg.spRH, co2Lim: tg.co2Lim, fanOn: tg.fanOn, fanOff: tg.fanOff }));

function mergePoints(pts, p, from) {
  const out = pts.filter(q => q.t >= from && q.t !== p.t);
  if (p.t >= from) out.push(p);
  return out.sort((a, b) => a.t - b.t);
}

function readingTexts(r, clock) {
  if (!r) return { T: '—', RH: '—', CO2: '—', at: 'No reading yet' };
  const f = ui().fmtNum;
  return { T: `${f(r.T, 1)} °C`, RH: `${f(r.RH, 0)} % RH`, CO2: `${f(r.CO2, 0)} ppm`, at: `Reading at ${clock.stamp(r.t)}` };
}

const AC_WORD = { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan only' };
function machineLines(r) {
  if (!r) return [];
  const lines = [];
  lines.push(r.ac_mode === 'off' ? 'AC off' : `AC ${AC_WORD[r.ac_mode] ?? r.ac_mode} ${ui().fmtNum(r.ac_setpoint, 1)} °C`);
  lines.push(r.fog > 0 ? `Fogger level ${r.fog}` : 'Fogger off');
  lines.push(r.air === 1 ? 'Air exchange On' : 'Air exchange Off');
  lines.push(r.lights === 1 ? 'Lights on' : 'Lights off');
  lines.push(r.circ === 1 ? 'Circulation fan on' : 'Circulation fan off');
  if (Number.isFinite(r.power_w)) lines.push(`Power ${ui().watts(r.power_w)}`);
  return lines;
}

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

function alarmTexts(a, clock) {
  const state = (a.cleared_at === null ? 'Active' : `Cleared ${clock.stamp(a.cleared_at)}`) + ' · ' + (a.acked_at === null ? 'not acknowledged' : 'acknowledged');
  return { main: `${a.label} · since ${clock.stamp(a.raised_at)}`, state, canAck: a.acked_at === null };
}

function mergeEvent(events, ev) {
  if (events.some(e => e.id === ev.id)) return events;
  return [...events, ev].sort((a, b) => b.id - a.id);
}

function detailChanges(room, form) {
  const out = {};
  if (form.name.trim() !== room.name) out.name = form.name.trim();
  if (Number(form.volume) !== room.volume) out.volume = Number(form.volume);
  return out;
}

const countText = n => (n === 0 ? '' : `${n} unsaved change(s)`);
const changeLines = changes => changes.map(c => `${c.label}: ${c.oldText} → ${c.newText}`);
const versionText = (v, clock, current) => `${clock.stamp(v.saved_at)} · ${v.note ?? '—'}` + (current ? ' · current' : '');

const helpers = { airLive, airSub, windowQuery, gapFor, reconnectQuery, chartTargets, toChartPoint, retarget, mergePoints,
  readingTexts, machineLines, programText, commandFromReading, alarmTexts, mergeEvent, detailChanges, countText, changeLines, versionText };
function rebase(from, edited, to) {
  const SP = global.FarmSettingsPanel;
  const pending = SP.diffSettings(from, edited);
  return { settings: SP.applyChanges(to, pending), kept: pending.length };
}
helpers.rebase = rebase;

// ---------------- DOM ----------------
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k of Object.keys(attrs || {})) {
    if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
  }
  for (const c of kids) e.append(c);
  return e;
}
const WINDOWS = [[3600, '1 h'], [21600, '6 h'], [86400, '24 h'], [604800, '7 days']];
const nowS = () => Math.floor(Date.now() / 1000);

let teardown = null;

function mount(el, ctx) {
  const api = global.FarmApi, UI = global.FarmUi, SP = global.FarmSettingsPanel;
  const clock = UI.farmClock();
  const id = ctx.id;
  let room = ctx.room();
  let latest = room.live ? room.live.reading : null;
  let base = null, saving = false, windowS = 21600, points = [], events = [];
  let panel = null, charts = null, ladder = null, alive = true, loadSeq = 0, pendingSettings = null;
  let olderDone = false, alarms = [], versions = [];
  const offs = [];
  const q = sel => el.querySelector(sel);

  // ---- markup (5.3) ----
  const rv = (ido, label) => h('div', { class: 'rv', id: ido }, h('span', {}, label), h('span', { class: 'val' }), h('span', { class: 'chip' }));
  const winSeg = h('div', { class: 'seg', id: 'lvWinSeg', role: 'group', 'aria-label': 'Chart time window' });
  for (const [w, label] of WINDOWS) {
    const b = h('button', { type: 'button', 'data-win': String(w), 'aria-pressed': String(w === windowS) }, label);
    winSeg.append(b);
  }
  const btn = (txt, attrs) => { const b = h('button', { class: 'btn', type: 'button', ...attrs }); b.textContent = txt; return b; };
  const tag = (attrs, txt) => { const p = h('p', { class: 'tag', ...attrs }); if (txt) p.textContent = txt; return p; };
  const heading = (tagName, cls, txt) => { const e = h(tagName, cls ? { class: cls } : {}); e.textContent = txt; return e; };
  const span = (attrs, txt) => { const e = h('span', attrs || {}); if (txt) e.textContent = txt; return e; };

  const secLive = h('section', { class: 'card room-live' }, rv('lvT', 'Temperature'), rv('lvRH', 'Humidity'), rv('lvCO2', 'CO₂'),
    tag({ id: 'lvAt' }), tag({ id: 'lvTargets' }), h('ul', { id: 'lvMachines' }));
  const secAir = h('section', { class: 'card room-air' }, heading('h3', '', 'Air exchange'), tag({ id: 'airSub' }), h('p', { id: 'airState' }), tag({ id: 'airWhy' }));
  const glance = h('div', { class: 'room-air' }, span({}, 'Air exchange'), span({ id: 'airGlance' }), span({ class: 'tag', id: 'airDay' }));
  const filters = h('div', { class: 'filters' }, winSeg, span({ class: 'tag' }, 'Farm time (UTC+8). A gap means no readings were recorded.'));
  const chartsHost = h('div', { class: 'contents', id: 'lvCharts' });
  const alarmList = h('ul', { class: 'al-list', id: 'lvAlarmList' });
  const secAlarms = h('section', { class: 'card alarms' }, heading('h2', 'eyebrow', 'Alarms'), alarmList);
  const logList = h('ol', { id: 'lvLog' });
  const olderBtn = btn('Older', { id: 'lvOlder' });
  const secLog = h('section', { class: 'card log' }, heading('h2', 'eyebrow', 'Event log'), logList, olderBtn);
  const saveBtn = btn('Save', { id: 'spSave', disabled: '' }), discardBtn = btn('Discard', { id: 'spDiscard', disabled: '' });
  const spMsg = h('ul', { class: 'room-msg', id: 'spMsg', role: 'status' });
  const head = h('div', { class: 'section-head' }, heading('h2', '', 'Settings'), span({ class: 'tag', id: 'spCount' }), saveBtn, discardBtn, spMsg);
  const spHost = h('div', { class: 'contents', id: 'spHost' });
  const verList = h('ol', { id: 'lvVersions' });
  const secVer = h('section', { class: 'card room-versions' }, heading('h2', 'eyebrow', 'Settings versions'), verList);
  const rdName = h('input', { id: 'rdName', type: 'text', maxlength: '60' });
  const rdVolume = h('input', { id: 'rdVolume', type: 'number', min: '5', max: '5000' });
  const rdSave = btn('Save details', { id: 'rdSave' }), rdArchive = btn('Archive room', { id: 'rdArchive' });
  const rdMsg = tag({ id: 'rdMsg', role: 'status' });
  const secDetails = h('section', { class: 'card room-details' }, heading('h2', 'eyebrow', 'Room details'),
    heading('label', '', 'Name'), rdName, heading('label', '', 'Volume (m³)'), rdVolume, rdSave, rdArchive,
    span({ class: 'tag' }, 'A new volume restarts the room\'s loop.'), rdMsg);
  const lvMsg = h('p', { class: 'tag room-msg', id: 'lvMsg', role: 'status' });
  el.replaceChildren(secLive, secAir, glance, filters, chartsHost, secAlarms, secLog, head, spHost, secVer, secDetails, lvMsg);
  rdName.id = 'rdName'; rdVolume.id = 'rdVolume';
  rdName.previousSibling.setAttribute('for', 'rdName'); rdVolume.previousSibling.setAttribute('for', 'rdVolume');

  const fail = (e, target) => { (target || lvMsg).textContent = UI.errorText(e); };
  const tg = () => chartTargets(room.live, base);

  // ---- painting ----
  function paintChipOrHide(node, chip) {
    if (chip) { node.hidden = false; UI.paintChip(node, chip); } else { node.hidden = true; node.replaceChildren(); delete node.dataset.txt; }
  }
  function paintValues() {
    const t = readingTexts(latest, clock), st = (room.live && room.live.status) || {};
    q('#lvT .val').textContent = t.T; q('#lvRH .val').textContent = t.RH; q('#lvCO2 .val').textContent = t.CO2;
    paintChipOrHide(q('#lvT .chip'), st.T); paintChipOrHide(q('#lvRH .chip'), st.RH); paintChipOrHide(q('#lvCO2 .chip'), st.CO2);
    q('#lvAt').textContent = t.at;
    const tt = room.live && room.live.targets;
    q('#lvTargets').textContent = tt ? `Targets now: ${UI.fmtNum(tt.T, 1)} °C · ${UI.fmtNum(tt.RH, 0)} % RH · CO₂ limit ${UI.fmtNum(tt.CO2, 0)} ppm` : '';
    q('#lvMachines').replaceChildren(...machineLines(latest).map(l => { const li = document.createElement('li'); li.textContent = l; return li; }));
  }
  function paintAir() {
    const a = room.live ? room.live.air : null, o = airLive(a, base);
    q('#airSub').textContent = airSub(base);
    q('#airState').textContent = o.state;
    q('#airWhy').textContent = (a && a.why) || '';
    q('#airGlance').textContent = o.glance; q('#airDay').textContent = o.day;
  }
  function drawLadder() {
    if (!ladder || !panel) return;
    const a = airLive(room.live ? room.live.air : null, base);
    ladder.draw(panel.get(), latest ? (latest.CO2 ?? NaN) : NaN, { air: a.chip });
  }
  function paintProgram() {
    const slot = spHost.querySelector('[data-slot="program-status"]');
    if (!slot) return;
    const p = h('p', { class: 'prog-status' }); p.textContent = programText(room.live);
    slot.replaceChildren(p);
  }
  function paintDetails(force) {
    if (!force && (document.activeElement === rdName || document.activeElement === rdVolume)) return;
    rdName.value = room.name; rdVolume.value = String(room.volume);
  }
  function paintSave() {
    if (!panel) return;
    const n = panel.diff(base).length;
    q('#spCount').textContent = countText(n);
    saveBtn.disabled = discardBtn.disabled = n === 0 || saving;
    verList.querySelectorAll('button').forEach(b => { b.disabled = saving; });
  }
  function setMsg(lines) {
    spMsg.replaceChildren(...lines.map(l => { const li = document.createElement('li'); li.textContent = l; return li; }));
  }
  function drawCharts() {
    if (!charts) return;
    const now = nowS();
    charts.draw({ t0: now - windowS, t1: now, pts: points, gapS: gapFor(windowQuery(windowS, now).step) });
  }
  function renderAlarms() {
    if (!alarms.length) {
      const p = h('p', { class: 'est-note' }); p.textContent = 'No alarms.';
      alarmList.replaceChildren(p); return;
    }
    alarmList.replaceChildren(...alarms.map(a => {
      const t = alarmTexts(a, clock), li = h('li', { 'data-lvl': a.level });
      const ico = span({ class: 'ico', 'aria-hidden': 'true' }, UI.ICON[a.level]);
      li.append(ico, span({}, t.main), span({ class: 'al-state' }, t.state));
      if (t.canAck) {
        const b = btn('Acknowledge', {});
        b.addEventListener('click', async () => {
          b.disabled = true;
          try { await api.ackAlarm(id, a.alarm_key); await loadAlarms(); } catch (e) { if (alive) { fail(e); b.disabled = false; } }
        });
        li.append(b);
      }
      return li;
    }));
  }
  function renderLog() {
    logList.replaceChildren(...events.map(ev => {
      const li = h('li', { 'data-lvl': ev.level });
      const time = h('time'); time.textContent = clock.stamp(ev.t);
      li.append(time, span({ class: 'ico', 'aria-hidden': 'true' }, UI.ICON[ev.level] || ''), span({}, ev.text));
      return li;
    }));
    olderBtn.hidden = olderDone;
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
  async function loadReadings() {
    const seq = ++loadSeq, now = nowS(), qy = windowQuery(windowS, now);
    try {
      const rows = await api.getReadings(id, qy);
      if (seq !== loadSeq || !alive) return;
      const t = tg();
      for (const r of rows) points = mergePoints(points, toChartPoint(r, t), qy.from);
      drawCharts();
    } catch (e) { if (alive && seq === loadSeq) fail(e); }
  }
  async function loadAlarms() {
    try { const a = await api.getAlarms(id); if (!alive) return; alarms = a; renderAlarms(); } catch (e) { if (alive) fail(e); }
  }
  async function loadEvents(reset) {
    try {
      const page = await api.getEvents(id, { limit: 100 });
      if (!alive) return;
      if (reset) events = [];
      for (const ev of page) events = mergeEvent(events, ev);
      if (!page.length) olderDone = true;
      renderLog();
    } catch (e) { if (alive) fail(e); }
  }
  async function loadVersions() {
    try { const v = await api.listSettingsHistory(id); if (!alive) return; versions = v; renderVersions(); paintSave(); } catch (e) { if (alive) fail(e); }
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
  function afterBase() {
    paintAir(); drawLadder();
    points = retarget(points, tg()); drawCharts();
  }
  async function loadSettings() {
    try {
      const s = await api.getSettings(id);
      if (!alive) return;
      base = s;
      if (!panel) createPanel();
      afterBase();
      if (pendingSettings) { const d = pendingSettings; pendingSettings = null; onSettings(d); }
    } catch (e) { if (alive) fail(e); }
    await loadVersions();
  }

  // ---- stream events (5.4) ----
  function onSettings(data) {
    if (saving) return;
    if (!base || !panel) { pendingSettings = data; return; }
    const { settings, kept } = rebase(base, panel.get(), data.settings);
    base = data.settings;
    panel.set(settings);
    afterBase();
    loadVersions();
    if (kept > 0) setMsg([`The settings changed on the server; your ${kept} change(s) are kept.`]);
    paintSave();
  }
  function onReading(data) {
    if (!latest || data.t >= latest.t) { latest = data; paintValues(); drawLadder(); }
    points = mergePoints(points, toChartPoint(data, tg()), nowS() - windowS);
    drawCharts();
  }
  function onRoom(data) {
    room = data;
    const rr = room.live && room.live.reading;
    if (rr && (!latest || rr.t >= latest.t)) latest = rr;
    paintValues(); paintAir(); drawLadder(); paintProgram(); paintDetails(false);
    points = retarget(points, tg()); drawCharts();
  }
  async function onReconnect() {
    const now = nowS(), rq = reconnectQuery(windowS, points.length ? points[points.length - 1].t : null, now);
    const jobs = [];
    if (rq) {
      if (rq.merge) {
        const seq = ++loadSeq;
        jobs.push((async () => {
          try {
            const rows = await api.getReadings(id, { from: rq.from, to: rq.to, step: rq.step });
            if (seq !== loadSeq || !alive) return;
            const t = tg();
            for (const r of rows) points = mergePoints(points, toChartPoint(r, t), now - windowS);
            drawCharts();
          } catch (e) { if (alive) fail(e); }
        })());
      } else { points = []; jobs.push(loadReadings()); }
    }
    jobs.push(loadAlarms(), loadEvents(true), loadVersions());
    if (!saving) {
      jobs.push((async () => {
        try {
          const fresh = await api.getSettings(id);
          if (!alive || saving) return;
          if (!base || !panel) { base = fresh; if (!panel) createPanel(); afterBase(); return; }
          const changed = SP.diffSettings(base, fresh).length;
          const { settings, kept } = rebase(base, panel.get(), fresh);
          base = fresh; panel.set(settings); afterBase();
          if (changed > 0 && kept > 0) setMsg([`The settings changed on the server; your ${kept} change(s) are kept.`]);
          paintSave();
        } catch (e) { if (alive) fail(e); }
      })());
    }
    await Promise.all(jobs);
  }
  offs.push(ctx.on('reading', onReading), ctx.on('room', onRoom), ctx.on('alarm', () => loadAlarms()),
    ctx.on('event', data => { events = mergeEvent(events, data); renderLog(); }),
    ctx.on('settings', data => onSettings(data)),
    ctx.on('open', data => { if (data && data.reconnect) onReconnect(); }),
    ctx.on('down', () => {}));

  // ---- user actions ----
  winSeg.addEventListener('click', e => {
    const b = e.target.closest('button[data-win]'); if (!b) return;
    winSeg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    windowS = Number(b.dataset.win); points = []; drawCharts(); loadReadings();
  });
  olderBtn.addEventListener('click', async () => {
    olderBtn.disabled = true;
    try {
      const before = events.length ? Math.min(...events.map(e => e.id)) : undefined;
      const page = await api.getEvents(id, { limit: 100, before });
      if (!alive) return;
      for (const ev of page) events = mergeEvent(events, ev);
      if (!page.length) olderDone = true;
      renderLog();
      olderBtn.disabled = false;
    } catch (e) { if (alive) { fail(e); olderBtn.disabled = false; } }
  });
  saveBtn.addEventListener('click', async () => {
    if (!panel || saving) return;
    const changes = panel.diff(base);
    if (!changes.length) return;
    const note = await SP.showChanges(changes, { title: `Save these changes to ${room.name}?`, confirmText: 'Save', note: true });
    if (note === null || !alive) return;
    const sent = panel.get();
    saving = true; paintSave();
    try {
      const { settings, warnings } = await api.saveSettings(id, sent, note);
      if (!alive) return;
      base = settings;
      panel.set(rebase(sent, panel.get(), settings).settings);
      setMsg(warnings && warnings.length ? warnings : ['Saved.']);
      afterBase(); loadVersions();
    } catch (e) { if (alive) setMsg([UI.errorText(e)]); }
    finally { if (alive) { saving = false; paintSave(); } }
  });
  discardBtn.addEventListener('click', () => { if (!panel) return; panel.set(base); setMsg([]); drawLadder(); paintSave(); });
  async function restore(v) {
    if (!global.confirm(`Make the version of ${clock.stamp(v.saved_at)} current? Unsaved changes are lost.`)) return;
    saving = true; paintSave();
    try {
      const { settings, warnings } = await api.restoreSettings(id, v.id);
      if (!alive) return;
      const old = base;
      base = settings; panel.set(settings);
      setMsg([...(warnings || []), ...changeLines(SP.diffSettings(old, settings))]);
      afterBase(); loadVersions();
    } catch (e) { if (alive) setMsg([UI.errorText(e)]); }
    finally { if (alive) { saving = false; paintSave(); renderVersions(); } }
  }
  rdSave.addEventListener('click', async () => {
    const changes = detailChanges(room, { name: rdName.value, volume: rdVolume.value });
    if (!Object.keys(changes).length) { rdMsg.textContent = 'Nothing to change.'; return; }
    try {
      const r = await api.updateRoom(id, changes);
      if (!alive) return;
      room = r; paintDetails(true); rdMsg.textContent = 'Saved.';
    } catch (e) { if (alive) fail(e, rdMsg); }
  });
  rdArchive.addEventListener('click', async () => {
    if (!global.confirm(`Archive "${room.name}"? Its loop stops and it leaves the Rooms list. Its data is kept.`)) return;
    try { await api.updateRoom(id, { archived: true }); if (alive) global.location.hash = '#/rooms'; } catch (e) { if (alive) fail(e, rdMsg); }
  });

  // ---- start ----
  charts = global.FarmCharts.createTrendCharts(chartsHost, { keys: ['T', 'RH', 'C'], power: false, clock,
    status: k => (room && room.live && room.live.status) ? room.live.status[k] : null });
  paintValues(); paintAir(); paintDetails(true); renderAlarms(); renderLog();
  drawCharts();
  teardown = () => {
    const step = f => { try { f(); } catch (e) { console.error(e); } };
    step(() => { alive = false; });
    for (const off of offs) step(off);
    step(() => panel && panel.destroy());
    step(() => charts && charts.destroy());
    step(() => ladder && ladder.destroy());
    step(() => { const d = document.querySelector('body > dialog[open]'); if (d) { d.close(); d.remove(); } });
  };
  return Promise.all([loadReadings(), loadAlarms(), loadEvents(false), loadSettings()]).then(() => undefined);
}

function unmount() {
  const t = teardown; teardown = null;
  if (t) t();
}

global.FarmRoomTabs.register('live', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
