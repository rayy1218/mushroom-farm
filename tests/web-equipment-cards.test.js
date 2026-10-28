// The Equipment tab's cards (spec 2026-10-27-equipment-cards-design.md): a card per sensor and machine with its settings in it.
// The card list, the line under each title, the status line from the data the page loads, and a card's check and body.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoom } from '../server/rooms.js';
import { ROOM_FIELDS, EQUIPMENT_NAMES, fieldTexts, roomBody } from '../web/room-fields.js';
import { EQUIPMENT_CARDS, cardOf, cardGroup, cardLine, cardStatus, parseCard } from '../web/equipment-cards.js';

const ROOM = {
  id: 7, name: 'Room 1', length: 4, width: 3, height: 2.5, volume: 30, createdAt: 1, filterChangedAt: 2,
  trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4, meterAddress: null, dpAddress: 9,
  intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050,
  dehumidifierW: 380, dehumidifierLday: 20, lightsW: 60, dehumidifier: false, lights: true,
  fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30,
};
const card = (key) => EQUIPMENT_CARDS.find((c) => c.key === key);

test('the cards, in order: the gateway, four sensors, then the relay module, the six relay machines and the aircon', () => {
  assert.deepEqual(EQUIPMENT_CARDS.map((c) => [c.section, c.title, c.fields]), [
    ['gateway', 'Modbus gateway', ['gateway']],
    ['sensors', 'T/RH probe', ['trhAddress']],
    ['sensors', 'CO₂ sensor', ['co2Address']],
    ['sensors', 'Energy meter', ['meterAddress']],
    ['sensors', 'Intake filter', ['dpAddress', 'filterCleanPa', 'filterFinalPa', 'filterChangeDays']],
    ['machines', 'Relay module', ['relayAddress']],
    ['machines', 'Intake fan', ['intakeW', 'fanMaxPa']],
    ['machines', 'Exhaust fan', ['exhaustW']],
    ['machines', 'Circulation fan', ['circulationW']],
    ['machines', 'Humidifier', ['humidifierW', 'humidifierLH']],
    ['machines', 'Dehumidifier', ['dehumidifier', 'dehumidifierW', 'dehumidifierLday']],
    ['machines', 'Lights', ['lights', 'lightsW']],
    ['machines', 'Aircon', ['acAddress', 'acInputW']],
  ]);
});

test('every equipment field is in exactly one card, and no other field', () => {
  const all = EQUIPMENT_CARDS.flatMap((c) => c.fields);
  assert.deepEqual([...all].sort(), [...EQUIPMENT_NAMES].sort());
  assert.equal(new Set(all).size, all.length);
  for (const name of EQUIPMENT_NAMES) assert.equal(cardOf(name).fields.includes(name), true, name);
  assert.equal(cardOf('name'), undefined);
});

test('the Dehumidifier and Lights cards carry their Fitted box first; no other card has one', () => {
  assert.deepEqual(EQUIPMENT_CARDS.filter((c) => c.fitted).map((c) => [c.key, c.fitted, c.fields[0]]), [
    ['dehumidifier', 'dehumidifier', 'dehumidifier'],
    ['lights', 'lights', 'lights'],
  ]);
  assert.equal(cardGroup(card('dehumidifier')).labels.dehumidifier, 'Fitted');
  assert.equal(cardGroup(card('lights')).labels.lights, 'Fitted');
});

test('the inputs\' labels: short where the card names the device, the field\'s own label otherwise', () => {
  const label = (key, name) => cardGroup(card(key)).labels[name];
  assert.equal(label('trh', 'trhAddress'), 'Address');
  assert.equal(label('filter', 'dpAddress'), 'Pressure sensor address');
  assert.equal(label('filter', 'filterFinalPa'), undefined, 'its own: Filter change pressure');
  assert.equal(label('exhaust', 'exhaustW'), 'Power');
  assert.equal(label('intake', 'fanMaxPa'), 'Maximum pressure');
  assert.equal(label('ac', 'acAddress'), 'Aircon gateway address', 'not the room\'s Modbus gateway');
  const g = cardGroup(card('filter'));
  assert.deepEqual([g.key, g.names], ['filter', card('filter').fields]);
  assert.match(g.hint, /^Filter change pressure: /);
  assert.equal(cardGroup(card('relay')).note, 'Outputs: 1 intake, 2 exhaust, 3 circulation, 4 humidifier, 5 dehumidifier, 6 lights');
});

