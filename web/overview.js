// web/overview.js: the farm Overview page, #/overview (C12 4): "is my farm OK?" at a glance.
(function (global) {
'use strict';

const OFFSET_S = 28800;          // farm time is UTC+8, no DST
const DAY_S = 86400;
const RM_PER_KWH = 0.57;         // lead decision 98
const HIDE_KEY = 'mushroom-farm.start.hidden';
const ROOMS_MS = 30000;
const SLOW_MS = 300000;          // readings, energy, sparklines
const MID_MS = 60000;            // events, harvest, checklist data
const SPARK_W = 140, SPARK_H = 36;
const MACHINES = ['ac', 'hu', 'air', 'lights', 'circ'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

let mountSeq = 0;
let active = null;               // the mounted page's context (timers, listeners), or null

// ---------------- pure helpers (tested in tests/web-overview.test.js) ----------------

const pad2 = n => String(n).padStart(2, '0');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const finite = x => typeof x === 'number' && Number.isFinite(x);

// Unix s of 00:00 farm time on the day of t.
function dayStart(t) { return Math.floor((t + OFFSET_S) / DAY_S) * DAY_S - OFFSET_S; }

// 'Monday 12 October' (farm time).
function dateText(t) {
  const d = new Date((t + OFFSET_S) * 1000);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// 'HH:MM' for an event of today, else '12 Oct HH:MM' (farm time).
function eventTime(t, nowS) {
  const d = new Date((t + OFFSET_S) * 1000);
  const hm = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  if (nowS == null || dayStart(t) === dayStart(nowS)) return hm;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${hm}`;
}

// kWh used today (C12 4 Energy, lead decision 101): the sum of the rises of the meter; a restart (a drop) counts 0; null rows are skipped.
// An averaged row's kwh is the meter at the end of its bucket, so with startS (00:00 farm time) the last row before it is the baseline.
function kwhToday(rows, startS) {
  let sum = 0, prev = null;
  const sorted = (rows || []).filter(r => r && finite(r.kwh)).sort((a, b) => (a.t || 0) - (b.t || 0));
  for (const r of sorted) {
    if (startS != null && r.t < startS) { prev = r.kwh; continue; }
    if (prev !== null) sum += Math.max(0, r.kwh - prev);
    prev = r.kwh;
  }
  return Math.round(sum * 1000) / 1000;
}

// A sparkline: points [{ t, v }], size w x h, band { lo, hi } or null. Returns null when fewer than 2 usable points.
// { d, last: { x, y }, band: { y, h } | null, min, max } with the band clipped to the box.
function sparkPath(points, w, h, band) {
  const pts = (points || []).filter(p => p && finite(p.t) && finite(p.v)).sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const padX = 3, padY = 3;
  const vals = pts.map(p => p.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  let lo = min, hi = max;
  const hasBand = band && finite(band.lo) && finite(band.hi) && band.hi > band.lo;
  if (hasBand) { lo = Math.min(lo, band.lo); hi = Math.max(hi, band.hi); }
  if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const x = t => padX + (t1 > t0 ? (t - t0) / (t1 - t0) : 0) * (w - 2 * padX);
  const y = v => padY + (1 - (v - lo) / (hi - lo)) * (h - 2 * padY);
  const r = n => Math.round(n * 10) / 10;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${r(x(p.t))} ${r(y(p.v))}`).join(' ');
  const lastP = pts[pts.length - 1];
  let b = null;
  if (hasBand) {
    const top = y(band.hi), bottom = y(band.lo);
    b = { y: r(top), h: r(bottom - top) };
  }
  return { d, last: { x: r(x(lastP.t)), y: r(y(lastP.v)) }, band: b, min, max };
}

const fmtRange = (min, max, digits) => {
  const a = min.toFixed(digits), b = max.toFixed(digits);
  return a === b ? a : `${a} to ${b}`;
};
function sparkLabel(kind, min, max) {
  return kind === 'T' ? `Temperature, last 24 hours: ${fmtRange(min, max, 1)} °C` : `Humidity, last 24 hours: ${fmtRange(min, max, 0)} %`;
}

// The last 7 farm days of harvest, oldest first: [{ start, label, kg }]. crates: [{ t, kg }].
function weekBars(crates, nowS) {
  const today = dayStart(nowS);
  const bars = [];
  for (let i = 6; i >= 0; i--) {
    const start = today - i * DAY_S;
    const d = new Date((start + OFFSET_S) * 1000);
    bars.push({ start, label: DAYS[d.getUTCDay()].slice(0, 3), kg: 0 });
  }
  for (const c of crates || []) {
    if (!c || !finite(c.t) || !finite(c.kg) || c.deleted_at) continue;
    const bar = bars.find(b => c.t >= b.start && c.t < b.start + DAY_S);
    if (bar) bar.kg += c.kg;
  }
  for (const b of bars) b.kg = Math.round(b.kg * 100) / 100;
  return bars;
}

// The Getting started list (C12 4). state: { rooms, history: { [roomId]: versionCount }, batches, calibrations: { [roomId]: count }, installer }.
function checklist(state) {
  const rooms = state.rooms || [];
  const history = state.history || {};
  const calibrations = state.calibrations || {};
  const batches = state.batches || [];
  const firstUnset = rooms.find(r => !(history[r.id] > 1));
  const items = [
    { key: 'rooms', text: 'Add your rooms', done: rooms.length >= 1, href: '#/rooms' },
    { key: 'crop', text: 'Tell each room what it grows', done: rooms.length >= 1 && !firstUnset,
      href: rooms.length ? `#/rooms/${(firstUnset || rooms[0]).id}/settings` : '#/rooms' },
    { key: 'batch', text: 'Add the blocks you bought', done: batches.length >= 1, href: '#/batches' },
    { key: 'harvest', text: 'Record your first harvest', done: batches.some(b => b.totals && b.totals.kg > 0), href: '#/harvest' },
  ];
  if (state.installer) {
    const calibrated = rooms.find(r => calibrations[r.id] > 0);
    items.push({ key: 'calibrate', text: 'Calibrate a room after a day of readings', done: !!calibrated,
      href: rooms.length ? `#/rooms/${(calibrated || rooms[0]).id}/calibrate` : '#/rooms' });
  }
  return { items, allDone: items.every(i => i.done) };
}

// The n newest events over all rooms. perRoom: [{ room: { id, name }, events: Event[] }] -> events with room_name, newest first.
function mergeEvents(perRoom, n) {
  const all = [];
  for (const entry of perRoom || []) {
    for (const e of entry.events || []) all.push({ ...e, room_id: e.room_id ?? entry.room.id, room_name: entry.room.name });
  }
  all.sort((a, b) => (b.t - a.t) || ((b.id || 0) - (a.id || 0)));
  return all.slice(0, n);
}

// The four number tiles. opts: { kwh: number | null, kgToday: number, weekKg: number }.
function kpis(rooms, opts) {
  const o = opts || {};
  const list = rooms || [];
  const status = list.map(r => global.FarmUi.roomStatus(r));
  const ok = status.filter(s => s.lvl === 'good').length;
  const bad = list.length - ok;
  const alarmRooms = list.filter(r => r.live && r.live.alarms > 0);
  const alarms = alarmRooms.reduce((s, r) => s + r.live.alarms, 0);
  const kwh = finite(o.kwh) ? o.kwh : null;
  const kg = finite(o.kgToday) ? o.kgToday : 0;
  const week = finite(o.weekKg) ? o.weekKg : 0;
  return {
    rooms: { label: 'Rooms', value: String(ok), unit: ` of ${list.length} OK`, sub: bad ? `${bad} to check` : 'All good', lvl: bad ? 'warning' : 'good' },
    alarms: { label: 'Alarms', value: String(alarms), unit: '', sub: alarms ? alarmRooms.map(r => r.name).join(', ') : 'None open', lvl: alarms ? 'warning' : null },
    energy: { label: 'Energy today', value: kwh === null ? '–' : kwh.toFixed(1), unit: ' kWh',
      sub: kwh === null ? 'No readings yet' : `about RM ${(kwh * RM_PER_KWH).toFixed(2)}`, lvl: null },
    harvest: { label: 'Harvest', value: kg.toFixed(1), unit: ' kg today', sub: `${week.toFixed(1)} kg this week`, lvl: null },
  };
}

// The five machine dots of a room card: [{ key, name, on, manual }].
function machineStrip(room) {
  const r = room.live && room.live.reading;
  const manual = (room.live && room.live.manual) || [];
  const names = global.FarmUi.MACHINE_NAME;
  const on = {
    ac: r ? r.ac_mode !== 'off' : false,
    hu: r ? r.fog > 0 : false,
    air: r ? r.air === 1 : false,
    lights: r ? r.lights === 1 : false,
    circ: r ? r.circ === 1 : false,
  };
  return MACHINES.map(key => ({ key, name: names[key], on: on[key], manual: manual.includes(key) }));
}

function cropLine(live) {
  const CC = global.ClimateController;
  if (!live || live.crop == null) return '–';
  const crop = CC && CC.CROPS && CC.CROPS[live.crop] ? CC.CROPS[live.crop].name : live.crop;
  let s = crop;
  if (live.stage != null) s += ` · ${CC && CC.STAGES && CC.STAGES[live.stage] ? CC.STAGES[live.stage] : live.stage}`;
  if (live.flush != null) s += ` · flush ${live.flush}`;
  return s;
}

// The target band of a room's sparkline (C12 4 Sparkline).
function bandFor(kind, live) {
  const t = live && live.targets;
  if (!t || !finite(t[kind])) return null;
  const half = kind === 'T' ? 1 : 3;
  return { lo: t[kind] - half, hi: t[kind] + half };
}

// ---------------- DOM ----------------

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function sparkSvg(kind, points, band) {
  const { svgEl } = global.FarmUi;
  const p = sparkPath(points, SPARK_W, SPARK_H, band);
  if (!p) return null;
  const svg = svgEl('svg', { viewBox: `0 0 ${SPARK_W} ${SPARK_H}`, width: SPARK_W, height: SPARK_H, class: 'ov-spark', role: 'img',
    'aria-label': sparkLabel(kind, p.min, p.max), preserveAspectRatio: 'xMaxYMid meet' });
  if (p.band) svgEl('rect', { class: 'ov-band', x: 0, y: Math.max(0, p.band.y), width: SPARK_W, height: Math.max(0, Math.min(SPARK_H, p.band.y + p.band.h) - Math.max(0, p.band.y)) }, svg);
  svgEl('path', { class: 'ov-line', d: p.d, fill: 'none' }, svg);
  svgEl('circle', { class: 'ov-dot', cx: p.last.x, cy: p.last.y, r: 2.5 }, svg);
  return svg;
}

function barsSvg(bars) {
  const { svgEl } = global.FarmUi;
  const w = 84, h = 26, gap = 4, bw = (w - gap * 6) / 7;
  const max = Math.max(...bars.map(b => b.kg), 0.0001);
  const total = bars.reduce((s, b) => s + b.kg, 0);
  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, class: 'ov-bars', role: 'img',
    'aria-label': `Harvest, last 7 days: ${bars.map(b => `${b.label} ${b.kg.toFixed(1)} kg`).join(', ')}. Total ${total.toFixed(1)} kg` });
  bars.forEach((b, i) => {
    const bh = b.kg > 0 ? Math.max(2, (b.kg / max) * (h - 2)) : 1;
    svgEl('rect', { class: i === bars.length - 1 ? 'ov-bar ov-bar-today' : 'ov-bar', x: i * (bw + gap), y: h - bh, width: bw, height: bh, rx: 1 }, svg);
  });
  return svg;
}

function buildKpi(key) {
  const tile = el('section', 'card kpi');
  tile.dataset.kpi = key;
  const label = el('span', 'kpi-label');
  const value = el('span', 'kpi-value');
  const num = el('span', 'kpi-num'), unit = el('span', 'kpi-unit');
  value.append(num, unit);
  const sub = el('span', 'kpi-sub');
  const dot = el('span', 'kpi-dot'); dot.setAttribute('aria-hidden', 'true');
  const row = el('div', 'kpi-row');
  row.append(value);
  tile.append(label, row, sub);
  label.append(dot);
  const name = el('span'); label.append(name);
  return { tile, row, name, dot, num, unit, sub, extra: null };
}

function paintKpi(k, data, bars) {
  k.name.textContent = data.label;
  if (data.lvl) k.dot.dataset.lvl = data.lvl; else delete k.dot.dataset.lvl;
  k.dot.hidden = !data.lvl;
  k.num.textContent = data.value;
  k.unit.textContent = data.unit;
  k.sub.textContent = data.sub;
  if (bars) {
    if (k.extra) k.extra.remove();
    k.extra = barsSvg(bars);
    k.row.append(k.extra);
  }
}

function buildRoomCard(room) {
  const card = el('article', 'card ov-room');
  card.dataset.room = String(room.id);
  const head = el('div', 'ov-room-head');
  const h = el('h2', 'ov-room-name');
  const link = el('a'); h.append(link);
  const status = el('span', 'chip');
  head.append(h, status);
  const badges = el('div', 'ov-badges');
  const sim = el('span', 'chip'); sim.dataset.kind = 'sim'; sim.textContent = 'Simulated';
  const manual = el('span', 'chip'); manual.dataset.kind = 'manual';
  badges.append(sim, manual);
  const crop = el('p', 'ov-crop');
  const vals = el('div', 'ov-vals');
  const cells = {};
  for (const [k, label] of [['T', 'Temperature'], ['RH', 'Humidity'], ['CO2', 'CO₂']]) {
    const c = el('div', 'ov-val');
    c.dataset.k = k;
    const lab = el('span', 'ov-val-label', label);
    const num = el('span', 'ov-val-num');
    const chip = el('span', 'chip');
    c.append(lab, num, chip);
    let spark = null;
    if (k !== 'CO2') { spark = el('div', 'ov-spark-box'); c.append(spark); }
    vals.append(c);
    cells[k] = { num, chip, spark };
  }
  const strip = el('ul', 'ov-machines');
  strip.setAttribute('aria-label', 'Machines');
  const foot = el('div', 'ov-room-foot');
  const harvest = el('p', 'ov-harvest');
  const record = el('a', 'btn btn-primary btn-link', 'Record harvest');
  foot.append(harvest, record);
  card.append(head, badges, crop, vals, strip, foot);
  return { card, link, status, sim, manual, crop, cells, strip, harvest, record };
}

function fmt(x, d) { return finite(x) ? x.toFixed(d) : '–'; }

function paintRoomCard(r, room, data) {
  const { paintChip, plainChip, roomStatus, manualText } = global.FarmUi;
  const live = room.live;
  const rd = live && live.reading;
  r.link.textContent = room.name;
  r.link.href = `#/rooms/${room.id}/overview`;
  paintChip(r.status, roomStatus(room));
  r.sim.hidden = room.adapter !== 'sim';
  const mt = manualText(live && live.manual);
  r.manual.hidden = !mt;
  r.manual.textContent = mt;
  r.crop.textContent = cropLine(live);
  const text = { T: `${fmt(rd && rd.T, 1)} °C`, RH: `${fmt(rd && rd.RH, 0)} %`, CO2: `${fmt(rd && rd.CO2, 0)} ppm` };
  for (const k of ['T', 'RH', 'CO2']) {
    const c = r.cells[k];
    c.num.textContent = text[k];
    const st = live && live.status ? live.status[k] : null;
    c.chip.hidden = !st;
    if (st) paintChip(c.chip, plainChip(k, st));
    if (c.spark) {
      const points = data.spark && data.spark[k];
      const svg = points ? sparkSvg(k, points, bandFor(k, live)) : null;
      c.spark.replaceChildren(svg || el('span', 'ov-spark-wait', 'Collecting readings…'));
    }
  }
  const lis = machineStrip(room).map(m => {
    const li = el('li', 'ov-machine');
    li.dataset.on = String(m.on);
    if (m.manual) li.dataset.manual = 'true';
    const dot = el('span', 'ov-mdot'); dot.setAttribute('aria-hidden', 'true');
    li.append(dot, el('span', 'ov-mname', m.name));
    if (m.manual) li.append(el('span', 'ov-mmanual', 'manual'));
    li.append(el('span', 'ov-mstate', m.on ? 'on' : 'off'));
    return li;
  });
  r.strip.replaceChildren(...lis);
  const kg = data.harvestKg;
  r.harvest.textContent = kg === undefined ? '' : kg === null ? 'No batch in this room' : `Harvest today: ${kg.toFixed(1)} kg`;
  r.record.href = `#/harvest/${room.id}`;
}

// ---------------- page ----------------

function readHidden() { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } }
function writeHidden() { try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* storage may be unavailable */ } }
const isInstaller = () => typeof document !== 'undefined' && document.body && document.body.dataset.level === 'installer';
const nowS = () => Math.floor(Date.now() / 1000);

