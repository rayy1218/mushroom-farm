// The Run page (spec 2026-11-05-runs-design.md): a run of blocks seen from every module, composed on each read from the
// modules' own functions: Harvest's room view (kg, kg per block, BE, flushes, harvests), Batches' list (the run's batches and
// their block cost), the run's sale lines (Costs' sale steps), Costs' run figures (income, costs, profit, by kind). No
// table, no state, no HTTP.

import { CROP_KEYS } from '../web/crops.js';
import { readSettings } from './settings.js';
import { localZone } from './usage.js';
import { addDays } from './task-rules.js';

export const LATEST_HARVESTS = 3; // the run page's latest picks (the room's Harvest tab has them all)
const ALL = [-8.64e15, 8.64e15]; // every sale

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

// db: the farm database; harvests, batches, costs: the modules' services (createHarvests, createBatches, createCosts; the
// sale lines come through Costs' sale steps since Money truth), the same ones the app's routes use where a module keeps state (Harvest's and Costs' usage warms).
export function createRuns({ db, harvests, batches, costs, zone = localZone, onChange = () => {} }) {
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
    id: run.id, roomId: run.roomId, roomName: run.roomName, crops: run.crops, partial: run.partial, blocksInAt: run.blocksInAt ?? null,
    startedAt: run.startedAt, endedAt: run.endedAt,
    kg: h?.kg ?? 0, perBlock: h?.perBlock ?? null,
    income: c?.income ?? 0, costs: c ? c.costs : null, profit: c ? c.profit : null, profitPerKg: c?.profitPerKg ?? null,
    pending: c?.pending ?? false, incomplete: c?.incomplete ?? false,
  });

  // ---- Money truth ---- (spec 2026-11-12-money-truth-design.md 8.2) A partial run's real block-in day (Runs' one write, on
  // Harvest's runs table): a day up to its recorded start, at most BLOCKS_IN_DAYS before it; null stops counting it.
  const BLOCKS_IN_DAYS = 365;
  const dayName = (d) => `${Number(d.slice(8))} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(d.slice(5, 7)) - 1]}`;
  function setBlocksIn(id, body) {
    const run = db.getRunById(id);
    if (!run) throw new RunError(404, 'Run not found');
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new RunError(400, 'Body must be a JSON object');
    if (!run.partial) throw new RunError(409, 'Only a run recorded from the harvest upgrade takes a block-in day');
    const at = body.blocksInAt ?? null;
    if (at !== null) {
      const start = zone.label(run.startedAt);
      const day = Number.isInteger(at) ? zone.label(at) : null;
      if (day === null || day > start || day < addDays(start, -BLOCKS_IN_DAYS)) {
        throw new RunError(400, `Pick a day up to ${dayName(start)}, at most ${BLOCKS_IN_DAYS} days before it`, 'blocksInAt');
      }
    }
    const saved = db.setRunBlocksIn(id, at);
    onChange(saved);
    return saved;
  }
  // ---- end Money truth ----

  return {
    setBlocksIn,

    // GET /api/runs?crop=: { runs: [row] }, the open runs first, then the ended ones, each newest started first.
    // untied: false leaves the sales not tied out (the Summary does not show them; they read every sale).
    list({ crop = null, untied: withUntied = true } = {}) {
      const only = cropOf(crop);
      const all = db.allRuns().filter((r) => only === null || r.crops.some((c) => c.crop === only));
      const h = harvestViews(all.filter((r) => r.roomName !== null).map((r) => r.roomId));
      const c = new Map((all.length ? costs.runViews() : []).map((v) => [v.id, v]));
      const rows = all.map((r) => rowOf(r, h.get(r.id), c.get(r.id)));
      // ---- Money truth ---- the sale lines (of the crop asked for) that reach no run (Costs' sale steps)
      const sorted = [...rows.filter((r) => r.endedAt === null), ...rows.filter((r) => r.endedAt !== null)];
      return withUntied ? { runs: sorted, untied: costs.saleTies({ crop: only }).untied } : { runs: sorted };
    },

    // GET /api/runs/:id: the row and the run page's parts; 404 for no such run.
    view(id) {
      const found = db.getRunById(id);
      if (!found) throw new RunError(404, 'Run not found');
      const run = { ...found, roomName: db.getRoom(found.roomId)?.name ?? null };
      const h = run.roomName === null ? null : harvestViews([run.roomId]).get(id) ?? null;
      const [c = null] = costs.runViews({ run: id });
      const { batches: list, blockCost } = batches.list({ run: id });
      const { electricityPrice, waterPrice } = readSettings(db);
      // ---- Money truth ---- the sale lines that reach this run by Costs' sale steps (its own, its container's that day, the
      // only run growing the crop, or shared by the kg picked), each at its share; tie says how and the whole line
      const { parts } = costs.saleTies({ run: id }); // only the lines that can reach it
      const mine = (s) => parts.get(s.id)?.find((p) => p.runId === id) ?? null;
      // newest delivery first, a delivery's lines in the order entered (as Sales shows a delivery)
      const lines = db.salesBetween(...ALL).filter((s) => mine(s))
        .sort((x, y) => y.soldAt - x.soldAt || y.deliveryId - x.deliveryId || x.id - y.id).map((s) => {
          const p = mine(s);
          return {
            id: s.id, deliveryId: s.deliveryId, soldAt: s.soldAt, buyer: s.buyer, invoiceNo: s.invoiceNo, crop: s.crop, kg: p.kg,
            priceKg: s.priceKg, total: p.total, paidAt: s.paidAt, tie: { how: p.how, share: p.share, kg: s.kg, total: s.total },
          };
        });
      const sum = (key) => Math.round(lines.reduce((a, l) => a + l[key], 0) * 100) / 100;
      const [kg, total] = [sum('kg'), sum('total')];
      const byCrop = [...new Set(lines.map((l) => l.crop))].map((crop) => {
        const own = lines.filter((l) => l.crop === crop);
        return { crop, kg: Math.round(own.reduce((a, l) => a + l.kg, 0) * 100) / 100, total: Math.round(own.reduce((a, l) => a + l.total, 0) * 100) / 100 };
      });
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
