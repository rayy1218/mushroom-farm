// Serves the page files directly inside web/. No subfolders, nothing else.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', // the page font (web/inter.woff2), so the app needs no internet for its type
};

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

export function createStatic(dir) {
  return async function serve(req, res, url) {
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const ext = /^[a-z0-9-]+(\.[a-z0-9]+)$/.exec(name)?.[1];
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !TYPES[ext]) return notFound(res);
    let data;
    try {
      data = await readFile(join(dir, name));
    } catch (err) {
      if (err.code === 'ENOENT') return notFound(res);
      throw err;
    }
    res.writeHead(200, { 'content-type': TYPES[ext], 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  };
}
