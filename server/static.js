// server/static.js: static file rules (C3 section 9), with path safety (C3 section 4.5).
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const TOP_LEVEL = {
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

function send404(res, method) {
  const body = 'Not found';
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  if (method === 'HEAD') res.end();
  else res.end(body);
  return true;
}

function sendFile(res, method, absPath, type) {
  let data;
  try {
    data = fs.readFileSync(absPath);
  } catch {
    return send404(res, method);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
  if (method === 'HEAD') res.end();
  else res.end(data);
  return true;
}

function serveStatic(req, res, root) {
  const rawPath = (req.url || '').split('?')[0];
  if (rawPath.startsWith('/api/')) return false;

  const method = req.method;
  if (method !== 'GET' && method !== 'HEAD') return send404(res, method);

  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return send404(res, method);
  }
  if (decoded.includes('\u0000') || decoded.includes('\\')) return send404(res, method);

  if (Object.hasOwn(TOP_LEVEL, decoded)) {
    const entry = TOP_LEVEL[decoded];
    return sendFile(res, method, path.join(root, entry.file), entry.type);
  }

  if (decoded === '/web' || decoded === '/web/') return send404(res, method);
  if (decoded.startsWith('/web/')) {
    const sub = decoded.slice('/web/'.length);
    const segments = sub.split('/');
    for (const seg of segments) {
      if (seg === '' || seg === '..' || seg.startsWith('.')) return send404(res, method);
    }
    const ext = path.extname(sub);
    const type = WEB_EXT_TYPES[ext];
    if (!type) return send404(res, method);
    const webRoot = path.join(root, 'web');
    const absPath = path.join(webRoot, ...segments);
    const rel = path.relative(webRoot, absPath);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return send404(res, method);
    let stat;
    try {
      stat = fs.statSync(absPath);
    } catch {
      return send404(res, method);
    }
    if (!stat.isFile()) return send404(res, method);
    return sendFile(res, method, absPath, type);
  }

  return send404(res, method);
}

module.exports = { serveStatic };
