'use strict';
// web/vendor/qrcodegen.js: the vendored QR encoder (contract C10). The fingerprint below was recorded when the
// file was vendored, after zbarimg decoded the same code back to the same link.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function load() {
  const ctx = {};
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '../web/vendor/qrcodegen.js'), 'utf8');
  vm.runInContext(src + '\nthis.qrcodegen = qrcodegen;', ctx);
  return ctx.qrcodegen;
}

const matrix = qr => {
  let s = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) s += qr.getModule(x, y) ? '1' : '0';
    s += '\n';
  }
  return s;
};

test('a sticker link at error correction Q gives the recorded code', () => {
  const { QrCode } = load();
  const qr = QrCode.encodeText('http://192.168.1.20:8080/#/harvest/3', QrCode.Ecc.QUARTILE);
  assert.equal(qr.version, 4);
  assert.equal(qr.size, 33);
  assert.equal(qr.mask, 3);
  assert.equal(crypto.createHash('sha256').update(matrix(qr)).digest('hex'),
    'd131a92da320c875205c3dda3375e983cac50a78b1e583b68fa754846885cd4f');
});

test('the three finder patterns are in the corners', () => {
  const { QrCode } = load();
  const qr = QrCode.encodeText('http://192.168.1.20:8080/#/harvest/3', QrCode.Ecc.QUARTILE);
  const ring = [0, 6];
  for (const [ox, oy] of [[0, 0], [qr.size - 7, 0], [0, qr.size - 7]]) {
    for (let i = 0; i < 7; i++) {
      for (const r of ring) {
        assert.equal(qr.getModule(ox + i, oy + r), true);
        assert.equal(qr.getModule(ox + r, oy + i), true);
      }
    }
    assert.equal(qr.getModule(ox + 3, oy + 3), true);
    assert.equal(qr.getModule(ox + 1, oy + 1), false);
  }
});
