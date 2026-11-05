// The Run page (spec 2026-11-05-runs-design.md): a run of blocks seen from every module, composed on each read from the
// modules' own functions: Harvest's room view (kg, kg per block, BE, flushes, harvests), Batches' list (the run's batches and
// their block cost), Sales' summary and the run's sale lines, Costs' run figures (income, costs, profit, by kind). No table,
// no state, no HTTP.

import { CROP_KEYS } from '../web/crops.js';
import { readSettings } from './settings.js';

export const LATEST_HARVESTS = 3; // the run page's latest picks (the room's Harvest tab has them all)
const ALL = [-8.64e15, 8.64e15]; // every sale, as Sales' summary reads them

// A refused request: status 400 or 404, field the input it is about (the routes reply { error, field }).
export class RunError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'RunError';
    this.status = status;
    this.field = field;
  }
}

// The crop filter: null or '' for every run, else one of the crop keys.
function cropOf(crop) {
  if (crop === null || crop === undefined || crop === '') return null;
  if (!CROP_KEYS.includes(crop)) throw new RunError(400, 'Pick a crop', 'crop');
  return crop;
}

// db: the farm database; harvests, batches, sales, costs: the modules' services (createHarvests, createBatches, createSales,
// createCosts), the same ones the app's routes use where a module keeps state (Harvest's and Costs' usage warms).
export function createRuns({ db, harvests, batches, sales, costs }) {
  // Harvest's view of each run of these rooms: Map run id → the room view's run (current or past).
  function harvestViews(roomIds) {
    const out = new Map();
    for (const id of new Set(roomIds)) {
      const v = harvests.roomView(id);
      if (!v) continue; // a room gone between the reads
      for (const run of [v.current, ...v.past]) if (run) out.set(run.id, run);
    }
    return out;
  }

  // A run's row: the list's figures. run: db.allRuns()'s; h: Harvest's view of it; c: Costs' (either may be missing for a
  // run whose room is gone: nothing picked, no money).
  const rowOf = (run, h, c) => ({
    id: run.id, roomId: run.roomId, roomName: run.roomName, crops: run.crops, partial: run.partial,
    startedAt: run.startedAt, endedAt: run.endedAt,
    kg: h?.kg ?? 0, perBlock: h?.perBlock ?? null,
    income: c?.income ?? 0, costs: c ? c.costs : null, profit: c ? c.profit : null, profitPerKg: c?.profitPerKg ?? null,
    pending: c?.pending ?? false, incomplete: c?.incomplete ?? false,
  });

  return {
    // GET /api/runs?crop=: { runs: [row] }, the open runs first, then the ended ones, each newest started first.
    list({ crop = null } = {}) {
      const only = cropOf(crop);
      const all = db.allRuns().filter((r) => only === null || r.crops.some((c) => c.crop === only));
      const h = harvestViews(all.filter((r) => r.roomName !== null).map((r) => r.roomId));
      const c = new Map((all.length ? costs.runViews() : []).map((v) => [v.id, v]));
      const rows = all.map((r) => rowOf(r, h.get(r.id), c.get(r.id)));
      return { runs: [...rows.filter((r) => r.endedAt === null), ...rows.filter((r) => r.endedAt !== null)] };
    },

    // GET /api/runs/:id: the row and the run page's parts; 404 for no such run.
    view(id) {
      const found = db.getRunById(id);
      if (!found) throw new RunError(404, 'Run not found');
      const run = { ...found, roomName: db.getRoom(found.roomId)?.name ?? null };
      const h = run.roomName === null ? null : harvestViews([run.roomId]).get(id) ?? null;
      const [c = null] = costs.runViews({ run: id });
      const { batches: list, blockCost } = batches.list({ run: id });
      const { kg, total, byCrop } = sales.summary({ run: id });
      const { electricityPrice, waterPrice } = readSettings(db);
      // newest delivery first, a delivery's lines in the order entered (as Sales shows a delivery)
      const lines = db.salesBetween(...ALL).filter((s) => s.runId === id)
        .sort((x, y) => y.soldAt - x.soldAt || y.deliveryId - x.deliveryId || x.id - y.id).map((s) => ({
        id: s.id, deliveryId: s.deliveryId, soldAt: s.soldAt, buyer: s.buyer, invoiceNo: s.invoiceNo, crop: s.crop, kg: s.kg,
        priceKg: s.priceKg, total: s.total, paidAt: s.paidAt,
      }));
      return {
        ...rowOf(run, h, c),
        kgSold: c?.kgSold ?? 0,
        be: h?.be ?? null, byCrop: h?.byCrop ?? [], flushes: h?.flushes ?? [], missing: h?.missing ?? { dryKg: [], price: [] },
        harvests: (h?.harvests ?? []).slice(0, LATEST_HARVESTS), harvestCount: h?.harvests.length ?? 0,
        batches: list, blockCost,
        sales: { kg, total, byCrop, lines },
        costsByKind: c ? { parts: c.parts, byCategory: c.byCategory, notes: c.notes } : null,
        prices: { electricity: electricityPrice, water: waterPrice }, // a 0 energy or water with a price: nothing recorded yet
      };
    },
  };
}
