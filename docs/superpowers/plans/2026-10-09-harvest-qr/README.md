# Batches and harvest by room QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Workers scan a room's QR sticker and record each crate's weight against a batch; the office records batches of bought blocks and sees kg, g per block and BE % per flush.

**Architecture:** A new pure module `harvest-rules.js` (`FarmHarvestRules`) holds validation and yield arithmetic for server and browser. A vendored QR encoder (`web/vendor/qrcodegen.js`) draws the stickers. Contract C10 (`docs/contracts/harvest.md`) is frozen first, against the contracts as they stand after wave 2; then three streams (Data, API, Web) work in parallel worktrees; the lead merges and runs the gate.

**Tech Stack:** Plain JavaScript (browser IIFEs + Node 22), `node:test`, `node:sqlite`, no build step, no npm dependencies (the encoder is compiled from TypeScript once, at vendoring time).

**Spec:** `docs/superpowers/specs/2026-10-09-harvest-qr-design.md`. **Contract:** `docs/contracts/harvest.md` (C10, written in task 0.4).

---

## When this runs

This wave starts only after C9 (air exchange) and wave 2 have merged into `master`. The wave 2 contracts (C1 r5, C3 r8, web contract) are not frozen yet (`wave2/contracts-folded`), so C10 and the stream briefs are written against them only once they are on `master` (tasks 0.4 and 0.5). Tasks 0.2 and 0.3 depend on nothing in flight; their code below was run and passes (43 + 2 tests on 2026-10-09).

## Files and who owns them

| Step | Owner | Brief | Files |
|---|---|---|---|
| 0 | Lead | This file, tasks 0.1–0.5 | `harvest-rules.js`, `tests/harvest-rules.test.js`, `web/vendor/qrcodegen.js`, `tests/qrcodegen.test.js`, `docs/contracts/harvest.md`, `docs/contracts/LEAD-DECISIONS.md`, stream briefs in this folder |
| 1 | Data stream | `data.md` (task 0.5) | `server/db.js` (upgrade and functions), `tests/fakes/db.js`, `tests/db.test.js`, `tests/fake-db.test.js` |
| 1 | API stream | `api.md` (task 0.5) | `server/api.js` (routes), `server/static.js` (two static files), `tests/api.test.js`, `tests/fakes/api-server.js` (array routes) |
| 1 | Web stream | `web.md` (task 0.5) | `web/batches.js`, `web/harvest.js`, `web/api.js` (functions), `web/shell.js` (routes, menu, bare layout), `index.html`, `styles.css`, `tests/web-batches.test.js`, `tests/web-harvest.test.js` |
| 2 | Lead | This file, tasks 2.1–2.5 | `docs/ROADMAP.md`, `README.md` |

Merge order at step 2: data → api → web. Each stream branches from the step 0 commit. Worktrees live under `~/.config/superpowers/worktrees/mushroom-farm/` (never `/tmp`: it is wiped on reboot).

## Step 0: lead

### Task 0.1: Base

- [ ] **Step 1:** Check that C9 and wave 2 are merged and `master` is green:

```bash
cd ~/.config/superpowers/worktrees/mushroom-farm/lead
git switch master && git log --oneline -5
npm test            # expected: all pass
```

- [ ] **Step 2:** Rebase the spec branch on `master` and merge it (spec, roadmap order, this plan):

```bash
cd ~/.config/superpowers/worktrees/mushroom-farm/harvest-spec
git rebase master   # a conflict can only be in docs/ROADMAP.md: keep master's rows, re-apply the two harvest rows and the order table
cd ../lead && git merge --no-ff docs/harvest-spec -m "Merge docs/harvest-spec (batches and harvest by room QR: spec and plan)"
```

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

### Task 0.4: Write and freeze C10 (`docs/contracts/harvest.md`)

Written against the contracts on `master` after wave 2, in the same style (frozen header, revision table, "General rules" table, exact SQL, exact JSON, error codes). Every item below gets a table, never a paragraph list.

| Section | Must define | Starting point |
|---|---|---|
| 1. Scope and owners | Which stream owns which file (table above) | – |
| 2. Schema upgrade | The next free C1 upgrade number; exact SQL; the upgrade test from the previous version | SQL below (checked on `node:sqlite` 2026-10-09: every `CHECK` and foreign key fires as intended) |
| 3. `harvest-rules.js` | The members as task 0.2 built them; load order `controller.js` → `harvest-rules.js` | Task 0.2 |
| 4. db functions | Signatures, returns, errors (C1 style: synchronous, `NotFoundError`, unknown keys throw `TypeError`); the fake follows them | List below |
| 5. Routes | Exact request and reply JSON per route, status codes, the error body; the server checks `received_at ≤ placed_at` and room not archived before writing | Spec section 3 |
| 6. "Today" | From local midnight of the farm device (`new Date(); setHours(0, 0, 0, 0)`), farm device time zone `Asia/Kuala_Lumpur` | – |
| 7. Static files | `/harvest-rules.js` and `/web/vendor/qrcodegen.js` served; `index.html` script order | – |
| 8. Web | `FarmApi` functions (one per route), shell routes `#/batches`, `#/batches/:id`, `#/harvest/stickers`, `#/harvest/:id` (`stickers` matched before `:id`), menu entry **Batches**, body class that hides the menu on `#/harvest/:id`, element ids the web tests use | Spec section 4 |
| 9. Fakes | `tests/fakes/db.js` and `tests/fakes/api-server.js` additions | – |

