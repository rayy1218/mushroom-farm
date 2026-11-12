// What a worker may do and see (spec 2026-11-06-login-design.md 4). An owner may use every route; a worker only the routes
// below (any other: 403 in app.js), and their JSON replies leave the money out. A route added later is closed to workers
// until it is added here.

const ID = '[1-9][0-9]{0,14}';
const WORKER_ROUTES = [
  ['GET', '/api/overview'],
  ['GET', '/api/rooms'],
  ['GET', `/api/rooms/${ID}`],
  // a room's alarms, filter changes and control settings (the bands, spec 2026-11-12-alarms-triage-design.md 7): read only (a
  // filter change and the control settings are the owner's)
  ['GET', `/api/rooms/${ID}/(?:sensors|history|crop|machines|tasks|tasks/log|harvests|alarms|filter/changes|control)`],
  ['GET', '/api/alarms'],
  // acknowledging alarms (spec 2026-11-12-alarms-triage-design.md 7): at 2 am only the worker is there
  ['POST', `/api/alarms/(?:${ID}/)?ack`],
  ['POST', `/api/rooms/${ID}/alarms/ack`],
  ['GET', '/api/outdoor'],
  ['GET', '/api/outdoor/history'],
  ['GET', '/api/settings'], // only pollSeconds (below)
  ['GET', '/api/events'],
  ['GET', '/api/tasks/today'],
  ['GET', '/api/calendar'],
  ['GET', '/api/workers'],
  ['POST', `/api/tasks/${ID}/(?:done|skip|undo)`], // undo: their own Done or Skip only (tasks-api.js)
  ['GET', '/api/harvest'],
  ['POST', `/api/rooms/${ID}/harvests`],
  ['GET', '/api/inventory'],
  ['GET', `/api/inventory/items/${ID}`],
  ['POST', '/api/inventory/uses'],
  ['POST', '/api/inventory/counts'],
].map(([method, path]) => [method, new RegExp(`^${path}$`)]);

export const workerMay = (method, path) => WORKER_ROUTES.some(([m, re]) => m === method && re.test(path));

// The keys that mean money in the replies a worker may get, left out wherever they are (a whole object under one: a run's
// cost). Names are matched everywhere: a later non-money key of the same name in an allowed reply would vanish for workers
// (it fails closed; rename it). missing: what Settings → Yield lacks, the owner's to fix (its price list names the crops without a price).
export const MONEY_KEYS = new Set([
  'value', 'cost', 'costPerKg', 'waterCost', 'prices', 'electricityPrice', 'waterPrice', 'priceKg', 'rmMonth', 'unitCost', 'price',
  'total', 'blockCost', 'pricePerBlock', 'profit', 'income', 'unpriced', 'missing',
]);

// The settings a worker's pages read: how often to read again. (No prices, no Telegram chat or token, no gateway.)
const WORKER_SETTINGS = ['pollSeconds'];

// The keys a worker never gets that are not money: a gateway alarm's address (the farm app is on the internet; review
// 2026-11-12). Matched everywhere, as MONEY_KEYS.
export const HIDDEN_KEYS = new Set(['gatewayAddress']);

function withoutMoney(v) {
  if (Array.isArray(v)) return v.map(withoutMoney);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !MONEY_KEYS.has(k) && !HIDDEN_KEYS.has(k)).map(([k, x]) => [k, withoutMoney(x)]));
  }
  return v;
}

// A worker's reply of path: the settings cut to WORKER_SETTINGS, every reply without its money.
export function workerReply(path, data) {
  if (path === '/api/settings' && data !== null && typeof data === 'object') {
    return Object.fromEntries(WORKER_SETTINGS.filter((k) => k in data).map((k) => [k, data[k]]));
  }
  return withoutMoney(data);
}

// Makes res pass its JSON replies (a 2xx with an application/json type) through workerReply on their way out; a CSV, an
// event stream, an error and an empty reply go as they are. It fails closed: however the handler sets the type (setHeader,
// writeHead with an object or a raw array, any letter case) and however it writes (write chunks, end with a callback), a JSON
// reply is buffered and filtered once; a body that is not JSON is never sent, an error reply goes instead. The API's send()
// gives no Content-Length, and the length would change, so any is removed.
const FAILED = JSON.stringify({ error: 'Something went wrong' });

const typeIn = (headers) => {
  if (Array.isArray(headers)) {
    for (let i = 0; i + 1 < headers.length; i += 2) if (String(headers[i]).toLowerCase() === 'content-type') return headers[i + 1];
    return undefined;
  }
  if (headers !== null && typeof headers === 'object') {
    const k = Object.keys(headers).find((n) => n.toLowerCase() === 'content-type');
    return k === undefined ? undefined : headers[k];
  }
  return undefined;
};
const withoutLength = (headers) => {
  if (Array.isArray(headers)) return headers.filter((x, i) => String(headers[i - (i % 2)]).toLowerCase() !== 'content-length');
  if (headers !== null && typeof headers === 'object') return Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'content-length'));
  return headers;
};
// A 2xx reply with no type at all counts as JSON (fails closed: filtered, or the error reply if it does not parse).
const isJson = (status, type) => status < 300 && (type === undefined || type === null || /^application\/json\b/i.test(String(type)));

export function filterWorkerReplies(res, path) {
  let status; // from writeHead, else res.statusCode
  let type;
  let json; // decided at the first write or end
  let done = false;
  const buffered = [];
  const writeHead = res.writeHead.bind(res);
  const write = res.write?.bind(res);
  const end = res.end.bind(res);
  const decide = () => {
    if (json === undefined) {
      json = isJson(status ?? res.statusCode, type ?? res.getHeader?.('content-type'));
      if (json && !res.headersSent) res.removeHeader?.('content-length');
    }
    return json;
  };
  res.writeHead = (code, ...rest) => {
    status = code;
    type = rest.map(typeIn).find((x) => x !== undefined) ?? res.getHeader?.('content-type');
    if (isJson(status, type)) {
      res.removeHeader?.('content-length');
      rest = rest.map(withoutLength);
    }
    return writeHead(code, ...rest);
  };
  res.write = (chunk, ...rest) => {
    if (done || !decide()) return write(chunk, ...rest);
    if (chunk !== undefined && chunk !== null) {
      const enc = typeof rest[0] === 'string' ? rest[0] : undefined;
      buffered.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
    }
    const cb = rest.find((x) => typeof x === 'function');
    if (cb) process.nextTick(cb);
    return true;
  };
  res.end = (chunk, ...rest) => {
    if (done || !decide()) return end(chunk, ...rest);
    done = true;
    let enc;
    let cb;
    if (typeof chunk === 'function') { cb = chunk; chunk = undefined; } else {
      enc = typeof rest[0] === 'string' ? rest[0] : undefined;
      cb = rest.find((x) => typeof x === 'function');
    }
    if (chunk !== undefined && chunk !== null) buffered.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, enc));
    if (buffered.length === 0) return end(cb);
    let body;
    try {
      body = JSON.stringify(workerReply(path, JSON.parse(Buffer.concat(buffered).toString('utf8'))));
    } catch {
      console.error(`A worker's reply of ${path} was not JSON; sent an error instead`);
      body = FAILED;
      if (!res.headersSent) res.statusCode = 500;
    }
    return end(body, cb);
  };
}
