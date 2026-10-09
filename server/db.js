// The farm app's SQLite layer (docs/contracts/db.md, C1). CommonJS, synchronous.
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { NotFoundError, toJson, fromJson } = require('./db-common.js');
const { SCHEMA_V4_HARVEST } = require('./harvest-schema.js');

// Schema version 1 (C1 section 4, verbatim).
const SCHEMA_V1 = `
CREATE TABLE rooms (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  volume      REAL    NOT NULL CHECK (volume > 0),
  vent        TEXT    NOT NULL CHECK (vent IN ('supply', 'exhaust')),
  adapter     TEXT    NOT NULL DEFAULT 'sim',
  created_at  INTEGER NOT NULL,
  archived_at INTEGER
) STRICT;

CREATE TABLE room_settings (
  id       INTEGER PRIMARY KEY,
  room_id  INTEGER NOT NULL REFERENCES rooms (id),
  saved_at INTEGER NOT NULL,
  settings TEXT    NOT NULL,
  note     TEXT
) STRICT;
CREATE INDEX room_settings_room ON room_settings (room_id, id);

CREATE TABLE calibrations (
  id            INTEGER PRIMARY KEY,
  room_id       INTEGER NOT NULL REFERENCES rooms (id),
  run_at        INTEGER NOT NULL,
  ua            REAL    NOT NULL,
  inf_ach       REAL    NOT NULL,
  moist_buffer  REAL    NOT NULL,
  co2_per_block REAL    NOT NULL,
  rmse_t        REAL,
  rmse_rh       REAL,
  rmse_co2      REAL,
  log_rows      INTEGER,
  applied_at    INTEGER
) STRICT;
CREATE INDEX calibrations_room ON calibrations (room_id, run_at);

CREATE TABLE crop_mixes (
  room_id       INTEGER NOT NULL REFERENCES rooms (id),
  pos           INTEGER NOT NULL,
  crop          TEXT    NOT NULL,
  blocks        INTEGER NOT NULL CHECK (blocks >= 0),
  co2_per_block REAL,
  PRIMARY KEY (room_id, pos)
) STRICT;

CREATE TABLE capacity_reports (
  id          INTEGER PRIMARY KEY,
  room_id     INTEGER NOT NULL REFERENCES rooms (id),
  run_at      INTEGER NOT NULL,
  verdict     TEXT    NOT NULL CHECK (verdict IN ('good', 'tight', 'too-dense', 'too-empty', 'impossible')),
  utilisation INTEGER,
  report      TEXT    NOT NULL
) STRICT;
CREATE INDEX capacity_reports_room ON capacity_reports (room_id, id);

CREATE TABLE readings (
  room_id     INTEGER NOT NULL REFERENCES rooms (id),
  t           INTEGER NOT NULL,
  temp        REAL,
  RH          REAL,
  CO2         REAL,
  t_out       REAL,
  rh_out      REAL,
  ac_mode     TEXT    NOT NULL CHECK (ac_mode IN ('off', 'cool', 'heat', 'dry', 'fan')),
  ac_setpoint REAL,
  fog         INTEGER NOT NULL CHECK (fog BETWEEN 0 AND 3),
  fan         INTEGER NOT NULL CHECK (fan BETWEEN 0 AND 3),
  lights      INTEGER NOT NULL CHECK (lights IN (0, 1)),
  circ        INTEGER NOT NULL CHECK (circ IN (0, 1)),
  power_w     REAL,
  kwh         REAL
) STRICT;
CREATE INDEX readings_room_t ON readings (room_id, t);

CREATE TABLE events (
  id      INTEGER PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms (id),
  t       INTEGER NOT NULL,
  level   TEXT    NOT NULL CHECK (level IN ('info', 'good', 'warning', 'serious', 'critical')),
  text    TEXT    NOT NULL
) STRICT;
CREATE INDEX events_room ON events (room_id, id);

CREATE TABLE alarms (
  id         INTEGER PRIMARY KEY,
  room_id    INTEGER NOT NULL REFERENCES rooms (id),
  alarm_key  TEXT    NOT NULL,
  level      TEXT    NOT NULL CHECK (level IN ('warning', 'serious', 'critical')),
  label      TEXT    NOT NULL,
  raised_at  INTEGER NOT NULL,
  cleared_at INTEGER,
  acked_at   INTEGER
) STRICT;
CREATE INDEX alarms_room ON alarms (room_id, raised_at);
CREATE UNIQUE INDEX alarms_open ON alarms (room_id, alarm_key) WHERE cleared_at IS NULL;

CREATE TABLE controller_state (
  room_id    INTEGER PRIMARY KEY REFERENCES rooms (id),
  saved_at   INTEGER NOT NULL,
  controller TEXT    NOT NULL,
  sim        TEXT
) STRICT;
`;

