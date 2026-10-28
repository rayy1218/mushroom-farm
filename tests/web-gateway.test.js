// A room's own Modbus gateway on the page: the gateway field (checked as the server does, carried along by every room body),
// the Equipment tab's Modbus gateway card with the farm's gateway in its hint, and the room page's sub line.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoom } from '../server/rooms.js';
import { ROOM_GROUPS, ROOM_FIELDS, EQUIPMENT_NAMES, fieldTexts, parseRoomFields, roomBody, roomSubLine } from '../web/room-fields.js';
import { EQUIPMENT_CARDS, EQUIPMENT_SECTIONS, cardGroup, cardLine, cardStatus, cardHint, gatewayHint, parseCard } from '../web/equipment-cards.js';

const ROOM = {
  id: 7, name: 'Room 1', length: 5.9, width: 2.3, height: 2.4, volume: 32.57, createdAt: 1, filterChangedAt: 2,
  trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4, meterAddress: null, dpAddress: 9, gateway: '127.0.0.1:1512',
  intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050,
  dehumidifierW: 380, dehumidifierLday: 20, lightsW: 60, dehumidifier: false, lights: true,
  fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30,
};
const card = EQUIPMENT_CARDS.find((c) => c.key === 'gateway');

test('the gateway field: set on the Equipment tab only (not in the Add room dialog\'s groups)', () => {
  const f = ROOM_FIELDS.find((x) => x.name === 'gateway');
  assert.deepEqual([f.group, f.kind, f.label], ['gateway', 'gateway', 'Gateway (host:port)']);
  assert.equal(ROOM_GROUPS.some((g) => g.key === 'gateway'), false);
  assert.ok(EQUIPMENT_NAMES.includes('gateway'));
});

test('texts: the room\'s gateway, blank for the farm\'s', () => {
  assert.equal(fieldTexts(ROOM).gateway, '127.0.0.1:1512');
  assert.equal(fieldTexts({ ...ROOM, gateway: null }).gateway, '');
  assert.equal(fieldTexts(null).gateway, '');
});

test('the check is the server\'s: blank is the farm\'s (null), host:port is kept trimmed, anything else in the server\'s words', () => {
  const texts = fieldTexts(ROOM);
  const parse = (typed) => parseRoomFields({ ...texts, gateway: typed }, EQUIPMENT_NAMES);
  assert.equal(parse('').values.gateway, null);
  assert.equal(parse('   ').values.gateway, null);
  assert.equal(parse(' 10.0.0.7:502 ').values.gateway, '10.0.0.7:502');
  assert.equal(parse('[fd00::5]:502').values.gateway, '[fd00::5]:502');
  const body = roomBody(ROOM, parseRoomFields(texts).values);
  for (const bad of ['10.0.0.7', 'host:0', 'host:65536', 'my host:502', ':502', `${'h'.repeat(97)}:502`]) {
    const server = validateRoom({ ...body, gateway: bad });
    assert.equal(server.field, 'gateway', bad);
    assert.deepEqual(parse(bad).errors, { gateway: server.error }, bad);
  }
  for (const good of ['10.0.0.7:502', 'a:1', 'a:65535', `${'h'.repeat(96)}:502`]) {
    assert.equal(validateRoom({ ...body, gateway: good }).room.gateway, good);
    assert.equal(parse(good).values.gateway, good);
  }
});

test('every room body carries the gateway along unchanged: a save of another tab or card does not wipe it', () => {
  assert.equal(roomBody(ROOM, { name: 'Room 9' }).gateway, '127.0.0.1:1512', 'the Room profile tab');
  const exhaust = EQUIPMENT_CARDS.find((c) => c.key === 'exhaust');
  const { values } = parseCard(exhaust, { exhaustW: '75' }, ROOM);
  assert.deepEqual(values, { exhaustW: 75 });
  assert.equal(roomBody(ROOM, values).gateway, '127.0.0.1:1512', 'another card');
  assert.equal(roomBody({ ...ROOM, gateway: null }, values).gateway, null);
  assert.equal(roomBody(null, { name: 'New' }).gateway, null, 'a new room: the farm\'s');
  const own = parseCard(card, { gateway: '10.0.0.8:502' }, ROOM).values;
  assert.deepEqual(roomBody(ROOM, own).gateway, '10.0.0.8:502');
  assert.deepEqual(parseCard(card, { gateway: '' }, ROOM).values, { gateway: null });
});

