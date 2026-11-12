// The costs routes (spec 2026-11-05-costs-design.md 5), called from api.js: GET /api/costs, /api/costs/month?month=,
// /api/costs/summary?from=&to=&run=, /api/costs.csv?month=; POST /api/costs; PUT and DELETE /api/costs/:id; POST /api/costs/:id/change and /stop;
// GET and POST /api/equipment, PUT and DELETE /api/equipment/:id (Money truth: the equipment register).
// server/costs.js checks, writes and works out; this reads the query and the body and turns its errors into the API's.

import { createCosts } from './costs.js';
import { attachment } from './tasks-api.js';

const ONE = /^\/api\/costs\/([1-9][0-9]{0,14})$/;
const ACTION = /^\/api\/costs\/([1-9][0-9]{0,14})\/(change|stop)$/;
const EQUIPMENT = /^\/api\/equipment\/([1-9][0-9]{0,14})$/; // ---- Money truth ----
const BOM = '\ufeff'; // Excel on Windows reads the CSV as UTF-8

// Makes the service from the database, tells the pages ('costs' on events) after a write or a usage warm done. → async (req,
// res, path, { send, readJson, HttpError, url }) that answers true when the path is one of its routes; its close() stops
// telling and the usage warms.
export function createCostRoutes({ db, events }) {
  const costs = createCosts({ db });
  const stopTelling = costs.onChange(() => events?.publish('costs', {}));
  async function route(req, res, path, { send, readJson, HttpError, url }) {
    const notFound = () => new HttpError(404, 'Not found');
    const q = (name) => url.searchParams.get(name);

    if (path === '/api/costs') {
      if (req.method === 'GET') send(res, 200, { costs: costs.list() });
      else if (req.method === 'POST') send(res, 201, costs.add(await readJson(req)));
      else throw notFound();
      return true;
    }
    if (path === '/api/costs/month') {
      if (req.method !== 'GET') throw notFound();
      send(res, 200, costs.monthView({ month: q('month') }));
      return true;
    }
    if (path === '/api/costs.csv') {
      if (req.method !== 'GET') throw notFound();
      const { name, text } = await costs.csv({ month: q('month') });
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': attachment(name) });
      res.end(BOM + text);
      return true;
    }
    if (path === '/api/costs/summary') {
      if (req.method !== 'GET') throw notFound();
      const run = q('run');
      if (run !== null && !/^[1-9][0-9]{0,14}$/.test(run)) throw new HttpError(400, 'run must be a run id', 'run');
      send(res, 200, costs.summary({ from: q('from'), to: q('to'), run: run === null ? null : Number(run) }));
      return true;
    }
    // ---- Money truth ---- the equipment register (spec 2026-11-12-money-truth-design.md 6.2)
    if (path === '/api/equipment') {
      if (req.method === 'GET') send(res, 200, costs.equipment());
      else if (req.method === 'POST') send(res, 201, costs.addEquipment(await readJson(req)));
      else throw notFound();
      return true;
    }
    const item = EQUIPMENT.exec(path);
    if (item) {
      const id = Number(item[1]);
      if (req.method === 'PUT') send(res, 200, costs.editEquipment(id, await readJson(req)));
      else if (req.method === 'DELETE') {
        costs.removeEquipment(id);
        res.writeHead(204);
        res.end();
      } else throw notFound();
      return true;
    }
    const action = ACTION.exec(path);
    if (action) {
      if (req.method !== 'POST') throw notFound();
      const id = Number(action[1]);
      const body = await readJson(req);
      send(res, 200, action[2] === 'change' ? costs.change(id, body) : costs.stopItem(id, body));
      return true;
    }
    const one = ONE.exec(path);
    if (one) {
      const id = Number(one[1]);
      if (req.method === 'PUT') {
        send(res, 200, costs.edit(id, await readJson(req)));
      } else if (req.method === 'DELETE') {
        costs.remove(id);
        res.writeHead(204);
        res.end();
      } else {
        throw notFound();
      }
      return true;
    }
    return false;
  }

  // A 4xx from server/costs.js (CostError) becomes the API's HttpError.
  async function costRoutes(req, res, path, helpers) {
    try {
      return await route(req, res, path, helpers);
    } catch (err) {
      const { HttpError } = helpers;
      if (!(err instanceof HttpError) && Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
        throw new HttpError(err.status, err.message, err.field);
      }
      throw err;
    }
  }
  costRoutes.close = () => { stopTelling(); costs.stop(); };
  return costRoutes;
}
