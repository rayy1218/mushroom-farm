// The farm database: schema and room queries.

import { DatabaseSync } from 'node:sqlite';

const VERSION = 1;

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
CREATE INDEX readings_by_room ON readings (room_id, kind, id);`;

// Brings a new or older database up to VERSION in one transaction.
function migrate(db) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  if (version >= VERSION) return;
  db.exec('BEGIN');
  try {
    const hasRooms = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'rooms'").get();
    if (hasRooms) {
      db.exec(`ALTER TABLE rooms ADD COLUMN trh_address INTEGER CHECK (trh_address BETWEEN 1 AND 247);
               ALTER TABLE rooms ADD COLUMN co2_address INTEGER CHECK (co2_address BETWEEN 1 AND 247);`);
    } else {
      db.exec(ROOMS);
    }
    db.exec(READINGS);
    db.exec(`PRAGMA user_version = ${VERSION}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

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
// address (either kind). field says which of the two addresses clashes.
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    addressUsed: db.prepare(`SELECT name FROM rooms WHERE id IS NOT ? AND (trh_address = ? OR co2_address = ?)`),
    insert: db.prepare(`INSERT INTO rooms (name, length_m, width_m, height_m, trh_address, co2_address, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    update: db.prepare(`UPDATE rooms SET name = ?, length_m = ?, width_m = ?, height_m = ?,
                               trh_address = ?, co2_address = ?, updated_at = ?
                        WHERE id = ?`),
    delete: db.prepare('DELETE FROM rooms WHERE id = ?'),
    deleteReadings: db.prepare('DELETE FROM readings WHERE room_id = ?'),
    wired: db.prepare(`SELECT id AS roomId, 'trh' AS kind, trh_address AS address FROM rooms WHERE trh_address IS NOT NULL
                       UNION ALL
                       SELECT id, 'co2', co2_address FROM rooms WHERE co2_address IS NOT NULL
                       ORDER BY 1, 2 DESC`),
    addReading: db.prepare(`INSERT INTO readings (room_id, kind, address, at, ok, t, rh, co2, error)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    latest: db.prepare(`SELECT * FROM (SELECT * FROM readings WHERE room_id = ? AND kind = ? AND address = ?
                                       ORDER BY id DESC LIMIT ?) ORDER BY id`),
    lastOk: db.prepare(`SELECT * FROM readings WHERE room_id = ? AND kind = ? AND address = ? AND ok = 1
                        ORDER BY id DESC LIMIT 1`),
    failuresSince: db.prepare(`SELECT COUNT(*) AS n FROM readings WHERE room_id = ? AND kind = ? AND address = ? AND id > ?`),
  };

  function checkName(name, id) {
    if (q.nameUsed.get(name, id)) throw new NameTakenError(name);
  }

  // Each address may be used by one sensor of one room only.
  function checkAddresses({ trhAddress, co2Address }, id) {
    for (const [field, address] of [['trhAddress', trhAddress], ['co2Address', co2Address]]) {
      if (address == null) continue;
      const other = q.addressUsed.get(id, address, address);
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

  return {
    listRooms() {
      return q.list.all().map(toRoom);
    },

    getRoom,

    createRoom({ name, length, width, height, trhAddress = null, co2Address = null }, now = Date.now()) {
      checkName(name, null);
      checkAddresses({ trhAddress, co2Address }, null);
      const { lastInsertRowid } = q.insert.run(name, length, width, height, trhAddress, co2Address, now, now);
      return getRoom(Number(lastInsertRowid));
    },

    // Returns the updated room, or null when there is no room with that id.
    updateRoom(id, { name, length, width, height, trhAddress = null, co2Address = null }, now = Date.now()) {
      if (!q.get.get(id)) return null;
      checkName(name, id);
      checkAddresses({ trhAddress, co2Address }, id);
      q.update.run(name, length, width, height, trhAddress, co2Address, now, id);
      return getRoom(id);
    },

    // Returns true when a room was deleted.
    deleteRoom(id) {
      db.exec('BEGIN');
      try {
        q.deleteReadings.run(id);
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
      q.addReading.run(roomId, kind, address, at, ok ? 1 : 0, t, rh, co2, error);
    },

    // [trhSensor, co2Sensor] for the room, or null when there is no such room.
    getSensors(roomId, limit = 50) {
      const room = getRoom(roomId);
      return room ? KINDS.map((kind) => sensorOf(room, kind, limit)) : null;
    },

    close() {
      db.close();
    },
  };
}
