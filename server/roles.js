// What a worker may do and see (spec 2026-11-06-login-design.md 4). An owner may use every route; a worker only the routes
// below (any other: 403 in app.js), and their JSON replies leave the money out. A route added later is closed to workers
// until it is added here.

const ID = '[1-9][0-9]{0,14}';
const WORKER_ROUTES = [
  ['GET', '/api/overview'],
  ['GET', '/api/rooms'],
  ['GET', `/api/rooms/${ID}`],
  ['GET', `/api/rooms/${ID}/(?:sensors|history|crop|machines|tasks|tasks/log|harvests)`],
  ['GET', '/api/alarms'],
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
// cost). missing: what Settings → Yield lacks, the owner's to fix (its price list names the crops without a price).
export const MONEY_KEYS = new Set([
  'value', 'cost', 'costPerKg', 'waterCost', 'prices', 'electricityPrice', 'waterPrice', 'priceKg', 'rmMonth', 'unitCost', 'price',
  'total', 'blockCost', 'pricePerBlock', 'profit', 'income', 'unpriced', 'missing',
]);

// The settings a worker's pages read: how often to read again. (No prices, no Telegram chat or token, no gateway.)
const WORKER_SETTINGS = ['pollSeconds'];

function withoutMoney(v) {
  if (Array.isArray(v)) return v.map(withoutMoney);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !MONEY_KEYS.has(k)).map(([k, x]) => [k, withoutMoney(x)]));
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
// event stream, an error and an empty reply go as they are. The API's send() gives no Content-Length, so the length may change.
export function filterWorkerReplies(res, path) {
  let json = false;
  const writeHead = res.writeHead.bind(res);
  res.writeHead = (status, ...rest) => {
    const headers = rest.find((x) => x !== null && typeof x === 'object') ?? {};
    const type = headers['content-type'] ?? res.getHeader('content-type') ?? '';
    json = status < 300 && /^application\/json\b/i.test(String(type));
    return writeHead(status, ...rest);
  };
  const end = res.end.bind(res);
  res.end = (chunk, ...rest) => {
    if (json && chunk !== undefined && chunk !== null) chunk = JSON.stringify(workerReply(path, JSON.parse(String(chunk))));
    return end(chunk, ...rest);
  };
}
