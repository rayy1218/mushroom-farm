// The HTTP server: /api/... goes to the JSON API, everything else is a 404 for now.

import http from 'node:http';
import { createApi } from './api.js';

export function createApp(db) {
  const api = createApi(db);
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await api(req, res, url);
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Something went wrong');
    }
  });
}
