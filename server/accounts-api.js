// Settings → Workers' sign-in controls (spec 2026-11-06-login-design.md 5), the owner's only (roles.js leaves them out of a
// worker's routes): GET /api/workers/accounts, POST /api/workers/:id/secret { secret }, PUT /api/workers/:id/role { role },
// POST /api/workers/:id/unlock and POST /api/workers/:id/sign-out. Each change answers { account } as the list has it.

import { hashSecret, pinError, passwordError, clearCookie } from './auth.js';

const ONE = /^\/api\/workers\/([1-9][0-9]{0,14})\/(secret|role|unlock|sign-out)$/;

// → async (req, res, path, { send, readJson, HttpError }) that answers true when the path is one of its routes.
export function createAccountRoutes({ db, now = Date.now }) {
  const accountOf = (id) => db.accounts(now()).find((a) => a.id === id);

  return async function accountRoutes(req, res, path, { send, readJson, HttpError }) {
    if (path === '/api/workers/accounts') {
      if (req.method !== 'GET') throw new HttpError(404, 'Not found');
      send(res, 200, { accounts: db.accounts(now()) });
      return true;
    }
    const match = ONE.exec(path);
    if (!match) return false;
    const [, idText, what] = match;
    if (req.method !== (what === 'role' ? 'PUT' : 'POST')) throw new HttpError(404, 'Not found');
    const account = db.account(Number(idText));
    if (!account) throw new HttpError(404, 'Worker not found');
    let ownSessionEnds = false; // the person's own session goes with the change: the browser forgets its cookie
    if (what === 'secret') {
      if (req.who?.id === account.id) throw new HttpError(400, 'Use Change password on Settings', 'secret');
      const secret = (await readJson(req))?.secret;
      const problem = account.role === 'owner' ? passwordError(secret) : pinError(secret);
      if (problem) throw new HttpError(400, problem, 'secret');
      // Written only while the role is still the one the rule came from (the hash is slow; a role change can come between).
      if (!db.setSecret(account.id, await hashSecret(secret), account.role)) {
        throw new HttpError(409, 'The role changed: set it again', 'secret');
      }
    } else if (what === 'role') {
      const role = (await readJson(req))?.role;
      if (role !== 'owner' && role !== 'worker') throw new HttpError(400, 'The role must be owner or worker', 'role');
      const usable = db.usableOwners();
      if (role === 'worker' && usable.includes(account.id) && usable.length <= 1) {
        throw new HttpError(400, 'The farm needs an owner', 'role');
      }
      // A worker's PIN is no owner's password, nor the other way: a new role needs a new secret (Set PIN or Set password).
      if (role !== account.role) {
        db.setRole(account.id, role); // clears the secret, the lock and the sessions with it
        ownSessionEnds = req.who?.id === account.id;
      }
    } else if (what === 'unlock') {
      db.setTries(account.id, 0, null);
    } else {
      db.signOutEverywhere(account.id);
      ownSessionEnds = req.who?.id === account.id;
    }
    if (ownSessionEnds) res.setHeader('set-cookie', clearCookie());
    send(res, 200, { account: accountOf(account.id) });
    return true;
  };
}
