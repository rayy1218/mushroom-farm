// Serves the page files directly inside web/. No subfolders, nothing else.
// Each file is read once per version (mtime + size), kept in memory with its ETag and a gzipped copy,
// and sent with an ETag so a reload over a slow link is a 304 instead of 2 MB.

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', // the page font (web/inter.woff2), so the app needs no internet for its type
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css']); // woff2 is already compressed

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};

function notFound(res) {
  res.writeHead(404, { ...SECURITY, 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

const etagOf = (bytes, suffix = '') => `"${createHash('sha1').update(bytes).digest('base64')}${suffix}"`;

// Accept-Encoding lists gzip with q > 0 (or no q).
function acceptsGzip(header) {
  for (const part of String(header ?? '').split(',')) {
    const [coding, ...params] = part.trim().split(';');
    if (coding.trim().toLowerCase() !== 'gzip') continue;
    const q = params.map((p) => /^\s*q\s*=\s*([\d.]+)\s*$/i.exec(p)?.[1]).find((v) => v !== undefined);
    return q === undefined || Number(q) > 0;
  }
  return false;
}

// If-None-Match: a list of entity tags (weak ones compare equal here) or *.
function matches(header, etag) {
  if (!header) return false;
  return header.split(',').some((t) => {
    t = t.trim();
    return t === '*' || t.replace(/^W\//, '') === etag;
  });
}

export function createStatic(dir) {
  const cache = new Map(); // name -> { mtimeMs, size, plain: {data, etag}, gzip: {data, etag} | null }

  async function load(name, ext) {
    const path = join(dir, name);
    const st = await stat(path);
    const hit = cache.get(name);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit;
    const data = await readFile(path);
    const entry = { mtimeMs: st.mtimeMs, size: st.size, plain: { data, etag: etagOf(data) }, gzip: null };
    if (COMPRESSIBLE.has(ext)) {
      const zipped = gzipSync(data, { level: 9 });
      entry.gzip = { data: zipped, etag: etagOf(zipped, '-gzip') };
    }
    cache.set(name, entry);
    return entry;
  }

  return async function serve(req, res, url) {
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const ext = /^[a-z0-9-]+(\.[a-z0-9]+)$/.exec(name)?.[1];
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !TYPES[ext]) return notFound(res);
    let entry;
    try {
      entry = await load(name, ext);
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'EISDIR') return notFound(res);
      throw err;
    }
    const gz = entry.gzip && acceptsGzip(req.headers['accept-encoding']);
    const body = gz ? entry.gzip : entry.plain;
    const headers = { ...SECURITY, 'content-type': TYPES[ext], 'cache-control': 'no-cache', etag: body.etag };
    if (entry.gzip) headers.vary = 'accept-encoding';
    if (gz) headers['content-encoding'] = 'gzip';
    if (matches(req.headers['if-none-match'], body.etag)) {
      res.writeHead(304, headers);
      return res.end();
    }
    headers['content-length'] = body.data.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body.data);
  };
}
