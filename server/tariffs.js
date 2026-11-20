// The dated electricity tariff (spec 2026-11-12-data-integrity-design.md 8.1): each rate holds from its day to the day before
// the next; a day's price is its rate's energy rate + AFA (RM per kWh). The first rate is from 2020 (made at the upgrade at
// Settings' price), so every day has one. Settings' price is today's; setting it adds a rate from today. Add, edit, void and
// restore log their change. No HTTP.

import { addDays, localDate } from './task-rules.js';
import { FIRST_TARIFF_DATE } from './db.js';
import { record as logChange, reasonOf, APP } from './changes.js';

export const MAX_RATE = 10;
export const MAX_AFA = 1;
export const AHEAD_DAYS = 62; // a rate may start up to this far ahead (next month's AFA, once TNB says it)
const round4 = (n) => Math.round(n * 10_000) / 10_000;
import { liveRates, priceOn } from './tariff-math.js';

export { liveRates, priceOn };

export class TariffError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'TariffError';
    this.status = status;
    this.field = field;
  }
}

const realDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

// The farm's tariff now, ready for priceOn (null when the database has none: an older one, a test's fixture).
export function tariffOf(db) {
  if (typeof db.listTariffs !== 'function') return null;
  const rates = liveRates(db.listTariffs());
  return rates.length ? rates : null;
}

// A rate from `today` at `price` (Settings' price set): today's rate edited when one starts today (its AFA kept, its rate
// what makes the day's price the one typed), else a new one; today's price already that: nothing written. → the rate.
export function setRateFrom(db, today, price, { who = APP, now = Date.now() } = {}) {
  const rates = liveRates(db.listTariffs());
  if (rates.length && Math.round(priceOn(rates, today) * 10_000) === Math.round(price * 10_000)) return rates.findLast((r) => r.from <= today);
  const same = db.listTariffs().find((r) => !r.voided && r.from === today);
  return db.transaction(() => {
    if (same) {
      const rate = Math.round((price - same.afa) * 10_000) / 10_000;
      const after = db.updateTariff(same.id, { from: same.from, rate, afa: same.afa, note: same.note });
      logChange(db, who, now, { kind: 'tariff', rowId: same.id, action: 'edit', before: snapshot(same), after: snapshot(after) });
      return after;
    }
    const made = db.insertTariff({ from: today, rate: price, afa: 0, note: 'From Settings' }, now);
    logChange(db, who, now, { kind: 'tariff', rowId: made.id, action: 'add', after: snapshot(made) });
    return made;
  });
}

const snapshot = (r) => ({ from: r.from, rate: r.rate, afa: r.afa, note: r.note });

