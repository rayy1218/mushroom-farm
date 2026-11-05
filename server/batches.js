// Batches (spec 2026-11-05-batches-design.md 3 and 6): receive bought blocks, put them into a room's open run (a part split
// off when fewer go in) and take them out, contamination checks, the views, the CSV, and a run's dry kg for Harvest's BE
// (3.2). Every write keeps Inventory's stock moves in step (3.1) when Inventory's tables exist. No HTTP.

import { CROP_KEYS, cropShortName } from '../web/crops.js';
import { localDate, dayStart, addDays } from './task-rules.js';
import { checkWorker, TaskError } from './tasks.js';
import { cell } from './csv.js';
import { goodOf, dryKgOf, runDryKg, blockCost, statusOf, runBlocksOf, movesOf } from './batches-math.js';

export const MAX_BLOCKS = 100_000;
export const CAUSES = ['green', 'black', 'bacterial', 'pests', 'other'];
const STATUSES = ['waiting', 'placed', 'past'];
const MAX_TEXT = 80;
const MAX_NOTE = 500;
const EARLIEST = Date.UTC(2000, 0, 1);
// Edited on any row of a delivery, written to all of them (spec 2.1); a part copies these and the making columns.
const SHARED = ['crop', 'supplier', 'receivedAt', 'pricePerBlock', 'spawnBatch', 'strain', 'deliveryRef', 'inoculatedAt', 'blockKg', 'waterPct'];
const COPIED = [...SHARED, 'kind', 'recipeId', 'mixedAt', 'incubation', 'incubatedFrom', 'incubatedTo'];
const CSV_HEAD = ['received', 'crop', 'kind', 'supplier', 'strain', 'spawn batch', 'delivery note', 'blocks', 'lost', 'price per block', 'room',
  'run started', 'placed', 'block kg', 'water %', 'note'];

export class BatchError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'BatchError';
    this.status = status;
    this.field = field;
  }
}

const bad = (message, field) => new BatchError(400, message, field);
const conflict = (message, field) => new BatchError(409, message, field);
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const numIn = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(dayStart(s)) && localDate(dayStart(s)) === s;
const grouped = (n) => n.toLocaleString('en-US');
const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));

