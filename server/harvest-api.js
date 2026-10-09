// Harvest routes (contract C10 sections 6-9; C3 section 2.1 for the ExtraRoute shape).
'use strict';
require('../controller.js');
require('../harvest-rules.js');
const { HttpError } = require('./api-common.js');

const Rules = globalThis.FarmHarvestRules;
const ID_RE = /^[1-9][0-9]{0,14}$/;
const STATES = ['received', 'placed', 'cleared'];
const TEXT_FIELDS = ['strain', 'source', 'notes'];

// Local midnight of the process time zone for the day that holds t (C10 8.2).
function startOfDay(t) {
  const d = new Date(t * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

const isNotFound = err => err !== null && typeof err === 'object' && err.code === 'NOT_FOUND';
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const trimText = v => (typeof v === 'string' ? (v.trim() || null) : v);
const round2 = x => Math.round(x * 100) / 100;
const byNewest = (a, b) => b.t - a.t || b.id - a.id;

function trimFields(body) {
  const out = { ...body };
  for (const k of TEXT_FIELDS) if (Object.hasOwn(out, k)) out[k] = trimText(out[k]);
  return out;
}

function createHarvestRoutes(opts) {
  const { db, harvest } = opts;
  const clock = opts.now || (() => Math.floor(Date.now() / 1000));

  // The :batchId check of C10 8.2: a bad id and an unknown batch both answer 404.
  function loadBatch(id) {
    if (!ID_RE.test(id)) throw new HttpError(404, 'Unknown batch', []);
    try {
      return harvest.getBatch(Number(id));
    } catch (err) {
      if (isNotFound(err)) throw new HttpError(404, 'Unknown batch', []);
      throw err;
    }
  }

  function loadCrate(id) {
    if (!ID_RE.test(id)) throw new HttpError(404, 'Unknown crate', []);
    try {
      return harvest.getCrate(Number(id));
    } catch (err) {
      if (isNotFound(err)) throw new HttpError(404, 'Unknown crate', []);
      throw err;
    }
  }

  const invalidBatch = details => new HttpError(400, 'Invalid batch', details);

  // C10 6.1 Batch, from a row and its crate rows.
  function toBatch(row, crates) {
    return {
      ...row,
      room_name: row.room_id == null ? null : db.getRoom(row.room_id).name,
      state: Rules.state(row),
      totals: Rules.totals(row, crates),
    };
  }

  function batchOf(row) {
    return toBatch(row, harvest.listCrates(row.id));
  }

  // The room of a place body, or null when it does not exist or is archived.
  function openRoom(roomId) {
    if (!Number.isInteger(roomId) || roomId < 1) return null;
    try {
      const room = db.getRoom(roomId);
      return room.archived_at == null ? room : null;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  function unknownFields(body, allowed) {
    return Object.keys(body).filter(k => !allowed.includes(k)).map(k => `${k}: unknown field`);
  }

  // `placed_at` / `cleared_at`: a missing key takes now, null does not.
  function timeOf(body, key, now) {
    return body[key] === undefined ? now : body[key];
  }

  const routes = [];
  const route = (method, segs, needsRoom, hasBody, run) => routes.push({ method, segs, needsRoom, hasBody, run });

  // 9.1
  route('GET', ['api', 'batches'], false, false, ctx => {
    const state = ctx.query.get('state');
    if (state !== null && !STATES.includes(state)) {
      throw new HttpError(400, 'Invalid query', ['state: must be received, placed or cleared']);
    }
    const room = ctx.query.get('room');
    let roomId = null;
    if (room !== null) {
      const bad = new HttpError(400, 'Invalid query', ['room: no such room']);
      if (!ID_RE.test(room)) throw bad;
      roomId = Number(room);
      try {
        db.getRoom(roomId);
      } catch (err) {
        if (isNotFound(err)) throw bad;
        throw err;
      }
    }
    const rows = harvest.listBatches({ state, room_id: roomId });
    return { status: 200, body: rows.map(batchOf) };
  });

  // 9.2
  route('POST', ['api', 'batches'], false, true, ctx => {
    const now = clock();
    const body = ctx.body;
    const problems = Rules.checkBatch(body, false);
    if (problems.length > 0) throw invalidBatch(problems);
    if (body.received_at > now) throw invalidBatch(['received_at: must not be in the future']);
    if (body.spawn_date != null && body.spawn_date > now) throw invalidBatch(['spawn_date: must not be in the future']);
    const row = harvest.createBatch({ ...trimFields(body), flush_gap_days: body.flush_gap_days ?? 5 });
    return { status: 201, body: batchOf(row) };
  });

  // 9.3
  route('GET', ['api', 'batches', ':batchId'], false, false, ctx => {
    const row = loadBatch(ctx.params.batchId);
    const crates = harvest.listCrates(row.id);
    return {
      status: 200,
      body: {
        ...toBatch(row, crates),
        flushes: Rules.flushes(row, crates),
        crates: crates.filter(c => c.deleted_at == null).sort(byNewest),
      },
    };
  });

  // 9.4
  route('PATCH', ['api', 'batches', ':batchId'], false, true, ctx => {
    const now = clock();
    const row = loadBatch(ctx.params.batchId);
    const body = ctx.body;
    const problems = Rules.checkBatch(body, true);
    if (problems.length > 0) throw invalidBatch(problems);
    if (body.received_at !== undefined) {
      if (body.received_at > now) throw invalidBatch(['received_at: must not be in the future']);
      if (row.placed_at != null && startOfDay(body.received_at) > startOfDay(row.placed_at)) {
        throw invalidBatch(['received_at: must not be after the day it was placed']);
      }
    }
    const changes = trimFields(body);
    // Same farm day but later in the day than placed_at: store placed_at (LD 78).
    if (changes.received_at !== undefined && row.placed_at != null) changes.received_at = Math.min(changes.received_at, row.placed_at);
    return { status: 200, body: batchOf(harvest.updateBatch(row.id, changes)) };
  });

  // 9.5
  route('POST', ['api', 'batches', ':batchId', 'place'], false, true, ctx => {
    const now = clock();
    const row = loadBatch(ctx.params.batchId);
    const body = ctx.body;
    if (!isPlainObject(body)) throw invalidBatch(['body: must be an object']);
    const extra = unknownFields(body, ['room_id', 'placed_at']);
    if (extra.length > 0) throw invalidBatch(extra);
    if (openRoom(body.room_id) === null) throw invalidBatch(['room_id: no such room']);
    const placedAt = timeOf(body, 'placed_at', now);
    if (!Number.isInteger(placedAt)) throw invalidBatch(['placed_at: must be whole seconds since 1970']);
    if (startOfDay(placedAt) < startOfDay(row.received_at)) throw invalidBatch(['placed_at: must not be before the day it was received']);
    if (placedAt > now) throw invalidBatch(['placed_at: must not be in the future']);
    if (Rules.state(row) !== 'received') throw new HttpError(400, 'Batch is already in a room', []);
    return { status: 200, body: batchOf(harvest.placeBatch(row.id, body.room_id, Math.max(placedAt, row.received_at))) };
  });

  // 9.6
  route('POST', ['api', 'batches', ':batchId', 'clear'], false, true, ctx => {
    const now = clock();
    const row = loadBatch(ctx.params.batchId);
    const body = ctx.body;
    if (!isPlainObject(body)) throw invalidBatch(['body: must be an object']);
    const extra = unknownFields(body, ['cleared_at']);
    if (extra.length > 0) throw invalidBatch(extra);
    const clearedAt = timeOf(body, 'cleared_at', now);
    if (!Number.isInteger(clearedAt)) throw invalidBatch(['cleared_at: must be whole seconds since 1970']);
    if (clearedAt > now) throw invalidBatch(['cleared_at: must not be in the future']);
    const state = Rules.state(row);
    if (state === 'received') throw new HttpError(400, 'Batch is not in a room', []);
    if (state === 'cleared') throw new HttpError(400, 'Batch is cleared', []);
    if (startOfDay(clearedAt) < startOfDay(row.placed_at)) throw invalidBatch(['cleared_at: must not be before the day it was placed']);
    return { status: 200, body: batchOf(harvest.clearBatch(row.id, Math.max(clearedAt, row.placed_at))) };
  });

  // 9.7
  route('DELETE', ['api', 'batches', ':batchId'], false, false, ctx => {
    const row = loadBatch(ctx.params.batchId);
    if (harvest.countCrates(row.id) !== 0) throw new HttpError(400, 'Batch has crates', []);
    const batch = batchOf(row);
    harvest.deleteBatch(row.id);
    return { status: 200, body: batch };
  });

  // 9.8
  route('GET', ['api', 'rooms', ':id', 'harvest'], true, false, ctx => {
    const dayStart = startOfDay(clock());
    const room = db.getRoom(ctx.id);
    const rows = harvest.listBatches({ state: 'placed', room_id: ctx.id })
      .sort((a, b) => a.placed_at - b.placed_at || a.id - b.id);
    const batches = rows.map(row => {
      const crates = harvest.listCrates(row.id);
      const flushes = Rules.flushes(row, crates);
      const today = crates.filter(c => c.deleted_at == null && c.t >= dayStart).sort(byNewest);
      return {
        ...toBatch(row, crates),
        flush: flushes.length === 0 ? 0 : flushes[flushes.length - 1].n,
        today: { crates: today, kg: round2(today.reduce((s, c) => s + c.kg, 0)) },
      };
    });
    return { status: 200, body: { room: { id: room.id, name: room.name }, day_start: dayStart, batches } };
  });

  // 9.9
  route('POST', ['api', 'batches', ':batchId', 'crates'], false, true, ctx => {
    const now = clock();
    const row = loadBatch(ctx.params.batchId);
    const body = ctx.body;
    const problems = Rules.checkCrate(body);
    if (problems.length > 0) throw new HttpError(400, 'Invalid crate', problems);
    const state = Rules.state(row);
    if (state === 'received') throw new HttpError(400, 'Batch is not in a room', []);
    if (state === 'cleared') throw new HttpError(400, 'Batch is cleared', []);
    const crate = harvest.addCrate(row.id, { kg: body.kg, picker: trimText(body.picker ?? null), t: now });
    const crates = harvest.listCrates(row.id);
    const joined = Rules.flushes(row, crates).find(f => f.from <= crate.t && crate.t <= f.to);
    return { status: 201, body: { crate, flush: joined ? joined.n : 0, totals: Rules.totals(row, crates) } };
  });

  // 9.10
  route('DELETE', ['api', 'crates', ':crateId'], false, false, ctx => {
    const now = clock();
    const crate = loadCrate(ctx.params.crateId);
    if (crate.deleted_at !== null) throw new HttpError(400, 'Crate is already undone', []);
    return { status: 200, body: harvest.undoCrate(crate.id, now) };
  });

  return routes;
}

module.exports = { createHarvestRoutes, startOfDay };
