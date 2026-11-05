// The task routes (spec 2026-10-30-tasks-design.md section 6), called from api.js: GET and POST /api/rooms/:id/tasks,
// GET /api/rooms/:id/tasks/log and /log.csv, GET /api/tasks/today, POST /api/tasks/:id/done|skip|cancel|undo, GET and PUT
// /api/workers and /api/task-rules. server/tasks.js makes and closes the rows; this checks what the pages send.

import { DAILY_RULES, CLEAR_OUT, UPKEEP_RULES, SLOTS } from './task-rules.js';
import { MAX_TEXT, MAX_NAME } from './tasks.js';
import { checkRange } from './calendar.js';

const ROOM_TASKS = /^\/api\/rooms\/([1-9][0-9]{0,14})\/tasks$/;
const TASK_ACTION = /^\/api\/tasks\/([1-9][0-9]{0,14})\/(done|skip|cancel|undo)$/;
const ROOM_LOG = /^\/api\/rooms\/([1-9][0-9]{0,14})\/tasks\/log(\.csv)?$/;
// Before the CSV, so Excel on Windows reads it as UTF-8 (the → and m³ of Plan this rows).
const BOM = '\uFEFF';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const trimmed = (v) => (typeof v === 'string' ? v.trim() : '');

// The Content-Disposition of a download. A header holds Latin-1 only: a name with anything outside printable ASCII (or a
// quote, backslash or %, which a browser may decode) gets an ASCII stand-in plus the exact name as UTF-8 (RFC 6266 / 5987;
// a lone surrogate goes as U+FFFD, which encodeURIComponent would refuse).
export function attachment(filename) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  if (ascii === filename) return `attachment; filename="${filename}"`;
  const utf8 = encodeURIComponent(filename.toWellFormed()).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

// PUT /api/workers: { workers: [{ id?, name, active? }] } or the bare list → [{ id|null, name, active }]. existing: the stored
// workers (an id must be one of theirs, once). Names are kept trimmed, must differ, case aside, and hold no control characters
// (db.setWorkers parks a kept name as U+0001 and the id during a swap). Removed workers are left out or sent as active false.
function readWorkers(body, existing, HttpError) {
  const bad = (message, field) => new HttpError(400, message, field);
  const list = Array.isArray(body) ? body : isObject(body) ? body.workers : undefined;
  if (!Array.isArray(list)) throw bad('Workers must be a list', 'workers');
  const ids = new Set(existing.map((w) => w.id));
  const usedIds = new Set();
  const names = new Set();
  return list.map((w, i) => {
    if (!isObject(w)) throw bad('Each worker must be an object with a name', `workers.${i}`);
    let id = null;
    if (w.id !== undefined && w.id !== null) {
      if (!ids.has(w.id)) throw bad('Unknown worker', `workers.${i}.id`);
      if (usedIds.has(w.id)) throw bad('A worker is on the list twice', `workers.${i}.id`);
      usedIds.add(w.id);
      id = w.id;
    }
    const name = trimmed(w.name);
    if (name === '') throw bad('Type a name', `workers.${i}.name`);
    if (name.length > MAX_NAME) throw bad(`The name must be at most ${MAX_NAME} characters`, `workers.${i}.name`);
    if (/[\u0000-\u001f\u007f]/.test(name)) throw bad('A name cannot hold control characters', `workers.${i}.name`);
    if (names.has(name.toLowerCase())) throw bad(`A worker called "${name}" already exists`, `workers.${i}.name`);
    names.add(name.toLowerCase());
    const active = w.active ?? true;
    if (typeof active !== 'boolean') throw bad('Active must be true or false', `workers.${i}.active`);
    return { id, name, active };
  });
}

