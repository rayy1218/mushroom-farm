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

test('HV2 parseKg accepts a plain number with a dot or a comma', () => {
  for (const [text, kg] of [['12.5', 12.5], ['12,5', 12.5], [' 12.5 ', 12.5], ['0', 0], ['7', 7]]) assert.equal(V.parseKg(text), kg, text);
  for (const bad of ['12kg', '-1', '+1', '', '1.2.3', '12.', '.5', 'abc']) assert.equal(V.parseKg(bad), null, bad);
});

test('HV3 summaryText counts today\'s crates', () => {
  assert.equal(V.summaryText({ flush: 2, today: { crates: [1, 2, 3, 4, 5].map(id => ({ id })), kg: 14.6 } }), 'Flush 2 · 14.6 kg today · 5 crates');
  assert.equal(V.summaryText({ flush: 1, today: { crates: [{ id: 1 }], kg: 12.5 } }), 'Flush 1 · 12.5 kg today · 1 crate');
  assert.equal(V.summaryText({ flush: 0, today: { crates: [], kg: 0 } }), 'No crates today');
});

test('HV4 sticker links and the local host check', () => {
  assert.equal(V.stickerLink('http://192.168.1.20:8080', 3), 'http://192.168.1.20:8080/#/harvest/3');
  for (const h of ['localhost', '127.0.0.1', '[::1]', '::1']) assert.equal(V.isLocalHost(h), true, h);
  for (const h of ['127.0.0.2', '192.168.1.20', 'farm.local', '']) assert.equal(V.isLocalHost(h), false, h);
});

test('HV5 qrSvg draws one path with crisp edges', () => {
  const qg = loadQr();
  const text = 'http://192.168.1.20:8080/#/harvest/3';
  const svg = V.qrSvg(qg, text);
  const qr = qg.QrCode.encodeText(text, qg.QrCode.Ecc.QUARTILE);
  assert.equal((svg.match(/<path/g) || []).length, 1);
  assert.ok(svg.includes('shape-rendering="crispEdges"'));
  assert.ok(svg.includes('class="st-qr"'));
  assert.ok(svg.includes(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`));
  let dark = 0;
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.getModule(x, y)) dark++;
  assert.equal(svg.split('h1v1h-1z').length - 1, dark);
  assert.ok(svg.includes('M4,4h1v1h-1z'));
});