test('the Modbus gateway card: its own section first, one field, the farm\'s gateway in its hint once the settings tell it', () => {
  assert.deepEqual(EQUIPMENT_SECTIONS.map((s) => s.key), ['gateway', 'sensors', 'machines']);
  assert.deepEqual([card.section, card.title, card.fields], ['gateway', 'Modbus gateway', ['gateway']]);
  assert.equal(EQUIPMENT_CARDS[0], card);
  const group = cardGroup(card);
  assert.equal(group.labels?.gateway, undefined, 'its own label: Gateway (host:port)');
  assert.equal(group.hint, gatewayHint(null));
  assert.equal(gatewayHint('192.168.1.40:502'), "Empty: the farm's gateway (192.168.1.40:502). A room behind its own Modbus gateway, such as a "
    + "container, takes that gateway's address; device addresses then only need to differ within that gateway.");
  assert.match(gatewayHint(null), /^Empty: the farm's gateway\. A room behind/);
  assert.equal(cardHint(card, { farmGateway: '192.168.1.40:502' }), gatewayHint('192.168.1.40:502'));
  assert.equal(cardHint(card, {}), gatewayHint(null));
  const filter = EQUIPMENT_CARDS.find((c) => c.key === 'filter');
  assert.equal(cardHint(filter, { farmGateway: 'x:1' }), filter.hint, 'another card keeps its own');
});

test('the line under its title says which gateway; it has no status line', () => {
  assert.equal(cardLine(card, fieldTexts(ROOM)), 'Own gateway 127.0.0.1:1512');
  assert.equal(cardLine(card, { gateway: ' ' }), "The farm's gateway");
  assert.equal(cardStatus(card, { sensors: {}, machines: { relay: { address: 3, machines: [] } } }), null);
});

test('the room page\'s sub line names the gateway only when it is not the farm\'s', () => {
  assert.match(roomSubLine(ROOM), /^5[.,]9 × 2[.,]3 × 2[.,]4 m · 32[.,]6 m³ · gateway 127\.0\.0\.1:1512$/);
  assert.match(roomSubLine({ ...ROOM, gateway: null }), /^5[.,]9 × 2[.,]3 × 2[.,]4 m · 32[.,]6 m³$/);
  assert.match(roomSubLine({ ...ROOM, gateway: undefined }), /m³$/, 'an older server');
});

// ---- the card in a minimal fake DOM ----

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

const all = (node) => [node, ...node.children.filter((c) => typeof c === 'object').flatMap(all)];
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

test('the card renders a text field with its label and hint; the hint follows the farm\'s gateway; Save sends it', async (t) => {
  const real = { document: globalThis.document, fetch: globalThis.fetch };
  const body = fakeElement('body');
  globalThis.document = { createElement: fakeElement, activeElement: body, body };
  const calls = [];
  globalThis.fetch = (path, init) => new Promise((resolve) => calls.push({ path, body: JSON.parse(init.body), resolve }));
  t.after(() => Object.assign(globalThis, real));
  const { createEquipment } = await import('../web/equipment.js');
  const host = fakeElement('div');
  const eq = createEquipment(host, { roomId: 7, idPrefix: 're-' });
  eq.update({ ...ROOM, gateway: null }, { sensors: {}, machines: null, farmGateway: '192.168.1.40:502' });
  const section = host.children[0];
  assert.equal(section.dataset.section, 'gateway');
  const form = all(section).find((n) => n.tag === 'form');
  assert.equal(form.dataset.card, 'gateway');
  const input = all(form).find((n) => n.tag === 'input');
  assert.deepEqual([input.name, input.type, input.value, input.maxLength, input.spellcheck], ['gateway', 'text', '', 100, false]);
  const label = all(form).find((n) => n.tag === 'label' && n.htmlFor === input.id);
  assert.equal(label.textContent, 'Gateway (host:port)');
  const hint = all(form).find((n) => n.className === 'c-hint');
  assert.equal(hint.textContent, gatewayHint('192.168.1.40:502'));
  assert.equal(all(form).find((n) => n.className === 'addr').textContent, "The farm's gateway");

  input.value = '10.0.0.7:502';
  input.fire('input');
  form.fire('submit');
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/rooms/7');
  assert.equal(calls[0].body.gateway, '10.0.0.7:502');
  assert.equal(calls[0].body.trhAddress, 1, 'the rest of the room as it is');
});
