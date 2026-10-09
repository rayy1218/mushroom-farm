// server/api.js: HTTP API (C3) and live feed (C4). createApi(opts) -> { handle, close }.
'use strict';
const { serveStatic } = require('./static.js');
const { HttpError } = require('./api-common.js');
require('../sim.js');
require('../air.js');
require('../controller.js');
require('../runtime.js');
require('../calib.js');
require('../capacity.js');
require('../cycle.js');
require('../equipment.js');
require('../room-rules.js');

const RULES = globalThis.ClimateRoomRules;
const BODY_LIMIT = 1048576;
const BIG_BODY_LIMIT = 8388608;
const ID_RE = /^[1-9][0-9]{0,14}$/;
const QUERY_INT_RE = /^[0-9]{1,15}$/;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendError(res, status, error, details = []) {
  sendJson(res, status, { error, details });
}

function splitApiPath(rawPath) {
  const parts = rawPath.split('/');
  parts.shift(); // drop the leading '' produced by the initial '/'
  if (parts.some(s => s === '')) return null;
  return parts;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let tooLarge = false;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > limit) { tooLarge = true; return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve({ buffer: tooLarge ? null : Buffer.concat(chunks), tooLarge }));
    req.on('error', reject);
  });
}

function drainBody(req) {
  return new Promise((resolve, reject) => {
    req.on('end', resolve);
    req.on('error', reject);
    req.resume();
  });
}

function parseJsonBody(buffer) {
  return JSON.parse(buffer.toString('utf8'), (k, v) => (k === '__proto__' ? undefined : v));
}

function getQueryInt(qp, name) {
  if (!qp.has(name)) return undefined;
  const raw = qp.get(name);
  if (!QUERY_INT_RE.test(raw)) throw new HttpError(400, 'Invalid query', [`${name}: must be an integer from 0`]);
  return Number(raw);
}

function mapError(err) {
  if (err && err.code === 'NOT_FOUND') {
    if (err.what === 'settings') return { status: 404, error: 'Unknown settings version', details: [] };
    if (err.what === 'calibration') return { status: 404, error: 'Unknown calibration run', details: [] };
    if (err.what === 'simulation') return { status: 404, error: 'Unknown simulation run', details: [] };
    if (err.what === 'batch') return { status: 404, error: 'Unknown batch', details: [] };
    if (err.what === 'crate') return { status: 404, error: 'Unknown crate', details: [] };
    return { status: 404, error: 'Unknown room', details: [] };
  }
  if (err && err.name === 'RoomError') {
    if (err.code === 'not_found') return { status: 404, error: 'Unknown room', details: [] };
    if (err.code === 'bad_input') return { status: 400, error: 'Invalid room', details: err.details || [] };
  }
  if (err instanceof RangeError) {
    return { status: 500, error: 'Server fault', details: [String(err.message)] };
  }
  if (err && err.code === 'ERR_SQLITE_ERROR') {
    const fatal = (err.errcode & 0xff) !== 19;
    return { status: 500, error: 'Server fault', details: [String(err.message)], fatal };
  }
  return { status: 500, error: 'Server fault', details: [String((err && err.message) || err)] };
}

