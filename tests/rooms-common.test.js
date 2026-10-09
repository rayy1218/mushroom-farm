// server/rooms-common.js: RoomError, DEMO_ROOM, FIRST_NOTE, cleanSettings (C2 sections 6.2, 6.3).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../controller.js');
const CC = globalThis.ClimateController;
const { RoomError, DEMO_ROOM, FIRST_NOTE, cleanSettings } = require('../server/rooms-common.js');

test('RoomError shape', () => {
  const err = new RoomError('bad_input', 'Bad input', ['x']);
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'RoomError');
  assert.equal(err.code, 'bad_input');
  assert.equal(err.message, 'Bad input');
  assert.deepEqual(err.details, ['x']);

  const err2 = new RoomError('not_found', 'Room 9 not found');
  assert.deepEqual(err2.details, []);
});

test('DEMO_ROOM and FIRST_NOTE', () => {
  assert.deepEqual(DEMO_ROOM, { name: 'Room 1', volume: 60 });
  assert.ok(Object.isFrozen(DEMO_ROOM));
  assert.equal(FIRST_NOTE, 'Created');
});

test('cleanSettings drops __proto__, constructor, prototype at any depth with a warning', () => {
  const input = JSON.parse('{"__proto__":{"polluted":1},"rules":{"constructor":{"x":1},"fanOn":900},"spT":20}');
  const { settings, warnings } = cleanSettings(input);
  assert.deepEqual(settings, { rules: { fanOn: 900 }, spT: 20 });
  assert.deepEqual(warnings, [
    'Setting "__proto__" is not allowed: ignored.',
    'Setting "rules.constructor" is not allowed: ignored.',
  ]);

  const { settings: s2 } = cleanSettings({ a: [{ prototype: 1, b: 2 }] });
  assert.deepEqual(s2, { a: [{ b: 2 }] });
  const { warnings: w2 } = cleanSettings({ a: [{ prototype: 1, b: 2 }] });
  assert.deepEqual(w2, ['Setting "a.0.prototype" is not allowed: ignored.']);

  assert.equal(({}).polluted, undefined);
  assert.deepEqual(Object.keys(Object.prototype), []);
});

test('cleanSettings merges a plain-object value key by key; any other value replaces', () => {
  const base = { a: [1, 2], o: { x: 1, y: 2 }, n: 5, k: [1] };
  const settings = { a: [3], o: { y: 3 }, n: { z: 1 }, k: { q: 1 } };
  const { settings: merged } = cleanSettings(settings, base);
  assert.deepEqual(merged, { a: [3], o: { x: 1, y: 3 }, n: { z: 1 }, k: { q: 1 } });

  const defaults = CC.defaultSettings();
  const { settings: onlySpT } = cleanSettings({ spT: 20 }, defaults);
  const expected = structuredClone(defaults);
  expected.spT = 20;
  assert.deepEqual(onlySpT, expected);
});

test('cleanSettings is pure and shares nothing with its arguments', () => {
  const base = { a: [1, 2], o: { x: 1 } };
  const settings = { a: [3], o: { y: 2 }, p: { q: [1, 2] } };
  const baseText = JSON.stringify(base);
  const settingsText = JSON.stringify(settings);
  const { settings: result } = cleanSettings(settings, base);

  assert.equal(JSON.stringify(base), baseText);
  assert.equal(JSON.stringify(settings), settingsText);

  function collect(v, set) {
    if (v !== null && typeof v === 'object') {
      set.add(v);
      for (const k of Object.keys(v)) collect(v[k], set);
    }
  }
  const foreign = new Set();
  collect(base, foreign);
  collect(settings, foreign);
  const own = new Set();
  collect(result, own);
  for (const v of own) assert.ok(!foreign.has(v), 'result must not share an object or array with an argument');
});

test('cleanSettings copies a null-prototype object too, instead of passing it through by reference', () => {
  const nullProtoObj = Object.assign(Object.create(null), { x: 1 });
  const { settings } = cleanSettings({ o: nullProtoObj });
  assert.deepEqual(settings, { o: { x: 1 } });
  assert.notEqual(settings.o, nullProtoObj); // a new, filtered copy, not the same object

  const { settings: merged } = cleanSettings({ o: nullProtoObj }, { o: { x: 0, y: 2 } });
  assert.deepEqual(merged, { o: { x: 1, y: 2 } }); // merged key by key, as any other plain object
});
