// Batches (spec 2026-11-05-batches-design.md 3 and 6): receive bought blocks, put them into a room's open run (a part split
// off when fewer go in) and take them out, contamination checks, the views, the CSV, and a run's dry kg for Harvest's BE
// (3.2). Every write keeps Inventory's stock moves in step (3.1) when Inventory's tables exist. No HTTP.

import { CROP_KEYS, cropShortName } from '../web/crops.js';
import { localDate, addDays } from './task-rules.js';
import { checkWorker, TaskError } from './tasks.js';
import { cell } from './csv.js';
import { goodOf, dryKgOf, runDryKg, blockCost, statusOf, runBlocksOf, movesOf } from './batches-math.js';
import {
  BatchError, MAX_BLOCKS, MAX_NOTE, EARLIEST, bad, conflict, isPlain, intIn, numIn, isDate, grouped, textOf, weightOf,
} from './batches-fields.js';
import { checkRecipe, checkMade, checkMaterials, MIX_ITEMS } from './batches-making.js';

export { BatchError, MAX_BLOCKS };
export const CAUSES = ['green', 'black', 'bacterial', 'pests', 'other'];
const STATUSES = ['making', 'waiting', 'placed', 'past'];
// Edited on any row of a delivery, written to all of them (spec 2.1); a part copies these and the making columns.
const SHARED = ['crop', 'supplier', 'receivedAt', 'pricePerBlock', 'spawnBatch', 'strain', 'deliveryRef', 'inoculatedAt', 'blockKg', 'waterPct'];
const MAKING = ['recipeId', 'mixedAt', 'incubation', 'incubatedFrom', 'incubatedTo'];
const COPIED = [...SHARED, 'kind', ...MAKING];
const CSV_HEAD = ['received', 'crop', 'kind', 'supplier', 'strain', 'spawn batch', 'delivery note', 'blocks', 'lost', 'price per block', 'room',
  'run started', 'placed', 'block kg', 'water %', 'note'];
const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));

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
    if (v !== null && !(Number.isInteger(v) && v >= EARLIEST && v <= now)) throw bad('Pick the day inoculated', 'inoculatedAt');
    out.inoculatedAt = v;
  }
  if (asked('blockKg') || asked('waterPct')) Object.assign(out, weightOf(body, was));
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
  if (from !== null && to !== null && from > to) throw bad('from must be on or before to', 'from');
  if (status !== null && !STATUSES.includes(status)) throw bad('status must be making, waiting, placed or past', 'status');
  return { run: run === null ? null : Number(run), from, to, status };
}

// A store row as the API shows it (spec 6); priceOf(stockItemId): an Inventory item's latest purchase price (the spawn's, for
// the 4-2 sheet's price per unit).
function viewOf(b, priceOf) {
  return {
    id: b.id, kind: b.kind, parentId: b.parentId, runId: b.runId, roomId: b.roomId, roomName: b.roomName, crop: b.crop,
    supplier: b.supplier, receivedAt: b.receivedAt, blocks: b.blocks, lost: b.lost, good: goodOf(b), pricePerBlock: b.pricePerBlock,
    spawnBatch: b.spawnBatch, strain: b.strain, deliveryRef: b.deliveryRef, inoculatedAt: b.inoculatedAt, blockKg: b.blockKg,
    waterPct: b.waterPct, dryKg: dryKgOf(b), placedAt: b.placedAt,
    usedBlocks: b.placedAt == null ? null : b.blocks - b.lostBefore, // the blocks that went into the room (the lost ones before it do not)
    runStartedAt: b.runStartedAt, runEndedAt: b.runEndedAt,
    runBlocks: runBlocksOf(b), note: b.note, status: statusOf(b), createdAt: b.createdAt,
    // a made batch's making (spec 5): the steps' days, its last sterilising load and its spawn
    mixedAt: b.mixedAt, recipeId: b.recipeId, incubation: b.incubation, incubatedFrom: b.incubatedFrom, incubatedTo: b.incubatedTo,
    sterilisedAt: b.sterilisedAt,
    spawn: b.spawnQty == null ? null : { qty: b.spawnQty, unit: b.spawnUnit, unitCost: b.spawnItemId == null ? null : priceOf(b.spawnItemId) },
  };
}

