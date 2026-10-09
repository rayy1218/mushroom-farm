'use strict';
// harvest-rules.js: FarmHarvestRules (contract C10; spec 2026-10-09-harvest-qr-design.md section 2).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

require('../controller.js');
require('../harvest-rules.js');

const H = globalThis.FarmHarvestRules;
const DAY = 86400;
const T0 = 1791450000;
// 1000 blocks of 1.2 kg at 60 % moisture: 480 kg dry substrate.
const BATCH = { block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, flush_gap_days: 5, room_id: 3, cleared_at: null };
const crate = (id, day, kg, deleted_at = null) => ({ id, batch_id: 1, t: Math.round(T0 + day * DAY), kg, deleted_at });
const GOOD = { crop: 'oyster', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: T0 };

describe('members', () => {
  test('exports exactly these names', () => {
    assert.deepStrictEqual(Object.keys(H).sort(),
      ['DAY', 'DEFAULTS', 'LIM', 'checkBatch', 'checkCrate', 'drySubstrateKg', 'flushes', 'state', 'totals']);
    assert.equal(H.DAY, 86400);
    assert.deepStrictEqual(H.DEFAULTS, { moisture_pct: 60, flush_gap_days: 5 });
  });
});

describe('state', () => {
  test('received, placed, cleared', () => {
    assert.equal(H.state({ room_id: null, cleared_at: null }), 'received');
    assert.equal(H.state({ room_id: 3, cleared_at: null }), 'placed');
    assert.equal(H.state({ room_id: 3, cleared_at: T0 }), 'cleared');
  });
});

describe('drySubstrateKg', () => {
  test('block_count x block_wet_kg x (1 - moisture)', () => {
    assert.ok(Math.abs(H.drySubstrateKg(BATCH) - 480) < 1e-9);
    assert.ok(Math.abs(H.drySubstrateKg({ ...BATCH, moisture_pct: 0 }) - 1200) < 1e-9);
  });
});

describe('flushes', () => {
  test('no crates: no flushes', () => {
    assert.deepStrictEqual(H.flushes(BATCH, []), []);
  });

  test('groups by the gap and gives the figures per flush', () => {
    const crates = [crate(1, 0, 10), crate(2, 1, 12), crate(3, 2, 8), crate(4, 14, 6)];
    assert.deepStrictEqual(H.flushes(BATCH, crates), [
      { n: 1, from: T0, to: T0 + 2 * DAY, crates: 3, kg: 30, g_per_block: 30, be_pct: 6.3 },
      { n: 2, from: T0 + 14 * DAY, to: T0 + 14 * DAY, crates: 1, kg: 6, g_per_block: 6, be_pct: 1.3 },
    ]);
  });

  test('a gap of exactly flush_gap_days starts a new flush; one second less does not', () => {
    assert.equal(H.flushes(BATCH, [crate(1, 0, 1), crate(2, 5, 1)]).length, 2);
    const justUnder = { ...crate(2, 0, 1), t: T0 + 5 * DAY - 1 };
    assert.equal(H.flushes(BATCH, [crate(1, 0, 1), justUnder]).length, 1);
  });

  test('the gap is measured from the previous crate, not the start of the flush', () => {
    const crates = [0, 4, 8, 12].map((d, i) => crate(i + 1, d, 1));
    assert.equal(H.flushes(BATCH, crates).length, 1);
  });

  test('sorts by time; does not change the input', () => {
    const crates = [crate(2, 14, 6), crate(1, 0, 10)];
    const copy = structuredClone(crates);
    assert.deepStrictEqual(H.flushes(BATCH, crates).map(f => f.from), [T0, T0 + 14 * DAY]);
    assert.deepStrictEqual(crates, copy);
  });

  test('deleted crates are not counted and do not bridge a gap', () => {
    const crates = [crate(1, 0, 10), crate(2, 4, 99, T0 + 4 * DAY), crate(3, 8, 5)];
    const f = H.flushes(BATCH, crates);
    assert.equal(f.length, 2);
    assert.deepStrictEqual(f.map(x => x.kg), [10, 5]);
  });

  test('a different flush_gap_days regroups', () => {
    const crates = [crate(1, 0, 1), crate(2, 6, 1)];
    assert.equal(H.flushes(BATCH, crates).length, 2);
    assert.equal(H.flushes({ ...BATCH, flush_gap_days: 7 }, crates).length, 1);
  });
});

