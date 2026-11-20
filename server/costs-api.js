// The costs routes (spec 2026-11-05-costs-design.md 5), called from api.js: GET /api/costs, /api/costs/month?month=,
// /api/costs/summary?from=&to=&run=, /api/costs.csv?month=; POST /api/costs; PUT and DELETE /api/costs/:id; POST /api/costs/:id/change and /stop;
// GET and POST /api/equipment, PUT and DELETE /api/equipment/:id (Money truth: the equipment register); POST /api/costs/:id/void
// and /restore, /api/equipment/:id/void and /restore (Data integrity: the DELETEs answer 409).
// server/costs.js checks, writes and works out; this reads the query and the body and turns its errors into the API's.

import { createCosts } from './costs.js';
import { attachment } from './tasks-api.js';
import { whoOf } from './changes.js';
import { createTariffs } from './tariffs.js';
import { localZone } from './usage.js';

const ONE = /^\/api\/costs\/([1-9][0-9]{0,14})$/;
const ACTION = /^\/api\/costs\/([1-9][0-9]{0,14})\/(change|stop|void|restore)$/;
const EQUIPMENT = /^\/api\/equipment\/([1-9][0-9]{0,14})(\/void|\/restore)?$/; // ---- Money truth ---- (Data integrity: void, restore)
const KEEP = /^\/api\/costs\/months\/([1-9][0-9]{0,14})\/keep$/; // ---- Data integrity ---- the month as YYYYMM
const TARIFF = /^\/api\/tariffs\/([1-9][0-9]{0,14})(\/void|\/restore)?$/; // ---- Data integrity ----
const BOM = '\ufeff'; // Excel on Windows reads the CSV as UTF-8

// ---- Data integrity ---- (8.3) ms from now to the next hour:00 at the farm (now itself on the hour: the next day's).
export function msToNextHour(hour, nowMs, zone = localZone) {
  const start = zone.startOfDay(nowMs);
  const today = start + hour * 3_600_000;
  return (today > nowMs ? today : zone.addDays(start, 1) + hour * 3_600_000) - nowMs;
}
const CLOSE_HOUR = 6; // the daily tick that keeps a closable month's figures
export const START_CLOSE_MS = 60_000; // and once a minute after the server starts

// Makes the service from the database, tells the pages ('costs' on events) after a write or a usage warm done. → async (req,
// res, path, { send, readJson, HttpError, url }) that answers true when the path is one of its routes; its close() stops
// telling and the usage warms.
export function createCostRoutes({
  db, events, now = Date.now, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = clearTimeout,
}) {
  const costs = createCosts({ db, now });
  const stopTelling = costs.onChange(() => events?.publish('costs', {}));
  // ---- Data integrity ---- the electricity tariff (spec 2026-11-12-data-integrity-design.md 8.1): every cost and cost per kg moves
  const tariffs = createTariffs({ db, beforeWrite: (days, body) => costs.closedAsk(days, body) });
  const stopTariffs = tariffs.onChange(() => {
    events?.publish('costs', {});
    events?.publish('harvest', { roomId: null });
  });
  // ---- Data integrity ---- (8.3) a minute after start, then every day at 06:00, the month that closed keeps its figures,
  // Costs opened or not
  let tick = null;
  const schedule = (ms) => {
    tick = setTimer(() => {
      try { costs.closeDue(); } catch (err) { console.error(`month close failed: ${err.message}`); }
      schedule(msToNextHour(CLOSE_HOUR, now()));
    }, ms);
    tick?.unref?.();
  };
  schedule(START_CLOSE_MS);
  async function route(req, res, path, { send, readJson, HttpError, url }) {
    const notFound = () => new HttpError(404, 'Not found');
    const q = (name) => url.searchParams.get(name);

    if (path === '/api/costs') {
      if (req.method === 'GET') send(res, 200, { costs: costs.list() });
      else if (req.method === 'POST') send(res, 201, costs.add(await readJson(req), whoOf(req)));
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
    // ---- Data integrity ---- keep a re-priced month's new figures (spec 2026-11-12-data-integrity-design.md 8.3)
    const keep = KEEP.exec(path);
    if (keep) {
      if (req.method !== 'POST') throw notFound();
      const m = keep[1];
      send(res, 200, costs.keepMonth(m.length === 6 ? `${m.slice(0, 4)}-${m.slice(4)}` : m, await readJson(req), whoOf(req)));
      return true;
    }
    // ---- Money truth ---- the equipment register (spec 2026-11-12-money-truth-design.md 6.2)
    if (path === '/api/equipment') {
      if (req.method === 'GET') send(res, 200, costs.equipment());
      else if (req.method === 'POST') send(res, 201, costs.addEquipment(await readJson(req), whoOf(req)));
      else throw notFound();
      return true;
    }
    // ---- Data integrity ---- the tariff: GET and POST /api/tariffs; PUT, DELETE (409) /api/tariffs/:id, POST …/void, …/restore
    if (path === '/api/tariffs') {
      if (req.method === 'GET') send(res, 200, tariffs.list());
      else if (req.method === 'POST') send(res, 201, tariffs.add(await readJson(req), whoOf(req)));
      else throw notFound();
      return true;
    }
    const rate = TARIFF.exec(path);
    if (rate) {
      const id = Number(rate[1]);
      if (rate[2] && req.method === 'POST') {
        const body = await readJson(req);
        send(res, 200, rate[2] === '/void' ? tariffs.voidRate(id, body, whoOf(req)) : tariffs.restoreRate(id, body, whoOf(req)));
      } else if (!rate[2] && req.method === 'PUT') send(res, 200, tariffs.edit(id, await readJson(req), whoOf(req)));
      else if (!rate[2] && req.method === 'DELETE') tariffs.remove(id);
      else throw notFound();
      return true;
    }
    const item = EQUIPMENT.exec(path);
    if (item) {
      const id = Number(item[1]);
      if (item[2]) {
        if (req.method !== 'POST') throw notFound();
        const body = await readJson(req);
        send(res, 200, item[2] === '/void' ? costs.voidEquipment(id, body, whoOf(req)) : costs.restoreEquipment(id, body, whoOf(req)));
      } else if (req.method === 'PUT') send(res, 200, costs.editEquipment(id, await readJson(req), whoOf(req)));
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
      const who = whoOf(req);
      const act = { change: costs.change, stop: costs.stopItem, void: costs.voidCost, restore: costs.restoreCost }[action[2]];
      send(res, 200, act(id, body, who));
      return true;
    }
    const one = ONE.exec(path);
    if (one) {
      const id = Number(one[1]);
      if (req.method === 'PUT') {
        send(res, 200, costs.edit(id, await readJson(req), whoOf(req)));
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
  costRoutes.close = () => { clearTimer(tick); stopTelling(); stopTariffs(); costs.stop(); };
  return costRoutes;
}
