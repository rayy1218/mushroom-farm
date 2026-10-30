// The task routes (spec 2026-10-30-tasks-design.md section 6), called from api.js: GET and POST /api/rooms/:id/tasks,
// GET /api/rooms/:id/tasks/log and /log.csv, GET /api/tasks/today, POST /api/tasks/:id/done|skip|cancel, GET and PUT
// /api/workers and /api/task-rules. server/tasks.js makes and closes the rows; this checks what the pages send.

const ROOM_TASKS = /^\/api\/rooms\/([1-9][0-9]{0,14})\/tasks$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// db: the farm database; tasks: from createTasks (server/tasks.js), whose views make the day's rows first.
// → async (req, res, path, { send, readJson, HttpError, url }) that answers true when the path is one of its routes.
export function createTaskRoutes({ db, tasks }) {
  async function route(req, res, path, { send, readJson, HttpError }) {
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
