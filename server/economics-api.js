// The Economics page's routes (spec 2026-11-06-economics-design.md 7.1), called from api.js: GET /api/economics?room=&crop=,
// PUT and DELETE /api/economics/figures, POST /api/economics/work-out. server/economics.js does the work; this reads the
// requests and turns its refusals into the API's. The owner's only: server/roles.js lets no worker in (a route not on its
// worker list is 403), and the live stream keeps the 'economics' event from workers (server/live.js).

import { createEconomics, EconomicsError } from './economics.js';
import { localZone } from './usage.js';

const ID = /^[1-9][0-9]{0,14}$/;
const ROUTE = /^\/api\/economics(?:\/figures|\/work-out)?$/; // its three paths; another under /api/economics is the API's 404

// The room of a query: none (null: the first room), else an id; text that is not an id is no room (404).
const roomQuery = (text) => (text === null || text === '' ? null : ID.test(text) ? Number(text) : 0);

// db: the farm database; events: the bus (null in some tests); harvests and batches: api.js's own services; simulations:
// the queue (null: no Work it out). → async (req, res, path, { send, readJson, HttpError, url }) answering true when the path
// is one of its routes; its close() stops listening to the simulations' events.
export function createEconomicsRoutes({ db, events = null, harvests, batches, simulations = null, now = Date.now, zone = localZone, log = console.error }) {
  const economics = createEconomics({ db, harvests, batches, simulations, events, now, zone, log });

  async function route(req, res, path, { send, readJson, HttpError, url }) {
    const q = (name) => url.searchParams.get(name);
    if (path === '/api/economics' && req.method === 'GET') {
      send(res, 200, economics.view({ room: roomQuery(q('room')), crop: q('crop') || null }));
    } else if (path === '/api/economics/figures' && req.method === 'PUT') {
      send(res, 200, economics.setFigure(await readJson(req)));
    } else if (path === '/api/economics/figures' && req.method === 'DELETE') {
      send(res, 200, economics.clearFigure({ room: roomQuery(q('room')) ?? 0, crop: q('crop'), key: q('key') }));
    } else if (path === '/api/economics/work-out' && req.method === 'POST') {
      const { status, view } = economics.workOut(await readJson(req));
      send(res, status, view);
    } else {
      throw new HttpError(404, 'Not found'); // another method
    }
    return true;
  }

  async function economicsRoutes(req, res, path, helpers) {
    if (!ROUTE.test(path)) return false;
    try {
      return await route(req, res, path, helpers);
    } catch (err) {
      if (err instanceof EconomicsError) throw new helpers.HttpError(err.status, err.message, err.field);
      throw err;
    }
  }
  economicsRoutes.close = () => economics.close();
  return economicsRoutes;
}
