// Sales (spec 2026-11-05-sales-design.md 2 to 5): deliveries recorded, edited, deleted and marked paid; buyers; the page's
// view, the myGAP sheet's range, the summary Costs reads and the CSV. No HTTP.

import { readCropYield } from './settings.js';
import { localDate, dayStart, addDays, daysBetween } from './task-rules.js';
import { buckets } from './harvest-math.js';
import { askOrThrow, confirmedOf } from './asks.js';
import { record as logChange, reasonOf, APP } from './changes.js';
import { saleDuplicateAsks, salePriceAsks, saleBalanceAsks, cropBalance, DUPLICATE_MS } from './integrity-math.js';
import { farmUnsold } from './not-sold.js';
import { closedAsks, askClosed } from './closes.js';
import {
  SalesError, deliveryBody, buyerBody, paidBody, deliveriesOf, owedOf, byCropOf, byBuyerOf, summaryOf, csvRows, round2,
} from './sales-math.js';

export const RANGES = [7, 30, 90, 365];
const MAX_RANGE_DAYS = 400;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALL = [-8.64e15, 8.64e15];

// A farm date (YYYY-MM-DD) that is a real day, else a 400 on field.
function dateOf(v, field) {
  const ms = typeof v === 'string' && DATE.test(v) ? dayStart(v) : NaN; // '2026-13-01' parses as NaN
  if (!Number.isFinite(ms) || localDate(ms) !== v) throw new SalesError(400, 'Give a date as YYYY-MM-DD', field);
  return v;
}

