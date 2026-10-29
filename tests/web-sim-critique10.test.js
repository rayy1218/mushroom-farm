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