// Schema version 2 (C9 section 6.2, verbatim): the reading key fan (0-3) becomes air (0/1); rooms.vent is dropped.
const SCHEMA_V2_AIR = `
CREATE TABLE readings_new (
  room_id     INTEGER NOT NULL REFERENCES rooms (id),
  t           INTEGER NOT NULL,
  temp        REAL,
  RH          REAL,
  CO2         REAL,
  t_out       REAL,
  rh_out      REAL,
  ac_mode     TEXT    NOT NULL CHECK (ac_mode IN ('off', 'cool', 'heat', 'dry', 'fan')),
  ac_setpoint REAL,
  fog         INTEGER NOT NULL CHECK (fog BETWEEN 0 AND 3),
  air         INTEGER NOT NULL CHECK (air IN (0, 1)),
  lights      INTEGER NOT NULL CHECK (lights IN (0, 1)),
  circ        INTEGER NOT NULL CHECK (circ IN (0, 1)),
  power_w     REAL,
  kwh         REAL
) STRICT;
INSERT INTO readings_new (room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh)
  SELECT room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, CASE WHEN fan > 0 THEN 1 ELSE 0 END, lights, circ, power_w, kwh FROM readings;
DROP TABLE readings;
ALTER TABLE readings_new RENAME TO readings;
CREATE INDEX readings_room_t ON readings (room_id, t);
ALTER TABLE rooms DROP COLUMN vent;
`;

// Schema version 3 (C1 section 4.4, verbatim): the wave 2 columns and tables.
const SCHEMA_V3_ROOMS = `
-- Upgrade 3: room-centred app and C8 equipment (lead decisions 18, 20, 23, 30, 33, 39, 50, 54).

-- Readings: what calib.js needs to replay a live room, and what Calibrate compares with a simulation (LD 20).
ALTER TABLE readings ADD COLUMN ac_fan TEXT CHECK (ac_fan IN ('low', 'auto', 'high'));
ALTER TABLE readings ADD COLUMN stage  TEXT;
ALTER TABLE readings ADD COLUMN core   REAL;

-- Calibrations: where the fitted log came from (LD 23) and the machines it was fitted with (LD 50).
ALTER TABLE calibrations ADD COLUMN source    TEXT CHECK (source IN ('csv', 'history', 'import'));
ALTER TABLE calibrations ADD COLUMN log_from  INTEGER;
ALTER TABLE calibrations ADD COLUMN log_to    INTEGER;
ALTER TABLE calibrations ADD COLUMN equipment TEXT;

-- Saved Simulate runs: capacity checks, full cycles and C8 equipment checks (LD 18, 39).
CREATE TABLE simulation_runs (
  id          INTEGER PRIMARY KEY,
  room_id     INTEGER NOT NULL REFERENCES rooms (id),
  created_at  INTEGER NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('cycle', 'capacity', 'equipment')),
  verdict     TEXT    NOT NULL CHECK (verdict IN ('pass', 'fail', 'impossible', 'good', 'tight', 'too-dense', 'too-empty',
                                                 'enough', 'too-small', 'too-big', 'oversized')),
  blocks      INTEGER NOT NULL CHECK (blocks >= 0),
  days        INTEGER CHECK (days >= 1),
  kwh         REAL,
  rm          REAL,
  utilisation INTEGER,
  real_start  INTEGER,
  note        TEXT,
  inputs      TEXT    NOT NULL,
  result      TEXT    NOT NULL,
  CHECK ((kind = 'cycle'     AND verdict IN ('pass', 'fail', 'impossible'))
      OR (kind = 'capacity'  AND verdict IN ('good', 'tight', 'too-dense', 'too-empty', 'impossible'))
      OR (kind = 'equipment' AND verdict IN ('enough', 'too-small', 'too-big', 'oversized', 'impossible')))
) STRICT;
CREATE INDEX simulation_runs_room ON simulation_runs (room_id, id);

-- C8: the machines of each room (one row per room; replaced on save) (LD 33, 54).
CREATE TABLE room_equipment (
  room_id   INTEGER PRIMARY KEY REFERENCES rooms (id),
  saved_at  INTEGER NOT NULL,
  ac_hp     REAL    NOT NULL CHECK (ac_hp IN (1, 1.5, 2, 2.5, 3, 4, 5, 6)),
  ac_units  INTEGER NOT NULL CHECK (ac_units BETWEEN 1 AND 4),
  fog_lph   REAL    NOT NULL CHECK (fog_lph BETWEEN 0.5 AND 50),
  air_m3h   REAL    NOT NULL CHECK (air_m3h BETWEEN 50 AND 10000),
  walls     TEXT    CHECK (walls IN ('zinc', 'brick115', 'brick230', 'eps50', 'eps75', 'eps100', 'pu50', 'pu75', 'pu100')),
  roof      TEXT    CHECK (roof IN ('zinc', 'eps50', 'eps75', 'eps100', 'pu50', 'pu75', 'pu100')),
  height    REAL    NOT NULL CHECK (height BETWEEN 2 AND 6),
  CHECK ((walls IS NULL) = (roof IS NULL))
) STRICT;
`;

// Released upgrades are never edited; a new one is appended (C1 section 3).
// Upgrade 4 (C10 3) lives in harvest-schema.js; db.js prepares no statement on its tables.
const UPGRADES = [
  { version: 1, sql: SCHEMA_V1 },
  { version: 2, sql: SCHEMA_V2_AIR },
  { version: 3, sql: SCHEMA_V3_ROOMS },
  { version: 4, sql: SCHEMA_V4_HARVEST },
];

// --- Section 4 binding helper: every bound value goes through this. ---
function val(x) {
  if (x === undefined) return null;
  if (x === true) return 1;
  if (x === false) return 0;
  if (typeof x === 'number' && !Number.isFinite(x)) return null;
  return x;
}

// A JSON column: only a left-out (undefined) value becomes NULL; everything else (including null) is encoded.
function jsonVal(v) {
  return v === undefined ? null : toJson(v);
}

function plain(row) {
  return row ? { ...row } : null;
}