// db: the farm database (db.batches is the store); now is injectable.
export function createBatches({ db, now = Date.now, log = console.error }) {
  const store = db.batches;
  const listeners = new Set();
  const firstOf = (b) => b.parentId ?? b.id;
  const view = (b) => viewOf(b, (itemId) => store.purchasePrice(itemId));

  // After a write: fn({ batchId, roomId, runId, harvestRooms }) — harvestRooms: the rooms of the placed rows it touched
  // (before or after), whose Harvest figures may change (3.2).
  function tell(rows) {
    const touched = rows.filter(Boolean);
    const placed = touched.find((b) => b.roomId != null);
    const change = {
      batchId: touched[0]?.id ?? null, roomId: placed?.roomId ?? null, runId: placed?.runId ?? null,
      harvestRooms: [...new Set(touched.filter((b) => b.roomId != null).map((b) => b.roomId))],
    };
    for (const fn of [...listeners]) {
      try {
        fn(change);
      } catch (err) {
        log(err);
      }
    }
  }

  // name → an unarchived recipe other than exceptId has it, case aside (spec 2: a name is unique among those in use).
  const nameTaken = (exceptId) => (name) => store.recipes().some((r) => !r.archived && r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase());

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

  // Edit a made batch (spec 5): the Mix's fields and materials, the Inoculate step's (the spawn supplier, strain, spawn batch,
  // the spawn line), the Incubate step's; the shared and making fields to every row of the delivery, the materials on its first
  // row. Crop and bags as a bought batch's (2.1); the day mixed not after a load or a check (nor the inoculation, which comes
  // before any placement); where the blocks incubate fixed while some are in a room. → the view.
  function editMade(b, body) {
    const firstId = firstOf(b);
    const first = store.get(firstId);
    const fields = checkMade(body, { was: first, now: now(), recipeOf: (id) => store.recipe(id) });
    const lines = linesOf(body, 'inoculatedAt' in fields ? fields.inoculatedAt : first.inoculatedAt);
    const family = store.family(firstId);
    const placed = family.some((x) => x.placedAt != null);
    if ('crop' in fields && fields.crop !== first.crop && placed) throw conflict('Take the blocks out of the rooms to change the crop', 'crop');
    if ('blocks' in fields && fields.blocks !== b.blocks) {
      if (b.parentId != null || family.length > 1 || b.placedAt != null) throw conflict('Bags change only on a waiting batch with no parts', 'blocks');
      if (fields.blocks < b.lost) throw bad(`Bags can't be fewer than the ${grouped(b.lost)} lost`, 'blocks');
      if (store.loads(firstId).some((l) => l.bags > fields.blocks)) throw bad('A sterilising load has more bags than that', 'blocks');
    }
    if (placed && ['incubation', 'incubatedFrom', 'incubatedTo'].some((k) => k in fields && fields[k] !== first[k])) {
      throw conflict('Take the blocks out of the rooms to change their incubation', 'incubation');
    }
    if ('mixedAt' in fields && fields.mixedAt !== first.mixedAt) {
      const day = localDate(fields.mixedAt);
      if (store.loads(firstId).some((l) => localDate(l.hotAt) < day)) throw bad('Some sterilising loads are before that day', 'mixedAt');
      if (family.some((x) => store.checks(x.id).some((c) => localDate(c.at) < day))) throw bad('Some contamination checks are before that day', 'mixedAt');
    }
    const shared = Object.fromEntries(Object.entries(fields).filter(([k]) => SHARED.includes(k) || MAKING.includes(k)));
    const own = Object.fromEntries(Object.entries(fields).filter(([k]) => !SHARED.includes(k) && !MAKING.includes(k)));
    store.tx(() => {
      if (Object.keys(shared).length) for (const x of family) store.update(x.id, shared);
      if (Object.keys(own).length) store.update(b.id, own);
      if (lines.mix) store.setMaterials(firstId, MIX_ITEMS, lines.mix);
      if (lines.spawn) store.setMaterials(firstId, ['spawn'], lines.spawn);
      sync(firstId);
    });
    const after = store.get(b.id);
    tell([after, ...family]);
    return view(after);
  }

  // A made batch's material lines in body (spec 5), checked: the mix's (materials) and the spawn (spawn: one line, or null to
  // clear it; it needs the day inoculated). An item picked is kept only with Inventory. → { mix?, spawn? } (absent: not sent).
  function linesOf(body, inoculatedAt) {
    const known = store.hasStock() ? (id) => store.stockItem(id) !== null : null;
    const out = {};
    if (Object.hasOwn(body, 'materials')) out.mix = checkMaterials(body.materials, MIX_ITEMS, known);
    if (Object.hasOwn(body, 'spawn')) {
      out.spawn = body.spawn === null ? [] : checkMaterials([{ ...(isPlain(body.spawn) ? body.spawn : {}), item: 'spawn' }], ['spawn'], known, 'spawn');
      if (out.spawn.length && inoculatedAt == null) throw bad('Give the day inoculated with the spawn', 'inoculatedAt');
    }
    return out;
  }

  // A check's fields (spec 3): at most `max` blocks lost; `was` (an edit): a field not given keeps its stored value.
  function checkOf(body, b, max, was = null) {
    if (!isPlain(body)) throw bad('Body must be a JSON object');
    const t = now();
    const given = (k) => Object.hasOwn(body, k);
    if (max < 1) throw conflict('Every block of this batch is lost already');
    const at = given('at') ? body.at : was?.at ?? t;
    if (!(Number.isInteger(at) && at >= EARLIEST && at <= t) || localDate(at) < localDate(b.receivedAt)) throw bad('Pick a time from the day received to now', 'at');
    const lost = given('lost') ? body.lost : was?.lost;
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
      const batches = rows.map(view).filter((b) => status === null || b.status === status);
      return { batches, blockCost: blockCost(batches) };
    },

    // A batch with its delivery, its checks (newest first) and, when placed, the run's batches' blocks of its crop.
    detail(id) {
      const b = batchOf(id);
      const sameRun = b.runId == null ? null : store.byRun(b.runId).filter((x) => x.crop === b.crop);
      return {
        ...view(b),
        delivery: store.family(firstOf(b)).map(view),
        checks: store.checks(b.id).toReversed(),
        batchBlocks: sameRun === null ? null : sameRun.reduce((s, x) => s + x.blocks, 0),
        // part 2 (spec 6): a made batch's recipe, its material lines (with their Inventory item's name and latest purchase price)
        // and its sterilising loads, all its first row's
        recipe: b.recipeId == null ? null : store.recipe(b.recipeId),
        materials: store.materials(firstOf(b)).map((m) => ({
          ...m, itemName: m.stockItemId == null ? null : store.stockItem(m.stockItemId)?.name ?? null,
          unitCost: m.stockItemId == null ? null : store.purchasePrice(m.stockItemId),
        })),
        loads: store.loads(firstOf(b)),
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
      return view(b);
    },

    // Make blocks (spec 5): a made batch from the Mix's fields and materials (and, given, the later steps'). → the view.
    mix(body) {
      const t = now();
      const fields = checkMade(body, { now: t, recipeOf: (id) => store.recipe(id) });
      const lines = linesOf(body, fields.inoculatedAt ?? null);
      const id = store.tx(() => {
        const made = store.insert({ kind: 'made', ...fields, createdAt: t });
        if (lines.mix) store.setMaterials(made, MIX_ITEMS, lines.mix);
        if (lines.spawn) store.setMaterials(made, ['spawn'], lines.spawn);
        sync(made);
        return made;
      });
      const b = store.get(id);
      tell([b]);
      return view(b);
    },

    // Edit (spec 3): shared fields to every row of the delivery; crop only while all of it waits; blocks only on a waiting
    // first row with no parts, not below its lost blocks. → the view.
    edit(id, body) {
      const b = batchOf(id);
      if (b.kind === 'made') return editMade(b, body);
      const fields = checkFields(body, now(), b);
      const family = store.family(firstOf(b));
      if ('crop' in fields && fields.crop !== b.crop && family.some((x) => x.placedAt != null)) {
        throw conflict('Take the blocks out of the rooms to change the crop', 'crop');
      }
      if ('blocks' in fields && fields.blocks !== b.blocks) {
        if (b.parentId != null || family.length > 1 || b.placedAt != null) throw conflict('Blocks change only on a waiting batch with no parts', 'blocks');
        if (fields.blocks < b.lost) throw bad(`Blocks can't be fewer than the ${grouped(b.lost)} lost`, 'blocks');
      }
      if ('receivedAt' in fields && fields.receivedAt !== b.receivedAt) {
        const day = localDate(fields.receivedAt);
        if (family.some((x) => store.checks(x.id).some((c) => localDate(c.at) < day))) throw bad('Some contamination checks are before that day', 'receivedAt');
        if (family.some((x) => x.placedAt != null && localDate(x.placedAt) < day)) throw bad('Some blocks went into a room before that day', 'receivedAt');
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
      return view(after);
    },

    // Delete (spec 3): a first row with parts is refused; a part's blocks are not given back.
    remove(id) {
      const b = batchOf(id);
      if (b.parentId == null && store.family(b.id).length > 1) throw conflict('Delete its parts first, or take them out of the rooms');
      store.tx(() => {
        store.remove(id);
        sync(firstOf(b), [id]);
      });
      tell([b]);
    },

    // Put `blocks` of a waiting row into the room's open run (spec 3): all its good blocks move the row itself; fewer split a
    // part off (2.1). Made blocks once inoculated, or, incubating in an area, once ready to fruit (spec 5). → the view of the
    // row put in.
    place(id, body) {
      if (!isPlain(body)) throw bad('Body must be a JSON object');
      const b = batchOf(id);
      if (b.placedAt != null) {
        if (b.runId == null) throw conflict('These blocks went into a room that was deleted');
        throw conflict(b.runEndedAt != null ? `${b.roomName}'s run has ended` : `These blocks are in ${b.roomName} already`);
      }
      if (b.kind === 'made' && b.inoculatedAt == null) throw conflict('Record the inoculation before these blocks go into a room');
      if (b.kind === 'made' && b.incubation === 'area' && b.incubatedTo == null) throw conflict('These blocks incubate in an area: mark them ready to fruit first');
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
        // made blocks put in before any incubation was recorded incubate in that grow room (spec 5)
        if (b.kind === 'made' && b.incubation == null) for (const x of store.family(firstOf(b))) store.update(x.id, { incubation: 'room' });
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
      return view(placed);
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
          const note = [first.note, b.note].filter(Boolean).join('\n').slice(0, MAX_NOTE).trim() || null;
          store.update(first.id, { blocks: first.blocks + b.blocks, note });
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
      return view(waiting);
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

    // ---- recipes (spec 5) ----

    // { recipes } by name: those in use, or with all every one (archived too).
    recipes({ all = false } = {}) {
      return { recipes: store.recipes().filter((r) => all || !r.archived) };
    },

    // A new recipe. → the recipe.
    addRecipe(body) {
      const fields = checkRecipe(body, { taken: nameTaken(null) });
      const id = store.insertRecipe({ ...fields, createdAt: now() });
      tell([]);
      return store.recipe(id);
    },

    // A recipe's fields, or { archived: true } (never deleted: the batches made with it name it). A batch's materials were
    // copied at its mix: they do not change. → the recipe.
    editRecipe(id, body) {
      const was = Number.isInteger(id) ? store.recipe(id) : null;
      if (!was) throw new BatchError(404, 'Recipe not found');
      store.updateRecipe(id, checkRecipe(body, { was, taken: nameTaken(id) }));
      tell([]);
      return store.recipe(id);
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
