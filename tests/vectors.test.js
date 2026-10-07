// Test vectors: the recorded readings must give the recorded commands. A port (Rust, C++) uses the same
// files. If an intended controller change alters the commands, make the vectors again: node tools/make-vectors.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
require('../controller.js');
const CC = globalThis.ClimateController;
const DIR = path.join(__dirname, 'vectors');
const pack = c => [c.ac.power ? 1 : 0, c.ac.mode, c.ac.setpoint, c.ac.fan, c.hu.level, c.fan.level, c.lights.on ? 1 : 0, c.circ.on ? 1 : 0];

for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json')).sort()) {
  test(`vectors: ${f}`, () => {
    const v = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const ctl = CC.create(structuredClone(v.settings), null, null);
    const bad = [];
    v.steps.forEach((s, i) => {
      for (const a of v.actions) if (a.beforeStep === i) ctl[a.call](...a.args, a.t);
      const got = pack(ctl.update(s.r));
      if (JSON.stringify(got) !== JSON.stringify(s.c)) bad.push(`step ${i} t=${s.r.t}: got ${JSON.stringify(got)}, want ${JSON.stringify(s.c)}`);
    });
    assert.equal(bad.length, 0, `${bad.length} of ${v.steps.length} steps differ. First: ${bad.slice(0, 3).join(' | ')}`);
  });
}
