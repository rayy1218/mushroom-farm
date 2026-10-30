// The task routes (spec 2026-10-30-tasks-design.md section 6), called from api.js: GET and POST /api/rooms/:id/tasks,
// GET /api/rooms/:id/tasks/log and /log.csv, GET /api/tasks/today, POST /api/tasks/:id/done|skip|cancel, GET and PUT
// /api/workers and /api/task-rules. server/tasks.js makes and closes the rows; this checks what the pages send.

const ROOM_TASKS = /^\/api\/rooms\/([1-9][0-9]{0,14})\/tasks$/;
const TASK_ACTION = /^\/api\/tasks\/([1-9][0-9]{0,14})\/(done|skip|cancel)$/;
const ROOM_LOG = /^\/api\/rooms\/([1-9][0-9]{0,14})\/tasks\/log(\.csv)?$/;
// Before the CSV, so Excel on Windows reads it as UTF-8 (the → and m³ of Plan this rows).
const BOM = '\uFEFF';

// A worker's name: 1 to 40 characters, as in server/tasks.js.
const WORKER_MAX = 40;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const trimmed = (v) => (typeof v === 'string' ? v.trim() : '');

// The Content-Disposition of a download. A header holds Latin-1 only: a name with anything outside printable ASCII (or a
// quote, backslash or %, which a browser may decode) gets an ASCII stand-in plus the exact name as UTF-8 (RFC 6266 / 5987;
// a lone surrogate goes as U+FFFD, which encodeURIComponent would refuse).
export function attachment(filename) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  if (ascii === filename) return `attachment; filename="${filename}"`;
  const utf8 = encodeURIComponent(filename.toWellFormed()).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

// PUT /api/workers: { workers: [{ id?, name, active? }] } or the bare list → [{ id|null, name, active }]. existing: the stored
// workers (an id must be one of theirs, once). Names are kept trimmed, must differ, case aside, and hold no control characters
// (db.setWorkers parks a kept name as U+0001 and the id during a swap). Removed workers are left out or sent as active false.
function readWorkers(body, existing, HttpError) {
  const bad = (message, field) => new HttpError(400, message, field);
  const list = Array.isArray(body) ? body : isObject(body) ? body.workers : undefined;
  if (!Array.isArray(list)) throw bad('Workers must be a list', 'workers');
  const ids = new Set(existing.map((w) => w.id));
  const usedIds = new Set();
  const names = new Set();
  return list.map((w, i) => {
    if (!isObject(w)) throw bad('Each worker must be an object with a name', `workers.${i}`);
    let id = null;
    if (w.id !== undefined && w.id !== null) {
      if (!ids.has(w.id) || usedIds.has(w.id)) throw bad('Unknown worker', `workers.${i}.id`);
      usedIds.add(w.id);
      id = w.id;
    }
    const name = trimmed(w.name);
    if (name === '') throw bad('Name is required', `workers.${i}.name`);
    if (name.length > WORKER_MAX) throw bad(`Name must be ${WORKER_MAX} characters or fewer`, `workers.${i}.name`);
    if (/[\u0000-\u001f\u007f]/.test(name)) throw bad('A name cannot hold control characters', `workers.${i}.name`);
    if (names.has(name.toLowerCase())) throw bad(`A worker called "${name}" already exists`, `workers.${i}.name`);
    names.add(name.toLowerCase());
    const active = w.active ?? true;
    if (typeof active !== 'boolean') throw bad('Active must be true or false', `workers.${i}.active`);
    return { id, name, active };
  });
}

// db: the farm database; tasks: from createTasks (server/tasks.js), whose views make the day's rows first.
// → async (req, res, path, { send, readJson, HttpError, url }) that answers true when the path is one of its routes.
export function createTaskRoutes({ db, tasks }) {
  async function route(req, res, path, { send, readJson, HttpError, url }) {
    const notFound = () => new HttpError(404, 'Not found');
    const readBody = async () => {
      const body = await readJson(req);
      if (!isObject(body)) throw new HttpError(400, 'Body must be a JSON object');
      return body;
    };

    if (path === '/api/tasks/today') {
      if (req.method !== 'GET') throw notFound();
      send(res, 200, tasks.todayView());
      return true;
    }
    const roomTasks = ROOM_TASKS.exec(path);
    if (roomTasks) {
      const id = Number(roomTasks[1]);
      if (req.method === 'GET') {
        const view = tasks.roomView(id);
        if (!view) throw new HttpError(404, 'Room not found');
        send(res, 200, view);
        return true;
      }
      if (req.method !== 'POST') throw notFound();
      // An own task { text, note? } or Plan this { suggestion }: server/tasks.js checks both and the room (404).
      const body = await readBody();
      const rows = 'suggestion' in body ? tasks.addFromSuggestion(id, body.suggestion) : [tasks.addLongterm(id, body)];
      send(res, 201, { rows });
      return true;
    }
    const action = TASK_ACTION.exec(path);
    if (action) {
      if (req.method !== 'POST') throw notFound();
      // Done { worker, amount? }, Skip { worker, reason }, Cancel { reason }: server/tasks.js checks them, the row (404),
      // that it is still open (409 with who and when) and that the action fits its kind.
      const id = Number(action[1]);
      const body = await readBody();
      send(res, 200, tasks[action[2]](id, body));
      return true;
    }
    const log = ROOM_LOG.exec(path);
    if (log) {
      if (req.method !== 'GET') throw notFound();
      const room = db.getRoom(Number(log[1]));
      if (!room) throw new HttpError(404, 'Room not found');
      if (log[2]) {
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': attachment(`${room.name} tasks.csv`) });
        res.end(BOM + tasks.logCsv(room.id));
        return true;
      }
      // ?before=<id>: the page older than that row; left out or empty: the newest page.
      const before = url.searchParams.get('before') || null;
      if (before !== null && !/^[1-9][0-9]{0,14}$/.test(before)) throw new HttpError(400, 'before must be a task id', 'before');
      send(res, 200, { rows: tasks.log(room.id, { before: before && Number(before) }) });
      return true;
    }
    if (path === '/api/workers') {
      if (req.method === 'GET') {
        send(res, 200, { workers: db.listWorkers() });
        return true;
      }
      if (req.method !== 'PUT') throw notFound();
      // The whole list: done rows keep the name they were done by (text), so a rename or removal leaves the log as it was.
      db.setWorkers(readWorkers(await readJson(req), db.listWorkers(), HttpError));
      send(res, 200, { workers: db.listWorkers() });
      return true;
    }
    return false;
  }

  // A 4xx thrown by server/tasks.js (TaskError) or by a body check here (status, message, maybe field) becomes the API's
  // HttpError.
  return async function taskRoutes(req, res, path, helpers) {
    try {
      return await route(req, res, path, helpers);
    } catch (err) {
      const { HttpError } = helpers;
      if (!(err instanceof HttpError) && Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
        throw new HttpError(err.status, err.message, err.field);
      }
      throw err;
    }
  };
}
