// Critique 2026-10-29b, simulation: Simulate starts from the room's own machines (the last run's one tap away), a run's Try
// lines open Simulate with that change, the Simulations list and step 3's details, and Suggest machines on a desk.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialState, machinesLine, useMachines, buildBody, MACHINE_KEYS } from '../web/simulate-math.js';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const css = src('styles.css');
const block = css.slice(css.indexOf('/* critique 2026-10-29b: simulation */'));

// Room 1 as the critique found it: Setup has a 2 L/h humidifier, a 20 L/day dehumidifier and a 1,000 W aircon; its newest run
// (26 Oct 14:02) had 1.5 L/h and 25 L/day.
const room = { id: 1, name: 'Room 1', length: 6, width: 4, height: 3, volume: 72, humidifierLH: 2, acInputW: 1000, dehumidifier: true, dehumidifierLday: 20 };
const at = new Date(2026, 9, 26, 14, 2).getTime();
const lastRun = { id: 9, createdAt: at, input: { physics: { wallUA: 120, outdoorHigh: 35, outdoorLow: 26, outdoorDew: 25, sunW: 500, fanFlow: 800, acBTU: 18000, humidifierLH: 1.5, dehumidifierLday: 25 } } };
const machinesOf = (s) => MACHINE_KEYS.map((k) => s.physics[k]);

test("Simulate starts from the room's machines (Setup), the walls and weather from the last run, the fan's flow from it", () => {
  const s = initialState({ room, lastRun });
  assert.deepEqual(MACHINE_KEYS, ['fanFlow', 'acBTU', 'humidifierLH', 'dehumidifierLday']);
  assert.deepEqual(machinesOf(s), ['800', '12000', '2', '20']);
  assert.equal(s.physics.wallUA, '120');
  assert.equal(s.physics.outdoorHigh, '35');
  const line = machinesLine(s);
  assert.equal(line.text, "Your room's machines (Setup)");
  assert.equal(line.note, 'Fan flow from the run of 26 Oct 14:02 (not on Setup)');
  assert.deepEqual(line.action, { label: "Use the last run's machines (26 Oct 14:02)", which: 'run' });
});

test("the last run's machines one tap away, and back to the room's", () => {
  const s = initialState({ room, lastRun });
  useMachines(s, 'run');
  assert.deepEqual(machinesOf(s), ['800', '18000', '1.5', '25']);
  assert.equal(buildBody(s).physics.dehumidifierLday, 25);
  assert.deepEqual(machinesLine(s), { text: 'From the run of 26 Oct 14:02', note: null, action: { label: "Use the room's machines", which: 'room' } });
  useMachines(s, 'room');
  assert.deepEqual(machinesOf(s), ['800', '12000', '2', '20']);
  assert.equal(machinesLine(s).text, "Your room's machines (Setup)");
});

test('a machine typed by hand: the line says the machines are changed, the room\'s one tap away', () => {
  const s = initialState({ room, lastRun });
  s.physics.humidifierLH = '3';
  assert.deepEqual(machinesLine(s), { text: "Changed from the room's machines", note: null, action: { label: "Use the room's machines", which: 'room' } });
  s.physics.humidifierLH = '2.0'; // the same number
  assert.equal(machinesLine(s).text, "Your room's machines (Setup)");
});

test('no last run: the room\'s machines, the fan at the default, nothing to switch to; the same machines as the run: no button', () => {
  const s = initialState({ room });
  assert.deepEqual(machinesOf(s), ['600', '12000', '2', '20']);
  assert.deepEqual(machinesLine(s), { text: "Your room's machines (Setup)", note: "Fan flow at Simulate's default (not on Setup)", action: null });
  const same = { ...lastRun, input: { physics: { ...lastRun.input.physics, acBTU: 12000, humidifierLH: 2, dehumidifierLday: 20 } } };
  const t = initialState({ room, lastRun: same });
  assert.deepEqual(machinesLine(t), { text: "Your room's machines (Setup), the same as the last run's", note: 'Fan flow from the run of 26 Oct 14:02 (not on Setup)', action: null });
});

test('Simulate again with these: the run\'s machines, and the line says so', () => {
  const s = initialState({ room, lastRun, again: lastRun });
  assert.deepEqual(machinesOf(s), ['800', '18000', '1.5', '25']);
  assert.deepEqual(machinesLine(s), { text: 'From the run of 26 Oct 14:02 (Simulate again)', note: null, action: { label: "Use the room's machines", which: 'room' } });
  useMachines(s, 'room');
  assert.deepEqual(machinesLine(s).action, { label: "Use this run's machines (26 Oct 14:02)", which: 'run' });
});

