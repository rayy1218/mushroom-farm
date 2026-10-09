// server/rooms.js: the room manager (C2 sections 1-12, 15). CommonJS, synchronous.
'use strict';
require('../air.js');
require('../controller.js');
require('../runtime.js');
const { createSimAdapter, MAX_CATCH_UP_S } = require('./sim-adapter.js');
const { RoomError, DEMO_ROOM, FIRST_NOTE, cleanSettings } = require('./rooms-common.js');

const TARGET_KEYS = ['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff'];

// Internal constants (not part of the module's exported surface, C2 section 1).
const STATE_SAVE_S = 300;
const NAME_MAX = 60;
const VOLUME_MIN = 5;
const VOLUME_MAX = 5000;
const NOTE_MAX = 200;
const RECENT_READING_S = 3600;
const ACK_SCAN = 500;
const SETTINGS_FORMAT = 'mushroom-climate-settings';

function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function getPath(obj, k) {
  return k.startsWith('rules.') ? obj.rules[k.slice(6)] : obj[k];
}
function setPath(obj, k, v) {
  if (k.startsWith('rules.')) obj.rules[k.slice(6)] = v;
  else obj[k] = v;
}

function finiteOrNull(x) {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}
function sumFinite(obj) {
  if (obj == null) return null;
  let sum = 0;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) sum += v;
  }
  return sum;
}
function clampLevel(v) {
  return Math.min(3, Math.max(0, Math.round(v || 0)));
}

function defaultAdapterFactory(args) {
  const { room } = args;
  if (room.adapter === 'sim') return createSimAdapter(args);
  throw new Error(`Unknown adapter "${room.adapter}"`);
}

function validateName(name, details) {
  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed.length >= 1 && trimmed.length <= NAME_MAX) return trimmed;
  }
  details.push('name must be 1 to 60 characters');
  return undefined;
}
function validateVolume(volume, details) {
  if (typeof volume === 'number' && Number.isFinite(volume) && volume >= VOLUME_MIN && volume <= VOLUME_MAX) return volume;
  details.push('volume must be a number from 5 to 5000 (m³)');
  return undefined;
}
function validateVent(vent, details) {
  if (vent === 'supply' || vent === 'exhaust') return vent;
  details.push('vent must be "supply" or "exhaust"');
  return undefined;
}
function validateNote(note, details) {
  if (note === undefined || note === null) return null;
  if (typeof note !== 'string') { details.push('note must be text of at most 200 characters'); return undefined; }
  const trimmed = note.trim();
  if (trimmed.length > NOTE_MAX) { details.push('note must be text of at most 200 characters'); return undefined; }
  return trimmed === '' ? null : trimmed;
}

function buildReadingRow(roomId, r, cmd) {
  return {
    room_id: roomId,
    t: Math.round(r.t),
    T: finiteOrNull(r.T),
    RH: finiteOrNull(r.RH),
    CO2: finiteOrNull(r.CO2),
    t_out: finiteOrNull(r.tOut),
    rh_out: finiteOrNull(r.rhOut),
    ac_mode: cmd.ac.power ? cmd.ac.mode : 'off',
    ac_setpoint: cmd.ac.power ? cmd.ac.setpoint : null,
    fog: clampLevel(cmd.hu.level),
    fan: clampLevel(cmd.fan.level),
    lights: cmd.lights.on ? 1 : 0,
    circ: cmd.circ.on ? 1 : 0,
    power_w: sumFinite(r.power),
    kwh: sumFinite(r.kwh),
  };
}

