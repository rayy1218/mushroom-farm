// The Sales routes (spec 2026-11-05-sales-design.md 5), called from api.js: /api/sales (GET ?days, POST), /api/sales/range,
// /api/sales/summary, /api/sales.csv, /api/sales/deliveries/:id (PUT, DELETE) and its /paid (PUT), /api/buyers (GET, POST)
// and /api/buyers/:id (PUT, DELETE). server/sales.js records and works out; every write publishes 'sales' {}.

import { attachment } from './tasks-api.js';
import { createSales } from './sales.js';

const DELIVERY = /^\/api\/sales\/deliveries\/([1-9][0-9]{0,14})(\/paid)?$/;
const BUYER = /^\/api\/buyers\/([1-9][0-9]{0,14})$/;
const BOM = '﻿'; // Excel on Windows reads the CSV as UTF-8

// db: the farm database; events: the bus (null in some tests). → async (req, res, path, { send, readJson, HttpError, url })
// answering true when the path is one of its routes.
export function createSalesRoutes({ db, events = null, now = Date.now }) {
  const sales = createSales({ db, now });
  sales.onChange(() => events?.publish('sales', {}));

  async function route(req, res, path, { send, readJson, HttpError, url }) {
    const notFound = () => new HttpError(404, 'Not found');
    const noContent = () => { res.writeHead(204); res.end(); };
    const q = (name) => url.searchParams.get(name);
    // days: digits only; the store checks it is one of the ranges.
    const daysOf = () => {
      const asked = q('days');
      if (asked !== null && !/^[0-9]+$/.test(asked)) throw new HttpError(400, 'days must be 7, 30, 90 or 365', 'days');
      return asked === null ? 30 : Number(asked);
    };

    if (path === '/api/sales') {
      if (req.method === 'GET') send(res, 200, sales.view({ days: daysOf() }));
      else if (req.method === 'POST') send(res, 201, sales.record(await readJson(req)));
      else throw notFound();
      return true;
    }
    if (path === '/api/sales/range') {
      if (req.method !== 'GET') throw notFound();
      send(res, 200, sales.range({ from: q('from'), to: q('to') }));
      return true;
    }
    if (path === '/api/sales/summary') {
      if (req.method !== 'GET') throw notFound();
      const run = q('run');
      if (run !== null && !/^[1-9][0-9]{0,14}$/.test(run)) throw new HttpError(400, 'run must be a run id', 'run');
      send(res, 200, sales.summary({ from: q('from'), to: q('to'), run: run === null ? null : Number(run) }));
      return true;
    }
    if (path === '/api/sales.csv') {
      if (req.method !== 'GET') throw notFound();
      const { name, text } = sales.csv(daysOf());
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': attachment(name) });
      res.end(BOM + text);
      return true;
    }
    const one = DELIVERY.exec(path);
    if (one) {
      const id = Number(one[1]);
      if (one[2] && req.method === 'PUT') send(res, 200, sales.setPaid(id, await readJson(req)));
      else if (!one[2] && req.method === 'PUT') send(res, 200, sales.edit(id, await readJson(req)));
      else if (!one[2] && req.method === 'DELETE') { sales.remove(id); noContent(); }
      else throw notFound();
      return true;
    }
    if (path === '/api/buyers') {
      if (req.method === 'GET') send(res, 200, { buyers: sales.buyers() });
      else if (req.method === 'POST') send(res, 201, sales.addBuyer(await readJson(req)));
      else throw notFound();
      return true;
    }
    const buyer = BUYER.exec(path);
    if (buyer) {
      const id = Number(buyer[1]);
      if (req.method === 'PUT') send(res, 200, sales.editBuyer(id, await readJson(req)));
      else if (req.method === 'DELETE') { sales.removeBuyer(id); noContent(); }
      else throw notFound();
      return true;
    }
    return false;
  }

  // A 4xx from server/sales.js (SalesError) becomes the API's HttpError.
  return async function salesRoutes(req, res, path, helpers) {
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