// The built-in rules in the Settings card's order (daily, the done program's, upkeep), each once.
const BUILTIN = [...new Map([...DAILY_RULES, CLEAR_OUT, ...UPKEEP_RULES].map((r) => [r.key, r])).values()];
const BUILTIN_BY_KEY = new Map(BUILTIN.map((r) => [r.key, r]));
const INTERVAL_MAX = 365;
const INTERVAL_ERROR = `Interval must be a whole number from 1 to ${INTERVAL_MAX} days`;
const CUSTOM_INTERVAL_ERROR = `Interval must be daily or a whole number from 1 to ${INTERVAL_MAX} days`;
const ROOMS_ERROR = "Rooms must be every room, or one or more of this farm's rooms";
const SLOT_ERROR = `Time of day must be ${SLOTS.slice(0, -1).join(', ')} or ${SLOTS.at(-1)}`;
const isInterval = (v) => Number.isInteger(v) && v >= 1 && v <= INTERVAL_MAX;

// GET /api/task-rules: every built-in rule with the owner's on/off and interval, and the owner's own rules.
// stored: db.taskRuleSettings(); custom: db.customTaskRules().
function rulesView(stored, custom) {
  const byKey = new Map(stored.map((s) => [s.key, s]));
  const builtin = BUILTIN.map((rule) => {
    const s = byKey.get(rule.key);
    return {
      key: rule.key, kind: rule.kind, text: rule.text,
      families: rule.families ?? null, stages: rule.stages ?? null, when: rule.when ?? null, slot: rule.slot ?? 'any',
      everyDays: rule.kind === 'upkeep' ? s?.everyDays ?? rule.everyDays : null,
      enabled: s?.enabled ?? true,
    };
  });
  return { builtin, custom };
}

// PUT /api/task-rules: { builtin?: [{ key, enabled?, everyDays? }], custom?: [{ id?, text, rooms, everyDays, slot, enabled }] }
// → { settings: one entry per built-in key (the stored ones kept where the body says nothing) | null, custom: the new list | null }.
// stored: db.taskRuleSettings(); customIds: the stored own rules' ids; roomIds: the farm's room ids (an own rule's rooms are
// null for every room or a non-empty list of them: deleteRoom removes a rule whose last room goes).
function readRules(body, { stored, customIds, roomIds }, HttpError) {
  const bad = (message, field) => new HttpError(400, message, field);
  if (!isObject(body)) throw bad('Body must be a JSON object');
  let settings = null;
  if (body.builtin !== undefined) {
    if (!Array.isArray(body.builtin)) throw bad('Built-in rules must be a list', 'builtin');
    const byKey = new Map(stored.map((s) => [s.key, s]));
    const next = new Map(BUILTIN.map((r) => [r.key, { key: r.key, enabled: byKey.get(r.key)?.enabled ?? true, everyDays: byKey.get(r.key)?.everyDays ?? null }]));
    const seen = new Set();
    body.builtin.forEach((entry, i) => {
      if (!isObject(entry)) throw bad('Each rule must be an object', `builtin.${i}`);
      const rule = typeof entry.key === 'string' ? BUILTIN_BY_KEY.get(entry.key) : undefined;
      if (!rule) throw bad(`Unknown rule ${JSON.stringify(entry.key ?? null)}`, 'builtin');
      if (seen.has(rule.key)) throw bad('A rule is on the list twice', 'builtin');
      seen.add(rule.key);
      const s = next.get(rule.key);
      if (entry.enabled !== undefined) {
        if (typeof entry.enabled !== 'boolean') throw bad('On must be true or false', `builtin.${rule.key}.enabled`);
        s.enabled = entry.enabled;
      }
      if (rule.kind === 'upkeep' && entry.everyDays !== undefined) { // a daily rule's interval is ignored
        if (entry.everyDays !== null && !isInterval(entry.everyDays)) throw bad(INTERVAL_ERROR, `builtin.${rule.key}.everyDays`);
        s.everyDays = entry.everyDays === rule.everyDays ? null : entry.everyDays; // the default: none stored, so it follows the default
      }
    });
    settings = [...next.values()];
  }
  let custom = null;
  if (body.custom !== undefined) {
    if (!Array.isArray(body.custom)) throw bad('Your own rules must be a list', 'custom');
    const usedIds = new Set();
    custom = body.custom.map((c, i) => {
      const at = (field) => `custom.${i}.${field}`;
      if (!isObject(c)) throw bad('Each rule must be an object', `custom.${i}`);
      let id = null;
      if (c.id !== undefined && c.id !== null) {
        if (!customIds.has(c.id)) throw bad('Unknown rule', at('id'));
        if (usedIds.has(c.id)) throw bad('A rule is on the list twice', at('id'));
        usedIds.add(c.id);
        id = c.id;
      }
      const text = trimmed(c.text);
      if (text === '' || text.length > MAX_TEXT) throw bad(`Say what to do (1 to ${MAX_TEXT} characters)`, at('text'));
      const rooms = c.rooms ?? null;
      if (rooms !== null && !(Array.isArray(rooms) && rooms.length > 0 && rooms.every((r) => roomIds.has(r)) && new Set(rooms).size === rooms.length)) {
        throw bad(ROOMS_ERROR, at('rooms'));
      }
      const everyDays = c.everyDays ?? null;
      if (everyDays !== null && !isInterval(everyDays)) throw bad(CUSTOM_INTERVAL_ERROR, at('everyDays'));
      const slot = c.slot ?? 'any';
      if (!SLOTS.includes(slot)) throw bad(SLOT_ERROR, at('slot'));
      const enabled = c.enabled ?? true;
      if (typeof enabled !== 'boolean') throw bad('On must be true or false', at('enabled'));
      return { id, text, rooms, everyDays, slot, enabled };
    });
  }
  return { settings, custom };
}

