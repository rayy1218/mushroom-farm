// Sales (spec 2026-11-05-sales-design.md 2 to 5): deliveries recorded, edited, deleted and marked paid; buyers; the page's
// view, the myGAP sheet's range, the summary Costs reads and the CSV. No HTTP.

import { readCropYield } from './settings.js';
import { localDate, dayStart, addDays, daysBetween } from './task-rules.js';
import { buckets, round } from './harvest-math.js';
import {
  SalesError, deliveryBody, buyerBody, paidBody, deliveriesOf, owedOf, byCropOf, byBuyerOf, summaryOf, csvRows,
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
    // Record a sale: { soldAt, buyerId, invoiceNo?, note?, lines }. → the delivery.
    record(body) {
      const id = db.saveDelivery(checked(body), now());
      tell();
      return delivery(id);
    },

    // Replace a delivery's fields and lines; its paid time stays (a new date after the paid day is refused). → the delivery.
    edit(id, body) {
      const old = existing(id);
      const d = checked(body, { keep: old.buyerId });
      if (old.paidAt !== null && localDate(d.soldAt) > localDate(old.paidAt)) throw new SalesError(400, 'Paid before this date', 'soldAt');
      db.saveDelivery({ ...d, id }, now());
      tell();
      return delivery(id);
    },

    // Delete a delivery and its lines.
    remove(id) {
      existing(id);
      db.deleteDelivery(id);
      tell();
    },

    // { paidAt: ms | null }. → the delivery.
    setPaid(id, body) {
      const old = existing(id);
      db.setDeliveryPaid(id, paidBody(body, { soldAt: old.soldAt, now: now() }));
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
      const harvests = db.harvestsBetween(dayStart(from), dayStart(addDays(to, 1)) - 1);
      const owed = owedOf(deliveries(db.unpaidSales(), rooms, buyerList));
      return {
        from, to, days, deliveries: list,
        totals: {
          kg: round(rows.reduce((s, r) => s + r.kg, 0), 2), total: round(rows.reduce((s, r) => s + r.total, 0), 2),
          harvestedKg: round(harvests.reduce((s, h) => s + h.kg, 0), 2), count: list.length,
        },
        owed, byCrop: byCropOf(rows, harvests, readCropYield(db)), byBuyer: byBuyerOf(list, owed),
        buyerCount: buyerList.filter((b) => !b.archived).length, // none: the page says to add the first
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

    // Change a buyer's fields (a new name is written on its sales too). → the buyer.
    editBuyer(id, body) {
      if (!db.getBuyer(id)) throw new SalesError(404, 'Buyer not found');
      const fields = buyerBody(body, { partial: true });
      if (fields.name !== undefined) nameFree(fields.name, id);
      const b = db.updateBuyer(id, fields);
      tell();
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
