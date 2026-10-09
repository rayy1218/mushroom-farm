// web/harvest.js: helpers (docs/contracts/harvest.md 12.2, 13).
'use strict';
process.env.TZ = 'Asia/Kuala_Lumpur';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
for (const f of ['sim', 'air', 'controller']) require(`../${f}.js`);
require('../harvest-rules.js'); require('../web/ui.js'); require('../web/api.js');
const registered = {};
globalThis.FarmShell = { register: (name, m) => { registered[name] = m; } };
const V = require('../web/harvest.js');
function loadQr() {             // as tests/qrcodegen.test.js: the vendored file is a classic script, require gives no global
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/vendor/qrcodegen.js'), 'utf8') + '\nthis.qrcodegen = qrcodegen;', ctx);
  return ctx.qrcodegen;
}

test('HV1 module registers harvest and exports the C10 12.2 names only', () => {
  assert.equal(typeof registered.harvest.mount, 'function');
  assert.equal(typeof registered.harvest.unmount, 'function');
  assert.deepEqual(Object.keys(V).sort(), ['isLocalHost', 'parseKg', 'qrSvg', 'stickerLink', 'summaryText']);
});
