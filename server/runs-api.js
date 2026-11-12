// The Run page's routes (spec 2026-11-05-runs-design.md 5), called from api.js: GET /api/runs?crop= and GET /api/runs/:id;
// PUT /api/runs/:id/blocks-in (Money truth: a partial run's real block-in day).
// server/runs.js composes the run from the modules; this reads the query and turns its errors into the API's. Its one write
// publishes 'harvest' (the runs are Harvest's table; 'runs' is not an event); its Costs service's usage warm, when done, publishes 'costs' so
// a page that waited for the energy asks again.

import { createRuns } from './runs.js';
import { createCosts } from './costs.js';
import { localZone } from './usage.js';

const ONE = /^\/api\/runs\/([1-9][0-9]{0,14})$/;
const BLOCKS_IN = /^\/api\/runs\/([1-9][0-9]{0,14})\/blocks-in$/; // ---- Money truth ----

// db: the farm database; events: the bus (null in some tests); harvests and batches: api.js's own services (Harvest's figures
// take Batches' dry kg, and its usage warm publishes 'harvest' there). → async (req, res, path, { send, HttpError, url })
// answering true when the path is one of its routes; its close() stops the Costs service's warms.
export function createRunRoutes({ db, events = null, harvests, batches, now = Date.now, zone = localZone }) {
  const costs = createCosts({ db, now, zone });
  const stopTelling = costs.onChange(() => events?.publish('costs', {}));
  // ---- Money truth ---- a block-in day saved: the runs are Harvest's table, so its pages (and Costs', Economics') hear 'harvest'
  const runs = createRuns({ db, harvests, batches, costs, zone, onChange: (run) => events?.publish('harvest', { roomId: run.roomId }) });

  async function route(req, res, path, { send, readJson, HttpError, url }) {
    const blocksIn = BLOCKS_IN.exec(path);
    if (blocksIn) { // ---- Money truth ---- PUT /api/runs/:id/blocks-in { blocksInAt }
      if (req.method !== 'PUT') throw new HttpError(404, 'Not found');
      send(res, 200, runs.setBlocksIn(Number(blocksIn[1]), await readJson(req)));
      return true;
    }
    const one = ONE.exec(path);
    if (path !== '/api/runs' && !one) return false;
    if (req.method !== 'GET') throw new HttpError(404, 'Not found');
    send(res, 200, one ? runs.view(Number(one[1])) : runs.list({ crop: url.searchParams.get('crop') }));
    return true;
  }

  // A 4xx from server/runs.js (RunError) or a module it reads becomes the API's HttpError.
  async function runRoutes(req, res, path, helpers) {
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
  runRoutes.close = () => { stopTelling(); costs.stop(); };
  return runRoutes;
}