test('the line under the title: what the device is', () => {
  const texts = fieldTexts(ROOM);
  const line = (key, t = texts) => cardLine(card(key), t);
  assert.equal(line('trh'), 'Modbus address 1');
  assert.equal(line('meter'), 'No address');
  assert.equal(line('filter'), 'Pressure sensor address 9');
  assert.equal(line('filter', { ...texts, dpAddress: '' }), 'No pressure sensor');
  assert.equal(line('relay'), 'Modbus address 3');
  assert.equal(line('intake'), 'Relay output 1');
  assert.equal(line('humidifier'), 'Relay output 4');
  assert.equal(line('dehumidifier'), 'Not fitted');
  assert.equal(line('dehumidifier', { ...texts, dehumidifier: true }), 'Relay output 5');
  assert.equal(line('lights'), 'Relay output 6');
  assert.equal(line('ac'), 'Aircon gateway address 4');
  assert.equal(line('ac', { ...texts, acAddress: '' }), 'No address');
  assert.equal(line('trh', { ...texts, trhAddress: 'x' }), 'No address', 'not an address yet');
});

const SENSORS = {
  trh: { kind: 'trh', address: 1, status: 'online', lastOk: { at: 1, t: 20.06, rh: 91.7 } },
  co2: { kind: 'co2', address: 2, status: 'timeout', lastOk: { at: 1, co2: 638.2 } },
  meter: { kind: 'meter', address: null, status: 'not-wired', lastOk: null },
  dp: { kind: 'dp', address: 9, status: 'offline', lastOk: { at: 1, pa: 40.4 } },
};
const relayMachine = (key, status) => ({ key, commanded: false, reported: null, running: null, status });
const MACHINES = {
  relay: {
    address: 3, machines: [relayMachine('intake', 'on'), relayMachine('exhaust', 'off'), relayMachine('circulation', 'not-following'),
      relayMachine('humidifier', 'off'), relayMachine('dehumidifier', 'not-fitted'), relayMachine('lights', 'on')],
  },
  ac: { address: 4, status: 'on' },
};

test('the status line of a sensor: its status and latest value', () => {
  const status = (key, sensors = SENSORS) => cardStatus(card(key), { sensors, machines: MACHINES });
  assert.deepEqual(status('trh'), { status: 'online', word: 'Online', value: '20.1 °C · 91.7 % RH' });
  assert.deepEqual(status('co2'), { status: 'timeout', word: 'Timeout', value: '638 ppm' });
  assert.equal(status('meter'), null, 'no address: the line under the title says so, no status line');
  assert.equal(status('filter'), null, 'the filter pressure has one home: the Intake filter card');
  assert.deepEqual(status('meter', { ...SENSORS, meter: { address: 5, status: 'online', lastOk: { at: 1, power: 372.4, energy: 3 } } }),
    { status: 'online', word: 'Online', value: '372 W' });
  assert.deepEqual(status('trh', { ...SENSORS, trh: { address: 1, status: 'no-data', lastOk: null } }), { status: 'no-data', word: 'No data yet', value: '' });
  assert.equal(cardStatus(card('trh'), { sensors: null, machines: null }), null);
});

test('a sensor not answering says how many polls failed in a row (the Setup tab has no separate sensor cards since the redesign)', () => {
  const status = (s) => cardStatus(card('co2'), { sensors: { ...SENSORS, co2: s }, machines: MACHINES });
  assert.equal(status({ address: 2, status: 'timeout', failuresInRow: 2, lastOk: { at: 1, co2: 638 } }).word, 'Timeout · 2 failed polls in a row');
  assert.equal(status({ address: 2, status: 'offline', failuresInRow: 1, lastOk: null }).word, 'Offline · 1 failed poll in a row');
  assert.equal(status({ address: 2, status: 'online', failuresInRow: 0, lastOk: { at: 1, co2: 638 } }).word, 'Online');
});

