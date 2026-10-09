# Work brief: Air exchange, Web stream

Date: 2026-10-09. Repo: `/home/foqcus/Documents/mushroom-farm` (plain JavaScript, browser IIFEs, Node 22, `node:test`, no build step, no npm dependencies). Worktree: `~/.config/superpowers/worktrees/mushroom-farm/air-web`, branch `stream/air-web`. `<base>`: the lead's step 0 commit on `master` (plan README tasks 0.1–0.5: `fix/room-drawing` merged, C9 frozen, `air.js` and its test, `index.html` loads `air.js`). Binding: contract C9 `docs/contracts/air.md`. Where this brief and C9 differ, C9 wins: stop and report.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this brief task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

## 1. Goal

| Part | Result |
|---|---|
| Room drawing | Two fans, `SF-203` (filtered intake) and `EF-206` (exhaust), placed by `inletAt` / `exhaustAt`. Both spin while the air exchange is on. When off, each shows a closed damper. Text `Purge 1,800 m³/h` or `Off · dampers closed`. |
| Status card | Faceplate "Air exchange", tag `SF-203 + EF-206 · <m3h> m³/h`, state text (the ten texts of C9 7, such as `Idle` and `Purge 0:45 of 3:00`), power, why line |
| Glance panel | Row "Air exchange" (`Next purge in about 2 min`, `Purging 0:45`, `Delayed (humidity first)`, the status text of other runs, `Idle`); per day `Purges <n> · average <m:ss>` |
| Settings panel | Rules card "Air exchange and CO₂" with the purge settings; installer field "Air exchange size" (`inAirSize`) next to Room volume; Machines card device "Air exchange" with an On/Off box; `FIELDS` = C9 7.1 |
| Charts | Power key `air`, one ladder row "Purge", purge bars (`drawPurgeBars`) |
| Test bench | `#inAirM3h` replaces `#inVent`; plant facts line for the air exchange |
| Capacity, Calibration | Rooms without `vent`, with optional `airM3h`; new limit and failure words; CSV help for the `air` column |

Every other part of the web app works as before.

## 2. Owned files (the only files you may touch)

| File | Action | Content |
|---|---|---|
| `web/simulator.js` | Modify | Drawing, `mimicLayout`, `airText` and its Node export, status card, glance, ladder chips, counters, energy, purge card, 24 h test, data table, `sample()`, test bench |
| `web/settings-panel.js` | Modify | `FIELDS`, `inAirSize`, rules card, Machines card, handlers, bumpless transfer, repaint |
| `web/charts.js` | Modify | Power key, CO₂ trend subtitle, ladder row, `drawPurgeBars` |
| `web/capacity.js` | Modify | Rooms without `vent`, `airM3h`, `LIMIT_WORD`, `FAIL_MACHINE` |
| `web/calibration.js` | Modify | Tag text, CSV help |
| `styles.css` | Modify | Colour key `--s-air`, `.chart .area.air`, damper, `.gl-v.txt`; the grille rule goes |
| `tests/web-mimic.test.js` | Replace | `mimicLayout` of C9 7 |
| `tests/web-air.test.js` | Create | `airText` |
| `tests/web-charts.test.js` | Modify | Power key, subtitle, ladder row, purge bars |
| `tests/settings-diff.test.js` | Modify | `FIELDS` of C9 7.1, `formatValue` |
| `tests/web-load.test.js`, `tests/web-bench.test.js` | Modify | Require `air.js` before `controller.js` (C9 3) |
| `tests/web-api.test.js` | Modify | The sample room has no `vent` |

Read only: everything else, in particular `index.html` (lead), `air.js`, `sim.js`, `controller.js`, `capacity.js`, `calib.js`, `runtime.js`, `server/*`, `tests/fakes/*`, `tests/vectors/*`, `web/api.js`, `web/ui.js`, `web/shell.js`, `web/rooms.js`, `docs/*`. Scratch files for the browser checks live in `~/.local/share/mushroom-farm/air-web-check/` (never in the repo, never in `/tmp`). If something outside your files blocks you, stop that part and report it.

Line numbers below are approximate: the drawing branch was rebased onto `master` in plan task 0.1. Find the code by the function name or the quoted text.

## 3. Read first

| # | File | Why |
|---|---|---|
| 1 | `docs/contracts/air.md` (C9): sections 1, 2, 3, 4.1, 4.2, 5.1, 5.2, 5.3, 5.7, 7, 7.1, 8, 10, 11 | Binding |
| 2 | `docs/superpowers/specs/2026-10-08-air-exchange-purge-design.md` section 4.2 | What the screens are for |
| 3 | `docs/superpowers/plans/2026-10-08-air-exchange/README.md`: step 0, the step 1 table, task 2.5 | Where this stream fits; the lead's browser checks |
| 4 | `docs/contracts/web.md` (C5/C6): 1.4, 3.5, 6.1, 6.2, 7.3, 7.4, 7.5, 7.7, 7.8 | The sections C9 10 overrides, and the rules that still hold |
| 5 | `web/simulator.js`, `web/settings-panel.js`, `web/charts.js`, `web/capacity.js`, `web/calibration.js`, `styles.css` | The code you change |
| 6 | `tests/web-*.test.js`, `tests/settings-diff.test.js` | Test patterns |
| 7 | Appendix A of this brief | Browser check helper and check files |

## 4. Contracts you build against

| Contract | Section | What you take from it |
|---|---|---|
| C9 | 3 | `air.js` loads before `controller.js`; every Node entry point requires it first (tests too) |
| C9 | 4.1 | `PLANT.air = { m3h: 1800, wPerM3h: 0.08 }`; `env.airM3h` (`null` = `PLANT.air.m3h`); `env.vent` removed; `inletAt`, `exhaustAt` kept |
| C9 | 4.2 | `act.air` (boolean); meter key `air` in `power`, `kwh`, `runS` of `view()` and the reading; `view().airM3h` = airflow now |
| C9 | 5.1 | `cmd.air.on`; `manual.air = { auto, on }`; device key `air` in `why`, `hold` |
| C9 | 5.2 | Settings keys, ranges, removed keys, `RAMP_KEYS` |
| C9 | 5.4 | No Prepare step (owner decision): the AC and fogger keep their targets through a purge. `nextPurgeS` is shown to the farmer and used for nothing else. |
| C9 | 5.3 | `st.air = { state, since, purgeStart, capRun, nextPurgeS, delayed, timed, sizeText }`; states `idle`, `purge`, `after` |
| C9 | 5.7 | `ctl.purges() → { cur, events, hours }`; `cur` = the running run in the event shape (`end: null`, `co2End: null`, `capped: false`), `null` when off; event `{ start, end, reason, co2Start, co2End, m3, capped }`; hour `{ h, runS, starts, m3, cappedN, fogLS, acHighS, acLowS }`; `st.stats = { airOnS, purges, purgeS, longestPurgeS, cappedPurges, delayedS, fogStarts, acCmds }` (`purges`, `purgeS`, `longestPurgeS`, `cappedPurges`: CO₂ purges only; `airOnS`: every run); `reason` values; `ctl.state.airReason` = the reason of the run now (it follows a change, `cur.reason` keeps the first); `status('CO2')` = `{ serious, ◆, Safety run }` during a safety run |
| C9 | 7, 7.1 | Your section |
| C9 | 8 | Capacity room `{ name, volume, airM3h?, calib }`; balance `limit` ∈ `'air' \| 'ac' \| 'fog'` |
| C9 | 10 | C5/C6 sections that C9 replaces (3.2, 3.3, 3.4, 3.6, 3.7, 4.3, 6.1, 6.2, 7.2, 7.3, 7.4, 7.7, 7.8, 7.9, 7.10) |
| C9 | 11 | Your tests prove `mimicLayout`, `FIELDS` = 7.1, the ladder row, the power key |
| C5 | 1.4 | IIFE wrapper, at most one global per file, no DOM at load, markup as template strings, dynamic text only through `textContent` |
| C5 | 3.1, 3.5 | `mount` / `unmount`; `FarmBench` (its `mimicLayout` member from the drawing branch stays) |
| C6 | 7.4, 7.5, 7.6 | Commit, field rewrite, pair rule, bumpless transfer, change list format, `formatValue` rules: unchanged except where C9 7 says |

## 5. Before you start

Run in the worktree. If a check fails, stop and report to the lead. Never write a stand-in for a missing file.

| Check | Expected |
|---|---|
| `git log --oneline -1 && git merge-base HEAD master` | Both print `<base>`; write it down |
| `ls air.js tests/air.test.js tests/web-mimic.test.js docs/contracts/air.md` | All four listed |
| `grep -c "Status: frozen" docs/contracts/air.md` | `1` |
| `grep -c '<script src="air.js"></script>' index.html` | `1` |
| `grep -c "function mimicLayout\|function paintGlance" web/simulator.js; grep -c "ctl-section" styles.css` | `2`, then at least `1` (the drawing branch is merged) |
| `node -e "require('./sim.js'); require('./air.js'); require('./controller.js'); console.log(!!ClimateSim.PLANT.air, !!ClimateController.defaultSettings().manual.air)"` | `false false` (the simulation and controller streams are not merged; section 6) |
| `npm test` | `# fail 0`. Write down `# tests` (T0), `# pass` (P0), `# skipped` (S0). |
| `mkdir -p ~/.local/share/mushroom-farm/air-web-check` | Scratch folder for section 9 |

Git: keep the configured identity (never change `git config`). One commit per task, message given in the task. Do not push, merge or rebase.

## 6. Working before the other streams merge

At `<base>` the simulation and controller still have the old shapes (`act.fanLevel`, `cmd.fan.level`, no `st.air`, no `ctl.purges()`). The other streams build the C9 shapes in parallel. This stream codes against C9 and tests against hand-built C9 shapes.

| Item | At your branch | After the lead merges simulation and controller (and then web) |
|---|---|---|
| Pure code (`mimicLayout`, `airText`, `FIELDS`, `formatValue`, charts) | Node tests with hand-built C9 objects: `stOf()` in `tests/web-air.test.js`, `c9Defaults()` in `tests/settings-diff.test.js`, a small fake DOM in `tests/web-charts.test.js` | The same tests pass |
| `tests/settings-diff.test.js` "FIELDS against the real controller defaults" | Skipped (`skip` message names the reason) | Runs; must pass |
| `tests/web-air.test.js` "airText on a real run" | Skipped | Runs; must pass |
| `tests/web-bench.test.js` | Passes: `sample()` reads `c.air && c.air.on` (the C9 4.2 / 6.3 idiom), which is `0` with the old controller | Passes |
| Simulator page in a browser | Broken (it reads `st.air`, `ctl.purges()`, `power.air`): do not open `#/simulator` on your branch | Check H2 (task 13) in a throwaway merge, or the lead at README task 2.5 |
| Settings panel, Capacity, Calibration pages | Check H1 runs on your branch (the panel gets a C9-shaped settings object built in the page) | H2 repeats Capacity and Calibration |

Expected failures on `master` between the lead's merges (not on your branch). They clear when the web stream is merged.

| After merging | Test | Why |
|---|---|---|
| Simulation | `tests/web-mimic.test.js` (old) "mimicLayout: the default room is a supply fan high on the inlet wall, a damper low on the outlet wall" | `DEFAULT_ENV.vent` is gone; the old `mimicLayout` draws the open-inlet layout |
| Controller | `tests/web-bench.test.js` (old) "FarmBench: lazy state, defaults" | The old `sample()` reads `cmd.fan.level` |
| Controller | `tests/settings-diff.test.js` (old) "FIELDS = C6 7.7" | Old `FIELDS` paths such as `rules.airMode` are not settings any more |

## 7. Points this brief decides (report anything that does not fit)

| # | Point | Decision |
|---|---|---|
| 1 | Node hook for `airText` | `module.exports = { airText }` behind a `typeof module` guard at the end of `web/simulator.js`; no browser global, no new `FarmBench` member. If another stream later adds its own Node export to this file, the lead joins them into one object. |
| 2 | Safety run in the CO₂ readouts | Nothing to add: the drawing readout, the glance CO₂ row and the trend chip paint `status('CO2')` as they get it, and `styles.css` already has the `serious` rules for `.readout`, `.gl-row` and `.chip` |
| 3 | Minutes and times; run reason | `<m>` = `max(1, round(seconds / 60))`. `<m:ss>` = `FarmUi.fmtMinSec` of whole seconds. A run's time = simulation time now − `cur.start`. The run's text follows `st.airReason` (C9 5.7: it follows a purge that turns into a safety run); `cur.reason` only when `airReason` is missing. |
| 4 | Ladder chip of the `air` row | Purge: `info ▲ Purging`. Safety run: `serious ◆ Safety run` (as `status('CO2')`, C9 5.7). Other run: `info ●` + the status text (`Timed purge`, `Free cooling`, `Drying`, `Manual on`). Manual off: `none ○ Manual off`. Delayed: `info ❚❚ Delayed`. Else `none ○ Idle`. (C9 7: the chip shows the state: Idle, Purging, Delayed, Safety run.) |
| 5 | Status card | No meter (C9 lists `airState`, `airPower`, `airWhy` only). Every faceplate tag gets the id `fp<Suffix>Tag`; `fpAirTag` is painted from `env.airM3h ?? PLANT.air.m3h`. The AC faceplate loses its setback suffix. |
| 6 | Drawing texts | Per fan: tag, state (`mInState` / `mOutState`), label. The airflow lines `mInflow` / `mOutflow` go (the state text carries the airflow). |
| 7 | Closed damper | `rect.damper` across each fan's opening; hidden by `.on > .damper` |
| 8 | Colour key | CSS variable `--s-fan` → `--s-air`, chart class `area fan` → `area air`. The drawing's `fan` classes (`flow fan`, `keybar fan`, `arrowhead fan`, `#arFan`) stay: both machines are fans. |
| 9 | Texts that named the one fan | CO₂ trend subtitle `Purge <off>–<on> ppm · limit <lim>`; priority 1 label `Run the air exchange when CO₂ is ≥`; the "Fixed values" text; `wNote`; the CO₂-per-block measuring step; energy row, data table header, purge card texts (task 9) |
| 10 | Rules-side counters | Spec 4.2: purges (per day), average and longest purge, purges stopped at the cap, run time, delay time; AC commands and fogger starts stay |
| 11 | Purge record card | Keeps today's ids and classes (`exhChart`, `exhRows`, `exhEvents`, `.exhaust`, `exhKey`). Column Level goes; column Capped comes. The chart is `drawPurgeBars(host, hours, clock)` (C9 7); `nowH` is the last bucket's `h`. |
| 12 | 24 h test | Variants: Your rules, No humidity priority (`rhLock: false`) |
| 13 | Panel inputs | `rPurgeMax`: minutes, step 0.5, shown as `+(s / 60).toFixed(2)`. `rMinOff`: s, step 10. |
| 14 | `#inAirM3h` and `inAirSize` | `#inAirM3h` (bench): rounded, held in 50–10000, written to `env.airM3h` and `cfg.airM3h`, then `panel.set(cfg)`. In the Simulator, a panel change of `airM3h` (`inAirSize`) also sets `env.airM3h` and the bench field, so the simulated pair and the controller's size stay equal (as `sim-adapter.js` does for a live room, C9 6.3). No event. |
| 15 | Capacity storage | A room keeps `airM3h` only within 50–10000. A saved room takes `env.airM3h` only when it is a number. A stored report whose balance `limit` is not a `LIMIT_WORD` key (old reports say `fan`) is dropped on load: the check runs again. |
| 16 | `FIELDS` units | C9 7.1's Unit column is the `unit` of each row; `–` means no `unit` |
| 17 | H2 server | A static file server on the throwaway merge: no web module of this stream calls the API |

## 8. Tasks

### Task 0: Before you start