function fields(fn, obj, allowed) {
  if (obj === undefined || obj === null) return;
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) throw new TypeError(`${fn}: unknown field "${k}"`);
  }
}

// --- Schema upgrades (C1 section 3). ---
function applyUpgrades(conn, upgrades, dbPath, now) {
  conn.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL) STRICT;');
  const currentRow = conn.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_version').get();
  const current = currentRow.version;
  const highest = upgrades.length ? upgrades[upgrades.length - 1].version : 0;
  if (current > highest) {
    throw new Error(`The database ${dbPath} has schema version ${current}; this app knows up to ${highest}. Use a newer version of the app.`);
  }
  const insertVersion = conn.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)');
  for (const u of upgrades) {
    if (u.version <= current) continue;
    conn.exec('BEGIN IMMEDIATE');
    try {
      conn.exec(u.sql);
      insertVersion.run(u.version, now());
      conn.exec('COMMIT');
    } catch (err) {
      conn.exec('ROLLBACK');
      throw new Error(`Schema upgrade ${u.version} failed: ${err.message}`);
    }
  }
  return conn.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_version').get().version;
}

// --- openDb (C1 section 2). ---
function checkOpenOptions(options) {
  // A left-out or explicit null options argument is treated as {} (as the fake does).
  const opts = options === undefined || options === null ? {} : options;
  for (const k of Object.keys(opts)) {
    if (k !== 'now' && k !== 'upgrades') throw new TypeError(`openDb: unknown field "${k}"`);
  }
  return opts;
}

function openDb(dbPath, options) {
  // Checked before step 1, so an unknown option throws before anything is written (C1 section 1).
  const opts = checkOpenOptions(options);
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true }); // step 1
  }
  const conn = new DatabaseSync(dbPath); // step 2
  try {
    return finishOpen(conn, dbPath, opts);
  } catch (err) {
    conn.close();
    throw err;
  }
}

function finishOpen(conn, dbPath, opts) {
  const now = opts.now || (() => Math.floor(Date.now() / 1000));
  const upgradeList = opts.upgrades || UPGRADES;

  conn.exec('PRAGMA journal_mode = WAL;'); // step 3
  conn.exec('PRAGMA foreign_keys = ON;'); // step 4
  conn.exec('PRAGMA synchronous = NORMAL;'); // step 5
  conn.exec('PRAGMA busy_timeout = 5000;'); // step 6

  const version = applyUpgrades(conn, upgradeList, dbPath, now); // step 7

  return buildDb(conn, dbPath, version, now); // step 8
}