// db: the farm database; now injectable. log: a listener that throws.
export function createSales({ db, now = Date.now, log = console.error }) {
  const listeners = new Set();

  // Calls every listener; one that throws is logged and the rest still run.
  function tell() {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch (err) {
        log(err);
      }
    }
  }

  // The rows' deliveries with their rooms', runs' and buyers' words (rooms and buyers may be passed when already read).
  function deliveries(rows, rooms = new Map(db.listRooms().map((r) => [r.id, r])), buyerList = db.listBuyers()) {
    const runs = new Map();
    for (const r of rows) if (r.runId !== null && !runs.has(r.runId)) runs.set(r.runId, db.getRunById(r.runId));
    const buyers = new Map(buyerList.map((b) => [b.id, b]));
    return deliveriesOf(rows, { rooms, runs, buyers });
  }

  // One delivery by its id, or null.
  function delivery(id) {
    const rows = db.deliveryLines(id);
    return rows.length ? deliveries(rows)[0] : null;
  }

  // The delivery's first row, else a 404.
  function existing(id) {
    const rows = db.deliveryLines(id);
    if (!rows.length) throw new SalesError(404, 'Sale not found');
    return rows[0];
  }

  // ---- Data integrity (spec 2026-11-12-data-integrity-design.md 3 to 5) ----
  // A delivery as its change entries keep it: what the owner sees of it, with the names it had then.
  function snapshot(id) {
    const d = delivery(id);
    return {
      soldAt: d.soldAt, buyerId: d.buyerId, buyer: d.buyer, invoiceNo: d.invoiceNo, note: d.note, paidAt: d.paidAt,
      lines: d.lines.map((l) => ({ crop: l.crop, kg: l.kg, priceKg: l.priceKg, total: l.total, roomId: l.roomId, roomName: l.roomName })),
    };
  }
  const PAID_LOCK = 'This sale is paid. Mark it unpaid first, with a reason.';
  const notVoided = (row) => {
    if (row.voidedAt !== null) throw new SalesError(409, 'Restore it first');
  };
  // A crop's balance on a farm day without the delivery `self` (spec 5.3).
  function balanceOf(self) {
    const notSold = db.liveNotSold();
    return (crop, date) => cropBalance({
      picks: db.cropHarvestsBetween(crop, -8.64e15, 8.64e15),
      sales: db.cropSales(crop).filter((r) => r.deliveryId !== self).map((r) => ({ kg: r.kg, soldAt: r.soldAt })),
      notSold: notSold.filter((n) => n.crop === crop),
    }, date);
  }
  // The asks of a checked delivery (5.2): a duplicate of the buyer's deliveries near it, an unlikely price or kg, the crops'
  // balances. self: the delivery an edit changes (left out).
  function asksOf(d, self = null) {
    const t = now();
    const day = localDate(d.soldAt);
    const near = deliveries(db.salesBetween(dayStart(day) - DUPLICATE_MS, dayStart(addDays(day, 1)) + DUPLICATE_MS))
      .filter((o) => o.buyerId === d.buyerId && o.id !== self);
    const created = new Map(near.map((o) => [o.id, db.deliveryLines(o.id)[0].createdAt]));
    return [
      ...saleDuplicateAsks(d, near.map((o) => ({ ...o, createdAt: created.get(o.id) })), t),
      ...salePriceAsks(d.lines, readCropYield(db)),
      // a farm that records no harvests in the app is not asked about its balances (every sale would be "before a pick")
      ...(db.anyHarvest() ? saleBalanceAsks(d, balanceOf(self)) : []),
    ];
  }

  // A body checked against the database: the buyer exists and is active (or is the sale's own: keep), the rooms exist;
  // each line's run is the room's run open at the sale.
  function checked(body, { keep = null } = {}) {
    const d = deliveryBody(body, { now: now() });
    const buyer = db.getBuyer(d.buyerId);
    if (!buyer) throw new SalesError(400, 'Pick a buyer', 'buyerId');
    if (buyer.archived && buyer.id !== keep) throw new SalesError(400, 'This buyer is archived', 'buyerId');
    const lines = d.lines.map((l, i) => {
      if (l.roomId !== null && !db.getRoom(l.roomId)) throw new SalesError(400, 'That room no longer exists', `lines.${i}.roomId`);
      return { ...l, runId: l.roomId === null ? null : db.runAt(l.roomId, d.soldAt) };
    });
    return { ...d, buyer: buyer.name, lines };
  }

  // A name not used by another buyer (without regard to case), else 409.
  function nameFree(name, id = null) {
    const taken = db.listBuyers().some((b) => b.id !== id && b.name.toLowerCase() === name.toLowerCase());
    if (taken) throw new SalesError(409, 'A buyer with this name exists', 'name');
  }

  // The farm days of a period: one of RANGES, ending today (the Harvest page's ranges).
  function period(days) {
    if (!RANGES.includes(days)) throw new SalesError(400, 'days must be 7, 30, 90 or 365', 'days');
    const { from, to } = buckets([], { days, to: now() });
    return { from, to };
  }

  // The sale rows from one farm day to another, inclusive.
  const rowsBetween = (from, to) => db.salesBetween(dayStart(from), dayStart(addDays(to, 1)) - 1);

  // A buyer with its deliveries' count and what it owes.
  function buyerView(b, sales, owed) {
    return { ...b, sales, owed };
  }

  return {
    // Record a sale: { soldAt, buyerId, invoiceNo?, note?, lines, confirmed? }, by `who` (the signed-in person). Asks first
    // (Data integrity 5). → the delivery.
    record(body, who = APP) {
      const d = checked(body);
      askOrThrow([...asksOf(d), ...closedAsks(db, [localDate(d.soldAt)], 'soldAt')], confirmedOf(body));
      const at = now();
      const id = db.transaction(() => {
        const made = db.saveDelivery(d, at);
        logChange(db, who, at, { kind: 'sale', rowId: made, action: 'add', after: snapshot(made) });
        return made;
      });
      tell();
      return delivery(id);
    },

    // Replace a delivery's fields and lines; its paid time stays (a new date after the paid day is refused). A paid or a
    // voided delivery is not edited (Data integrity 4). → the delivery.
    edit(id, body, who = APP) {
      const old = existing(id);
      notVoided(old);
      if (old.paidAt !== null) throw new SalesError(409, PAID_LOCK, 'paidAt');
      const d = checked(body, { keep: old.buyerId });
      // a reference or a note alone moves no figure
      const was = db.deliveryLines(id);
      const same = localDate(d.soldAt) === localDate(old.soldAt) && was.length === d.lines.length
        && d.lines.every((l) => was.some((w) => w.crop === l.crop && w.kg === l.kg && w.total === l.total && w.roomId === l.roomId));
      askOrThrow([...asksOf(d, id), ...(same ? [] : closedAsks(db, [localDate(d.soldAt), localDate(old.soldAt)], 'soldAt'))], confirmedOf(body));
      const at = now();
      db.transaction(() => {
        const before = snapshot(id);
        db.saveDelivery({ ...d, id }, at);
        logChange(db, who, at, { kind: 'sale', rowId: id, action: 'edit', before, after: snapshot(id) });
      });
      tell();
      return delivery(id);
    },

    // A sale is never deleted: voided (Data integrity 4.3).
    remove(id) {
      existing(id);
      throw new SalesError(409, 'Void it instead: a money record is kept.');
    },

    // { paidAt: ms | null, reason? }: Mark unpaid needs a reason. → the delivery.
    setPaid(id, body, who = APP) {
      const old = existing(id);
      notVoided(old);
      const paidAt = paidBody(body, { soldAt: old.soldAt, now: now() });
      const reason = paidAt === null && old.paidAt !== null
        ? reasonOf(body, { words: 'Say why it is no longer paid', Err: SalesError }) : null;
      const at = now();
      db.transaction(() => {
        db.setDeliveryPaid(id, paidAt);
        if (paidAt !== null) logChange(db, who, at, { kind: 'sale', rowId: id, action: 'paid', before: { paidAt: old.paidAt }, after: { paidAt } });
        else if (old.paidAt !== null) logChange(db, who, at, { kind: 'sale', rowId: id, action: 'unpaid', before: { paidAt: old.paidAt }, reason });
      });
      tell();
      return delivery(id);
    },

    // Void a delivery { reason } (not a paid one: Mark unpaid first). → the delivery.
    voidSale(id, body, who = APP) {
      const old = existing(id);
      notVoided(old);
      if (old.paidAt !== null) throw new SalesError(409, PAID_LOCK, 'paidAt');
      const reason = reasonOf(body, { words: 'Say why you void it', Err: SalesError });
      askClosed(db, [localDate(old.soldAt)], body, 'soldAt');
      const at = now();
      db.transaction(() => {
        const before = snapshot(id);
        db.voidRow('sales', id, { at, by: who.name, reason });
        logChange(db, who, at, { kind: 'sale', rowId: id, action: 'void', before, reason });
      });
      tell();
      return delivery(id);
    },

    // Restore a voided delivery { reason? }. → the delivery.
    restoreSale(id, body, who = APP) {
      const old = existing(id);
      if (old.voidedAt === null) throw new SalesError(409, 'This sale is not voided');
      const reason = reasonOf(body ?? {}, { required: false, Err: SalesError });
      askClosed(db, [localDate(old.soldAt)], body, 'soldAt');
      const at = now();
      db.transaction(() => {
        db.restoreRow('sales', id);
        logChange(db, who, at, { kind: 'sale', rowId: id, action: 'restore', before: snapshot(id), reason });
      });
      tell();
      return delivery(id);
    },

    // The Sales page (spec 5): { from, to, days, deliveries, totals: { kg, total, harvestedKg, count }, owed, byCrop, byBuyer,
    // buyerCount }.
    view({ days = 30 } = {}) {
      const { from, to } = period(days);
      const rows = rowsBetween(from, to);
      const rooms = new Map(db.listRooms().map((r) => [r.id, r]));
      const buyerList = db.listBuyers();
      const list = deliveries(rows, rooms, buyerList);
      // the Sales card's list: the period's deliveries, voided ones too (struck), with how often each was changed
      const edits = db.editCounts('sale');
      const shown = deliveries(db.salesBetweenAll(dayStart(from), dayStart(addDays(to, 1)) - 1), rooms, buyerList)
        .map((d) => ({ ...d, edits: edits.get(d.id) ?? 0 }));
      const harvests = db.harvestsBetween(dayStart(from), dayStart(addDays(to, 1)) - 1);
      const owed = owedOf(deliveries(db.unpaidSales(), rooms, buyerList));
      return {
        from, to, days, deliveries: shown,
        totals: {
          kg: round2(rows.reduce((s, r) => s + r.kg, 0)), total: round2(rows.reduce((s, r) => s + r.total, 0)),
          harvestedKg: round2(harvests.reduce((s, h) => s + h.kg, 0)), count: list.length,
        },
        owed, byCrop: byCropOf(rows, harvests, readCropYield(db)), byBuyer: byBuyerOf(list, owed),
        buyerCount: buyerList.filter((b) => !b.archived).length, // none: the page says to add the first
        unsold: farmUnsold(db, localDate(now())), // ---- Data integrity ---- still to sell and past its keeping days, per crop
      };
    },

    // The myGAP sheet's sale lines from one farm day to another (at most 400 days), oldest first.
    range({ from, to }) {
      dateOf(from, 'from');
      dateOf(to, 'to');
      if (from > to) throw new SalesError(400, 'from must be on or before to', 'from');
      if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw new SalesError(400, 'At most 400 days', 'from');
      const lines = [...deliveries(rowsBetween(from, to))].reverse().flatMap((d) => d.lines.map((l) => ({
        date: localDate(d.soldAt), soldAt: d.soldAt, crop: l.crop, roomName: l.roomName, runStartedAt: l.runStartedAt,
        kg: l.kg, priceKg: l.priceKg, total: l.total, invoiceNo: d.invoiceNo, buyer: d.buyer,
      })));
      return { from, to, lines };
    },

    // Costs' summary (contract 5): from and to optional farm days (none: all time), run optional.
    summary({ from = null, to = null, run = null } = {}) {
      from = from === '' ? null : from;
      to = to === '' ? null : to;
      const start = from === null ? ALL[0] : dayStart(dateOf(from, 'from'));
      const end = to === null ? ALL[1] : dayStart(addDays(dateOf(to, 'to'), 1)) - 1;
      if (from !== null && to !== null && from > to) throw new SalesError(400, 'from must be on or before to', 'from');
      const rows = db.salesBetween(start, end).filter((r) => run === null || r.runId === run);
      return summaryOf(rows);
    },

    // The period's sale lines as CSV: { name: 'sales <from>–<to>.csv', text } (the route adds the BOM).
    csv(days = 30) {
      const { from, to } = period(days);
      return { name: `sales ${from}–${to}.csv`, text: `${csvRows(deliveries(rowsBetween(from, to))).join('\r\n')}\r\n` };
    },

    // The buyers A–Z with their deliveries' count and what they owe.
    buyers() {
      const owed = new Map(owedOf(deliveries(db.unpaidSales())).buyers.map((o) => [o.buyerId, o.total]));
      const counts = db.buyerSaleCounts();
      return db.listBuyers().map((b) => buyerView(b, counts.get(b.id) ?? 0, owed.get(b.id) ?? 0));
    },

    // Add a buyer: { name, phone?, note?, prices? }. → the buyer.
    addBuyer(body) {
      const fields = buyerBody(body);
      nameFree(fields.name);
      const b = db.insertBuyer(fields, now());
      tell();
      return buyerView(b, 0, 0);
    },

    // Change a buyer's fields (a new name is written on its sales too; no fields: no write). → the buyer.
    editBuyer(id, body) {
      if (!db.getBuyer(id)) throw new SalesError(404, 'Buyer not found');
      const fields = buyerBody(body, { partial: true });
      if (fields.name !== undefined) nameFree(fields.name, id);
      const changed = Object.keys(fields).length > 0; // {}: nothing to write, no one told
      const b = changed ? db.updateBuyer(id, fields) : db.getBuyer(id);
      if (changed) tell();
      const owed = owedOf(deliveries(db.unpaidSales().filter((r) => r.buyerId === id))).total;
      return buyerView(b, db.buyerSaleCount(id), owed);
    },

    // Delete a buyer without sales (one with sales is archived instead).
    removeBuyer(id) {
      if (!db.getBuyer(id)) throw new SalesError(404, 'Buyer not found');
      if (db.buyerSaleCount(id) > 0) throw new SalesError(409, 'Archive this buyer instead: it has sales');
      db.deleteBuyer(id);
      tell();
    },

    // fn() after any sale or buyer is written; → a function that stops it.
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
