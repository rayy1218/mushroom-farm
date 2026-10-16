// The farm database: schema and room queries.

import { DatabaseSync } from 'node:sqlite';

const VERSION = 2;

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
const RELAY_KEYS = ['intake', 'exhaust', 'circulation', 'humidifier'];
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

    // Both return true when the room exists.
    setRelayCommand(roomId, key, on, at) {
      if (!RELAY_KEYS.includes(key)) throw new Error(`unknown machine ${key}`);
      return q.setRelay[key].run(on ? 1 : 0, at, roomId).changes > 0;
    },

    setAcCommand(roomId, { power, mode, setpoint, fan }, at) {
      return q.setAc.run(power ? 1 : 0, mode, setpoint, fan, at, roomId).changes > 0;
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
