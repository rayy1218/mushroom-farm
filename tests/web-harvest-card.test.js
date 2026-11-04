// The room's Harvest tab and the Crop tab's harvest line (spec 2026-11-04-harvest-design.md 3 and 7). Source checks, like
// the Tasks card's; the figures and texts are tested in web-harvest-math.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVENT_TYPES } from '../web/live.js';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const card = src('harvest-card.js');
const crop = src('crop-card.js');
const dialogs = src('task-dialogs.js');

test("the card reads the room's harvests and asks again on its harvest events, a crop change and the stream coming back", () => {
  assert.ok(card.includes("request('GET', `/api/rooms/${roomId}/harvests`)"));
  assert.ok(EVENT_TYPES.includes('harvest'));
  assert.ok(card.includes("live.on('harvest', (d) => { if (d.roomId === roomId) reload.call(); })"));
  assert.ok(card.includes("live.on('room', (d) => { if (d.id === roomId && d.part === 'crop') reload.call(); })"));
  const destroy = card.slice(card.indexOf('destroy() {'));
  for (const x of ['reload.cancel();', 'clearTimeout(timer);', 'for (const off of offLive) off();', 'host.className = hostClass;']) assert.ok(destroy.includes(x), x);
});

test('the parts in order: Record a harvest, This run, Harvests, Past runs, the empty text', () => {
  assert.ok(card.includes('host.replaceChildren(head, runCard, listCard, pastCard, emptyCard);'));
  const at = ['This run', 'Harvests', 'Past runs'].map((t) => card.indexOf(`el('h2', '', '${t}')`));
  assert.ok(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1])));
  assert.ok(card.includes("'Give the room its crops on the Crop tab first'"));
  assert.ok(card.includes('record.disabled = !run;'));
  assert.ok(card.includes("'No harvests yet. They are recorded from the harvest checks on the Tasks tab, or with Record a harvest.'"));
  assert.ok(card.includes("const d = el('details', 'hv-run');"));
  assert.ok(card.includes("a.href = '#/settings';"), 'the missing note links to Settings');
});

test('Record, Edit and Delete: the task dialog form, the worker box, the time box, the bodies from harvest-math', () => {
  assert.match(dialogs, /export function openForm\(/);
  assert.match(dialogs, /input\.type = 'datetime-local';/);
  assert.ok(card.includes("kind: 'datetime', value, min: whenValue(run.startedAt), max: whenValue(Math.min(run.endedAt ?? now, now))"));
  assert.ok(card.includes("workerField(names, 'Who picked it')"));
  assert.ok(card.includes("return send('POST', `/api/rooms/${roomId}/harvests`, body);"));
  assert.ok(card.includes("return send('PUT', `/api/harvests/${h.id}`, body);"));
  assert.ok(card.includes("submit: () => send('DELETE', `/api/harvests/${h.id}`),"));
  assert.ok(card.includes('lead: [deleteQuestion(h)'));
});

test('the Crop tab: the run in one line with a link to the Harvest tab, read on the harvest events', () => {
  assert.ok(crop.includes("yieldLink.href = roomHash(roomId, 'harvest');"));
  assert.ok(crop.includes('yieldText.textContent = summaryLine(harvestRun ?? {}, last.flush);'));
  assert.ok(crop.includes("live.on('harvest', (d) => { if (alive && d.roomId === roomId) loadHarvests(); }),"));
  assert.ok(crop.includes('const show = Boolean(last) && hasCrops(last) && harvestRun !== undefined;'));
});

test('Delete room names the harvests', () => {
  assert.ok(src('room-edit.js').includes("'The room goes with its readings, history, crop, harvests and simulations.'"));
});
