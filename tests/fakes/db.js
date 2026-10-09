// In-memory fake of the C1 database (docs/contracts/db.md section 9). No SQLite; requires only db-common.js.
'use strict';
const { NotFoundError, toJson, fromJson } = require('../../server/db-common.js');

const AC_MODES = ['off', 'cool', 'heat', 'dry', 'fan'];
const EVENT_LEVELS = ['info', 'good', 'warning', 'serious', 'critical'];
const ALARM_LEVELS = ['warning', 'serious', 'critical'];
const CAPACITY_VERDICTS = ['good', 'tight', 'too-dense', 'too-empty', 'impossible'];

function constraintError(message, errcode) {
  return Object.assign(new Error(message), { code: 'ERR_SQLITE_ERROR', errcode, errstr: 'constraint failed' });
}

// A plain INTEGER/REAL/TEXT column (not JSON). `type`: 'INTEGER' | 'REAL' | 'TEXT'. `boolInt`: true/false accepted.
function numColumn(raw, { type, notNull, boolInt, check, name }) {
  let v = raw;
  if (boolInt) {
    if (v === true) v = 1;
    else if (v === false) v = 0;
  }
  let isNull = v === undefined || v === null;
  if (!isNull && (type === 'INTEGER' || type === 'REAL') && typeof v === 'number' && !Number.isFinite(v)) isNull = true;
  if (isNull) {
    if (notNull) throw constraintError(`NOT NULL constraint failed: ${name}`, 1299);
    return null;
  }
  if (type === 'INTEGER' || type === 'REAL') {
    if (typeof v !== 'number') throw constraintError(`cannot store value in ${type} column ${name}`, 3091);
    if (type === 'INTEGER' && !Number.isInteger(v)) throw constraintError(`cannot store REAL value in INTEGER column ${name}`, 3091);
  }
  if (check && !check(v)) throw constraintError(`CHECK constraint failed: ${name}`, 275);
  return v;
}

// A JSON column. `raw` already has its default (if any) applied by the caller.
function jsonColumn(raw, notNull, name) {
  if (raw === undefined) {
    if (notNull) throw constraintError(`NOT NULL constraint failed: ${name}`, 1299);
    return null;
  }
  return toJson(raw);
}

function jsonOrNull(text) {
  return text === null || text === undefined ? null : fromJson(text);
}

function checkFields(obj, allowed, label) {
  if (obj == null) return;
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) throw new TypeError(`${label}: unknown field "${k}"`);
  }
}

// A missing (undefined) or explicit null options/query argument is treated as {}.
function orEmpty(v) {
  return v == null ? {} : v;
}

