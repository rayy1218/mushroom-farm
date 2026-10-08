// The farm app's SQLite layer (docs/contracts/db.md, C1). CommonJS, synchronous.
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { NotFoundError, toJson, fromJson } = require('./db-common.js');

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

const UPGRADES = [{ version: 1, sql: SCHEMA_V1 }];

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
function openDb(dbPath, options) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true }); // step 1
  }
  const conn = new DatabaseSync(dbPath); // step 2
  try {
    return finishOpen(conn, dbPath, options);
  } catch (err) {
    conn.close();
    throw err;
  }
}

function finishOpen(conn, dbPath, options) {
  const opts = options === undefined ? {} : options;
  for (const k of Object.keys(opts)) {
    if (k !== 'now' && k !== 'upgrades') throw new TypeError(`openDb: unknown field "${k}"`);
  }
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
    'INSERT INTO rooms (name, volume, vent, adapter, created_at) VALUES (:name, :volume, :vent, :adapter, :created_at)'
  );
  const updateNameStmt = conn.prepare('UPDATE rooms SET name = :v WHERE id = :id');
  const updateVolumeStmt = conn.prepare('UPDATE rooms SET volume = :v WHERE id = :id');
  const updateVentStmt = conn.prepare('UPDATE rooms SET vent = :v WHERE id = :id');
  const archiveRoomStmt = conn.prepare('UPDATE rooms SET archived_at = :at WHERE id = :id AND archived_at IS NULL');

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
    fields('createRoom', room, ['name', 'volume', 'vent', 'adapter', 'settings', 'note', 'at']);
    const r = room || {};
    const adapter = r.adapter === undefined ? 'sim' : r.adapter;
    const note = r.note === undefined ? 'Created' : r.note;
    const at = r.at === undefined ? now() : r.at;
    return tx(() => {
      const info = insertRoomStmt.run({
        name: val(r.name), volume: val(r.volume), vent: val(r.vent), adapter: val(adapter), created_at: val(at),
      });
      const id = info.lastInsertRowid;
      insertSettingsStmt.run({ room_id: id, saved_at: val(at), settings: jsonVal(r.settings), note: val(note) });
      return plain(getRoomStmt.get({ id }));
    });
  }

  function updateRoom(id, changes) {
    live();
    roomCheck(id);
    fields('updateRoom', changes, ['name', 'volume', 'vent']);
    const c = changes || {};
    if ('name' in c) updateNameStmt.run({ v: val(c.name), id });
    if ('volume' in c) updateVolumeStmt.run({ v: val(c.volume), id });
    if ('vent' in c) updateVentStmt.run({ v: val(c.vent), id });
    return plain(getRoomStmt.get({ id }));
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
    return settingsVersionToPublic(conn.prepare('SELECT * FROM room_settings WHERE id = :id').get({ id: info.lastInsertRowid }));
  }

  function settingsHistory(roomId) {
    live();
    roomCheck(roomId);
    return conn.prepare('SELECT id, saved_at, note FROM room_settings WHERE room_id = :room_id ORDER BY id DESC')
      .all({ room_id: roomId })
      .map(plain);
  }

  function getSettingsVersion(roomId, versionId) {
    live();
    roomCheck(roomId);
    if (!Number.isInteger(versionId)) throw new NotFoundError('settings', versionId);
    const row = conn.prepare('SELECT * FROM room_settings WHERE id = :id AND room_id = :room_id').get({ id: versionId, room_id: roomId });
    if (!row) throw new NotFoundError('settings', versionId);
    return settingsVersionToPublic(row);
  }

  // Readings (section 6.6)
  const READING_KEYS = ['room_id', 't', 'T', 'RH', 'CO2', 't_out', 'rh_out', 'ac_mode', 'ac_setpoint', 'fog', 'fan', 'lights', 'circ', 'power_w', 'kwh'];
  const insertReadingStmt = conn.prepare(
    'INSERT INTO readings (room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, fan, lights, circ, power_w, kwh) ' +
    'VALUES (:room_id, :t, :temp, :RH, :CO2, :t_out, :rh_out, :ac_mode, :ac_setpoint, :fog, :fan, :lights, :circ, :power_w, :kwh)'
  );
  const RAW_READINGS_COLS = 'room_id, t, temp AS T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, fan, lights, circ, power_w, kwh';
  const rawReadingsStmt = conn.prepare(
    `SELECT ${RAW_READINGS_COLS} FROM readings WHERE room_id = ? AND t >= ? AND t <= ? ORDER BY readings.t, readings.rowid`
  );
  const latestReadingStmt = conn.prepare(
    `SELECT ${RAW_READINGS_COLS} FROM readings WHERE room_id = ? ORDER BY readings.t DESC, readings.rowid DESC LIMIT 1`
  );
  const bucketReadingsStmt = conn.prepare(`
    SELECT room_id, b AS t, T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, fan, lights, circ, power_w, kwh
    FROM (
      SELECT room_id,
             (t / CAST(:step AS INTEGER)) * CAST(:step AS INTEGER) AS b,
             AVG(temp) AS T, AVG(RH) AS RH, AVG(CO2) AS CO2, AVG(t_out) AS t_out, AVG(rh_out) AS rh_out,
             AVG(ac_setpoint) AS ac_setpoint, AVG(fog) AS fog, AVG(fan) AS fan,
             AVG(lights) AS lights, AVG(circ) AS circ, AVG(power_w) AS power_w,
             MAX(t) AS t_last, ac_mode, kwh
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
      fog: val(r.fog), fan: val(r.fan), lights: val(r.lights), circ: val(r.circ), power_w: val(r.power_w), kwh: val(r.kwh),
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

  function listRooms(options) {
    live();
    fields('listRooms', options, ['includeArchived']);
    const includeArchived = (options || {}).includeArchived === true;
    const sql = includeArchived
      ? 'SELECT * FROM rooms ORDER BY id'
      : 'SELECT * FROM rooms WHERE archived_at IS NULL ORDER BY id';
    return conn.prepare(sql).all().map(plain);
  }

  function close() {
    if (closed) return undefined;
    closed = true;
    conn.close();
    return undefined;
  }

  return {
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
  };
}

module.exports = { openDb, NotFoundError, UPGRADES };
