// The room inputs built in a minimal fake DOM (web/room-form.js, web/room-edit.js, web/equipment.js): every label is the
// field's own (or its card's), and the page's saves go one at a time, a waiting form building its body from the room the
// earlier save returned (spec 2026-10-27-equipment-cards-design.md section 3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_GROUPS, ROOM_FIELDS, fieldLabel, fieldTexts } from '../web/room-fields.js';
import { EQUIPMENT_CARDS, cardGroup } from '../web/equipment-cards.js';

function fakeElement(tag) {
  const listeners = {};
  const node = {
    tag, children: [], dataset: {}, attrs: {}, hidden: false, disabled: false, className: '', value: '', checked: false,
    classList: { toggle(name, on) { node.attrs[`class:${name}`] = on; } },
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    fire(type, event = {}) { for (const fn of listeners[type] ?? []) fn({ preventDefault() {}, ...event }); },
    append(...c) { this.children.push(...c); },
    replaceChildren() { this.children = []; },
    contains(other) { return other === this || this.children.some((c) => typeof c === 'object' && c.contains(other)); },
    focus() { globalThis.document.activeElement = this; },
    get textContent() { return this.text ?? this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); },
    set textContent(v) { this.text = v; },
  };
  return node;
}

// Every node under a node, depth first.
const all = (node) => [node, ...node.children.filter((c) => typeof c === 'object').flatMap(all)];

function setup(t) {
  const real = { document: globalThis.document, fetch: globalThis.fetch };
  const body = fakeElement('body');
  globalThis.document = { createElement: fakeElement, activeElement: body, body };
  const calls = []; // PUTs waiting for an answer: { path, body, resolve }
  globalThis.fetch = (path, init) => new Promise((resolve) => calls.push({ path, body: JSON.parse(init.body), resolve }));
  t.after(() => Object.assign(globalThis, real));
  const answer = (call, room) => call.resolve(new Response(JSON.stringify(room), { status: 200, headers: { 'content-type': 'application/json' } }));
  return { calls, answer };
}

const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

// The text of the label of each input, by field name.
function labels(nodes) {
  const inputs = nodes.filter((n) => n.tag === 'input');
  return Object.fromEntries(inputs.map((input) => {
    const label = nodes.find((n) => n.tag === 'label' && n.htmlFor === input.id);
    return [input.name, String(label.textContent).trim()];
  }));
}

const ROOM = {
  id: 1, name: 'Room 1', length: 4, width: 3, height: 2.5, volume: 30, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4,
  meterAddress: null, dpAddress: null, intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050,
  dehumidifierW: 380, dehumidifierLday: 20, lightsW: 60, dehumidifier: false, lights: true,
  fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30,
};

test('the Add room dialog and the Room profile tab: every input labelled with its field\'s own label', async (t) => {
  setup(t);
  const { createRoomForm } = await import('../web/room-form.js');
  const form = createRoomForm(ROOM_GROUPS, { idPrefix: 'f-' });
  const nodes = Object.values(form.parts).flat().flatMap(all);
  assert.deepEqual(labels(nodes), Object.fromEntries(ROOM_FIELDS.map((f) => [f.name, fieldLabel(f)])));
  const profile = createRoomForm(ROOM_GROUPS.filter((g) => g.key === 'profile'), { idPrefix: 'rp-' });
  assert.deepEqual(labels(profile.parts.profile.flatMap(all)), { name: 'Name', length: 'Length (m)', width: 'Width (m)', height: 'Height (m)' });
});

test('an Equipment card: its own short labels', async (t) => {
  setup(t);
  const { createRoomForm } = await import('../web/room-form.js');
  const c = EQUIPMENT_CARDS.find((x) => x.key === 'dehumidifier');
  const form = createRoomForm([cardGroup(c)], { idPrefix: 're-' });
  assert.deepEqual(labels(form.parts.dehumidifier.flatMap(all)), { dehumidifier: 'Fitted', dehumidifierW: 'Power (W)', dehumidifierLday: 'Capacity (L/day)' });
});

test('two cards saved together: the second waits, then builds its body from the room the first save returned', async (t) => {
  const { calls, answer } = setup(t);
  const { createEquipment } = await import('../web/equipment.js');
  const { createSaveQueue } = await import('../web/room-edit.js');
  const host = fakeElement('div');
  const saved = [];
  const eq = createEquipment(host, { roomId: 1, idPrefix: 're-', queue: createSaveQueue(), onSaved: (room) => saved.push(room) });
  eq.update(ROOM, {});
  const card = (key) => all(host).find((n) => n.tag === 'form' && n.dataset.card === key);
  const input = (key, name) => all(card(key)).find((n) => n.tag === 'input' && n.name === name);
  // Lights taken out and saved (the server switches them off before it answers)...
  input('lights', 'lights').checked = false;
  input('lights', 'lights').fire('change');
  card('lights').fire('submit');
  // ... and meanwhile the Exhaust fan saved.
  input('exhaust', 'exhaustW').value = '75';
  input('exhaust', 'exhaustW').fire('input');
  card('exhaust').fire('submit');
  await flush();
  assert.equal(calls.length, 1, 'one save at a time');
  assert.equal(calls[0].body.lights, false);
  assert.equal(calls[0].body.exhaustW, 60, 'the first save does not send the other card\'s edit');
  const first = { ...ROOM, lights: false };
  answer(calls[0], first);
  await flush();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.lights, false, 'built from the first save\'s room, not the stale one');
  assert.equal(calls[1].body.exhaustW, 75);
  answer(calls[1], { ...first, exhaustW: 75 });
  await flush();
  assert.deepEqual(saved.map((r) => [r.lights, r.exhaustW]), [[false, 60], [false, 75]]);
  assert.equal(input('lights', 'lights').checked, false);
  assert.equal(input('exhaust', 'exhaustW').value, '75');
  assert.deepEqual(fieldTexts(saved[1]).exhaustW, '75');
});

test('a waiting card is checked again against the newer room: a clash with what the earlier save set shows, nothing is sent', async (t) => {
  const { calls, answer } = setup(t);
  const { createEquipment } = await import('../web/equipment.js');
  const { createSaveQueue } = await import('../web/room-edit.js');
  const host = fakeElement('div');
  const eq = createEquipment(host, { roomId: 1, idPrefix: 're-', queue: createSaveQueue() });
  eq.update(ROOM, {});
  const card = (key) => all(host).find((n) => n.tag === 'form' && n.dataset.card === key);
  const input = (key, name) => all(card(key)).find((n) => n.tag === 'input' && n.name === name);
  input('meter', 'meterAddress').value = '9';
  input('meter', 'meterAddress').fire('input');
  card('meter').fire('submit');
  input('filter', 'dpAddress').value = '9';
  input('filter', 'dpAddress').fire('input');
  card('filter').fire('submit');
  await flush();
  assert.equal(calls.length, 1);
  answer(calls[0], { ...ROOM, meterAddress: 9 });
  await flush();
  assert.equal(calls.length, 1, 'the clash is caught before sending');
  const err = all(card('filter')).find((n) => n.id === 're-dpAddress-error');
  assert.equal(err.textContent, 'The devices in a room need different addresses');
});