Draft SQL:

```sql
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
  room_id        INTEGER REFERENCES rooms(id),
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
  batch_id   INTEGER NOT NULL REFERENCES batches(id),
  t          INTEGER NOT NULL,
  kg         REAL    NOT NULL CHECK (kg >= 0.01 AND kg <= 50),
  picker     TEXT,
  deleted_at INTEGER
) STRICT;
CREATE INDEX harvest_crates_batch ON harvest_crates (batch_id, t);
```

Draft db functions:

| Function | Returns | Notes |
|---|---|---|
| `createBatch(fields, at?)` | Batch row | `created_at = at`; `flush_gap_days` defaults to 5 |
| `getBatch(id)` | Batch row | `NotFoundError` |
| `listBatches({ state?, room_id? })` | Batch rows, newest `received_at` first | `state`: `received`, `placed`, `cleared` |
| `updateBatch(id, fields)` | Batch row | Only the editable fields of spec section 3 |
| `placeBatch(id, room_id, placed_at)` | Batch row | |
| `clearBatch(id, cleared_at)` | Batch row | |
| `deleteBatch(id)` | – | The caller checks for crates first |
| `addCrate(batch_id, { kg, picker }, t?)` | Crate row | |
| `listCrates(batch_id, { from? })` | Crate rows, oldest first, deleted ones included | The rules skip deleted ones |
| `deleteCrate(id, at?)` | Crate row | Sets `deleted_at` |

- [ ] **Step 1:** Write `docs/contracts/harvest.md` with the nine sections.
- [ ] **Step 2:** Two reviews (an Opus reviewer for consistency with C1, C3 and the web contract; a second for testability), fix every blocking and important finding, record decisions in `docs/contracts/LEAD-DECISIONS.md`.
- [ ] **Step 3:** Mark C10 frozen (revision 1) and commit:

```bash
git add docs/contracts/harvest.md docs/contracts/LEAD-DECISIONS.md
git commit -m "docs(contracts): C10 batches and harvest, frozen (revision 1)"
```

### Task 0.5: Stream briefs

- [ ] **Step 1:** Write `data.md`, `api.md` and `web.md` in this folder, one per stream, in the format of `docs/superpowers/plans/2026-10-08-air-exchange/*.md`: TDD tasks with complete test and code blocks, written against the code on `master` at that time and C10 only.
- [ ] **Step 2:** Commit them, then start the three streams in parallel worktrees (Agent-tool subagents: Sonnet implementers, Opus reviewers, two-stage review per stream).

## Step 1: streams

Run in parallel. Each stream works only against C10 and the fakes, then hands back a branch with all tests passing.

| Stream | Branch | Done when |
|---|---|---|
| Data | `stream/harvest-data` | Upgrade, functions and fake match C10; `npm test` passes |
| API | `stream/harvest-api` | Every route and error of C10 section 5 tested against the fake db |
| Web | `stream/harvest-web` | Pages and shell routes of C10 section 8 tested against the fake API server |

## Step 2: lead

### Task 2.1: Merge

- [ ] **Step 1:** Merge `stream/harvest-data`, `stream/harvest-api`, `stream/harvest-web` in that order, `npm test` after each. Expected: all pass.

### Task 2.2: Real server check

- [ ] **Step 1:** `npm start` on the farm address; create a batch, place it in Room 1, add crates through the API with `curl`, read `GET /api/batches/:id`: the flushes and totals match `harvest-rules.js` for the same crates.

### Task 2.3: Browser check

- [ ] **Step 1:** Headless Chrome at 390 × 844 on `#/harvest/1`: one batch is picked automatically; **Add crate** saves once on a double tap; with the server stopped, the value stays and the red line shows; Undo works.
- [ ] **Step 2:** `#/harvest/stickers` from `http://127.0.0.1:…` disables Print; from the farm address it prints 6 cards per A4 page (print preview to PDF).

### Task 2.4: Phone check

- [ ] **Step 1:** Print one sticker, scan it with a real phone on the farm Wi-Fi, record two crates, Undo one, and see them on `#/batches/:id`.

### Task 2.5: Docs

- [ ] **Step 1:** `docs/ROADMAP.md`: Batches and Harvest rows ✅. `README.md`: the stickers page and the fixed-address advice.
- [ ] **Step 2:** Commit:

```bash
git add docs/ROADMAP.md README.md
git commit -m "docs: batches and harvest by room QR built"
```
