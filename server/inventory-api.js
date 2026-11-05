// The inventory routes (spec 2026-11-05-inventory-design.md 7), called from api.js. server/inventory.js checks, records and
// works out; this reads the path, the query and the body, publishes 'inventory' { itemId } after each change and runs the
// Telegram checks (server/inventory-alerts.js) then, at start, hourly and on Batches' 'batches' events (Batches writes block
// and material moves, which can make an item Low), after which the pages hear 'inventory' { itemId: null }.

import { createInventory } from './inventory.js';
import { createInventoryAlerts } from './inventory-alerts.js';

const ID = '([1-9][0-9]{0,14})';
const ONE_ITEM = new RegExp(`^/api/inventory/items/${ID}$`);
const ONE_MOVE = new RegExp(`^/api/inventory/moves/${ID}$`);
const THROW_OUT = new RegExp(`^/api/inventory/lots/${ID}/throw-out$`);

// events: the farm's bus (null in some tests). alerts: options for createInventoryAlerts (tests). → { routes, inventory,
// alerts, stop }; routes(req, res, path, { send, readJson, HttpError, url }) answers true when the path is one of its own.
export function createInventoryApi({ db, events = null, now = Date.now, alerts: alertOptions = {}, log = console.error }) {
  const inventory = createInventory({ db, now, log });
  const alerts = createInventoryAlerts({ db, now, log, ...alertOptions });
  const offChange = inventory.onChange((itemId) => {
    events?.publish('inventory', { itemId });
    alerts.check();
  });
  const offBatches = events ? events.subscribe((type) => {
    if (type !== 'batches') return;
    alerts.check();
    events.publish('inventory', { itemId: null });
  }) : () => {};
  alerts.start();

  const noContent = (res) => {
    res.writeHead(204);
    res.end();
  };

  async function route(req, res, path, { send, readJson, HttpError, url }) {
    if (path !== '/api/inventory' && !path.startsWith('/api/inventory/')) return false;
    const notFound = () => new HttpError(404, 'Not found');
    const { method } = req;

    if (path === '/api/inventory') {
      if (method !== 'GET') throw notFound();
      send(res, 200, inventory.list({ archived: url.searchParams.get('archived') === '1' }));
      return true;
    }
    if (path === '/api/inventory/items') {
      if (method !== 'POST') throw notFound();
      send(res, 201, inventory.addItem(await readJson(req)));
      return true;
    }
    const item = ONE_ITEM.exec(path);
    if (item) {
      const id = Number(item[1]);
      if (method === 'GET') send(res, 200, inventory.item(id));
      else if (method === 'PUT') send(res, 200, inventory.editItem(id, await readJson(req)));
      else if (method === 'DELETE') { inventory.removeItem(id); noContent(res); }
      else throw notFound();
      return true;
    }
    if (path === '/api/inventory/purchases') {
      if (method === 'GET') send(res, 200, inventory.purchases(url.searchParams.get('from'), url.searchParams.get('to')));
      else if (method === 'POST') send(res, 201, inventory.purchase(await readJson(req)));
      else throw notFound();
      return true;
    }
    if (path === '/api/inventory/uses' || path === '/api/inventory/counts') {
      if (method !== 'POST') throw notFound();
      const body = await readJson(req);
      send(res, 201, path === '/api/inventory/uses' ? inventory.use(body) : inventory.count(body));
      return true;
    }
    const move = ONE_MOVE.exec(path);
    if (move) {
      const id = Number(move[1]);
      if (method === 'PUT') send(res, 200, inventory.editMove(id, await readJson(req)));
      else if (method === 'DELETE') { inventory.removeMove(id); noContent(res); }
      else throw notFound();
      return true;
    }
    const lot = THROW_OUT.exec(path);
    if (lot) {
      if (method !== 'POST') throw notFound();
      send(res, 201, inventory.throwOut(Number(lot[1]), await readJson(req)));
      return true;
    }
    if (path === '/api/inventory/sheet') {
      if (method !== 'GET') throw notFound();
      const asked = url.searchParams.get('days');
      if (asked !== null && !/^[0-9]{1,4}$/.test(asked)) throw new HttpError(400, 'days must be 30, 90 or 365', 'days');
      send(res, 200, inventory.sheet(asked === null ? 30 : Number(asked)));
      return true;
    }
    throw notFound();
  }

  // A 4xx from the store (InventoryError, or the tasks' worker check) becomes the API's HttpError.
  async function routes(req, res, path, helpers) {
    try {
      return await route(req, res, path, helpers);
    } catch (err) {
      const { HttpError } = helpers;
      if (!(err instanceof HttpError) && Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
        throw new HttpError(err.status, err.message, err.field);
      }
      throw err;
    }
  }

  return {
    routes, inventory, alerts,
    stop() {
      offChange();
      offBatches();
      alerts.stop();
    },
  };
}
