// JSON API: /api/settings, /api/alarms, /api/outdoor, /api/usage, /api/rooms, /api/rooms/:id, /api/rooms/:id/sensors, /alarms,
// /control, /machines, /usage and /filter/changed, /filter/changes.

import { validateRoom, FILTER } from './rooms.js';
import { NameTakenError, AddressTakenError, HISTORY_BUCKET_S } from './db.js';
import { CommandError } from './machines.js';
import { RELAY_KEYS } from './machine-codes.js';
import { validateSettings, readSettings, writeSettings, settingsView } from './settings.js';
import { outdoorView, outdoorHistory, RANGES } from './outdoor.js';
import { roomUsage, farmUsage } from './usage.js';
import { bucketUsage } from './usage-buckets.js';
import { changeFilter, lastCounted } from './filter.js';
import { createCropApi } from './crop-api.js';
import { createSimulationRoutes } from './simulation-api.js';

const MAX_BODY = 64 * 1024;

class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Content-Type must be application/json');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Body is too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body must be valid JSON');
  }
}

const ADDRESS_FIELDS = ['trhAddress', 'co2Address', 'relayAddress', 'acAddress', 'meterAddress', 'dpAddress'];

// The days query of the usage routes: a whole number from 1 to 90, default 30.
function readDays(url) {
  const text = url.searchParams.get('days');
  if (text === null) return 30;
  const days = /^[0-9]{1,3}$/.test(text) ? Number(text) : NaN;
  if (!(days >= 1 && days <= 90)) throw new HttpError(400, 'days must be a whole number from 1 to 90', 'days');
  return days;
}

const notFound = () => new HttpError(404, 'Not found');
const noRoom = () => new HttpError(404, 'Room not found');