function createApi(opts) {
  const db = opts.db;
  const rooms = opts.rooms;
  const root = opts.root;
  const now = opts.now || (() => Math.floor(Date.now() / 1000));
  const heartbeatMs = opts.heartbeatMs || 15000;
  const onFatal = opts.onFatal || (() => {});

  const connections = new Set();
  let closed = false;

  // ---- live feed (C4) ----

  function writeToConnection(res, text) {
    if (res.destroyed || res.writableEnded) { connections.delete(res); return; }
    try {
      res.write(text);
    } catch {
      connections.delete(res);
      return;
    }
    if (res.writableLength > BODY_LIMIT) {
      connections.delete(res);
      try { res.destroy(); } catch { /* already gone */ }
    }
  }

  function broadcast(name, data) {
    const msg = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of connections) writeToConnection(res, msg);
  }

  function onReadingEvent(payload) { broadcast('reading', payload.live.reading); }
  function onEventEvent(payload) { broadcast('event', payload.event); }
  function onAlarmEvent(payload) { broadcast('alarm', payload.alarm); }
  function onSettingsEvent(payload) {
    broadcast('settings', { ...payload.version, room_id: payload.roomId, settings: payload.settings });
  }
  function onRoomEvent(payload) { broadcast('room', payload.room); }

  const LISTENER_PAIRS = [
    { name: 'reading', fn: onReadingEvent },
    { name: 'event', fn: onEventEvent },
    { name: 'alarm', fn: onAlarmEvent },
    { name: 'settings', fn: onSettingsEvent },
    { name: 'room', fn: onRoomEvent },
  ];
  for (const { name, fn } of LISTENER_PAIRS) rooms.on(name, fn);

  const heartbeatTimer = setInterval(() => {
    for (const res of connections) writeToConnection(res, ': ping\n\n');
  }, heartbeatMs);
  heartbeatTimer.unref();

  function h_stream({ res }) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
    });
    res.write('retry: 3000\n\n');
    connections.add(res);
    res.on('error', () => connections.delete(res));
    res.on('close', () => connections.delete(res));
  }

  // ---- calls that need route-specific error mapping ----

  function callApplySettings(id, settings, note, options) {
    try {
      return options === undefined ? rooms.applySettings(id, settings, note) : rooms.applySettings(id, settings, note, options);
    } catch (err) {
      if (err && err.name === 'RoomError' && err.code === 'bad_input') throw new HttpError(400, 'Invalid settings', err.details || []);
      throw err;
    }
  }

  function callAckAlarm(id, alarmKey) {
    try {
      return rooms.ackAlarm(id, alarmKey);
    } catch (err) {
      if (err && err.name === 'RoomError' && (err.code === 'not_found' || err.code === 'bad_input')) throw new HttpError(404, 'Unknown alarm', []);
      throw err;
    }
  }

  function callRestart(id) {
    try {
      return rooms.restart(id);
    } catch (err) {
      if (err && err.name === 'RoomError' && err.code === 'bad_input') throw new HttpError(404, 'Unknown room', []);
      throw err;
    }
  }

  // ---- route handlers (C3 sections 5, 6, 11) ----

  function h_listRooms({ res }) { sendJson(res, 200, rooms.list()); }

  function h_createRoom({ res, body }) {
    const problems = RULES.checkRoom(body, false);
    if (problems.length) throw new HttpError(400, 'Invalid room', problems);
    const settings = body.settings;
    if (settings !== undefined && !isPlainObject(settings)) throw new HttpError(400, 'Invalid settings', ['settings: must be a plain object']);
    const result = rooms.create({ name: body.name, volume: body.volume, settings });
    sendJson(res, 201, result.room);
  }

  function h_patchRoom({ res, id, body }) {
    const problems = RULES.checkRoom(body, true);
    if (problems.length) throw new HttpError(400, 'Invalid room', problems);
    const changes = {};
    for (const k of ['name', 'volume']) if (Object.hasOwn(body, k)) changes[k] = body[k];
    let result;
    if (Object.keys(changes).length > 0) result = rooms.update(id, changes);
    if (body.archived === true) result = rooms.archive(id);
    sendJson(res, 200, result);
  }

  function h_getSettings({ res, id }) { sendJson(res, 200, db.currentSettings(id).settings); }

  function h_putSettings({ res, id, body }) {
    if (!isPlainObject(body)) throw new HttpError(400, 'Invalid settings', ['body: must be an object']);
    const problems = [];
    for (const k of Object.keys(body)) {
      if (k !== 'settings' && k !== 'note') problems.push(`${k}: unknown field`);
    }
    if (!Object.hasOwn(body, 'settings') || !isPlainObject(body.settings)) problems.push('settings: must be an object');
    if (Object.hasOwn(body, 'note') && body.note !== null) {
      if (typeof body.note !== 'string') problems.push('note: must be a string or null');
      else if (body.note.trim().length > 200) problems.push('note: must be at most 200 characters after trimming');
    }
    if (problems.length) throw new HttpError(400, 'Invalid settings', problems);
    let note;
    if (body.note === undefined || body.note === null) note = undefined;
    else {
      const t = body.note.trim();
      note = t === '' ? undefined : t;
    }
    const result = callApplySettings(id, body.settings, note);
    sendJson(res, 200, { settings: result.settings, warnings: result.warnings });
  }

  function h_settingsHistory({ res, id }) {
    const rows = db.settingsHistory(id).map(v => ({ id: v.id, room_id: id, saved_at: v.saved_at, note: v.note }));
    sendJson(res, 200, rows);
  }

  function h_restoreSettings({ res, id, versionId }) {
    const v = db.getSettingsVersion(id, versionId);
    const result = callApplySettings(id, v.settings, `Restored version ${versionId}`, { exact: true });
    sendJson(res, 200, { settings: result.settings, warnings: result.warnings });
  }

  function h_readings({ res, id, qp }) {
    let to = getQueryInt(qp, 'to');
    let from = getQueryInt(qp, 'from');
    const step = getQueryInt(qp, 'step');
    if (to === undefined) to = now();
    if (from === undefined) from = to - 3600;
    if (from > to) throw new HttpError(400, 'Invalid query', ['from: must be at most to']);
    if (step !== undefined && step > 86400) throw new HttpError(400, 'Invalid query', ['step: must be at most 86400']);
    const range = to - from;
    if (step === undefined || step === 0) {
      if (range > 604800) throw new HttpError(400, 'Invalid query', ['from: range must be at most 604800 seconds without step']);
    } else if (step >= 3600) {
      if (range > 112320000) throw new HttpError(400, 'Invalid query', ['from: range must be at most 112320000 seconds with a step of 3600 or more']);
    } else if (range > 2678400) {
      throw new HttpError(400, 'Invalid query', ['from: range must be at most 2678400 seconds with a step under 3600']);
    }
    const rows = db.queryReadings(id, { from, to, step: step || null });
    sendJson(res, 200, rows);
  }

  function h_events({ res, id, qp }) {
    let limit = getQueryInt(qp, 'limit');
    const before = getQueryInt(qp, 'before');
    if (limit === undefined) limit = 100;
    if (limit < 1 || limit > 500) throw new HttpError(400, 'Invalid query', ['limit: must be an integer from 1 to 500']);
    if (before !== undefined && before < 1) throw new HttpError(400, 'Invalid query', ['before: must be an integer from 1']);
    const rows = db.listEvents(id, { limit, before: before ?? null });
    sendJson(res, 200, rows);
  }

  function h_alarms({ res, id }) { sendJson(res, 200, db.listAlarms(id, { recent: 20 })); }

  function h_ackAlarm({ res, id, alarmKey }) {
    const row = callAckAlarm(id, alarmKey);
    sendJson(res, 200, row);
  }

  function h_listCalibrations({ res, id }) {
    const current = db.currentCalibration(id);
    const rows = db.listCalibrations(id).map(r => ({ ...r, applied: current !== null && r.id === current.id }));
    sendJson(res, 200, rows);
  }

  function h_saveCalibration({ res, id, body }) {
    const problems = RULES.checkCalibration(body, now());
    if (problems.length) throw new HttpError(400, 'Invalid calibration', problems);
    const row = db.saveCalibration(id, body);
    sendJson(res, 201, { ...row, applied: false });
  }

  function h_applyCalibration({ res, id, runId }) {
    const run = db.applyCalibration(id, runId);
    callRestart(id);
    sendJson(res, 200, { ...run, applied: true });
  }

  function h_getMix({ res, id }) { sendJson(res, 200, db.getMix(id)); }

  function h_putMix({ res, id, body }) {
    const problems = RULES.checkMix(body);
    if (problems.length) throw new HttpError(400, 'Invalid crop mix', problems);
    const rows = db.replaceMix(id, body);
    sendJson(res, 200, rows);
  }

  function h_getCapacity({ res, id }) {
    const report = db.latestCapacityReport(id);
    if (report === null) throw new HttpError(404, 'No capacity report', []);
    sendJson(res, 200, report);
  }

  function h_postCapacity({ res, id, body }) {
    const problems = RULES.checkReport(body);
    if (problems.length) throw new HttpError(400, 'Invalid capacity report', problems);
    const row = db.saveCapacityReport(id, { report: body });
    sendJson(res, 201, row);
  }

  function h_restart({ res, id }) {
    const room = callRestart(id);
    sendJson(res, 200, room);
  }

  // ---- simulation runs and equipment (C3 6.20-6.26) ----

  function trimNote(note) {
    if (note === undefined || note === null) return null;
    const t = note.trim();
    return t === '' ? null : t;
  }

  function withoutResult(run) {
    const { result, ...info } = run;
    return info;
  }

  function h_listSimulations({ res, id, qp }) {
    let limit = getQueryInt(qp, 'limit');
    const before = getQueryInt(qp, 'before');
    if (limit === undefined) limit = 50;
    if (limit < 1 || limit > 200) throw new HttpError(400, 'Invalid query', ['limit: must be an integer from 1 to 200']);
    if (before !== undefined && before < 1) throw new HttpError(400, 'Invalid query', ['before: must be an integer from 1']);
    sendJson(res, 200, db.listSimulationRuns(id, { limit, before: before ?? null }));
  }

  function h_createSimulation({ res, id, body }) {
    const problems = RULES.checkSimulationRun(body, now());
    if (problems.length) throw new HttpError(400, 'Invalid simulation run', problems);
    const run = db.saveSimulationRun(id, { kind: body.kind, inputs: body.inputs, result: body.result, note: trimNote(body.note) });
    sendJson(res, 201, withoutResult(run));
  }

  function h_getSimulation({ res, id, runId }) { sendJson(res, 200, db.getSimulationRun(id, runId)); }

  function h_patchSimulation({ res, id, runId, body }) {
    const problems = RULES.checkRunPatch(body, now());
    if (problems.length) throw new HttpError(400, 'Invalid simulation run', problems);
    const changes = {};
    if (Object.hasOwn(body, 'note')) changes.note = trimNote(body.note);
    if (Object.hasOwn(body, 'real_start')) changes.real_start = body.real_start;
    sendJson(res, 200, withoutResult(db.updateSimulationRun(id, runId, changes)));
  }

  function h_deleteSimulation({ res, id, runId }) { sendJson(res, 200, withoutResult(db.deleteSimulationRun(id, runId))); }

  function h_getEquipment({ res, id }) { sendJson(res, 200, db.getEquipment(id)); }

  function h_putEquipment({ res, id, body }) {
    const problems = RULES.checkEquipmentBody(body);
    if (problems.length) throw new HttpError(400, 'Invalid equipment', problems);
    const saved = db.saveEquipment(id, body);
    const cur = db.currentSettings(id).settings;
    if (cur.airM3h !== body.air_m3h) {
      try {
        rooms.applySettings(id, { airM3h: body.air_m3h }, 'Air exchange size from Your machines');
      } catch (err) {
        // a bad_input here is a bug (the body passed checkEquipment): 500, not 400 (C3 4.1)
        if (err && err.name === 'RoomError' && err.code === 'bad_input') throw new Error(`applySettings rejected airM3h: ${(err.details || []).join('; ')}`);
        throw err;
      }
    }
    sendJson(res, 200, saved);
  }

  const ROUTES = [
    { method: 'GET', segs: ['api', 'rooms'], needsRoom: false, hasBody: false, handler: h_listRooms },
    { method: 'POST', segs: ['api', 'rooms'], needsRoom: false, hasBody: true, handler: h_createRoom },
    { method: 'PATCH', segs: ['api', 'rooms', ':id'], needsRoom: true, hasBody: true, handler: h_patchRoom },
    { method: 'GET', segs: ['api', 'rooms', ':id', 'settings'], needsRoom: true, hasBody: false, handler: h_getSettings },
    { method: 'PUT', segs: ['api', 'rooms', ':id', 'settings'], needsRoom: true, hasBody: true, handler: h_putSettings },
    { method: 'GET', segs: ['api', 'rooms', ':id', 'settings', 'history'], needsRoom: true, hasBody: false, handler: h_settingsHistory },
    { method: 'POST', segs: ['api', 'rooms', ':id', 'settings', 'restore', ':versionId'], needsRoom: true, hasBody: false, handler: h_restoreSettings },
    { method: 'GET', segs: ['api', 'rooms', ':id', 'readings'], needsRoom: true, hasBody: false, handler: h_readings },
    { method: 'GET', segs: ['api', 'rooms', ':id', 'events'], needsRoom: true, hasBody: false, handler: h_events },
    { method: 'GET', segs: ['api', 'rooms', ':id', 'alarms'], needsRoom: true, hasBody: false, handler: h_alarms },
    { method: 'POST', segs: ['api', 'rooms', ':id', 'alarms', ':alarmKey', 'ack'], needsRoom: true, hasBody: false, handler: h_ackAlarm },
    { method: 'GET', segs: ['api', 'rooms', ':id', 'calibrations'], needsRoom: true, hasBody: false, handler: h_listCalibrations },
    { method: 'POST', segs: ['api', 'rooms', ':id', 'calibrations'], needsRoom: true, hasBody: true, handler: h_saveCalibration },
    { method: 'POST', segs: ['api', 'rooms', ':id', 'calibrations', ':runId', 'apply'], needsRoom: true, hasBody: false, handler: h_applyCalibration },
    { method: 'GET', segs: ['api', 'rooms', ':id', 'mix'], needsRoom: true, hasBody: false, handler: h_getMix },
    { method: 'PUT', segs: ['api', 'rooms', ':id', 'mix'], needsRoom: true, hasBody: true, handler: h_putMix },
    { method: 'GET', segs: ['api', 'rooms', ':id', 'capacity'], needsRoom: true, hasBody: false, handler: h_getCapacity },
    { method: 'POST', segs: ['api', 'rooms', ':id', 'capacity'], needsRoom: true, hasBody: true, handler: h_postCapacity },
    { method: 'POST', segs: ['api', 'rooms', ':id', 'restart'], needsRoom: true, hasBody: false, handler: h_restart },
    { method: 'GET', segs: ['api', 'rooms', ':id', 'simulations'], needsRoom: true, hasBody: false, handler: h_listSimulations },
    { method: 'POST', segs: ['api', 'rooms', ':id', 'simulations'], needsRoom: true, hasBody: true, bodyLimit: BIG_BODY_LIMIT, handler: h_createSimulation },
    { method: 'GET', segs: ['api', 'rooms', ':id', 'simulations', ':runId'], needsRoom: true, hasBody: false, runNotFound: 'Unknown simulation run', handler: h_getSimulation },
    { method: 'PATCH', segs: ['api', 'rooms', ':id', 'simulations', ':runId'], needsRoom: true, hasBody: true, runNotFound: 'Unknown simulation run', handler: h_patchSimulation },
    { method: 'DELETE', segs: ['api', 'rooms', ':id', 'simulations', ':runId'], needsRoom: true, hasBody: false, runNotFound: 'Unknown simulation run', handler: h_deleteSimulation },
    { method: 'GET', segs: ['api', 'rooms', ':id', 'equipment'], needsRoom: true, hasBody: false, handler: h_getEquipment },
    { method: 'PUT', segs: ['api', 'rooms', ':id', 'equipment'], needsRoom: true, hasBody: true, handler: h_putEquipment },
  ];

  const STREAM_ROUTE = { method: 'GET', segs: ['api', 'stream'], needsRoom: false, hasBody: false, handler: h_stream };

  // Extra routes (C3 2.1): each one is one more row of the table, with its own run(ctx) in place of a handler.
  // A row with the method and path of the stream is never reached: the C3 stream wins (C3 2.1, match order).
  const EXTRA_ROUTES = (opts.extraRoutes || [])
    .filter(r => !(r.method === 'GET' && r.segs.join('/') === STREAM_ROUTE.segs.join('/')))
    .map(r => ({
      method: r.method, segs: r.segs, needsRoom: !!r.needsRoom, hasBody: !!r.hasBody, extra: true,
      handler: ({ res, id, params, body, qp }) => {
        const out = r.run({ id, params, body, query: qp });
        sendJson(res, out.status, out.body);
      },
    }));
  const ALL_ROUTES = [...ROUTES, STREAM_ROUTE, ...EXTRA_ROUTES]; // lead decision 85: the stream before any extra route

  function matchRoute(method, segments) {
    for (const route of ALL_ROUTES) {
      if (route.method !== method) continue;
      if (route.segs.length !== segments.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.segs.length; i++) {
        const s = route.segs[i];
        if (s.startsWith(':')) params[s.slice(1)] = segments[i];
        else if (s !== segments[i]) { ok = false; break; }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  async function failAndDrain(req, res, status, error, details) {
    await drainBody(req);
    sendError(res, status, error, details);
  }

  async function handleAsync(req, res) {
    const url = req.url || '';
    const qIdx = url.indexOf('?');
    const rawPath = qIdx >= 0 ? url.slice(0, qIdx) : url;
    const queryStr = qIdx >= 0 ? url.slice(qIdx + 1) : '';

    if (!rawPath.startsWith('/api/')) {
      serveStatic(req, res, root);
      return;
    }

    const segments = splitApiPath(rawPath);
    if (!segments) return failAndDrain(req, res, 404, 'Unknown route', []);

    const match = matchRoute(req.method, segments);
    if (!match) return failAndDrain(req, res, 404, 'Unknown route', []);
    const { route, params } = match;

    let room = null, id;
    if (route.needsRoom) {
      if (!ID_RE.test(params.id)) return failAndDrain(req, res, 404, 'Unknown room', []);
      id = Number(params.id);
      try {
        room = db.getRoom(id);
      } catch (err) {
        if (err && err.code === 'NOT_FOUND') return failAndDrain(req, res, 404, 'Unknown room', []);
        throw err;
      }
      if (room.archived_at !== null) return failAndDrain(req, res, 404, 'Unknown room', []);
    }

    // An extra route checks its own path ids after the body is read (C3 2.1, lead decision 64).
    let versionId, runId, alarmKey;
    if (!route.extra) {
      if (params.versionId !== undefined) {
        if (!ID_RE.test(params.versionId)) return failAndDrain(req, res, 404, 'Unknown settings version', []);
        versionId = Number(params.versionId);
      }
      if (params.runId !== undefined) {
        if (!ID_RE.test(params.runId)) return failAndDrain(req, res, 404, route.runNotFound || 'Unknown calibration run', []);
        runId = Number(params.runId);
      }
      if (params.alarmKey !== undefined) {
        try {
          alarmKey = decodeURIComponent(params.alarmKey);
        } catch {
          return failAndDrain(req, res, 404, 'Unknown alarm', []);
        }
      }
    }

    let body;
    if (route.hasBody) {
      const big = route.bodyLimit === BIG_BODY_LIMIT;
      const { buffer, tooLarge } = await readBody(req, route.bodyLimit || BODY_LIMIT);
      if (tooLarge) { sendError(res, 400, big ? 'Body is larger than 8 MB' : 'Body is larger than 1 MB', []); return; }
      try {
        body = parseJsonBody(buffer);
      } catch {
        sendError(res, 400, 'Body is not valid JSON', []);
        return;
      }
    } else {
      await drainBody(req);
    }

    const qp = new URLSearchParams(queryStr);
    await route.handler({ req, res, id, room, params, versionId, runId, alarmKey, body, qp });
  }

  function handleFault(res, err) {
    if (res.writableEnded) { console.error(err); return; }
    if (err instanceof HttpError) {
      sendError(res, err.status, err.error, err.details);
      return;
    }
    const mapped = mapError(err);
    sendError(res, mapped.status, mapped.error, mapped.details);
    if (mapped.status >= 500) console.error(err); // a 404/400 from a known error is an answer, not a fault
    if (mapped.fatal) {
      try { onFatal(err); } catch (e) { console.error(e); }
    }
  }

  function handle(req, res) {
    handleAsync(req, res).catch(err => handleFault(res, err));
  }

  function close() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeatTimer);
    for (const res of connections) {
      if (!res.writableEnded) res.end();
    }
    connections.clear();
    for (const { name, fn } of LISTENER_PAIRS) rooms.off(name, fn);
  }

  return { handle, close };
}

module.exports = { createApi };
