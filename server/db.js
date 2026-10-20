// The farm database: schema and room queries.

import { DatabaseSync } from 'node:sqlite';
import { RELAY_KEYS } from './machine-codes.js';

const VERSION = 7;

// Iteration 1 (version 0) had only the rooms table without the address columns.
const ROOMS = `
CREATE TABLE rooms (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  length_m   REAL    NOT NULL CHECK (length_m BETWEEN 0.5 AND 100),
  width_m    REAL    NOT NULL CHECK (width_m BETWEEN 0.5 AND 100),
  height_m   REAL    NOT NULL CHECK (height_m BETWEEN 0.5 AND 10),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  trh_address INTEGER CHECK (trh_address BETWEEN 1 AND 247),
  co2_address INTEGER CHECK (co2_address BETWEEN 1 AND 247)
) STRICT;`;

const READINGS = `
CREATE TABLE readings (
  id      INTEGER PRIMARY KEY,
  room_id INTEGER NOT NULL,
  kind    TEXT    NOT NULL CHECK (kind IN ('trh', 'co2')),
  address INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  ok      INTEGER NOT NULL CHECK (ok IN (0, 1)),
  t       REAL,
  rh      REAL,
  co2     REAL,
  error   TEXT
) STRICT;
CREATE INDEX readings_by_sensor ON readings (room_id, kind, address, id);
CREATE INDEX readings_ok ON readings (room_id, kind, address, id) WHERE ok = 1;`;

// What the farm app last told each room's relay module and aircon gateway.
const MACHINE_COMMANDS = `
CREATE TABLE machine_commands (
  room_id      INTEGER PRIMARY KEY,
  intake       INTEGER NOT NULL DEFAULT 0,
  exhaust      INTEGER NOT NULL DEFAULT 0,
  circulation  INTEGER NOT NULL DEFAULT 0,
  humidifier   INTEGER NOT NULL DEFAULT 0,
  ac_power     INTEGER NOT NULL DEFAULT 0,
  ac_mode      TEXT    NOT NULL DEFAULT 'cool',
  ac_setpoint  REAL    NOT NULL DEFAULT 25,
  ac_fan       TEXT    NOT NULL DEFAULT 'auto',
  relay_sent_at INTEGER,
  ac_sent_at   INTEGER
) STRICT;`;

// Automatic control (spec 2026-10-19-controller-design.md): the settings of each room and the
// remembered band states of the controller.
const ROOM_CONTROLS = `
CREATE TABLE room_controls (
  room_id  INTEGER PRIMARY KEY,
  auto     INTEGER NOT NULL DEFAULT 0 CHECK (auto IN (0, 1)),
  co2_low  REAL    NOT NULL DEFAULT 600,
  co2_high REAL    NOT NULL DEFAULT 750,
  t_low    REAL    NOT NULL DEFAULT 21,
  t_high   REAL    NOT NULL DEFAULT 23,
  rh_low   REAL    NOT NULL DEFAULT 85,
  rh_high  REAL    NOT NULL DEFAULT 95,
  exchange INTEGER NOT NULL DEFAULT 0 CHECK (exchange IN (0, 1)),
  exchange_since INTEGER,
  humidifier INTEGER NOT NULL DEFAULT 0 CHECK (humidifier IN (0, 1)),
  humidifier_during_exchange INTEGER NOT NULL DEFAULT 1 CHECK (humidifier_during_exchange IN (0, 1)),
  ac_fan TEXT NOT NULL DEFAULT 'auto' CHECK (ac_fan IN ('auto','low','high')),
  co2_safety REAL NOT NULL DEFAULT 1250,
  exchange_max_min INTEGER NOT NULL DEFAULT 10,
  exchange_ended_at INTEGER,
  capped_in_row INTEGER NOT NULL DEFAULT 0,
  humidifier_since INTEGER
) STRICT;`;

// Safety and history (spec 2026-10-19-safety-and-history-design.md 3.2 and 4): the room_controls columns
// that version 7 adds to an older table, the alarms, the machine log and the readings time index.
const SAFETY_CONTROL_COLUMNS = `
-- an existing room's safety level is its CO2 upper limit + 500 (v1's rule), from 1250 to 10000
ALTER TABLE room_controls ADD COLUMN co2_safety REAL NOT NULL DEFAULT 1250;
ALTER TABLE room_controls ADD COLUMN exchange_max_min INTEGER NOT NULL DEFAULT 10;
ALTER TABLE room_controls ADD COLUMN exchange_ended_at INTEGER;
ALTER TABLE room_controls ADD COLUMN capped_in_row INTEGER NOT NULL DEFAULT 0;
ALTER TABLE room_controls ADD COLUMN humidifier_since INTEGER;
UPDATE room_controls SET co2_safety = MIN(10000, MAX(1250, co2_high + 500));`;

