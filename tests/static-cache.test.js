import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createStatic } from '../server/static.js';

const SECURITY = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' };

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'static-'));
  writeFileSync(join(dir, 'app.js'), 'export const x = "hello hello hello hello";\n'.repeat(50));
  writeFileSync(join(dir, 'inter.woff2'), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
  const serve = createStatic(dir);
  const server = http.createServer((req, res) => {
    serve(req, res, new URL(req.url, 'http://x')).catch((e) => { res.writeHead(500); res.end(String(e)); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const get = (path, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
  try { await fn({ dir, get }); } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
}

test('200 carries a strong quoted ETag, no-cache and content-length', () => withServer(async ({ get }) => {
  const r = await get('/app.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.etag, /^"[^"]+"$/);
  assert.equal(r.headers['cache-control'], 'no-cache');
  assert.equal(r.headers['content-length'], String(r.body.length));
  assert.equal(r.headers['content-encoding'], undefined);
}));

test('304 on a matching If-None-Match, also W/ and in a list', () => withServer(async ({ get }) => {
  const etag = (await get('/app.js')).headers.etag;
  for (const inm of [etag, `W/${etag}`, `"nope", ${etag}`, '*']) {
    const r = await get('/app.js', { 'if-none-match': inm });
    assert.equal(r.status, 304, inm);
    assert.equal(r.headers.etag, etag);
    assert.equal(r.body.length, 0);
  }
  assert.equal((await get('/app.js', { 'if-none-match': '"nope"' })).status, 200);
}));

test('gzip when asked: body gunzips to the file, vary set, own ETag still matches', () => withServer(async ({ get }) => {
  const plain = await get('/app.js');
  const r = await get('/app.js', { 'accept-encoding': 'br, gzip;q=0.8' });
  assert.equal(r.headers['content-encoding'], 'gzip');
  assert.equal(r.headers.vary, 'accept-encoding');
  assert.equal(r.headers['content-length'], String(r.body.length));
  assert.ok(r.body.length < plain.body.length);
  assert.deepEqual(gunzipSync(r.body), plain.body);
  assert.equal((await get('/app.js', { 'accept-encoding': 'gzip', 'if-none-match': r.headers.etag })).status, 304);
}));

test('the ETag differs between gzip and identity bodies', () => withServer(async ({ get }) => {
  const a = await get('/app.js');
  const b = await get('/app.js', { 'accept-encoding': 'gzip' });
  assert.notEqual(a.headers.etag, b.headers.etag);
}));

test('no gzip for gzip;q=0, for woff2, or when not asked; vary only on compressible', () => withServer(async ({ get }) => {
  assert.equal((await get('/app.js', { 'accept-encoding': 'gzip;q=0' })).headers['content-encoding'], undefined);
  assert.equal((await get('/app.js', { 'accept-encoding': 'identity' })).headers['content-encoding'], undefined);
  const font = await get('/inter.woff2', { 'accept-encoding': 'gzip' });
  assert.equal(font.headers['content-encoding'], undefined);
  assert.equal(font.headers.vary, undefined);
  assert.equal(font.body.length, 8);
  assert.equal((await get('/app.js')).headers.vary, 'accept-encoding');
}));

test('a changed file gives a new ETag and new bytes without a restart', () => withServer(async ({ dir, get }) => {
  const before = await get('/app.js', { 'accept-encoding': 'gzip' });
  writeFileSync(join(dir, 'app.js'), 'export const y = 2;\n');
  utimesSync(join(dir, 'app.js'), new Date(Date.now() + 5000), new Date(Date.now() + 5000));
  const after = await get('/app.js', { 'accept-encoding': 'gzip' });
  assert.notEqual(after.headers.etag, before.headers.etag);
  assert.equal(gunzipSync(after.body).toString(), 'export const y = 2;\n');
  assert.equal((await get('/app.js', { 'if-none-match': before.headers.etag })).status, 200);
}));

test('security headers on 200, 304 and 404', () => withServer(async ({ get }) => {
  const ok = await get('/app.js');
  const nm = await get('/app.js', { 'if-none-match': ok.headers.etag });
  const nf = await get('/missing.js');
  const bad = await get('/sub/app.js');
  assert.equal(nf.status, 404);
  for (const r of [ok, nm, nf, bad]) for (const [k, v] of Object.entries(SECURITY)) assert.equal(r.headers[k], v, k);
}));

test('HEAD has the GET headers and no body', () => withServer(async ({ get }) => {
  const g = await get('/app.js', { 'accept-encoding': 'gzip' });
  const h = await get('/app.js', { 'accept-encoding': 'gzip' }, 'HEAD');
  assert.equal(h.status, 200);
  assert.equal(h.body.length, 0);
  for (const k of ['etag', 'content-type', 'content-encoding', 'content-length', 'vary', 'cache-control']) assert.equal(h.headers[k], g.headers[k], k);
  assert.equal((await get('/app.js', {}, 'POST')).status, 404);
}));