function openFakeDb(options) {
  options = orEmpty(options);
  for (const k of Object.keys(options)) {
    if (k !== 'now') throw new TypeError(`openFakeDb: unknown option "${k}"`);
  }
  const now = options.now || (() => Math.floor(Date.now() / 1000));

  let closed = false;
  let rooms = [];
  let roomSettings = [];
  let calibrations = [];
  let cropMixes = []; // { room_id, pos, crop, blocks, co2_per_block }
  let capacityReports = [];
  let readings = []; // internal: { room_id, t, T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh, _seq }
  let events = [];
  let alarms = [];
  const controllerState = new Map(); // room_id -> { room_id, saved_at, controller: text, sim: text|null }

  const nextId = { room: 1, settings: 1, calibration: 1, event: 1, alarm: 1, capacity: 1 };
  let readingSeq = 0;

  function assertOpen() {
    if (closed) throw new Error('database is not open');
  }

  function findRoom(id) {
    return Number.isInteger(id) ? rooms.find(r => r.id === id) : undefined;
  }

  function requireRoom(id) {
    const room = findRoom(id);
    if (!room) throw new NotFoundError('room', id);
    return room;
  }

  function roomToPublic(r) {
    return { id: r.id, name: r.name, volume: r.volume, adapter: r.adapter, created_at: r.created_at, archived_at: r.archived_at };
  }

  function settingsVersionToPublic(v) {
    return { id: v.id, room_id: v.room_id, saved_at: v.saved_at, note: v.note, settings: jsonOrNull(v.settings) };
  }

  function readingToPublic(r) {
    return {
      room_id: r.room_id, t: r.t, T: r.T, RH: r.RH, CO2: r.CO2, t_out: r.t_out, rh_out: r.rh_out,
      ac_mode: r.ac_mode, ac_setpoint: r.ac_setpoint, fog: r.fog, air: r.air, lights: r.lights, circ: r.circ,
      power_w: r.power_w, kwh: r.kwh,
    };
  }

  function eventToPublic(e) {
    return { id: e.id, room_id: e.room_id, t: e.t, level: e.level, text: e.text };
  }

  function alarmToPublic(a) {
    return { id: a.id, room_id: a.room_id, alarm_key: a.alarm_key, level: a.level, label: a.label, raised_at: a.raised_at, cleared_at: a.cleared_at, acked_at: a.acked_at };
  }

  function calibrationToPublic(c) {
    return {
      id: c.id, room_id: c.room_id, run_at: c.run_at, ua: c.ua, inf_ach: c.inf_ach, moist_buffer: c.moist_buffer,
      co2_per_block: c.co2_per_block, rmse_t: c.rmse_t, rmse_rh: c.rmse_rh, rmse_co2: c.rmse_co2,
      log_rows: c.log_rows, applied_at: c.applied_at,
    };
  }

  function mixRowToPublic(m) {
    return { crop: m.crop, blocks: m.blocks, co2_per_block: m.co2_per_block };
  }

  function capacityReportToPublic(c) {
    return { id: c.id, room_id: c.room_id, run_at: c.run_at, verdict: c.verdict, utilisation: c.utilisation, report: jsonOrNull(c.report) };
  }

  function createRoom(room) {
    assertOpen();
    checkFields(room, ['name', 'volume', 'adapter', 'settings', 'note', 'at'], 'createRoom');
    const name = numColumn(room.name, { type: 'TEXT', notNull: true, name: 'rooms.name' });
    const volume = numColumn(room.volume, { type: 'REAL', notNull: true, check: v => v > 0, name: 'rooms.volume' });
    const adapter = numColumn(room.adapter === undefined ? 'sim' : room.adapter, { type: 'TEXT', notNull: true, name: 'rooms.adapter' });
    const settingsText = jsonColumn(room.settings, true, 'room_settings.settings');
    const note = numColumn(room.note === undefined ? 'Created' : room.note, { type: 'TEXT', notNull: false, name: 'room_settings.note' });
    const at = numColumn(room.at === undefined ? now() : room.at, { type: 'INTEGER', notNull: true, name: 'rooms.created_at' });

    const id = nextId.room++;
    const roomRow = { id, name, volume, adapter, created_at: at, archived_at: null };
    rooms.push(roomRow);
    const settingsId = nextId.settings++;
    roomSettings.push({ id: settingsId, room_id: id, saved_at: at, settings: settingsText, note });
    return roomToPublic(roomRow);
  }

  function listRooms(options) {
    assertOpen();
    options = orEmpty(options);
    checkFields(options, ['includeArchived'], 'listRooms');
    const includeArchived = options.includeArchived === true;
    return rooms
      .filter(r => includeArchived || r.archived_at === null)
      .slice()
      .sort((a, b) => a.id - b.id)
      .map(roomToPublic);
  }

  function getRoom(id) {
    assertOpen();
    return roomToPublic(requireRoom(id));
  }

  function updateRoom(id, changes) {
    assertOpen();
    const room = requireRoom(id);
    checkFields(changes, ['name', 'volume'], 'updateRoom');
    const updated = {};
    if ('name' in changes) updated.name = numColumn(changes.name, { type: 'TEXT', notNull: true, name: 'rooms.name' });
    if ('volume' in changes) updated.volume = numColumn(changes.volume, { type: 'REAL', notNull: true, check: v => v > 0, name: 'rooms.volume' });
    Object.assign(room, updated);
    return roomToPublic(room);
  }

  function archiveRoom(id, at) {
    assertOpen();
    const room = requireRoom(id);
    if (room.archived_at === null) {
      room.archived_at = numColumn(at === undefined ? now() : at, { type: 'INTEGER', notNull: false, name: 'rooms.archived_at' });
    }
    return roomToPublic(room);
  }

  function saveSettings(roomId, version) {
    assertOpen();
    requireRoom(roomId);
    checkFields(version, ['settings', 'note', 'at'], 'saveSettings');
    const settingsText = jsonColumn(version.settings, true, 'room_settings.settings');
    const note = numColumn(version.note === undefined ? null : version.note, { type: 'TEXT', notNull: false, name: 'room_settings.note' });
    const at = numColumn(version.at === undefined ? now() : version.at, { type: 'INTEGER', notNull: true, name: 'room_settings.saved_at' });
    const id = nextId.settings++;
    const row = { id, room_id: roomId, saved_at: at, settings: settingsText, note };
    roomSettings.push(row);
    return settingsVersionToPublic(row);
  }

  function currentSettings(roomId) {
    assertOpen();
    requireRoom(roomId);
    const rows = roomSettings.filter(v => v.room_id === roomId);
    if (rows.length === 0) throw new NotFoundError('settings', roomId);
    const row = rows.reduce((a, b) => (b.id > a.id ? b : a));
    return settingsVersionToPublic(row);
  }

  function settingsHistory(roomId) {
    assertOpen();
    requireRoom(roomId);
    return roomSettings
      .filter(v => v.room_id === roomId)
      .slice()
      .sort((a, b) => b.id - a.id)
      .map(v => ({ id: v.id, saved_at: v.saved_at, note: v.note }));
  }

  function getSettingsVersion(roomId, versionId) {
    assertOpen();
    requireRoom(roomId);
    const row = roomSettings.find(v => v.id === versionId && v.room_id === roomId);
    if (!row) throw new NotFoundError('settings', versionId);
    return settingsVersionToPublic(row);
  }

  const READING_KEYS = ['room_id', 't', 'T', 'RH', 'CO2', 't_out', 'rh_out', 'ac_mode', 'ac_setpoint', 'fog', 'air', 'lights', 'circ', 'power_w', 'kwh'];

  function insertReading(roomId, reading) {
    assertOpen();
    requireRoom(roomId);
    checkFields(reading, READING_KEYS, 'insertReading');
    if (reading.room_id !== undefined && reading.room_id !== roomId) throw new TypeError('insertReading: room_id does not match roomId');
    const t = numColumn(reading.t, { type: 'INTEGER', notNull: true, name: 'readings.t' });
    const T = numColumn(reading.T, { type: 'REAL', notNull: false, name: 'readings.temp' });
    const RH = numColumn(reading.RH, { type: 'REAL', notNull: false, name: 'readings.RH' });
    const CO2 = numColumn(reading.CO2, { type: 'REAL', notNull: false, name: 'readings.CO2' });
    const t_out = numColumn(reading.t_out, { type: 'REAL', notNull: false, name: 'readings.t_out' });
    const rh_out = numColumn(reading.rh_out, { type: 'REAL', notNull: false, name: 'readings.rh_out' });
    const ac_setpoint = numColumn(reading.ac_setpoint, { type: 'REAL', notNull: false, name: 'readings.ac_setpoint' });
    const power_w = numColumn(reading.power_w, { type: 'REAL', notNull: false, name: 'readings.power_w' });
    const kwh = numColumn(reading.kwh, { type: 'REAL', notNull: false, name: 'readings.kwh' });
    const ac_mode = numColumn(reading.ac_mode, { type: 'TEXT', notNull: true, check: v => AC_MODES.includes(v), name: 'readings.ac_mode' });
    const fog = numColumn(reading.fog, { type: 'INTEGER', notNull: true, check: v => v >= 0 && v <= 3, name: 'readings.fog' });
    const air = numColumn(reading.air, { type: 'INTEGER', boolInt: true, notNull: true, check: v => v === 0 || v === 1, name: 'readings.air' });
    const lights = numColumn(reading.lights, { type: 'INTEGER', boolInt: true, notNull: true, check: v => v === 0 || v === 1, name: 'readings.lights' });
    const circ = numColumn(reading.circ, { type: 'INTEGER', boolInt: true, notNull: true, check: v => v === 0 || v === 1, name: 'readings.circ' });
    readings.push({
      room_id: roomId, t, T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh,
      _seq: readingSeq++,
    });
    return undefined;
  }

  function bucketReadings(rows, step) {
    const buckets = new Map(); // b -> rows[]
    for (const r of rows) {
      const b = Math.floor(r.t / step) * step;
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b).push(r);
    }
    const bs = Array.from(buckets.keys()).sort((a, b) => a - b);
    return bs.map(b => {
      const group = buckets.get(b);
      const mean = key => {
        const vals = group.map(r => r[key]).filter(v => v !== null && v !== undefined);
        return vals.length === 0 ? null : vals.reduce((a, v) => a + v, 0) / vals.length;
      };
      const meanAll = key => group.reduce((a, r) => a + r[key], 0) / group.length;
      let last = group[0];
      for (const r of group) {
        if (r.t > last.t || (r.t === last.t && r._seq > last._seq)) last = r;
      }
      return {
        room_id: group[0].room_id, t: b,
        T: mean('T'), RH: mean('RH'), CO2: mean('CO2'), t_out: mean('t_out'), rh_out: mean('rh_out'),
        ac_mode: last.ac_mode, ac_setpoint: mean('ac_setpoint'),
        fog: meanAll('fog'), air: meanAll('air'), lights: meanAll('lights'), circ: meanAll('circ'),
        power_w: mean('power_w'), kwh: last.kwh,
      };
    });
  }

  function queryReadings(roomId, query) {
    assertOpen();
    requireRoom(roomId);
    query = orEmpty(query);
    checkFields(query, ['from', 'to', 'step'], 'queryReadings');
    if (!Number.isInteger(query.from)) throw new RangeError('queryReadings: from must be an integer');
    if (!Number.isInteger(query.to)) throw new RangeError('queryReadings: to must be an integer');
    if (query.from > query.to) throw new RangeError('queryReadings: from must not be greater than to');
    const hasStep = query.step !== undefined && query.step !== null;
    if (hasStep && (!Number.isInteger(query.step) || query.step < 1)) throw new RangeError('queryReadings: step must be an integer of at least 1');
    const rows = readings
      .filter(r => r.room_id === roomId && r.t >= query.from && r.t <= query.to)
      .slice()
      .sort((a, b) => (a.t - b.t) || (a._seq - b._seq));
    if (!hasStep) return rows.map(readingToPublic);
    return bucketReadings(rows, query.step).map(readingToPublic);
  }

  function latestReading(roomId) {
    assertOpen();
    requireRoom(roomId);
    const rows = readings.filter(r => r.room_id === roomId);
    if (rows.length === 0) return null;
    let latest = rows[0];
    for (const r of rows) {
      if (r.t > latest.t || (r.t === latest.t && r._seq > latest._seq)) latest = r;
    }
    return readingToPublic(latest);
  }

  function addEvent(roomId, event) {
    assertOpen();
    requireRoom(roomId);
    checkFields(event, ['t', 'level', 'text'], 'addEvent');
    const t = numColumn(event.t, { type: 'INTEGER', notNull: true, name: 'events.t' });
    const level = numColumn(event.level, { type: 'TEXT', notNull: true, check: v => EVENT_LEVELS.includes(v), name: 'events.level' });
    const text = numColumn(event.text, { type: 'TEXT', notNull: true, name: 'events.text' });
    const id = nextId.event++;
    const row = { id, room_id: roomId, t, level, text };
    events.push(row);
    return eventToPublic(row);
  }

  function listEvents(roomId, options) {
    assertOpen();
    requireRoom(roomId);
    options = orEmpty(options);
    checkFields(options, ['limit', 'before'], 'listEvents');
    const limit = options.limit === undefined ? 100 : options.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('listEvents: limit must be an integer from 1 to 1000');
    const before = options.before === undefined ? null : options.before;
    if (before !== null && !Number.isInteger(before)) throw new RangeError('listEvents: before must be an integer or null');
    return events
      .filter(e => e.room_id === roomId && (before === null || e.id < before))
      .slice()
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
      .map(eventToPublic);
  }

  function raiseAlarm(roomId, alarm) {
    assertOpen();
    requireRoom(roomId);
    checkFields(alarm, ['alarm_key', 'level', 'label', 'at'], 'raiseAlarm');
    const alarm_key = numColumn(alarm.alarm_key, { type: 'TEXT', notNull: true, name: 'alarms.alarm_key' });
    const level = numColumn(alarm.level, { type: 'TEXT', notNull: true, check: v => ALARM_LEVELS.includes(v), name: 'alarms.level' });
    const label = numColumn(alarm.label, { type: 'TEXT', notNull: true, name: 'alarms.label' });
    const at = numColumn(alarm.at === undefined ? now() : alarm.at, { type: 'INTEGER', notNull: true, name: 'alarms.raised_at' });
    const open = alarms.find(a => a.room_id === roomId && a.alarm_key === alarm_key && a.cleared_at === null);
    if (open) return alarmToPublic(open);
    const id = nextId.alarm++;
    const row = { id, room_id: roomId, alarm_key, level, label, raised_at: at, cleared_at: null, acked_at: null };
    alarms.push(row);
    return alarmToPublic(row);
  }

  function clearAlarm(roomId, alarmKey, at) {
    assertOpen();
    requireRoom(roomId);
    const open = alarms.find(a => a.room_id === roomId && a.alarm_key === alarmKey && a.cleared_at === null);
    if (!open) return null;
    open.cleared_at = numColumn(at === undefined ? now() : at, { type: 'INTEGER', notNull: false, name: 'alarms.cleared_at' });
    return alarmToPublic(open);
  }

  function ackAlarm(roomId, alarmKey, at) {
    assertOpen();
    requireRoom(roomId);
    // Column rule (check 6) before the alarmKey sub-id lookup (check 7).
    const acked = numColumn(at === undefined ? now() : at, { type: 'INTEGER', notNull: false, name: 'alarms.acked_at' });
    const rows = alarms.filter(a => a.room_id === roomId && a.alarm_key === alarmKey);
    if (rows.length === 0) throw new NotFoundError('alarm', alarmKey);
    for (const row of rows) if (row.acked_at === null) row.acked_at = acked;
    const newest = rows.reduce((a, b) => (b.id > a.id ? b : a));
    return alarmToPublic(newest);
  }

  function listAlarms(roomId, options) {
    assertOpen();
    requireRoom(roomId);
    options = orEmpty(options);
    checkFields(options, ['recent'], 'listAlarms');
    const recent = options.recent === undefined ? 20 : options.recent;
    if (!Number.isInteger(recent) || recent < 0 || recent > 500) throw new RangeError('listAlarms: recent must be an integer from 0 to 500');
    const open = alarms
      .filter(a => a.room_id === roomId && a.cleared_at === null)
      .slice()
      .sort((a, b) => (b.raised_at - a.raised_at) || (b.id - a.id));
    const cleared = alarms
      .filter(a => a.room_id === roomId && a.cleared_at !== null)
      .slice()
      .sort((a, b) => (b.cleared_at - a.cleared_at) || (b.id - a.id))
      .slice(0, recent);
    return open.concat(cleared).map(alarmToPublic);
  }

  function saveControllerState(roomId, state) {
    assertOpen();
    requireRoom(roomId);
    checkFields(state, ['controller', 'sim', 'at'], 'saveControllerState');
    const controllerText = jsonColumn(state.controller, true, 'controller_state.controller');
    const simInput = state.sim === undefined ? null : state.sim;
    const simText = jsonColumn(simInput, false, 'controller_state.sim');
    const at = numColumn(state.at === undefined ? now() : state.at, { type: 'INTEGER', notNull: true, name: 'controller_state.saved_at' });
    controllerState.set(roomId, { room_id: roomId, saved_at: at, controller: controllerText, sim: simText });
    return undefined;
  }

  function loadControllerState(roomId) {
    assertOpen();
    requireRoom(roomId);
    const row = controllerState.get(roomId);
    if (!row) return null;
    return { room_id: row.room_id, saved_at: row.saved_at, controller: jsonOrNull(row.controller), sim: jsonOrNull(row.sim) };
  }

  function saveCalibration(roomId, run) {
    assertOpen();
    requireRoom(roomId);
    checkFields(run, ['ua', 'inf_ach', 'moist_buffer', 'co2_per_block', 'rmse_t', 'rmse_rh', 'rmse_co2', 'log_rows', 'run_at'], 'saveCalibration');
    const ua = numColumn(run.ua, { type: 'REAL', notNull: true, name: 'calibrations.ua' });
    const inf_ach = numColumn(run.inf_ach, { type: 'REAL', notNull: true, name: 'calibrations.inf_ach' });
    const moist_buffer = numColumn(run.moist_buffer, { type: 'REAL', notNull: true, name: 'calibrations.moist_buffer' });
    const co2_per_block = numColumn(run.co2_per_block, { type: 'REAL', notNull: true, name: 'calibrations.co2_per_block' });
    const rmse_t = numColumn(run.rmse_t === undefined ? null : run.rmse_t, { type: 'REAL', notNull: false, name: 'calibrations.rmse_t' });
    const rmse_rh = numColumn(run.rmse_rh === undefined ? null : run.rmse_rh, { type: 'REAL', notNull: false, name: 'calibrations.rmse_rh' });
    const rmse_co2 = numColumn(run.rmse_co2 === undefined ? null : run.rmse_co2, { type: 'REAL', notNull: false, name: 'calibrations.rmse_co2' });
    const log_rows = numColumn(run.log_rows === undefined ? null : run.log_rows, { type: 'INTEGER', notNull: false, name: 'calibrations.log_rows' });
    const run_at = numColumn(run.run_at === undefined ? now() : run.run_at, { type: 'INTEGER', notNull: true, name: 'calibrations.run_at' });
    const id = nextId.calibration++;
    const row = { id, room_id: roomId, run_at, ua, inf_ach, moist_buffer, co2_per_block, rmse_t, rmse_rh, rmse_co2, log_rows, applied_at: null };
    calibrations.push(row);
    return calibrationToPublic(row);
  }

  function listCalibrations(roomId) {
    assertOpen();
    requireRoom(roomId);
    return calibrations
      .filter(c => c.room_id === roomId)
      .slice()
      .sort((a, b) => (b.run_at - a.run_at) || (b.id - a.id))
      .map(calibrationToPublic);
  }

  function applyCalibration(roomId, runId, at) {
    assertOpen();
    requireRoom(roomId);
    // Column rule (check 6) before the runId sub-id lookup (check 7).
    const applied = numColumn(at === undefined ? now() : at, { type: 'INTEGER', notNull: false, name: 'calibrations.applied_at' });
    const row = calibrations.find(c => c.id === runId && c.room_id === roomId);
    if (!row) throw new NotFoundError('calibration', runId);
    row.applied_at = applied;
    return calibrationToPublic(row);
  }

  function currentCalibration(roomId) {
    assertOpen();
    requireRoom(roomId);
    const rows = calibrations.filter(c => c.room_id === roomId && c.applied_at !== null);
    if (rows.length === 0) return null;
    const row = rows.reduce((a, b) => (b.applied_at > a.applied_at || (b.applied_at === a.applied_at && b.id > a.id) ? b : a));
    return calibrationToPublic(row);
  }

  function getMix(roomId) {
    assertOpen();
    requireRoom(roomId);
    return cropMixes
      .filter(m => m.room_id === roomId)
      .slice()
      .sort((a, b) => a.pos - b.pos)
      .map(mixRowToPublic);
  }

  function replaceMix(roomId, rows) {
    assertOpen();
    requireRoom(roomId);
    // Check 3 (unknown fields) over every row before check 6 (column rules) over every row (section 5.3 order).
    for (const row of rows) checkFields(row, ['crop', 'blocks', 'co2_per_block'], 'replaceMix');
    const prepared = rows.map((row, pos) => {
      const crop = numColumn(row.crop, { type: 'TEXT', notNull: true, name: 'crop_mixes.crop' });
      const blocks = numColumn(row.blocks, { type: 'INTEGER', notNull: true, check: v => v >= 0, name: 'crop_mixes.blocks' });
      const co2_per_block = numColumn(row.co2_per_block, { type: 'REAL', notNull: false, name: 'crop_mixes.co2_per_block' });
      return { room_id: roomId, pos, crop, blocks, co2_per_block };
    });
    cropMixes = cropMixes.filter(m => m.room_id !== roomId).concat(prepared);
    return prepared.map(mixRowToPublic);
  }

  function saveCapacityReport(roomId, entry) {
    assertOpen();
    requireRoom(roomId);
    checkFields(entry, ['report', 'run_at'], 'saveCapacityReport');
    const reportText = jsonColumn(entry.report, true, 'capacity_reports.report');
    const verdict = numColumn(entry.report == null ? undefined : entry.report.verdict, { type: 'TEXT', notNull: true, check: v => CAPACITY_VERDICTS.includes(v), name: 'capacity_reports.verdict' });
    const rawUtilisation = entry.report ? entry.report.utilisation : undefined;
    const utilisation = numColumn(Number.isFinite(rawUtilisation) ? rawUtilisation : null, { type: 'INTEGER', notNull: false, name: 'capacity_reports.utilisation' });
    const run_at = numColumn(entry.run_at === undefined ? now() : entry.run_at, { type: 'INTEGER', notNull: true, name: 'capacity_reports.run_at' });
    const id = nextId.capacity++;
    const row = { id, room_id: roomId, run_at, verdict, utilisation, report: reportText };
    capacityReports.push(row);
    return capacityReportToPublic(row);
  }

  function latestCapacityReport(roomId) {
    assertOpen();
    requireRoom(roomId);
    const rows = capacityReports.filter(c => c.room_id === roomId);
    if (rows.length === 0) return null;
    const row = rows.reduce((a, b) => (b.id > a.id ? b : a));
    return capacityReportToPublic(row);
  }

  function close() {
    closed = true;
  }

  return {
    path: ':memory:',
    version: 2,
    close,
    createRoom, listRooms, getRoom, updateRoom, archiveRoom,
    saveSettings, currentSettings, settingsHistory, getSettingsVersion,
    insertReading, queryReadings, latestReading,
    addEvent, listEvents,
    raiseAlarm, clearAlarm, ackAlarm, listAlarms,
    saveControllerState, loadControllerState,
    saveCalibration, listCalibrations, applyCalibration, currentCalibration,
    getMix, replaceMix,
    saveCapacityReport, latestCapacityReport,
  };
}

module.exports = { openFakeDb };
