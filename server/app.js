// The HTTP server: /api/... goes to the JSON API, everything else to the page files.

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.js';
import { createStatic } from './static.js';

const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));

export function createApp(db, { webDir = WEB_DIR } = {}) {
  const api = createApi(db);
  const files = createStatic(webDir);
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await api(req, res, url);
      await files(req, res, url);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Something went wrong');
    }
  });
}
