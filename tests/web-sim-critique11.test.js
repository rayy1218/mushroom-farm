// Critique 2026-10-29c, simulation: the read-out says what held a machine that barely ran, why a longer air exchange limit
// helps and what started the exchanges, with every number kept to its unit; Simulate runs the room's bands by default; the
// stepper's done steps jump back; the energy table has RM and a total.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runCauses, runTries, runVerdict, energyView } from '../web/simulation-math.js';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const css = src('styles.css');
const block = css.slice(css.indexOf('/* critique 2026-10-29c: simulation */'));
const NB = '\u00a0';
const nb = (text) => text.replaceAll('~', NB);

// The run of 26 Oct 14:02 (#/rooms/1/simulations/10) in small: a day, the room too wet nearly all of it; every air exchange
// runs its whole 10 min and the next starts a minute later; the humidifier is forced on during each; the dehumidifier (25
// L/day) never runs.
const DAY = 86_400;
const series = Array.from({ length: 289 }, (_, i) => ({
  s: i * 300, t: 25, tLow: 24, tHigh: 26, rh: i < 6 ? 88 : 96, rhLow: 85, rhHigh: 91, co2: 950, co2Low: 700, co2High: 900,
}));
const exchanges = Array.from({ length: Math.floor(DAY / 660) }, (_, k) => ({ from: k * 660, to: k * 660 + 600 }));
const run10 = {
  series,
  machines: { intake: exchanges, humidifier: exchanges.map((x) => ({ ...x })), dehumidifier: [], ac: [{ from: 0, to: DAY, setpoint: 25 }] },
  summary: { days: 1 },
};
const control = { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 0, humidifierDuringExchange: true };
const input = { physics: { humidifierLH: 1.5, dehumidifierLday: 25 }, ctx: { control } };

test('the exchange line adds up: what starts an air exchange, from the rules when the run has no counts', () => {
  assert.equal(runCauses(run10, input)[0], nb('Air exchange ran 90~% of the time: started by CO₂ at 900~ppm as well as for fresh air every 15~min, up to 10~min each.'));
  const noFresh = { ctx: { control: { ...control, exchangeEveryMin: 0 } }, physics: input.physics };
  assert.equal(runCauses(run10, noFresh)[0], nb('Air exchange ran 90~% of the time: started by CO₂ at 900~ppm, up to 10~min each.'));
});

test('the exchange line from the run\'s counts (summary.exchanges)', () => {
  const counted = (exchanges) => runCauses({ ...run10, summary: { days: 1, exchanges } }, input)[0];
  assert.equal(counted({ co2: 130, fresh: 0, cooling: 0, drying: 0, timed: 0 }),
    nb('Air exchange ran 90~% of the time: it started 130 times, all by CO₂ at 900~ppm (up to 10~min each).'));
  assert.equal(counted({ co2: 100, fresh: 25, cooling: 4, drying: 1, timed: 0 }),
    nb('Air exchange ran 90~% of the time: it started 130 times, 100 by CO₂ at 900~ppm (up to 10~min each), 25 for fresh air (1~min after 15~min without one) and 5 to cool or dry the room with outdoor air.'));
  // a start point that moved with the stages is a range
  const moved = { ...run10, series: series.map((r, i) => ({ ...r, co2High: i < 100 ? 900 : 1900 })) };
  assert.ok(runCauses(moved, input)[0].includes(nb('started by CO₂ at 900\u2060–\u20601,900~ppm')));
});

test('a fitted dehumidifier that never ran: the humidifier\'s 30 min wait, held by the humidifier during every air exchange', () => {
  const lines = runCauses(run10, input);
  assert.deepEqual(lines.slice(1), [
    nb('The dehumidifier never started: it waits until the humidifier has been off 30~min, and the humidifier ran during every air exchange, so it was never off that long while the room was too wet.'),
  ]);
  // the humidifier on its own band (not forced) but on in the 30 min before most of the wet times
  const own = { ...input, ctx: { control: { ...control, humidifierDuringExchange: false } } };
  const wetTimes = series.filter((r) => r.rh > r.rhHigh);
  // the first 258 wet times, and the 5 after the last are within its 30 min
  const humidifier = wetTimes.slice(0, 258).map((r) => ({ from: r.s - 600, to: r.s - 300 }));
  const lines2 = runCauses({ ...run10, machines: { ...run10.machines, humidifier } }, own);
  assert.equal(lines2[1], nb('The dehumidifier never started: it waits until the humidifier has been off 30~min, and the humidifier was on in the 30~min before 93~% of the times the room was too wet.'));
  // a dehumidifier that ran a little is said so
  const little = { ...run10, machines: { ...run10.machines, dehumidifier: [{ from: 0, to: 1800 }] } };
  assert.ok(runCauses(little, input)[1].startsWith(nb('The dehumidifier ran only 2~% of the time: ')));
});

