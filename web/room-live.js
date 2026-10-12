// web/room-live.js: the Overview tab of a room (C12 5.3; docs/contracts/web.md sections 3.4, 3.9, 7.9; air.md section 7). Settings live in room-settings.js.
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
  lines.push(r.air === 1 ? 'Fresh air On' : 'Fresh air Off');
  lines.push(r.lights === 1 ? 'Lights on' : 'Lights off');
  lines.push(r.circ === 1 ? 'Circulation fan on' : 'Circulation fan off');
  if (Number.isFinite(r.power_w)) lines.push(`Power ${ui().watts(r.power_w)}`);
  return lines;
}

const MACHINE_NAME = { ac: 'Aircon', hu: 'Mister', air: 'Fresh-air fans', lights: 'Lights', circ: 'Circulation fan' };

// One tile per machine (C11 5.3): { dev, name, state, on, manual }. Empty before the first reading.
function machineTiles(r, manual) {
  if (!r) return [];
  const flagged = new Set(manual || []);
  const onOff = v => (v === 1 ? 'On' : 'Off');
  const tiles = [
    { dev: 'ac', on: r.ac_mode !== 'off', state: r.ac_mode === 'off' ? 'Off' : `${AC_WORD[r.ac_mode] ?? r.ac_mode} ${ui().fmtNum(r.ac_setpoint, 1)} °C` },
    { dev: 'hu', on: r.fog > 0, state: r.fog > 0 ? `Level ${r.fog}` : 'Off' },
    { dev: 'air', on: r.air === 1, state: onOff(r.air) },
    { dev: 'lights', on: r.lights === 1, state: onOff(r.lights) },
    { dev: 'circ', on: r.circ === 1, state: onOff(r.circ) },
  ].map(t => ({ ...t, name: MACHINE_NAME[t.dev], manual: flagged.has(t.dev) }));
  if (Number.isFinite(r.power_w)) tiles.push({ dev: 'power', name: 'Power', state: ui().watts(r.power_w), on: true, manual: false });
  return tiles;
}

// "Should be: ..." with the ramp note when the stored setpoint is still on its way (C11 5.3).
function targetsText(live, settings) {
  const t = live && live.targets;
  if (!t) return '';
  const f = ui().fmtNum;
  let text = `Should be: ${f(t.T, 1)} °C · ${f(t.RH, 0)} % · CO₂ under ${ui().nf(t.CO2)} ppm`;
  if (settings && Number.isFinite(settings.spT) && Math.abs(settings.spT - t.T) >= 0.05) {
    text += ` · moving to ${f(settings.spT, 1)} °C, ${f(settings.spRH, 0)} %`;
  }
  return text;
}

function alarmTexts(a, clock) {
  const state = (a.cleared_at === null ? 'Active' : `Cleared ${clock.stamp(a.cleared_at)}`) + ' · ' + (a.acked_at === null ? 'not acknowledged' : 'acknowledged');
  return { main: `${a.label} · since ${clock.stamp(a.raised_at)}`, state, canAck: a.acked_at === null };
}

function mergeEvent(events, ev) {
  if (events.some(e => e.id === ev.id)) return events;
  return [...events, ev].sort((a, b) => b.id - a.id);
}

const helpers = { airLive, airSub, windowQuery, gapFor, reconnectQuery, chartTargets, toChartPoint, retarget, mergePoints,
  readingTexts, machineLines, machineTiles, targetsText, alarmTexts, mergeEvent };

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
let mountSeq = 0;