// Returns a handler for every request whose path starts with /api.
// machines (from createMachines) and controller (from createController) are optional:
// without them the machine or control routes do not exist. poller (from createPoller), when given,
// gets a new reading interval at once.
export function createApi(db, machines = null, controller = null, poller = null, simulations = null, telegram = null, events = null) {
  const publishRoom = (id, part) => events?.publish('room', { id, part }); // the live pages ask again (spec 2026-10-26 section 2)
  const simulationRoutes = simulations && createSimulationRoutes({ db, simulations });
  // The room body; its addresses must differ from the outdoor sensor's. stored: the room as it is (an update): a filter
  // setting left out is its stored value, so the checks compare what will be saved.
  async function readRoom(req, stored = null) {
    const body = await readJson(req);
    if (stored && body !== null && typeof body === 'object' && !Array.isArray(body)) {
      for (const { field } of FILTER) body[field] ??= stored[field];
    }
    const result = validateRoom(body);
    if (result.error) throw new HttpError(400, result.error, result.field);
    const outdoor = db.outdoorAddress();
    const clash = outdoor === null ? undefined : ADDRESS_FIELDS.find((f) => result.room[f] === outdoor);
    if (clash) throw new HttpError(400, `Address ${outdoor} is used by the outdoor sensor`, clash);
    return result.room;
  }

  const crop = createCropApi({ db });

  const prices = () => {
    const { electricityPrice, waterPrice } = readSettings(db);
    return { electricity: electricityPrice, water: waterPrice };
  };

  async function route(req, res, path, url) {
    if (simulationRoutes && await simulationRoutes(req, res, path, { send, readJson, HttpError })) return;
    if (path === '/api/settings') {
      if (req.method === 'GET') return send(res, 200, settingsView(db, telegram?.status()));
      if (req.method !== 'PUT') throw notFound();
      const result = validateSettings(await readJson(req));
      if (result.error) throw new HttpError(400, result.error, result.field);
      const { outdoorAddress } = result.settings;
      const user = outdoorAddress == null ? undefined : db.listRooms().find((r) => ADDRESS_FIELDS.some((f) => r[f] === outdoorAddress));
      if (user) throw new HttpError(400, `Address ${outdoorAddress} is used by ${user.name}`, 'outdoorAddress');
      writeSettings(db, result.settings);
      const settings = readSettings(db);
      if (result.settings.pollSeconds !== undefined) poller?.setIntervalMs(settings.pollSeconds * 1000);
      telegram?.settingsChanged();
      return send(res, 200, settingsView(db, telegram?.status()));
    }
    if (path === '/api/settings/telegram/test' && telegram) {
      if (req.method !== 'POST') throw notFound();
      // Optionally the token and chat id as typed on the page, not saved yet; an empty token means the stored one.
      const body = Number(req.headers['content-length'] ?? 0) > 0 || req.headers['transfer-encoding'] ? await readJson(req) : {};
      const typed = {};
      if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
        const checked = validateSettings(Object.fromEntries(['telegramToken', 'telegramChatId'].filter((f) => body[f] !== undefined && body[f] !== '').map((f) => [f, body[f]])));
        if (checked.error && checked.field) throw new HttpError(400, checked.error, checked.field);
        Object.assign(typed, checked.settings);
      }
      const r = await telegram.test(typed);
      if (r.field) throw new HttpError(400, r.error, r.field);
      if (r.error) return send(res, 502, { error: r.error });
      return send(res, 200, { ok: true });
    }
    if (path === '/api/outdoor') {
      if (req.method !== 'GET') throw notFound();
      return send(res, 200, outdoorView(db));
    }
    if (path === '/api/outdoor/history') {
      if (req.method !== 'GET') throw notFound();
      const history = outdoorHistory(db, url.searchParams.get('range') ?? '');
      if (!history) throw new HttpError(400, `range must be ${RANGES.join(', ')}`, 'range');
      return send(res, 200, { ...history, pollSeconds: readSettings(db).pollSeconds });
    }
    if (path === '/api/usage') {
      if (req.method !== 'GET') throw notFound();
      return send(res, 200, farmUsage(db, { days: readDays(url), prices: prices() }));
    }
    if (path === '/api/rooms') {
      if (req.method === 'GET') return send(res, 200, db.listRooms());
      if (req.method === 'POST') {
        const created = db.createRoom(await readRoom(req));
        publishRoom(created.id, 'room');
        return send(res, 201, created);
      }
      throw notFound();
    }
    // ---- Alarms (spec 2026-10-19-safety-and-history-design.md section 5) ----
    if (path === '/api/alarms') {
      if (req.method !== 'GET') throw notFound();
      return send(res, 200, db.currentAlarms());
    }
    const alarmAck = /^\/api\/alarms\/([1-9][0-9]{0,14})\/ack$/.exec(path);
    if (alarmAck) {
      if (req.method !== 'POST') throw notFound();
      const alarm = db.ackAlarm(Number(alarmAck[1]), Date.now());
      if (!alarm) throw new HttpError(404, 'Alarm not found');
      return send(res, 200, alarm);
    }
    const roomAlarms = /^\/api\/rooms\/([1-9][0-9]{0,14})\/alarms(\/ack)?$/.exec(path);
    if (roomAlarms) {
      const roomId = Number(roomAlarms[1]);
      if (req.method !== (roomAlarms[2] ? 'POST' : 'GET')) throw notFound();
      if (!db.getRoom(roomId)) throw noRoom();
      return send(res, 200, roomAlarms[2] ? { acked: db.ackRoomAlarms(roomId, Date.now()) } : db.roomAlarms(roomId));
    }
    // ---- end of alarms ----

    // Stream B: the Overview page's reply.
    if (path === '/api/overview') {
      if (req.method !== 'GET') throw notFound();
      return send(res, 200, db.overview());
    }
    // ---- The intake filter (spec 2026-10-22-filter-design.md 5) ----
    const filter = /^\/api\/rooms\/([1-9][0-9]{0,14})\/filter\/(changed|changes)$/.exec(path);
    if (filter) {
      const roomId = Number(filter[1]);
      if (req.method !== (filter[2] === 'changed' ? 'POST' : 'GET')) throw notFound();
      if (!db.getRoom(roomId)) throw noRoom();
      if (filter[2] === 'changes') return send(res, 200, db.filterChanges(roomId));
      const room = changeFilter(db, roomId, Date.now());
      controller?.filterChanged(roomId);
      publishRoom(roomId, 'filter');
      return send(res, 200, room);
    }
    const match = /^\/api\/rooms\/([1-9][0-9]{0,14})(\/sensors|\/usage|\/control|\/crop|\/history|\/machines(?:\/([a-z]+))?)?$/.exec(path);
    if (!match) throw notFound();
    const id = Number(match[1]);
    if (match[2]?.startsWith('/machines')) {
      if (!machines) throw notFound();
      const key = match[3];
      if (key === undefined) {
        if (req.method !== 'GET') throw notFound();
        const view = machines.get(id);
        if (!view) throw noRoom();
        return send(res, 200, { ...view, auto: db.getControl(id)?.auto ?? false });
      }
      if (req.method !== 'PUT' || !(key === 'ac' || RELAY_KEYS.includes(key))) throw notFound();
      if (!db.getRoom(id)) throw noRoom();
      const view = await machines.command(id, key, await readJson(req));
      if (!view) throw noRoom();
      publishRoom(id, 'machines');
      return send(res, 200, { ...view, auto: db.getControl(id)?.auto ?? false });
    }
    // Stream B: bucketed readings and machine lines for the charts.
    if (match[2] === '/history') {
      if (req.method !== 'GET') throw notFound();
      const hours = /^[0-9]{1,3}$/.test(url.searchParams.get('hours') ?? '') ? Number(url.searchParams.get('hours')) : NaN;
      if (!(hours in HISTORY_BUCKET_S)) throw new HttpError(400, 'hours must be 1, 6, 24, 168 or 720', 'hours');
      const history = db.history(id, hours);
      if (!history) throw noRoom();
      const usage = bucketUsage(db, db.getRoom(id), history); // electricity and water per bucket (spec 2026-10-26-usage-charts)
      return send(res, 200, { ...history, pollSeconds: readSettings(db).pollSeconds, usage });
    }
    if (match[2] === '/control') {
      if (!controller) throw notFound();
      if (req.method === 'GET') {
        const view = controller.get(id);
        if (!view) throw noRoom();
        return send(res, 200, view);
      }
      if (req.method !== 'PUT') throw notFound();
      if (!db.getRoom(id)) throw noRoom();
      const updated = controller.update(id, await readJson(req));
      publishRoom(id, 'control');
      return send(res, 200, updated);
    }
    if (match[2] === '/crop') {
      if (req.method !== 'GET' && req.method !== 'PUT') throw notFound();
      if (!db.getRoom(id)) throw noRoom();
      if (req.method === 'GET') return send(res, 200, crop.get(id));
      const saved = crop.put(id, await readJson(req));
      publishRoom(id, 'crop');
      return send(res, 200, saved);
    }
    if (match[2] === '/usage') {
      if (req.method !== 'GET') throw notFound();
      const usage = roomUsage(db, id, { days: readDays(url), prices: prices() });
      if (!usage) throw noRoom();
      return send(res, 200, usage);
    }
    if (match[2]) { // /sensors: the two sensors, then the energy meter (kind 'meter') and the filter pressure sensor (kind 'dp')
      if (req.method !== 'GET') throw notFound();
      const sensors = db.getSensors(id);
      if (!sensors) throw noRoom();
      // The filter sensor also carries the last reading taken with the intake running (the page shows it while the fan is off).
      const dp = { ...db.getFilterSensor(id), lastRunning: lastCounted(db, db.getRoom(id), Date.now()) };
      return send(res, 200, [...sensors, db.getMeter(id), dp]);
    }
    if (req.method === 'GET') {
      const room = db.getRoom(id);
      if (!room) throw noRoom();
      return send(res, 200, room);
    }
    if (req.method === 'PUT') {
      const before = db.getRoom(id);
      if (!before) throw noRoom();
      const room = await readRoom(req, before);
      // A running dehumidifier taken out of the room is switched off first: afterwards nothing may command it.
      if (before.dehumidifier && room.dehumidifier === false && machines && db.getCommands(id)?.relay.dehumidifier) {
        try {
          await machines.command(id, 'dehumidifier', { on: false }, { bypassAuto: true });
        } catch {
          // the command is saved even when the write fails; the room is updated anyway
        }
      }
      const updated = db.updateRoom(id, room);
      publishRoom(id, 'room');
      return send(res, 200, updated);
    }
    if (req.method === 'DELETE') {
      if (!db.deleteRoom(id)) throw noRoom();
      machines?.forget(id);
      controller?.forget(id);
      simulations?.forgetRoom(id);
      publishRoom(id, 'room');
      res.writeHead(204);
      return res.end();
    }
    throw notFound();
  }

  return async function api(req, res, url) {
    try {
      await route(req, res, url.pathname, url);
    } catch (err) {
      if (err instanceof HttpError || err instanceof CommandError) {
        send(res, err.status, err.field ? { error: err.message, field: err.field } : { error: err.message });
      } else if (err instanceof NameTakenError) {
        send(res, 409, { error: err.message, field: 'name' });
      } else if (err instanceof AddressTakenError) {
        send(res, 409, { error: err.message, field: err.field });
      } else if (err.code === 'ECONNRESET') {
        // The client hung up mid-body: nothing to answer, not a server bug.
      } else {
        console.error(err);
        send(res, 500, { error: 'Something went wrong' });
      }
    }
  };
}