test('step 1 shows the line at the Machines group, with its button, repainted as a machine changes', () => {
  const dialog = src('simulate-dialog.js');
  const one = dialog.slice(dialog.indexOf('function stepOne('), dialog.indexOf('function stepTwo('));
  assert.match(one, /const from = el\('div', 'sim-machines-from'\);/);
  assert.match(one, /machinesLine\(state\)/);
  assert.match(one, /useMachines\(state, line\.action\.which\)/);
  assert.match(one, /machines\.append\(from, machineGrid\);/);
  assert.match(one, /if \(MACHINE_KEYS\.includes\(f\.key\)\) paintFrom\(\);/);
  assert.match(block, /\.sim-machines-from \{/);
});

// ---- a run's Try lines are actions ----

test('a change to try goes into Change for this run, on top of the run simulated again', async () => {
  const { applyChange, runControl, controlLine } = await import('../web/simulate-math.js');
  const roomControl = { exchangeEveryMin: 15, exchangeMaxMin: 10, acDrop: 5, humidifierDuringExchange: true, outdoorAir: true };
  const run = { ...lastRun, input: { ...lastRun.input, control: { exchangeMaxMin: 20 } } };
  const s = initialState({ room, lastRun: run, roomControl, again: run });
  applyChange(s, { acDrop: 0 });
  assert.deepEqual(runControl(s).own, { exchangeMaxMin: 20, acDrop: 0 });
  assert.deepEqual(buildBody(s).control, { exchangeMaxMin: 20, acDrop: 0 });
  assert.match(controlLine(s), /aircon not lowered during air exchange \(for this run; the room: 5\u00a0°C lower\)/);
  applyChange(s, { humidifierDuringExchange: false });
  assert.equal(buildBody(s).control.humidifierDuringExchange, false);
  applyChange(s, { exchangeMaxMin: 60 });
  assert.equal(buildBody(s).control.exchangeMaxMin, 60);
  assert.equal(s.controlTexts.exchangeMaxMin, '60', 'the field shows it');
  // the room's own value already: nothing of the run's own
  const t = initialState({ room, roomControl: { ...roomControl, acDrop: 0 } });
  applyChange(t, { acDrop: 0 });
  assert.equal('control' in buildBody(t), false);
});

test('the result page: each Try has Simulate with this change, which opens Simulate from this run on step 3 with the change', () => {
  const page = src('simulation-page.js');
  assert.match(page, /const use = text\('button', '', 'Simulate with this change'\);/);
  assert.match(page, /use\.setAttribute\('aria-label', `Simulate with this change: \$\{t\.name\}`\);/);
  assert.match(page, /openSimulateDialog\(roomData, \{ from: run, change: t\.control \}\)/);
  assert.match(page, /Setup keeps its settings; this is one run\./);
  const dialog = src('simulate-dialog.js');
  assert.match(dialog, /if \(hooks\.change\) \{[^}]*applyChange\(state, hooks\.change\);\s*step = 3;/);
  assert.match(dialog, /fold\.open = Object\.keys\(runControl\(state\)\.own\)\.length > 0 \|\| hooks\.change !== undefined;/);
  assert.match(block, /\.sim-try \{/);
});

// ---- the Simulations list, step 3's radio buttons, the result page's timeline and charts ----

test('the Simulations list: the machines (what differs between runs) at ink-2, the settings line muted', () => {
  assert.match(css, /\.sim-machines \{ color: var\(--ink-2\); font-size: var\(--fs-sm\); \}/);
  assert.match(css, /\.sim-given \{ color: var\(--muted\); font-size: var\(--fs-sm\); \}/);
  const card = src('sim-card.js');
  assert.ok(card.indexOf("el('span', 'sim-machines', r.machines)") < card.indexOf("el('span', 'sim-given', given[i])"), 'machines first');
});

test("step 3's radio buttons: the native ones in the accent colour at a normal size, the rows 44 px", () => {
  assert.match(css, /\.sim-choice input\[type="radio"\] \{ width: 16px; height: 16px; margin: 0; flex: none; accent-color: var\(--accent\); \}/);
  assert.match(css, /\.sim-choice \{[^}]*min-height: 44px;/);
});

test("the result page's timeline is read out as shares of the time and the aircon's setpoints, not a count of spans", async () => {
  const { timelineAria, timelineRows } = await import('../web/simulation-math.js');
  const H = 3600;
  const range = { from: 0, to: 100 * H };
  // the aircon on the whole run, its setpoint 16 °C during the air exchanges and 20 °C between: hundreds of spans
  const ac = [];
  for (let i = 0; i < 100; i++) ac.push({ from: i * H, to: i * H + 0.3 * H, setpoint: 16 }, { from: i * H + 0.3 * H, to: (i + 1) * H, setpoint: 20 });
  const intake = Array.from({ length: 100 }, (_, i) => ({ from: i * H, to: i * H + 0.3 * H }));
  const rows = timelineRows({ ac, intake, humidifier: [] }, 0, null, [50 * H, 80 * H]);
  assert.equal(timelineAria(rows, range), 'Intake on 30 % of the time, the filter changed 2 times; Exhaust off; Circulation off; Humidifier off; '
    + 'Aircon on all the time, its setpoint switching between 16 and 20 °C');
  const one = timelineRows({ ac: [{ from: 0, to: 50 * H, setpoint: 18 }], intake: [{ from: 0, to: 0.1 * H }] }, 0, null, [10 * H]);
  assert.equal(timelineAria(one, range), 'Intake on under 1 % of the time, the filter changed once; Exhaust off; Circulation off; Humidifier off; Aircon on 50 % of the time, set to 18 °C');
  const page = src('simulation-page.js');
  assert.match(page, /const aria = timelineAria\(timelineRows\(result\.machines, 0, run\.input, changes\), range\);/);
  assert.match(page, /describe: \(\) => aria/);
  assert.match(src('timeline.js'), /current\.describe \? current\.describe\(given, range\)/);
});

// ---- Suggest machines on a desk ----

test('Suggest on a desk: the explanation, the room\'s machines and the search\'s start in a column beside the form', async () => {
  const { asideSections, SEARCH_LINE, machineParts } = await import('../web/suggest-math.js');
  const { roomMachines } = await import('../web/simulate-math.js');
  const { keepUnits } = await import('../web/simulation-math.js'); // a number keeps its unit on its line
  const now = roomMachines({ room, lastRun });
  assert.deepEqual(machineParts(now.machines), ['Fan 800 m³/h', 'aircon 3.5 kW (12,000 BTU/h class)', 'humidifier 2 L/h', 'dehumidifier 20 L/day']);
  const before = asideSections({ now, result: null, prices: { electricity: 0.55, water: null } });
  assert.deepEqual(before.map((s) => s.title), ['How the search works', 'What the room has now']);
  assert.equal(before[0].lines[0], SEARCH_LINE);
  assert.deepEqual(before[1].lines, ['Fan 800 m³/h · aircon 3.5 kW (12,000 BTU/h class) · humidifier 2 L/h · dehumidifier 20 L/day', now.from].map(keepUnits));
  assert.equal(before[1].verdict, null);
  const result = {
    target: 95, days: 7, coolDownMaxH: 3,
    best: [{ machines: now.machines, inBand: { t: 99, rh: 99, co2: 99, all: 97 }, kWh: 40, litres: 10, coolDownH: 1 }],
    baseline: { machines: now.machines, inBand: { t: 80, rh: 99, co2: 99, all: 79 }, kWh: 35, litres: 10, coolDownH: 2 },
    estimate: { fanFlow: 150, humidifierLH: 1, why: { fanFlow: 'the room\'s volume' } },
  };
  const after = asideSections({ now, result, prices: { electricity: 0.55, water: null } });
  assert.deepEqual(after.map((s) => s.title), ['How the search works', 'What the room has now', 'Where the search started']);
  assert.deepEqual(after[1].verdict, { tone: 'amber', text: keepUnits('Misses: temperature 80.0 % in band, under 95 %'), money: 'RM 82.50 a month' });
  assert.deepEqual(after[2].lines, ["Fan 150 m³/h: the room's volume", 'Humidifier 1 L/h'].map(keepUnits));

  const page = src('suggest-page.js');
  assert.match(page, /<div class="sg-top">\s*<form class="card sg-form" data-form novalidate hidden><\/form>\s*<aside class="card sg-aside" data-aside hidden aria-label="About this search"><\/aside>\s*<\/div>/);
  assert.match(page, /<p class="page-sub sg-sub">\$\{SEARCH_LINE\}<\/p>/);
  assert.match(page, /el\('div', 'sg-start'\)/, 'the estimates in the results, for a narrow screen');
  assert.match(page, /paintAside\(\);/);
  assert.match(block, /@media \(min-width: 1200px\) \{[^@]*\.sg-top \{ display: grid; grid-template-columns: minmax\(0, 760px\) minmax\(0, 1fr\);/);
  assert.match(block, /@media \(max-width: 1199px\) \{ \.sg-aside \{ display: none; \} \}/);
  assert.match(block, /\.sg-sub, \.sg-out \.sg-start \{ display: none; \}/);
});
