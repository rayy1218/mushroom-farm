// The Business summary's route (spec 2026-11-06-business-summary-design.md 5), called from api.js: GET /api/business/summary.
// server/business.js composes the reply from the modules; this makes the services it reads. Read only: it publishes nothing
// of its own ('business' is not an event); its Costs service's usage warm, when done, publishes 'costs' so the page that
// waited for the energy asks again.

import { createBusiness } from './business.js';
import { createRuns } from './runs.js';
import { createSales } from './sales.js';
import { createCosts } from './costs.js';
import { createInventory } from './inventory.js';
import { localZone } from './usage.js';

// db: the farm database; events: the bus (null in some tests); harvests and batches: api.js's own services (Harvest's figures
// take Batches' dry kg, and its usage warm publishes 'harvest' there). → async (req, res, path, { send, HttpError }) answering
// true when the path is its route; its close() stops the Costs service's warms.
export function createBusinessRoutes({ db, events = null, harvests, batches, now = Date.now, zone = localZone, log = console.error }) {
  const costs = createCosts({ db, now, zone });
  const stopTelling = costs.onChange(() => events?.publish('costs', {}));
  const sales = createSales({ db, now });
  const business = createBusiness({
    costs, sales, inventory: createInventory({ db, now }), batches, runs: createRuns({ db, harvests, batches, sales, costs }), log,
  });

  async function businessRoutes(req, res, path, { send, HttpError }) {
    if (path !== '/api/business/summary') return false;
    if (req.method !== 'GET') throw new HttpError(404, 'Not found');
    send(res, 200, business.summary());
    return true;
  }
  businessRoutes.close = () => { stopTelling(); costs.stop(); };
  return businessRoutes;
}
