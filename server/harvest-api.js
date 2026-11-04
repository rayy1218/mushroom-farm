// The harvest routes (spec 2026-11-04-harvest-design.md 6), called from api.js: GET and POST /api/rooms/:id/harvests, PUT and
// DELETE /api/harvests/:id, GET /api/harvest?days=N and /api/harvest.csv?days=N. server/harvests.js records and works out;
// this reads the query and the body and turns its errors into the API's.

import { attachment } from './tasks-api.js';

const ROOM_HARVESTS = /^\/api\/rooms\/([1-9][0-9]{0,14})\/harvests$/;
const ONE_HARVEST = /^\/api\/harvests\/([1-9][0-9]{0,14})$/;
// Before the CSV, so Excel on Windows reads it as UTF-8.
const BOM = '\uFEFF';

// db: the farm database. harvests: from createHarvests. onTaskChange(roomId): after an edit or delete of a harvest that came
// from a check's Done, whose row's amount changed with it. → async (req, res, path, { send, readJson, HttpError, url }) that
// answers true when the path is one of its routes.
export function createHarvestRoutes({ db, harvests, onTaskChange = () => {} }) {
  async function route(req, res, path, { send, readJson, HttpError, url }) {
    const notFound = () => new HttpError(404, 'Not found');

    const inRoom = ROOM_HARVESTS.exec(path);
    if (inRoom) {
      const roomId = Number(inRoom[1]);
      if (req.method === 'GET') {
        const view = harvests.roomView(roomId);
        if (!view) throw new HttpError(404, 'Room not found');
        send(res, 200, view);
      } else if (req.method === 'POST') {
        send(res, 201, harvests.record(roomId, await readJson(req)));
      } else {
        throw notFound();
      }
      return true;
    }

    const one = ONE_HARVEST.exec(path);
    if (one) {
      const id = Number(one[1]);
      if (req.method === 'PUT') {
        const body = await readJson(req);
        const taskId = db.getHarvest(id)?.taskId ?? null;
        const row = harvests.edit(id, body);
        if (taskId !== null) onTaskChange(row.roomId);
        send(res, 200, row);
      } else if (req.method === 'DELETE') {
        const before = db.getHarvest(id);
        harvests.remove(id);
        if (before?.taskId != null) onTaskChange(before.roomId);
        res.writeHead(204);
        res.end();
      } else {
        throw notFound();
      }
      return true;
    }

    if (path === '/api/harvest' || path === '/api/harvest.csv') {
      if (req.method !== 'GET') throw notFound();
      // Digits only; harvests.js checks the value is one of the ranges.
      const asked = url.searchParams.get('days');
      if (asked !== null && !/^[0-9]+$/.test(asked)) throw new HttpError(400, 'days must be 7, 30, 90 or 365', 'days');
      const days = asked === null ? 30 : Number(asked);
      if (path === '/api/harvest') {
        send(res, 200, harvests.farmView({ days }));
      } else {
        const { name, text } = harvests.csv(days);
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': attachment(name) });
        res.end(BOM + text);
      }
      return true;
    }
    return false;
  }

  // A 4xx from server/harvests.js (HarvestError) becomes the API's HttpError.
  return async function harvestRoutes(req, res, path, helpers) {
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
