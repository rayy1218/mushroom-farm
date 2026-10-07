// Settings file: export, import with validation, apply.
const test = require('node:test');
const assert = require('node:assert/strict');
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