// The tariff's store: list, add, edit, void, restore. onWrite(): after every write (Costs and Harvest tell the pages).
// beforeWrite(days: { from, to }, body): Costs' closed-month ask (Data integrity 8.3), given the days a write reprices.
export function createTariffs({ db, now = Date.now, beforeWrite = () => {} }) {
  const today = () => localDate(now());
  const listeners = new Set();
  const tell = () => { for (const fn of [...listeners]) fn(); };
  function rateOf(id) {
    const r = Number.isInteger(id) ? db.getTariff(id) : null;
    if (!r) throw new TariffError(404, 'Rate not found');
    return r;
  }
  const isFirst = (r) => r.from === FIRST_TARIFF_DATE && !liveRates(db.listTariffs()).some((x) => x.from < r.from);
  function fieldsOf(body, old = null) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new TariffError(400, 'Body must be a JSON object');
    const pick = (k) => (body[k] !== undefined ? body[k] : old?.[k]);
    const from = pick('from');
    const latest = addDays(today(), AHEAD_DAYS);
    if (!realDate(from) || from < FIRST_TARIFF_DATE || from > latest) throw new TariffError(400, 'Pick the first day of the rate, from 2020 to two months ahead', 'from');
    if (old && isFirst(old) && from !== old.from) throw new TariffError(400, 'The first rate holds from 2020: add a rate from a day instead', 'from');
    const num = (k, min, max, words) => {
      const v = pick(k) ?? (k === 'afa' ? 0 : undefined);
      if (!(typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max)) throw new TariffError(400, words, k);
      return round4(v);
    };
    const rate = num('rate', 0, MAX_RATE, 'The rate must be RM 0 to 10 a kWh');
    const afa = num('afa', -MAX_AFA, MAX_AFA, 'The AFA must be −RM 1 to RM 1 a kWh');
    const text = pick('note') ?? '';
    if (typeof text !== 'string' || text.trim().length > 200) throw new TariffError(400, 'A note is at most 200 characters', 'note');
    const taken = db.listTariffs().find((r) => !r.voided && r.from === from && r.id !== old?.id);
    if (taken) throw new TariffError(409, 'A rate starts on that day: edit it', 'from');
    return { from, rate, afa, note: text.trim() };
  }
  // The days a rate's change reprices: from its day (the earlier of before and after) to the day before the next rate.
  function daysOf(from, self = null) {
    const next = liveRates(db.listTariffs()).find((r) => r.from > from && r.id !== self);
    return { from, to: next ? addDays(next.from, -1) : today() };
  }
  const view = (r, edits = db.editCounts('tariff')) => {
    const live = liveRates(db.listTariffs()).find((x) => x.id === r.id);
    return { ...r, to: live?.to ?? null, price: round4(r.rate + r.afa), voided: r.voided, first: live ? isFirst(r) : false, edits: edits.get(r.id) ?? 0 };
  };
  const write = (who, entry, fn) => {
    const out = db.transaction(() => {
      const r = fn();
      logChange(db, who, now(), entry(r));
      return r;
    });
    tell();
    return view(out);
  };

  return {
    // Every rate, newest first, voided ones too: { tariffs: [{ id, from, to, rate, afa, price, note, voided, first, edits }], today }.
    list() {
      const edits = db.editCounts('tariff');
      return { tariffs: db.listTariffs().toReversed().map((r) => view(r, edits)), today: today(), price: priceOn(liveRates(db.listTariffs()), today()) };
    },
    add(body, who = APP) {
      const f = fieldsOf(body);
      beforeWrite(daysOf(f.from), body);
      return write(who, (r) => ({ kind: 'tariff', rowId: r.id, action: 'add', after: snapshot(r) }), () => db.insertTariff(f, now()));
    },
    edit(id, body, who = APP) {
      const old = rateOf(id);
      if (old.voided) throw new TariffError(409, 'Restore it first');
      const f = fieldsOf(body, old);
      const from = f.from < old.from ? f.from : old.from;
      beforeWrite(daysOf(from, id), body);
      return write(who, (r) => ({ kind: 'tariff', rowId: id, action: 'edit', before: snapshot(old), after: snapshot(r) }), () => db.updateTariff(id, f));
    },
    voidRate(id, body, who = APP) {
      const old = rateOf(id);
      if (old.voided) throw new TariffError(409, 'This rate is voided already');
      if (isFirst(old)) throw new TariffError(409, 'The first rate stays: edit it');
      const reason = reasonOf(body, { words: 'Say why you void it', Err: TariffError });
      beforeWrite(daysOf(old.from, id), body);
      return write(who, () => ({ kind: 'tariff', rowId: id, action: 'void', before: snapshot(old), reason }), () => {
        db.voidRow('tariffs', id, { at: now(), by: who.name, reason });
        return db.getTariff(id);
      });
    },
    restoreRate(id, body, who = APP) {
      const old = rateOf(id);
      if (!old.voided) throw new TariffError(409, 'This rate is not voided');
      if (db.listTariffs().some((r) => !r.voided && r.from === old.from)) throw new TariffError(409, 'A rate starts on that day: edit it', 'from');
      const reason = reasonOf(body ?? {}, { required: false, Err: TariffError });
      beforeWrite(daysOf(old.from, id), body);
      return write(who, (r) => ({ kind: 'tariff', rowId: id, action: 'restore', before: snapshot(r), reason }), () => {
        db.restoreRow('tariffs', id);
        return db.getTariff(id);
      });
    },
    remove(id) {
      rateOf(id);
      throw new TariffError(409, 'Void it instead: a money record is kept.');
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