const ALARMS = `
CREATE TABLE alarms (
  id         INTEGER PRIMARY KEY,
  room_id    INTEGER NOT NULL,
  key        TEXT    NOT NULL,
  level      TEXT    NOT NULL CHECK (level IN ('warning', 'serious', 'critical')),
  text       TEXT    NOT NULL,
  raised_at  INTEGER NOT NULL,
  cleared_at INTEGER,
  acked_at   INTEGER
) STRICT;
CREATE INDEX alarms_by_room ON alarms (room_id, id);
CREATE UNIQUE INDEX alarms_active ON alarms (room_id, key) WHERE cleared_at IS NULL;`;

const MACHINE_LOG = `
CREATE TABLE machine_log (
  id       INTEGER PRIMARY KEY,
  room_id  INTEGER NOT NULL,
  machine  TEXT    NOT NULL CHECK (machine IN ('intake', 'exhaust', 'circulation', 'humidifier', 'ac')),
  at       INTEGER NOT NULL,
  on_      INTEGER NOT NULL CHECK (on_ IN (0, 1)),
  setpoint REAL,
  mode     TEXT,
  fan      TEXT,
  source   TEXT    NOT NULL CHECK (source IN ('manual', 'auto'))
) STRICT;
CREATE INDEX machine_log_by_room ON machine_log (room_id, machine, at);`;

// Farm-wide settings (spec 2026-10-19-settings-design.md): no rows means the defaults.
const SETTINGS = `
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;`;

// The status queries, exported so a test can check their query plans.
export const STATUS_SQL = {
  latest: `SELECT * FROM (SELECT * FROM readings WHERE room_id = ? AND kind = ? AND address = ?
                          ORDER BY id DESC LIMIT ?) ORDER BY id`,
  lastOk: `SELECT * FROM readings WHERE room_id = ? AND kind = ? AND address = ? AND ok = 1
           ORDER BY id DESC LIMIT 1`,
  // Counting stops at 10000: the status only needs to know "3 or more".
  failuresSince: `SELECT COUNT(*) AS n FROM (SELECT 1 FROM readings WHERE room_id = ? AND kind = ? AND address = ? AND id > ?
                                            LIMIT 10000)`,
};

// Stream B: the history queries (spec 2026-10-19-safety-and-history-design.md 5). One query averages one bucket
// (parameters: room id, from, to; from inclusive, to exclusive). It reads only the covering readings_by_time index and
// has no GROUP BY, so no temp b-tree. Good readings inside the plausible ranges of spec section 1 only.
export const HISTORY_SQL = {
  bucket(kind) {
    return kind === 'trh'
      ? `SELECT AVG(t) AS t, AVG(rh) AS rh, COUNT(*) AS n FROM readings
         WHERE room_id = ? AND kind = 'trh' AND at >= ? AND at < ? AND ok = 1 AND t BETWEEN -10 AND 60 AND rh BETWEEN 1 AND 100`
      : `SELECT AVG(co2) AS co2, COUNT(*) AS n FROM readings
         WHERE room_id = ? AND kind = 'co2' AND at >= ? AND at < ? AND ok = 1 AND co2 BETWEEN 300 AND 10000`;
  },
};

// The machine log queries a test checks the plans of.
export const MACHINE_LOG_SQL = {
  last: 'SELECT * FROM machine_log WHERE room_id = ? AND machine = ? ORDER BY at DESC, id DESC LIMIT 1',
};

// Completed buckets kept per room, sensor kind and bucket size; at most this many buckets back from the newest.
const CACHE_BUCKETS = 400;

// range hours → bucket seconds
export const HISTORY_BUCKET_S = { 1: 15, 6: 60, 24: 300, 168: 1800, 720: 7200 };
const SPARK_BUCKET_MS = 30 * 60_000;
const MACHINE_KEYS = ['intake', 'exhaust', 'circulation', 'humidifier', 'ac'];
const LEVEL_RANK = { critical: 3, serious: 2, warning: 1 };

const alarmRow = (r) => ({
  id: r.id, roomId: r.room_id, roomName: r.room_name, key: r.key, level: r.level, text: r.text,
  raisedAt: r.raised_at, clearedAt: r.cleared_at, ackedAt: r.acked_at,
});

