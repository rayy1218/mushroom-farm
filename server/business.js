// The Business summary (spec 2026-11-06-business-summary-design.md): the month's money, what needs the owner and the runs in
// progress, composed on each read from the modules' own functions: Costs' month view (this month's tiles, last month's
// result, the batches with no price), Sales' owed, Inventory's list (below zero, low, use-by), Batches' list (blocks waiting
// or being made) and Runs' list (the open runs). No table, no state, no HTTP. A module that fails leaves only its own part
// out (errors[part]); the rest still shows. The server gives the figures; the browser words them (web/business-math.js).

import { addMonths } from './costs-math.js';
import { SALES_HASH, INVENTORY_HASH, inventoryItemHash, BATCHES_HASH } from '../web/route.js';

// The parts a reply may name in errors: each module read once.
export const PARTS = ['costs', 'sales', 'inventory', 'batches', 'runs'];
// The words of a part that could not be read (the API's own for a server fault: the log has the cause).
export const PART_FAILED = 'Something went wrong';
// A lot's use-by: expired before soon, then the earliest day.
const WORST = { expired: 0, soon: 1 };

// costs, sales, inventory, batches, runs: the modules' services (createCosts, createSales, createInventory, createBatches,
// createRuns); log: where a part's failure is told.
export function createBusiness({ costs, sales, inventory, batches, runs, log = console.error }) {
  return {
    // GET /api/business/summary: { month, lastMonth, needs, runs, errors } (spec 4).
    summary() {
      const errors = {};
      // A part read on its own: a throw leaves it null and says so in errors, never the whole reply.
      const read = (part, fn) => {
        try {
          return fn();
        } catch (err) {
          log(err);
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
        month: view && { month: view.month, pending: view.pending, tiles: view.tiles },
        lastMonth: last && { month: last.month, income: last.income, costs: last.costs, profit: last.profit, pending: last.pending },
        needs: [...owedNeeds(owed), ...stockNeeds(items), ...blockNeeds(blocks), ...unpricedNeeds(view)],
        runs: open,
        errors,
      };
    },
  };
}

// (1) Money owed: Sales' owed (every unpaid delivery), the buyers most owed first.
function owedNeeds(owed) {
  if (!owed?.count) return [];
  return [{ kind: 'owed', total: owed.total, count: owed.count, oldestAt: owed.oldestAt, buyers: owed.buyers.map((b) => b.buyer), href: SALES_HASH }];
}

// (2) Stock below zero (a purchase not recorded), (3) stock low (at or under its reorder level, not below zero: (2) says
// it), (4) a use-by within 7 days or past, one per item, the expired first, then the earliest. items: Inventory's list
// (archived items left out), by kind then name.
function stockNeeds(items) {
  if (!items) return [];
  const below = items.filter((i) => i.qty < 0);
  const low = items.filter((i) => i.low && i.qty >= 0);
  const dated = items.filter((i) => i.useBy?.state).sort((a, b) => WORST[a.useBy.state] - WORST[b.useBy.state] || a.useBy.date.localeCompare(b.useBy.date));
  return [
    ...(below.length ? [{ kind: 'below-zero', items: below.map(({ id, name, qty, unit }) => ({ id, name, qty, unit })), href: INVENTORY_HASH }] : []),
    ...(low.length ? [{ kind: 'low', items: low.map(({ id, name, qty, unit, reorderAt }) => ({ id, name, qty, unit, reorderAt })), href: INVENTORY_HASH }] : []),
    ...dated.map(({ id, name, unit, useBy }) => ({ kind: 'use-by', id, name, unit, useBy, href: inventoryItemHash(id) })),
  ];
}

// (5) Blocks ready for a room (waiting) or being made (making), their good blocks and crops; batches with no good block
// left out (every block lost: nothing to put in).
function blockNeeds(batches) {
  if (!batches) return [];
  const group = (status) => {
    const list = batches.filter((b) => b.status === status && b.good > 0);
    return { blocks: list.reduce((s, b) => s + b.good, 0), crops: [...new Set(list.map((b) => b.crop))] };
  };
  const waiting = group('waiting');
  const making = group('making');
  return waiting.blocks || making.blocks ? [{ kind: 'blocks', waiting, making, href: BATCHES_HASH }] : [];
}

// (6) Blocks with no price: this month's Costs notes of kind 'unpriced-batch', one need for all of them.
function unpricedNeeds(view) {
  const notes = (view?.notes ?? []).filter((n) => n.kind === 'unpriced-batch');
  return notes.length ? [{ kind: 'unpriced', notes: notes.map((n) => ({ text: n.text, runId: n.runId ?? null })), href: BATCHES_HASH }] : [];
}
