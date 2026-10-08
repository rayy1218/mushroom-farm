// server/db-common.js: NotFoundError, toJson, fromJson (C1 section 5.1).
const test = require('node:test');
const assert = require('node:assert/strict');
const { NotFoundError, toJson, fromJson } = require('../server/db-common.js');

test('NotFoundError shape', () => {
  const err = new NotFoundError('room', 7);
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'NotFoundError');
  assert.equal(err.code, 'NOT_FOUND');
  assert.equal(err.what, 'room');
  assert.equal(err.id, 7);
  assert.equal(err.message, 'Unknown room 7');

  const err2 = new NotFoundError('alarm', 'rhHi');
  assert.equal(err2.message, 'Unknown alarm rhHi');
});

test('toJson encodes non-finite numbers', () => {
  const text = toJson({ a: Infinity, b: [-Infinity, NaN, 1] });
  assert.equal(text, '{"a":{"$num":"Infinity"},"b":[{"$num":"-Infinity"},{"$num":"NaN"},1]}');
});

test('fromJson(toJson(x)) round trips non-finite numbers at any depth', () => {
  const x = { a: Infinity, b: { c: -Infinity, d: [NaN, 2] }, e: undefined };
  const back = fromJson(toJson(x));
  assert.equal(back.a, Infinity);
  assert.equal(back.b.c, -Infinity);
  assert.ok(Number.isNaN(back.b.d[0]));
  assert.equal(back.b.d[1], 2);
  assert.ok(!('e' in back));
});

test('fromJson only revives the exact $num shape', () => {
  const a = fromJson('{"$num":"x","a":1}');
  assert.deepEqual(a, { $num: 'x', a: 1 });
  const b = fromJson('{"$num":1}');
  assert.deepEqual(b, { $num: 1 });
});