test('no word on the dehumidifier when it is not fitted, ran enough, the room was not too wet, or the humidifier did not hold it', () => {
  const said = (r, i = input) => runCauses(r, i).some((l) => l.startsWith('The dehumidifier'));
  assert.equal(said(run10, { ...input, physics: { humidifierLH: 1.5, dehumidifierLday: 0 } }), false);
  assert.equal(said({ ...run10, machines: { ...run10.machines, dehumidifier: [{ from: 0, to: DAY / 4 }] } }), false);
  assert.equal(said({ ...run10, series: series.map((r) => ({ ...r, rh: 88 })) }), false);
  // the humidifier never ran: something else held it, and the page does not guess
  assert.equal(said({ ...run10, machines: { ...run10.machines, humidifier: [] } }), false);
});

test('a humidifier that barely ran while the room was too dry: the dehumidifier\'s 10 min wait', () => {
  const dry = series.map((r) => ({ ...r, rh: 80 }));
  const dehumidifier = Array.from({ length: 288 }, (_, i) => ({ from: i * 300, to: i * 300 + 120 }));
  const r = { series: dry, machines: { intake: [], humidifier: [], dehumidifier, ac: [] }, summary: { days: 1 } };
  assert.deepEqual(runCauses(r, { physics: { humidifierLH: 2, dehumidifierLday: 25 }, ctx: { control: { ...control, humidifierDuringExchange: false } } }), [
    nb('The humidifier never started: it waits while the dehumidifier runs and for 10~min after it stops (unless the room is 3~%~RH under the band), and the dehumidifier was on in the 10~min before whenever the room was too dry.'),
  ]);
});

test('Try a longer limit: the exchanges stopped at theirs and started again at once (from the spans)', () => {
  const tries = runTries(run10, input);
  assert.deepEqual(tries.map((t) => t.control), [{ humidifierDuringExchange: false }, { exchangeMaxMin: 60 }]);
  assert.equal(tries[0].text, 'Try the humidifier off during air exchange: the room was too wet, and the dehumidifier could then start.');
  assert.equal(tries[1].text, nb('Try a 60~min air exchange time limit: each air exchange stopped at its 10~min limit and the next started within 2~min (an exchange ends sooner only when CO₂ falls to 700~ppm); a 60~min limit lets one run until it does.'));
  assert.equal(tries[1].name, 'a 60 min air exchange time limit');
  // some at the limit, the rest ended by CO₂; the next at once, or for some not
  const mixed = exchanges.map((x, k) => (k % 3 === 0 ? { from: x.from, to: x.from + 300 } : x));
  const t2 = runTries({ ...run10, machines: { ...run10.machines, intake: mixed } }, input).at(-1).text;
  assert.ok(t2.includes(nb(': 86 of 130 air exchanges stopped at their 10~min limit and the next started within 2~min (an exchange')), t2);
  // the next a few minutes later (CO₂ climbs back to the start point): said as the typical wait
  const late = Array.from({ length: 100 }, (_, k) => ({ from: k * 780, to: k * 780 + 600 }));
  const t3 = runTries({ ...run10, machines: { ...run10.machines, intake: late } }, input).at(-1).text;
  assert.ok(t3.includes(nb('each air exchange stopped at its 10~min limit, and the next started about 3~min later (an exchange')), t3);
  // exchanges that ended by CO₂ (none at the limit): a longer limit would not help
  const short = exchanges.map((x) => ({ from: x.from, to: x.from + 400 }));
  assert.deepEqual(runTries({ ...run10, machines: { ...run10.machines, intake: short } }, input).map((t) => t.control), [{ humidifierDuringExchange: false }]);
});

test('the Why and Try lines and the verdict\'s keep a number with its unit (390 px)', () => {
  const H = 3600;
  const r = { series: [{ s: 0, tLow: 19 }, { s: 10 * H, tLow: 19 }], machines: { intake: [{ from: 0, to: 8 * H }], ac: [{ from: 0, to: 10 * H, setpoint: 14 }] } };
  const why = runCauses(r, { ctx: { control: { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 5 } } });
  assert.ok(why.includes(nb('The aircon was set to 14~°C, below the 19~°C band, 100~% of the time: it is set 5~°C lower during air exchange.')), why.join('\n'));
  assert.equal(runTries(r, { ctx: { control: { acDrop: 5 } } })[0].text, nb('Try the aircon not lowered during air exchange (0~°C).'));
  const verdict = runVerdict([{ s: 0, t: 16, tLow: 19, tHigh: 21 }], { all: 0 });
  assert.equal(verdict.lines[0], nb('Too cold 100~% of the time (down to 16.0~°C; the band is 19\u2060–\u206021~°C)'));
  assert.equal(verdict.text, nb('The room was in band 0~% of the time.'));
});

