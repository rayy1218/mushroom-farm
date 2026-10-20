// JSON API: /api/settings, /api/alarms, /api/outdoor, /api/usage, /api/rooms, /api/rooms/:id, /api/rooms/:id/sensors, /alarms,
// /control, /machines and /usage.

import { validateRoom } from './rooms.js';
import { NameTakenError, AddressTakenError, HISTORY_BUCKET_S } from './db.js';
import { CommandError } from './machines.js';
import { RELAY_KEYS } from './machine-codes.js';
import { validateSettings, readSettings, writeSettings } from './settings.js';
import { outdoorView, outdoorHistory, RANGES } from './outdoor.js';
import { roomUsage, farmUsage } from './usage.js';
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

const ADDRESS_FIELDS = ['trhAddress', 'co2Address', 'relayAddress', 'acAddress', 'meterAddress'];

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
export function createApi(db, machines = null, controller = null, poller = null, simulations = null) {
  const simulationRoutes = simulations && createSimulationRoutes({ db, simulations });
  // The room body; its addresses must differ from the outdoor sensor's.
  async function readRoom(req) {
    const result = validateRoom(await readJson(req));
    if (result.error) throw new HttpError(400, result.error, result.field);
    const outdoor = db.outdoorAddress();
    const clash = outdoor === null ? undefined : ADDRESS_FIELDS.find((f) => result.room[f] === outdoor);
    if (clash) throw new HttpError(400, `Address ${outdoor} is used by the outdoor sensor`, clash);
    return result.room;
  }

  const prices = () => {
    const { electricityPrice, waterPrice } = readSettings(db);
    return { electricity: electricityPrice, water: waterPrice };
  };

  async function route(req, res, path, url) {
    if (simulationRoutes && await simulationRoutes(req, res, path, { send, readJson, HttpError })) return;
    if (path === '/api/settings') {
      if (req.method === 'GET') return send(res, 200, readSettings(db));
      if (req.method !== 'PUT') throw notFound();
      const result = validateSettings(await readJson(req));
      if (result.error) throw new HttpError(400, result.error, result.field);
      const { outdoorAddress } = result.settings;
      const user = outdoorAddress == null ? undefined : db.listRooms().find((r) => ADDRESS_FIELDS.some((f) => r[f] === outdoorAddress));
      if (user) throw new HttpError(400, `Address ${outdoorAddress} is used by ${user.name}`, 'outdoorAddress');
      writeSettings(db, result.settings);
      const settings = readSettings(db);
      if (result.settings.pollSeconds !== undefined) poller?.setIntervalMs(settings.pollSeconds * 1000);
      return send(res, 200, settings);
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
      if (req.method === 'POST') return send(res, 201, db.createRoom(await readRoom(req)));
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
    const match = /^\/api\/rooms\/([1-9][0-9]{0,14})(\/sensors|\/usage|\/control|\/history|\/machines(?:\/([a-z]+))?)?$/.exec(path);
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
      return send(res, 200, { ...view, auto: db.getControl(id)?.auto ?? false });
    }
    // Stream B: bucketed readings and machine lines for the charts.
    if (match[2] === '/history') {
      if (req.method !== 'GET') throw notFound();
      const hours = /^[0-9]{1,3}$/.test(url.searchParams.get('hours') ?? '') ? Number(url.searchParams.get('hours')) : NaN;
      if (!(hours in HISTORY_BUCKET_S)) throw new HttpError(400, 'hours must be 1, 6, 24, 168 or 720', 'hours');
      const history = db.history(id, hours);
      if (!history) throw noRoom();
      return send(res, 200, { ...history, pollSeconds: readSettings(db).pollSeconds });
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
      return send(res, 200, controller.update(id, await readJson(req)));
    }
    if (match[2] === '/usage') {
      if (req.method !== 'GET') throw notFound();
      const usage = roomUsage(db, id, { days: readDays(url), prices: prices() });
      if (!usage) throw noRoom();
      return send(res, 200, usage);
    }
    if (match[2]) { // /sensors: the two sensors, then the energy meter (kind 'meter')
      if (req.method !== 'GET') throw notFound();
      const sensors = db.getSensors(id);
      if (!sensors) throw noRoom();
      return send(res, 200, [...sensors, db.getMeter(id)]);
    }
    if (req.method === 'GET') {
      const room = db.getRoom(id);
      if (!room) throw noRoom();
      return send(res, 200, room);
    }
    if (req.method === 'PUT') {
      if (!db.getRoom(id)) throw noRoom();
      return send(res, 200, db.updateRoom(id, await readRoom(req)));
    }
    if (req.method === 'DELETE') {
      if (!db.deleteRoom(id)) throw noRoom();
      machines?.forget(id);
      controller?.forget(id);
      simulations?.forgetRoom(id);
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