function pairCorrect(cfg, hiKey, loKey, changed, warnings) {
  const hi = getPath(cfg, hiKey), lo = getPath(cfg, loKey);
  if (lo > hi - 50) {
    const hiChanged = changed.includes(hiKey), loChanged = changed.includes(loKey);
    if (hiChanged && !loChanged) {
      const kept = lo, given = hi, next = kept + 50;
      setPath(cfg, hiKey, next);
      warnings.push(`"${hiKey}" = ${given} must be at least 50 ppm above "${loKey}" (${kept} now): set to ${next}.`);
    } else if (loChanged && !hiChanged) {
      const kept = hi, given = lo, next = kept - 50;
      setPath(cfg, loKey, next);
      warnings.push(`"${loKey}" = ${given} must be at least 50 ppm below "${hiKey}" (${kept} now): set to ${next}.`);
    }
  }
}

function createRoomManager(options) {
  const opts = options || {};
  const db = opts.db;
  const now = opts.now || (() => Math.floor(Date.now() / 1000));
  const tickMs = opts.tickMs === undefined ? 1000 : opts.tickMs;
  const adapterFactory = opts.adapterFactory || defaultAdapterFactory;

  const listeners = new Map(); // name -> fn[]
  const loops = new Map(); // id -> loop state
  let everStarted = false;
  let active = false;
  let timer = null;

  // ---------------- Events ----------------
  function on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  }
  function off(name, fn) {
    const arr = listeners.get(name);
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  function emit(name, payload) {
    const arr = listeners.get(name);
    if (!arr) return;
    for (const fn of arr.slice()) {
      try { fn(payload); } catch (err) { console.error(err); }
    }
  }

  function writeManagerEvent(id, level, text) {
    const row = db.addEvent(id, { t: now(), level, text });
    emit('event', { roomId: id, event: row });
    return row;
  }

  function flushPendingEvents(id, loop) {
    const events = loop.pendingEvents;
    loop.pendingEvents = [];
    for (const ev of events) {
      const row = db.addEvent(id, { t: Math.round(ev.t), level: ev.lvl, text: ev.text });
      emit('event', { roomId: id, event: row });
    }
  }

  // ---------------- Live / summary ----------------
  function liveOf(loop) {
    if (!loop) {
      return { reading: null, stage: null, crop: null, targets: null, status: null, alarms: 0, running: false, error: null };
    }
    const ctl = loop.ctl, cfg = loop.cfg;
    return {
      reading: loop.liveReading,
      stage: cfg ? cfg.stage : null,
      crop: cfg ? cfg.crop : null,
      targets: ctl ? { T: cfg.spT, RH: Math.round(ctl.state.rhT * 10) / 10, CO2: cfg.co2Lim } : null,
      status: ctl && loop.liveReading ? { T: ctl.status('T'), RH: ctl.status('RH'), CO2: ctl.status('CO2') } : null,
      alarms: loop.open.size,
      running: loop.running,
      error: loop.error,
    };
  }
  function attachLive(room) {
    if (room.archived_at !== null) return Object.assign({}, room, { live: null });
    return Object.assign({}, room, { live: liveOf(loops.get(room.id)) });
  }
  function currentRoomGet(id) {
    return attachLive(db.getRoom(id));
  }
  function summaryText(loop) {
    return JSON.stringify({ stage: loop.cfg ? loop.cfg.stage : null, crop: loop.cfg ? loop.cfg.crop : null, alarms: loop.open.size, running: loop.running, error: loop.error });
  }
  function emitRoomAlways(id) {
    const loop = loops.get(id);
    if (loop) loop.lastSummaryText = summaryText(loop);
    emit('room', { room: currentRoomGet(id) });
  }
  function emitRoomIfChanged(id, loop) {
    const text = summaryText(loop);
    if (text !== loop.lastSummaryText) {
      loop.lastSummaryText = text;
      emit('room', { room: currentRoomGet(id) });
    }
  }

  // ---------------- Errors ----------------
  function requireRoomRow(id) {
    try {
      return db.getRoom(id);
    } catch (err) {
      if (err.code === 'NOT_FOUND') throw new RoomError('not_found', `Room ${id} not found`, []);
      throw err;
    }
  }

  // ---------------- Recording ----------------
  function saveState(id, loop) {
    db.saveControllerState(id, { controller: loop.ctl.snapshot(), sim: loop.adapter.snapshot(), at: now() });
    loop.stateSavedAt = now();
  }

  function syncAlarms(id, loop, t) {
    const ctl = loop.ctl;
    const active = new Map(ctl.alarmList().filter(a => a.active).map(a => [a.id, a]));
    const open = loop.open;
    for (const [key, a] of active) {
      if (!open.has(key)) {
        let row = db.raiseAlarm(id, { alarm_key: a.id, level: a.lvl, label: a.label, at: Math.round(a.since) });
        if (a.acked) row = db.ackAlarm(id, a.id, now());
        open.set(a.id, row);
        emit('alarm', { roomId: id, change: 'raised', alarm: row });
      }
    }
    for (const key of Array.from(open.keys())) {
      if (!active.has(key)) {
        const row = db.clearAlarm(id, key, t);
        open.delete(key);
        if (row) emit('alarm', { roomId: id, change: 'cleared', alarm: row });
      }
    }
  }

  function checkAutomaticVersion(id, loop) {
    const cfg = loop.cfg, base = loop.base, ctl = loop.ctl;
    let note = null;
    if (cfg.stage !== base.stage) {
      note = `Automatic: stage ${ClimateController.STAGES[cfg.stage]}`;
    } else if (ctl.state.stage.ramp === null && TARGET_KEYS.some(k => getPath(cfg, k) !== getPath(base, k))) {
      note = `Automatic: targets for ${ClimateController.STAGES[cfg.stage]} reached`;
    }
    if (note) {
      const version = db.saveSettings(id, { settings: structuredClone(cfg), note, at: now() });
      loop.base = structuredClone(cfg);
      writeManagerEvent(id, 'info', `Settings saved (version ${version.id}): ${note}`);
      saveState(id, loop);
      emit('settings', { roomId: id, version, settings: version.settings, warnings: [], auto: true });
    }
  }

  function recordReading(id, loop, r, cmd) {
    const row = buildReadingRow(id, r, cmd);
    db.insertReading(id, row);
    loop.liveReading = row;
    emit('reading', { roomId: id, live: liveOf(loop) });
    flushPendingEvents(id, loop);
    syncAlarms(id, loop, row.t);
    checkAutomaticVersion(id, loop);
  }

  function crashRoom(id, loop, err) {
    flushPendingEvents(id, loop);
    writeManagerEvent(id, 'serious', `Stopped by an error: ${err.message}`);
    loop.running = false;
    loop.error = err.message;
    emitRoomIfChanged(id, loop);
  }

  // ---------------- Loop start (C2 section 8.1) ----------------
  function startLoopFromRow(roomRow) {
    const id = roomRow.id;
    const t = now();
    const openRows = db.listAlarms(id, { recent: 0 });
    const open = new Map(openRows.map(a => [a.alarm_key, a]));
    const version = db.currentSettings(id);
    const saved = db.loadControllerState(id);
    const calibRow = db.currentCalibration(id);
    const mix = db.getMix(id);
    const rows = db.queryReadings(id, { from: t - RECENT_READING_S, to: t });
    const liveReading = rows.length ? rows[rows.length - 1] : null;

    const loop = {
      roomId: id, open, running: false, error: null,
      cfg: null, base: null, ctl: null, adapter: null, runtime: null,
      pendingEvents: [], pendingReading: null,
      liveReading, lastNow: t, stateSavedAt: t, lastSummaryText: null,
    };
    loops.set(id, loop);

    let warnings = [];
    try {
      const imported = ClimateController.importSettings({ format: SETTINGS_FORMAT, version: ClimateController.SETTINGS_VERSION, settings: version.settings });
      loop.cfg = imported.settings;
      warnings = imported.warnings;
      loop.base = structuredClone(loop.cfg);

      const calib = calibRow ? { ua: calibRow.ua, infAch: calibRow.inf_ach, moistBuffer: calibRow.moist_buffer, co2PerBlock: calibRow.co2_per_block } : null;
      const sum = mix.reduce((s, m) => s + m.blocks, 0);
      const blocks = sum >= 1 ? sum : null;
      const adapter = adapterFactory({ room: roomRow, calib, blocks, cfg: loop.cfg, snapshot: saved ? saved.sim : null, now });
      loop.adapter = adapter;

      const onEvent = ev => loop.pendingEvents.push(ev);
      const ctl = ClimateController.create(loop.cfg, saved ? saved.controller : null, onEvent);
      loop.ctl = ctl;

      if (saved) {
        for (const a of ctl.alarmList()) {
          if (!a.acked) {
            const row = open.get(a.id);
            if (row && row.acked_at !== null) ctl.ack(a.id);
          }
        }
      }

      if (!saved) {
        const runtime = ClimateRuntime.createRuntime({ io: adapter.io, ctl, onReading: (r, cmd) => { loop.pendingReading = { r, cmd }; } });
        loop.runtime = runtime;
        runtime.poll();
      } else {
        adapter.io.write(ctl.state.cmd);
        const runtime = ClimateRuntime.createRuntime({ io: adapter.io, ctl, onReading: (r, cmd) => { loop.pendingReading = { r, cmd }; }, skipCurrent: true });
        loop.runtime = runtime;
      }
    } catch (err) {
      flushPendingEvents(id, loop);
      writeManagerEvent(id, 'serious', `Stopped by an error: ${err.message}`);
      loop.running = false;
      loop.error = err.message;
      return;
    }

    for (const w of warnings) writeManagerEvent(id, 'warning', `Settings: ${w}`);
    if (!saved) writeManagerEvent(id, 'info', 'Started');
    else writeManagerEvent(id, 'info', `Resumed after ${Math.round((t - saved.saved_at) / 60)} min stopped`);

    loop.running = true;
    loop.error = null;
    loop.lastNow = t;
    loop.stateSavedAt = t;

    if (!saved) {
      if (loop.pendingReading) {
        const pending = loop.pendingReading;
        loop.pendingReading = null;
        recordReading(id, loop, pending.r, pending.cmd);
      }
      saveState(id, loop);
    }
  }

  // ---------------- Tick (C2 section 8.2) ----------------
  function tickRoom(id, loop) {
    const t = now();
    let dt = t - loop.lastNow;
    if (dt < 0) dt = 0;
    loop.lastNow = t;
    const adapter = loop.adapter, runtime = loop.runtime;

    function pollAndRecord() {
      let got;
      try {
        got = runtime.poll();
      } catch (err) {
        crashRoom(id, loop, err);
        return false;
      }
      if (got) {
        const pending = loop.pendingReading;
        loop.pendingReading = null;
        recordReading(id, loop, pending.r, pending.cmd);
      }
      return true;
    }

    let crashed = false;
    if (adapter.io.advance && dt >= 1 && dt <= MAX_CATCH_UP_S) {
      for (let i = 0; i < dt; i++) {
        try { adapter.io.advance(1); } catch (err) { crashRoom(id, loop, err); crashed = true; break; }
        if (!pollAndRecord()) { crashed = true; break; }
      }
    } else if (adapter.io.advance && dt > MAX_CATCH_UP_S) {
      try { adapter.io.advance(dt); } catch (err) { crashRoom(id, loop, err); crashed = true; }
      if (!crashed && !pollAndRecord()) crashed = true;
    } else {
      if (!pollAndRecord()) crashed = true;
    }
    if (crashed) return;

    if (t - loop.stateSavedAt >= STATE_SAVE_S) saveState(id, loop);
    emitRoomIfChanged(id, loop);
  }

  function tick() {
    if (!active) return;
    const ids = Array.from(loops.keys()).sort((a, b) => a - b);
    for (const id of ids) {
      const loop = loops.get(id);
      if (!loop || !loop.running) continue;
      try {
        tickRoom(id, loop);
      } catch (err) {
        active = false;
        stopTimer();
        // C2 section 11: a database error during a tick is fatal for every room, not just this one.
        // Mark every loop as halted so stop(), restart(), archive(), applySettings() and ackAlarm() see
        // the same "not running" state a per-room crash leaves (no state save is tried, no "Stopped").
        for (const l of loops.values()) l.running = false;
        emit('fatal', { error: err });
        return;
      }
    }
  }

  function startTimer() {
    if (tickMs > 0 && !timer) {
      timer = setInterval(tick, tickMs);
      if (timer.unref) timer.unref();
    }
  }
  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // ---------------- Manager methods ----------------
  function start() {
    if (everStarted) return;
    everStarted = true;
    const existing = db.listRooms({ includeArchived: true });
    if (existing.length === 0) create(DEMO_ROOM);
    active = true;
    const rooms = db.listRooms();
    for (const room of rooms) {
      startLoopFromRow(room);
      emitRoomAlways(room.id);
    }
    if (tickMs > 0) startTimer();
  }

  function stop() {
    const ids = Array.from(loops.keys()).sort((a, b) => a - b);
    for (const id of ids) {
      const loop = loops.get(id);
      if (loop.running) {
        saveState(id, loop);
        writeManagerEvent(id, 'info', 'Stopped');
      }
      loops.delete(id);
    }
    stopTimer();
    active = false;
  }

  function list() {
    return db.listRooms().map(r => attachLive(r));
  }

  function get(id) {
    let room;
    try { room = db.getRoom(id); } catch (err) { if (err.code === 'NOT_FOUND') return null; throw err; }
    return attachLive(room);
  }

  function create(input) {
    const obj = isPlainObject(input) ? input : {};
    const details = [];
    const name = validateName(obj.name, details);
    const volume = validateVolume(obj.volume, details);
    const vent = validateVent(obj.vent, details);
    const settingsInput = obj.settings;
    if (settingsInput !== undefined && !isPlainObject(settingsInput)) details.push('settings must be an object');
    if (details.length > 0) throw new RoomError('bad_input', 'Bad input', details);

    const base = ClimateController.defaultSettings();
    base.roomM3 = volume;
    let settings, warnings;
    if (settingsInput === undefined) {
      settings = base;
      warnings = [];
    } else {
      const { settings: merged, warnings: dropped } = cleanSettings(settingsInput, base);
      let imported;
      try {
        imported = ClimateController.importSettings({ format: SETTINGS_FORMAT, version: ClimateController.SETTINGS_VERSION, settings: merged });
      } catch (err) {
        throw new RoomError('bad_input', 'Bad input', [err.message]);
      }
      settings = imported.settings;
      warnings = dropped.concat(imported.warnings);
    }

    const room = db.createRoom({ name, volume, vent, adapter: 'sim', settings, note: FIRST_NOTE, at: now() });
    const version = db.currentSettings(room.id);
    emit('settings', { roomId: room.id, version, settings: version.settings, warnings, auto: false });
    writeManagerEvent(room.id, 'info', 'Room created');
    if (active) startLoopFromRow(room);
    emitRoomAlways(room.id);
    return { room: get(room.id), warnings };
  }

  function update(id, changesInput) {
    const room = requireRoomRow(id);
    const details = [];
    if (room.archived_at !== null) throw new RoomError('bad_input', 'Bad input', [`room ${id} is archived`]);
    if (!isPlainObject(changesInput)) throw new RoomError('bad_input', 'Bad input', ['changes must be an object']);
    const toApply = {};
    for (const key of Object.keys(changesInput)) {
      if (key === 'name') toApply.name = validateName(changesInput.name, details);
      else if (key === 'volume') toApply.volume = validateVolume(changesInput.volume, details);
      else if (key === 'vent') toApply.vent = validateVent(changesInput.vent, details);
      else details.push(`unknown field "${key}"`);
    }
    if (details.length > 0) throw new RoomError('bad_input', 'Bad input', details);

    db.updateRoom(id, toApply);
    const loop = loops.get(id);
    const volumeOrVentChanged = (('volume' in toApply) && toApply.volume !== room.volume) ||
      (('vent' in toApply) && toApply.vent !== room.vent);
    if (volumeOrVentChanged && loop && loop.running) {
      restart(id);
    } else {
      emitRoomAlways(id);
    }
    return get(id);
  }

  function archive(id) {
    const room = requireRoomRow(id);
    if (room.archived_at !== null) return get(id);
    const loop = loops.get(id);
    if (loop) {
      if (loop.running) {
        saveState(id, loop);
        writeManagerEvent(id, 'info', 'Stopped');
      }
      loops.delete(id);
    }
    db.archiveRoom(id, now());
    writeManagerEvent(id, 'info', 'Room archived');
    emitRoomAlways(id);
    return get(id);
  }

  function restart(id) {
    const room = requireRoomRow(id);
    if (room.archived_at !== null) throw new RoomError('bad_input', 'Bad input', [`room ${id} is archived`]);
    const loop = loops.get(id);
    if (loop) {
      if (loop.running) {
        saveState(id, loop);
        writeManagerEvent(id, 'info', 'Stopped');
      }
      loops.delete(id);
    }
    if (active) startLoopFromRow(room);
    emitRoomAlways(id);
    return get(id);
  }

  // Steps 5-9 (C2 section 9.2): the controller and cfg work only. No db write happens here, so a crash in
  // this part (section 11, "Error in steps 5-9") is the only case the caller of this function should catch.
  function applyTargetsAndStage(loop, next, exact) {
    const cfg = loop.cfg, ctl = loop.ctl;
    const keep = {};
    for (const k of TARGET_KEYS) keep[k] = getPath(cfg, k);
    const changed = exact ? TARGET_KEYS.slice() : TARGET_KEYS.filter(k => getPath(next, k) !== getPath(loop.base, k));
    ClimateController.applySettings(cfg, next);
    for (const k of TARGET_KEYS) if (!changed.includes(k)) setPath(cfg, k, keep[k]);

    const pairWarnings = [];
    pairCorrect(cfg, 'rules.fanOn', 'rules.fanOff', changed, pairWarnings);

    const t = loop.runtime && loop.runtime.reading ? loop.runtime.reading.t : now();
    let stageCallMade = false;
    if (next.farmType !== loop.base.farmType) { ctl.setFarmType(next.farmType, t); stageCallMade = true; }
    else if (next.crop !== loop.base.crop) { ctl.setCrop(next.crop, t); stageCallMade = true; }
    else if (next.stage !== loop.base.stage) { ctl.setStage(next.stage, t); stageCallMade = true; }

    if (exact) {
      ctl.cancelRamp();
      for (const k of TARGET_KEYS) setPath(cfg, k, getPath(next, k));
    } else if (!stageCallMade && changed.length > 0) {
      ctl.cancelRamp();
    }

    return { pairWarnings, stageCallMade };
  }

  // Step 10 (C2 section 9.2): the controller events kept since step 5, the "Targets restored" event (with
  // exact when step 9 made one of the three calls), then alarm changes. These are db writes and must not
  // be swallowed by the crash-isolation catch around steps 5-9 (section 11: a db error inside a method is
  // thrown to the caller, not turned into a room crash).
  function recordTargetsAndStage(id, loop, exact, stageCallMade) {
    const cfg = loop.cfg;
    const stored = structuredClone(cfg);
    flushPendingEvents(id, loop);
    if (exact && stageCallMade) {
      writeManagerEvent(id, 'info', `Targets restored: ${cfg.spT} °C, ${cfg.spRH} % RH, CO₂ limit ${cfg.co2Lim} ppm, no ramp.`);
    }
    syncAlarms(id, loop, now());
    return stored;
  }

  function applySettings(id, settingsInput, note, options) {
    const room = requireRoomRow(id);
    const details = [];
    if (room.archived_at !== null) details.push(`room ${id} is archived`);
    if (!isPlainObject(settingsInput)) details.push('settings must be an object');
    const trimmedNote = validateNote(note, details);
    if (details.length > 0) throw new RoomError('bad_input', 'Bad input', details);

    const loop = loops.get(id);
    const base = loop && loop.base ? loop.base : db.currentSettings(id).settings;

    const { settings: merged, warnings: dropped } = cleanSettings(settingsInput, base);
    let imported;
    try {
      imported = ClimateController.importSettings({ format: SETTINGS_FORMAT, version: ClimateController.SETTINGS_VERSION, settings: merged });
    } catch (err) {
      throw new RoomError('bad_input', 'Bad input', [err.message]);
    }
    const next = imported.settings;
    let warnings = dropped.concat(imported.warnings);
    const exact = !!(options && options.exact === true);

    let stored;
    const runningNow = !!(loop && loop.running);
    if (!runningNow) {
      stored = next;
    } else {
      let applied = null;
      try {
        applied = applyTargetsAndStage(loop, next, exact);
      } catch (err) {
        flushPendingEvents(id, loop);
        writeManagerEvent(id, 'serious', `Stopped by an error: ${err.message}`);
        loop.running = false;
        loop.error = err.message;
        stored = next;
      }
      if (applied) {
        // Step 10: outside the try, so a db error here propagates to the caller instead of crashing the room.
        stored = recordTargetsAndStage(id, loop, exact, applied.stageCallMade);
        warnings = warnings.concat(applied.pairWarnings);
      }
    }

    const version = db.saveSettings(id, { settings: stored, note: trimmedNote, at: now() });
    if (loop) loop.base = structuredClone(stored);
    writeManagerEvent(id, 'info', `Settings saved (version ${version.id})` + (trimmedNote ? `: ${trimmedNote}` : ''));

    if (loop && loop.running) saveState(id, loop);

    emit('settings', { roomId: id, version, settings: version.settings, warnings, auto: false });
    if (loop) emitRoomIfChanged(id, loop);

    return { settings: stored, warnings, version };
  }

  function ackAlarm(id, alarmKey) {
    requireRoomRow(id);
    if (typeof alarmKey !== 'string' || alarmKey.length === 0) {
      throw new RoomError('bad_input', 'Bad input', ['alarmKey must be a non-empty string']);
    }
    const at = now();
    const pending = db.listAlarms(id, { recent: ACK_SCAN }).filter(a => a.alarm_key === alarmKey && a.acked_at === null);
    let latest;
    try {
      latest = db.ackAlarm(id, alarmKey, at);
    } catch (err) {
      if (err.code === 'NOT_FOUND' && err.what === 'alarm') throw new RoomError('not_found', `No alarm "${alarmKey}" in room ${id}`, []);
      throw err;
    }
    const loop = loops.get(id);
    if (loop && loop.ctl) {
      loop.ctl.ack(alarmKey);
      if (loop.open.has(alarmKey)) {
        const row = loop.open.get(alarmKey);
        loop.open.set(alarmKey, Object.assign({}, row, { acked_at: at }));
      }
    }
    if (pending.length > 0) {
      writeManagerEvent(id, 'info', `Acknowledged: ${latest.label}`);
      for (const row of pending) emit('alarm', { roomId: id, change: 'acked', alarm: Object.assign({}, row, { acked_at: at }) });
    }
    if (loop && loop.running) saveState(id, loop);
    if (loop) emitRoomIfChanged(id, loop);
    return latest;
  }

  return {
    start, stop, tick, list, get, create, update, archive, restart, applySettings, ackAlarm, on, off,
  };
}

module.exports = { createRoomManager, defaultAdapterFactory, TARGET_KEYS, RoomError, DEMO_ROOM, FIRST_NOTE, cleanSettings };
