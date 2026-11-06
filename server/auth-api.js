// The sign-in routes (spec 2026-11-06-login-design.md 3), answered before the gate: GET /api/login/names, POST /api/login,
// GET /api/session, POST /api/logout and POST /api/session/password (an owner's own password).

import { readJson, send, HttpError } from './api.js';
import { clearCookie } from './auth.js';

// auth: from createAuth. → async (req, res, path) that answers true when the path is one of its routes.
export function createAuthRoutes({ auth }) {
  const only = (req, method) => { if (req.method !== method) throw new HttpError(404, 'Not found'); };
  const empty = (res, status) => { res.writeHead(status); res.end(); };

  async function route(req, res, path) {
    if (path === '/api/login/names') {
      only(req, 'GET');
      send(res, 200, { names: auth.names() });
      return true;
    }
    if (path === '/api/login') {
      only(req, 'POST');
      const r = await auth.login(req, await readJson(req));
      if (r.cookie) res.setHeader('set-cookie', r.cookie);
      send(res, r.status, r.body);
      return true;
    }
    if (path === '/api/session') {
      only(req, 'GET');
      const me = auth.who(req, res);
      if (me) send(res, 200, { id: me.id, name: me.name, role: me.role });
      else send(res, 401, { error: 'Sign in' });
      return true;
    }
    if (path === '/api/logout') {
      only(req, 'POST');
      auth.logout(req);
      res.setHeader('set-cookie', clearCookie());
      empty(res, 204);
      return true;
    }
    if (path === '/api/session/password') {
      only(req, 'POST');
      const me = auth.who(req, res);
      if (!me) throw new HttpError(401, 'Sign in');
      if (me.role !== 'owner') throw new HttpError(403, 'Ask the owner');
      const r = await auth.changePassword(req, me, await readJson(req));
      if (r.cookie) res.setHeader('set-cookie', r.cookie);
      if (r.status === 204) empty(res, 204);
      else send(res, r.status, r.body);
      return true;
    }
    return false;
  }

  return async function authRoutes(req, res, path) {
    try {
      return await route(req, res, path);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      send(res, err.status, err.field ? { error: err.message, field: err.field } : { error: err.message });
      return true;
    }
  };
}