// db: the farm database; tasks: from createTasks (server/tasks.js), whose views make the day's rows first.
// → async (req, res, path, { send, readJson, HttpError, url }) that answers true when the path is one of its routes.
export function createTaskRoutes({ db, tasks, cropOf = () => null }) {
  async function route(req, res, path, { send, readJson, HttpError, url }) {
    const notFound = () => new HttpError(404, 'Not found');
    const readBody = async () => {
      const body = await readJson(req);
      if (!isObject(body)) throw new HttpError(400, 'Body must be a JSON object');
      return body;
    };

    // The calendar (spec 2026-11-03-calendar-design.md 4): the days from–to, every room or one, each room with its crop.
    if (path === '/api/calendar') {
      if (req.method !== 'GET') throw notFound();
      const q = url.searchParams;
      const bad = checkRange(q.get('from'), q.get('to'));
      if (bad) throw new HttpError(400, bad.error, bad.field);
      const room = q.get('room');
      if (room !== null && !/^[1-9][0-9]{0,14}$/.test(room)) throw new HttpError(400, 'room must be a room id', 'room');
      const view = tasks.calendarView({ from: q.get('from'), to: q.get('to'), roomId: room === null ? null : Number(room) });
      if (!view) throw new HttpError(404, 'Room not found');
      for (const r of view.rooms) r.crop = cropOf(r.id);
      send(res, 200, view);
      return true;
    }

    if (path === '/api/tasks/today') {
      if (req.method !== 'GET') throw notFound();
      const view = tasks.todayView();
      for (const room of view.rooms) room.crop = cropOf(room.id); // its picture and crop line (spec 2026-11-03-pictures-design.md 4)
      send(res, 200, view);
      return true;
    }
    const roomTasks = ROOM_TASKS.exec(path);
    if (roomTasks) {
      const id = Number(roomTasks[1]);
      if (req.method === 'GET') {
        const view = tasks.roomView(id);
        if (!view) throw new HttpError(404, 'Room not found');
        view.crop = cropOf(id); // for the harvest pictures (spec 2026-11-03-pictures-design.md 4)
        send(res, 200, view);
        return true;
      }
      if (req.method !== 'POST') throw notFound();
      // An own task { text, note? } or Plan this { suggestion }: server/tasks.js checks both and the room (404).
      const body = await readBody();
      // replaced: the open plans of the same machines to another size, cancelled by this one (an own task replaces none).
      send(res, 201, 'suggestion' in body ? tasks.addFromSuggestion(id, body.suggestion) : { rows: [tasks.addLongterm(id, body)], replaced: [] });
      return true;
    }
    const action = TASK_ACTION.exec(path);
    if (action) {
      if (req.method !== 'POST') throw notFound();
      // Done { worker, amount? }, Skip { worker, reason }, Cancel { reason }: server/tasks.js checks them, the row (404),
      // that it is still open (409 with who and when) and that the action fits its kind. Undo takes no body.
      const id = Number(action[1]);
      send(res, 200, action[2] === 'undo' ? tasks.undo(id) : tasks[action[2]](id, await readBody()));
      return true;
    }
    const log = ROOM_LOG.exec(path);
    if (log) {
      if (req.method !== 'GET') throw notFound();
      const room = db.getRoom(Number(log[1]));
      if (!room) throw new HttpError(404, 'Room not found');
      if (log[2]) {
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': attachment(`${room.name} tasks.csv`) });
        res.end(BOM + tasks.logCsv(room.id));
        return true;
      }
      // (the page no longer reads this JSON since the grid took the Log's place, 2026-11-04; the CSV above it does)
      // ?before=<id>: the page older than that row; left out or empty: the newest page.
      const before = url.searchParams.get('before') || null;
      if (before !== null && !/^[1-9][0-9]{0,14}$/.test(before)) throw new HttpError(400, 'before must be a task id', 'before');
      send(res, 200, { rows: tasks.log(room.id, { before: before && Number(before) }) });
      return true;
    }
    if (path === '/api/workers') {
      if (req.method === 'GET') {
        send(res, 200, { workers: db.listWorkers() });
        return true;
      }
      if (req.method !== 'PUT') throw notFound();
      // The whole list: done rows keep the name they were done by (text), so a rename or removal leaves the log as it was.
      db.setWorkers(readWorkers(await readJson(req), db.listWorkers(), HttpError));
      send(res, 200, { workers: db.listWorkers() });
      return true;
    }
    if (path === '/api/task-rules') {
      if (req.method === 'GET') {
        send(res, 200, rulesView(db.taskRuleSettings(), db.customTaskRules()));
        return true;
      }
      if (req.method !== 'PUT') throw notFound();
      const body = await readJson(req); // first: the rules as they are once the body has come, not before a slow upload
      const before = { settings: db.taskRuleSettings(), custom: db.customTaskRules() };
      const { settings, custom } = readRules(body, {
        stored: before.settings,
        customIds: new Set(before.custom.map((c) => c.id)),
        roomIds: new Set(db.listRooms().map((r) => r.id)),
      }, HttpError);
      const saved = db.setTaskRules({ settings, custom }); // both lists or neither
      // Today's rows follow at once (on the tasks module's clock): a new interval re-dates the open upkeep rows, a rule
      // turned on or added makes its rows; a built-in rule turned off keeps its rows; an own rule removed has its open rows
      // cancelled.
      tasks.rulesSaved(before);
      send(res, 200, rulesView(saved.settings, saved.custom));
      return true;
    }
    return false;
  }

  // A 4xx thrown by server/tasks.js (TaskError) or by a body check here (status, message, maybe field) becomes the API's
  // HttpError.
  return async function taskRoutes(req, res, path, helpers) {
    try {
      return await route(req, res, path, helpers);
    } catch (err) {
      const { HttpError } = helpers;
      if (!(err instanceof HttpError) && Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
        throw new HttpError(err.status, err.message, err.field);
      }
      throw err;
    }
  };
}
