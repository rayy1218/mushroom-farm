# Batches and harvest by room QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workers scan a room's QR sticker and record each crate's weight against a batch; the office records batches of bought blocks and sees kg, g per block and BE % per flush.

**Architecture:** A new pure module `harvest-rules.js` (`FarmHarvestRules`) holds validation and yield arithmetic for server and browser. A vendored QR encoder (`web/vendor/qrcodegen.js`) draws the stickers. The store (`server/harvest-db.js`) and the routes (`server/harvest-api.js`) live in their own files and plug into C1 and C3 through `db.sqlite` and `createApi({ extraRoutes })`. Contract C10 (`docs/contracts/harvest.md`) is folded into the wave 2 contracts and frozen with them; prep 2.0 lays down the lead's harvest files; three harvest streams run in parallel with the nine wave 2 streams; gate 2.5 and wave 3 cover them.

**Tech Stack:** Plain JavaScript (browser IIFEs + Node 22), `node:test`, `node:sqlite`, no build step, no npm dependencies (the encoder is compiled from TypeScript once, at vendoring time).

**Spec:** `docs/superpowers/specs/2026-10-09-harvest-qr-design.md`. **Contract:** `docs/contracts/harvest.md` (C10, draft revision 1; section 14 lists the changes to fold into C1, C3, C5 and the wave 2 plan; section 15 the proposed lead decisions H1–H10).

---

## When this runs

