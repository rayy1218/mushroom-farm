// The HTTP server: /api/... goes to the JSON API, everything else to the page files. ---- Login ---- (spec
// 2026-11-06-login-design.md 4): the sign-in routes first; then every other /api request needs a session (401), a worker only
// the routes of roles.js (403), and a worker's JSON replies leave the money out. The page files are open: they hold no farm data.
// Before all of it (security review M2, M4): every /api reply gets API_HEADERS, and a write (not GET or HEAD) that the
// browser marks as sent from another site's page is 403 (OPTIONS counts as a write: a cross-site preflight is 403 too,
// which is intended; the app's own pages never send one).

import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApi, send } from './api.js';
import { createStatic } from './static.js';
import { createSse } from './live.js';
import { DEFAULT_GATEWAY } from './gateways.js';
import { createAuth } from './auth.js';
import { createLoginNotify } from './login-alerts.js';
import { createAuthRoutes } from './auth-api.js';
import { workerMay, filterWorkerReplies } from './roles.js';

const WEB_DIR = fileURLToPath(new URL('../web/', import.meta.url));

// Set before routing, so each reply's writeHead merges them (its own headers win: the live stream keeps its no-cache).
const API_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

// A write from a page of another site (or another port or subdomain): the browser says so in Sec-Fetch-Site. Without the
// header (curl, an old browser) it goes on; the SameSite=Strict cookie still holds. Origin is not compared with Host, as
// Tailscale's proxy may change Host.
const foreignWrite = (req) => {
  if (req.method === 'GET' || req.method === 'HEAD') return false;
  const site = req.headers['sec-fetch-site'];
  return site !== undefined && site !== 'same-origin' && site !== 'none';
};

// gateway: the farm's gateway text (FARM_GATEWAY), shown by GET /api/settings. tasks: from createTasks (one is made when
// left out). login: false only in tests that are not about signing in; every request is then the owner's. loginNotify(text):
// the owner's note of a sign-in lock (by default a Telegram message to the alarms' chat, when Telegram is set up).
export function createApp(db, {
  webDir = WEB_DIR, machines = null, controller = null, poller = null, simulations = null, telegram = null, events = null, ssePingMs,
  gateway = DEFAULT_GATEWAY, tasks = null, login = true, loginNotify = createLoginNotify({ db }),
} = {}) {
  const auth = login ? createAuth({ db, notify: loginNotify }) : null;
  const api = createApi(db, machines, controller, poller, simulations, telegram, events, gateway, tasks, {
    onUnlock: (id) => auth?.unlocked(id), addressLocks: () => auth?.addressLocks() ?? new Map(),
  });
  // the stream ends once its sign-in has ended or its role is no longer the one it opened with
  const sse = events && createSse({ events, pingMs: ssePingMs, check: auth && ((req) => auth.alive(req) === req.who.role) });
  const files = createStatic(webDir);
  const authRoutes = auth && createAuthRoutes({ auth });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
      if (isApi) {
        for (const [name, value] of Object.entries(API_HEADERS)) res.setHeader(name, value);
        if (foreignWrite(req)) return send(res, 403, { error: 'Ask from the farm app' });
      }
      if (isApi && auth) {
        if (await authRoutes(req, res, url.pathname)) return;
        req.who = auth.who(req, res);
        // (a stale cookie is cleared only by GET /api/session's 401, not here: a request in flight with the old cookie whose
        // 401 landed after a fresh sign-in would delete the new cookie)
        if (!req.who) return send(res, 401, { error: 'Sign in' });
        if (req.who.role !== 'owner') {
          if (!workerMay(req.method, url.pathname)) return send(res, 403, { error: 'Ask the owner' });
          filterWorkerReplies(res, url.pathname);
        }
      }
      if (sse && url.pathname === '/api/events') return sse.handler(req, res);
      if (isApi) return await api(req, res, url);
      await files(req, res, url);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Something went wrong');
    }
  });
  // The sign-in timer stops with the server; main.js calls closeAuth itself before it closes the database (server.close
  // waits for open connections, so its 'close' can come after).
  server.closeAuth = () => auth?.close();
  server.on('close', () => { api.close(); auth?.close(); });
  return server;
}