- [ ] Run every check of section 5. Write down `<base>`, T0, P0, S0.

### Task 1: Load `air.js` in the web tests; a room without `vent`

**Files:** Modify `tests/web-load.test.js`, `tests/web-bench.test.js`, `tests/settings-diff.test.js`, `tests/web-api.test.js`.

- [ ] **Step 1:** In `tests/web-load.test.js`, test L1, insert `require('../air.js');` between `require('../sim.js');` and `require('../controller.js');`. In test L3 replace the `expected` set and its comment with:

```js
  const expected = new Set(['ClimateSim', 'ClimateAir', 'ClimateController', 'ClimateRuntime', 'ClimateCalib', 'ClimateCapacity', 'ClimateRoomRules',
    'FarmUi', 'FarmApi', 'FarmCharts', 'FarmSettingsPanel', 'FarmShell']);
  // Exactly these 12 globals after L1: no more (FarmBench does not exist yet; web/simulator.js is not loaded).
```

- [ ] **Step 2:** In `tests/web-bench.test.js` insert `require('../air.js');` after `require('../sim.js');`. In `tests/settings-diff.test.js` insert `require('../air.js');` before `require('../controller.js');`.
- [ ] **Step 3:** In `tests/web-api.test.js` (line ~24) replace `const room = { name: 'A', volume: 60, vent: 'supply' };` with `const room = { name: 'A', volume: 60 };`.
- [ ] **Step 4:** Run `npm test`. Expected: `# fail 0`, `# tests` T0, `# pass` P0.
- [ ] **Step 5:** Commit:

```bash
git add tests/web-load.test.js tests/web-bench.test.js tests/settings-diff.test.js tests/web-api.test.js
git commit -m "test(web): load air.js before controller.js; a room without vent (C9 3, 6.3)"
```

### Task 2: `mimicLayout` draws the pair

**Files:** Replace `tests/web-mimic.test.js`; modify `web/simulator.js` (`function mimicLayout`, line ~669).

- [ ] **Step 1: Write the failing test.** Replace `tests/web-mimic.test.js` with:

```js
// web/simulator.js: mimicLayout, the air exchange of the room drawing (contract C9 section 7).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js');
require('../air.js');
require('../controller.js');
require('../runtime.js');
require('../calib.js');
require('../capacity.js');
require('../room-rules.js');
require('../web/ui.js');
require('../web/api.js');
require('../web/charts.js');
require('../web/settings-panel.js');
require('../web/shell.js');
require('../web/simulator.js');
const SIM = globalThis.ClimateSim, { mimicLayout } = globalThis.FarmBench;

const INTAKE = { kind: 'fan', tag: 'SF-203', label: 'Filtered intake' };
const EXHAUST = { kind: 'fan', tag: 'EF-206', label: 'Exhaust' };

test('mimicLayout: the default room has the intake high and the exhaust low', () => {
  const { inletAt, exhaustAt } = SIM.DEFAULT_ENV;
  assert.deepEqual(mimicLayout({ inletAt, exhaustAt }), {
    inlet: { band: 'high', ...INTAKE },
    outlet: { band: 'low', ...EXHAUST },
  });
});

test('mimicLayout: four position cases, a fan on both walls', () => {
  for (const inletAt of ['high', 'low']) for (const exhaustAt of ['high', 'low']) {
    assert.deepEqual(mimicLayout({ inletAt, exhaustAt }), {
      inlet: { band: inletAt, ...INTAKE },
      outlet: { band: exhaustAt, ...EXHAUST },
    }, `${inletAt}/${exhaustAt}`);
  }
});

test('mimicLayout: an old env with vent gives the same drawing (vent is ignored)', () => {
  for (const vent of ['supply', 'exhaust']) {
    assert.deepEqual(mimicLayout({ vent, inletAt: 'low', exhaustAt: 'high' }), mimicLayout({ inletAt: 'low', exhaustAt: 'high' }));
  }
});

test('mimicLayout: a missing position falls back to intake high, exhaust low', () => {
  assert.deepEqual(mimicLayout({}), { inlet: { band: 'high', ...INTAKE }, outlet: { band: 'low', ...EXHAUST } });
});
```

- [ ] **Step 2: Run it to see it fail.** `node --test tests/web-mimic.test.js` → FAIL (the old layout has a grille and `EF-203`).
- [ ] **Step 3: Implement.** In `web/simulator.js` replace the comment above `mimicLayout` and the whole function with:

```js
// The air exchange of the drawing (C9 section 7): the filtered intake fan SF-203 on the left wall and the exhaust
// fan EF-206 on the right wall, each high or low as env.inletAt / env.exhaustAt say. Pure, for Node tests.
function mimicLayout({ inletAt, exhaustAt }) {
  return {
    inlet: { band: inletAt === 'low' ? 'low' : 'high', kind: 'fan', tag: 'SF-203', label: 'Filtered intake' },
    outlet: { band: exhaustAt === 'high' ? 'high' : 'low', kind: 'fan', tag: 'EF-206', label: 'Exhaust' },
  };
}
```

- [ ] **Step 4:** `node --test tests/web-mimic.test.js` → `# pass 4`. `npm test` → `# fail 0`.
- [ ] **Step 5:** Commit:

```bash
git add tests/web-mimic.test.js web/simulator.js
git commit -m "feat(web): mimicLayout places the intake and exhaust fans (C9 7)"
```

### Task 3: `airText`, the air exchange texts

**Files:** Create `tests/web-air.test.js`; modify `web/simulator.js` (after `function mimicLayout`, and the last lines of the file).

- [ ] **Step 1: Write the failing test** `tests/web-air.test.js`:

```js
// web/simulator.js: airText, the air exchange texts of the status card, the glance panel and the ladder (C9 section 7).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js');
require('../air.js');
require('../controller.js');
require('../runtime.js');
require('../calib.js');
require('../capacity.js');
require('../room-rules.js');
require('../web/ui.js');
require('../web/api.js');
require('../web/charts.js');
require('../web/settings-panel.js');
require('../web/shell.js');
const { airText } = require('../web/simulator.js');
const SIM = globalThis.ClimateSim, CC = globalThis.ClimateController, RT = globalThis.ClimateRuntime;

// The controller state of C9 5.3 (st.air), 5.1 (st.cmd.air) and 5.7 (st.airReason), built by hand: at the stream's
// base the controller still has the old shape.
function stOf(air = {}, on = false, airReason = on ? 'purge' : null) {
  return {
    air: { state: 'idle', since: null, purgeStart: null, capRun: 0, nextPurgeS: null, delayed: false, timed: false, sizeText: null, ...air },
    cmd: { air: { on } },
    airReason,
  };
}
const rules = { fanOn: 900, fanOff: 700, purgeMaxS: 180 };
const run = (reason, start) => ({ start, end: null, reason, co2Start: 950, co2End: null, m3: 0, capped: false });
const IDLE = { lvl: 'none', icon: '○', text: 'Idle' };
const MANUAL = { auto: false, on: false };

test('airText: idle, with and without a predicted purge', () => {
  assert.deepEqual(airText({ st: stOf(), cur: null, rules, t: 100 }), { state: 'Idle', glance: 'Idle', chip: IDLE });
  assert.deepEqual(airText({ st: stOf({ nextPurgeS: 600 }), cur: null, rules, t: 100 }),
    { state: 'Idle · purge in about 10 min', glance: 'Next purge in about 10 min', chip: IDLE });
  assert.deepEqual(airText({ st: stOf({ state: 'after' }), cur: null, rules, t: 100 }), { state: 'Idle', glance: 'Idle', chip: IDLE });
});

test('airText: the next purge is rounded to whole minutes, at least 1', () => {
  assert.deepEqual(airText({ st: stOf({ nextPurgeS: 150 }), cur: null, rules, t: 100 }),
    { state: 'Idle · purge in about 3 min', glance: 'Next purge in about 3 min', chip: IDLE });
  assert.deepEqual(airText({ st: stOf({ nextPurgeS: 20 }), cur: null, rules, t: 100 }),
    { state: 'Idle · purge in about 1 min', glance: 'Next purge in about 1 min', chip: IDLE });
});

test('airText: a CO₂ purge shows its time and the cap', () => {
  const st = stOf({ state: 'purge', purgeStart: 1000 }, true);
  assert.deepEqual(airText({ st, cur: run('purge', 1000), rules, t: 1045 }),
    { state: 'Purge 0:45 of 3:00', glance: 'Purging 0:45', chip: { lvl: 'info', icon: '▲', text: 'Purging' } });
  assert.equal(airText({ st, cur: run('purge', 1000), rules: { ...rules, purgeMaxS: 240 }, t: 1125 }).state, 'Purge 2:05 of 4:00');
});

test('airText: humidity first delays the purge', () => {
  assert.deepEqual(airText({ st: stOf({ delayed: true, nextPurgeS: 0 }), cur: null, rules, t: 100 }),
    { state: 'Delayed (humidity first)', glance: 'Delayed (humidity first)', chip: { lvl: 'info', icon: '❚❚', text: 'Delayed' } });
});

test('airText: Manual and Off', () => {
  assert.deepEqual(airText({ st: stOf({ nextPurgeS: 120 }), cur: null, rules, manual: MANUAL, t: 100 }),
    { state: 'Manual off', glance: 'Manual off', chip: { lvl: 'none', icon: '○', text: 'Manual off' } });
  assert.equal(airText({ st: stOf({}, true, 'manual'), cur: run('manual', 1000), rules, manual: { auto: false, on: true }, t: 1010 }).state, 'Manual on');
});

test('airText: runs that are not CO₂ purges', () => {
  const cases = [['timed', 'Timed purge'], ['free cooling', 'Free cooling'], ['drying', 'Drying'], ['manual', 'Manual on']];
  for (const [reason, text] of cases) {
    assert.deepEqual(airText({ st: stOf({}, true, reason), cur: run(reason, 1000), rules, t: 1090 }),
      { state: text, glance: text, chip: { lvl: 'info', icon: '●', text } }, reason);
  }
});

test('airText: a safety run, also one that began as a purge (C9 5.7 airReason)', () => {
  const want = { state: 'Safety run', glance: 'Safety run', chip: { lvl: 'serious', icon: '◆', text: 'Safety run' } };
  assert.deepEqual(airText({ st: stOf({}, true, 'safety'), cur: run('safety', 1000), rules, t: 1090 }), want);
  assert.deepEqual(airText({ st: stOf({ state: 'purge', purgeStart: 1000 }, true, 'safety'), cur: run('purge', 1000), rules, t: 1400 }), want);
});

// Runs once the simulation and controller streams are merged (C9 4.2, 5.3, 5.7): the names airText reads exist on
// a real controller.
const C9 = !!(SIM.PLANT.air && CC.defaultSettings().manual.air);
test('airText on a real run: a purge reads "Purge m:ss of 3:00"', { skip: C9 ? false : 'needs the C9 simulation and controller (lead step 2)' }, () => {
  const env = structuredClone(SIM.DEFAULT_ENV); env.blocks = 6000;
  const cfg = CC.defaultSettings(); cfg.program.harvest.on = false;
  const sim = SIM.create(env), ctl = CC.create(cfg, null, null), io = RT.simIO(sim);
  let seen = null;
  const rt = RT.createRuntime({ io, ctl, onReading: r => {
    const cur = ctl.purges().cur;
    if (!seen && ctl.state.cmd.air.on && ctl.state.airReason === 'purge' && cur && r.t - cur.start >= 30) seen = airText({ st: ctl.state, cur, rules: cfg.rules, manual: cfg.manual.air, t: r.t });
  } });
  for (let i = 0; i < 4 * 3600 && !seen; i++) { io.advance(1); rt.poll(); }
  assert.ok(seen, 'no purge of 30 s or more in 4 h');
  assert.match(seen.state, /^Purge \d:\d{2} of 3:00$/);
  assert.match(seen.glance, /^Purging \d:\d{2}$/);
  assert.deepEqual(seen.chip, { lvl: 'info', icon: '▲', text: 'Purging' });
});
```

- [ ] **Step 2: Run it to see it fail.** `node --test tests/web-air.test.js` → FAIL, `airText is not a function`.
- [ ] **Step 3: Implement.** In `web/simulator.js`, directly after `function mimicLayout`, add:

```js
// ---------------- Air exchange texts (C9 section 7) ----------------
// From the controller state (st = ctl.state: st.air of C9 5.3 and st.cmd.air), the running air run (cur =
// ctl.purges().cur, null when off), the rules, the manual setting (cfg.manual.air) and the time now: the status card
// state, the glance text and the ladder chip. st.airReason is C9 5.7's reason of the run now. Pure, for Node tests
// (tests/web-air.test.js).
const RUN_TEXT = { safety: 'Safety run', timed: 'Timed purge', 'free cooling': 'Free cooling', drying: 'Drying', manual: 'Manual on' };
function airText({ st, cur, rules, manual = { auto: true, on: false }, t }) {
  const A = st.air, mmss = s => UI.fmtMinSec(Math.max(0, Math.round(s))), mins = s => Math.max(1, Math.round(s / 60));
  if (st.cmd.air.on) {
    // st.airReason follows the run now (a purge can turn into a safety run); cur.reason keeps the first reason.
    const reason = st.airReason || (cur ? cur.reason : 'purge'), ran = mmss(t - (cur ? cur.start : A.purgeStart));
    if (reason === 'purge') return { state: `Purge ${ran} of ${mmss(rules.purgeMaxS)}`, glance: `Purging ${ran}`, chip: { lvl: 'info', icon: '▲', text: 'Purging' } };
    if (reason === 'safety') return { state: 'Safety run', glance: 'Safety run', chip: { lvl: 'serious', icon: '◆', text: 'Safety run' } };
    return { state: RUN_TEXT[reason], glance: RUN_TEXT[reason], chip: { lvl: 'info', icon: '●', text: RUN_TEXT[reason] } };
  }
  if (manual.auto === false) return { state: 'Manual off', glance: 'Manual off', chip: { lvl: 'none', icon: '○', text: 'Manual off' } };
  if (A.delayed) return { state: 'Delayed (humidity first)', glance: 'Delayed (humidity first)', chip: { lvl: 'info', icon: '❚❚', text: 'Delayed' } };
  const chip = { lvl: 'none', icon: '○', text: 'Idle' };
  if (!(A.nextPurgeS > 0)) return { state: 'Idle', glance: 'Idle', chip };
  const m = mins(A.nextPurgeS);
  return { state: `Idle · purge in about ${m} min`, glance: `Next purge in about ${m} min`, chip };
}
```

At the end of the file, after `global.FarmShell.register('simulator', { mount, unmount });` and before `})(typeof window …`, add:

```js
// Node only (tests/web-air.test.js); adds no browser global.
if (typeof module === 'object' && module && module.exports) module.exports = { airText };
```

- [ ] **Step 4:** `node --test tests/web-air.test.js` → `# pass 7`, `# skipped 1`. `npm test` → `# fail 0`.
- [ ] **Step 5:** Commit:

```bash
git add tests/web-air.test.js web/simulator.js
git commit -m "feat(web): air exchange texts for the status card, glance and ladder (C9 7)"
```

### Task 4: Charts: power key, CO₂ subtitle, one ladder row, purge bars

**Files:** Modify `tests/web-charts.test.js`, `web/charts.js`, `styles.css`, `web/settings-panel.js` and `web/simulator.js` (colour key only).

- [ ] **Step 1: Write the failing tests.** In `tests/web-charts.test.js`, in the test `TREND_DEFS sub lines run with and without spT`, change the last assertion to:

```js
  assert.equal(D.C.sub({ fanOff: 800, fanOn: 1000, co2Lim: 1200 }), 'Purge 800–1000 ppm · limit 1200');
```

Append to the file:

