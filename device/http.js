// The device's control page and JSON API: /api/sensors, /api/sensors/:address, /api/log.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SensorError } from './sensors.js';

const WEB_DIR = fileURLToPath(new URL('./web/', import.meta.url));
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

export function createDeviceHttp(sensors, log, { webDir = WEB_DIR } = {}) {
  async function api(req, res, path) {
    if (path === '/api/sensors') {
      if (req.method === 'GET') return send(res, 200, sensors.list());
      if (req.method === 'POST') return send(res, 201, sensors.add(await readJson(req)));
      throw notFound();
    }
    if (path === '/api/log' && req.method === 'GET') return send(res, 200, log.list());
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
      data = await readFile(join(webDir, name));
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