// --- The db object (C1 section 6). ---
function buildDb(conn, dbPath, version, now) {
  let closed = false;

  function live() {
    if (closed) throw new Error('database is not open');
  }

  function tx(fn) {
    conn.exec('BEGIN');
    try {
      const result = fn();
      conn.exec('COMMIT');
      return result;
    } catch (err) {
      conn.exec('ROLLBACK');
      throw err;
    }
  }

  // Rooms (section 6.4)
  const getRoomStmt = conn.prepare('SELECT * FROM rooms WHERE id = :id');
  const insertRoomStmt = conn.prepare(
    'INSERT INTO rooms (name, volume, adapter, created_at) VALUES (:name, :volume, :adapter, :created_at)'
  );
  const updateNameStmt = conn.prepare('UPDATE rooms SET name = :v WHERE id = :id');
  const updateVolumeStmt = conn.prepare('UPDATE rooms SET volume = :v WHERE id = :id');
  const archiveRoomStmt = conn.prepare('UPDATE rooms SET archived_at = :at WHERE id = :id AND archived_at IS NULL');
  const listRoomsActiveStmt = conn.prepare('SELECT * FROM rooms WHERE archived_at IS NULL ORDER BY id');
  const listRoomsAllStmt = conn.prepare('SELECT * FROM rooms ORDER BY id');

  function roomExists(id) {
    return Number.isInteger(id) && !!getRoomStmt.get({ id });
  }
  function roomCheck(id) {
    if (!roomExists(id)) throw new NotFoundError('room', id);
  }

  function getRoom(id) {
    live();
    roomCheck(id);
    return plain(getRoomStmt.get({ id }));
  }

  function createRoom(room) {
    live();
    fields('createRoom', room, ['name', 'volume', 'adapter', 'settings', 'note', 'at']);
    const r = room || {};
    const adapter = r.adapter === undefined ? 'sim' : r.adapter;
    const note = r.note === undefined ? 'Created' : r.note;
    const at = r.at === undefined ? now() : r.at;
    return tx(() => {
      const info = insertRoomStmt.run({
        name: val(r.name), volume: val(r.volume), adapter: val(adapter), created_at: val(at),
      });
      const id = info.lastInsertRowid;
      insertSettingsStmt.run({ room_id: id, saved_at: val(at), settings: jsonVal(r.settings), note: val(note) });
      return plain(getRoomStmt.get({ id }));
    });
  }

  function updateRoom(id, changes) {
    live();
    roomCheck(id);
    fields('updateRoom', changes, ['name', 'volume']);
    const c = changes || {};
    // All or nothing (C1 section 1 "Validation"): a value that breaks one field's
    // rule must leave every field as it was, even though each field is its own
    // UPDATE statement.
    return tx(() => {
      if ('name' in c) updateNameStmt.run({ v: val(c.name), id });
      if ('volume' in c) updateVolumeStmt.run({ v: val(c.volume), id });
      return plain(getRoomStmt.get({ id }));
    });
  }

  function archiveRoom(id, at) {
    live();
    roomCheck(id);
    archiveRoomStmt.run({ at: val(at === undefined ? now() : at), id });
    return plain(getRoomStmt.get({ id }));
  }

  // Settings versions (section 6.5)
  const insertSettingsStmt = conn.prepare(
    'INSERT INTO room_settings (room_id, saved_at, settings, note) VALUES (:room_id, :saved_at, :settings, :note)'
  );
  const currentSettingsStmt = conn.prepare('SELECT * FROM room_settings WHERE room_id = :room_id ORDER BY id DESC LIMIT 1');
  const getSettingsByIdStmt = conn.prepare('SELECT * FROM room_settings WHERE id = :id');
  const settingsHistoryStmt = conn.prepare('SELECT id, saved_at, note FROM room_settings WHERE room_id = :room_id ORDER BY id DESC');
  const getSettingsVersionStmt = conn.prepare('SELECT * FROM room_settings WHERE id = :id AND room_id = :room_id');

  function settingsVersionToPublic(row) {
    return row ? { id: row.id, room_id: row.room_id, saved_at: row.saved_at, note: row.note, settings: fromJson(row.settings) } : null;
  }

  function currentSettings(roomId) {
    live();
    roomCheck(roomId);
    const row = currentSettingsStmt.get({ room_id: roomId });
    if (!row) throw new NotFoundError('settings', roomId);
    return settingsVersionToPublic(row);
  }

  function saveSettings(roomId, version) {
    live();
    roomCheck(roomId);
    fields('saveSettings', version, ['settings', 'note', 'at']);
    const v = version || {};
    const at = v.at === undefined ? now() : v.at;
    const info = insertSettingsStmt.run({
      room_id: roomId, saved_at: val(at), settings: jsonVal(v.settings), note: val(v.note === undefined ? null : v.note),
    });
    return settingsVersionToPublic(getSettingsByIdStmt.get({ id: info.lastInsertRowid }));
  }

  function settingsHistory(roomId) {
    live();
    roomCheck(roomId);
    return settingsHistoryStmt.all({ room_id: roomId }).map(plain);
  }

  function getSettingsVersion(roomId, versionId) {
    live();
    roomCheck(roomId);
    if (!Number.isInteger(versionId)) throw new NotFoundError('settings', versionId);
    const row = getSettingsVersionStmt.get({ id: versionId, room_id: roomId });
    if (!row) throw new NotFoundError('settings', versionId);
    return settingsVersionToPublic(row);
  }

  // Readings (section 6.6)
  const READING_KEYS = ['room_id', 't', 'T', 'RH', 'CO2', 't_out', 'rh_out', 'ac_mode', 'ac_setpoint', 'fog', 'air', 'lights', 'circ', 'power_w', 'kwh', 'ac_fan', 'stage', 'core'];
  const insertReadingStmt = conn.prepare(
    'INSERT INTO readings (room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh, ac_fan, stage, core) ' +
    'VALUES (:room_id, :t, :temp, :RH, :CO2, :t_out, :rh_out, :ac_mode, :ac_setpoint, :fog, :air, :lights, :circ, :power_w, :kwh, :ac_fan, :stage, :core)'
  );
  const RAW_READINGS_COLS = 'room_id, t, temp AS T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh, ac_fan, stage, core';
  const rawReadingsStmt = conn.prepare(
    `SELECT ${RAW_READINGS_COLS} FROM readings WHERE room_id = ? AND t >= ? AND t <= ? ORDER BY readings.t, readings.rowid`
  );
  const latestReadingStmt = conn.prepare(
    `SELECT ${RAW_READINGS_COLS} FROM readings WHERE room_id = ? ORDER BY readings.t DESC, readings.rowid DESC LIMIT 1`
  );
  const bucketReadingsStmt = conn.prepare(`
    SELECT room_id, b AS t, T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh,
           ac_fan, stage, core
    FROM (
      SELECT room_id,
             (t / CAST(:step AS INTEGER)) * CAST(:step AS INTEGER) AS b,
             AVG(temp) AS T, AVG(RH) AS RH, AVG(CO2) AS CO2, AVG(t_out) AS t_out, AVG(rh_out) AS rh_out,
             AVG(ac_setpoint) AS ac_setpoint, AVG(fog) AS fog, AVG(air) AS air,
             AVG(lights) AS lights, AVG(circ) AS circ, AVG(power_w) AS power_w, AVG(core) AS core,
             MAX(t) AS t_last, ac_mode, kwh, ac_fan, stage
      FROM readings
      WHERE room_id = :room_id AND t >= :from AND t <= :to
      GROUP BY b
    )
    ORDER BY b
  `);

  function insertReading(roomId, reading) {
    live();
    roomCheck(roomId);
    fields('insertReading', reading, READING_KEYS);
    const r = reading || {};
    if (r.room_id !== undefined && r.room_id !== roomId) throw new TypeError('insertReading: room_id does not match roomId');
    insertReadingStmt.run({
      room_id: roomId, t: val(r.t), temp: val(r.T), RH: val(r.RH), CO2: val(r.CO2),
      t_out: val(r.t_out), rh_out: val(r.rh_out), ac_mode: val(r.ac_mode), ac_setpoint: val(r.ac_setpoint),
      fog: val(r.fog), air: val(r.air), lights: val(r.lights), circ: val(r.circ), power_w: val(r.power_w), kwh: val(r.kwh),
      ac_fan: val(r.ac_fan), stage: val(r.stage), core: val(r.core),
    });
    return undefined;
  }

  function queryReadings(roomId, query) {
    live();
    roomCheck(roomId);
    fields('queryReadings', query, ['from', 'to', 'step']);
    const q = query || {};
    if (!Number.isInteger(q.from)) throw new RangeError('queryReadings: from must be an integer');
    if (!Number.isInteger(q.to)) throw new RangeError('queryReadings: to must be an integer');
    if (q.from > q.to) throw new RangeError('queryReadings: from must not be greater than to');
    const hasStep = q.step !== undefined && q.step !== null;
    if (hasStep && (!Number.isInteger(q.step) || q.step < 1)) throw new RangeError('queryReadings: step must be an integer of at least 1');
    if (!hasStep) return rawReadingsStmt.all(roomId, q.from, q.to).map(plain);
    return bucketReadingsStmt.all({ step: q.step, room_id: roomId, from: q.from, to: q.to }).map(plain);
  }

  function latestReading(roomId) {
    live();
    roomCheck(roomId);
    const row = latestReadingStmt.get(roomId);
    return row ? plain(row) : null;
  }

  // Events (section 6.7)
  const insertEventStmt = conn.prepare('INSERT INTO events (room_id, t, level, text) VALUES (:room_id, :t, :level, :text)');
  const getEventByIdStmt = conn.prepare('SELECT * FROM events WHERE id = :id');
  const listEventsStmt = conn.prepare('SELECT * FROM events WHERE room_id = :room_id ORDER BY id DESC LIMIT :limit');
  const listEventsBeforeStmt = conn.prepare('SELECT * FROM events WHERE room_id = :room_id AND id < :before ORDER BY id DESC LIMIT :limit');

  function addEvent(roomId, event) {
    live();
    roomCheck(roomId);
    fields('addEvent', event, ['t', 'level', 'text']);
    const e = event || {};
    const info = insertEventStmt.run({ room_id: roomId, t: val(e.t), level: val(e.level), text: val(e.text) });
    return plain(getEventByIdStmt.get({ id: info.lastInsertRowid }));
  }

  function listEvents(roomId, options) {
    live();
    roomCheck(roomId);
    fields('listEvents', options, ['limit', 'before']);
    const o = options || {};
    const limit = o.limit === undefined ? 100 : o.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RangeError('listEvents: limit must be an integer from 1 to 1000');
    const before = o.before === undefined ? null : o.before;
    if (before !== null && !Number.isInteger(before)) throw new RangeError('listEvents: before must be an integer or null');
    const rows = before === null
      ? listEventsStmt.all({ room_id: roomId, limit })
      : listEventsBeforeStmt.all({ room_id: roomId, before, limit });
    return rows.map(plain);
  }

  // Alarms (section 6.8)
  const insertAlarmStmt = conn.prepare(
    'INSERT INTO alarms (room_id, alarm_key, level, label, raised_at) VALUES (:room_id, :alarm_key, :level, :label, :raised_at)'
  );
  const getAlarmByIdStmt = conn.prepare('SELECT * FROM alarms WHERE id = :id');
  const findOpenAlarmStmt = conn.prepare('SELECT * FROM alarms WHERE room_id = :room_id AND alarm_key = :alarm_key AND cleared_at IS NULL');
  const clearAlarmStmt = conn.prepare('UPDATE alarms SET cleared_at = :at WHERE room_id = :room_id AND alarm_key = :alarm_key AND cleared_at IS NULL');
  const ackAlarmStmt = conn.prepare('UPDATE alarms SET acked_at = :at WHERE room_id = :room_id AND alarm_key = :alarm_key AND acked_at IS NULL');
  const alarmsByKeyStmt = conn.prepare('SELECT * FROM alarms WHERE room_id = :room_id AND alarm_key = :alarm_key');
  const listOpenAlarmsStmt = conn.prepare('SELECT * FROM alarms WHERE room_id = :room_id AND cleared_at IS NULL ORDER BY raised_at DESC, id DESC');
  const listClearedAlarmsStmt = conn.prepare(
    'SELECT * FROM alarms WHERE room_id = :room_id AND cleared_at IS NOT NULL ORDER BY cleared_at DESC, id DESC LIMIT :recent'
  );

  function raiseAlarm(roomId, alarm) {
    live();
    roomCheck(roomId);
    fields('raiseAlarm', alarm, ['alarm_key', 'level', 'label', 'at']);
    const a = alarm || {};
    const open = findOpenAlarmStmt.get({ room_id: roomId, alarm_key: val(a.alarm_key) });
    if (open) return plain(open);
    const at = a.at === undefined ? now() : a.at;
    const info = insertAlarmStmt.run({
      room_id: roomId, alarm_key: val(a.alarm_key), level: val(a.level), label: val(a.label), raised_at: val(at),
    });
    return plain(getAlarmByIdStmt.get({ id: info.lastInsertRowid }));
  }

  function clearAlarm(roomId, alarmKey, at) {
    live();
    roomCheck(roomId);
    const key = val(alarmKey);
    const open = findOpenAlarmStmt.get({ room_id: roomId, alarm_key: key });
    if (!open) return null;
    const atVal = val(at === undefined ? now() : at);
    clearAlarmStmt.run({ room_id: roomId, alarm_key: key, at: atVal });
    return plain(getAlarmByIdStmt.get({ id: open.id }));
  }

  function ackAlarm(roomId, alarmKey, at) {
    live();
    roomCheck(roomId);
    const key = val(alarmKey);
    const atVal = val(at === undefined ? now() : at);
    const rows = alarmsByKeyStmt.all({ room_id: roomId, alarm_key: key });
    if (rows.length === 0) throw new NotFoundError('alarm', alarmKey);
    ackAlarmStmt.run({ room_id: roomId, alarm_key: key, at: atVal });
    const newestId = rows.reduce((a, b) => (b.id > a.id ? b : a)).id;
    return plain(getAlarmByIdStmt.get({ id: newestId }));
  }

  function listAlarms(roomId, options) {
    live();
    roomCheck(roomId);
    fields('listAlarms', options, ['recent']);
    const o = options || {};
    const recent = o.recent === undefined ? 20 : o.recent;
    if (!Number.isInteger(recent) || recent < 0 || recent > 500) throw new RangeError('listAlarms: recent must be an integer from 0 to 500');
    const open = listOpenAlarmsStmt.all({ room_id: roomId }).map(plain);
    const cleared = listClearedAlarmsStmt.all({ room_id: roomId, recent }).map(plain);
    return open.concat(cleared);
  }

  // Controller state (section 6.9)
  const saveControllerStmt = conn.prepare(
    'INSERT INTO controller_state (room_id, saved_at, controller, sim) VALUES (:room_id, :saved_at, :controller, :sim) ' +
    'ON CONFLICT (room_id) DO UPDATE SET saved_at = :saved_at, controller = :controller, sim = :sim'
  );
  const loadControllerStmt = conn.prepare('SELECT * FROM controller_state WHERE room_id = :room_id');

  function saveControllerState(roomId, state) {
    live();
    roomCheck(roomId);
    fields('saveControllerState', state, ['controller', 'sim', 'at']);
    const s = state || {};
    const controllerText = jsonVal(s.controller);
    const simText = s.sim == null ? null : toJson(s.sim);
    const at = val(s.at === undefined ? now() : s.at);
    saveControllerStmt.run({ room_id: roomId, saved_at: at, controller: controllerText, sim: simText });
    return undefined;
  }

  function loadControllerState(roomId) {
    live();
    roomCheck(roomId);
    const row = loadControllerStmt.get({ room_id: roomId });
    if (!row) return null;
    return {
      room_id: row.room_id, saved_at: row.saved_at,
      controller: fromJson(row.controller),
      sim: row.sim === null ? null : fromJson(row.sim),
    };
  }

  // Calibrations (section 6.10)
  const insertCalibStmt = conn.prepare(
    'INSERT INTO calibrations (room_id, run_at, ua, inf_ach, moist_buffer, co2_per_block, rmse_t, rmse_rh, rmse_co2, log_rows, ' +
    'source, log_from, log_to, equipment) ' +
    'VALUES (:room_id, :run_at, :ua, :inf_ach, :moist_buffer, :co2_per_block, :rmse_t, :rmse_rh, :rmse_co2, :log_rows, ' +
    ':source, :log_from, :log_to, :equipment)'
  );
  const getCalibByIdStmt = conn.prepare('SELECT * FROM calibrations WHERE id = :id');
  const listCalibStmt = conn.prepare('SELECT * FROM calibrations WHERE room_id = :room_id ORDER BY run_at DESC, id DESC');
  const findCalibStmt = conn.prepare('SELECT * FROM calibrations WHERE id = :id AND room_id = :room_id');
  const applyCalibStmt = conn.prepare('UPDATE calibrations SET applied_at = :at WHERE id = :id');
  const currentCalibStmt = conn.prepare(
    'SELECT * FROM calibrations WHERE room_id = :room_id AND applied_at IS NOT NULL ORDER BY applied_at DESC, id DESC LIMIT 1'
  );

  function calibToPublic(row) {
    return row ? { ...row, equipment: row.equipment === null ? null : fromJson(row.equipment) } : null;
  }

  function saveCalibration(roomId, run) {
    live();
    roomCheck(roomId);
    fields('saveCalibration', run, ['ua', 'inf_ach', 'moist_buffer', 'co2_per_block', 'rmse_t', 'rmse_rh', 'rmse_co2', 'log_rows', 'run_at', 'source', 'log_from', 'log_to', 'equipment']);
    const r = run || {};
    const run_at = r.run_at === undefined ? now() : r.run_at;
    const info = insertCalibStmt.run({
      room_id: roomId, run_at: val(run_at),
      ua: val(r.ua), inf_ach: val(r.inf_ach), moist_buffer: val(r.moist_buffer), co2_per_block: val(r.co2_per_block),
      rmse_t: val(r.rmse_t === undefined ? null : r.rmse_t),
      rmse_rh: val(r.rmse_rh === undefined ? null : r.rmse_rh),
      rmse_co2: val(r.rmse_co2 === undefined ? null : r.rmse_co2),
      log_rows: val(r.log_rows === undefined ? null : r.log_rows),
      source: val(r.source), log_from: val(r.log_from), log_to: val(r.log_to),
      equipment: r.equipment == null ? null : toJson(r.equipment),
    });
    return calibToPublic(getCalibByIdStmt.get({ id: info.lastInsertRowid }));
  }

  function listCalibrations(roomId) {
    live();
    roomCheck(roomId);
    return listCalibStmt.all({ room_id: roomId }).map(calibToPublic);
  }

  function applyCalibration(roomId, runId, at) {
    live();
    roomCheck(roomId);
    const atVal = val(at === undefined ? now() : at);
    if (!Number.isInteger(runId)) throw new NotFoundError('calibration', runId);
    const row = findCalibStmt.get({ id: runId, room_id: roomId });
    if (!row) throw new NotFoundError('calibration', runId);
    applyCalibStmt.run({ id: runId, at: atVal });
    return calibToPublic(findCalibStmt.get({ id: runId, room_id: roomId }));
  }

  function currentCalibration(roomId) {
    live();
    roomCheck(roomId);
    const row = currentCalibStmt.get({ room_id: roomId });
    return calibToPublic(row);
  }

  // Crop mix (section 6.11)
  const getMixStmt = conn.prepare('SELECT crop, blocks, co2_per_block FROM crop_mixes WHERE room_id = :room_id ORDER BY pos');
  const deleteMixStmt = conn.prepare('DELETE FROM crop_mixes WHERE room_id = :room_id');
  const insertMixRowStmt = conn.prepare(
    'INSERT INTO crop_mixes (room_id, pos, crop, blocks, co2_per_block) VALUES (:room_id, :pos, :crop, :blocks, :co2_per_block)'
  );

  function getMix(roomId) {
    live();
    roomCheck(roomId);
    return getMixStmt.all({ room_id: roomId }).map(plain);
  }

  function replaceMix(roomId, rows) {
    live();
    roomCheck(roomId);
    const list = rows || [];
    for (const row of list) fields('replaceMix', row, ['crop', 'blocks', 'co2_per_block']);
    return tx(() => {
      deleteMixStmt.run({ room_id: roomId });
      list.forEach((row, pos) => {
        insertMixRowStmt.run({ room_id: roomId, pos, crop: val(row.crop), blocks: val(row.blocks), co2_per_block: val(row.co2_per_block) });
      });
      return getMixStmt.all({ room_id: roomId }).map(plain);
    });
  }

  // Capacity reports (section 6.12)
  const insertCapacityStmt = conn.prepare(
    'INSERT INTO capacity_reports (room_id, run_at, verdict, utilisation, report) VALUES (:room_id, :run_at, :verdict, :utilisation, :report)'
  );
  const getCapacityByIdStmt = conn.prepare('SELECT * FROM capacity_reports WHERE id = :id');
  const latestCapacityStmt = conn.prepare('SELECT * FROM capacity_reports WHERE room_id = :room_id ORDER BY id DESC LIMIT 1');

  function capacityRowToPublic(row) {
    return row ? { id: row.id, room_id: row.room_id, run_at: row.run_at, verdict: row.verdict, utilisation: row.utilisation, report: fromJson(row.report) } : null;
  }

  function saveCapacityReport(roomId, entry) {
    live();
    roomCheck(roomId);
    fields('saveCapacityReport', entry, ['report', 'run_at']);
    const e = entry || {};
    const reportText = jsonVal(e.report);
    const verdict = e.report ? e.report.verdict : undefined;
    const rawUtilisation = e.report ? e.report.utilisation : undefined;
    const utilisation = Number.isFinite(rawUtilisation) ? rawUtilisation : null;
    const run_at = e.run_at === undefined ? now() : e.run_at;
    const info = insertCapacityStmt.run({
      room_id: roomId, run_at: val(run_at), verdict: val(verdict), utilisation: val(utilisation), report: reportText,
    });
    return capacityRowToPublic(getCapacityByIdStmt.get({ id: info.lastInsertRowid }));
  }

  function latestCapacityReport(roomId) {
    live();
    roomCheck(roomId);
    return capacityRowToPublic(latestCapacityStmt.get({ room_id: roomId }));
  }

  // Simulation runs (section 6.13)
  const insertSimStmt = conn.prepare(
    'INSERT INTO simulation_runs (room_id, created_at, kind, verdict, blocks, days, kwh, rm, utilisation, real_start, note, inputs, result) ' +
    'VALUES (:room_id, :created_at, :kind, :verdict, :blocks, :days, :kwh, :rm, :utilisation, :real_start, :note, :inputs, :result)'
  );
  const SIM_INFO_COLS = 'id, room_id, created_at, kind, verdict, blocks, days, kwh, rm, utilisation, real_start, note, inputs';
  const getSimStmt = conn.prepare(`SELECT ${SIM_INFO_COLS}, result FROM simulation_runs WHERE id = :id AND room_id = :room_id`);
  const getSimInfoStmt = conn.prepare(`SELECT ${SIM_INFO_COLS} FROM simulation_runs WHERE id = :id AND room_id = :room_id`);
  const listSimStmt = conn.prepare(
    `SELECT ${SIM_INFO_COLS} FROM simulation_runs WHERE room_id = :room_id ORDER BY id DESC LIMIT :limit`
  );
  const listSimBeforeStmt = conn.prepare(
    `SELECT ${SIM_INFO_COLS} FROM simulation_runs WHERE room_id = :room_id AND id < :before ORDER BY id DESC LIMIT :limit`
  );
  const updateSimNoteStmt = conn.prepare('UPDATE simulation_runs SET note = :v WHERE id = :id');
  const updateSimStartStmt = conn.prepare('UPDATE simulation_runs SET real_start = :v WHERE id = :id');
  const deleteSimStmt = conn.prepare('DELETE FROM simulation_runs WHERE id = :id');

  function isObject(v) {
    return v !== null && typeof v === 'object';
  }

  function finiteOrNull(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  function simToPublic(row) {
    if (!row) return null;
    const out = { ...row, inputs: fromJson(row.inputs) };
    if ('result' in row) out.result = fromJson(row.result);
    return out;
  }

  function findSim(roomId, runId, stmt) {
    const row = Number.isInteger(runId) ? stmt.get({ id: runId, room_id: roomId }) : undefined;
    if (!row) throw new NotFoundError('simulation', runId);
    return row;
  }

  function saveSimulationRun(roomId, run) {
    live();
    roomCheck(roomId);
    fields('saveSimulationRun', run, ['kind', 'inputs', 'result', 'note', 'real_start', 'at']);
    const r = run || {};
    const result = isObject(r.result) ? r.result : {};
    const totals = isObject(result.totals) ? result.totals : null;
    let verdict;
    if (r.kind === 'cycle') {
      verdict = result.verdict === 'impossible' ? 'impossible' : (totals && totals.pass === true ? 'pass' : 'fail');
    } else if (r.kind === 'equipment') {
      verdict = result.verdict === 'impossible' ? 'impossible' : (isObject(result.ac) ? result.ac.verdict : undefined);
    } else {
      verdict = result.verdict;
    }
    let blocks = 0;
    const mix = isObject(r.inputs) ? r.inputs.mix : undefined;
    if (Array.isArray(mix)) for (const m of mix) if (isObject(m) && Number.isFinite(m.blocks)) blocks += m.blocks;
    const cycle = r.kind === 'cycle' && totals;
    const info = insertSimStmt.run({
      room_id: roomId, created_at: val(r.at === undefined ? now() : r.at), kind: val(r.kind), verdict: val(verdict), blocks,
      days: cycle ? finiteOrNull(totals.days) : null,
      kwh: cycle ? finiteOrNull(totals.kwh) : null,
      rm: cycle ? finiteOrNull(totals.rm) : null,
      utilisation: r.kind === 'capacity' ? finiteOrNull(result.utilisation) : null,
      real_start: val(r.real_start), note: val(r.note), inputs: jsonVal(r.inputs), result: jsonVal(r.result),
    });
    return simToPublic(getSimStmt.get({ id: info.lastInsertRowid, room_id: roomId }));
  }

  function listSimulationRuns(roomId, options) {
    live();
    roomCheck(roomId);
    fields('listSimulationRuns', options, ['limit', 'before']);
    const o = options || {};
    const limit = o.limit === undefined ? 50 : o.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new RangeError('listSimulationRuns: limit must be an integer from 1 to 200');
    const before = o.before === undefined ? null : o.before;
    if (before !== null && !Number.isInteger(before)) throw new RangeError('listSimulationRuns: before must be an integer or null');
    const rows = before === null
      ? listSimStmt.all({ room_id: roomId, limit })
      : listSimBeforeStmt.all({ room_id: roomId, before, limit });
    return rows.map(simToPublic);
  }

  function getSimulationRun(roomId, runId) {
    live();
    roomCheck(roomId);
    return simToPublic(findSim(roomId, runId, getSimStmt));
  }

  function updateSimulationRun(roomId, runId, changes) {
    live();
    roomCheck(roomId);
    fields('updateSimulationRun', changes, ['note', 'real_start']);
    findSim(roomId, runId, getSimInfoStmt); // lead decision 75: the run before the column rules
    const c = changes || {};
    return tx(() => {
      if ('note' in c) updateSimNoteStmt.run({ v: val(c.note), id: runId });
      if ('real_start' in c) updateSimStartStmt.run({ v: val(c.real_start), id: runId });
      return simToPublic(getSimInfoStmt.get({ id: runId, room_id: roomId }));
    });
  }

  function deleteSimulationRun(roomId, runId) {
    live();
    roomCheck(roomId);
    const row = simToPublic(findSim(roomId, runId, getSimInfoStmt));
    deleteSimStmt.run({ id: runId });
    return row;
  }

  function listRooms(options) {
    live();
    fields('listRooms', options, ['includeArchived']);
    const includeArchived = (options || {}).includeArchived === true;
    const stmt = includeArchived ? listRoomsAllStmt : listRoomsActiveStmt;
    return stmt.all().map(plain);
  }

  function close() {
    if (closed) return undefined;
    closed = true;
    conn.close();
    return undefined;
  }

  const db = {
    path: dbPath,
    version,
    close,
    getRoom,
    listRooms,
    createRoom,
    updateRoom,
    archiveRoom,
    saveSettings,
    currentSettings,
    settingsHistory,
    getSettingsVersion,
    insertReading,
    queryReadings,
    latestReading,
    addEvent,
    listEvents,
    raiseAlarm,
    clearAlarm,
    ackAlarm,
    listAlarms,
    saveControllerState,
    loadControllerState,
    saveCalibration,
    listCalibrations,
    applyCalibration,
    currentCalibration,
    getMix,
    replaceMix,
    saveCapacityReport,
    latestCapacityReport,
    saveSimulationRun,
    listSimulationRuns,
    getSimulationRun,
    updateSimulationRun,
    deleteSimulationRun,
  };
  // The connection for server/harvest-db.js (C1 6.3, lead decision 61): read only, closed only by close().
  Object.defineProperty(db, 'sqlite', { value: conn, enumerable: true, writable: false, configurable: false });
  return db;
}

module.exports = { openDb, NotFoundError, UPGRADES };
