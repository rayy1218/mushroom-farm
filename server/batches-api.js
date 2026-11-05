// The Batches routes (spec 2026-11-05-batches-design.md 6), called from api.js: GET and POST /api/batches, GET
// /api/batches.csv, GET, PUT and DELETE /api/batches/:id, POST /api/batches/:id/place, /unplace and /checks, PUT and DELETE
// /api/batch-checks/:id. server/batches.js keeps the rules; this reads the query and body and turns its errors into the API's.

import { attachment } from './tasks-api.js';

const ID = '([1-9][0-9]{0,14})';
const ONE = new RegExp(`^/api/batches/${ID}$`);
const ACTION = new RegExp(`^/api/batches/${ID}/(place|unplace|checks)$`);
const CHECK = new RegExp(`^/api/batch-checks/${ID}$`);
const BOM = '\uFEFF'; // before the CSV, so Excel on Windows reads it as UTF-8

// batches: from createBatches. → async (req, res, path, { send, readJson, HttpError, url }) that answers true when the path
// is one of its routes.
export function createBatchRoutes({ batches }) {
  async function route(req, res, path, { send, readJson, HttpError, url }) {
    const notFound = () => new HttpError(404, 'Not found');
    const noContent = () => { res.writeHead(204); res.end(); };
    const param = (name) => url.searchParams.get(name);

    if (path === '/api/batches') {
      if (req.method === 'GET') send(res, 200, batches.list({ run: param('run'), from: param('from'), to: param('to'), status: param('status') }));
      else if (req.method === 'POST') send(res, 201, batches.receive(await readJson(req)));
      else throw notFound();
      return true;
    }
    if (path === '/api/batches.csv') {
      if (req.method !== 'GET') throw notFound();
      const { name, text } = batches.csv({ from: param('from'), to: param('to') });
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': attachment(name) });
      res.end(BOM + text);
      return true;
    }
    const one = ONE.exec(path);
    if (one) {
      const id = Number(one[1]);
      if (req.method === 'GET') send(res, 200, batches.detail(id));
      else if (req.method === 'PUT') send(res, 200, batches.edit(id, await readJson(req)));
      else if (req.method === 'DELETE') { batches.remove(id); noContent(); }
      else throw notFound();
      return true;
    }
    const action = ACTION.exec(path);
    if (action) {
      if (req.method !== 'POST') throw notFound();
      const id = Number(action[1]);
      if (action[2] === 'place') send(res, 201, batches.place(id, await readJson(req)));
      else if (action[2] === 'unplace') send(res, 200, batches.unplace(id));
      else send(res, 201, batches.addCheck(id, await readJson(req)));
      return true;
    }
    const check = CHECK.exec(path);
    if (check) {
      const id = Number(check[1]);
      if (req.method === 'PUT') send(res, 200, batches.editCheck(id, await readJson(req)));
      else if (req.method === 'DELETE') { batches.removeCheck(id); noContent(); }
      else throw notFound();
      return true;
    }
    return false;
  }

  // A 4xx from server/batches.js (BatchError) becomes the API's HttpError.
  return async function batchRoutes(req, res, path, helpers) {
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
