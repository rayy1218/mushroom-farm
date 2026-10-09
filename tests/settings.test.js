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
  f.settings.rules.purgeMaxS = 'long';                 // wrong type
  const { settings, warnings } = CC.importSettings(f);
  assert.equal(settings.spRH, 99);
  assert.equal(settings.crop, 'oyster');
  assert.equal(settings.stage, 'fruiting', 'a ready-to-fruit farm has no pinning');
  assert.equal(settings.rules.fanOff, settings.rules.fanOn - 50);
  assert.equal(settings.rules.purgeMaxS, 180);
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

test('a version 1 file: one warning per removed key first, manual.fan becomes manual.air, fanOn and fanOff kept', () => {
  const { settings, warnings } = CC.importSettings({ format: 'mushroom-climate-settings', version: 1, settings: { ...v1Settings(), hacked: true } });
  assert.deepEqual(warnings, [...REMOVED.map(gone), 'Unknown setting "hacked" is ignored.']);
  assert.deepEqual(settings.manual.air, { auto: false, on: true });
  assert.equal('fan' in settings.manual, false);
  assert.deepEqual([settings.rules.fanOn, settings.rules.fanOff], [1200, 950]);
  for (const k of REMOVED) { const [g, key] = k.split('.'); assert.equal(key in settings[g], false, k); }
  assert.deepEqual([settings.airM3h, settings.rules.purgeMaxS, settings.rules.minOffS], [1800, 180, 60]);
  const noVersion = CC.importSettings({ format: 'mushroom-climate-settings', settings: v1Settings() });
  assert.deepEqual(noVersion.warnings, REMOVED.map(gone), 'a file without a version is version 1');
});

test('a version 2 file round-trips the new keys with no warnings; a removed key in it is unknown', () => {
  const cfg = CC.defaultSettings();
  Object.assign(cfg.rules, { purgeMaxS: 240, minOffS: 90 });
  cfg.airM3h = 2400; cfg.manual.air = { auto: false, on: true };
  const r = CC.importSettings(CC.exportSettings(cfg));
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.settings, cfg);
  const f = CC.exportSettings(CC.defaultSettings()); f.settings.rules.airMode = 'steady';
  assert.deepEqual(CC.importSettings(f).warnings, ['Unknown setting "rules.airMode" is ignored.']);
});

test('the new settings are held inside their ranges', () => {
  const f = CC.exportSettings(CC.defaultSettings());
  f.settings.airM3h = 20;
  Object.assign(f.settings.rules, { purgeMaxS: 5000, minOffS: 10 });
  const { settings, warnings } = CC.importSettings(f);
  assert.deepEqual([settings.airM3h, settings.rules.purgeMaxS, settings.rules.minOffS], [50, 900, 30]);
  assert.deepEqual(warnings, [
    '"airM3h" = 20 is outside 50–10000: set to 50.',
    '"rules.purgeMaxS" = 5000 is outside 60–900: set to 900.',
    '"rules.minOffS" = 10 is outside 30–600: set to 30.',
  ]);
});

test('version 2: the version, the ramp keys, the defaults and the machines', () => {
  assert.equal(CC.SETTINGS_VERSION, 2);
  assert.deepEqual(Object.keys(CC.profileTargets('oyster', 'fruiting')), ['spT', 'spRH', 'co2Lim', 'rules.co2SafetyAt', 'rules.fanOn', 'rules.fanOff']);
  const d = CC.defaultSettings();
  assert.deepEqual(CC.upgradeSettings(d), { settings: d, warnings: [] }, 'the defaults have no removed key');
  assert.deepEqual([d.airM3h, d.rules.purgeMaxS, d.rules.minOffS], [1800, 180, 60]);
  assert.deepEqual(d.manual.air, { auto: true, on: false });
  assert.deepEqual(CC.MACHINES.airTags, ['SF-203', 'EF-206']);
  assert.equal('fanLevels' in CC.MACHINES, false);
  assert.equal('fanM3h' in CC.MACHINES, false);
});