// Brings a new or older database up to VERSION in one transaction.
function migrate(db) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  if (version >= VERSION) return;
  db.exec('BEGIN');
  try {
    if (version < 1) {
      const hasRooms = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'rooms'").get();
      if (hasRooms) {
        db.exec(`ALTER TABLE rooms ADD COLUMN trh_address INTEGER CHECK (trh_address BETWEEN 1 AND 247);
                 ALTER TABLE rooms ADD COLUMN co2_address INTEGER CHECK (co2_address BETWEEN 1 AND 247);`);
      } else {
        db.exec(ROOMS);
      }
      db.exec(READINGS);
    }
    if (version < 2) {
      db.exec(`ALTER TABLE rooms ADD COLUMN relay_address INTEGER CHECK (relay_address BETWEEN 1 AND 247);
               ALTER TABLE rooms ADD COLUMN ac_address INTEGER CHECK (ac_address BETWEEN 1 AND 247);`);
      db.exec(MACHINE_COMMANDS);
      db.exec('INSERT INTO machine_commands (room_id) SELECT id FROM rooms');
    }
    if (version < 3) {
      db.exec(ROOM_CONTROLS);
      db.exec(`INSERT INTO room_controls (room_id, exchange, humidifier)
               SELECT r.id, COALESCE(c.intake, 0), COALESCE(c.humidifier, 0)
               FROM rooms r LEFT JOIN machine_commands c ON c.room_id = r.id`);
    }
    if (version === 3) { // a new database or an older one already has the column from ROOM_CONTROLS
      db.exec('ALTER TABLE room_controls ADD COLUMN humidifier_during_exchange INTEGER NOT NULL DEFAULT 1 CHECK (humidifier_during_exchange IN (0, 1))');
    }
    if (version < 5) db.exec(SETTINGS);
    if (version >= 3 && version < 6) { // older tables lack the column; a table made above by ROOM_CONTROLS has it
      db.exec("ALTER TABLE room_controls ADD COLUMN ac_fan TEXT NOT NULL DEFAULT 'auto' CHECK (ac_fan IN ('auto','low','high'))");
    }
    if (version < 7) {
      if (version >= 3) db.exec(SAFETY_CONTROL_COLUMNS); // a table made above by ROOM_CONTROLS has them
      db.exec(ALARMS);
      db.exec(MACHINE_LOG);
      // Covering: the history buckets read only the index, not the table.
      db.exec('CREATE INDEX readings_by_time ON readings (room_id, kind, at, ok, t, rh, co2);');
    }
    db.exec(`PRAGMA user_version = ${VERSION}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// A machine_log row as the API shows it.
const logRow = (r) => ({ at: r.at, on: r.on_ === 1, setpoint: r.setpoint, mode: r.mode, fan: r.fan, source: r.source });

// Thrown by createRoom and updateRoom when another room already has the name
// (ignoring case).
export class NameTakenError extends Error {
  constructor(name) {
    super(`A room called "${name}" already exists`);
    this.name = 'NameTakenError';
    this.roomName = name;
  }
}

// Thrown by createRoom and updateRoom when another room already uses an
// address (any of the four: trh, co2, relay, ac). field says which address clashes.
export class AddressTakenError extends Error {
  constructor(address, roomName, field) {
    super(`Address ${address} is already used by ${roomName}`);
    this.name = 'AddressTakenError';
    this.address = address;
    this.roomName = roomName;
    this.field = field;
  }
}

const KINDS = ['trh', 'co2'];
const FAILS_FOR_OFFLINE = 3;

function toRoom(row) {
  return {
    id: row.id,
    name: row.name,
    length: row.length_m,
    width: row.width_m,
    height: row.height_m,
    volume: Math.round(row.length_m * row.width_m * row.height_m * 100) / 100,
    trhAddress: row.trh_address,
    co2Address: row.co2_address,
    relayAddress: row.relay_address,
    acAddress: row.ac_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAlarm(row) {
  return {
    id: row.id, roomId: row.room_id, roomName: row.room_name, key: row.key, level: row.level, text: row.text,
    raisedAt: row.raised_at, clearedAt: row.cleared_at, ackedAt: row.acked_at,
  };
}

// path is a file path or ':memory:'. Fields passed in must already be valid
// (see validateRoom in rooms.js).
export function openDb(path) {
  const db = new DatabaseSync(path);
  migrate(db);

  const q = {
    list: db.prepare('SELECT * FROM rooms ORDER BY name, id'),
    get: db.prepare('SELECT * FROM rooms WHERE id = ?'),
    nameUsed: db.prepare('SELECT 1 FROM rooms WHERE name = ? AND id IS NOT ?'),
    addressUsed: db.prepare(`SELECT name FROM rooms WHERE id IS NOT ?1
                             AND (trh_address = ?2 OR co2_address = ?2 OR relay_address = ?2 OR ac_address = ?2)`),
    insert: db.prepare(`INSERT INTO rooms (name, length_m, width_m, height_m, trh_address, co2_address,
                                           relay_address, ac_address, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    update: db.prepare(`UPDATE rooms SET name = ?, length_m = ?, width_m = ?, height_m = ?,
                               trh_address = ?, co2_address = ?, relay_address = ?, ac_address = ?, updated_at = ?
                        WHERE id = ?`),
    delete: db.prepare('DELETE FROM rooms WHERE id = ?'),
    deleteReadings: db.prepare('DELETE FROM readings WHERE room_id = ?'),
    insertCommands: db.prepare('INSERT INTO machine_commands (room_id) VALUES (?)'),
    deleteCommands: db.prepare('DELETE FROM machine_commands WHERE room_id = ?'),
    commands: db.prepare('SELECT * FROM machine_commands WHERE room_id = ?'),
    insertControl: db.prepare('INSERT OR REPLACE INTO room_controls (room_id) VALUES (?)'),
    deleteControl: db.prepare('DELETE FROM room_controls WHERE room_id = ?'),
    deleteAlarms: db.prepare('DELETE FROM alarms WHERE room_id = ?'),
    deleteMachineLog: db.prepare('DELETE FROM machine_log WHERE room_id = ?'),
    control: db.prepare('SELECT * FROM room_controls WHERE room_id = ?'),
    setControl: db.prepare(`UPDATE room_controls SET auto = ?, co2_low = ?, co2_high = ?, t_low = ?, t_high = ?,
                                   rh_low = ?, rh_high = ?, humidifier_during_exchange = ?, ac_fan = ?,
                                   co2_safety = ?, exchange_max_min = ? WHERE room_id = ?`),
    setControlState: db.prepare(`UPDATE room_controls SET exchange = ?, humidifier = ?, exchange_since = ?,
                                        exchange_ended_at = ?, capped_in_row = ?, humidifier_since = ? WHERE room_id = ?`),
    setRelay: Object.fromEntries(RELAY_KEYS.map((key) => [key,
      db.prepare(`UPDATE machine_commands SET ${key} = ?, relay_sent_at = ? WHERE room_id = ?`)])),
    setAc: db.prepare(`UPDATE machine_commands SET ac_power = ?, ac_mode = ?, ac_setpoint = ?, ac_fan = ?, ac_sent_at = ?
                       WHERE room_id = ?`),
    wiredMachines: db.prepare(`SELECT id AS roomId, 'relay' AS kind, relay_address AS address FROM rooms WHERE relay_address IS NOT NULL
                               UNION ALL
                               SELECT id, 'ac', ac_address FROM rooms WHERE ac_address IS NOT NULL
                               ORDER BY 1, 2 DESC`),
    wired: db.prepare(`SELECT id AS roomId, 'trh' AS kind, trh_address AS address FROM rooms WHERE trh_address IS NOT NULL
                       UNION ALL
                       SELECT id, 'co2', co2_address FROM rooms WHERE co2_address IS NOT NULL
                       ORDER BY 1, 2 DESC`),
    // Only while the room still has that address for that kind.
    addReading: db.prepare(`INSERT INTO readings (room_id, kind, address, at, ok, t, rh, co2, error)
                            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
                            WHERE EXISTS (SELECT 1 FROM rooms WHERE id = ? AND
                              CASE ? WHEN 'trh' THEN trh_address WHEN 'co2' THEN co2_address END = ?)`),
    // Alarms (spec 2026-10-19-safety-and-history-design.md section 3): the queries of the alarm module and routes.
    insertAlarm: db.prepare('INSERT INTO alarms (room_id, key, level, text, raised_at) VALUES (?, ?, ?, ?, ?)'),
    clearAlarm: db.prepare('UPDATE alarms SET cleared_at = ? WHERE room_id = ? AND key = ? AND cleared_at IS NULL'),
    alarm: db.prepare(`SELECT a.*, r.name AS room_name FROM alarms a JOIN rooms r ON r.id = a.room_id WHERE a.id = ?`),
    activeAlarms: db.prepare(`SELECT a.*, r.name AS room_name FROM alarms a JOIN rooms r ON r.id = a.room_id
                              WHERE a.room_id = ? AND a.cleared_at IS NULL ORDER BY a.id`),
    // Current = active, or cleared and not acknowledged. Critical first, then newest.
    currentAlarms: db.prepare(`SELECT a.*, r.name AS room_name FROM alarms a JOIN rooms r ON r.id = a.room_id
                               WHERE (a.cleared_at IS NULL OR a.acked_at IS NULL) AND (?1 IS NULL OR a.room_id = ?1)
                               ORDER BY a.level = 'critical' DESC, a.raised_at DESC, a.id DESC`),
    alarmHistory: db.prepare(`SELECT a.*, r.name AS room_name FROM alarms a JOIN rooms r ON r.id = a.room_id
                              WHERE a.room_id = ? ORDER BY a.id DESC LIMIT 50`),
    ackAlarm: db.prepare('UPDATE alarms SET acked_at = COALESCE(acked_at, ?) WHERE id = ?'),
    ackRoomAlarms: db.prepare('UPDATE alarms SET acked_at = ? WHERE room_id = ? AND acked_at IS NULL'), // all of those are current
    // Stream B: machine log (spec 2026-10-19-safety-and-history-design.md 4).
    logLast: db.prepare(MACHINE_LOG_SQL.last),
    logAdd: db.prepare(`INSERT INTO machine_log (room_id, machine, at, on_, setpoint, mode, fan, source)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    logAll: db.prepare('SELECT * FROM machine_log WHERE room_id = ? AND machine = ? ORDER BY id'),
    logSince: db.prepare('SELECT * FROM machine_log WHERE room_id = ? AND machine = ? AND at >= ? AND at <= ? ORDER BY at, id'),
    logBefore: db.prepare('SELECT * FROM machine_log WHERE room_id = ? AND machine = ? AND at < ? ORDER BY at DESC, id DESC LIMIT 1'),
    overviewActive: db.prepare(`SELECT room_id, level FROM alarms WHERE cleared_at IS NULL`),
    overviewAlarms: db.prepare(`SELECT alarms.*, rooms.name AS room_name FROM alarms JOIN rooms ON rooms.id = alarms.room_id
                               WHERE cleared_at IS NULL OR acked_at IS NULL
                               ORDER BY (level = 'critical') DESC, raised_at DESC, alarms.id DESC LIMIT 10`),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
    latest: db.prepare(STATUS_SQL.latest),
    lastOk: db.prepare(STATUS_SQL.lastOk),
    failuresSince: db.prepare(STATUS_SQL.failuresSince),
  };

  function checkName(name, id) {
    if (q.nameUsed.get(name, id)) throw new NameTakenError(name);
  }

  // Each address may be used by one device of one room only.
  function checkAddresses(addresses, id) {
    for (const field of ['trhAddress', 'co2Address', 'relayAddress', 'acAddress']) {
      const address = addresses[field];
      if (address == null) continue;
      const other = q.addressUsed.get(id, address);
      if (other) throw new AddressTakenError(address, other.name, field);
    }
  }

  function sensorOf(room, kind, limit) {
    const address = room[`${kind}Address`];
    const sensor = { kind, address, status: 'not-wired', failuresInRow: 0, lastOk: null, readings: [] };
    if (address === null) return sensor;
    const rows = q.latest.all(room.id, kind, address, limit);
    sensor.readings = rows.map((r) => (kind === 'trh'
      ? { at: r.at, ok: r.ok === 1, t: r.t, rh: r.rh }
      : { at: r.at, ok: r.ok === 1, co2: r.co2 }));
    if (rows.length === 0) {
      sensor.status = 'no-data';
      return sensor;
    }
    const ok = q.lastOk.get(room.id, kind, address);
    if (ok) sensor.lastOk = kind === 'trh' ? { at: ok.at, t: ok.t, rh: ok.rh } : { at: ok.at, co2: ok.co2 };
    sensor.failuresInRow = q.failuresSince.get(room.id, kind, address, ok ? ok.id : 0).n;
    const n = sensor.failuresInRow;
    sensor.status = n === 0 ? 'online' : n < FAILS_FOR_OFFLINE ? 'timeout' : 'offline';
    return sensor;
  }

  function getRoom(id) {
    const row = q.get.get(id);
    return row ? toRoom(row) : null;
  }

  // Averages per bucket. Completed buckets (the bucket of `to` is still running) are cached per room, kind and bucket
  // size as { lo, hi, rows }: the buckets with index lo <= i < hi are complete and rows holds the non-empty ones.
  // A later request reads only the buckets after hi from the table. The queries ignore the sensor address, so
  // a changed address needs no invalidation; a room delete and a reading inside a cached bucket do.
  const bucketStatements = { trh: db.prepare(HISTORY_SQL.bucket('trh')), co2: db.prepare(HISTORY_SQL.bucket('co2')) };
  const bucketCache = new Map(); // roomId -> Map("kind/bucketMs" -> entry)

  function computeBuckets(roomId, kind, b, fromIdx, toIdx) {
    const stmt = bucketStatements[kind];
    const rows = [];
    for (let i = fromIdx; i < toIdx; i++) {
      const r = stmt.get(roomId, i * b, (i + 1) * b);
      if (r.n > 0) rows.push(kind === 'trh' ? { idx: i, t: r.t, rh: r.rh } : { idx: i, co2: r.co2 });
    }
    return rows;
  }

  // [{ at, ...values }] of one sensor kind in the window [from, to], bucketMs wide, buckets aligned to the epoch.
  // The window starts at the first bucket boundary at or after from; each `at` is the bucket middle kept inside [from, to].
  function buckets(roomId, kind, b, from, to) {
    const fi = Math.ceil(from / b);
    const ci = Math.floor(to / b); // the bucket holding `to` is not complete
    let rows = [];
    if (ci > fi) {
      let perRoom = bucketCache.get(roomId);
      if (!perRoom) bucketCache.set(roomId, (perRoom = new Map()));
      const key = `${kind}/${b}`;
      let e = perRoom.get(key);
      if (!e || ci < e.lo || fi > e.hi) perRoom.set(key, (e = { lo: fi, hi: fi, rows: [] }));
      if (fi < e.lo) {
        e.rows = computeBuckets(roomId, kind, b, fi, e.lo).concat(e.rows);
        e.lo = fi;
      }
      if (ci > e.hi) {
        e.rows.push(...computeBuckets(roomId, kind, b, e.hi, ci));
        e.hi = ci;
      }
      if (e.hi - e.lo > CACHE_BUCKETS) {
        e.lo = e.hi - CACHE_BUCKETS;
        e.rows = e.rows.filter((r) => r.idx >= e.lo);
      }
      rows = e.rows.filter((r) => r.idx >= fi && r.idx < ci);
    }
    if (ci >= fi) { // the running bucket: readings up to `to`
      const r = bucketStatements[kind].get(roomId, ci * b, to + 1);
      if (r.n > 0) rows = rows.concat(kind === 'trh' ? { idx: ci, t: r.t, rh: r.rh } : { idx: ci, co2: r.co2 });
    }
    return rows.map(({ idx, ...values }) => ({ at: Math.min(Math.max(idx * b + b / 2, from), to), ...values }));
  }

  return {
    listRooms() {
      return q.list.all().map(toRoom);
    },

    getRoom,

    createRoom({ name, length, width, height, trhAddress = null, co2Address = null, relayAddress = null, acAddress = null },
      now = Date.now()) {
      checkName(name, null);
      checkAddresses({ trhAddress, co2Address, relayAddress, acAddress }, null);
      db.exec('BEGIN');
      try {
        const { lastInsertRowid } = q.insert.run(name, length, width, height, trhAddress, co2Address,
          relayAddress, acAddress, now, now);
        q.insertCommands.run(lastInsertRowid);
        q.insertControl.run(lastInsertRowid);
        db.exec('COMMIT');
        return getRoom(Number(lastInsertRowid));
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    // Returns the updated room, or null when there is no room with that id.
    updateRoom(id, { name, length, width, height, trhAddress = null, co2Address = null, relayAddress = null, acAddress = null },
      now = Date.now()) {
      if (!q.get.get(id)) return null;
      checkName(name, id);
      checkAddresses({ trhAddress, co2Address, relayAddress, acAddress }, id);
      q.update.run(name, length, width, height, trhAddress, co2Address, relayAddress, acAddress, now, id);
      return getRoom(id);
    },

    // What was last commanded, or null when there is no such room:
    // { relay: { intake, exhaust, circulation, humidifier, sentAt }, ac: { power, mode, setpoint, fan, sentAt } }
    getCommands(roomId) {
      const r = q.commands.get(roomId);
      if (!r) return null;
      return {
        relay: {
          intake: r.intake === 1, exhaust: r.exhaust === 1, circulation: r.circulation === 1,
          humidifier: r.humidifier === 1, sentAt: r.relay_sent_at,
        },
        ac: { power: r.ac_power === 1, mode: r.ac_mode, setpoint: r.ac_setpoint, fan: r.ac_fan, sentAt: r.ac_sent_at },
      };
    },

    // The automatic control settings and band states, or null when there is no such room:
    // { auto, co2Low, co2High, tLow, tHigh, rhLow, rhHigh, humidifierDuringExchange, acFan, co2Safety, exchangeMaxMin,
    //   exchange, exchangeSince, exchangeEndedAt, cappedInRow, humidifier, humidifierSince }
    getControl(roomId) {
      let r = q.control.get(roomId);
      if (!r) {
        if (!q.get.get(roomId)) return null;
        q.insertControl.run(roomId); // a room made by older code has no row yet
        r = q.control.get(roomId);
      }
      return {
        auto: r.auto === 1, co2Low: r.co2_low, co2High: r.co2_high, tLow: r.t_low, tHigh: r.t_high,
        rhLow: r.rh_low, rhHigh: r.rh_high, humidifierDuringExchange: r.humidifier_during_exchange === 1, acFan: r.ac_fan,
        exchange: r.exchange === 1, exchangeSince: r.exchange_since, humidifier: r.humidifier === 1,
        co2Safety: r.co2_safety, exchangeMaxMin: r.exchange_max_min, exchangeEndedAt: r.exchange_ended_at,
        cappedInRow: r.capped_in_row, humidifierSince: r.humidifier_since,
      };
    },

    // Returns true when the room exists. Settings must be valid (see validateControl in controller.js).
    setControl(roomId, { auto, co2Low, co2High, tLow, tHigh, rhLow, rhHigh, humidifierDuringExchange, acFan, co2Safety, exchangeMaxMin }) {
      return q.setControl.run(auto ? 1 : 0, co2Low, co2High, tLow, tHigh, rhLow, rhHigh, humidifierDuringExchange ? 1 : 0, acFan,
        co2Safety, exchangeMaxMin, roomId).changes > 0;
    },

    // Without exchangeSince it keeps the time the exchange began and is cleared when it ends. exchangeEndedAt, cappedInRow
    // and humidifierSince are kept when not given (null is a value).
    setControlState(roomId, { exchange, humidifier, exchangeSince, exchangeEndedAt, cappedInRow, humidifierSince }, at) {
      const r = q.control.get(roomId);
      if (!r) return false;
      const since = exchangeSince !== undefined ? exchangeSince : exchange ? (r.exchange_since ?? at) : null;
      return q.setControlState.run(exchange ? 1 : 0, humidifier ? 1 : 0, since,
        exchangeEndedAt !== undefined ? exchangeEndedAt : r.exchange_ended_at,
        cappedInRow !== undefined ? cappedInRow : r.capped_in_row,
        humidifierSince !== undefined ? humidifierSince : r.humidifier_since, roomId).changes > 0;
    },

    // ---- Alarms (spec 2026-10-19-safety-and-history-design.md section 3) ----
    // An alarm is { id, roomId, roomName, key, level, text, raisedAt, clearedAt, ackedAt }.

    // Raises an alarm and returns its id. Throws when the room already has an active alarm with that key.
    raiseAlarm(roomId, key, level, text, at) {
      return Number(q.insertAlarm.run(roomId, key, level, text, at).lastInsertRowid);
    },

    // Returns true when an active alarm was cleared.
    clearAlarm(roomId, key, at) {
      return q.clearAlarm.run(at, roomId, key).changes > 0;
    },

    getAlarm(id) {
      const row = q.alarm.get(id);
      return row ? toAlarm(row) : null;
    },

    // The room's active alarms.
    activeAlarms(roomId) {
      return q.activeAlarms.all(roomId).map(toAlarm);
    },

    // Active alarms, and cleared ones not yet acknowledged: of one room, or of every room. Critical first, then newest.
    currentAlarms(roomId = null) {
      return q.currentAlarms.all(roomId).map(toAlarm);
    },

    // { current, history }: history = the room's last 50 alarms of any state, newest first.
    roomAlarms(roomId) {
      return { current: this.currentAlarms(roomId), history: q.alarmHistory.all(roomId).map(toAlarm) };
    },

    // Acknowledging again keeps the first time. Returns the alarm, or null when there is none.
    ackAlarm(id, at) {
      if (q.ackAlarm.run(at, id).changes === 0) return null;
      return this.getAlarm(id);
    },

    // Acknowledges every unacknowledged alarm of the room (all of them are current). Returns how many.
    ackRoomAlarms(roomId, at) {
      return Number(q.ackRoomAlarms.run(at, roomId).changes);
    },

    // Both of these return true when the room exists.
    setRelayCommand(roomId, key, on, at) {
      if (!RELAY_KEYS.includes(key)) throw new Error(`unknown machine ${key}`);
      return q.setRelay[key].run(on ? 1 : 0, at, roomId).changes > 0;
    },

    setAcCommand(roomId, { power, mode, setpoint, fan }, at) {
      return q.setAc.run(power ? 1 : 0, mode, setpoint, fan, at, roomId).changes > 0;
    },

    // ---- Stream B: machine log ----

    // Writes a log row for a saved command unless it equals the machine's previous row (a re-send).
    // change: { on, setpoint, mode, fan } (the last three only for the aircon). Returns true when a row was written.
    logMachine(roomId, machine, { on, setpoint = null, mode = null, fan = null }, source, at) {
      const last = q.logLast.get(roomId, machine);
      if (last && last.on_ === (on ? 1 : 0) && last.setpoint === setpoint && last.mode === mode && last.fan === fan) return false;
      q.logAdd.run(roomId, machine, at, on ? 1 : 0, setpoint, mode, fan, source);
      return true;
    },

    // Every log row of one machine, oldest first.
    machineLog(roomId, machine) {
      return q.logAll.all(roomId, machine).map(logRow);
    },

    // ---- Stream B: history and overview ----

    // The charts data for the last `hours` (1, 6, 24, 168 or 720) ending at now, or null when there is no such room.
    // Machines: the log rows in the window, and the last row before it moved to the start of the window.
    history(roomId, hours, now = Date.now()) {
      if (!q.get.get(roomId)) return null;
      const bucketS = HISTORY_BUCKET_S[hours];
      const from = now - hours * 3_600_000;
      const machines = {};
      for (const key of MACHINE_KEYS) {
        const rows = [];
        const before = q.logBefore.get(roomId, key, from);
        if (before) rows.push({ ...before, at: from });
        rows.push(...q.logSince.all(roomId, key, from, now));
        machines[key] = rows.map((r) => {
          const { at, on, setpoint, mode, fan, source } = logRow(r);
          return key === 'ac' ? { at, on, setpoint, mode, fan, source } : { at, on, source };
        });
      }
      return {
        from, to: now, bucketS,
        trh: buckets(roomId, 'trh', bucketS * 1000, from, now),
        co2: buckets(roomId, 'co2', bucketS * 1000, from, now),
        machines,
      };
    },

    // Everything the Overview page shows. Alarms come straight from the alarms table:
    // a room's count is its active alarms (not cleared); the list is the current ones (active, or cleared and not acknowledged).
    overview(now = Date.now()) {
      const perRoom = new Map();
      for (const a of q.overviewActive.all()) {
        const e = perRoom.get(a.room_id) ?? { count: 0, level: null };
        e.count++;
        if (e.level === null || LEVEL_RANK[a.level] > LEVEL_RANK[e.level]) e.level = a.level;
        perRoom.set(a.room_id, e);
      }
      const rooms = this.listRooms().map((room) => {
        const [trh, co2] = this.getSensors(room.id, 1);
        const c = this.getControl(room.id);
        // With auto off the machines are driven by hand: an exchange is the intake and the exhaust both commanded on.
        const relay = this.getCommands(room.id).relay;
        const exchange = c.auto ? c.exchange : relay.intake && relay.exhaust;
        const day = (kind) => buckets(room.id, kind, SPARK_BUCKET_MS, now - 24 * 3_600_000, now);
        const line = (rows, field) => rows.map((p) => ({ at: p.at, v: p[field] }));
        const trhDay = day('trh');
        return {
          id: room.id,
          name: room.name,
          trh: { status: trh.status, t: trh.lastOk?.t ?? null, rh: trh.lastOk?.rh ?? null, at: trh.lastOk?.at ?? null },
          co2: { status: co2.status, co2: co2.lastOk?.co2 ?? null, at: co2.lastOk?.at ?? null },
          auto: c.auto,
          exchange,
          exchangeSince: c.auto ? c.exchangeSince : null,
          bands: { tLow: c.tLow, tHigh: c.tHigh, rhLow: c.rhLow, rhHigh: c.rhHigh, co2Low: c.co2Low, co2High: c.co2High },
          alarms: perRoom.get(room.id) ?? { count: 0, level: null },
          spark: { t: line(trhDay, 't'), rh: line(trhDay, 'rh'), co2: line(day('co2'), 'co2') },
        };
      });
      return { rooms, alarms: q.overviewAlarms.all().map(alarmRow) };
    },

    // Every wired relay module and aircon gateway: rooms by id, relay before ac.
    listWiredMachines() {
      return q.wiredMachines.all().map((r) => ({ roomId: r.roomId, kind: r.kind, address: r.address }));
    },

    // Returns true when a room was deleted.
    deleteRoom(id) {
      db.exec('BEGIN');
      try {
        q.deleteReadings.run(id);
        q.deleteCommands.run(id);
        q.deleteControl.run(id);
        q.deleteAlarms.run(id);
        q.deleteMachineLog.run(id);
        bucketCache.delete(id);
        const deleted = q.delete.run(id).changes > 0;
        db.exec('COMMIT');
        return deleted;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    // Every wired sensor: rooms by id, trh before co2.
    listWiredSensors() {
      return q.wired.all().map((r) => ({ roomId: r.roomId, kind: r.kind, address: r.address }));
    },

    // One poll result. Values not measured are null.
    addReading({ roomId, kind, address, at, ok, t = null, rh = null, co2 = null, error = null }) {
      q.addReading.run(roomId, kind, address, at, ok ? 1 : 0, t, rh, co2, error, roomId, kind, address);
      const perRoom = bucketCache.get(roomId); // a reading inside a completed bucket makes that cache stale
      if (perRoom) {
        for (const [key, e] of perRoom) {
          const [k, b] = key.split('/');
          if (k === kind && at < e.hi * Number(b)) perRoom.delete(key);
        }
      }
    },

    // [trhSensor, co2Sensor] for the room, or null when there is no such room.
    getSensors(roomId, limit = 50) {
      const room = getRoom(roomId);
      return room ? KINDS.map((kind) => sensorOf(room, kind, limit)) : null;
    },

    // The stored text of a setting, or null when it was never set.
    getSetting(key) {
      return q.getSetting.get(key)?.value ?? null;
    },

    setSetting(key, value) {
      q.setSetting.run(key, value);
    },

    close() {
      db.close();
    },
  };
}
