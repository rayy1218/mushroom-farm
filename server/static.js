// Serves the page files directly inside web/. No subfolders, nothing else.
// Each file is read once per version (mtime + size), kept in memory with its ETag and a gzipped copy,
// and sent with an ETag so a reload over a slow link is a 304 instead of 2 MB.

import { open } from 'node:fs/promises';
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

// Accept-Encoding lists gzip (or x-gzip) with q > 0; a malformed q is not acceptable.
// Without a gzip entry, a * entry decides.
function acceptsGzip(header) {
  let star;
  for (const part of String(header ?? '').split(',')) {
    const [coding, ...params] = part.trim().split(';');
    const name = coding.trim().toLowerCase();
    if (name !== 'gzip' && name !== 'x-gzip' && name !== '*') continue;
    let ok = true;
    for (const p of params) {
      const m = /^\s*q\s*=\s*(.*?)\s*$/i.exec(p);
      if (m) ok = /^(0(\.\d{0,3})?|1(\.0{0,3})?)$/.test(m[1]) && Number(m[1]) > 0;
    }
    if (name === '*') star = ok;
    else return ok;
  }
  return star === true;
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
  const cache = new Map(); // name -> { key (mtime:size:inode:ctime), plain: {data, etag}, gzip: {data, etag} | null }

  async function load(name, ext) {
    const file = await open(join(dir, name));
    try {
      const st = await file.stat();
      if (!st.isFile()) return null;
      const key = `${st.mtimeMs}:${st.size}:${st.ino}:${st.ctimeMs}`;
      const hit = cache.get(name);
      if (hit && hit.key === key) return hit;
      const data = await file.readFile();
      const entry = { key, plain: { data, etag: etagOf(data) }, gzip: null };
      if (COMPRESSIBLE.has(ext)) {
        const zipped = gzipSync(data, { level: 9 });
        entry.gzip = { data: zipped, etag: etagOf(zipped, '-gzip') };
      }
      cache.set(name, entry);
      return entry;
    } finally {
      await file.close();
    }
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
    if (!entry) return notFound(res);
    const gz = entry.gzip && acceptsGzip(req.headers['accept-encoding']);
    const body = gz ? entry.gzip : entry.plain;
    const headers = { ...SECURITY, 'content-type': TYPES[ext], 'cache-control': 'no-cache', etag: body.etag };
    if (entry.gzip) headers.vary = 'accept-encoding';
    if (gz) headers['content-encoding'] = 'gzip';
    if (matches(req.headers['if-none-match'], body.etag)) {
      delete headers['content-encoding'];
      res.writeHead(304, headers);
      return res.end();
    }
    headers['content-length'] = body.data.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body.data);
  };
}