// A text field: trimmed, at most max characters, no control characters (a note may hold line breaks); empty is null.
function textOf(v, field, label, max = MAX_TEXT) {
  if (v === undefined || v === null) return null;
  const control = field === 'note' ? /[\u0000-\u0009\u000b-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (typeof v !== 'string' || control.test(v)) throw bad(`${label} must be plain text`, field);
  const s = v.trim();
  if (s.length > max) throw bad(`${label} must be at most ${max} characters`, field);
  return s || null;
}

// The receive fields of body, checked (spec 3). With `was` (an edit) only the fields given are checked and returned, the
// cross checks (inoculated by received, weight with water) made against the stored row. → camelCase fields.
function checkFields(body, now, was = null) {
  if (!isPlain(body)) throw bad('Body must be a JSON object');
  const has = (k) => Object.hasOwn(body, k);
  const asked = (k) => !was || has(k);
  const out = {};
  if (asked('crop')) {
    if (!CROP_KEYS.includes(body.crop)) throw bad('Pick a crop', 'crop');
    out.crop = body.crop;
  }
  if (asked('supplier')) {
    out.supplier = textOf(body.supplier, 'supplier', 'Supplier');
    if (!out.supplier) throw bad('Give the supplier', 'supplier');
  }
  if (asked('receivedAt')) {
    const v = has('receivedAt') ? body.receivedAt : now;
    if (!Number.isInteger(v) || v > now || v < EARLIEST) throw bad('Pick the day received, not in the future', 'receivedAt');
    out.receivedAt = v;
  }
  if (asked('blocks')) {
    if (!intIn(body.blocks, 1, MAX_BLOCKS)) throw bad('Blocks must be a whole number from 1 to 100,000', 'blocks');
    out.blocks = body.blocks;
  }
  if (asked('pricePerBlock')) {
    const v = body.pricePerBlock ?? null;
    if (v !== null && !numIn(v, 0, 1000)) throw bad('Price per block must be RM 0–1,000, or empty', 'pricePerBlock');
    out.pricePerBlock = v === null ? null : Math.round(v * 10_000) / 10_000;
  }
  for (const [key, label] of [['spawnBatch', 'Spawn batch'], ['strain', 'Strain'], ['deliveryRef', 'Delivery note']]) {
    if (asked(key)) out[key] = textOf(body[key], key, label);
  }
  if (asked('note')) out.note = textOf(body.note, 'note', 'Note', MAX_NOTE);
  if (asked('inoculatedAt')) {
    const v = body.inoculatedAt ?? null;
    if (v !== null && !(Number.isInteger(v) && v >= EARLIEST)) throw bad('Pick the day inoculated', 'inoculatedAt');
    out.inoculatedAt = v;
  }
  if (asked('blockKg') || asked('waterPct')) {
    const kg = has('blockKg') ? body.blockKg ?? null : was?.blockKg ?? null;
    const water = has('waterPct') ? body.waterPct ?? null : was?.waterPct ?? null;
    if (kg !== null && !numIn(kg, 0.2, 10)) throw bad('Block weight must be 0.2–10 kg, or empty', 'blockKg');
    if (water !== null && !numIn(water, 30, 80)) throw bad('Water must be 30–80 %, or empty', 'waterPct');
    if (kg === null && water !== null) throw bad('Give the block weight with the water %', 'blockKg');
    if (kg !== null && water === null) throw bad('Give the water % with the block weight', 'waterPct');
    out.blockKg = kg;
    out.waterPct = water;
  }
  const received = out.receivedAt ?? was?.receivedAt;
  const inoculated = 'inoculatedAt' in out ? out.inoculatedAt : was?.inoculatedAt ?? null;
  if (inoculated !== null && localDate(inoculated) > localDate(received)) throw bad('Inoculated must be on or before the day received', 'inoculatedAt');
  return out;
}

// The list's query, from the address's strings (null: not given). → { run, from, to, status }.
function queryOf({ run = null, from = null, to = null, status = null } = {}) {
  if (run !== null && !/^[1-9][0-9]{0,14}$/.test(String(run))) throw bad('run must be a run id', 'run');
  if (from !== null && !isDate(from)) throw bad('from must be a date, YYYY-MM-DD', 'from');
  if (to !== null && !isDate(to)) throw bad('to must be a date, YYYY-MM-DD', 'to');
  if (status !== null && !STATUSES.includes(status)) throw bad('status must be waiting, placed or past', 'status');
  return { run: run === null ? null : Number(run), from, to, status };
}

// A store row as the API shows it (spec 6).
function viewOf(b) {
  return {
    id: b.id, kind: b.kind, parentId: b.parentId, runId: b.runId, roomId: b.roomId, roomName: b.roomName, crop: b.crop,
    supplier: b.supplier, receivedAt: b.receivedAt, blocks: b.blocks, lost: b.lost, good: goodOf(b), pricePerBlock: b.pricePerBlock,
    spawnBatch: b.spawnBatch, strain: b.strain, deliveryRef: b.deliveryRef, inoculatedAt: b.inoculatedAt, blockKg: b.blockKg,
    waterPct: b.waterPct, dryKg: dryKgOf(b), placedAt: b.placedAt, runStartedAt: b.runStartedAt, runEndedAt: b.runEndedAt,
    runBlocks: runBlocksOf(b), note: b.note, status: statusOf(b), createdAt: b.createdAt,
  };
}

// db: the farm database (db.batches is the store); now is injectable.
export function createBatches({ db, now = Date.now }) {
  const store = db.batches;
  const listeners = new Set();
  const firstOf = (b) => b.parentId ?? b.id;

  // After a write: fn({ batchId, roomId, runId, harvestRooms }) — harvestRooms: the rooms of the placed rows it touched
  // (before or after), whose Harvest figures may change (3.2).
  function tell(rows) {
    const touched = rows.filter(Boolean);
    const placed = touched.find((b) => b.roomId != null);
    const change = {
      batchId: touched[0]?.id ?? null, roomId: placed?.roomId ?? null, runId: placed?.runId ?? null,
      harvestRooms: [...new Set(touched.filter((b) => b.roomId != null).map((b) => b.roomId))],
    };
    for (const fn of [...listeners]) fn(change);
  }

  function batchOf(id) {
    const b = Number.isInteger(id) ? store.get(id) : null;
    if (!b) throw new BatchError(404, 'Batch not found');
    return b;
  }

  // Inventory's moves of a delivery written again from its rows (3.1); `gone`: ids of rows just deleted. Inside the write's
  // transaction; nothing without Inventory's tables.
  function sync(firstId, gone = []) {
    if (!store.hasStock()) return;
    const family = store.family(firstId);
    store.deleteMoves([...family.map((b) => b.id), ...gone]);
    if (!family.length) return;
    const itemId = store.blocksItem(`${cropShortName(family[0].crop)} blocks`);
    for (const m of movesOf(family, (id) => store.checks(id))) store.insertMove({ itemId, ...m });
  }

  // A check's fields (spec 3): at most `max` blocks lost; `was` (an edit): a field not given keeps its stored value.
  function checkOf(body, b, max, was = null) {
    if (!isPlain(body)) throw bad('Body must be a JSON object');
    const t = now();
    const given = (k) => Object.hasOwn(body, k);
    const at = given('at') ? body.at : was?.at ?? t;
    if (!Number.isInteger(at) || at > t || localDate(at) < localDate(b.receivedAt)) throw bad('Pick a time from the day received to now', 'at');
    const lost = given('lost') ? body.lost : was?.lost;
    if (max < 1) throw conflict('Every block of this batch is lost already');
    if (!intIn(lost, 1, max)) throw bad(`Blocks lost must be a whole number from 1 to ${grouped(max)}`, 'lost');
    const cause = given('cause') ? body.cause : was?.cause;
    if (!CAUSES.includes(cause)) throw bad('Pick a cause', 'cause');
    let worker = was?.worker ?? null;
    if (!was || given('worker')) {
      try {
        worker = checkWorker(db, body.worker);
      } catch (err) {
        if (err instanceof TaskError) throw new BatchError(err.status, err.message, err.field);
        throw err;
      }
    }
    const note = given('note') || !was ? textOf(body.note, 'note', 'Note', MAX_NOTE) : was.note;
    return { at, lost, cause, worker, note };
  }

  return {
    // { batches: [view], blockCost } (spec 6), newest received first.
    list(query = {}) {
      const { run, from, to, status } = queryOf(query);
      const rows = store.all().filter((b) => (run === null || b.runId === run)
        && (from === null || localDate(b.receivedAt) >= from) && (to === null || localDate(b.receivedAt) <= to));
      const batches = rows.map(viewOf).filter((b) => status === null || b.status === status);
      return { batches, blockCost: blockCost(batches) };
    },

    // A batch with its delivery, its checks (newest first) and, when placed, the run's batches' blocks of its crop.
    detail(id) {
      const b = batchOf(id);
      const sameRun = b.runId == null ? null : store.byRun(b.runId).filter((x) => x.crop === b.crop);
      return {
        ...viewOf(b),
        delivery: store.family(firstOf(b)).map(viewOf),
        checks: store.checks(b.id).toReversed(),
        batchBlocks: sameRun === null ? null : sameRun.reduce((s, x) => s + x.blocks, 0),
      };
    },

    // Receive bought blocks (spec 3). → the view.
    receive(body) {
      const t = now();
      const fields = checkFields(body, t);
      const id = store.tx(() => {
        const made = store.insert({ kind: 'bought', ...fields, createdAt: t });
        sync(made);
        return made;
      });
      const b = store.get(id);
      tell([b]);
      return viewOf(b);
    },

    // Edit (spec 3): shared fields to every row of the delivery; crop only while all of it waits; blocks only on a waiting
    // first row with no parts, not below its lost blocks. → the view.
    edit(id, body) {
      const b = batchOf(id);
      const fields = checkFields(body, now(), b);
      const family = store.family(firstOf(b));
      if ('crop' in fields && fields.crop !== b.crop && family.some((x) => x.placedAt != null)) {
        throw conflict('Take the blocks out of the rooms to change the crop', 'crop');
      }
      if ('blocks' in fields && fields.blocks !== b.blocks) {
        if (b.parentId != null || family.length > 1 || b.placedAt != null) throw conflict('Blocks change only on a waiting batch with no parts', 'blocks');
        if (fields.blocks < b.lost) throw bad(`Blocks can't be fewer than the ${grouped(b.lost)} lost`, 'blocks');
      }
      const shared = Object.fromEntries(Object.entries(fields).filter(([k]) => SHARED.includes(k)));
      const own = Object.fromEntries(Object.entries(fields).filter(([k]) => !SHARED.includes(k)));
      store.tx(() => {
        if (Object.keys(shared).length) for (const x of family) store.update(x.id, shared);
        if (Object.keys(own).length) store.update(id, own);
        sync(firstOf(b));
      });
      const after = store.get(id);
      tell([after, ...family]);
      return viewOf(after);
    },

    // Delete (spec 3): a first row with parts is refused; a part's blocks are not given back.
    remove(id) {
      const b = batchOf(id);
      if (b.parentId == null && store.family(b.id).length > 1) throw conflict('Take its parts out of the rooms first');
      store.tx(() => {
        store.remove(id);
        sync(firstOf(b), [id]);
      });
      tell([b]);
    },

    // Put `blocks` of a waiting row into the room's open run (spec 3): all its good blocks move the row itself; fewer split a
    // part off (2.1). → the view of the row put in.
    place(id, body) {
      if (!isPlain(body)) throw bad('Body must be a JSON object');
      const b = batchOf(id);
      if (b.placedAt != null) throw conflict(b.runId != null ? `These blocks are in ${b.roomName} already` : 'These blocks went into a room that was deleted');
      const room = Number.isInteger(body.roomId) ? db.getRoom(body.roomId) : null;
      if (!room) throw bad('Pick a room', 'roomId');
      const good = goodOf(b);
      if (good < 1) throw conflict('Every block of this batch was lost');
      const n = body.blocks ?? good;
      if (!intIn(n, 1, good)) throw bad(`Blocks must be a whole number from 1 to ${grouped(good)}`, 'blocks');
      const run = db.openRun(room.id);
      if (!run) throw conflict(`Give ${room.name} its crops on the Crop tab first`);
      if (!run.crops.some((c) => c.crop === b.crop)) throw conflict(`${room.name}'s run has no ${cropShortName(b.crop)}`);
      const t = now();
      const placedId = store.tx(() => {
        let rowId = id;
        if (n === good) {
          store.update(id, { runId: run.id, roomId: room.id, placedAt: t });
        } else {
          const first = store.get(firstOf(b));
          rowId = store.insert({ ...pick(first, COPIED), parentId: first.id, blocks: n, runId: run.id, roomId: room.id, placedAt: t, createdAt: t });
          store.update(id, { blocks: b.blocks - n });
        }
        sync(firstOf(b));
        return rowId;
      });
      const placed = store.get(placedId);
      tell([placed]);
      return viewOf(placed);
    },

    // Take a row out of its room while the run is open (spec 3): a part whose first row waits folds back into it; another
    // row waits again. → the view of the row that waits.
    unplace(id) {
      const b = batchOf(id);
      if (b.runId == null) throw conflict('These blocks are not in a room');
      if (b.runEndedAt != null) throw conflict(`${b.roomName}'s run has ended`);
      const first = b.parentId == null ? null : store.get(b.parentId);
      const waitingId = store.tx(() => {
        if (first && first.placedAt == null) {
          store.update(first.id, { blocks: first.blocks + b.blocks });
          store.moveChecks(b.id, first.id);
          store.remove(b.id);
          sync(first.id, [b.id]);
          return first.id;
        }
        store.update(b.id, { runId: null, roomId: null, placedAt: null });
        sync(firstOf(b));
        return b.id;
      });
      const waiting = store.get(waitingId);
      tell([b, waiting]);
      return viewOf(waiting);
    },

    // A contamination check on a row (spec 3). → the check.
    addCheck(id, body) {
      const b = batchOf(id);
      const fields = checkOf(body, b, goodOf(b));
      const checkId = store.tx(() => {
        const made = store.insertCheck({ batchId: b.id, ...fields, createdAt: now() });
        sync(firstOf(b));
        return made;
      });
      tell([b]);
      return store.check(checkId);
    },

    editCheck(checkId, body) {
      const c = Number.isInteger(checkId) ? store.check(checkId) : null;
      if (!c) throw new BatchError(404, 'Check not found');
      const b = store.get(c.batchId);
      const fields = checkOf(body, b, goodOf(b) + c.lost, c);
      store.tx(() => {
        store.updateCheck(checkId, fields);
        sync(firstOf(b));
      });
      tell([b]);
      return store.check(checkId);
    },

    removeCheck(checkId) {
      const c = Number.isInteger(checkId) ? store.check(checkId) : null;
      if (!c) throw new BatchError(404, 'Check not found');
      const b = store.get(c.batchId);
      store.tx(() => {
        store.removeCheck(checkId);
        sync(firstOf(b));
      });
      tell([b]);
    },

    // { <crop>: dry kg per block } of a run's batches whose weights are all known (spec 3.2; harvests.js).
    dryKgFor: (runId) => runDryKg(store.byRun(runId)),

    // The batches received from `from` to `to` (farm dates; the last 90 days by default) as CSV, oldest first:
    // { name: 'batches <from>–<to>.csv', text } (the route adds the BOM).
    csv(query = {}) {
      const today = localDate(now());
      const asked = queryOf({ from: query.from ?? null, to: query.to ?? null });
      const from = asked.from ?? addDays(today, -89);
      const to = asked.to ?? today;
      const rows = store.all().filter((b) => localDate(b.receivedAt) >= from && localDate(b.receivedAt) <= to).toReversed();
      const lines = [CSV_HEAD, ...rows.map((b) => [
        localDate(b.receivedAt), cropShortName(b.crop), b.kind, b.supplier, b.strain, b.spawnBatch, b.deliveryRef, b.blocks, b.lost,
        b.pricePerBlock, b.roomName, b.runStartedAt == null ? null : localDate(b.runStartedAt), b.placedAt == null ? null : localDate(b.placedAt),
        b.blockKg, b.waterPct, b.note,
      ])];
      return { name: `batches ${from}–${to}.csv`, text: `${lines.map((l) => l.map(cell).join(',')).join('\r\n')}\r\n` };
    },

    // fn(change) after every write (tell); → a function that stops it.
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
