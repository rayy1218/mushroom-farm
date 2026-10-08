// web/settings-panel.js pure part: diffSettings, applyChanges, formatValue, safeSettings, FIELDS
// (docs/contracts/web.md C6 = C5 7.1-7.7, table 7.4).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../controller.js');
require('../web/ui.js');
require('../web/settings-panel.js');
const CC = globalThis.ClimateController;
const SP = globalThis.FarmSettingsPanel;

function d() { return CC.defaultSettings(); }

test('diffSettings: no change', () => {
  const base = d();
  assert.deepEqual(SP.diffSettings(base, structuredClone(base)), []);
});

test('diffSettings: order, labels, texts', () => {
  const base = d();
  const next = structuredClone(base);
  next.rules.fanOn = 1200; next.spT = 20; next.humMode = 'rh';
  const changes = SP.diffSettings(base, next);
  assert.equal(changes.length, 3);
  assert.deepEqual(changes.map(c => c.path), ['spT', 'rules.fanOn', 'humMode']);
  const spT = changes.find(c => c.path === 'spT');
  assert.equal(spT.label, 'Temperature target');
  assert.equal(spT.oldText, '25 °C');
  assert.equal(spT.newText, '20 °C');
  const humMode = changes.find(c => c.path === 'humMode');
  assert.equal(humMode.label, 'humMode');
});

test('diffSettings: arrays are one leaf', () => {
  const base = d();
  const next = structuredClone(base);
  base.program.harvest.times = [480, 960];
  next.program.harvest.times = [480];
  const changes = SP.diffSettings(base, next);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].old, [480, 960]);
  assert.deepEqual(changes[0].new, [480]);
  assert.equal(changes[0].oldText, '08:00, 16:00');
  assert.equal(changes[0].newText, '08:00');
  next.program.harvest.times = [];
  assert.equal(SP.formatValue('program.harvest.times', []), 'none');
});

test('diffSettings: missing leaves', () => {
  const base = d();
  const next = structuredClone(base);
  next.rules.extra = 5;
  const changes = SP.diffSettings(base, next);
  const c = changes.find(x => x.path === 'rules.extra');
  assert.equal(c.old, undefined);
  assert.equal(c.oldText, '—');
  const base2 = d(); base2.rules.extra2 = 7;
  const next2 = d();
  const changes2 = SP.diffSettings(base2, next2);
  const c2 = changes2.find(x => x.path === 'rules.extra2');
  assert.equal(c2.new, undefined);
});

test('formatValue rules', () => {
  assert.equal(SP.formatValue('manual.ac.auto', false), 'Manual');
  assert.equal(SP.formatValue('program.auto', true), 'On');
  assert.equal(SP.formatValue('crop', 'pink'), 'Pink oyster');
  assert.equal(SP.formatValue('farmType', 'ready'), 'Ready-to-fruit blocks (bought in)');
  assert.equal(SP.formatValue('stage', 'rest'), CC.STAGES.rest);
  assert.equal(SP.formatValue('rules.fanLevel', 2), 'Medium');
  assert.equal(SP.formatValue('manual.hu.level', 0), 'Off');
  assert.equal(SP.formatValue('program.lights.on', 420), '07:00');
  assert.equal(SP.formatValue('program.flushes', 3), '3');
  assert.equal(SP.formatValue('spT', 20.200000000000003), '20.2 °C');
  assert.equal(SP.formatValue('x', { a: 1 }), '{"a":1}');
});

test('applyChanges', () => {
  const base = d();
  const copy = structuredClone(base);
  const out = SP.applyChanges(base, [{ path: 'a.b.c', new: 1 }, { path: 'spT', new: 20 }]);
  assert.equal(out.a.b.c, 1);
  assert.equal(out.spT, 20);
  assert.deepEqual(base, copy);
});

test('safeSettings: prototype pollution guard (lead decision 6)', () => {
  const input = JSON.parse('{"__proto__":{"polluted":1},"rules":{"constructor":1}}');
  const { warnings } = SP.safeSettings(input);
  assert.deepEqual(warnings, ['Setting "__proto__" is not allowed: ignored.', 'Setting "rules.constructor" is not allowed: ignored.']);
  assert.equal(({}).polluted, undefined);
});

test('safeSettings: importSettings step', () => {
  const unknown = SP.safeSettings({ foo: 1 });
  assert.ok(unknown.warnings.some(w => w === 'Unknown setting "foo" is ignored.'));
  const clamped = SP.safeSettings({ spT: 99 });
  assert.equal(clamped.settings.spT, 35);
  assert.ok(clamped.warnings.length > 0);
  const empty = SP.safeSettings({});
  assert.deepEqual(empty.settings, d());
  assert.throws(() => SP.safeSettings(5));
});

test('FIELDS = C6 7.7', () => {
  assert.equal(SP.FIELDS.length, 56);
  const base = d();
  const paths = new Set();
  for (const f of SP.FIELDS) {
    assert.equal(typeof f.label, 'string');
    assert.ok(!paths.has(f.path), `duplicate path ${f.path}`);
    paths.add(f.path);
    const parts = f.path.split('.');
    let v = base;
    for (const p of parts) {
      assert.ok(v && typeof v === 'object', `${f.path} is not reachable`);
      // Object.hasOwn on the parent, not just a type check on the result: a misspelt leaf (for example
      // "program.flushs") would otherwise pass too, because v becomes undefined either way.
      assert.ok(Object.hasOwn(v, p), `${f.path}: "${p}" is not a property of its parent`);
      v = v[p];
    }
    assert.ok(v !== undefined, `${f.path} is not a leaf`);
    assert.ok(v === null || typeof v !== 'object' || Array.isArray(v), `${f.path} is not a leaf`);
  }
  const selectLike = ['farmType', 'crop', 'sensorMode', 'rules.rhAction', 'rules.airMode', 'rules.fanLevel', 'rules.acAction', 'manual.ac.mode', 'manual.hu.level', 'manual.fan.level'];
  for (const p of selectLike) {
    const f = SP.FIELDS.find(x => x.path === p);
    assert.ok(f.options, `${p} is missing options`);
  }
});

test('diffSettings/applyChanges: an own __proto__ key on either side never pollutes Object.prototype', () => {
  const polluted = JSON.parse('{"__proto__":{"polluted":"yes"}}');
  const withProto = JSON.parse(JSON.stringify(d()).slice(0, -1) + ',"__proto__":{"polluted":"yes"},"program":{"__proto__":{"polluted":"yes"}}}');
  assert.ok(Object.hasOwn(withProto, '__proto__'));
  for (const [a, b] of [[d(), withProto], [withProto, d()], [withProto, withProto], [d(), polluted]]) {
    const changes = SP.diffSettings(a, b);
    assert.ok(changes.every(c => !c.path.includes('__proto__')));
    SP.applyChanges(d(), changes);
  }
  assert.equal(({}).polluted, undefined);
  assert.throws(() => SP.applyChanges(d(), [{ path: '__proto__.polluted', new: 'yes' }]), /not allowed/);
  assert.equal(({}).polluted, undefined);
});

test('safeSettings: null, a non-object and an array throw the importSettings error', () => {
  for (const bad of [null, undefined, [], 5, 'x', true]) {
    assert.throws(() => SP.safeSettings(bad), { message: 'This is not a settings file of this controller.' });
  }
});