test('the facts line under the verdict wraps with its numbers and its dot kept (text-math.js keepLines)', () => {
  const page = src('simulation-page.js');
  assert.match(page, /import \{ keepLines \} from '\.\/text-math\.js';/);
  assert.match(page, /text\('p', 'sim-verdict-facts', keepLines\(facts\)\)/);
});

// ---- the bands a run starts with ----

const sim = await import('../web/simulate-math.js');
const simulation = await import('../web/simulation-math.js');
const room1 = { id: 1, name: 'Room 1', length: 6, width: 4, height: 3, volume: 72, humidifierLH: 2 };
const crop1 = { crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting' };
const stage1 = { tLow: 24, tHigh: 26, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 900, co2Safety: 1500 };
const control1 = { auto: true, exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 0, humidifierDuringExchange: true, outdoorAir: true, ...stage1, co2High: 800, co2Safety: 1000 };

test('Simulate takes the room\'s bands by default when they differ from the stage\'s, said as changed by hand', () => {
  const s = sim.initialState({ room: room1, cropData: crop1, roomControl: control1 });
  const c = sim.bandsChoice(s);
  assert.equal(c.differs, true);
  assert.equal(c.use, 'room');
  assert.equal(c.byHand, true);
  assert.deepEqual(c.parts.map((p) => [p.long, p.stage]), [
    ['air exchange starts at 800 ppm, stops at 700 ppm', 'air exchange starts at 900 ppm, stops at 700 ppm'],
    ['CO₂ safety level 1,000 ppm', 'CO₂ safety level 1,500 ppm'],
  ]);
  assert.deepEqual(sim.buildBody(s).bands, { ...stage1, co2High: 800, co2Safety: 1000 });
  assert.equal(sim.summaryLines(s, room1).find((l) => l.label === 'Bands').text,
    nb('As the room runs now (temperature 24\u2060–\u206026~°C, humidity 85\u2060–\u206091~%~RH, air exchange starts at 800~ppm, stops at 700~ppm, CO₂ safety level 1,000~ppm), until the next stage'));
  // the stage's: no bands in the body
  s.bandsFrom = 'stage';
  assert.equal(sim.bandsChoice(s).use, 'stage');
  assert.equal(sim.buildBody(s).bands, undefined);
  assert.equal(sim.summaryLines(s, room1).find((l) => l.label === 'Bands').text, "The stage's (not the room's bands now), then each stage's own");
});

test('no choice when the room runs the stage\'s bands, or they are not known; other crops are not "by hand"', () => {
  const same = sim.initialState({ room: room1, cropData: crop1, roomControl: { ...control1, ...stage1 } });
  assert.deepEqual(sim.bandsChoice(same), { differs: false, use: 'stage', parts: [], byHand: false });
  assert.equal(sim.buildBody(same).bands, undefined);
  assert.equal(sim.summaryLines(same, room1).find((l) => l.label === 'Bands').text, "The crops' bands for each stage");
  const unknown = sim.initialState({ room: room1, cropData: crop1, roomControl: null });
  assert.equal(sim.bandsChoice(unknown).differs, false);
  const other = sim.initialState({ room: room1, cropData: crop1, roomControl: control1 });
  other.crops[0].blocks = '300';
  assert.equal(sim.bandsChoice(other).byHand, false);
  assert.equal(sim.bandsChoice(other).use, 'room');
});

test('Simulate again keeps what the run had: its own bands, or the stage\'s', () => {
  const with_ = sim.initialState({ room: room1, cropData: crop1, roomControl: control1, again: { input: { ...crop1, bands: control1 } } });
  assert.equal(sim.bandsChoice(with_).use, 'room');
  const without = sim.initialState({ room: room1, cropData: crop1, roomControl: control1, again: { input: { ...crop1 } } });
  assert.equal(sim.bandsChoice(without).use, 'stage');
});

test('a server error in the bands goes to step 2', () => {
  assert.equal(sim.stepOf('bands'), 2);
  assert.equal(sim.stepOf('bands.co2Safety'), 2);
});

test('what this run was given, its one line and the Simulations list say the bands it ran', () => {
  const physics = { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2, dehumidifierLday: 0 };
  const bands = { ...stage1, co2High: 800, co2Safety: 1000 };
  const given = { physics, ...crop1, days: 7, bands };
  assert.deepEqual(simulation.inputRows(given).find((r) => r.label === 'Bands'), { label: 'Bands',
    value: nb("as the room ran them: temperature 24\u2060–\u206026~°C, humidity 85\u2060–\u206091~%~RH, air exchange starts at 800~ppm, stops at 700~ppm, CO₂ safety level 1,000~ppm; then each stage's own") });
  assert.match(simulation.inputLine(given), /bands as the room ran them: temperature/);
  const stageRun = { physics, ...crop1, days: 7 };
  assert.deepEqual(simulation.differingLines([{ input: given }, { input: stageRun }]),
    [nb("room's bands: exchange 800/700~ppm, safety 1,000~ppm"), "the stage's bands"]);
  assert.deepEqual(simulation.differingLines([{ input: stageRun }, { input: stageRun }]), ['', '']);
});

test('step 2 offers the bands, the room\'s by hand in accent; step 3 lists them (Your choices)', () => {
  const dialog = src('simulate-dialog.js');
  assert.match(dialog, /const choice = bandsChoice\(state\);/);
  assert.match(dialog, /set\.append\(el\('legend', '', 'Bands'\)\);/);
  assert.match(dialog, /option\('room', 'As the room runs now', room\);\s+option\('stage', "The stage's", lines\);/);
  assert.match(dialog, /radio\.addEventListener\('change', \(\) => \{ state\.bandsFrom = value; \}\);/);
  assert.match(dialog, /el\('span', 'sim-hand', keepUnits\(p\.long\)\)/);
  assert.doesNotMatch(dialog, /not changes made by hand on the Setup tab/);
  assert.match(block, /\.sim-hand \{ color: var\(--accent-text\); font-weight: 600; \}/);
});

// ---- the dialog and the result page ----

test('the stepper\'s done steps jump back; the steps ahead stay text (Next checks each step)', () => {
  const dialog = src('simulate-dialog.js');
  assert.match(dialog, /if \(i \+ 1 < step\) \{\s+const back = button\(name, 'sim-step-back'\);\s+back\.addEventListener\('click', \(\) => \{ step = i \+ 1; render\(\); title\.focus\(\); \}\);/);
  assert.match(block, /\.sim-steps \.sim-step-back \{ min-height: 0; padding: 0; border: 0; background: none; color: var\(--accent-text\);/);
  assert.match(block, /@media \(max-width: 600px\) \{ \.sim-steps \.sim-step-back \{ min-height: 44px; \} \}/);
});

test('the Crop and Blocks heads look like the field labels (14 px 600, ink), in Simulate and on Suggest', () => {
  assert.match(block, /\.sim-crop-head \{ color: var\(--ink\); font-size: 0\.9rem; font-weight: 600; \}/);
  assert.match(css, /\.field label \{ font-size: 0\.9rem; font-weight: 600; \}/);
  assert.match(src('suggest-page.js'), /el\('div', 'sim-crop-row sim-crop-head'\)/);
});

test('energy by machine: the cost of each machine at the run\'s price and a total row, as History\'s', () => {
  const summary = { energy: { byMachine: { intake: 1.2, exhaust: 1, circulation: 8, humidifier: 3, ac: 30 }, kWh: 43.2, cost: 23.76 }, water: { litres: 1 } };
  const v = energyView(summary, { physics: {}, ctx: { prices: { electricity: 0.55 } } });
  assert.equal(v.priced, true);
  assert.deepEqual(v.rows.map((r) => [r.label, r.cost]), [['Intake fan', 'RM 0.66'], ['Exhaust fan', 'RM 0.55'], ['Circulation fan', 'RM 4.40'], ['Humidifier', 'RM 1.65'], ['Aircon', 'RM 16.50']]);
  assert.deepEqual(v.total, { kWh: '43.2 kWh', cost: 'RM 23.76' });
  // no price: no Cost column, the total still
  const free = energyView({ ...summary, energy: { ...summary.energy, cost: null } }, { physics: {}, ctx: { prices: { electricity: null } } });
  assert.equal(free.priced, false);
  assert.equal(free.rows[0].cost, null);
  assert.deepEqual(free.total, { kWh: '43.2 kWh', cost: null });
  const page = src('simulation-page.js');
  assert.match(page, /\['Machine', 'kWh', 'Share', \.\.\.\(use\.priced \? \['Cost'\] : \[\]\)\]/);
  assert.match(page, /charts, \['Total', use\.total\.kWh, '', \.\.\.cost\(use\.total\)\]\)/);
  assert.match(page, /const tr = text\('tr', 'total'\);/);
});

test('step 2: the room\'s value with the stage\'s numbers beside it, and the stage\'s safety level among its lines', () => {
  const s = sim.initialState({ room: room1, cropData: crop1, roomControl: control1 });
  assert.deepEqual(sim.bandsChoice(s).parts.map((p) => p.stageValue), ['900/700 ppm', '1,500 ppm']);
  const dialog = src('simulate-dialog.js');
  assert.match(dialog, /el\('span', 'muted', keepUnits\(` \(stage: \$\{p\.stageValue\}\)`\)\)/);
  assert.match(dialog, /if \(safety\) lines\.append\(el\('li', '', keepUnits\(safety\.stage\)\)\);/);
});