describe('totals', () => {
  test('all live crates', () => {
    const crates = [crate(1, 0, 10), crate(2, 1, 12), crate(3, 2, 8), crate(4, 14, 6), crate(5, 15, 50, T0)];
    assert.deepStrictEqual(H.totals(BATCH, crates), { crates: 4, kg: 36, g_per_block: 36, be_pct: 7.5, flushes: 2 });
  });

  test('no crates', () => {
    assert.deepStrictEqual(H.totals(BATCH, []), { crates: 0, kg: 0, g_per_block: 0, be_pct: 0, flushes: 0 });
  });

  test('kg is rounded to 2 decimals', () => {
    assert.equal(H.totals(BATCH, [crate(1, 0, 0.1), crate(2, 0, 0.2)]).kg, 0.3);
  });
});

describe('checkBatch', () => {
  test('a complete batch passes', () => {
    assert.deepStrictEqual(H.checkBatch(GOOD, false), []);
    assert.deepStrictEqual(H.checkBatch({ ...GOOD, strain: 'LM-01', source: 'own', spawn_date: T0 - 30 * DAY, flush_gap_days: 7, notes: '' }, false), []);
    assert.deepStrictEqual(H.checkBatch({ ...GOOD, strain: null, source: null, spawn_date: null, notes: null }, false), []);
  });

  test('not an object', () => {
    assert.deepStrictEqual(H.checkBatch(null, false), ['body: must be an object']);
    assert.deepStrictEqual(H.checkBatch([], true), ['body: must be an object']);
  });

  test('create needs the five required fields', () => {
    assert.deepStrictEqual(H.checkBatch({}, false),
      ['crop: required', 'block_count: required', 'block_wet_kg: required', 'moisture_pct: required', 'received_at: required']);
  });

  test('unknown fields, including room and state fields', () => {
    assert.deepStrictEqual(H.checkBatch({ ...GOOD, room_id: 3, cleared_at: T0 }, false), ['room_id: unknown field', 'cleared_at: unknown field']);
  });

  test('edit needs at least one field; any one field is enough', () => {
    assert.deepStrictEqual(H.checkBatch({}, true), ['body: at least one field is required']);
    assert.deepStrictEqual(H.checkBatch({ notes: 'moved to rack 2' }, true), []);
  });

  for (const [field, bad] of [
    ['crop', 'lionsmane-typo'], ['crop', 3],
    ['block_count', 0], ['block_count', 1.5], ['block_count', 1000001],
    ['block_wet_kg', 0], ['block_wet_kg', 20.01], ['block_wet_kg', '1.2'],
    ['moisture_pct', 100], ['moisture_pct', -1], ['moisture_pct', NaN],
    ['flush_gap_days', 0], ['flush_gap_days', 61], ['flush_gap_days', 2.5],
    ['received_at', 1.5], ['received_at', -1], ['received_at', null],
    ['spawn_date', 'yesterday'],
    ['strain', 'x'.repeat(81)], ['source', 5], ['notes', 'x'.repeat(2001)],
  ]) {
    test(`${field} = ${JSON.stringify(bad)} is refused`, () => {
      const problems = H.checkBatch({ ...GOOD, [field]: bad }, false);
      assert.equal(problems.length, 1);
      assert.ok(problems[0].startsWith(`${field}: must be`), problems[0]);
    });
  }

  test('the limits themselves pass', () => {
    assert.deepStrictEqual(H.checkBatch({ block_count: 1, block_wet_kg: 20, moisture_pct: 0, flush_gap_days: 60 }, true), []);
    assert.deepStrictEqual(H.checkBatch({ block_count: 1000000, moisture_pct: 99.9, flush_gap_days: 1 }, true), []);
  });
});

describe('checkCrate', () => {
  test('kg with or without a picker', () => {
    assert.deepStrictEqual(H.checkCrate({ kg: 12.5 }), []);
    assert.deepStrictEqual(H.checkCrate({ kg: 12.5, picker: 'Aminah' }), []);
    assert.deepStrictEqual(H.checkCrate({ kg: 0.01, picker: null }), []);
    assert.deepStrictEqual(H.checkCrate({ kg: 50 }), []);
  });

  test('kg is required and must be 0.01 to 50', () => {
    assert.deepStrictEqual(H.checkCrate({}), ['kg: required']);
    for (const kg of [0, 0.009, 50.01, 125, '12.5', null, Infinity]) {
      assert.deepStrictEqual(H.checkCrate({ kg }), ['kg: must be a number from 0.01 to 50 kg'], String(kg));
    }
  });

  test('picker at most 40 characters; unknown fields', () => {
    assert.deepStrictEqual(H.checkCrate({ kg: 1, picker: 'x'.repeat(41) }), ['picker: must be text of at most 40 characters, or null']);
    assert.deepStrictEqual(H.checkCrate({ kg: 1, batch_id: 2 }), ['batch_id: unknown field']);
    assert.deepStrictEqual(H.checkCrate('12'), ['body: must be an object']);
  });
});
