import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

let dir;
let db;
let server;
let port;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'farm-web-'));
  writeFileSync(join(dir, 'index.html'), '<h1>Rooms</h1>');
  writeFileSync(join(dir, 'app.js'), 'export {};');
  writeFileSync(join(dir, 'styles.css'), 'body {}');
  writeFileSync(join(dir, 'notes.txt'), 'secret');
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub', 'x.js'), 'export {};');
  db = openDb(':memory:');
  server = createApp(db, { webDir: dir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

// Raw request so the path is sent exactly as written (fetch would clean up "..").
function get(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('/ serves index.html', async () => {
  const res = await get('/');
  assert.equal(res.status, 200);
  assert.equal(res.type, 'text/html; charset=utf-8');
  assert.equal(res.body, '<h1>Rooms</h1>');
});

test('app.js and styles.css are served with their types', async () => {
  const js = await get('/app.js');
  assert.equal(js.status, 200);
  assert.equal(js.type, 'text/javascript; charset=utf-8');
  const css = await get('/styles.css');
  assert.equal(css.status, 200);
  assert.equal(css.type, 'text/css; charset=utf-8');
});

test('HEAD gets headers without a body', async () => {
  const res = await get('/app.js', 'HEAD');
  assert.equal(res.status, 200);
  assert.equal(res.body, '');
});

test('other methods, missing files, other types, subfolders and .. give 404', async () => {
  const cases = [
    ['/', 'POST'],
    ['/missing.js', 'GET'],
    ['/notes.txt', 'GET'],
    ['/sub/x.js', 'GET'],
    ['/../package.json', 'GET'],
    ['/../server/db.js', 'GET'],
    ['/%2e%2e/server/db.js', 'GET'],
    ['/..%2fserver%2fdb.js', 'GET'],
    ['/index.html/', 'GET'],
  ];
  for (const [path, method] of cases) {
    const res = await get(path, method);
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.equal(res.body, method === 'HEAD' ? '' : 'Not found');
  }
});
