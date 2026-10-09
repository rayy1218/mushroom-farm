/*
 * harvest-rules.js: batch and harvest yield rules (contract C10; spec docs/superpowers/specs/2026-10-09-harvest-qr-design.md section 2).
 *
 * Pure: no database, no DOM. The server checks request bodies with `checkBatch` and `checkCrate` (they return a list
 * of problems and store nothing, like room-rules.js) and works out flushes and totals; the batch pages use the same
 * functions. Deleted crates (`deleted_at` set) are never counted.
 *
 * Load order: controller.js, then this file.
 */
(function (global) {
  'use strict';
  const CC = global.ClimateController;

  const DAY = 86400;
  const LIM = { blocks: [1, 1000000], blockKg: 20, gapDays: [1, 60], kg: [0.01, 50], picker: 40, text: 80, notes: 2000 };
  const DEFAULTS = { moisture_pct: 60, flush_gap_days: 5 };
  const BATCH_FIELDS = ['crop', 'strain', 'source', 'block_count', 'block_wet_kg', 'moisture_pct', 'spawn_date', 'received_at', 'flush_gap_days', 'notes'];
  const REQUIRED = ['crop', 'block_count', 'block_wet_kg', 'moisture_pct', 'received_at'];

  const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const round = (x, dp) => Math.round(x * 10 ** dp) / 10 ** dp;
  const isTime = v => Number.isInteger(v) && v >= 0;
  const isText = (v, max) => v === null || (typeof v === 'string' && v.trim().length <= max);
  // Same rule as room-rules.js hasCrop: a crop with a fruiting range.
  const hasCrop = k => typeof k === 'string' && Object.hasOwn(CC.CROPS, k) && !!CC.CROPS[k].range;
  const live = crates => crates.filter(c => c.deleted_at == null).sort((a, b) => a.t - b.t || a.id - b.id);

  function state(batch) {
    if (batch.cleared_at != null) return 'cleared';
    return batch.room_id != null ? 'placed' : 'received';
  }

  function drySubstrateKg(batch) {
    return batch.block_count * batch.block_wet_kg * (1 - batch.moisture_pct / 100);
  }

  function figures(batch, kg) {
    return {
      kg: round(kg, 2),
      g_per_block: round(kg * 1000 / batch.block_count, 1),
      be_pct: round(kg / drySubstrateKg(batch) * 100, 1),
    };
  }

  // A gap of at least flush_gap_days since the previous crate starts a new flush.
  function flushes(batch, crates) {
    const gap = batch.flush_gap_days * DAY;
    const out = [];
    let cur = null;
    for (const c of live(crates)) {
      if (cur === null || c.t - cur.to >= gap) {
        cur = { n: out.length + 1, from: c.t, to: c.t, crates: 0, kg: 0 };
        out.push(cur);
      }
      cur.to = c.t;
      cur.crates += 1;
      cur.kg += c.kg;
    }
    return out.map(f => ({ n: f.n, from: f.from, to: f.to, crates: f.crates, ...figures(batch, f.kg) }));
  }

  function totals(batch, crates) {
    const list = live(crates);
    const kg = list.reduce((s, c) => s + c.kg, 0);
    return { crates: list.length, ...figures(batch, kg), flushes: flushes(batch, crates).length };
  }

  function checkBatch(body, partial) {
    const problems = [];
    if (!isPlainObject(body)) { problems.push('body: must be an object'); return problems; }
    for (const k of Object.keys(body)) {
      if (!BATCH_FIELDS.includes(k)) problems.push(`${k}: unknown field`);
    }
    const present = k => Object.hasOwn(body, k);
    if (partial) {
      if (!BATCH_FIELDS.some(present)) problems.push('body: at least one field is required');
    } else {
      for (const k of REQUIRED) if (!present(k)) problems.push(`${k}: required`);
    }
    const b = body;
    if (present('crop') && !hasCrop(b.crop)) {
      problems.push(`crop: must be one of ${Object.keys(CC.CROPS).filter(hasCrop).join(', ')}`);
    }
    if (present('block_count') && !(Number.isInteger(b.block_count) && b.block_count >= LIM.blocks[0] && b.block_count <= LIM.blocks[1])) {
      problems.push(`block_count: must be a whole number from ${LIM.blocks[0]} to ${LIM.blocks[1]}`);
    }
    if (present('block_wet_kg') && !(Number.isFinite(b.block_wet_kg) && b.block_wet_kg > 0 && b.block_wet_kg <= LIM.blockKg)) {
      problems.push(`block_wet_kg: must be a number above 0 and at most ${LIM.blockKg}`);
    }
    if (present('moisture_pct') && !(Number.isFinite(b.moisture_pct) && b.moisture_pct >= 0 && b.moisture_pct < 100)) {
      problems.push('moisture_pct: must be a number from 0 to below 100');
    }
    if (present('flush_gap_days') && !(Number.isInteger(b.flush_gap_days) && b.flush_gap_days >= LIM.gapDays[0] && b.flush_gap_days <= LIM.gapDays[1])) {
      problems.push(`flush_gap_days: must be a whole number from ${LIM.gapDays[0]} to ${LIM.gapDays[1]}`);
    }
    if (present('received_at') && !isTime(b.received_at)) problems.push('received_at: must be whole seconds since 1970');
    if (present('spawn_date') && b.spawn_date !== null && !isTime(b.spawn_date)) {
      problems.push('spawn_date: must be whole seconds since 1970, or null');
    }
    for (const k of ['strain', 'source']) {
      if (present(k) && !isText(b[k], LIM.text)) problems.push(`${k}: must be text of at most ${LIM.text} characters, or null`);
    }
    if (present('notes') && !isText(b.notes, LIM.notes)) problems.push(`notes: must be text of at most ${LIM.notes} characters, or null`);
    return problems;
  }

  function checkCrate(body) {
    const problems = [];
    if (!isPlainObject(body)) { problems.push('body: must be an object'); return problems; }
    for (const k of Object.keys(body)) {
      if (k !== 'kg' && k !== 'picker') problems.push(`${k}: unknown field`);
    }
    if (!Object.hasOwn(body, 'kg')) problems.push('kg: required');
    else if (!(Number.isFinite(body.kg) && body.kg >= LIM.kg[0] && body.kg <= LIM.kg[1])) {
      problems.push(`kg: must be a number from ${LIM.kg[0]} to ${LIM.kg[1]} kg`);
    }
    if (Object.hasOwn(body, 'picker') && !isText(body.picker, LIM.picker)) {
      problems.push(`picker: must be text of at most ${LIM.picker} characters, or null`);
    }
    return problems;
  }

  global.FarmHarvestRules = { DAY, LIM, DEFAULTS, state, drySubstrateKg, flushes, totals, checkBatch, checkCrate };
})(typeof window !== 'undefined' ? window : globalThis);
