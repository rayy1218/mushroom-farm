// The farm database: schema and room queries.

import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rooms (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  length_m   REAL    NOT NULL CHECK (length_m BETWEEN 0.5 AND 100),
  width_m    REAL    NOT NULL CHECK (width_m BETWEEN 0.5 AND 100),
  height_m   REAL    NOT NULL CHECK (height_m BETWEEN 0.5 AND 10),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
`;

// Thrown by createRoom and updateRoom when another room already has the name
// (ignoring case).
export class NameTakenError extends Error {
  constructor(name) {
    super(`A room called "${name}" already exists`);
    this.name = 'NameTakenError';
    this.roomName = name;
  }
}

function toRoom(row) {
  return {
    id: row.id,
    name: row.name,
    length: row.length_m,
    width: row.width_m,
    height: row.height_m,
    volume: Math.round(row.length_m * row.width_m * row.height_m * 100) / 100,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// path is a file path or ':memory:'. Fields passed in must already be valid
// (see validateRoom in rooms.js).
export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  const q = {
    list: db.prepare('SELECT * FROM rooms ORDER BY name, id'),
    get: db.prepare('SELECT * FROM rooms WHERE id = ?'),
    nameUsed: db.prepare('SELECT 1 FROM rooms WHERE name = ? AND id IS NOT ?'),
    insert: db.prepare(`INSERT INTO rooms (name, length_m, width_m, height_m, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)`),
    update: db.prepare(`UPDATE rooms SET name = ?, length_m = ?, width_m = ?, height_m = ?, updated_at = ?
                        WHERE id = ?`),
    delete: db.prepare('DELETE FROM rooms WHERE id = ?'),
  };

  function checkName(name, id) {
    if (q.nameUsed.get(name, id)) throw new NameTakenError(name);
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

    createRoom({ name, length, width, height }, now = Date.now()) {
      checkName(name, null);
      const { lastInsertRowid } = q.insert.run(name, length, width, height, now, now);
      return getRoom(Number(lastInsertRowid));
    },

    // Returns the updated room, or null when there is no room with that id.
    updateRoom(id, { name, length, width, height }, now = Date.now()) {
      if (!q.get.get(id)) return null;
      checkName(name, id);
      q.update.run(name, length, width, height, now, id);
      return getRoom(id);
    },

    // Returns true when a room was deleted.
    deleteRoom(id) {
      return q.delete.run(id).changes > 0;
    },

    close() {
      db.close();
    },
  };
}