```js
// A small stand-in for the DOM, enough for createLadder and drawPurgeBars (Node has no document).
class FakeEl {
  constructor(tagName) {
    this.tagName = tagName; this.children = []; this.attrs = {}; this.dataset = {};
    this.className = ''; this.id = ''; this.textContent = ''; this.hidden = false; this.clientWidth = 600;
    this.style = { setProperty(k, v) { this[k] = v; } };
    const cls = new Set();
    this.classList = { add: c => cls.add(c), remove: c => cls.delete(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: c => cls.has(c) };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { for (const c of cs) this.children.push(typeof c === 'string' ? Object.assign(new FakeEl('#text'), { textContent: c }) : c); }
  replaceChildren(...cs) { this.children = []; this.append(...cs); }
  get firstChild() { return this.children[0] || null; }
}
const allOf = (e, out = []) => { out.push(e); for (const c of e.children) allOf(c, out); return out; };
function fakeDocument(t) {
  globalThis.document = { createElement: tag => new FakeEl(tag), createElementNS: (ns, tag) => new FakeEl(tag) };
  t.after(() => { delete globalThis.document; });
}

test('aggregate: the air exchange power key is "air" (C9 4.2)', () => {
  const out = FC.aggregate([{ t: 0, air: 144, fan: 1 }, { t: 10, air: 0, fan: 2 }], 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].air, 72);
  assert.equal(out[0].fan, 2); // not a power key any more: taken from the bucket's last point
});

test('createLadder: one row "Purge" from the stop level to the start level (C9 7)', (t) => {
  fakeDocument(t);
  const el = new FakeEl('div');
  const lad = FC.createLadder(el);
  assert.deepEqual(allOf(el).filter(e => e.className === 'lad-name').map(e => e.textContent), ['Purge']);
  lad.draw({ co2Lim: 1200, rules: { fanOn: 1000, fanOff: 800, co2Safety: false, co2SafetyAt: 3000 } }, 900, { air: { lvl: 'info', icon: '▲', text: 'Purging' } });
  const pos = v => `${(v - 400) / (1500 - 400) * 100}%`; // scale 400 to ceil((1200 + 250) / 250) × 250 = 1500 ppm
  assert.equal(allOf(el).find(e => e.className === 'lad-hys').style.left, pos(800));
  assert.equal(allOf(el).find(e => e.className === 'lad-on').style.left, pos(1000));
  assert.equal(allOf(el).find(e => e.className === 'chip').dataset.txt, 'Purging');
});

test('drawPurgeBars: purge bars titled with purges, m³ and capped purges (C9 7)', (t) => {
  fakeDocument(t);
  const host = new FakeEl('div');
  const clock = { offset: 0, hm: s => `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:00` };
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, runS: 0, starts: 0, m3: 0, cappedN: 0 }));
  hours[23] = { h: 23, runS: 180, starts: 2, m3: 90, cappedN: 1 };
  assert.equal(FC.drawExhaustBars, undefined);
  FC.drawPurgeBars(host, hours, clock);
  assert.equal(host.children[0].attrs['aria-label'], 'Air exchange run minutes per hour, last 24 hours. The table below has the values.');
  assert.deepEqual(allOf(host).filter(e => e.tagName === 'title').map(e => e.textContent), ['23:00–00:00: 3 min, 2 purges, 90 m³, 1 capped, hour not finished']);
});
```

- [ ] **Step 2: Run them to see them fail.** `node --test tests/web-charts.test.js` → 4 failures (subtitle, aggregate, ladder, bars).

The Simulator still calls `drawExhaustBars` until task 9; that is browser-only code, so `npm test` stays green.
- [ ] **Step 3: Implement in `web/charts.js`.**

| Place | New code |
|---|---|
| `AVG_KEYS` (line ~19) | `const AVG_KEYS = ['T', 'RH', 'C', 'tOut', 'rhOut', 'ac', 'hu', 'air', 'li', 'ci', 'acSet', 'core', 'vpd'];` |
| `TREND_DEFS.C.sub` (line ~84) | The `sub` of key `C` becomes the code block after this table |
| `DEV` (line ~86) | `const DEV = [['ac', 'AC'], ['hu', 'Fogger'], ['air', 'Air'], ['li', 'Lights'], ['ci', 'Circ.']];` |
| `LEGEND_NAME` (line ~87) | `const LEGEND_NAME = { ac: 'Air conditioner', hu: 'Fogger', air: 'Air exchange', li: 'Lights', ci: 'Circulation' };` |
| `drawPowerCard`, legend line (line ~301) | `legend.ac.textContent = UI.watts(p.ac \|\| 0); legend.hu.textContent = UI.watts(p.hu \|\| 0); legend.air.textContent = UI.watts(p.air \|\| 0);` |
| `drawPowerCard`, tooltip rows (line ~313) | `row('ci', hp.ci \|\| 0, 'Circulation'); row('li', hp.li \|\| 0, 'Lights'); row('air', hp.air \|\| 0, 'Air exchange'); row('hu', hp.hu, 'Fogger'); row('ac', hp.ac, 'Air conditioner'); row(null, total, 'Total', 'total');` |

The new `sub` of `TREND_DEFS.C`:

```js
    band: p => [p.fanOff, p.fanOn], ref: p => p.co2Lim, sub: p => `Purge ${p.fanOff}–${p.fanOn} ppm · limit ${p.co2Lim}` },
```

