// The Business summary (spec 2026-11-06-business-summary-design.md): the month's money, what needs the owner and the runs in
// progress, composed on each read from the modules' own functions: Costs' month view (this month's tiles and monthly items,
// last month's result, the batches with no price), Sales' owed, Inventory's list (below zero, low, use-by), Batches' list
// (blocks ready for a room, the one delivery with no price) and Runs' list (the open runs). No table, no state, no HTTP. A module that fails leaves only its own part
// out (errors[part]); the rest still shows. The server gives the figures; the browser words them (web/business-math.js).

import { addMonths } from './costs-math.js';
import { localZone } from './usage.js';
import { SALES_HASH, INVENTORY_HASH, inventoryItemHash, BATCHES_HASH, batchHash } from '../web/route.js';

// The parts a reply may name in errors: each module read once.
export const PARTS = ['costs', 'sales', 'inventory', 'batches', 'runs'];
// The words of a part that could not be read (the API's own for a server fault: the log has the cause).
export const PART_FAILED = 'Something went wrong';
// A lot's use-by: expired before soon, then the earliest day.
const WORST = { expired: 0, soon: 1 };

// costs, sales, inventory, batches, runs: the modules' services (createCosts, createSales, createInventory, createBatches,
// createRuns); zone: the farm's days (a delivery's month, as Costs reads it); log: where a part's failure is told, its part
// named.
export function createBusiness({ costs, sales, inventory, batches, runs, zone = localZone, log = console.error }) {
  return {
    // GET /api/business/summary: { month, lastMonth, needs, runs, errors } (spec 4).
    summary() {
      const errors = {};
      // A part read on its own: a throw leaves it null and says so in errors, never the whole reply.
      const read = (part, fn) => {
        try {
          return fn();
        } catch (err) {
          log(`Business summary: couldn't read ${part}:`, err);
          errors[part] = PART_FAILED;
          return null;
        }
      };
      const view = read('costs', () => costs.monthView());
      const owed = read('sales', () => sales.view({ days: 7 }).owed);
      const items = read('inventory', () => inventory.list().items);
      const blocks = read('batches', () => batches.list().batches);
      const open = read('runs', () => runs.list().runs.filter((r) => r.endedAt === null));
      const last = view ? view.last12.find((x) => x.month === addMonths(view.month, -1)) ?? null : null;
      return {
        month: view && { month: view.month, today: view.today, pending: view.pending, tiles: view.tiles, repeating: view.repeating },
        lastMonth: last && { month: last.month, income: last.income, costs: last.costs, profit: last.profit, pending: last.pending },
        needs: [...owedNeeds(owed), ...stockNeeds(items), ...blockNeeds(blocks), ...unpricedNeeds(view, blocks, zone)],
        runs: open,
        errors,
      };
    },
  };
}

// (1) Money owed: Sales' owed (every unpaid delivery), the buyers most owed first, and whose sale is the oldest.
function owedNeeds(owed) {
  if (!owed?.count) return [];
  const oldest = owed.buyers.find((b) => b.oldestAt === owed.oldestAt);
  return [{
    kind: 'owed', total: owed.total, count: owed.count, oldestAt: owed.oldestAt, oldestBuyer: oldest?.buyer ?? null,
    buyers: owed.buyers.map((b) => b.buyer), href: SALES_HASH,
  }];
}

// (2) Stock below zero (a purchase not recorded), (3) stock low (at or under its reorder level, not below zero: (2) says
// it), (4) a use-by within 7 days or past, one per item, the expired first, then the earliest. items: Inventory's list
// (archived items left out), by kind then name. One item named: its own page; several: Inventory's list.
function stockNeeds(items) {
  if (!items) return [];
  const below = items.filter((i) => i.qty < 0);
  const low = items.filter((i) => i.low && i.qty >= 0);
  const dated = items.filter((i) => i.useBy?.state).sort((a, b) => WORST[a.useBy.state] - WORST[b.useBy.state] || a.useBy.date.localeCompare(b.useBy.date));
  const hrefOf = (list) => (list.length === 1 ? inventoryItemHash(list[0].id) : INVENTORY_HASH);
  return [
    ...(below.length ? [{ kind: 'below-zero', items: below.map(({ id, name, qty, unit }) => ({ id, name, qty, unit })), href: hrefOf(below) }] : []),
    ...(low.length ? [{ kind: 'low', items: low.map(({ id, name, qty, unit, reorderAt }) => ({ id, name, qty, unit, reorderAt })), href: hrefOf(low) }] : []),
    ...dated.map(({ id, name, unit, useBy }) => ({ kind: 'use-by', id, name, unit, useBy, href: inventoryItemHash(id) })),
  ];
}

// (5) Blocks ready for a room (waiting): their good blocks and crops (in the list's order, newest received first); a batch with
// no good block left out (every block lost: nothing to put in). Blocks being made are not a to-do (their steps are on Batches).
function blockNeeds(batches) {
  if (!batches) return [];
  const list = batches.filter((b) => b.status === 'waiting' && b.good > 0);
  const blocks = list.reduce((s, b) => s + b.good, 0);
  return blocks ? [{ kind: 'blocks', blocks, crops: [...new Set(list.map((b) => b.crop))], href: BATCHES_HASH }] : [];
}

// (6) Blocks with no price: this month's Costs notes of kind 'unpriced-batch', one need for all of them. One note whose
// delivery Batches' list names (a bought batch with no price received this month, the one): batchId and its page; else
// Batches.
function unpricedNeeds(view, batches, zone) {
  const notes = (view?.notes ?? []).filter((n) => n.kind === 'unpriced-batch');
  if (!notes.length) return [];
  const found = notes.length === 1 && batches
    ? batches.filter((b) => b.kind !== 'made' && b.pricePerBlock === null && zone.label(b.receivedAt).slice(0, 7) === view.month) : [];
  const batchId = found.length === 1 ? found[0].id : null;
  return [{
    kind: 'unpriced', notes: notes.map((n) => ({ text: n.text, runId: n.runId ?? null })), batchId,
    href: batchId === null ? BATCHES_HASH : batchHash(batchId),
  }];
}
