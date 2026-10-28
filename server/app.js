// The HTTP server: /api/... goes to the JSON API, everything else to the page files.

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.js';
import { createStatic } from './static.js';
import { createSse } from './live.js';
import { DEFAULT_GATEWAY } from './gateways.js';

const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));

// gateway: the farm's gateway text (FARM_GATEWAY), shown by GET /api/settings.
export function createApp(db, {
  webDir = WEB_DIR, machines = null, controller = null, poller = null, simulations = null, telegram = null, events = null, ssePingMs,
  gateway = DEFAULT_GATEWAY,
} = {}) {
  const api = createApi(db, machines, controller, poller, simulations, telegram, events, gateway);
  const sse = events && createSse({ events, pingMs: ssePingMs });
  const files = createStatic(webDir);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (sse && url.pathname === '/api/events') return sse.handler(req, res);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await api(req, res, url);
      await files(req, res, url);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Something went wrong');
    }
  });
  return server;
}