Replace the heading comment and the first lines of `drawExhaustBars` (lines ~344–350) with the lines below (C9 7: `drawPurgeBars(el, hours, clock)`; the current hour is the last bucket's):

```js
// ---------------- drawPurgeBars: air exchange run minutes per hour (C9 7) ----------------
function drawPurgeBars(host, hours, clock) {
  const nowH = hours[hours.length - 1].h;
  host.replaceChildren();
  const w = Math.max(240, host.clientWidth), h = 150, m = { l: 34, r: 8, t: 14, b: 22 };
  const pw = w - m.l - m.r, ph = h - m.t - m.b, bw = pw / 24, gap = 2;
  const Y = min => m.t + (1 - min / 60) * ph;
  const svg = svgEl('svg', { class: 'chart', width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'Air exchange run minutes per hour, last 24 hours. The table below has the values.' });
```

In the same function replace the `title.textContent = …` line with:

```js
      title.textContent = `${clock.hm(b.h * 3600)}–${clock.hm((b.h + 1) * 3600)}: ${Math.round(mins)} min, ${b.starts} purges, ${Math.round(b.m3)} m³, ${b.cappedN} capped${b.h === nowH ? ', hour not finished' : ''}`;
```

In the `global.FarmCharts = { … }` export list at the end of the file, replace `drawExhaustBars` with `drawPurgeBars`.

Replace `LADDER_ROWS` (lines ~399–402) with:

```js
const LADDER_ROWS = [
  { key: 'air', name: 'Purge', color: 'var(--s-air)', hi: s => s.rules.fanOn, lo: s => s.rules.fanOff, on: () => true },
];
```

In `createLadder`, `layout`, replace the `top` line with:

```js
    const top = Math.max(R.fanOn, settings.co2Lim, R.co2Safety ? R.co2SafetyAt : 0, now, 0);
```

- [ ] **Step 4: Colour key.** Run:

```bash
sed -i 's/--s-fan/--s-air/g; s/\.chart \.area\.fan/.chart .area.air/' styles.css
sed -i 's/--s-fan/--s-air/g' web/settings-panel.js web/simulator.js
grep -n "s-fan\|area\.fan" styles.css web/*.js
```

Expected: the `grep` prints nothing.
- [ ] **Step 5:** `node --test tests/web-charts.test.js` → `# fail 0`. `npm test` → `# fail 0`.
- [ ] **Step 6:** Commit:

```bash
git add tests/web-charts.test.js web/charts.js styles.css web/settings-panel.js web/simulator.js
git commit -m "feat(web): charts use the air key, one purge ladder row and drawPurgeBars (C9 4.2, 7)"
```

### Task 5: `FIELDS` of C9 7.1

**Files:** Modify `tests/settings-diff.test.js`, `web/settings-panel.js` (`FIELDS`, lines ~13–71).

- [ ] **Step 1: Write the failing tests.** In `tests/settings-diff.test.js`, after `function d() { return CC.defaultSettings(); }`, add:

```js
// Contract C9 5.2: the keys the air exchange removes, and the settings shape after it. At the stream's base the
// controller still has the old shape, so c9Defaults() converts it; once the controller stream is merged it changes nothing.
const REMOVED_RULES = ['airMode', 'baseFan', 'fanLevel', 'fogBoost', 'rhAction', 'acPurge', 'acAction', 'acSetbackC', 'acOff', 'acOn', 'maxSetback', 'guard'];
function c9Defaults() {
  const s = d();
  for (const k of REMOVED_RULES) delete s.rules[k];
  delete s.protect.fanMinOn; delete s.protect.fanMinOff; delete s.manual.fan;
  s.airM3h ??= 1800;
  s.rules.purgeMaxS ??= 180; s.rules.minOffS ??= 60;
  s.manual.air ??= { auto: true, on: false };
  return s;
}
const CTL_C9 = !!d().manual.air;
// C9 7.1: path, label, unit (`–` in the contract is no unit).
const C9_FIELDS = [
  ['rules.fanOn', 'Purge starts at', 'ppm'],
  ['rules.fanOff', 'Purge stops at', 'ppm'],
  ['rules.purgeMaxS', 'Longest purge', 's'],
  ['rules.minOffS', 'Minimum off time', 's'],
  ['airM3h', 'Air exchange size', 'm³/h'],
  ['manual.air.auto', 'Air exchange', undefined],
  ['manual.air.on', 'Air exchange: manual output', undefined],
];
const GONE = ['rules.prepare', 'rules.prepareLeadS', 'rules.rhAction', 'rules.airMode', 'rules.fanLevel', 'rules.acPurge', 'rules.acAction', 'rules.acSetbackC', 'rules.acOff', 'rules.acOn', 'manual.fan.auto', 'manual.fan.level'];
```

In the test `formatValue rules`, replace the line `assert.equal(SP.formatValue('rules.fanLevel', 2), 'Medium');` with:

```js
  assert.equal(SP.formatValue('manual.air.auto', false), 'Manual');
  assert.equal(SP.formatValue('manual.air.on', true), 'On');
  assert.equal(SP.formatValue('rules.purgeMaxS', 180), '180 s');
  assert.equal(SP.formatValue('airM3h', 1800), '1800 m³/h');
```

Replace the whole test `FIELDS = C6 7.7` with:

```js
function assertLeaves(base) {
  const paths = new Set();
  for (const f of SP.FIELDS) {
    assert.equal(typeof f.label, 'string');
    assert.ok(!paths.has(f.path), `duplicate path ${f.path}`);
    paths.add(f.path);
    let v = base;
    for (const p of f.path.split('.')) {
      assert.ok(v && typeof v === 'object', `${f.path} is not reachable`);
      // Object.hasOwn on the parent, not just a type check on the result: a misspelt leaf (for example
      // "program.flushs") would otherwise pass too, because v becomes undefined either way.
      assert.ok(Object.hasOwn(v, p), `${f.path}: "${p}" is not a property of its parent`);
      v = v[p];
    }
    assert.ok(v !== undefined, `${f.path} is not a leaf`);
    assert.ok(v === null || typeof v !== 'object' || Array.isArray(v), `${f.path} is not a leaf`);
  }
}

test('FIELDS = C6 7.7 as changed by C9 7.1: 51 rows, leaves of the C9 settings', () => {
  assert.equal(SP.FIELDS.length, 51);
  assertLeaves(c9Defaults());
  for (const [path, label, unit] of C9_FIELDS) {
    const f = SP.FIELDS.find(x => x.path === path);
    assert.ok(f, `${path} is missing`);
    assert.equal(f.label, label, path);
    assert.equal(f.unit, unit, path);
  }
  for (const p of GONE) assert.ok(!SP.FIELDS.some(f => f.path === p), `${p} is still listed`);
  for (const p of ['farmType', 'crop', 'sensorMode', 'manual.ac.mode', 'manual.hu.level']) {
    assert.ok(SP.FIELDS.find(x => x.path === p).options, `${p} is missing options`);
  }
});

test('FIELDS against the real controller defaults (C9 5.2)', { skip: CTL_C9 ? false : 'runs after the controller stream is merged (lead step 2)' }, () => {
  assertLeaves(d());
  assert.equal(CC.SETTINGS_VERSION, 2);
  const s = d();
  for (const k of REMOVED_RULES) assert.ok(!Object.hasOwn(s.rules, k), `rules.${k} is still a setting`);
  assert.ok(!Object.hasOwn(s.manual, 'fan'));
  assert.deepEqual([s.airM3h, s.rules.purgeMaxS, s.rules.minOffS], [1800, 180, 60]);
  assert.ok(!Object.hasOwn(s.rules, 'prepare') && !Object.hasOwn(s.rules, 'prepareLeadS'), 'no Prepare settings (C9 5.4)');
  assert.deepEqual(s.manual.air, { auto: true, on: false });
});
```

- [ ] **Step 2: Run them to see them fail.** `node --test tests/settings-diff.test.js` → FAIL in `formatValue rules` (`'180'` is not `'180 s'`) and in `FIELDS = …` (56 rows); 1 skipped.
- [ ] **Step 3: Implement** in `web/settings-panel.js`:

| Place | Change |
|---|---|
| Comment above `FIELDS` | `// The 51 field rows of C6 7.7 as changed by C9 7.1, in table order.` |
| After the `roomM3` row | Insert `{ path: 'airM3h', label: 'Air exchange size', unit: 'm³/h' },` |
| The 10 rows from `rules.rhAction` through `rules.acOn` (lines ~49–58: `rhAction`, `fanOn`, `fanOff`, `airMode`, `fanLevel`, `acPurge`, `acAction`, `acSetbackC`, `acOff`, `acOn`) | Replace with the four rows below |
| Rows `manual.fan.auto`, `manual.fan.level` | Replace with the two rows below |

```js
  { path: 'rules.fanOn', label: 'Purge starts at', unit: 'ppm' },
  { path: 'rules.fanOff', label: 'Purge stops at', unit: 'ppm' },
  { path: 'rules.purgeMaxS', label: 'Longest purge', unit: 's' },
  { path: 'rules.minOffS', label: 'Minimum off time', unit: 's' },
```

```js
  { path: 'manual.air.auto', label: 'Air exchange' },
  { path: 'manual.air.on', label: 'Air exchange: manual output' },
```

Count after the edit: 56 − 10 + 4 (rules block) − 2 + 2 (manual rows) + 1 (`airM3h`) = 51.
- [ ] **Step 4:** `node --test tests/settings-diff.test.js` → `# fail 0`, `# skipped 1`. `npm test` → `# fail 0`.
- [ ] **Step 5:** Commit:

```bash
git add tests/settings-diff.test.js web/settings-panel.js
git commit -m "feat(web): settings fields of the air exchange (C9 7.1)"
```

### Task 6: Settings panel: rules card and Machines card

**Files:** Modify `web/settings-panel.js` (`TARGETS_HTML` Room volume ~260–263, `#inRoomM3` handler ~472–475, `RULES_HTML` ~273–329, `MACHINES_HTML` ~365–372, `DEV_NAME` ~380, rule handlers ~483–523, `bumpless` ~526–540, manual writes ~561, `repaint` ~615–640). Check: H1.0–H1.9 with H1.7b (section 9.1).

- [ ] **Step 1: Write the check first.** Create `~/.local/share/mushroom-farm/air-web-check/cdp.js` and `h1.js` from Appendix A.
- [ ] **Step 2: See it fail.** Start the server on your worktree and run H1:

```bash
CHK=~/.local/share/mushroom-farm/air-web-check
cd ~/.config/superpowers/worktrees/mushroom-farm/air-web
FARM_HOST=127.0.0.1 FARM_PORT=8093 FARM_DB=$CHK/farm.db nohup node --disable-warning=ExperimentalWarning server/main.js > $CHK/server.log 2>&1 &
echo $! > $CHK/server.pid
sleep 2; node $CHK/cdp.js 'http://127.0.0.1:8093/#/rooms' $CHK/h1.js
```

Expected now: H1.1 shows the old title and old ids; H1.2–H1.11 differ from 9.1 or throw. Leave the server running for the next tasks (it reads the files at each request).
- [ ] **Step 3: Rules card.** Replace the whole `RULES_HTML` constant with:

```js
const RULES_HTML = `
<section class="card rules" aria-labelledby="hRules">
  <div class="rules-head">
    <h2 id="hRules">Air exchange and CO₂</h2>
    <span class="tag inst">For machines in Auto. Priority 1 acts before priority 2, and so on.</span>
  </div>
  <div class="rules-grid">
    <div class="inst">
      <fieldset class="rule rule-first" style="--key:var(--critical)" id="ruleSafe">
        <legend>Priority 1 · CO₂ safety level</legend>
        <label class="chk"><input type="checkbox" id="rCo2Safety"> Run the air exchange when CO₂ is ≥ <input type="number" id="rCo2SafeAt" min="500" max="20000" step="50"> ppm</label>
        <p class="hint">Above the humidity rule and the time cap. A critical alarm comes on.</p>
      </fieldset>
      <fieldset class="rule rule-first" style="--key:var(--ink)" id="ruleRh">
        <legend>Priority 2 · Humidity first</legend>
        <label class="chk"><input type="checkbox" id="rRhLock"> Delay purges that dry the room when humidity is low</label>
        <div class="row">
          <label class="num">At ≤ target − <input type="number" id="rRhStop" min="1" max="20" step="1"> % <span class="tag" id="rRhStopAbs"></span></label>
          <label class="num">Until ≥ target − <input type="number" id="rRhResume" min="0" max="19" step="1"> % <span class="tag" id="rRhResumeAbs"></span></label>
        </div>
        <p class="hint">A purge is never delayed past the CO₂ limit.</p>
      </fieldset>
      <fieldset class="rule" style="--key:var(--s-air)">
        <legend>Priority 3 · CO₂ purge</legend>
        <div class="row">
          <label class="num">Start at ≥ <input type="number" id="rFanOn" min="450" max="20000" step="50"> ppm</label>
          <label class="num">Stop at ≤ <input type="number" id="rFanOff" min="400" max="19950" step="50"> ppm</label>
        </div>
        <div class="row">
          <label class="num">Longest purge <input type="number" id="rPurgeMax" min="1" max="15" step="0.5"> min</label>
          <label class="num">Minimum off time <input type="number" id="rMinOff" min="30" max="600" step="10"> s</label>
        </div>
        <p class="hint">The intake fan and the exhaust fan run together. A purge stops at the stop level or at the longest purge. The AC and the fogger keep their targets and bring the room back after it.</p>
      </fieldset>
      <details class="measure">
        <summary>Fixed values (not settings)</summary>
        <p>Each air run lasts at least 30 s. After it, the fans stay off for the minimum off time. The CO₂ safety level ignores both. After 3 purges in a row that stop at the time cap, a warning gives the air exchange size the room needs. Humidity first acts only after the fogger is at its maximum for 5 min. Alarms need their condition for 5 min (critical alarms 60 s). Fogger: 1 min. AC: 2 min between commands. Fog cools first when the room is warm. The AC fan speed follows humidity. The circulation fan runs with the fog and 10 min of each 30 min. In spawn run, the AC also cools for the block core. Humidity control uses VPD. A failed sensor: the machines copy the same hour of an earlier day. A failed CO₂ sensor gives timed purges.</p>
      </details>
    </div>
    <div data-slot="rules-side"></div>
  </div>
</section>`;
```

- [ ] **Step 4: Machines card.** In `MACHINES_HTML` replace the whole `${deviceHtml('fan', 'Exhaust fan', …)}` block with:

```js
  ${deviceHtml('air', 'Air exchange', `
    <fieldset class="manual" id="airManual" disabled><legend>Manual output</legend><label class="chk"><input type="checkbox" id="airOnChk"> On (both fans)</label></fieldset>`)}
```

Replace `DEV_NAME` with:

```js
const DEV_NAME = { ac: 'Air conditioner', hu: 'Fogger', air: 'Air exchange', lights: 'Lights', circ: 'Circulation fan' };
```

- [ ] **Step 5: Handlers.** Change the comment `// ---- Fan and CO2 rules ----` to `// ---- Air exchange and CO2 rules ----`. Delete the `#rRhAction` handler. Delete everything from the `#rAirMode` handler through the `#rAcOn` handler. After the `#rFanOff` handler insert:

```js
  // Purge times: minutes on screen, seconds in the settings (C9 7).
  $('#rPurgeMax').addEventListener('change', e => commit(() => {
    const R = settings.rules;
    R.purgeMaxS = Math.round(numIn($('#rPurgeMax'), R.purgeMaxS / 60, 1, 15) * 60);
  }, e.target));
  $('#rMinOff').addEventListener('change', e => commit(() => {
    const R = settings.rules;
    R.minOffS = Math.round(numIn($('#rMinOff'), R.minOffS, 30, 600));
  }, e.target));
```

- [ ] **Step 6: Bumpless transfer and manual output.** In `bumpless`, replace

```js
    } else if (dev === 'hu' || dev === 'fan') {
      m.level = cmd[dev].level;
    } else {
```

with

```js
    } else if (dev === 'hu') {
      m.level = cmd.hu.level;
    } else {
```

(the air exchange takes `m.on = cmd.air.on` in the `else` branch, like lights and circulation). Replace the `#fanLevelSel` handler line with:

```js
  $('#airOnChk').addEventListener('change', e => commit(() => { settings.manual.air.on = e.target.checked; }, e.target));
```

- [ ] **Step 7: Repaint.** In `repaint`, replace the lines from `setVal($('#rCo2Safety'), …` through `setVal($('#ciOn'), s.manual.circ.on);` with:

```js
    setVal($('#rCo2Safety'), R.co2Safety); setVal($('#rCo2SafeAt'), R.co2SafetyAt);
    setVal($('#rRhLock'), R.rhLock); setVal($('#rRhStop'), R.rhStop); setVal($('#rRhResume'), R.rhResume);
    global.FarmUi.set($('#rRhStopAbs').id, `(${s.spRH - R.rhStop} %)`);
    global.FarmUi.set($('#rRhResumeAbs').id, `(${s.spRH - R.rhResume} %)`);
    setVal($('#rFanOn'), R.fanOn); setVal($('#rFanOff'), R.fanOff);
    // Purge times: minutes on screen, seconds in the settings (C9 7).
    setVal($('#rPurgeMax'), +(R.purgeMaxS / 60).toFixed(2)); setVal($('#rMinOff'), R.minOffS);
    $('#ruleRh').classList.toggle('off', !R.rhLock);
    $('#ruleSafe').classList.toggle('off', !R.co2Safety);
    for (const dev of ['ac', 'hu', 'air', 'lights', 'circ']) {
      const m = s.manual[dev], seg = $(`.seg[data-dev="${dev}"]`);
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.auto === '1') === m.auto)));
      $('#' + dev + 'Manual').disabled = m.auto;
    }
    setVal($('#acModeSel'), s.manual.ac.power ? s.manual.ac.mode : 'off');
    setVal($('#acSetIn'), s.manual.ac.setpoint); global.FarmUi.set($('#acSetOut').id, `${s.manual.ac.setpoint.toFixed(1)} °C`);
    setVal($('#huLevelSel'), s.manual.hu.level);
    setVal($('#airOnChk'), s.manual.air.on);
    setVal($('#liOn'), s.manual.lights.on);
    setVal($('#ciOn'), s.manual.circ.on);
```

- [ ] **Step 8: Installer field "Air exchange size" (C9 7).** In `TARGETS_HTML`, directly after the `div.rule-extra` that holds `inRoomM3`, insert:

```html
    <div class="rule-extra">
      <label class="num" for="inAirSize">Air exchange size</label>
      <input type="number" id="inAirSize" min="50" max="10000" step="50" value="1800"> <span>m³/h</span>
    </div>
```

After the `#inRoomM3` handler, insert:

```js
  $('#inAirSize').addEventListener('change', e => commit(() => {
    settings.airM3h = Math.round(numIn($('#inAirSize'), settings.airM3h, 50, 10000));
  }, e.target));
```

In `repaint`, after `setVal($('#inRoomM3'), s.roomM3);`, add `setVal($('#inAirSize'), s.airM3h);`.
- [ ] **Step 9:** `node --check web/settings-panel.js`; `npm test` → `# fail 0`. Run H1 again (Step 2's last command). Expected: H1.0–H1.9 and H1.7b exactly as in 9.1; H1.10 and H1.11 still differ (task 11).
- [ ] **Step 10:** Commit:

```bash
git add web/settings-panel.js
git commit -m "feat(web): settings panel purge rules, air exchange size and machine (C9 7)"
```

### Task 7: Room drawing

**Files:** Modify `web/simulator.js` (`MIMIC_SVG` ~558–665, `layoutVents` ~118–141, `animateMimic` ~143–157, `updateUi` ~223–233), `styles.css` (`.grille line`, line ~193).

- [ ] **Step 1:** In `MIMIC_SVG`, replace the `<desc id="mimicDesc">…</desc>` line with:

```html
      <desc id="mimicDesc">Live view of the fruiting room: the growing rack, the three sensors, the air conditioner, the fogger, the circulation fan, and the air exchange (a filtered intake fan and an exhaust fan; their dampers close when they are off).</desc>
```

- [ ] **Step 2:** In `MIMIC_SVG`, replace the block from `<g id="fanUnit">` through the `<g id="grilleUnit" class="grille">…</g>` element (the line that ends `<line x1="-3" x2="3" y1="11" y2="11"/></g>`) with:

```html
      <g id="fanIn">
        <rect class="unit" x="-40" y="-40" width="80" height="80" rx="6"/>
        <rect class="keybar fan" x="-40" y="34" width="80" height="6" rx="2"/>
        <circle class="ring" r="31"/>
        <g id="fanInBlades">
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(120)"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(240)"/>
        </g><circle r="5" class="blade"/>
        <rect class="damper" x="-3" y="-36" width="6" height="72" rx="2"/>
      </g>
      <g id="fanOut">
        <rect class="unit" x="-40" y="-40" width="80" height="80" rx="6"/>
        <rect class="keybar fan" x="-40" y="34" width="80" height="6" rx="2"/>
        <circle class="ring" r="31"/>
        <g id="fanOutBlades">
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(120)"/>
          <path class="blade" d="M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z" transform="rotate(240)"/>
        </g><circle r="5" class="blade"/>
        <rect class="damper" x="-3" y="-36" width="6" height="72" rx="2"/>
      </g>
```

- [ ] **Step 3:** Replace the comment above `VENT_Y`, `VENT_Y` and the whole `layoutVents` function with:

```js
// Places the intake fan, the exhaust fan, their arrows and texts for env.inletAt / env.exhaustAt (on a change only).
const VENT_Y = { high: 160, low: 352 };
function layoutVents() {
  const key = `${env.inletAt}|${env.exhaustAt}`;
  if (key === ventKey) return;
  ventKey = key;
  const L = mimicLayout(env), flows = el.querySelector('#ventFlows'), txt = el.querySelector('#ventText');
  flows.replaceChildren(); txt.replaceChildren();
  for (const side of ['inlet', 'outlet']) {
    const o = L[side], y = VENT_Y[o.band], left = side === 'inlet';
    el.querySelector(left ? '#fanIn' : '#fanOut').setAttribute('transform', `translate(${left ? 180 : 820} ${y})`);
    const [x1, x2] = left ? [60, 134] : [866, 990];
    for (const d of [-18, 0, 18]) UI.svgEl('path', { class: 'flow fan', 'data-flow': 'fan', d: `M${x1} ${y + d} H${x2}`, 'marker-end': 'url(#arFan)' }, flows);
    const lines = [['m-tag', null, o.tag, 0], ['m-small', left ? 'mInState' : 'mOutState', '', 17], ['m-small', null, o.label, 17]];
    let ty = o.band === 'high' ? 226 : 300 - lines.reduce((h, l) => h + l[3], 0);
    for (const [cls, id, text, gap] of lines) {
      ty += gap;
      UI.svgEl('text', { x: left ? 12 : 836, y: ty, class: cls, ...(id ? { id } : {}) }, txt).textContent = text;
    }
  }
  animFanFlows = [...flows.querySelectorAll('[data-flow="fan"]')];
}
```

- [ ] **Step 4:** In `animateMimic` replace `const fanF = a.fanLevel / 3, fogF = a.huLevel / 3;` with `const fanF = a.air ? 1 : 0, fogF = a.huLevel / 3;`, and replace the line `el.querySelector('#fanBlades').setAttribute('transform', …);` with:

```js
  const fanRot = `rotate(${anim.fan.toFixed(1)})`;
  el.querySelector('#fanInBlades').setAttribute('transform', fanRot);
  el.querySelector('#fanOutBlades').setAttribute('transform', fanRot);
```

- [ ] **Step 5:** In `updateUi`, replace the four lines `layoutVents();`, `UI.set('mFanState', …);`, `UI.set('mOutflow', …);`, `UI.set('mInflow', …);` with:

```js
  layoutVents();
  const airTxt = a.air ? `Purge ${Math.round(v.airM3h).toLocaleString('en')} m³/h` : 'Off · dampers closed';
  UI.set('mInState', airTxt); UI.set('mOutState', airTxt);
```

and replace `el.querySelector('#fanUnit').classList.toggle('on', a.fanLevel > 0);` with:

```js
  el.querySelector('#fanIn').classList.toggle('on', a.air);
  el.querySelector('#fanOut').classList.toggle('on', a.air);
```

- [ ] **Step 6:** In `styles.css` replace the line `.grille line { stroke: var(--ink-2); stroke-width: 1.2; }` with:

```css
.damper { fill: var(--ink-2); }
.on > .damper { display: none; }
```

- [ ] **Step 7:** `node --check web/simulator.js`; `npm test` → `# fail 0`.
- [ ] **Step 8:** Commit:

```bash
git add web/simulator.js styles.css
git commit -m "feat(web): room drawing with the intake and exhaust fans and their dampers (C9 7)"
```

### Task 8: Status card, glance row, ladder chip, purge counters

**Files:** Modify `web/simulator.js` (`FP_ID_SUFFIX` / `faceplate` ~683–693, `MARKUP` fan faceplate ~906–909 and glance ~724–756, `updateUi` ~238–276, `updateLadderLive` ~353–367, `paintGlance` ~431–466, `wire` duty ~1172–1178), `styles.css`.

- [ ] **Step 1:** Replace the comment above `FP_ID_SUFFIX`, `FP_ID_SUFFIX` and `faceplate` with:

```js
// C5 1.4 "Today's ids stay": today's faceplate heading ids are fpAcTitle, fpHuTitle, fpLiTitle, fpCiTitle (not a
// lowercase device name), so faceplate() maps dev to that suffix; the air exchange is fpAirTitle (C9 7). The tag gets
// the id fp<suffix>Tag, so a size change can repaint it.
const FP_ID_SUFFIX = { ac: 'Ac', hu: 'Hu', air: 'Air', lights: 'Li', circ: 'Ci' };
function faceplate(dev, title, tag, extraClass, body) {
  const id = FP_ID_SUFFIX[dev];
  return `<article class="card faceplate${extraClass ? ' ' + extraClass : ''}" style="--key:var(--s-${dev === 'lights' ? 'li' : dev === 'circ' ? 'ci' : dev})" aria-labelledby="fp${id}Title">
    <header class="fp-head">
      <span class="key"></span>
      <div><h3 id="fp${id}Title">${title}</h3><span class="tag" id="fp${id}Tag">${tag}</span></div>
    </header>
    ${body}
  </article>`;
}
```

- [ ] **Step 2:** In `MARKUP`, replace the whole `${faceplate('fan', 'Exhaust fan', 'EF-203 · 3 levels', '', …)}` block with:

```js
${faceplate('air', 'Air exchange', 'SF-203 + EF-206 · 1,800 m³/h', '', `
    <div class="fp-state"><span class="state" id="airState">Idle</span><span class="pw" id="airPower">0 W</span></div>
    <p class="why" id="airWhy"></p>`)}
```

- [ ] **Step 3:** In `updateUi`, replace the `UI.set('acState', …)` line with:

```js
  UI.set('acState', !c.ac.power ? 'Off' : `${AC_WORD[c.ac.mode]} · set ${c.ac.setpoint.toFixed(1)} °C`);
```

and replace the four lines `UI.set('fanState', …)`, `UI.set('fanPower', …)`, `el.querySelector('#fanMeter')…`, `UI.set('fanWhy', …)` with:

```js
  const air = airText({ st, cur: ctl.purges().cur, rules: R, manual: cfg.manual.air, t: v.t });
  UI.set('airState', air.state);
  UI.set('airPower', UI.watts(v.power.air));
  UI.set('airWhy', hold(st.why.air, st.hold.air));
```

- [ ] **Step 4:** In `updateUi`, replace the lines from `const S = st.stats, perDay = …` through `UI.set('dFogStarts', …)` with:

```js
  const S = st.stats, perDay = n => (r.t >= 3600 ? ` (${Math.round(n / days)}/day)` : '');
  UI.set('dPurges', String(S.purges)); UI.set('dPurgesL', `purges${perDay(S.purges)}`);
  UI.set('dPurgeAvg', S.purges ? UI.fmtMinSec(Math.round(S.purgeS / S.purges)) : '–');
  UI.set('dPurgeMax', S.purges ? UI.fmtMinSec(Math.round(S.longestPurgeS)) : '–');
  UI.set('dCapped', String(S.cappedPurges));
  UI.set('dAirOn', UI.fmtDur(S.airOnS));
  UI.set('dAirOnL', r.t > 0 ? `air exchange run time (${Math.round(S.airOnS / r.t * 100)} %)` : 'air exchange run time');
  UI.set('dDelayed', UI.fmtDur(S.delayedS));
  UI.set('dAcCmds', String(S.acCmds)); UI.set('dAcCmdsL', `AC commands${perDay(S.acCmds)}`);
  UI.set('dFogStarts', String(S.fogStarts)); UI.set('dFogStartsL', `fogger starts${perDay(S.fogStarts)}`);
```

In the same function change `paintGlance(list, tot, days);` to `paintGlance(list, tot, days, air);`.
- [ ] **Step 5:** Replace the whole `updateLadderLive` function with:

```js
function updateLadderLive() {
  if (!ladder) return;
  const st = ctl.state, co2 = reading.CO2;
  const ok = Number.isFinite(co2) && !st.f.CO2;
  ladder.draw(cfg, ok ? co2 : NaN, { air: airText({ st, cur: ctl.purges().cur, rules: cfg.rules, manual: cfg.manual.air, t: reading.t }).chip });
}
```

- [ ] **Step 6: Glance.** In `MARKUP`, after the `glC` row (the `div.gl-row#glC` and its `</div>`) and before `</section>`, insert:

```html
      <div class="gl-row" id="glAir"><span class="gl-k">Air exchange</span><b class="gl-v txt" id="glAirNow">Idle</b><span class="gl-ico" aria-hidden="true"></span></div>
```

Replace `<dt>Fan runs</dt><dd id="glFan">–</dd>` with `<dt>Air exchange</dt><dd id="glPurges">–</dd>`. Change the line `function paintGlance(alarms, kwhTot, days) {` to `function paintGlance(alarms, kwhTot, days, air) {` and replace the `UI.set('glFan', …)` line with:

```js
  UI.set('glAirNow', air.glance);
  const S = st.stats;
  UI.set('glPurges', full ? `Purges ${Math.round(perDay(S.purges))} · average ${S.purges ? UI.fmtMinSec(Math.round(S.purgeS / S.purges)) : '–'}` : '–');
```

- [ ] **Step 7: Counters markup.** In `wire`, replace the whole `duty.innerHTML = …;` statement (a template string of six `div`s) with:

```js
  duty.innerHTML = `
    <div><span class="num" id="dPurges">0</span><span class="lbl" id="dPurgesL">purges</span></div>
    <div><span class="num" id="dPurgeAvg">–</span><span class="lbl">average purge (min:s)</span></div>
    <div><span class="num" id="dPurgeMax">–</span><span class="lbl">longest purge (min:s)</span></div>
    <div><span class="num" id="dCapped">0</span><span class="lbl">purges stopped at the time cap</span></div>
    <div><span class="num" id="dAirOn">0 min</span><span class="lbl" id="dAirOnL">air exchange run time</span></div>
    <div><span class="num" id="dDelayed">0 min</span><span class="lbl">purges delayed by humidity</span></div>
    <div class="inst"><span class="num" id="dAcCmds">0</span><span class="lbl" id="dAcCmdsL">AC commands</span></div>
    <div class="inst"><span class="num" id="dFogStarts">0</span><span class="lbl" id="dFogStartsL">fogger starts</span></div>`;
```

- [ ] **Step 8:** In `styles.css`, after the `.gl-v { … }` rule, add:

```css
.gl-v.txt { font: 600 14px var(--font-cond); }
```

- [ ] **Step 9:** `node --check web/simulator.js`; `npm test` → `# fail 0`.
- [ ] **Step 10:** Commit:

```bash
git add web/simulator.js styles.css
git commit -m "feat(web): air exchange status card, glance row, ladder chip and purge counters (C9 7)"
```

### Task 9: Energy, purge record card, 24 h test, data table, samples

**Files:** Modify `web/simulator.js` (`sample` ~40–52, `updateUi` energy ~260–268, `renderExhaust` ~319–350, `runTest` / `renderTest` ~479–536, `renderTable` ~548–555, `MARKUP` energy / exhaust / estimate / table cards ~939–995).

- [ ] **Step 1:** Replace the whole `sample` function with:

```js
function sample(r) {
  const R = cfg.rules, c = ctl.state.cmd;
  samples.push({ t: r.t, T: plausible('T', r.T), RH: plausible('RH', r.RH), C: plausible('CO2', r.CO2),
    tOut: plausible('tOut', r.tOut), rhOut: plausible('rhOut', r.rhOut),
    ac: r.power.ac, hu: r.power.hu, air: r.power.air, li: r.power.lights || 0, ci: r.power.circ || 0,
    acSet: c.ac.power ? c.ac.setpoint : NaN,
    core: r.core != null ? r.core : NaN, vpd: ctl.state.vpd ?? NaN,
    // `c.air && c.air.on`: the C9 4.2 / 6.3 form, 0 when a command has no air exchange.
    cmd: { air: c.air && c.air.on ? 1 : 0, fog: c.hu.level, acPower: c.ac.power ? 1 : 0, acMode: c.ac.mode,
      acSet: c.ac.setpoint, acFan: c.ac.fan, lights: c.lights.on ? 1 : 0, circ: c.circ.on ? 1 : 0 },
    spT: cfg.spT, spRH: cfg.spRH, co2Lim: cfg.co2Lim, fanOn: R.fanOn, fanOff: R.fanOff });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  chartsDirty = true;
}
```

- [ ] **Step 2: Energy.** In `updateUi` replace `r.kwh.fan` with `r.kwh.air` in the `const tot = …` line, and in the loop list replace `['fan', 'Fan']` with `['air', 'Air']`. In `MARKUP` replace the `e-row` line whose name is `Exhaust fan` with:

```html
    <div class="e-row" style="--key:var(--s-air)"><span class="nm"><i></i>Air exchange</span><span class="v" id="eAir"></span><span class="track"><span id="eAirBar"></span></span></div>
```

- [ ] **Step 3: Purge record card.** In `MARKUP` replace the whole `<section class="card exhaust" aria-labelledby="hExh">…</section>` with:

```html
<section class="card exhaust" aria-labelledby="hExh">
  <div class="rules-head">
    <h2 id="hExh">Air exchange per hour</h2>
    <span class="tag">Controller record. Air volume = run time × the air exchange size.</span>
  </div>
  <div class="e-hero">
    <div><span class="num" id="xAvgStarts">–</span><span class="lbl">purges per hour</span></div>
    <div><span class="num" id="xAvgRun">–</span><span class="lbl">run per hour (min:s)</span></div>
    <div><span class="num" id="xAvgAch">–</span><span class="lbl">air changes per hour</span></div>
    <div><span class="num" id="xTotM3">0</span><span class="lbl">m³ exchanged, last 24 h</span></div>
    <div><span class="num" id="xCapped">0</span><span class="lbl">capped purges, last 24 h</span></div>
  </div>
  <p class="est-note" style="margin:0 0 4px">Air exchange run minutes per hour, last 24 h (point at a bar for the values). The averages use the full hours.</p>
  <div id="exhChart" class="ch-host"></div>
  <div class="exh-grid">
    <div>
      <h3 class="eyebrow">Each hour</h3>
      <table><thead><tr><th>Hour</th><th>Purges</th><th>Run (min:s)</th><th>Air (m³)</th><th>Air changes</th><th>Capped</th></tr></thead><tbody id="exhRows"></tbody></table>
    </div>
    <div>
      <h3 class="eyebrow">Each run (newest first)</h3>
      <div class="exh-scroll">
        <table><thead><tr><th>Start</th><th>End</th><th>Time (min:s)</th><th>Reason</th><th>CO₂ start → end</th><th>Air (m³)</th><th>Capped</th></tr></thead><tbody id="exhEvents"></tbody></table>
      </div>
    </div>
  </div>
</section>
```

Replace the comment `// ---------------- Exhaust per hour ----------------` and the whole `renderExhaust` function with:

```js
// ---------------- Air exchange per hour (C9 5.7 ctl.purges()) ----------------
function renderPurges() {
  const P = ctl.purges(), nowH = Math.floor(reading.t / 3600);
  const hours = [];
  for (let h = nowH - 23; h <= nowH; h++) hours.push(P.hours.find(b => b.h === h) || { h, runS: 0, starts: 0, m3: 0, cappedN: 0 });
  const key = `${nowH}|${hours.map(b => `${Math.round(b.runS / 30)}.${b.cappedN}`).join(',')}|${P.events.length}|${cfg.roomM3}`;
  if (key === exhKey) return;
  exhKey = key;
  const vol = cfg.roomM3 || 1, mine = hours.filter(b => b.h >= 0);
  const done = mine.filter(b => b.h < nowH);
  const sum = (arr, k) => arr.reduce((s, b) => s + b[k], 0);
  UI.set('xAvgStarts', done.length ? (sum(done, 'starts') / done.length).toFixed(1) : '–');
  UI.set('xAvgRun', done.length ? UI.fmtMinSec(Math.round(sum(done, 'runS') / done.length)) : '–');
  UI.set('xAvgAch', done.length ? (sum(done, 'm3') / done.length / vol).toFixed(1) : '–');
  UI.set('xTotM3', Math.round(sum(mine, 'm3')).toLocaleString('en'));
  UI.set('xCapped', String(sum(mine, 'cappedN')));
  global.FarmCharts.drawPurgeBars(el.querySelector('#exhChart'), hours, clock());
  el.querySelector('#exhRows').replaceChildren(...mine.slice(-12).reverse().map(b => {
    const tr = document.createElement('tr');
    tr.append(UI.cell('td', `${clock().hm(b.h * 3600)}–${clock().hm((b.h + 1) * 3600)}${b.h === nowH ? ' (now)' : ''}`),
      UI.cell('td', String(b.starts)), UI.cell('td', UI.fmtMinSec(b.runS)), UI.cell('td', Math.round(b.m3).toLocaleString('en')),
      UI.cell('td', (b.m3 / vol).toFixed(1)), UI.cell('td', String(b.cappedN)));
    return tr;
  }));
  const evs = (P.cur ? [{ ...P.cur, running: true }] : []).concat(P.events.slice().reverse()).slice(0, 40);
  el.querySelector('#exhEvents').replaceChildren(...evs.map(e => {
    const tr = document.createElement('tr');
    const dur = (e.running ? reading.t : e.end) - e.start;
    tr.append(UI.cell('td', clock().stamp(e.start)), UI.cell('td', e.running ? 'running' : clock().stamp(e.end)), UI.cell('td', UI.fmtMinSec(dur)),
      UI.cell('td', e.reason || '–'), UI.cell('td', `${UI.fmtNum(e.co2Start, 0)} → ${e.running ? '…' : UI.fmtNum(e.co2End, 0)}`),
      UI.cell('td', Math.round(e.m3).toLocaleString('en')), UI.cell('td', e.capped ? 'Yes' : '–'));
    return tr;
  }));
}
```

In `updateUi` change the call `renderExhaust();` to `renderPurges();`. In `wire`, change the comment `// A width change redraws the exhaust bar chart …` to `// A width change redraws the purge bar chart at its new size (today's behaviour), unmount() disconnects it.`
- [ ] **Step 4: 24 h test.** Replace the whole `runTest` and `renderTest` functions with:

```js
function runTest(rulesOverride) {
  const cfg2 = structuredClone(cfg); Object.assign(cfg2.rules, rulesOverride);
  const sim2 = SIM.create(structuredClone(env), sim.snapshot());
  const ctl2 = CC.create(cfg2, ctl.snapshot(), null);
  const io2 = RT.simIO(sim2);
  io2.write(ctl2.state.cmd);
  let cb = null;
  const rt2 = RT.createRuntime({ io: io2, ctl: ctl2, onReading: r => { if (cb) cb(r); }, skipCurrent: true });
  const run = (secs, f) => { cb = f; for (let i = 0; i < secs; i++) { io2.advance(1); rt2.poll(); } };
  run(3600);
  const r0 = sim2.read(), s0 = { ...ctl2.state.stats }, a0 = sim2.view().acStarts;
  let n = 0, inT = 0, inRH = 0, overC = 0, rhLow = 0;
  run(86400, () => {
    const room = sim2.view();
    n++;
    if (Math.abs(room.T - cfg2.spT) <= CC.BANDS.T) inT++;
    if (Math.abs(room.RH - cfg2.spRH) <= CC.BANDS.RH) inRH++;
    if (room.CO2 > cfg2.co2Lim) overC++;
    if (room.RH < cfg2.spRH - CC.BANDS.RHAlarm) rhLow++;
  });
  const r1 = sim2.read(), s1 = ctl2.state.stats, k = key => r1.kwh[key] - r0.kwh[key];
  return { ac: k('ac'), hu: k('hu'), air: k('air'), total: k('ac') + k('hu') + k('air'),
    airH: (s1.airOnS - s0.airOnS) / 3600, purges: s1.purges - s0.purges, capped: s1.cappedPurges - s0.cappedPurges,
    delayedH: (s1.delayedS - s0.delayedS) / 3600, acStarts: sim2.view().acStarts - a0, acCmds: s1.acCmds - s0.acCmds,
    inT: inT / n * 100, inRH: inRH / n * 100, overMin: overC / n * 1440, rhLowMin: rhLow / n * 1440 };
}
function renderTest() {
  const tariff = input.tariff;
  const variants = [
    ['Your rules', runTest({})],
    ['No humidity priority', runTest({ rhLock: false })],
  ];
  const mine = variants[0][1];
  const head = ['Rules', 'Total kWh/day', 'RM/day', 'AC kWh', 'Fogger kWh', 'Air exchange kWh', 'AC compressor starts', 'AC commands', 'Air exchange run (h)', 'Purges', 'Capped purges', 'Purges delayed by RH (h)', 'Temp in band', 'RH in band', 'RH low alarm', 'CO₂ over limit'];
  const sgn = v => (v > 0 ? '+' : '') + v;
  const row = (name, x) => [name,
    x === mine ? x.total.toFixed(2) : `${x.total.toFixed(2)} (${sgn((x.total - mine.total).toFixed(2))})`,
    (x.total * tariff).toFixed(2), x.ac.toFixed(2), x.hu.toFixed(2), x.air.toFixed(2),
    String(x.acStarts), String(x.acCmds), x.airH.toFixed(1), String(x.purges), String(x.capped), x.delayedH.toFixed(1),
    `${x.inT.toFixed(0)} %`, `${x.inRH.toFixed(0)} %`, `${Math.round(x.rhLowMin)} min`, `${Math.round(x.overMin)} min`];
  const table = document.createElement('table');
  const thead = document.createElement('thead'), htr = document.createElement('tr');
  for (const h of head) htr.append(UI.cell('th', h));
  thead.append(htr);
  const tbody = document.createElement('tbody');
  for (const [name, x] of variants) {
    const tr = document.createElement('tr');
    for (const c of row(name, x)) tr.append(UI.cell('td', c));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  const note = document.createElement('p'); note.className = 'est-note';
  note.textContent = `Start: ${clock().stamp(reading.t)}. The value in brackets is the difference from your rules. "In band" uses the real room values at each reading. "RH low alarm" is the time below target − ${CC.BANDS.RHAlarm} %. The AC restart energy comes from the simulation setting "Full speed after each AC start".`;
  el.querySelector('#estOut').replaceChildren(table, note);
}
```

In `MARKUP` replace the paragraph inside `#estOut` with:

```html
<p class="est-note">Run the test to compare two rule sets: your rules, and no humidity priority.</p>
```

- [ ] **Step 5: Data table.** In `renderTable` replace `Math.round(p.fan)` with `Math.round(p.air)`. In `MARKUP` (the `#tableCard` header row) replace `<th>Fan W</th>` with `<th>Air exchange W</th>`.
- [ ] **Step 6:** `node --check web/simulator.js`; `npm test` → `# fail 0` (`tests/web-bench.test.js` runs `sample()` with the old controller: it must pass).
- [ ] **Step 7:** Commit:

```bash
git add web/simulator.js
git commit -m "feat(web): air exchange energy, purge record card, 24 h test and data table (C9 4.2, 5.7)"
```

### Task 10: Test bench

**Files:** Modify `web/simulator.js` (`RAMP_PATHS`, `DEV_NAME` ~74–75, `paintBlocks` ~87, `updateUi` `wNote` ~256–258, `MARKUP` Air path ~849–857, measuring steps ~801–806, plant facts ~879–888, `handlePanelChange` ~1019–1041, `wire` ~1078 and ~1144).

- [ ] **Step 1:** Replace `RAMP_PATHS` and `DEV_NAME` with:

```js
const RAMP_PATHS = new Set(['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff']); // C9 5.2 RAMP_KEYS
const DEV_NAME = { ac: 'Air conditioner', hu: 'Fogger', air: 'Air exchange', lights: 'Lights', circ: 'Circulation fan' };
```

- [ ] **Step 2:** After the `paintBlocks` function add:

```js
// The air exchange size (C9 7): the faceplate tag and the plant facts line.
function paintAirSize() {
  const m3h = env.airM3h ?? PL.air.m3h, n = m3h.toLocaleString('en');
  UI.set('fpAirTag', `SF-203 + EF-206 · ${n} m³/h`);
  UI.set('plantAir', `${n} m³/h, ${Math.round(m3h * PL.air.wPerM3h)} W while on`);
}
```

- [ ] **Step 3:** In `MARKUP` replace the whole "Air path" `<section>` (from `<h2 class="eyebrow">Air path</h2>` to its `</section>`) with:

```html
  <section>
    <h2 class="eyebrow">Air path</h2>
    <div class="rule-extra">
      <label class="num" for="inAirM3h">Air exchange size</label>
      <input type="number" id="inAirM3h" min="50" max="10000" step="50" value="1800"> <span>m³/h</span>
    </div>
    <div class="crop-row"><label for="inInlet">Air comes in</label><select id="inInlet"><option value="low">Low</option><option value="high">High</option></select></div>
    <div class="crop-row"><label for="inOutlet">Air goes out</label><select id="inOutlet"><option value="high">High</option><option value="low">Low</option></select></div>
    <p class="hint">The intake fan and the exhaust fan run together. CO₂ collects low: air in high and out low removes it best.</p>
  </section>
```

- [ ] **Step 4:** In `MARKUP` replace `<li>Stop the exhaust fan and close the room.</li>` with `<li>Switch the air exchange to Manual, Off, and close the room.</li>`, and replace `<dt>Fan levels</dt><dd>Low 300 m³/h 60 W · Medium 600 m³/h 90 W · High 900 m³/h 120 W</dd>` with `<dt>Air exchange</dt><dd id="plantAir">1,800 m³/h, 144 W while on</dd>`.
- [ ] **Step 5:** In `updateUi` replace the `UI.set('wNote', …);` statement with:

```js
  UI.set('wNote', r.water.acKg > r.water.fogKg * 1.5 && r.water.fogKg > 0.5
    ? 'The AC coil removes much more water than the fogger adds: the AC and the fogger work against each other. A high AC fan speed and fog-first cooling decrease this.'
    : 'Air from the intake fan goes through the filter. Between purges the dampers are closed and only wall leakage comes in, unfiltered.');
```

- [ ] **Step 6:** In `wire` delete the line `selBind('inVent', () => env.vent, v => { env.vent = v; });` and in its place add:

```js
  $('#inAirM3h').addEventListener('change', e => {
    const v = parseFloat(e.target.value);
    const m3h = UI.clamp(Number.isFinite(v) ? Math.round(v) : (env.airM3h ?? PL.air.m3h), 50, 10000);
    env.airM3h = m3h; cfg.airM3h = m3h; e.target.value = m3h; // C9 7: the simulated pair and the controller's size together
    panel.set(cfg); paintAirSize();
  });
```

In `handlePanelChange`, in the final `else` branch, directly after `setPath(cfg, c.path, c.new);`, insert (a size set in the panel's `inAirSize` also sizes the simulated pair, as `sim-adapter.js` does for a live room, C9 6.3):

```js
      if (c.path === 'airM3h') { env.airM3h = c.new; el.querySelector('#inAirM3h').value = c.new; paintAirSize(); }
```

In the initial paint, after `paintBlocks();`, add:

```js
  $('#inAirM3h').value = env.airM3h ?? PL.air.m3h;
  paintAirSize();
```

- [ ] **Step 7:** `node --check web/simulator.js`; `npm test` → `# fail 0`.
- [ ] **Step 8:** Commit:

```bash
git add web/simulator.js
git commit -m "feat(web): test bench air exchange size and plant facts (C9 7)"
```

### Task 11: Capacity and Calibration

**Files:** Modify `web/capacity.js` (lines ~15, 25, 28, 31–40, 210–211, 230), `web/calibration.js` (lines ~42, 57). Check: H1.10, H1.11.

- [ ] **Step 1: See the check fail.** Run H1 (task 6 step 2, last command). H1.10 prints rooms with `vent`; H1.11 prints the old tag text.
- [ ] **Step 2:** In `web/capacity.js`:

| Place | New code |
|---|---|
| `LIM` | `const LIM = { blocks: 200000, volume: [5, 5000], co2: [1, 1000], air: [50, 10000] };` |
| `LIMIT_WORD` | `const LIMIT_WORD = { air: 'the air exchange (CO₂ purges)', ac: 'the AC (heat)', fog: 'the fogger (water)' };` |
| `FAIL_MACHINE`, last entry | `'CO₂ above the limit': 'the air exchange is too small for short purges'` |

Replace the whole `normRoom` function with:

```js
// Saved and imported rooms are not trusted: only valid fields are kept, so one bad room cannot stop the page.
// A report from before the air exchange (C9) names the balance limit 'fan': it is dropped, so the check runs again.
function normRoom(r, i) {
  if (!r || typeof r !== 'object') return null;
  const mix = (Array.isArray(r.mix) ? r.mix : []).filter(m => m && hasCrop(m.crop) && inRange(m.blocks, 0, LIM.blocks))
    .map(m => ({ crop: m.crop, blocks: Math.round(m.blocks), ...(inRange(m.co2PerBlock, ...LIM.co2) ? { co2PerBlock: m.co2PerBlock } : {}) }));
  const rep = r.report;
  const report = rep && typeof rep === 'object' && VERDICT_CHIP[rep.verdict] && Array.isArray(rep.runs)
    && !(rep.balance && !LIMIT_WORD[rep.balance.limit]) ? rep : null;
  return { id: String(r.id || `${Date.now().toString(36)}${i}`), name: String(r.name || 'Room').slice(0, 60),
    volume: inRange(r.volume, ...LIM.volume) ? r.volume : PL.room.volume, ...(inRange(r.airM3h, ...LIM.air) ? { airM3h: r.airM3h } : {}),
    calib: validCalib(r.calib), mix, report, rev: 0 };
}
```

In the `#capSave` handler replace the `rooms.push({ … });` statement with:

```js
    rooms.push({ id: Date.now().toString(36), name, volume: (FB.env.room && FB.env.room.volume) || PL.room.volume,
      ...(Number.isFinite(FB.env.airM3h) ? { airM3h: FB.env.airM3h } : {}),
      calib: FB.calApplied ? { ...FB.calApplied } : null, mix: [{ crop: FB.cfg.crop, blocks: UI.clamp(Math.round(FB.env.blocks), 0, LIM.blocks) }], report: null, rev: 0 });
```

In the `#capRun` handler replace the `snap` part of the `const rev = …` line with:

```js
    const rev = r.rev || 0, snap = structuredClone({ name: r.name, volume: r.volume, ...(r.airM3h != null ? { airM3h: r.airM3h } : {}), calib: r.calib, mix: r.mix });
```

- [ ] **Step 3:** In `web/calibration.js` replace the `rules-head` tag with:

```html
    <span class="tag">Make the simulation agree with your room. The log must have the machine states at 1 min or less.</span>
```

and the CSV help paragraph with:

```html
    <p>Header row, then one row per minute (or less). Columns in any order: <b>time</b> (date and time, or minutes from the start), <b>T</b>, <b>RH</b>, <b>CO2</b>, tOut, rhOut, air (0 or 1, the air exchange; an old fan column 0–3 counts as on when above 0), fog (0–3), acPower (0/1), acMode (cool/heat/dry/fan), acSet (°C), acFan (low/auto/high), lights (0/1), circ (0/1, circulation fan). Columns in bold are necessary.</p>
```

- [ ] **Step 4:** `node --check web/capacity.js && node --check web/calibration.js`; `npm test` → `# fail 0`. Run H1 → H1.0–H1.11 and H1.7b exactly as in 9.1; `PROBLEMS: none` (a 404 for `/favicon.ico` is allowed).
- [ ] **Step 5:** Commit:

```bash
git add web/capacity.js web/calibration.js
git commit -m "feat(web): capacity rooms without vent, air exchange limit words; calibration CSV air column (C9 7, 8)"
```

### Task 12: Sweep and stream checks

- [ ] **Step 1: Leftovers.** Run:

```bash
grep -nE "fanLevel|fanLevels|cmd\.fan|power\.fan|kwh\.fan|'fan'|fanOnS|fanStarts|fanBlocked|setback|exhaust\(\)|\.vent\b|inVent|PL\.fan|PLANT\.fan|s-fan|acPurge|airMode|rhAction|acAction|acOff|acOn\b|fanUnit|fanBlades|grille|EF-203|Exhaust fan|Fan purge|drawExhaustBars" web/*.js styles.css
```

Every hit must be one of these; fix anything else and commit `fix(web): leftovers of the one-fan model (C9 7)`.

| File | Allowed hit (5 lines in all) | Why it stays |
|---|---|---|
| `web/capacity.js` | The comment above `normRoom` (`… the balance limit 'fan' …`) | It explains why old reports are dropped |
| `web/settings-panel.js` | `['cool', 'heat', 'dry', 'fan']` (bumpless) | The AC's fan-only mode |
| `web/simulator.js` | `'data-flow': 'fan'` (`layoutVents`), `kind: 'fan'` (twice, `mimicLayout`) | Both machines of the pair are fans (C9 7) |

- [ ] **Step 2: Commands.** Run each and compare:

| Command | Expected |
|---|---|
| `for f in web/*.js; do node --check $f; done` | No output |
| `npm test` | `# fail 0`; `# tests` T0 + 13; `# pass` P0 + 11; `# skipped` S0 + 2 |
| `git diff --name-only <base>` | Exactly the files of section 2 that you changed (`styles.css`, `tests/settings-diff.test.js`, `tests/web-air.test.js`, `tests/web-api.test.js`, `tests/web-bench.test.js`, `tests/web-charts.test.js`, `tests/web-load.test.js`, `tests/web-mimic.test.js`, `web/calibration.js`, `web/capacity.js`, `web/charts.js`, `web/settings-panel.js`, `web/simulator.js`) |
| `git diff --exit-code <base> -- index.html air.js sim.js controller.js capacity.js calib.js runtime.js server tests/fakes tests/vectors` | No output, exit 0 |
| `node $CHK/cdp.js 'http://127.0.0.1:8093/#/rooms' $CHK/h1.js` (`CHK=~/.local/share/mushroom-farm/air-web-check`) | H1.0–H1.11 and H1.7b as in 9.1; `PROBLEMS: none` |

(+13 tests: `web-mimic` 3 → 4, `web-air` 8 new, `web-charts` 3 new, `settings-diff` 1 new; the 2 skipped are listed in section 6.)
- [ ] **Step 3:** Stop the server: `kill $(cat ~/.local/share/mushroom-farm/air-web-check/server.pid)`.

### Task 13: Simulator check on a throwaway merge (H2)

H2 needs the C9 simulation and controller. Run it only when `git branch --list 'stream/air-*'` lists `stream/air-simulation` and `stream/air-controller` and the lead has said both are finished. Otherwise skip this task and write `H2 not run: <reason>` in the report; the lead runs H2 at README task 2.5.

- [ ] **Step 1: Make the throwaway merge** (never commit there; the merge commit stays on a detached HEAD and goes with the worktree):

```bash
cd ~/Documents/mushroom-farm
git worktree add --detach ~/.config/superpowers/worktrees/mushroom-farm/air-web-check stream/air-web
cd ~/.config/superpowers/worktrees/mushroom-farm/air-web-check
git merge --no-edit stream/air-simulation stream/air-controller
node --disable-warning=ExperimentalWarning --test tests/web-*.test.js tests/settings-diff.test.js
```

Expected: the merge has no conflicts (the streams own different files); the tests give `# fail 0`, `# skipped 0`. A conflict or a failure here: stop and report it with the output.
- [ ] **Step 2: Serve it statically** (no module of this stream calls the API; a static server avoids needing the data stream):

```bash
CHK=~/.local/share/mushroom-farm/air-web-check
nohup python3 -m http.server 8094 --bind 127.0.0.1 --directory ~/.config/superpowers/worktrees/mushroom-farm/air-web-check > $CHK/static.log 2>&1 &
echo $! > $CHK/static.pid
sleep 1; node $CHK/cdp.js 'http://127.0.0.1:8094/#/simulator' $CHK/h2.js
```

Expected: every line as in 9.2; `PROBLEMS: none` (a 404 for `/favicon.ico` is allowed).
- [ ] **Step 3: Look at the drawing.** Open `$CHK/sim-off.png` and `$CHK/sim-purge.png` (Read tool). Expected: the intake fan high on the left wall and the exhaust fan low on the right wall; a dark bar across both fans in `sim-off.png` and none in `sim-purge.png`; the tag, state and label texts beside each fan readable and not overlapping anything; the glance panel shows the Air exchange row.
- [ ] **Step 4: A bug found here.** In this stream's code: fix it in your worktree (`air-web`) with a test where one fits, commit, remove the check worktree and start again at step 1. In another stream's code: do not fix it; report it.
- [ ] **Step 5: Clean up:**

```bash
kill $(cat ~/.local/share/mushroom-farm/air-web-check/static.pid)
cd ~/Documents/mushroom-farm && git worktree remove --force ~/.config/superpowers/worktrees/mushroom-farm/air-web-check
```

### Task 14: Report

- [ ] Send the report of section 12 to the lead. The worktree is clean (`git status --short` prints nothing).

## 9. Browser checks

Helper and check files: Appendix A (in `~/.local/share/mushroom-farm/air-web-check/`). `cdp.js` prints `<name>: <JSON>` per check, then `PROBLEMS: …`. Compare each line with the expected value below.

### 9.1 H1: settings panel, Capacity, Calibration (your branch, real server, `#/rooms`)

The panel is built in a `div` on `#/rooms` with `c9()`, the default settings converted to the C9 shape in the page (the controller is still old).

| Check | Expected output |
|---|---|
| H1.0 prelude | `true` |
| H1.1 rules card and Machines | `{"title":"Air exchange and CO₂","gone":[],"rh":"Delay purges that dry the room when humidity is low","vals":["900","700","3","60"],"air":["Air exchange",true,false]}` |
| H1.2 longest purge 2.5 min | `[[["rules.purgeMaxS",180,150,"Longest purge","150 s"]],"2.5"]` |
| H1.3 longest purge 20 min | `[[["rules.purgeMaxS",150,900,"Longest purge","900 s"]],"15"]` |
| H1.4 no Prepare in the rules card | `true` |
| H1.5 minimum off 700 s | `[[["rules.minOffS",60,600,"Minimum off time","600 s"]],"600"]` |
| H1.6 minimum off 5 s | `[[["rules.minOffS",600,30,"Minimum off time","30 s"]],"30"]` |
| H1.7 start level 600 | `[[["rules.fanOn",900,600,"Purge starts at","600 ppm"],["rules.fanOff",700,550,"Purge stops at","550 ppm"]],"550"]` |
| H1.7b air exchange size | `[[["airM3h",1800,10000,"Air exchange size","10000 m³/h"]],"10000"]` |
| H1.8 bumpless to Manual | `[1,[["manual.air.auto",true,false,"Air exchange"],["manual.air.on",false,true,"Air exchange: manual output"]],false,true]` |
| H1.9 manual output off | `[["manual.air.on",true,false,"Air exchange: manual output","Off"]]` |
| H1.10 capacity rooms | `[["A",false,900],["B",false,null],["C",false,null]]` |
| H1.11 calibration help | `["Make the simulation agree with your room. The log must have the machine states at 1 min or less.",true,false]` |
| Problems | `PROBLEMS: none` (or only `HTTP 404: …/favicon.ico`) |

### 9.2 H2: Simulator (throwaway merge, static server, `#/simulator`)

| Check | Expected output |
|---|---|
| H2.1 drawing, fans off | `{"gone":[],"fans":[["translate(180 160)",false],["translate(820 352)",false]],"text":["Off · dampers closed","Off · dampers closed"],"damper":"inline","plate":["Air exchange","SF-203 + EF-206 · 1,800 m³/h","Idle"]}` |
| shot sim-off.png | `saved` |
| H2.2 a CO₂ purge | `{"on":true,"state":"Purge 0:40 of 3:00","glance":"Purging 0:40","text":"Purge 1,800 m³/h","fans":[true,true],"damper":"none","chip":"Purging"}`; the two times may be any `0:3x`–`0:5x` if the purge record starts between ticks |
| shot sim-purge.png | `saved` |
| H2.3 both fans spin | `[true,true,true]` |
| H2.4 manual on | `[{"auto":false,"on":true},true,"manual","Manual on",true]` |
| H2.5 idle with the next purge | `[true,"Idle · purge in about <N> min","Next purge in about <N> min","Idle"]` with the same whole `<N>` ≥ 1 |
| H2.6 cards | `h` `"Air exchange per hour"`; `runs` `true`; `cols` `7`; `aria` `"Air exchange run minutes per hour, last 24 hours. The table below has the values."`; `ladder` `["Purge"]`; `legend` `["Air conditioner","Fogger","Air exchange","Lights","Circulation"]`; `energy` `true`; `tableHead` `"Air exchange W"`; `duty` = [a whole number ≥ 1, `m:ss`, `m:ss`, a whole number]; `glance` matches `Purges <n> · average <m:ss>` |
| H2.7 bench size | `["1800",900,900,"SF-203 + EF-206 · 900 m³/h","900 m³/h, 72 W while on","50","10000","900"]` |
| H2.7b panel size | `[1200,1200,"1200","SF-203 + EF-206 · 1,200 m³/h"]` |
| H2.8 24 h test | `[["Rules","Total kWh/day","RM/day","AC kWh","Fogger kWh","Air exchange kWh","AC compressor starts","AC commands","Air exchange run (h)","Purges","Capped purges","Purges delayed by RH (h)","Temp in band","RH in band","RH low alarm","CO₂ over limit"],["Your rules","No humidity priority"]]` |
| H2.9 capacity | `[false,1200,true,false,true]` |
| H2.10 calibration help | `["Make the simulation agree with your room. The log must have the machine states at 1 min or less.",true,false]` |
| H2.11 back to the Simulator | `[true,true]` |
| Problems | `PROBLEMS: none` (or only `HTTP 404: …/favicon.ico`) |

## 10. Done when

- [ ] Every C9 7 and 7.1 requirement is built (section 14.1 table).
- [ ] `tests/web-mimic.test.js`, `tests/web-air.test.js`, `tests/web-charts.test.js`, `tests/settings-diff.test.js` have the tests of tasks 2–5, each seen failing before its code existed.
- [ ] `npm test`: `# fail 0`, `# tests` T0 + 13, `# skipped` S0 + 2; the 8 vector tests pass; `tests/vectors/` unchanged.
- [ ] Only the files of section 2 changed (task 12 step 2).
- [ ] The leftover grep shows only the allowed hits (task 12 step 1).
- [ ] H1 gives every expected line of 9.1.
- [ ] H2 gives every expected line of 9.2 and the screenshots look right, or the report says why H2 was not run.
- [ ] One commit per task on `stream/air-web`; the worktree is clean; the report is sent.

## 11. What NOT to do

| Do not | Why |
|---|---|
| Edit a file outside section 2 (`index.html`, `air.js`, `sim.js`, `controller.js`, `capacity.js`, `calib.js`, `runtime.js`, `server/*`, `tests/fakes/*`, `tests/vectors/*`, `docs/*`) | C9 2: file ownership; report the need instead |
| Copy or stub C9 code of the controller or simulation into your worktree to make the Simulator run at `<base>` | Other streams own it; H2 uses a throwaway merge |
| Commit in the check worktree, push it, or keep it | It is throwaway (task 13 step 5) |
| Add members to `FarmCharts`, `FarmSettingsPanel` or `FarmBench`, or add a browser global | C5 1.4, 3.5, 6.2, 7.6; `airText` uses the Node-only export |
| Put any data or server text into `innerHTML` | C5 1.4 |
| Change texts, limits or behaviour beyond C9 7 and section 7 | Moved code stays as it is |
| Loosen a test or a check to make it pass | A failing check is a finding: report it |
| Run `npm run vectors` or change `tests/vectors/*` | The lead regenerates them at step 2 |
| Kill node processes by name (`pkill node`, `pkill -f server/main.js`) | A live farm server may run on this machine; stop only the PIDs in `server.pid` / `static.pid` |
| Put scratch files in `/tmp` or in the repo | `/tmp` is wiped on reboot; scratch lives in `~/.local/share/mushroom-farm/air-web-check/` |
| Push, merge, rebase, or change `git config` | The lead merges |

## 12. Report to the lead

| Item | Content |
|---|---|
| Branch | `stream/air-web` and `git log --oneline <base>..HEAD` |
| Tests | T0 / P0 / S0 and the final `npm test` counts |
| H1 | The full `cdp.js` output |
| H2 | The full output and what the two screenshots show, or `H2 not run: <reason>` |
| Leftover grep | Its output |
| Contract questions | Section 13, with any answer the lead already gave |
| Anything else | Every point you decided that neither C9 nor this brief covers |

## 13. Contract questions for the lead

All questions are answered: 1–10 in C9 commit `70be7a0`, 11 and 12 in `1c9b9b9`. This brief follows the answers.

| # | C9 section | Problem | Status |
|---|---|---|---|
| 1 | 7, Glance panel | Texts for runs that are not CO₂ purges and for a delayed purge | Answered: other runs show the status card's text; a delayed purge shows `Delayed (humidity first)` (task 3) |
| 2 | 7, Status card | No text for Manual + Off | Answered: `Manual off` (task 3) |
| 3 | 7.1 | Unit in the label brackets | Answered: 7.1 now has Label and Unit columns (task 5) |
| 4 | 7.1 | `manual.air.auto` label | Answered: `Air exchange` (task 5, H1.8) |
| 5 | 5.7 | Shape of `ctl.purges().cur` | Answered: the event shape with `end: null`, `co2End: null`, `capped: false` while running; `null` when off |
| 6 | 7, Charts | Name and arguments of the purge bars; ladder chips | Answered: `drawPurgeBars`, no volume (arguments: question 11); chips `{ air }`; nothing else in C5 is amended |
| 7 | 7, Charts | Prepare point on the ladder | Answered: one row; its chip shows the state (Prepare is dropped, C9 5.4) |
| 8 | 10 (C5 7.9, 7.10) | Room page command and fixture room | Answered: `air: { on: r.air === 1 }`; fixture room without `vent`. Nothing to build here (`web/rooms.js` is a stub until the wave 2 Rooms UI). |
| 9 | 5.2, 7 | No panel control for `airM3h` | Answered: installer number input `inAirSize` "Air exchange size" (m³/h, 50–10000) next to Room volume (task 6, H1.7b; Simulator sync in task 10, H2.7b) |
| 10 | 5.7 | Scope of `purges`, `purgeS`, `longestPurgeS`, `cappedPurges` | Answered: CO₂ purges only; `airOnS` counts every air run |
| 11 | 7, Charts | `drawPurgeBars(el, hours)` cannot draw the hour labels without a clock | Answered: `drawPurgeBars(el, hours, clock)`; the current hour is the last bucket's (task 4) |
| 12 | 7, Glance panel | No glance text for Manual + Off | Answered: `Manual off` (task 3) |

## 14. Self-review

### 14.1 C9 7 and 7.1 requirements mapped to tasks

| C9 place | Requirement | Task |
|---|---|---|
| 3 | `air.js` before `controller.js` in every Node entry point | 1 (tests), 2, 3 (new test files) |
| 7 `index.html` | Script line | Lead (task 0.4); `tests/web-load.test.js` mirrors it in task 1 |
| 7 Room drawing | `mimicLayout({ inletAt, exhaustAt })` result with `SF-203` / `EF-206` | 2 |
| 7 Room drawing | Two fan groups `#fanIn`, `#fanOut`; both spin while `act.air`; grille removed | 7 |
| 7 Room drawing | Closed damper bar when off | 7 |
| 7 Room drawing | Text `Purge <m3h> m³/h` / `Off · dampers closed` | 7 |
| 7 Status card | `faceplate('air', 'Air exchange', 'SF-203 + EF-206 · <m3h> m³/h', …)`; ids `airState`, `airPower`, `airWhy` | 8 (tag value: 10) |
| 7 Status card | The ten state texts (with `Idle · purge in about <m> min` and `Manual off`) | 3 (`airText`), 8 |
| 7 Glance panel | Row `Air exchange`: next purge, purging, delayed, the status text of other runs, `Manual off`, idle | 3, 8 |
| 5.7 | `st.airReason` drives the run text; `status('CO2')` safety chip shows as given | 3; 8 (no extra code, decision 2) |
| 5.4 | No Prepare: no inputs, no FIELDS rows, no text; the next purge only in the idle and glance texts | 3, 5, 6 |
| 7 Glance panel | Per day `Purges <n> · average <m:ss>` | 8 |
| 7 Settings panel | Heading `Air exchange and CO₂`; priority 2 text | 6 |
| 7 Settings panel | Fieldset `CO₂ purge`: `rFanOn`, `rFanOff`, `rPurgeMax` (min, 1–15, s), `rMinOff` (s, 30–600) | 6 |
| 7 Settings panel | Removed `rRhAction`, `rAirMode`, `rFanLevel`, the AC-during-purge fieldset | 6 |
| 7 Settings panel | Machines device `air` with `airOnChk` | 6 |
| 7 Settings panel | Installer input `inAirSize` next to Room volume, writing `airM3h` | 6 (Simulator sync: 10) |
| 7 Settings panel, 7.1 | `FIELDS` labels and units | 5 |
| 7 Charts | Power key `air`, legend "Air exchange" | 4 |
| 7 Charts | `LADDER_ROWS` one row `air` / `Purge`; the chip shows the state | 4 (chip: 3, 8) |
| 7 Charts | `drawPurgeBars`: no volume, aria text and title | 4 (caller: 9) |
| 7 Test bench | `#inVent` removed; `#inAirM3h` 50–10000 sets `env.airM3h` and `cfg.airM3h` | 10 |
| 7 Test bench | Plant facts `Air exchange: <m3h> m³/h, <W> W while on` | 10 |
| 7 Capacity | `vent` removed; `LIMIT_WORD.air`; `FAIL_MACHINE` | 11 |
| 7 Calibration | CSV help `air`; supply-fan tag text removed | 11 |
| 4.2 | Reads `act.air`, `power.air`, `kwh.air` | 4, 7, 8, 9 |
| 5.3, 5.7 | Reads `st.air`, `ctl.purges()` (`cur` shape), `st.stats` (CO₂-purge counters, `airOnS`), `why.air`, `hold.air` | 3, 8, 9 |
| 7 Room page (C5 7.9, 7.10) | `air: { on: r.air === 1 }`; fixture room without `vent` | None in this wave (`web/rooms.js` is a stub) |
| 8 | Capacity room `{ name, volume, airM3h?, calib }` | 11 |
| 11 | Web tests: `mimicLayout`, `FIELDS` = 7.1, ladder row, power key | 2, 5, 4, 4 |

### 14.2 Placeholder scan

Searched this brief for `TBD`, `TODO`, "similar to", "as above", "etc.": none. Angle-bracket names are defined values: `<base>` (section 5), `<m>`, `<m:ss>`, `<n>`, `<N>`, `<m3h>` (texts filled at run time), `<reason>` (task 13). Every `…` is one of: a quote that locates existing code by its start (for example `UI.set('fanState', …)`; the step names both ends of a range), a UI string that exists today (`Running…`, the `…` of a running purge's CO₂ end), the body argument of `faceplate(…)` as C9 7 writes it, or a shortened URL in the allowed `PROBLEMS` line.

## Appendix A: browser check files (`~/.local/share/mushroom-farm/air-web-check/`, not in the repo)

### A.1 `cdp.js`

Adapted from the wave 1 helper (`docs/superpowers/plans/2026-10-08-farm-foundation/web-split.md`, Appendix A): fixed window size, screenshots, profile under the scratch folder.

```js
// cdp.js: node cdp.js <url> <checks.js>. Opens <url> in headless Chrome (1920×1000), runs each [name, expression] of
// checks.js in the page and prints "name: <JSON result>". An expression may be an async IIFE. A check fails when it
// throws or returns false. A name "shot <file>" saves a screenshot to ~/.local/share/mushroom-farm/air-web-check/<file>.
// At the end it prints every problem seen: exceptions, console.error, HTTP >= 400, failed loads, requests off 127.0.0.1.
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const [url, checksFile] = process.argv.slice(2);
const CHK = path.join(os.homedir(), '.local/share/mushroom-farm/air-web-check');
const checks = require(path.resolve(checksFile));
const port = 9333 + Math.floor(Math.random() * 500);
const profile = path.join(CHK, `profile-${port}`);
const chrome = spawn('google-chrome-stable', ['--headless=new', '--no-first-run', '--window-size=1920,1000',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const wait = new Map(), problems = [];
  ws.addEventListener('message', m => {
    const x = JSON.parse(m.data);
    if (x.id && wait.has(x.id)) { wait.get(x.id)(x); wait.delete(x.id); return; }
    if (x.method === 'Runtime.exceptionThrown') problems.push(`exception: ${x.params.exceptionDetails.exception?.description || x.params.exceptionDetails.text}`);
    if (x.method === 'Runtime.consoleAPICalled' && x.params.type === 'error') problems.push(`console.error: ${x.params.args.map(a => a.value ?? a.description).join(' ')}`);
    if (x.method === 'Network.requestWillBeSent' && !/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(x.params.request.url)) problems.push(`internet: ${x.params.request.url}`);
    if (x.method === 'Network.responseReceived' && x.params.response.status >= 400) problems.push(`HTTP ${x.params.response.status}: ${x.params.response.url}`);
    if (x.method === 'Network.loadingFailed' && !x.params.canceled) problems.push(`failed: ${x.params.errorText} ${x.params.requestId}`);
  });
  const send = (method, params = {}) => new Promise(r => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  for (const d of ['Runtime', 'Page', 'Network', 'Log']) await send(`${d}.enable`);
  await send('Page.navigate', { url }); await sleep(2500);
  let failed = 0;
  for (const [name, expr] of checks) {
    if (name.startsWith('shot ')) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(CHK, name.slice(5)), Buffer.from(r.result.data, 'base64'));
      console.log(`${name}: saved`);
      continue;
    }
    const r = await send('Runtime.evaluate', { expression: `(async () => (${expr}))()`, awaitPromise: true, returnByValue: true });
    const v = r.result.exceptionDetails ? `THREW ${r.result.exceptionDetails.exception?.description}` : JSON.stringify(r.result.result.value);
    console.log(`${name}: ${v}`);
    if (r.result.exceptionDetails || r.result.result.value === false) failed++;
  }
  console.log(problems.length ? `PROBLEMS:\n  ${problems.join('\n  ')}` : 'PROBLEMS: none');
  ws.close(); chrome.kill(); await sleep(300); fs.rmSync(profile, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(2); });
```

### A.2 `h1.js`

```js
// h1.js: the settings panel (on #/rooms, with a C9-shaped settings object), Capacity and Calibration (task 6, 11, 12).
const PRELUDE = `(() => {
  window.c9 = () => {
    const s = ClimateController.defaultSettings();
    for (const k of ['airMode', 'baseFan', 'fanLevel', 'fogBoost', 'rhAction', 'acPurge', 'acAction', 'acSetbackC', 'acOff', 'acOn', 'maxSetback', 'guard']) delete s.rules[k];
    delete s.protect.fanMinOn; delete s.protect.fanMinOff; delete s.manual.fan;
    s.airM3h ??= 1800;
    s.rules.purgeMaxS ??= 180; s.rules.minOffS ??= 60;
    s.manual.air ??= { auto: true, on: false };
    return s;
  };
  window.mk = (opts = {}) => {
    if (window.p) window.p.destroy();
    document.getElementById('h1host')?.remove();
    const host = document.createElement('div'); host.id = 'h1host'; document.body.append(host);
    window.log = [];
    window.p = FarmSettingsPanel.createSettingsPanel(host, { settings: c9(), onChange: c => log.push(c), ...opts });
  };
  window.chg = (id, v) => {
    const e = document.getElementById(id); log.length = 0;
    if (e.type === 'checkbox') e.checked = v; else e.value = v;
    e.dispatchEvent(new Event('change'));
    return log.length === 1 ? log[0].map(c => [c.path, c.old, c.new, c.label, c.newText]) : 'onChange calls: ' + log.length;
  };
  return true;
})()`;
const val = id => `document.getElementById('${id}').value`;
const wait = ms => `await new Promise(r => setTimeout(r, ${ms}))`;
module.exports = [
  ['H1.0 prelude', PRELUDE],
  ['H1.1 rules card and Machines', `(() => {
    mk(); const g = id => document.getElementById(id);
    return {
      title: document.querySelector('#hRules').textContent,
      gone: ['rRhAction', 'rAirMode', 'rFanLevel', 'ruleAc', 'rAcPurge', 'rAcAction', 'rSetbackC', 'rAcOff', 'rAcOn', 'fanLevelSel', 'fanManual', 'rPrepare', 'rPrepareLead'].filter(id => g(id)),
      rh: g('rRhLock').parentElement.textContent.trim(),
      vals: ['rFanOn', 'rFanOff', 'rPurgeMax', 'rMinOff'].map(id => g(id).value),
      air: [document.querySelector('[data-dev="air"]').closest('.device').querySelector('h3').textContent, g('airManual').disabled, g('airOnChk').checked],
    };
  })()`],
  ['H1.2 longest purge 2.5 min', `[chg('rPurgeMax', '2.5'), ${val('rPurgeMax')}]`],
  ['H1.3 longest purge 20 min', `[chg('rPurgeMax', '20'), ${val('rPurgeMax')}]`],
  ['H1.4 no Prepare in the rules card', `!/Prepare/.test(document.querySelector('.card.rules').textContent)`],
  ['H1.5 minimum off 700 s', `[chg('rMinOff', '700'), ${val('rMinOff')}]`],
  ['H1.6 minimum off 5 s', `[chg('rMinOff', '5'), ${val('rMinOff')}]`],
  ['H1.7 start level 600', `[chg('rFanOn', '600'), ${val('rFanOff')}]`],
  ['H1.7b air exchange size', `[chg('inAirSize', '20000'), ${val('inAirSize')}]`],
  ['H1.8 bumpless to Manual', `(() => {
    mk({ getCommand: () => ({ ac: { power: true, mode: 'cool', setpoint: 25, fan: 'auto' }, hu: { level: 2 }, air: { on: true }, lights: { on: true }, circ: { on: false } }) });
    log.length = 0; document.querySelector('[data-dev="air"] [data-auto="0"]').click();
    return [log.length, log[0].map(c => [c.path, c.old, c.new, c.label]), document.getElementById('airManual').disabled, document.getElementById('airOnChk').checked];
  })()`],
  ['H1.9 manual output off', `chg('airOnChk', false)`],
  ['H1.10 capacity rooms', `(async () => {
    p.destroy(); window.p = null;
    localStorage.setItem('mushroom-farm.rooms.v1', JSON.stringify({ version: 1, rooms: [
      { id: 'a', name: 'A', volume: 60, vent: 'exhaust', airM3h: 900, mix: [{ crop: 'oyster', blocks: 2000 }] },
      { id: 'b', name: 'B', volume: 60, vent: 'supply', airM3h: 5, mix: [] } ] }));
    location.hash = '#/capacity'; ${wait(500)};
    document.getElementById('capName').value = 'C'; document.getElementById('capSave').click();
    return JSON.parse(localStorage.getItem('mushroom-farm.rooms.v1')).rooms.map(r => [r.name, 'vent' in r, r.airM3h ?? null]);
  })()`],
  ['H1.11 calibration help', `(async () => {
    location.hash = '#/calibration'; ${wait(500)};
    const help = document.querySelector('.calib details.measure p').textContent;
    return [document.querySelector('.calib .rules-head .tag').textContent, /air \\(0 or 1/.test(help), /fan \\(0–3\\)/.test(help)];
  })()`],
];
```

### A.3 `h2.js`

```js
// h2.js: the Simulator, Capacity and Calibration on the throwaway merge (task 13).
const wait = ms => `await new Promise(r => setTimeout(r, ${ms}))`;
module.exports = [
  ['H2.1 drawing, fans off', `(async () => {
    document.getElementById('pauseBtn').click(); document.getElementById('resetBtn').click(); ${wait(400)};
    const g = id => document.getElementById(id);
    return {
      gone: ['fanUnit', 'grilleUnit', 'inVent', 'fanState', 'fanMeter', 'eFan', 'dFanOn', 'glFan', 'mInflow', 'mOutflow'].filter(id => g(id)),
      fans: ['fanIn', 'fanOut'].map(id => [g(id).getAttribute('transform'), g(id).classList.contains('on')]),
      text: [g('mInState').textContent, g('mOutState').textContent],
      damper: getComputedStyle(document.querySelector('#fanIn .damper')).display,
      plate: [g('fpAirTitle').textContent, g('fpAirTag').textContent, g('airState').textContent],
    };
  })()`],
  ['shot sim-off.png', ''],
  ['H2.2 a CO₂ purge', `(async () => {
    const c = __climate, g = id => document.getElementById(id);
    const isPurge = () => c.ctl.state.cmd.air.on && c.ctl.state.airReason === 'purge';
    FarmBench.env.blocks = 6000;
    for (let i = 0; i < 4 * 3600 && !isPurge(); i++) c.tick();
    for (let i = 0; i < 40; i++) c.tick();
    ${wait(400)};
    return { on: isPurge(), state: g('airState').textContent, glance: g('glAirNow').textContent, text: g('mInState').textContent,
      fans: ['fanIn', 'fanOut'].map(id => g(id).classList.contains('on')),
      damper: getComputedStyle(document.querySelector('#fanOut .damper')).display,
      chip: document.querySelector('.ladder .chip span:last-child').textContent };
  })()`],
  ['shot sim-purge.png', ''],
  ['H2.3 both fans spin', `(async () => {
    const g = id => document.getElementById(id), rot = () => [g('fanInBlades').getAttribute('transform'), g('fanOutBlades').getAttribute('transform')];
    document.querySelector('#speedSeg [data-speed="1"]').click();
    g('pauseBtn').click();
    const a = rot(); ${wait(300)}; const b = rot();
    g('pauseBtn').click();
    return [__climate.ctl.state.cmd.air.on, a[0] !== b[0], a[1] !== b[1]];
  })()`],
  ['H2.4 manual on', `(async () => {
    const c = __climate, g = id => document.getElementById(id);
    for (let i = 0; i < 900 && c.ctl.state.cmd.air.on; i++) c.tick();
    document.querySelector('[data-dev="air"] [data-auto="0"]').click();
    g('airOnChk').checked = true; g('airOnChk').dispatchEvent(new Event('change'));
    for (let i = 0; i < 120; i++) c.tick();
    ${wait(400)};
    const cur = c.ctl.purges().cur;
    const out = [{ ...c.cfg.manual.air }, c.ctl.state.cmd.air.on, cur && cur.reason, g('airState').textContent,
      [...document.querySelectorAll('#log li')].some(li => li.textContent.endsWith('Air exchange set to manual'))];
    document.querySelector('[data-dev="air"] [data-auto="1"]').click();
    return out;
  })()`],
  ['H2.5 idle with the next purge', `(async () => {
    const c = __climate; let seen = false;
    FarmBench.env.blocks = 2000;
    for (let i = 0; i < 7200 && !seen; i++) { c.tick(); seen = !c.ctl.state.cmd.air.on && c.ctl.state.air.state === 'idle' && c.ctl.state.air.nextPurgeS > 60; }
    ${wait(400)};
    return [seen, document.getElementById('airState').textContent, document.getElementById('glAirNow').textContent,
      document.querySelector('.ladder .chip span:last-child').textContent];
  })()`],
  ['H2.6 cards', `(() => ({
    h: document.getElementById('hExh').textContent,
    runs: document.querySelectorAll('#exhEvents tr').length > 0,
    cols: document.querySelector('#exhEvents tr').children.length,
    aria: document.querySelector('#exhChart svg').getAttribute('aria-label'),
    ladder: [...document.querySelectorAll('.ladder .lad-name')].map(e => e.textContent),
    legend: [...document.querySelectorAll('.card.power .legend span')].map(s => s.textContent.replace(/ [\\d.]+ k?W$/, '')),
    energy: document.getElementById('eAir').textContent.endsWith('%'),
    tableHead: [...document.querySelectorAll('#tableCard thead th')].at(-1).textContent,
    duty: ['dPurges', 'dPurgeAvg', 'dPurgeMax', 'dCapped'].map(id => document.getElementById(id).textContent),
    glance: document.getElementById('glPurges').textContent,
  }))()`],
  ['H2.7 bench size', `(async () => {
    const g = id => document.getElementById(id);
    if (g('benchBtn').getAttribute('aria-expanded') !== 'true') g('benchBtn').click();
    const inp = g('inAirM3h'), before = inp.value;
    inp.value = '900'; inp.dispatchEvent(new Event('change'));
    ${wait(300)};
    return [before, FarmBench.env.airM3h, FarmBench.cfg.airM3h, g('fpAirTag').textContent, g('plantAir').textContent, inp.min, inp.max, g('inAirSize').value];
  })()`],
  ['H2.7b panel size', `(async () => {
    const g = id => document.getElementById(id), inp = g('inAirSize');
    inp.value = '1200'; inp.dispatchEvent(new Event('change'));
    ${wait(300)};
    return [FarmBench.cfg.airM3h, FarmBench.env.airM3h, g('inAirM3h').value, g('fpAirTag').textContent];
  })()`],
  ['H2.8 24 h test', `(async () => {
    const btn = document.getElementById('estBtn'); btn.click();
    for (let i = 0; i < 1200 && btn.textContent !== 'Run 24 h test again'; i++) ${wait(100)};
    return [[...document.querySelectorAll('#estOut thead th')].map(t => t.textContent), [...document.querySelectorAll('#estOut tbody tr')].map(tr => tr.firstChild.textContent)];
  })()`],
  ['H2.9 capacity', `(async () => {
    const g = id => document.getElementById(id);
    localStorage.removeItem('mushroom-farm.rooms.v1');
    location.hash = '#/capacity'; ${wait(500)};
    g('capSave').click();
    const room = JSON.parse(localStorage.getItem('mushroom-farm.rooms.v1')).rooms[0];
    g('capRun').click();
    for (let i = 0; i < 3000 && !/^(Done|The check stopped)/.test(g('capMsg').textContent); i++) ${wait(100)};
    const rep = g('capReport').textContent;
    return ['vent' in room, room.airM3h, g('capMsg').textContent.startsWith('Done'), rep.includes('undefined'),
      ['the air exchange (CO₂ purges)', 'the AC (heat)', 'the fogger (water)'].some(w => rep.includes('limit ' + w))];
  })()`],
  ['H2.10 calibration help', `(async () => {
    location.hash = '#/calibration'; ${wait(500)};
    const help = document.querySelector('.calib details.measure p').textContent;
    return [document.querySelector('.calib .rules-head .tag').textContent, /air \\(0 or 1/.test(help), /fan \\(0–3\\)/.test(help)];
  })()`],
  ['H2.11 back to the Simulator', `(async () => {
    location.hash = '#/simulator'; ${wait(600)};
    const t1 = __climate.sim.view().t;
    document.querySelector('#speedSeg [data-speed="600"]').click();
    document.getElementById('pauseBtn').click();
    ${wait(1000)};
    return [document.getElementById('fanIn') !== null, __climate.sim.view().t > t1];
  })()`],
];
```