Inside wave 2 (proposed lead decision H1, owner's choice 2026-10-09). The steps map onto the wave 2 plan's phases:

| Step here | Wave 2 phase | Who |
|---|---|---|
| 0.1 | Contract freeze (prep 2.0 step 1) | The session that leads wave 2 |
| 0.2–0.4 | Prep 2.0 steps 2–6 | Lead |
| 1 | Streams | Harvest data, Harvest API, Harvest web, beside the nine wave 2 streams |
| 2 | Gate 2.5 and wave 3 | Lead |

On 2026-10-09 another session is reworking the wave 2 drafts on `wave2/contracts` (worktree `w2-contracts`). This branch (`docs/harvest-spec`) never edits that branch; the wave 2 lead folds C10 in (task 0.1). The code of tasks 0.2 and 0.3 was run and passes (43 + 2 tests on 2026-10-09).

## Files and who owns them

C10 section 2 is the owner table. In short:

| Step | Owner | Files |
|---|---|---|
| 0 | Lead | `harvest-rules.js`, `tests/harvest-rules.test.js`, `web/vendor/qrcodegen.js`, `tests/qrcodegen.test.js`, `server/harvest-schema.js`, `server/api-common.js`, `tests/fakes/harvest-db.js`, `tests/fake-harvest-db.test.js`, stubs `web/batches.js`, `web/harvest.js`, `web/harvest.css`; the C10 14 lines in `index.html`, `web/api.js`, `tests/web-api.test.js`, `tests/fakes/api-server.js`, `tests/fake-api-server.test.js`, `tests/fakes/db.js` |
| 1 | Harvest data | `server/harvest-db.js`, `tests/harvest-db.test.js` |
| 1 | Harvest API | `server/harvest-api.js`, `tests/harvest-api.test.js` |
| 1 | Harvest web | `web/batches.js`, `web/harvest.js`, `web/harvest.css` (replacing the stubs), `tests/web-batches.test.js`, `tests/web-harvest.test.js` |
| 1 | Data 2, Server 2, Room shell (their briefs gain the C10 14 rows) | `server/db.js` (upgrade 4, `db.sqlite`), `server/api.js` (`extraRoutes`, `HttpError`), `server/static.js` (`/harvest-rules.js`), `web/shell.js` (four routes, bare layout) and their tests |
| 2 | Lead | `server/main.js` (C10 8.4), `tests/api-real.test.js` (C10 9), `docs/ROADMAP.md` |

Worktrees live under `~/.config/superpowers/worktrees/mushroom-farm/` (never `/tmp`: it is wiped on reboot).

## Step 0: lead

### Task 0.1: Fold C10 into the wave 2 contracts (wave 2 lead)

- [ ] **Step 1:** Bring this branch's documents into the wave 2 contracts branch:

```bash
cd ~/.config/superpowers/worktrees/mushroom-farm/w2-contracts
git merge --no-ff docs/harvest-spec -m "Merge docs/harvest-spec (C10 draft, harvest spec and plan) into wave2/contracts"
# a conflict can only be in docs/ROADMAP.md: keep wave2/contracts' rows, re-apply the two harvest rows and the order table
```

- [ ] **Step 2:** Apply every row of C10 section 14 to `db.md`, `api.md`, `web.md` and the wave 2 plan (each change in its contract's "Changes in revision N" table); record H1–H10 as lead decisions with the next free numbers in `LEAD-DECISIONS.md`, and replace "H<n>" in C10 with them.
- [ ] **Step 3:** Two reviews of C10 with the other contracts (an Opus reviewer for consistency with C1, C3, C5; a second for testability), as the wave 2 freeze check; fix every blocking and important finding.
- [ ] **Step 4:** Freeze C10 (revision 1) in the same commit as the wave 2 contracts.

### Task 0.2: `harvest-rules.js` (`FarmHarvestRules`)

**Files:** Create `harvest-rules.js`, `tests/harvest-rules.test.js`.

- [ ] **Step 1: Write the failing test** `tests/harvest-rules.test.js`:

```js
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
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/harvest-rules.test.js`
Expected: FAIL, `Cannot find module '../harvest-rules.js'`.

- [ ] **Step 3: Write the module** `harvest-rules.js`:

```js
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
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/harvest-rules.test.js`
Expected: `# pass 43`, `# fail 0`. Then `npm test`: all pass.

- [ ] **Step 5: Commit**

```bash
git add harvest-rules.js tests/harvest-rules.test.js
git commit -m "feat: harvest-rules.js, batch and crate checks, flushes and yield (C10)"
```

### Task 0.3: Vendor the QR encoder

Project Nayuki's QR Code generator (MIT) ships only TypeScript (`typescript-javascript/qrcodegen.ts`, 990 lines; it uses `namespace`, which Node cannot strip). It is compiled once to a plain script that defines the global `qrcodegen`.

**Files:** Create `web/vendor/qrcodegen.js`, `tests/qrcodegen.test.js`.

- [ ] **Step 1: Write the failing test** `tests/qrcodegen.test.js`:

```js
'use strict';
// web/vendor/qrcodegen.js: the vendored QR encoder (contract C10). The fingerprint below was recorded when the
// file was vendored, after zbarimg decoded the same code back to the same link.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function load() {
  const ctx = {};
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '../web/vendor/qrcodegen.js'), 'utf8');
  vm.runInContext(src + '\nthis.qrcodegen = qrcodegen;', ctx);
  return ctx.qrcodegen;
}

const matrix = qr => {
  let s = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) s += qr.getModule(x, y) ? '1' : '0';
    s += '\n';
  }
  return s;
};

test('a sticker link at error correction Q gives the recorded code', () => {
  const { QrCode } = load();
  const qr = QrCode.encodeText('http://192.168.1.20:8080/#/harvest/3', QrCode.Ecc.QUARTILE);
  assert.equal(qr.version, 4);
  assert.equal(qr.size, 33);
  assert.equal(qr.mask, 3);
  assert.equal(crypto.createHash('sha256').update(matrix(qr)).digest('hex'),
    'd131a92da320c875205c3dda3375e983cac50a78b1e583b68fa754846885cd4f');
});

test('the three finder patterns are in the corners', () => {
  const { QrCode } = load();
  const qr = QrCode.encodeText('http://192.168.1.20:8080/#/harvest/3', QrCode.Ecc.QUARTILE);
  const ring = [0, 6];
  for (const [ox, oy] of [[0, 0], [qr.size - 7, 0], [0, qr.size - 7]]) {
    for (let i = 0; i < 7; i++) {
      for (const r of ring) {
        assert.equal(qr.getModule(ox + i, oy + r), true);
        assert.equal(qr.getModule(ox + r, oy + i), true);
      }
    }
    assert.equal(qr.getModule(ox + 3, oy + 3), true);
    assert.equal(qr.getModule(ox + 1, oy + 1), false);
  }
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/qrcodegen.test.js`
Expected: FAIL, `ENOENT` for `web/vendor/qrcodegen.js`.

- [ ] **Step 3: Download the pinned source into its own folder and compile it there** (the source is outside data: keep it out of the repo)

```bash
mkdir -p ~/Documents/mushroom-farm-drafts/qrvendor/src ~/Documents/mushroom-farm-drafts/qrvendor/out
cd ~/Documents/mushroom-farm-drafts/qrvendor
curl -sSfo src/qrcodegen.ts https://raw.githubusercontent.com/nayuki/QR-Code-generator/3c6d0b3cefb4e049dc337e82237c9644399716a8/typescript-javascript/qrcodegen.ts
npx -y -p typescript@5.9.3 tsc --target es2017 --outDir out src/qrcodegen.ts
wc -l out/qrcodegen.js    # expected: 836
```

- [ ] **Step 4: Copy it into the repo with a header**

```bash
cd ~/.config/superpowers/worktrees/mushroom-farm/lead
mkdir -p web/vendor
{ printf '%s\n' \
  '// Vendored: Project Nayuki QR Code generator (MIT), typescript-javascript/qrcodegen.ts at commit' \
  '// 3c6d0b3cefb4e049dc337e82237c9644399716a8, compiled once with: npx -p typescript@5.9.3 tsc --target es2017' \
  '// Do not edit. Defines the global `qrcodegen` (a classic script, like the other web modules).'
  cat ~/Documents/mushroom-farm-drafts/qrvendor/out/qrcodegen.js; } > web/vendor/qrcodegen.js
sha256sum web/vendor/qrcodegen.js
# expected: 10bf7495cf280dfc6d03fb37cebfb4e608b7a165e87f36409c11341e3f229af1
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/qrcodegen.test.js`
Expected: `# pass 2`. If the hash in step 4 differs, the fingerprint test is what matters: it must pass unchanged.

- [ ] **Step 6: Decode check with a real reader** (optional; done on 2026-10-09 with `zbarimg 0.23`, which read back `http://192.168.1.20:8080/#/harvest/3`). Write the code as a PBM image and decode it:

```bash
node -e "
const vm=require('node:vm'),fs=require('node:fs');const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('web/vendor/qrcodegen.js','utf8')+'\nthis.q=qrcodegen;',ctx);
const {QrCode}=ctx.q;const qr=QrCode.encodeText('http://192.168.1.20:8080/#/harvest/3',QrCode.Ecc.QUARTILE);
const S=8,Q=4,n=(qr.size+2*Q)*S,rows=[];
for(let py=0;py<n;py++){const r=[];for(let px=0;px<n;px++){const x=Math.floor(px/S)-Q,y=Math.floor(py/S)-Q;
r.push(x>=0&&y>=0&&x<qr.size&&y<qr.size&&qr.getModule(x,y)?1:0);}rows.push(r.join(' '));}
fs.writeFileSync(process.argv[1],'P1\n'+n+' '+n+'\n'+rows.join('\n')+'\n');" ~/Documents/mushroom-farm-drafts/qrvendor/test.pbm
zbarimg -q ~/Documents/mushroom-farm-drafts/qrvendor/test.pbm
# expected: QR-Code:http://192.168.1.20:8080/#/harvest/3
```

- [ ] **Step 7: Commit**

```bash
git add web/vendor/qrcodegen.js tests/qrcodegen.test.js
git commit -m "chore(web): vendor Nayuki QR Code generator (MIT, pinned 3c6d0b3, compiled with tsc 5.9.3)"
```

### Task 0.4: The rest of the lead's harvest files (prep 2.0)

**Files:** Create `server/harvest-schema.js`, `server/api-common.js`, `web/batches.js`, `web/harvest.js`, `web/harvest.css`, `tests/fakes/harvest-db.js`, `tests/fake-harvest-db.test.js`. Modify `index.html`, `web/api.js`, `tests/web-api.test.js`, `tests/fakes/api-server.js`, `tests/fake-api-server.test.js`, `tests/fakes/db.js`, `tests/fake-db.test.js`.

- [ ] **Step 1:** `server/harvest-schema.js`:

```js
// server/harvest-schema.js: the SQL of schema upgrade 4 (C10 section 3). Released upgrades are never edited (C1 3).
const SCHEMA_V4_HARVEST = `
-- Upgrade 4: batches and harvest by room QR (C10).

CREATE TABLE batches (
  id             INTEGER PRIMARY KEY,
  crop           TEXT    NOT NULL,
  strain         TEXT,
  source         TEXT,
  block_count    INTEGER NOT NULL CHECK (block_count >= 1),
  block_wet_kg   REAL    NOT NULL CHECK (block_wet_kg > 0),
  moisture_pct   REAL    NOT NULL CHECK (moisture_pct >= 0 AND moisture_pct < 100),
  spawn_date     INTEGER,
  received_at    INTEGER NOT NULL,
  room_id        INTEGER REFERENCES rooms (id),
  placed_at      INTEGER,
  cleared_at     INTEGER,
  flush_gap_days INTEGER NOT NULL DEFAULT 5 CHECK (flush_gap_days >= 1),
  notes          TEXT,
  created_at     INTEGER NOT NULL,
  CHECK ((room_id IS NULL) = (placed_at IS NULL)),
  CHECK (placed_at IS NULL OR placed_at >= received_at),
  CHECK (cleared_at IS NULL OR (placed_at IS NOT NULL AND cleared_at >= placed_at))
) STRICT;
CREATE INDEX batches_room ON batches (room_id, cleared_at);

CREATE TABLE harvest_crates (
  id         INTEGER PRIMARY KEY,
  batch_id   INTEGER NOT NULL REFERENCES batches (id),
  t          INTEGER NOT NULL,
  kg         REAL    NOT NULL CHECK (kg >= 0.01 AND kg <= 50),
  picker     TEXT,
  deleted_at INTEGER
) STRICT;
CREATE INDEX harvest_crates_batch ON harvest_crates (batch_id, t);
`;

module.exports = { SCHEMA_V4_HARVEST };
```

Check it runs on a fresh database with a `rooms` table:

```bash
node --disable-warning=ExperimentalWarning -e "
const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE rooms (id INTEGER PRIMARY KEY) STRICT;'); db.exec(require('./server/harvest-schema.js').SCHEMA_V4_HARVEST);
console.log(db.prepare(\"SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name\").all().map(r => r.name).join(' '));"
# expected: batches batches_room harvest_crates harvest_crates_batch rooms
```

- [ ] **Step 2:** `server/api-common.js`: exactly the code block of C10 8.1.
- [ ] **Step 3:** Stubs. `web/batches.js` and `web/harvest.js` each hold only the C5 1.4 wrapper:

```js
(function (global) { 'use strict'; })(typeof window !== 'undefined' ? window : globalThis);
```

`web/harvest.css` holds one line: `/* Harvest pages (C10 12): written by the Harvest web stream. */`

- [ ] **Step 4:** `index.html`: the C10 14 row "C5 1.2" (one stylesheet link, the **Batches** menu link, four script tags), on top of the prep 2.0 file of C5 1.2.
- [ ] **Step 5:** `web/api.js`: the ten functions of C10 12.1, added to the `FarmApi` object:

```js
function listBatches({ state, room } = {}) { return request('GET', '/api/batches', { query: { state, room } }); }
function createBatch(fields) { return request('POST', '/api/batches', { body: fields }); }
function getBatch(batchId) { return request('GET', `/api/batches/${batchId}`); }
function updateBatch(batchId, fields) { return request('PATCH', `/api/batches/${batchId}`, { body: fields }); }
function placeBatch(batchId, body) { return request('POST', `/api/batches/${batchId}/place`, { body }); }
function clearBatch(batchId, body = {}) { return request('POST', `/api/batches/${batchId}/clear`, { body }); }
function deleteBatch(batchId) { return request('DELETE', `/api/batches/${batchId}`); }
function getRoomHarvest(id) { return request('GET', `/api/rooms/${id}/harvest`); }
function addCrate(batchId, body) { return request('POST', `/api/batches/${batchId}/crates`, { body }); }
function undoCrate(crateId) { return request('DELETE', `/api/crates/${crateId}`); }
```

and in `tests/web-api.test.js`, one test per function against `startFakeApi()`: method, path, query (`listBatches({ state: 'placed', room: 2 })` sends `?state=placed&room=2`; `listBatches()` sends no query), body (`clearBatch(4)` sends `{}`), and the reply passed through.
- [ ] **Step 6:** `tests/fakes/api-server.js`: `GET /api/batches` answers `[]` by default; with `root`, `/harvest-rules.js` is served. `tests/fake-api-server.test.js`: both.
- [ ] **Step 7:** `tests/fakes/db.js`: `version` 4 and `sqlite: null` (C10 14, C1 rows); `tests/fake-db.test.js` checks both.
- [ ] **Step 8:** `tests/fakes/harvest-db.js` (`openFakeHarvest`, C10 5.4) and `tests/fake-harvest-db.test.js`: every function of C10 5.2 (shape, order, defaults, `NotFoundError` with `what` `batch` / `crate` / `room`, unknown field `TypeError`) and every rule of section 3 with its `errcode` (275, 1299, 3091; 787 for `deleteBatch` with crates).
- [ ] **Step 9:** Run and commit:

```bash
npm test     # expected: # fail 0
git add server/harvest-schema.js server/api-common.js web/batches.js web/harvest.js web/harvest.css index.html web/api.js \
  tests/web-api.test.js tests/fakes/api-server.js tests/fake-api-server.test.js tests/fakes/db.js tests/fake-db.test.js \
  tests/fakes/harvest-db.js tests/fake-harvest-db.test.js
git commit -m "chore: prep 2.0 harvest files (C10 2): schema, HttpError, stubs, FarmApi, fakes"
```

### Task 0.5: Briefs

- [ ] **Step 1:** Write `harvest-data.md`, `harvest-api.md` and `harvest-web.md` in `docs/superpowers/plans/2026-10-08-farm-foundation/` with the other wave 2 briefs (wave 2 plan prep 2.0 step 6): owned files exactly as C10 2, start checks (wave 2 plan 4, plus `ls harvest-rules.js server/harvest-schema.js server/api-common.js tests/fakes/harvest-db.js`), TDD tasks against C10 and the fakes, done-when from C10 13.
- [ ] **Step 2:** Add the C10 14 rows to the Data 2, Server 2, Room shell and Docs briefs.

## Step 1: streams

Three streams beside the nine wave 2 streams (wave 2 plan 3, 4 rules apply: no merging of `master`, contract questions go to the lead).

| Stream | Branch | Builds against | Done when |
|---|---|---|---|
| Harvest data | `stream/harvest-data` | C10 3, 5; the fake db; a real `openDb(':memory:')` needs upgrade 4, which is Data 2's: until gate 2.5 the real-store half of `tests/harvest-db.test.js` opens a `DatabaseSync` itself, runs `SCHEMA_V4_HARVEST` on it, and passes `{ version: 4, sqlite, getRoom }` as `db` | Every C10 13 row of `tests/harvest-db.test.js` passes on the fake and on that stand-in |
| Harvest API | `stream/harvest-api` | C10 4, 6–9; the fake db and fake store | Every C10 13 row of `tests/harvest-api.test.js` passes |
| Harvest web | `stream/harvest-web` | C10 10–12; the fake API server | Node helpers pass (C10 13); no headless check: the harvest pages are the lead's wave 3 check (C5 7.10) |

## Step 2: lead

### Task 2.1: Gate 2.5 additions

- [ ] **Step 1:** After Data 2, Equipment and Server 2: merge `stream/harvest-data`, then `stream/harvest-api`; `npm test`. Expected: `# fail 0`. In `tests/harvest-db.test.js`, point the real-store half at `openDb(':memory:')` (upgrade 4 is now in `UPGRADES`).
- [ ] **Step 2:** `server/main.js`: the C10 8.4 wiring only (with the `openHarvest` failure rule of C3 2.2).
- [ ] **Step 3:** The gate's real-server run on the version 1 and version 2 file copies: `db.version` 4; `curl` creates a batch (`POST /api/batches`), places it in Room 1, adds two crates; `GET /api/batches/<id>` gives the totals `harvest-rules.js` gives for the same crates; `GET /api/rooms/1/harvest` lists today's crates.

### Task 2.2: Wave 3

- [ ] **Step 1:** Merge `stream/harvest-web` in the wave 2 plan's order; `tests/api-real.test.js` covers C10 9.1–9.10; the headless rows of C10 13 again on the final merge.
- [ ] **Step 2:** Phone check (C10 13): print one sticker, scan it with a real phone on the farm Wi-Fi, record two crates, Undo one, see them on `#/batches/:id`.
- [ ] **Step 3:** `docs/ROADMAP.md`: Batches and Harvest rows ✅; commit:

```bash
git add docs/ROADMAP.md
git commit -m "docs: batches and harvest by room QR built"
```