test('the status line of a machine: its state as the Climate tab names it', () => {
  const status = (key, machines = MACHINES) => cardStatus(card(key), { sensors: SENSORS, machines });
  assert.deepEqual(status('intake'), { status: 'on', word: 'On', value: '' });
  assert.deepEqual(status('exhaust'), { status: 'off', word: 'Off', value: '' });
  assert.deepEqual(status('circulation'), { status: 'not-following', word: 'Not following', value: '' });
  assert.deepEqual(status('dehumidifier'), { status: 'not-fitted', word: 'Not fitted', value: '' });
  assert.deepEqual(status('ac'), { status: 'on', word: 'On', value: '' });
  assert.deepEqual(status('relay'), { status: 'online', word: 'Online', value: '' });
  const quiet = { ...MACHINES, relay: { address: 3, machines: MACHINES.relay.machines.map((m) => ({ ...m, status: m.status === 'not-fitted' ? m.status : 'no-answer' })) } };
  assert.deepEqual(status('relay', quiet), { status: 'no-answer', word: 'No answer', value: '' });
  assert.equal(status('relay', { ...MACHINES, relay: { address: null, machines: [relayMachine('intake', 'not-wired')] } }), null, 'no address: said once');
  assert.equal(status('ac', { ...MACHINES, ac: { address: null, status: 'not-wired' } }), null);
  assert.deepEqual(status('intake', { ...MACHINES, relay: { address: null, machines: [relayMachine('intake', 'not-wired')] } }), { status: 'not-wired', word: 'Not wired', value: '' });
  assert.equal(status('intake', null), null, 'no machines reply: left out');
});

test('a card\'s check: its fields over the newest room; the body sends only its fields, others as the room has them', () => {
  const texts = { ...fieldTexts(ROOM), exhaustW: '75', intakeW: '999' }; // the intake typed in another card: not this card's
  const checked = parseCard(card('exhaust'), texts, ROOM);
  assert.deepEqual(checked, { values: { exhaustW: 75 } });
  const body = roomBody(ROOM, checked.values);
  assert.equal(body.exhaustW, 75);
  assert.equal(body.intakeW, 60, 'another card\'s unsent edit stays in its card');
  assert.equal(validateRoom(body).error, undefined);
});

test('a clash with another card\'s saved address: under this card\'s field, or under its Save when the rule blames the other', () => {
  const texts = fieldTexts(ROOM);
  // The meter after the T/RH probe: the meter is blamed (this card).
  assert.deepEqual(parseCard(card('meter'), { ...texts, meterAddress: '1' }, ROOM),
    { errors: { meterAddress: 'The devices in a room need different addresses' }, other: '' });
  // The T/RH probe onto the CO₂ sensor's address: the server blames the CO₂ sensor, so the words go under this card's Save.
  assert.deepEqual(parseCard(card('trh'), { ...texts, trhAddress: '2' }, ROOM),
    { errors: {}, other: 'The two sensors need different addresses' });
  // The fan's maximum pressure (Intake fan card) under the filter's change pressure (Intake filter card).
  assert.deepEqual(parseCard(card('intake'), { ...texts, fanMaxPa: '70' }, ROOM),
    { errors: {}, other: "Filter change pressure must be below the fan's maximum pressure" });
  assert.deepEqual(parseCard(card('filter'), { ...texts, filterFinalPa: '250' }, ROOM),
    { errors: { filterFinalPa: "Filter change pressure must be below the fan's maximum pressure" }, other: '' });
  assert.deepEqual(parseCard(card('exhaust'), { ...texts, exhaustW: 'x' }, ROOM).errors, { exhaustW: 'Exhaust fan power must be a number from 0 to 5000 W' });
});

test('a fitted card: a bad rating does not matter while the box is unticked', () => {
  const texts = { ...fieldTexts(ROOM), lights: false, lightsW: '' };
  assert.deepEqual(parseCard(card('lights'), texts, ROOM), { values: { lights: false } });
  assert.deepEqual(Object.keys(parseCard(card('lights'), { ...texts, lights: true }, ROOM).errors), ['lightsW']);
  assert.ok(ROOM_FIELDS.filter((f) => f.fitted).every((f) => cardOf(f.name).fitted === f.fitted));
});