function mount(el, ctx) {
  unmount(); // a mount that was never unmounted must not keep painting
  const api = global.FarmApi, UI = global.FarmUi;
  const clock = UI.farmClock();
  const id = ctx.id;
  let room = ctx.room();
  let latest = room.live ? room.live.reading : null;
  // a per-mount token: every reply checks it, so a late reply never paints into a newer mount of the same element
  const mine = ++mountSeq;
  const alive = () => mine === mountSeq;
  let base = null, windowS = 21600, points = [], events = [];
  let charts = null, loadSeq = 0, olderDone = false, alarms = [];
  const offs = [];
  const q = sel => el.querySelector(sel);

  // ---- markup (C12 5.3) ----
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
    tag({ id: 'lvAt' }), tag({ id: 'lvTargets' }), h('ul', { class: 'machines', id: 'lvMachines' }));
  const secAir = h('section', { class: 'card room-air' }, heading('h3', '', 'Fresh air'), tag({ id: 'airSub' }), h('p', { id: 'airState' }), tag({ id: 'airWhy' }));
  const glance = h('div', { class: 'room-air' }, span({}, 'Fresh air'), span({ id: 'airGlance' }), span({ class: 'tag', id: 'airDay' }));
  const filters = h('div', { class: 'filters' }, winSeg, span({ class: 'tag' }, 'Farm time (UTC+8). A gap means no readings were recorded.'));
  const chartsHost = h('div', { class: 'contents', id: 'lvCharts' });
  const alarmList = h('ul', { class: 'al-list', id: 'lvAlarmList' });
  const secAlarms = h('section', { class: 'card alarms' }, heading('h2', 'eyebrow', 'Alarms'), alarmList);
  const logList = h('ol', { id: 'lvLog' });
  const olderBtn = btn('Older', { id: 'lvOlder' });
  const secLog = h('section', { class: 'card log' }, heading('h2', 'eyebrow', 'Event log'), logList, olderBtn);
  const lvMsg = h('p', { class: 'room-msg', id: 'lvMsg', role: 'status', hidden: '' });
  el.replaceChildren(secLive, secAir, glance, filters, chartsHost, secAlarms, secLog, lvMsg);

  const fail = e => { UI.say(lvMsg, 'error', UI.errorText(e)); };
  const tg = () => chartTargets(room.live, base);

  // ---- painting ----
  function paintChipOrHide(node, kind, chip) {
    if (chip) { node.hidden = false; UI.paintChip(node, UI.plainChip(kind, chip)); } else { node.hidden = true; node.replaceChildren(); delete node.dataset.txt; }
  }
  function paintValues() {
    const t = readingTexts(latest, clock), st = (room.live && room.live.status) || {};
    q('#lvT .val').textContent = t.T; q('#lvRH .val').textContent = t.RH; q('#lvCO2 .val').textContent = t.CO2;
    paintChipOrHide(q('#lvT .chip'), 'T', st.T); paintChipOrHide(q('#lvRH .chip'), 'RH', st.RH); paintChipOrHide(q('#lvCO2 .chip'), 'CO2', st.CO2);
    q('#lvAt').textContent = t.at;
    q('#lvTargets').textContent = targetsText(room.live, base);
    q('#lvMachines').replaceChildren(...machineTiles(latest, room.live && room.live.manual).map(t => {
      const li = h('li', { class: 'machine', 'data-dev': t.dev, 'data-on': t.on ? '1' : '0', 'data-manual': t.manual ? '1' : '0' },
        span({ class: 'm-name' }, t.name), span({ class: 'm-state' }, t.state));
      if (t.manual) li.append(span({ class: 'm-flag' }, 'Manual'));
      return li;
    }));
  }
  function paintAir() {
    const a = room.live ? room.live.air : null, o = airLive(a, base);
    q('#airSub').textContent = airSub(base);
    q('#airState').textContent = o.state;
    q('#airWhy').textContent = (a && a.why) || '';
    q('#airGlance').textContent = o.glance; q('#airDay').textContent = o.day;
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
          try { await api.ackAlarm(id, a.alarm_key); await loadAlarms(); } catch (e) { if (alive()) { fail(e); b.disabled = false; } }
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

  // ---- loads ----
  async function loadReadings() {
    const seq = ++loadSeq, now = nowS(), qy = windowQuery(windowS, now);
    try {
      const rows = await api.getReadings(id, qy);
      if (seq !== loadSeq || !alive()) return;
      const t = tg();
      for (const r of rows) points = mergePoints(points, toChartPoint(r, t), qy.from);
      drawCharts();
    } catch (e) { if (alive() && seq === loadSeq) fail(e); }
  }
  async function loadAlarms() {
    try { const a = await api.getAlarms(id); if (!alive()) return; alarms = a; renderAlarms(); } catch (e) { if (alive()) fail(e); }
  }
  async function loadEvents(reset) {
    if (reset) { events = []; olderDone = false; }
    try {
      const page = await api.getEvents(id, { limit: 100 });
      if (!alive()) return;
      for (const ev of page) events = mergeEvent(events, ev);
      if (!page.length) olderDone = true;
      renderLog();
    } catch (e) { if (alive()) fail(e); }
  }
  function afterBase() {
    paintValues(); paintAir();
    points = retarget(points, tg()); drawCharts();
  }
  // The settings are read only here: the targets, the air size and the chart lines come from them.
  async function loadSettings() {
    try {
      const s = await api.getSettings(id);
      if (!alive()) return;
      base = s;
      afterBase();
    } catch (e) { if (alive()) fail(e); }
  }

  // ---- stream events (5.4) ----
  function onReading(data) {
    if (!latest || data.t >= latest.t) { latest = data; paintValues(); }
    points = mergePoints(points, toChartPoint(data, tg()), nowS() - windowS);
    drawCharts();
  }
  function onRoom(data) {
    room = data;
    const rr = room.live && room.live.reading;
    if (rr && (!latest || rr.t >= latest.t)) latest = rr;
    paintValues(); paintAir();
    points = retarget(points, tg()); drawCharts();
  }
  async function onReconnect() {
    UI.say(lvMsg, 'info', '');
    const now = nowS(), rq = reconnectQuery(windowS, points.length ? points[points.length - 1].t : null, now);
    const jobs = [];
    if (rq) {
      if (rq.merge) {
        const seq = ++loadSeq;
        jobs.push((async () => {
          try {
            const rows = await api.getReadings(id, { from: rq.from, to: rq.to, step: rq.step });
            if (seq !== loadSeq || !alive()) return;
            const t = tg();
            for (const r of rows) points = mergePoints(points, toChartPoint(r, t), now - windowS);
            drawCharts();
          } catch (e) { if (alive()) fail(e); }
        })());
      } else { points = []; jobs.push(loadReadings()); }
    }
    jobs.push(loadAlarms(), loadEvents(true), loadSettings());
    await Promise.all(jobs);
  }
  offs.push(ctx.on('reading', onReading), ctx.on('room', onRoom), ctx.on('alarm', () => loadAlarms()),
    ctx.on('event', data => { events = mergeEvent(events, data); renderLog(); }),
    ctx.on('settings', data => { base = data.settings; afterBase(); }),
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
      if (!alive()) return;
      for (const ev of page) events = mergeEvent(events, ev);
      if (!page.length) olderDone = true;
      renderLog();
      olderBtn.disabled = false;
    } catch (e) { if (alive()) { fail(e); olderBtn.disabled = false; } }
  });

  // ---- start ----
  charts = global.FarmCharts.createTrendCharts(chartsHost, { keys: ['T', 'RH', 'C'], power: false, clock,
    status: k => (room && room.live && room.live.status) ? room.live.status[k] : null });
  paintValues(); paintAir(); renderLog();
  drawCharts();
  teardown = () => {
    const step = f => { try { f(); } catch (e) { console.error(e); } };
    step(() => { mountSeq++; });
    for (const off of offs) step(off);
    step(() => charts && charts.destroy());
  };
  return Promise.all([loadReadings(), loadAlarms(), loadEvents(false), loadSettings()]).then(() => undefined);
}

function unmount() {
  const t = teardown; teardown = null;
  if (t) t();
}

global.FarmRoomTabs.register('overview', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
