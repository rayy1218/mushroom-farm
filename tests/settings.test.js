// Settings file: export, import with validation, apply.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../air.js');
require('../controller.js');
const CC = globalThis.ClimateController;

test('export then import gives the same settings and no warnings', () => {
  const cfg = CC.defaultSettings(); cfg.crop = 'pink'; cfg.rules.fanOn = 1200; cfg.program.harvest.times = [420, 900];
  const { settings, warnings } = CC.importSettings(JSON.stringify(CC.exportSettings(cfg)));
  assert.deepEqual(warnings, []);
  assert.deepEqual(settings, cfg);
});

test('bad values are corrected, with a warning for each', () => {
  const f = CC.exportSettings(CC.defaultSettings());
  Object.assign(f.settings, { spRH: 140, crop: 'truffle', stage: 'pinning', farmType: 'ready', hacked: true });
  f.settings.rules.fanOff = 2000;                      // above the start level
  f.settings.rules.fanLevel = 'High';                  // wrong type
  const { settings, warnings } = CC.importSettings(f);
  assert.equal(settings.spRH, 99);
  assert.equal(settings.crop, 'oyster');
  assert.equal(settings.stage, 'fruiting', 'a ready-to-fruit farm has no pinning');
  assert.equal(settings.rules.fanOff, settings.rules.fanOn - 50);
  assert.equal(settings.rules.fanLevel, 2);
  assert.equal(settings.hacked, undefined);
  assert.equal(warnings.length, 6, warnings.join('\n'));
});

test('a file that is not a settings file is refused', () => {
  assert.throws(() => CC.importSettings('{"hello": 1}'), /not a settings file/);
  assert.throws(() => CC.importSettings('not json'));
});

test('apply keeps the same object, so the running controller sees the new settings', () => {
  const cfg = CC.defaultSettings(), ctl = CC.create(cfg, null, null), rulesRef = cfg.rules;
  const { settings } = CC.importSettings({ format: 'mushroom-climate-settings', version: 1, settings: { spT: 22, rules: { fanOn: 1500 } } });
  CC.applySettings(cfg, settings);
  assert.equal(ctl.cfg, cfg); assert.equal(cfg.rules, rulesRef);
  assert.equal(cfg.spT, 22); assert.equal(cfg.rules.fanOn, 1500);
});

// ---------- Version 2 (contract C9 section 5.2) ----------
// The settings of a version 1 controller (one fresh-air fan), with every key that version 2 removes.
function v1Settings() {
  const s = CC.defaultSettings();
  delete s.airM3h;
  for (const k of ['purgeMaxS', 'minOffS']) delete s.rules[k];
  Object.assign(s.rules, { fanOn: 1200, fanOff: 950, rhAction: 'low', airMode: 'steady', baseFan: { spawn: 0, pinning: 1, fruiting: 1, rest: 0 },
    fanLevel: 2, fogBoost: true, acPurge: true, acAction: 'setback', acSetbackC: 1, acOff: 900, acOn: 700, maxSetback: 30, guard: true });
  Object.assign(s.protect, { fanMinOn: 2, fanMinOff: 2 });
  delete s.manual.air;
  s.manual.fan = { auto: false, level: 2 };
  return s;
}
const REMOVED = ['rules.airMode', 'rules.baseFan', 'rules.fanLevel', 'rules.fogBoost', 'rules.rhAction', 'rules.acPurge', 'rules.acAction',
  'rules.acSetbackC', 'rules.acOff', 'rules.acOn', 'rules.maxSetback', 'rules.guard', 'protect.fanMinOn', 'protect.fanMinOff', 'manual.fan'];
const gone = k => `Setting "${k}" was removed: fresh air now runs as short purges.`;

test('upgradeSettings: one warning per removed key, manual.fan becomes manual.air; pure and idempotent', () => {
  const old = v1Settings(), copy = structuredClone(old);
  const a = CC.upgradeSettings(old);
  assert.deepEqual(old, copy, 'the input is not changed');
  assert.deepEqual(a.warnings, REMOVED.map(gone));
  for (const k of REMOVED) { const [g, key] = k.split('.'); assert.equal(key in a.settings[g], false, k); }
  assert.deepEqual(a.settings.manual.air, { auto: false, on: true });
  assert.deepEqual([a.settings.rules.fanOn, a.settings.rules.fanOff], [1200, 950]);
  assert.equal(a.settings.airM3h, undefined, 'missing keys are not added here');
  assert.deepEqual(CC.upgradeSettings(a.settings), { settings: a.settings, warnings: [] }, 'idempotent');
  assert.deepEqual(CC.upgradeSettings({ manual: { fan: { auto: true } } }).settings.manual.air, { auto: true, on: false });
  assert.deepEqual(CC.upgradeSettings({ manual: { fan: 3 } }), { settings: { manual: {} }, warnings: [gone('manual.fan')] });
  assert.deepEqual(CC.upgradeSettings(null), { settings: null, warnings: [] });
});
