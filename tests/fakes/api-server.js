// Fake HTTP API server (docs/contracts/web.md section 4.5). No route logic: records requests and answers with
// either a reply the test set, or the defaults below. Requires only node:http, node:fs, node:path.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ARRAY_ROUTE_RE = /^\/api\/rooms(\/[^/]+\/(settings\/history|readings|events|alarms|calibrations|mix|simulations))?$|^\/api\/batches$/;
const EQUIPMENT_ROUTE_RE = /^\/api\/rooms\/[^/]+\/equipment$/;

const TOP_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
  '/controller.js': { file: 'controller.js', type: 'text/javascript; charset=utf-8' },
  '/sim.js': { file: 'sim.js', type: 'text/javascript; charset=utf-8' },
  '/air.js': { file: 'air.js', type: 'text/javascript; charset=utf-8' },
  '/runtime.js': { file: 'runtime.js', type: 'text/javascript; charset=utf-8' },
  '/capacity.js': { file: 'capacity.js', type: 'text/javascript; charset=utf-8' },
  '/calib.js': { file: 'calib.js', type: 'text/javascript; charset=utf-8' },
  '/room-rules.js': { file: 'room-rules.js', type: 'text/javascript; charset=utf-8' },
  '/cycle.js': { file: 'cycle.js', type: 'text/javascript; charset=utf-8' },
  '/equipment.js': { file: 'equipment.js', type: 'text/javascript; charset=utf-8' },
  '/harvest-rules.js': { file: 'harvest-rules.js', type: 'text/javascript; charset=utf-8' },
};

const WEB_EXT_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Decodes a raw path once and rejects anything unsafe (C3 section 9 "path safety"). Returns null when unsafe.
function decodeSafe(rawPath) {
  let decoded;
  try { decoded = decodeURIComponent(rawPath); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  for (const part of decoded.split('/')) {
    if (part === '..') return null;
    if (part.startsWith('.') && part !== '') return null;
  }
  return decoded;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send404Text(res, method) {
  const body = Buffer.from('Not found', 'utf8');
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length });
  res.end(method === 'HEAD' ? undefined : body);
}

function send404Json(res, method) {
  sendJson(res, method, 404, { error: 'Unknown route', details: [] });
}

function sendJson(res, method, status, body) {
  const text = Buffer.from(JSON.stringify(body === undefined ? null : body), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': text.length });
  res.end(method === 'HEAD' ? undefined : text);
}

// A reply set by the test: a non-string body is JSON, a string body is text/plain, undefined is empty.
function sendReplyBody(res, method, status, body) {
  if (body === undefined) {
    res.writeHead(status, {});
    res.end();
    return;
  }
  if (typeof body === 'string') {
    const text = Buffer.from(body, 'utf8');
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': text.length });
    res.end(method === 'HEAD' ? undefined : text);
    return;
  }
  const text = Buffer.from(JSON.stringify(body), 'utf8');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': text.length });
  res.end(method === 'HEAD' ? undefined : text);
}

function sendFile(res, method, filePath, contentType) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send404Text(res, method);
    fs.readFile(filePath, (err2, data) => {
      if (err2) return send404Text(res, method);
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
      res.end(method === 'HEAD' ? undefined : data);
    });
  });
}

function serveStatic(root, method, rawPath, res) {
  const decoded = decodeSafe(rawPath);
  if (decoded === null) return send404Text(res, method);
  const top = TOP_FILES[decoded];
  if (top) return sendFile(res, method, path.join(root, top.file), top.type);
  if (decoded.startsWith('/web/')) {
    const rel = decoded.slice('/web/'.length);
    if (rel === '') return send404Text(res, method); // /web/ is a folder
    const ext = path.extname(rel).toLowerCase();
    const type = WEB_EXT_TYPES[ext];
    if (!type) return send404Text(res, method);
    const webRoot = path.join(root, 'web');
    const filePath = path.join(webRoot, rel);
    const withSep = webRoot.endsWith(path.sep) ? webRoot : webRoot + path.sep;
    if (filePath !== webRoot && !filePath.startsWith(withSep)) return send404Text(res, method);
    return sendFile(res, method, filePath, type);
  }
  return send404Text(res, method);
}

function startFakeApi(options = {}) {
  const retryMs = options.retryMs === undefined ? 3000 : options.retryMs;
  const root = options.root;

  const requests = [];
  const openStreams = new Set();
  const repliesList = []; // { method, pattern, status, body }, insertion order

  function findReply(method, reqPath) {
    for (let i = repliesList.length - 1; i >= 0; i--) {
      const r = repliesList[i];
      if (r.method !== method) continue;
      if (typeof r.pattern === 'string' ? r.pattern === reqPath : r.pattern.test(reqPath)) return r;
    }
    return null;
  }

  function reply(method, pathPattern, status, body) {
    repliesList.push({ method: method.toUpperCase(), pattern: pathPattern, status, body });
  }

  function emit(name, data) {
    const text = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of openStreams) res.write(text);
  }

  function dropStreams() {
    for (const res of openStreams) res.end();
    openStreams.clear();
  }

  function startStream(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' });
    res.write(`retry: ${retryMs}\n\n`);
    openStreams.add(res);
    // res 'close' (not req 'close': by the time handle() has awaited readBody(req), a GET request's req
    // has already closed, so a req listener added here would never fire).
    res.on('close', () => openStreams.delete(res));
  }

  async function handle(req, res) {
    const rawUrl = req.url || '/';
    const qIndex = rawUrl.indexOf('?');
    const reqPath = qIndex === -1 ? rawUrl : rawUrl.slice(0, qIndex);
    const queryText = qIndex === -1 ? '' : rawUrl.slice(qIndex + 1);
    const query = Object.fromEntries(new URLSearchParams(queryText));
    const method = (req.method || 'GET').toUpperCase();

    let bodyText;
    try { bodyText = await readBody(req); } catch { bodyText = ''; }
    let body = null;
    if (bodyText.length > 0) {
      try { body = JSON.parse(bodyText); } catch { body = bodyText; }
    }
    requests.push({ method, path: reqPath, query, body });

    if (root && (method === 'GET' || method === 'HEAD') && !reqPath.startsWith('/api/')) {
      return serveStatic(root, method, reqPath, res);
    }

    const matched = findReply(method, reqPath);
    if (matched) return sendReplyBody(res, method, matched.status, matched.body);

    if (method === 'GET' && reqPath === '/api/stream') return startStream(req, res);
    if (method === 'GET' && ARRAY_ROUTE_RE.test(reqPath)) return sendJson(res, method, 200, []);
    if (method === 'GET' && EQUIPMENT_ROUTE_RE.test(reqPath)) return sendJson(res, method, 200, null);
    if (method === 'GET' && reqPath.startsWith('/api/')) return sendJson(res, method, 200, {});
    if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && reqPath.startsWith('/api/')) {
      return sendJson(res, method, 200, body === undefined ? null : body);
    }
    if (method === 'DELETE' && reqPath.startsWith('/api/')) return sendJson(res, method, 200, {});
    return send404Json(res, method);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(err => {
      try { res.writeHead(500); res.end(String(err && err.message || err)); } catch { /* ignore */ }
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        reply,
        emit,
        dropStreams,
        close() {
          return new Promise(res2 => {
            dropStreams();
            server.close(() => res2());
            server.closeAllConnections();
          });
        },
      });
    });
  });
}

module.exports = { startFakeApi };
