// The device's control page and JSON API: /api/sensors, /api/sensors/:address, /api/log, /api/sims, /api/sim-speed.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SensorError } from './sensors.js';

const WEB_DIR = fileURLToPath(new URL('./web/', import.meta.url));
// The room drawing is shared with the farm app: served from the farm's web/ folder, not copied.
const SHARED_DIR = fileURLToPath(new URL('../web/', import.meta.url));
const SHARED_ENTRIES = ['mimic.js', 'mimic-math.js', 'mimic.css'];

// The shared files: the drawing's entries and every module they import from the same folder, followed to the end, so a
// new import in the farm's drawing code is served too (one missing module stops the whole device page).
export function sharedFilesOf(dir, entries = SHARED_ENTRIES) {
  const found = new Set(entries);
  const todo = entries.filter((name) => name.endsWith('.js'));
  while (todo.length) {
    let text;
    try {
      text = readFileSync(join(dir, todo.pop()), 'utf8');
    } catch {
      continue; // listed but absent: answered 404
    }
    for (const [, name] of text.matchAll(/from\s+['"]\.\/([a-z0-9-]+\.js)['"]/g)) {
      if (!found.has(name)) { found.add(name); todo.push(name); }
    }
  }
  return found;
}
const MAX_BODY = 64 * 1024;
const LOG_SIZE = 20;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// The latest requests the Modbus side saw, kept in memory only.
export function createRequestLog(size = LOG_SIZE) {
  const entries = [];
  return {
    add(entry) {
      entries.unshift(entry);
      if (entries.length > size) entries.length = size;
    },
    list: () => entries.map((e) => ({ ...e })),
  };
}

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new SensorError(415, 'Content-Type must be application/json');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new SensorError(413, 'Body is too large');
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new SensorError(400, 'Body must be valid JSON');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new SensorError(400, 'Body must be a JSON object');
  return body;
}

const notFound = () => new SensorError(404, 'Not found');

export function createDeviceHttp(sensors, log, { webDir = WEB_DIR, sharedDir = SHARED_DIR, sims } = {}) {
  const SHARED_FILES = sharedFilesOf(sharedDir);
  async function simApi(req, res, path) {
    if (path === '/api/sims') {
      if (req.method === 'GET') return send(res, 200, sims.list());
      if (req.method === 'POST') return send(res, 201, sims.add(await readJson(req)));
      throw notFound();
    }
    if (path === '/api/sim-speed') {
      if (req.method === 'GET') return send(res, 200, { speed: sims.getSpeed() });
      if (req.method === 'PUT') return send(res, 200, { speed: sims.setSpeed((await readJson(req)).speed) });
      throw notFound();
    }
    const match = /^\/api\/sims\/([0-9]{1,9})(\/reset)?$/.exec(path);
    if (!match) throw notFound();
    const id = Number(match[1]);
    if (match[2]) {
      if (req.method === 'POST') return send(res, 200, sims.reset(id));
      throw notFound();
    }
    if (req.method === 'PUT') return send(res, 200, sims.update(id, await readJson(req)));
    if (req.method === 'DELETE') {
      sims.remove(id);
      res.writeHead(204);
      return res.end();
    }
    throw notFound();
  }

  async function api(req, res, path) {
    if (path === '/api/sensors') {
      if (req.method === 'GET') return send(res, 200, sims ? sensors.list().map((s) => ({ ...s, simulatedBy: sensors.simulatedByDevice(s.address) })) : sensors.list());
      if (req.method === 'POST') return send(res, 201, sensors.add(await readJson(req)));
      throw notFound();
    }
    if (path === '/api/log' && req.method === 'GET') return send(res, 200, log.list());
    if (sims && path.startsWith('/api/sim')) return simApi(req, res, path);
    const match = /^\/api\/sensors\/([0-9]{1,5})$/.exec(path);
    if (!match) throw notFound();
    const address = Number(match[1]);
    if (req.method === 'PUT') return send(res, 200, sensors.update(address, await readJson(req)));
    if (req.method === 'DELETE') {
      sensors.remove(address);
      res.writeHead(204);
      return res.end();
    }
    throw notFound();
  }

  async function files(req, res, path) {
    const name = path === '/' ? 'index.html' : path.slice(1);
    const ext = /^[a-z0-9-]+(\.[a-z]+)$/.exec(name)?.[1];
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !TYPES[ext]) throw notFound();
    let data;
    try {
      data = await readFile(join(SHARED_FILES.has(name) ? sharedDir : webDir, name));
    } catch (err) {
      if (err.code === 'ENOENT') throw notFound();
      throw err;
    }
    res.writeHead(200, { 'content-type': TYPES[ext], 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  }

  return http.createServer(async (req, res) => {
    let isApi = false;
    try {
      let path;
      try {
        path = new URL(req.url, 'http://localhost').pathname;
      } catch {
        throw new SensorError(400, 'Bad request');
      }
      isApi = path === '/api' || path.startsWith('/api/');
      await (isApi ? api(req, res, path) : files(req, res, path));
    } catch (err) {
      if (err instanceof SensorError) {
        if (isApi) send(res, err.status, err.field ? { error: err.message, field: err.field } : { error: err.message });
        else {
          res.writeHead(err.status, { 'content-type': 'text/plain; charset=utf-8' });
          res.end(err.message);
        }
      } else if (err.code === 'ECONNRESET') {
        // The client hung up mid-body: nothing to answer.
      } else {
        console.error(err);
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Something went wrong');
      }
    }
  });
}
