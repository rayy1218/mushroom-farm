// JSON API: /api/rooms and /api/rooms/:id.

import { validateRoom } from './rooms.js';
import { NameTakenError } from './db.js';

const MAX_BODY = 64 * 1024;

class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Content-Type must be application/json');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Body is too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body must be valid JSON');
  }
}

async function readRoom(req) {
  const result = validateRoom(await readJson(req));
  if (result.error) throw new HttpError(400, result.error, result.field);
  return result.room;
}

const notFound = () => new HttpError(404, 'Not found');
const noRoom = () => new HttpError(404, 'Room not found');

// Returns a handler for every request whose path starts with /api.
export function createApi(db) {
  async function route(req, res, path) {
    if (path === '/api/rooms') {
      if (req.method === 'GET') return send(res, 200, db.listRooms());
      if (req.method === 'POST') return send(res, 201, db.createRoom(await readRoom(req)));
      throw notFound();
    }
    const match = /^\/api\/rooms\/([1-9][0-9]{0,14})$/.exec(path);
    if (!match) throw notFound();
    const id = Number(match[1]);
    if (req.method === 'PUT') {
      if (!db.getRoom(id)) throw noRoom();
      return send(res, 200, db.updateRoom(id, await readRoom(req)));
    }
    if (req.method === 'DELETE') {
      if (!db.deleteRoom(id)) throw noRoom();
      res.writeHead(204);
      return res.end();
    }
    throw notFound();
  }

  return async function api(req, res, url) {
    try {
      await route(req, res, url.pathname);
    } catch (err) {
      if (err instanceof HttpError) {
        send(res, err.status, err.field ? { error: err.message, field: err.field } : { error: err.message });
      } else if (err instanceof NameTakenError) {
        send(res, 409, { error: err.message, field: 'name' });
      } else if (err.code === 'ECONNRESET') {
        // The client hung up mid-body: nothing to answer, not a server bug.
      } else {
        console.error(err);
        send(res, 500, { error: 'Something went wrong' });
      }
    }
  };
}
