// In-memory fake of the C2 room manager (docs/contracts/rooms.md section 16). No loop, no timer, no adapter, no
// controller. Writes through the C1 db it is given, so API tests that write through C2 and read through C1 see the
// same data.
'use strict';
require('../../controller.js'); // defines globalThis.ClimateController
const { RoomError, DEMO_ROOM, FIRST_NOTE, cleanSettings } = require('../../server/rooms-common.js');

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function createFakeRoomManager({ db, now = () => Math.floor(Date.now() / 1000) }) {
  const calls = [];
  const liveOverrides = new Map(); // roomId -> partial Live, from setLive/restart
  const listeners = new Map(); // event name -> listener[]

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

  function setLive(id, partial) {
    const existing = liveOverrides.get(id) || {};
    liveOverrides.set(id, Object.assign({}, existing, partial));
  }

  function findRoomOrNull(id) {
    try { return db.getRoom(id); } catch (err) { if (err.code === 'NOT_FOUND') return null; throw err; }
  }

  function requireRoom(id) {
    const room = findRoomOrNull(id);
    if (!room) throw new RoomError('not_found', `Room ${id} not found`, []);
    return room;
  }

  function defaultLive(room) {
    const settings = db.currentSettings(room.id).settings;
    const alarms = db.listAlarms(room.id, { recent: 0 }).length;
    return { reading: null, stage: settings.stage, crop: settings.crop, targets: null, status: null, alarms, running: true, error: null };
  }

  function rawGet(id) {
    const room = findRoomOrNull(id);
    if (!room) return null;
    if (room.archived_at !== null) return Object.assign({}, room, { live: null });
    const live = defaultLive(room);
    const overrides = liveOverrides.get(id);
    if (overrides) Object.assign(live, overrides);
    return Object.assign({}, room, { live });
  }

  function rawList() {
    return db.listRooms().map(r => rawGet(r.id));
  }

  function validateName(name, details) {
    if (typeof name === 'string') {
      const trimmed = name.trim();
      if (trimmed.length >= 1 && trimmed.length <= 60) return trimmed;
    }
    details.push('name must be 1 to 60 characters');
    return undefined;
  }
  function validateVolume(volume, details) {
    if (typeof volume === 'number' && Number.isFinite(volume) && volume >= 5 && volume <= 5000) return volume;
    details.push('volume must be a number from 5 to 5000 (m³)');
    return undefined;
  }
  function validateVent(vent, details) {
    if (vent === 'supply' || vent === 'exhaust') return vent;
    details.push('vent must be "supply" or "exhaust"');
    return undefined;
  }

  function mergeAndImport(settingsInput, base) {
    const { settings: merged, warnings: dropped } = cleanSettings(settingsInput, base);
    let imported;
    try {
      imported = globalThis.ClimateController.importSettings({
        format: 'mushroom-climate-settings',
        version: globalThis.ClimateController.SETTINGS_VERSION,
        settings: merged,
      });
    } catch (err) {
      throw new RoomError('bad_input', 'Bad input', [err.message]);
    }
    return { settings: imported.settings, warnings: dropped.concat(imported.warnings) };
  }

  function rawCreate(input) {
    const obj = isPlainObject(input) ? input : {};
    const details = [];
    const name = validateName(obj.name, details);
    const volume = validateVolume(obj.volume, details);
    const vent = validateVent(obj.vent, details);
    const settingsInput = obj.settings;
    if (settingsInput !== undefined && !isPlainObject(settingsInput)) details.push('settings must be an object');
    if (details.length > 0) throw new RoomError('bad_input', 'Bad input', details);

    const base = globalThis.ClimateController.defaultSettings();
    base.roomM3 = volume;
    let settings, warnings;
    if (settingsInput === undefined) {
      settings = base;
      warnings = [];
    } else {
      const result = mergeAndImport(settingsInput, base);
      settings = result.settings;
      warnings = result.warnings;
    }

    const room = db.createRoom({ name, volume, vent, adapter: 'sim', settings, note: FIRST_NOTE, at: now() });
    const version = db.currentSettings(room.id);
    emit('settings', { roomId: room.id, version, settings: version.settings, warnings, auto: false });
    const event = db.addEvent(room.id, { t: now(), level: 'info', text: 'Room created' });
    emit('event', { roomId: room.id, event });
    emit('room', { room: rawGet(room.id) });
    return { room: rawGet(room.id), warnings };
  }

  function rawUpdate(id, changesInput) {
    const room = requireRoom(id);
    const changes = isPlainObject(changesInput) ? changesInput : {};
    const details = [];
    if (room.archived_at !== null) details.push(`room ${id} is archived`);
    const toApply = {};
    for (const key of Object.keys(changes)) {
      if (key === 'name') toApply.name = validateName(changes.name, details);
      else if (key === 'volume') toApply.volume = validateVolume(changes.volume, details);
      else if (key === 'vent') toApply.vent = validateVent(changes.vent, details);
      else details.push(`unknown field "${key}"`);
    }
    if (details.length > 0) throw new RoomError('bad_input', 'Bad input', details);
    db.updateRoom(id, toApply);
    emit('room', { room: rawGet(id) });
    return rawGet(id);
  }

  function rawArchive(id) {
    const room = requireRoom(id);
    if (room.archived_at !== null) return rawGet(id);
    db.archiveRoom(id, now());
    const event = db.addEvent(id, { t: now(), level: 'info', text: 'Room archived' });
    emit('event', { roomId: id, event });
    emit('room', { room: rawGet(id) });
    return rawGet(id);
  }

  function rawRestart(id) {
    const room = requireRoom(id);
    if (room.archived_at !== null) throw new RoomError('bad_input', 'Bad input', [`room ${id} is archived`]);
    setLive(id, { running: true, error: null });
    emit('room', { room: rawGet(id) });
    return rawGet(id);
  }

  function rawApplySettings(id, settings, note, options) {
    const room = requireRoom(id);
    const details = [];
    if (room.archived_at !== null) details.push(`room ${id} is archived`);
    if (!isPlainObject(settings)) details.push('settings must be an object');
    let trimmedNote = null;
    if (note !== undefined && note !== null) {
      if (typeof note !== 'string') details.push('note must be text of at most 200 characters');
      else {
        const t = note.trim();
        if (t.length > 200) details.push('note must be text of at most 200 characters');
        else trimmedNote = t === '' ? null : t;
      }
    }
    if (details.length > 0) throw new RoomError('bad_input', 'Bad input', details);

    const base = db.currentSettings(id).settings;
    const { settings: next, warnings } = mergeAndImport(settings, base);
    const version = db.saveSettings(id, { settings: next, note: trimmedNote, at: now() });
    const text = `Settings saved (version ${version.id})` + (trimmedNote ? `: ${trimmedNote}` : '');
    const event = db.addEvent(id, { t: now(), level: 'info', text });
    emit('event', { roomId: id, event });
    emit('settings', { roomId: id, version, settings: version.settings, warnings, auto: false });
    return { settings: version.settings, warnings, version };
  }

  function rawAckAlarm(id, alarmKey) {
    requireRoom(id);
    if (typeof alarmKey !== 'string' || alarmKey.length === 0) throw new RoomError('bad_input', 'Bad input', ['alarmKey must be a non-empty string']);
    const at = now();
    const pending = db.listAlarms(id, { recent: 500 }).filter(a => a.alarm_key === alarmKey && a.acked_at === null);
    let latest;
    try {
      latest = db.ackAlarm(id, alarmKey, at);
    } catch (err) {
      if (err.code === 'NOT_FOUND' && err.what === 'alarm') throw new RoomError('not_found', `No alarm "${alarmKey}" in room ${id}`, []);
      throw err;
    }
    if (pending.length > 0) {
      const event = db.addEvent(id, { t: at, level: 'info', text: `Acknowledged: ${latest.label}` });
      emit('event', { roomId: id, event });
      for (const row of pending) emit('alarm', { roomId: id, change: 'acked', alarm: Object.assign({}, row, { acked_at: at }) });
    }
    return latest;
  }

  function wrap(method, fn) {
    return (...args) => {
      calls.push({ method, args });
      return fn(...args);
    };
  }

  return {
    calls,
    start: wrap('start', () => undefined),
    stop: wrap('stop', () => undefined),
    tick: wrap('tick', () => undefined),
    list: wrap('list', rawList),
    get: wrap('get', rawGet),
    create: wrap('create', rawCreate),
    update: wrap('update', rawUpdate),
    archive: wrap('archive', rawArchive),
    restart: wrap('restart', rawRestart),
    applySettings: wrap('applySettings', rawApplySettings),
    ackAlarm: wrap('ackAlarm', rawAckAlarm),
    on, off, emit, setLive,
  };
}

module.exports = { createFakeRoomManager };