function mount(view) {
  const me = ++mountSeq;
  if (active) stopActive();
  const api = global.FarmApi, ui = global.FarmUi;
  const alive = () => me === mountSeq;
  const ctx = { me, timers: [], onLevel: null };
  active = ctx;

  const data = {
    rooms: null,                 // Room[] | null before the first reply
    harvest: new Map(),          // roomId -> kg today
    spark: new Map(),            // roomId -> { T: points, RH: points }
    kwh: new Map(),              // roomId -> kWh today
    crateCache: new Map(),       // batchId -> { crates, at, sig } (sig: the room's kg today when fetched)
    events: [],
    batches: [],
    history: {},
    calibrations: {},
    errors: new Map(),           // part -> message
  };
  const cards = new Map();       // roomId -> card refs
  const inflight = new Set();    // parts with a call running, so a slow server does not stack calls
  let shownDay = dayStart(nowS());

  const actionLink = el('a', 'btn btn-primary btn-link', 'Record harvest');
  actionLink.href = '#/harvest';
  const head = ui.pageHead({ title: 'Your farm today', sub: dateText(nowS()), actions: [actionLink] });
  const dateEl = head.children[0].children[1];
  const alert = el('p'); ui.say(alert, 'error', '');
  const body = el('div', 'ov');
  const startBox = el('section', 'card ov-start'); startBox.hidden = true;
  const kpiBox = el('div', 'ov-kpis');
  const kpiRefs = {};
  for (const key of ['rooms', 'alarms', 'energy', 'harvest']) { kpiRefs[key] = buildKpi(key); kpiBox.append(kpiRefs[key].tile); }
  const roomsBox = el('div', 'ov-rooms');
  const noRooms = el('section', 'card ov-empty'); noRooms.hidden = true;
  noRooms.append(el('h2', 'ov-empty-title', 'No rooms yet.'));
  const addRoom = el('a', 'btn btn-primary btn-link', 'Add a room'); addRoom.href = '#/rooms';
  noRooms.append(el('p', 'ov-empty-text', 'Add a grow room and its numbers will show up here.'), addRoom);
  const eventsBox = el('section', 'card ov-events'); eventsBox.hidden = true;
  body.append(startBox, noRooms, kpiBox, roomsBox, eventsBox);
  view.replaceChildren(head, alert, body);

  function reportErrors() {
    const first = data.errors.values().next();
    ui.say(alert, 'error', first.done ? '' : first.value);
  }
  // Runs one part of the page: a late reply of an older mount does nothing; a failure shows one line and leaves the rest working.
  async function part(name, fn) {
    if (inflight.has(name)) return;
    inflight.add(name);
    try {
      const res = await fn();
      if (!alive()) return;
      data.errors.delete(name);
      return res;
    } catch (err) {
      if (!alive()) return;
      data.errors.set(name, ui.errorText(err));
    } finally {
      inflight.delete(name);
      if (alive()) reportErrors();
    }
  }

  function renderKpis() {
    const rooms = data.rooms || [];
    const sum = m => { let s = 0, any = false; for (const v of m.values()) { if (v !== null) { s += v; any = true; } } return any ? s : null; };
    const week = weekBars([...data.crateCache.values()].flatMap(c => c.crates), nowS());
    const k = kpis(rooms, { kwh: sum(data.kwh), kgToday: sum(data.harvest) || 0, weekKg: week.reduce((s, b) => s + b.kg, 0) });
    paintKpi(kpiRefs.rooms, k.rooms);
    paintKpi(kpiRefs.alarms, k.alarms);
    paintKpi(kpiRefs.energy, k.energy);
    paintKpi(kpiRefs.harvest, k.harvest, week);
  }

  function renderRooms() {
    const rooms = data.rooms || [];
    const none = data.rooms !== null && rooms.length === 0;
    noRooms.hidden = !none;
    kpiBox.hidden = none || data.rooms === null;
    roomsBox.hidden = none;
    for (const [id, c] of cards) {
      if (!rooms.some(r => r.id === id)) { c.card.remove(); cards.delete(id); }
    }
    const order = [];
    for (const room of rooms) {
      let c = cards.get(room.id);
      if (!c) { c = buildRoomCard(room); cards.set(room.id, c); }
      paintRoomCard(c, room, { spark: data.spark.get(room.id), harvestKg: data.harvest.get(room.id) });
      order.push(c.card);
    }
    roomsBox.replaceChildren(...order);
    renderKpis();
  }

  function renderEvents() {
    const none = !data.rooms || data.rooms.length === 0;
    eventsBox.hidden = none;
    if (none) return;
    const list = el('ul', 'ov-event-list');
    const now = nowS();
    for (const e of data.events) {
      const li = el('li', 'ov-event');
      const dot = el('span', 'ov-edot'); dot.setAttribute('aria-hidden', 'true');
      if (e.level && e.level !== 'info') dot.dataset.lvl = e.level;
      li.append(dot, el('time', 'ov-etime', eventTime(e.t, now)), el('span', 'ov-eroom', e.room_name), el('span', 'ov-etext', e.text));
      list.append(li);
    }
    eventsBox.replaceChildren(el('h2', 'ov-title', 'Recent events'),
      data.events.length ? list : el('p', 'ov-none', 'Nothing has happened yet.'));
  }

  function renderStart() {
    const list = checklist({ rooms: data.rooms || [], history: data.history, batches: data.batches, calibrations: data.calibrations, installer: isInstaller() });
    const show = data.rooms !== null && !list.allDone && !readHidden();
    startBox.hidden = !show;
    if (!show) return;
    const ol = el('ol', 'ov-checks');
    for (const item of list.items) {
      const li = el('li', 'ov-check');
      li.dataset.done = String(item.done);
      li.dataset.key = item.key;
      const mark = el('span', 'ov-mark', item.done ? '✓' : '○'); mark.setAttribute('aria-hidden', 'true');
      const a = el('a', 'ov-check-link', item.text);
      a.href = item.href;
      li.append(mark, a);
      if (item.done) li.append(el('span', 'ov-done-word', 'Done'));
      ol.append(li);
    }
    const hide = el('button', 'btn ov-hide-btn', 'Hide this list');
    hide.type = 'button';
    hide.addEventListener('click', () => { writeHidden(); renderStart(); });
    startBox.replaceChildren(el('h2', 'ov-title', 'Getting started'), ol, hide);
  }

  // --- loaders ---
  async function loadRooms() {
    const rooms = await part('rooms', () => api.listRooms());
    if (!rooms) return false;
    const firstLoad = data.rooms === null;
    const fresh = rooms.filter(r => !data.spark.has(r.id) && !cards.has(r.id));
    const ids = new Set(rooms.map(r => r.id));
    for (const m of [data.spark, data.kwh, data.harvest]) for (const id of m.keys()) if (!ids.has(id)) m.delete(id);
    for (const name of [...data.errors.keys()]) {
      const m = /^readings:(\d+)$/.exec(name);
      if (m && !ids.has(Number(m[1]))) data.errors.delete(name);
    }
    data.rooms = rooms;
    renderRooms();
    renderStart();
    renderEvents();
    reportErrors();
    const today = dayStart(nowS());
    if (today !== shownDay) {  // midnight passed: the date and the day's numbers start over
      shownDay = today;
      dateEl.textContent = dateText(nowS());
      loadSlow(); loadMid();
    } else if (!firstLoad && fresh.length) {
      loadSlow(fresh); loadMid();
    }
    return true;
  }

  async function loadSlow(list) {
    const rooms = list || data.rooms || [];
    const now = nowS(), start = dayStart(now);
    await Promise.all(rooms.map(room => part(`readings:${room.id}`, async () => {
      // one 24 h request: the sparklines, and the energy of today (the last row before 00:00 is the meter baseline)
      const day = await api.getReadings(room.id, { from: now - DAY_S, to: now, step: 900 });
      if (!alive()) return;
      data.spark.set(room.id, {
        T: day.map(r => ({ t: r.t, v: r.T })),
        RH: day.map(r => ({ t: r.t, v: r.RH })),
      });
      if (day.some(r => finite(r.kwh))) data.kwh.set(room.id, kwhToday(day, start)); else data.kwh.delete(room.id);
    })));
    if (!alive()) return;
    renderRooms();
  }

  async function loadMid() {
    const rooms = data.rooms || [];
    await Promise.all([
      part('events', async () => {
        const perRoom = await Promise.all(rooms.map(async room => ({ room, events: await api.getEvents(room.id, { limit: 5 }) })));
        if (!alive()) return;
        data.events = mergeEvents(perRoom, 8);
        renderEvents();
      }),
      part('harvest', async () => {
        const res = await Promise.all(rooms.map(async room => [room.id, await api.getRoomHarvest(room.id)]));
        if (!alive()) return;
        data.harvest.clear();
        for (const [id, rh] of res) {
          const has = rh && rh.batches && rh.batches.length;
          data.harvest.set(id, has ? rh.batches.reduce((s, b) => s + (b.today && finite(b.today.kg) ? b.today.kg : 0), 0) : null);
        }
        renderRooms();
      }).then(() => part('batches', async () => {
        const list = await api.listBatches();
        if (!alive()) return;
        data.batches = list;
        // The week bars use the crates of placed batches only: a cleared batch's crates are left out (a documented limit, C12 4 Harvest).
        // A batch's crates are fetched again only when its room's kg today changed or after 5 minutes.
        const placed = list.filter(b => b.state === 'placed');
        const now = nowS();
        const stale = placed.filter(b => {
          const c = data.crateCache.get(b.id);
          return !c || c.sig !== data.harvest.get(b.room_id) || now - c.at > SLOW_MS / 1000;
        });
        const details = await Promise.all(stale.map(b => api.getBatch(b.id)));
        if (!alive()) return;
        stale.forEach((b, i) => data.crateCache.set(b.id, { crates: details[i].crates || [], at: now, sig: data.harvest.get(b.room_id) }));
        for (const id of [...data.crateCache.keys()]) if (!placed.some(b => b.id === id)) data.crateCache.delete(id);
        renderKpis();
        renderStart();
      })),
      part('setup', async () => {
        const installer = isInstaller();
        const state = { rooms, history: data.history, batches: data.batches, calibrations: data.calibrations, installer };
        if (readHidden() || (data.rooms !== null && checklist(state).allDone)) return;
        const [hist, cal] = await Promise.all([
          Promise.all(rooms.map(async room => [room.id, (await api.listSettingsHistory(room.id)).length])),
          installer ? Promise.all(rooms.map(async room => [room.id, (await api.listCalibrations(room.id)).length])) : Promise.resolve([]),
        ]);
        if (!alive()) return;
        data.history = Object.fromEntries(hist);
        data.calibrations = Object.fromEntries(cal);
        renderStart();
      }),
    ]);
  }

  ctx.onLevel = () => { if (alive()) { renderStart(); loadMid(); } };
  document.addEventListener('farm-level', ctx.onLevel);

  function every(ms, fn) {
    ctx.timers.push(setInterval(() => { if (alive()) fn(); }, ms));
  }
  every(ROOMS_MS, loadRooms);
  every(MID_MS, loadMid);
  every(SLOW_MS, loadSlow);

  return (async () => {
    if (!await loadRooms()) return;
    await Promise.all([loadSlow(), loadMid()]);
  })();
}

function stopActive() {
  if (!active) return;
  for (const t of active.timers) clearInterval(t);
  if (active.onLevel && typeof document !== 'undefined') document.removeEventListener('farm-level', active.onLevel);
  active = null;
}

function unmount() {
  mountSeq++;
  stopActive();
}

const helpers = { dayStart, dateText, eventTime, kwhToday, sparkPath, sparkLabel, weekBars, checklist, mergeEvents, kpis, machineStrip, cropLine, bandFor };
global.FarmShell.register('overview', { mount, unmount, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
