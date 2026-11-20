// Not sold (spec 2026-11-12-data-integrity-design.md 6): a record of kg picked and never sold (spoiled, rejected, a sample,
// eaten by staff, dried, given away) that closes the unsold balance; recorded by the owner or a worker, edited, voided and
// restored by the owner, undone within its minute by its person. Every write logs its change and tells (Sales' event). The
// farm's unsold balance now. No HTTP.

import { CROP_KEYS } from '../web/crops.js';
import { NOT_SOLD_REASONS } from './db.js';
import { readCropYield } from './settings.js';
import { localDate, dayStart, addDays } from './task-rules.js';
import { checkWorker, TaskError } from './tasks.js';
import { askOrThrow, confirmedOf } from './asks.js';
import { record as logChange, reasonOf, undoAllowed, APP } from './changes.js';
import { notSoldAsks, cropBalance } from './integrity-math.js';
import { unsoldBalance, unsoldOf } from './unsold-math.js';

export const NOT_SOLD_DAYS = [7, 30, 90, 365];
const FIRST_MS = Date.UTC(2020, 0, 1) - 8 * 3_600_000; // 1 Jan 2020 at the farm
const ALL = [-8.64e15, 8.64e15];
const MAX_KG = 10_000;

export class NotSoldError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'NotSoldError';
    this.status = status;
    this.field = field;
  }
}

// The farm's unsold balance on `today` (a farm date): unsold-math's, from every pick, sale line and Not sold record not
// voided. without: a Not sold record left out (an edit's own).
export function farmUnsold(db, today, { without = null } = {}) {
  const picks = db.harvestsBetween(...ALL).map((h) => ({ crop: h.crop, kg: h.kg, date: localDate(h.pickedAt) }));
  const sales = db.salesBetween(...ALL).map((s) => ({ crop: s.crop, kg: s.kg, date: localDate(s.soldAt), at: s.soldAt }));
  const notSold = db.liveNotSold().filter((n) => n.id !== without).map((n) => ({ crop: n.crop, kg: n.kg, date: localDate(n.at), at: n.at }));
  return unsoldBalance({ picks, sales, notSold }, readCropYield(db), today);
}

