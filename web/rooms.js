// web/rooms.js: the Rooms home (#/rooms) and the room page frame (#/rooms/:id/<tab>) (docs/contracts/web.md 3.7, 3.8, 3.9).
(function (global) {
'use strict';

const STORE_KEY = 'mushroom-farm.rooms.v1';
const MARKER_KEY = 'mushroom-farm.rooms.v1.imported';
const REFRESH_MS = 30000;
const AC_WORD = { cool: 'Cool', heat: 'Heat', dry: 'Dry', fan: 'Fan only' };
const FEED = { open: 'Live', down: 'Reconnecting…' };

// ---------------- pure helpers (tested in tests/web-rooms.test.js) ----------------

const cropName = k => (global.ClimateController.CROPS[k] ? global.ClimateController.CROPS[k].name : k);
const stageName = k => global.ClimateController.STAGES[k] ?? k;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function statusChip(room) {
  const ICON = global.FarmUi.ICON;
  const live = room.live;
  if (!live || live.running === false) return { lvl: 'serious', icon: ICON.serious, text: 'Stopped' };
  if (live.alarms > 0) return { lvl: 'warning', icon: ICON.warning, text: plural(live.alarms, 'alarm') };
  const st = live.status;
  if (st && ['T', 'RH', 'CO2'].some(k => st[k] && st[k].lvl !== 'good')) return { lvl: 'info', icon: ICON.info, text: 'Out of band' };
  return { lvl: 'good', icon: ICON.good, text: 'All good' };
}

function cropText(live) {
  if (!live || live.crop == null) return '–';
  return live.stage != null ? `${cropName(live.crop)} · ${stageName(live.stage)}` : cropName(live.crop);
}

function flushBlocks(live) {
  let s = '';
  if (live && live.flush != null) s += ` · flush ${live.flush}`;
  if (live && live.blocks != null) s += ` · ${live.blocks} blocks`;
  return s;
}

function machineLines(r) {
  if (!r) return [];
  const { fmtNum, watts } = global.FarmUi;
  const lines = [];
  lines.push(r.ac_mode === 'off' ? 'AC off' : `AC ${AC_WORD[r.ac_mode] ?? r.ac_mode} ${fmtNum(r.ac_setpoint, 1)} °C`);
  lines.push(r.fog === 0 ? 'Fogger off' : `Fogger level ${r.fog}`);
  lines.push(r.lights === 1 ? 'Lights on' : 'Lights off');
  lines.push(r.circ === 1 ? 'Circulation fan on' : 'Circulation fan off');
  if (Number.isFinite(r.power_w)) lines.push(`Power ${watts(r.power_w)}`);
  return lines;
}

function cardTexts(room) {
  const { fmtNum } = global.FarmUi;
  const live = room.live;
  const r = live && live.reading ? live.reading : null;
  let air = '–';
  if (r) air = r.air === 1 ? 'Air exchange on' : 'Air exchange off';
  let stopped = null;
  if (!live || !live.running) stopped = live && live.error ? `Stopped: ${live.error}` : 'Stopped';
  return {
    name: room.name,
    crop: cropText(live) + flushBlocks(live),
    air,
    T: `${fmtNum(r && r.T, 1)} °C`,
    RH: `${fmtNum(r && r.RH, 0)} % RH`,
    CO2: `${fmtNum(r && r.CO2, 0)} ppm`,
    machines: machineLines(r).join(' · '),
    stopped,
  };
}

function infoText(room) { return `${cropText(room.live)}${flushBlocks(room.live)} · ${room.volume} m³`; }

function stateText(room) {
  const live = room.live;
  if (live && live.running) return 'Running';
  return live && live.error ? `Stopped: ${live.error}` : 'Stopped';
}

function alarmsChip(n) {
  const ICON = global.FarmUi.ICON;
  return n === 0 ? { lvl: 'good', icon: ICON.good, text: 'No alarms' } : { lvl: 'warning', icon: ICON.warning, text: plural(n, 'alarm') };
}

function upsertRoom(rooms, room) {
  const rest = rooms.filter(r => r.id !== room.id);
  if (room.archived_at !== null) return rest;
  rest.push(room);
  return rest.sort((a, b) => a.id - b.id);
}

function takeLive(rooms, reply) {
  const byId = new Map(reply.map(r => [r.id, r]));
  return rooms.map(room => {
    const r = byId.get(room.id);
    if (!r || !r.live || !room.live) return room;
    return { ...room, live: { ...room.live, status: r.live.status, targets: r.live.targets } };
  });
}

function refreshRoom(room, row) {
  if (!row.live) return row;
  const oldR = room.live ? room.live.reading : null;
  const newR = row.live.reading;
  const reading = oldR && (!newR || oldR.t > newR.t) ? oldR : newR;
  return { ...row, live: { ...row.live, reading } };
}

function refreshDelay(lastMs, nowMs) { return lastMs === null ? 0 : Math.max(0, lastMs + REFRESH_MS - nowMs); }

function newRoomName(text, count) { return text.trim() || `Room ${count + 1}`; }

function readStored(storage) {
  try {
    const data = JSON.parse(storage.getItem(STORE_KEY));
    if (!data || !Array.isArray(data.rooms)) return [];
    const out = [];
    data.rooms.forEach((element, i) => {
      const room = global.ClimateRoomRules.normRoom(element, i);
      if (room) out.push({ i, room });
    });
    return out;
  } catch { return []; }
}

function importPlan({ i, room }, nowS) {
  const mix = room.mix.map(m => ({ crop: m.crop, blocks: m.blocks, co2_per_block: m.co2PerBlock ?? null }));
  let calibration = null;
  const c = room.calib;
  if (c) {
    const rmse = k => { const v = c.rmse && c.rmse[k]; return Number.isFinite(v) && v >= 0 ? v : null; };
    calibration = { ua: c.ua, inf_ach: c.infAch, moist_buffer: c.moistBuffer, co2_per_block: c.co2PerBlock,
      rmse_t: rmse('T'), rmse_rh: rmse('RH'), rmse_co2: rmse('CO2'), log_rows: null, source: 'import' };
    const runAt = Math.floor(Date.parse(c.date) / 1000);
    if (Number.isInteger(runAt) && runAt >= 1 && runAt <= nowS + 60) calibration.run_at = runAt;
  }
  return { room: { name: room.name.trim() || `Room ${i + 1}`, volume: room.volume }, mix, calibration };
}

async function importRooms(entries, api, { nowS, onRoom }) {
  let created = 0;
  for (let k = 0; k < entries.length; k++) {
    let p = null;
    try {
      p = importPlan(entries[k], nowS);
      onRoom(k + 1, entries.length);
      const r = await api.createRoom(p.room);
      created++;
      await api.saveMix(r.id, p.mix);
      if (p.calibration) {
        const run = await api.saveCalibration(r.id, p.calibration);
        await api.applyCalibration(r.id, run.id);
      }
    } catch (error) {
      return { created, failed: { name: p ? p.room.name : `Room ${entries[k].i + 1}`, error } };
    }
  }
  return { created, failed: null };
}

const helpers = {
  statusChip, cropText, cardTexts, machineLines, infoText, stateText, alarmsChip, upsertRoom, takeLive, refreshRoom,
  refreshDelay, newRoomName, readStored, importPlan, importRooms,
};

// ---------------- DOM: shared parts ----------------

function note(text) { const p = document.createElement('p'); p.className = 'est-note'; p.textContent = text; return p; }

function showMissing(el) {
  const a = document.createElement('a');
  a.href = '#/rooms'; a.textContent = 'Rooms';
  el.replaceChildren(note('This room does not exist or is archived.'), a);
}

// The 30 s status refresh (C5 3.4): one timer per page, at most one call in flight, a failure is not retried.
function createRefresher(onReply) {
  let timer = null, inflight = false, queued = false, last = null, stopped = false;
  function schedule() { timer = setTimeout(run, refreshDelay(last, Date.now())); }
  async function run() {
    timer = null; last = Date.now(); inflight = true;
    let reply = null;
    try { reply = await global.FarmApi.listRooms(); } catch { reply = null; }
    inflight = false;
    if (stopped) return;
    if (reply) { try { onReply(reply); } catch (err) { console.error(err); } }
    if (queued) { queued = false; schedule(); }
  }
  return {
    request() {
      if (stopped) return;
      if (inflight) queued = true;
      else if (!timer) schedule();
    },
    stop() { stopped = true; clearTimeout(timer); timer = null; },
  };
}

function newerReading(live, data) { return !live.reading || data.t >= live.reading.t; }

// ---------------- the Rooms home ----------------

const HOME_HTML = `
<p class="explain">Every grow room is one card. The farm server runs each room's climate controller 24/7, so these values are live even when nobody has the page open.</p>
<p class="explain">Live: is the room alright now? → Calibrate: make the virtual room match the real one → Simulate: will this crop plan work? → predicted vs real → Calibrate again</p>
<div class="section-head"><h2>Rooms</h2><span class="tag" id="rhFeed" role="status"></span></div>
<p class="tag room-msg" id="rhMsg" role="status"></p>
<div class="contents" id="rhCards"></div>
<div class="card room-new">
  <label>Name <input id="rhName" type="text" maxlength="60"></label>
  <label>Volume (m³) <input id="rhVolume" type="number" min="5" max="5000" step="1"></label>
  <button class="btn" id="rhCreate" type="button">New room</button>
  <button class="btn" id="rhImport" type="button" hidden>Import rooms from this browser</button>
</div>`;

const CARD_HTML = `
<a class="room-link"><div class="rc-head"><h3></h3><span class="chip"></span></div>
<p class="rc-crop"></p><p class="tag rc-air"></p>
<div class="rc-values">
  <div class="rc-val" data-k="T"><span class="val"></span><span class="chip" hidden></span></div>
  <div class="rc-val" data-k="RH"><span class="val"></span><span class="chip" hidden></span></div>
  <div class="rc-val" data-k="CO2"><span class="val"></span><span class="chip" hidden></span></div>
</div>
<p class="tag rc-machines"></p></a>
<div class="rc-stopped" hidden><span></span><button class="btn rc-restart" type="button">Restart</button></div>`;

function paintCard(card, room) {
  const { paintChip } = global.FarmUi;
  const t = cardTexts(room);
  const live = room.live;
  card.querySelector('h3').textContent = t.name;
  paintChip(card.querySelector('h3 + .chip'), statusChip(room));
  card.querySelector('.rc-crop').textContent = t.crop;
  card.querySelector('.rc-air').textContent = t.air;
  card.querySelector('.rc-values').dataset.t = live && live.reading ? String(live.reading.t) : '';
  for (const k of ['T', 'RH', 'CO2']) {
    const box = card.querySelector(`.rc-val[data-k="${k}"]`);
    box.querySelector('.val').textContent = t[k];
    const chip = box.querySelector('.chip');
    const st = live && live.status ? live.status[k] : null;
    chip.hidden = !st;
    if (st) paintChip(chip, st);
  }
  card.querySelector('.rc-machines').textContent = t.machines;
  const stopped = card.querySelector('.rc-stopped');
  stopped.hidden = t.stopped === null;
  if (t.stopped !== null) stopped.querySelector('span').textContent = t.stopped;
}

function buildCard(room) {
  const card = document.createElement('section');
  card.className = 'card room-card';
  card.dataset.roomId = String(room.id);
  card.innerHTML = CARD_HTML;
  card.querySelector('a.room-link').href = `#/rooms/${room.id}/live`;
  paintCard(card, room);
  return card;
}

function importAvailable() {
  try {
    if (global.localStorage.getItem(MARKER_KEY) !== null) return false;
    return readStored(global.localStorage).length > 0;
  } catch { return false; }
}

let homeState = null; // { stop() } while the home is mounted
let frameState = null; // { id, update(params), stop() } while a room page is mounted

function mountHome(el) {
  const { errorText } = global.FarmUi;
  const api = global.FarmApi;
  el.innerHTML = HOME_HTML;
  const $ = id => el.querySelector(`#${id}`);
  $('rhVolume').value = String(global.ClimateSim.PLANT.room.volume);
  $('rhImport').hidden = !importAvailable();

  let alive = true;
  let rooms = [];
  let seq = 0;
  let buffer = null; // events that arrive while listRooms() is in flight
  const setMsg = text => { $('rhMsg').textContent = text; };
  const cardOf = id => $('rhCards').querySelector(`.room-card[data-room-id="${id}"]`);

  function render() { $('rhCards').replaceChildren(...rooms.map(buildCard)); }

  function applyReading(data) {
    const room = rooms.find(r => r.id === data.room_id);
    if (!room || !room.live || !newerReading(room.live, data)) return false;
    room.live = { ...room.live, reading: data };
    return true;
  }

  async function load() {
    const mine = ++seq;
    buffer = [];
    let reply;
    try { reply = await api.listRooms(); }
    catch (err) { if (alive && mine === seq) { buffer = null; setMsg(errorText(err)); } return; }
    if (!alive || mine !== seq) return;
    const early = buffer; buffer = null;
    rooms = reply;
    let read = false;
    for (const [type, data] of early) {
      if (type === 'room') rooms = upsertRoom(rooms, data); else if (applyReading(data)) read = true;
    }
    render();
    if (read) refresher.request();
  }

  const refresher = createRefresher(reply => {
    rooms = takeLive(rooms, reply);
    for (const room of rooms) {
      const card = cardOf(room.id);
      if (card) paintCard(card, room);
    }
  });

  function onEvent(type, data) {
    if (!alive) return;
    if (type === 'open') { $('rhFeed').textContent = FEED.open; load(); return; }
    if (type === 'down') { $('rhFeed').textContent = FEED.down; return; }
    if (type !== 'reading' && type !== 'room') return;
    if (buffer) { buffer.push([type, data]); return; }
    if (type === 'room') { rooms = upsertRoom(rooms, data); render(); return; }
    if (!applyReading(data)) return;
    const card = cardOf(data.room_id);
    if (card) paintCard(card, rooms.find(r => r.id === data.room_id));
    refresher.request();
  }

  $('rhCards').addEventListener('click', async e => {
    const btn = e.target.closest('.rc-restart');
    if (!btn) return;
    const id = Number(btn.closest('.room-card').dataset.roomId);
    btn.disabled = true;
    try {
      const room = await api.restartRoom(id);
      if (!alive) return;
      rooms = upsertRoom(rooms, room);
      render();
    } catch (err) {
      if (!alive) return;
      setMsg(errorText(err));
      btn.disabled = false;
    }
  });

  $('rhCreate').addEventListener('click', async () => {
    const btn = $('rhCreate');
    btn.disabled = true;
    try {
      const room = await api.createRoom({ name: newRoomName($('rhName').value, rooms.length), volume: Number($('rhVolume').value) });
      if (!alive) return;
      rooms = upsertRoom(rooms, room);
      render();
      $('rhName').value = '';
      setMsg(`Created "${room.name}". It starts running at once (simulated, default settings).`);
    } catch (err) {
      if (alive) setMsg(errorText(err));
    } finally {
      if (alive) btn.disabled = false;
    }
  });

  $('rhImport').addEventListener('click', async () => {
    const entries = readStored(global.localStorage);
    if (!entries.length) return;
    if (!global.confirm(`Create ${entries.length} room(s) from this browser on the farm server? Each one starts running as a simulated room.`)) return;
    const buttons = el.querySelectorAll('.room-new button');
    buttons.forEach(b => { b.disabled = true; });
    const nowS = Math.floor(Date.now() / 1000);
    const res = await importRooms(entries, api, { nowS, onRoom: (k, n) => { if (alive) setMsg(`Importing room ${k} of ${n}…`); } });
    if (!res.failed) { try { global.localStorage.setItem(MARKER_KEY, String(nowS)); } catch { /* the marker is best effort */ } }
    if (!alive) return;
    buttons.forEach(b => { b.disabled = false; });
    let message;
    if (res.failed) {
      message = `The import stopped at "${res.failed.name}": ${errorText(res.failed.error)}. ${res.created} room(s) were created; archive them on their room pages before you import again.`;
    } else {
      $('rhImport').hidden = true;
      message = `Imported ${res.created} room(s). Run the check again for each room.`;
    }
    try { rooms = await api.listRooms(); if (alive) render(); } catch (err) { if (alive) message += ` ${errorText(err)}`; }
    if (alive) setMsg(message);
  });

  const close = api.stream(onEvent);
  homeState = { close, stop() { alive = false; close(); refresher.stop(); } };
}

// ---------------- the room page frame ----------------

const FRAME_HTML = `
<section class="card room-head">
  <nav class="crumbs"><a href="#/rooms">Rooms</a> › <span></span></nav>
  <h2 id="rpName"></h2>
  <span class="tag" id="rpInfo"></span>
  <span class="chip" id="rpState"></span>
  <span class="chip" id="rpAlarms"></span>
  <button class="btn" id="rpRestart" type="button" hidden>Restart</button>
  <span class="tag" id="rpFeed" role="status"></span>
  <p class="tag" id="rpMsg" role="status"></p>
</section>
<nav class="room-tabs" aria-label="Room views"></nav>
<div class="contents" id="roomTab"></div>`;

const TAB_LABEL = { live: 'Live', simulate: 'Simulate', calibrate: 'Calibrate' };

function mountFrame(el, params) {
  const { errorText, paintChip } = global.FarmUi;
  const api = global.FarmApi;
  const id = params.id;
  let tab = params.tab;
  let tabParams = params.runId ? { runId: params.runId } : {};
  el.innerHTML = FRAME_HTML;
  const $ = sel => el.querySelector(sel);
  const nav = $('.room-tabs');
  for (const name of global.FarmRoomTabs.NAMES) {
    const a = document.createElement('a');
    a.dataset.tab = name; a.href = `#/rooms/${id}/${name}`; a.textContent = TAB_LABEL[name] ?? name;
    nav.append(a);
  }
  function markTab() {
    nav.querySelectorAll('a').forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  markTab();

  let alive = true;
  let gone = false;
  let room = null;
  let seq = 0;
  let early = null; // events of this room that arrive before the first reply
  let current = null; // { token, module, lists }
  let tokenCount = 0;

  function paintHeader() {
    $('#rpName').textContent = room.name;
    $('.crumbs span').textContent = room.name;
    $('#rpInfo').textContent = infoText(room);
    const running = !!(room.live && room.live.running);
    paintChip($('#rpState'), running ? { lvl: 'good', icon: global.FarmUi.ICON.good, text: 'Running' } : { lvl: 'serious', icon: global.FarmUi.ICON.serious, text: stateText(room) });
    paintChip($('#rpAlarms'), alarmsChip(room.live ? room.live.alarms : 0));
    $('#rpRestart').hidden = running;
  }

  function dispatch(type, arg) {
    if (!current) return;
    for (const fn of [...(current.lists[type] || [])]) {
      try { fn(arg); } catch (err) { console.error(err); }
    }
  }
  function roomChanged() { paintHeader(); dispatch('room', room); }

  function unmountTab() {
    const c = current; current = null;
    if (!c) return;
    c.lists = {};
    if (c.module) { try { c.module.unmount(); } catch (err) { console.error(err); } }
  }

  function mountTab() {
    const host = $('#roomTab');
    const module = global.FarmRoomTabs.get(tab);
    if (!module) { host.replaceChildren(note('This tab is not installed.')); return; }
    const token = ++tokenCount;
    const c = current = { token, module, lists: {} };
    const ctx = {
      id, params: tabParams, room: () => room,
      on(type, fn) {
        (c.lists[type] ||= []).push(fn);
        return () => { const l = c.lists[type]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } };
      },
    };
    const failed = err => {
      console.error(err);
      if (current === c && alive) host.replaceChildren(note(`This tab could not be opened: ${err && err.message}`));
    };
    try {
      const r = module.mount(host, ctx);
      if (r && typeof r.catch === 'function') r.catch(failed);
    } catch (err) { failed(err); }
  }

  function archivedOrMissing() {
    gone = true;
    unmountTab();
    showMissing(el);
    close();
    refresher.stop();
  }

  const refresher = createRefresher(reply => {
    const row = reply.find(r => r.id === id);
    if (!row || !room || gone) return;
    room = refreshRoom(room, row);
    roomChanged();
  });

  async function load(first) {
    const mine = ++seq;
    if (first) early = [];
    let rows;
    try { rows = await api.listRooms(); }
    catch (err) { if (alive && !gone && mine === seq) { early = null; $('#rpMsg').textContent = errorText(err); } return; }
    if (!alive || gone || mine !== seq) return;
    const row = rows.find(r => r.id === id);
    if (!row) { archivedOrMissing(); return; }
    if (first) {
      room = row;
      const buffered = early; early = null;
      let read = false;
      for (const [type, data] of buffered) {
        if (type === 'room') room = data;
        else if (room.live && newerReading(room.live, data)) { room = { ...room, live: { ...room.live, reading: data } }; read = true; }
      }
      if (room.archived_at !== null) { archivedOrMissing(); return; }
      paintHeader();
      mountTab();
      if (read) refresher.request();
    } else {
      room = refreshRoom(room, row);
      roomChanged();
    }
  }

  function onEvent(type, data) {
    if (!alive || gone) return;
    if (type === 'open') {
      $('#rpFeed').textContent = FEED.open;
      if (!room) { load(true); return; }
      if (data.reconnect) { dispatch('open', data); load(false); }
      return;
    }
    if (type === 'down') { $('#rpFeed').textContent = FEED.down; dispatch('down', data); return; }
    if (!['reading', 'event', 'alarm', 'settings', 'room'].includes(type)) return;
    if (data.room_id !== undefined && data.room_id !== id) return;
    if (type === 'room' && data.id !== id) return;
    if (!room) { if (early && (type === 'reading' || type === 'room')) early.push([type, data]); return; }
    if (type === 'reading') {
      if (room.live && newerReading(room.live, data)) room = { ...room, live: { ...room.live, reading: data } };
      dispatch('reading', data);
      refresher.request();
    } else if (type === 'room') {
      if (data.archived_at !== null) { archivedOrMissing(); return; }
      room = data;
      roomChanged();
    } else {
      dispatch(type, data);
    }
  }

  $('#rpRestart').addEventListener('click', async () => {
    const btn = $('#rpRestart');
    btn.disabled = true;
    try {
      const reply = await api.restartRoom(id);
      if (!alive || gone) return;
      room = reply;
      roomChanged();
    } catch (err) {
      if (alive && !gone) $('#rpMsg').textContent = errorText(err);
    } finally {
      if (alive) btn.disabled = false;
    }
  });

  const close = api.stream(onEvent);

  frameState = {
    id,
    update(next) {
      if (gone) return true;
      unmountTab();
      $('#roomTab').replaceChildren();
      tab = next.tab;
      tabParams = next.runId ? { runId: next.runId } : {};
      markTab();
      if (room) mountTab();
      return true;
    },
    stop() {
      alive = false;
      try { unmountTab(); } catch (err) { console.error(err); }
      try { close(); } catch (err) { console.error(err); }
      refresher.stop();
    },
  };
}

// ---------------- module ----------------

function unmount() {
  const h = homeState, f = frameState;
  homeState = null; frameState = null;
  if (h) h.stop();
  if (f) f.stop();
}

function mount(el, params) {
  unmount();
  if (params && params.id) mountFrame(el, params); else mountHome(el);
}

function update(params) {
  if (!frameState || !params || params.id !== frameState.id) return false;
  return frameState.update(params);
}

global.FarmShell.register('rooms', { mount, unmount, update, helpers });
})(typeof window !== 'undefined' ? window : globalThis);