export function createNotSold({ db, now = Date.now, log = console.error }) {
  const listeners = new Set();
  function tell() {
    for (const fn of [...listeners]) {
      try { fn(); } catch (err) { log(err); }
    }
  }
  const bodyOf = (body) => {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new NotSoldError(400, 'Body must be a JSON object');
    return body;
  };
  function recordOf(id) {
    const r = Number.isInteger(id) ? db.getNotSold(id) : null;
    if (!r) throw new NotSoldError(404, 'Record not found');
    return r;
  }
  const workerOf = (v) => {
    try {
      return checkWorker(db, v);
    } catch (err) {
      if (err instanceof TaskError) throw new NotSoldError(err.status, err.message === 'Pick who did it' ? 'Pick who recorded it' : err.message, 'worker');
      throw err;
    }
  };

  // A record's fields from a body (old: the record an edit changes; a field left out keeps its value).
  function fieldsOf(body, old = null) {
    const b = bodyOf(body);
    const pick = (k) => (b[k] !== undefined ? b[k] : old?.[k]);
    const t = now();
    const at = pick('at') ?? t;
    if (!Number.isSafeInteger(at) || at < FIRST_MS || at > t + 60_000) throw new NotSoldError(400, 'Pick a day from 2020 to today', 'at');
    const crop = pick('crop');
    if (!CROP_KEYS.includes(crop)) throw new NotSoldError(400, 'Pick a crop', 'crop');
    const raw = pick('kg');
    const kg = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw * 100) / 100 : NaN;
    if (!(kg > 0 && kg <= MAX_KG)) throw new NotSoldError(400, 'kg must be a number over 0 up to 10,000', 'kg');
    const reason = pick('reason');
    if (!NOT_SOLD_REASONS.includes(reason)) throw new NotSoldError(400, 'Pick why it was not sold', 'reason');
    const roomId = pick('roomId') ?? null;
    if (roomId !== null && !(Number.isInteger(roomId) && db.getRoom(roomId))) throw new NotSoldError(400, 'That room no longer exists', 'roomId');
    const buyerId = reason === 'rejected' ? pick('buyerId') ?? null : null;
    if (buyerId !== null && !(Number.isInteger(buyerId) && db.getBuyer(buyerId))) throw new NotSoldError(400, 'Pick a buyer', 'buyerId');
    const text = pick('note');
    if (text !== null && text !== undefined && typeof text !== 'string') throw new NotSoldError(400, 'The note must be text', 'note');
    const note = typeof text === 'string' && text.trim() ? text.trim() : null;
    if (note && note.length > 200) throw new NotSoldError(400, 'A note is at most 200 characters', 'note');
    const worker = old && b.worker === undefined ? old.worker : workerOf(b.worker);
    return { at, crop, kg, reason, roomId, runId: roomId === null ? null : db.runAt(roomId, at), buyerId, note, worker };
  }

  // The asks of a record (spec 5.2): a duplicate, more than the crop's unsold kg, the crop's balance over. self: an edit's own.
  function asksOf(f, self = null) {
    const today = localDate(now());
    const unsold = unsoldOf(farmUnsold(db, today, { without: self }), f.crop);
    const others = db.liveNotSold().filter((n) => n.id !== self);
    const date = localDate(f.at);
    const balance = cropBalance({
      picks: db.cropHarvestsBetween(f.crop, ...ALL),
      sales: db.cropSales(f.crop).map((s) => ({ kg: s.kg, soldAt: s.soldAt })),
      notSold: others.filter((n) => n.crop === f.crop),
    }, date);
    return notSoldAsks(f, others, { unsold, balance: balance.firstAt === null ? { firstAt: null, picked: 0, sold: 0, notSold: 0 } : balance });
  }
  // A record as the replies give it (roomName, buyer, voided, edits).
  function viewOf(r, edits = null) {
    return {
      id: r.id, at: r.at, crop: r.crop, kg: r.kg, reason: r.reason, roomId: r.roomId,
      roomName: r.roomId === null ? null : db.getRoom(r.roomId)?.name ?? null, runId: r.runId, buyerId: r.buyerId,
      buyer: r.buyerId === null ? null : db.getBuyer(r.buyerId)?.name ?? null, note: r.note, worker: r.worker, voided: r.voided,
      edits: (edits ?? db.editCounts('not-sold')).get(r.id) ?? 0,
    };
  }
  const snapshotOf = (r) => {
    const { id, voided, edits, ...rest } = viewOf(r, new Map());
    return rest;
  };
  const write = (who, entry, fn) => {
    const out = db.transaction(() => {
      const r = fn();
      logChange(db, who, now(), entry(r));
      return r;
    });
    tell();
    return viewOf(out);
  };

  return {
    // { from, to, days, records: [view] } of a period ending today, voided ones too, newest first.
    list({ days = 30 } = {}) {
      if (!NOT_SOLD_DAYS.includes(days)) throw new NotSoldError(400, 'days must be 7, 30, 90 or 365', 'days');
      const to = localDate(now());
      const from = addDays(to, -(days - 1));
      const edits = db.editCounts('not-sold');
      const records = db.notSoldBetween(dayStart(from), dayStart(addDays(to, 1)) - 1).toReversed().map((r) => viewOf(r, edits));
      return { from, to, days, records };
    },

    // The farm's unsold balance today (spec 6.2).
    unsold() {
      return farmUnsold(db, localDate(now()));
    },

    record(body, who = APP) {
      const f = fieldsOf(body);
      askOrThrow(asksOf(f), confirmedOf(body));
      return write(who, (r) => ({ kind: 'not-sold', rowId: r.id, action: 'add', after: snapshotOf(r) }), () => db.insertNotSold(f, now()));
    },

    edit(id, body, who = APP) {
      const old = recordOf(id);
      if (old.voided) throw new NotSoldError(409, 'Restore it first');
      const f = fieldsOf(body, old);
      askOrThrow(asksOf(f, id), confirmedOf(body));
      return write(who, (r) => ({ kind: 'not-sold', rowId: id, action: 'edit', before: snapshotOf(old), after: snapshotOf(r) }), () => db.updateNotSold(id, f));
    },

    // Undo (4.3): within 60 s of its record, by the same person; else 409.
    remove(id, who = APP) {
      const old = recordOf(id);
      if (!undoAllowed(db, 'not-sold', id, who, now())) throw new NotSoldError(409, 'Void it instead: a money record is kept.');
      db.transaction(() => {
        db.deleteNotSold(id);
        logChange(db, who, now(), { kind: 'not-sold', rowId: id, action: 'undo', before: snapshotOf(old) });
      });
      tell();
    },

    voidNotSold(id, body, who = APP) {
      const old = recordOf(id);
      if (old.voided) throw new NotSoldError(409, 'This record is voided already');
      const reason = reasonOf(body, { words: 'Say why you void it', Err: NotSoldError });
      return write(who, () => ({ kind: 'not-sold', rowId: id, action: 'void', before: snapshotOf(old), reason }), () => {
        db.voidRow('not_sold', id, { at: now(), by: who.name, reason });
        return db.getNotSold(id);
      });
    },

    restoreNotSold(id, body, who = APP) {
      const old = recordOf(id);
      if (!old.voided) throw new NotSoldError(409, 'This record is not voided');
      const reason = reasonOf(body ?? {}, { required: false, Err: NotSoldError });
      return write(who, (r) => ({ kind: 'not-sold', rowId: id, action: 'restore', before: snapshotOf(r), reason }), () => {
        db.restoreRow('not_sold', id);
        return db.getNotSold(id);
      });
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
