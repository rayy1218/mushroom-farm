// Live updates (spec 2026-10-26-live-alarms-outdoor-design.md section 3): the GET /api/events stream, and the places that
// publish the farm's change events (section 2) that no route or job publishes itself.
//   createSse({ events, check }) → { handler(req, res), clients(), close() }
//   createLive({ db, events, machines, controller }) → { afterCycle() }: after each poll cycle and the controller's run
//   alarmCount(db) · watchAlarms(db, events) → unsubscribe

export const PING_MS = 25_000;
export const MAX_CLIENTS = 20;
export const MAX_PER_SESSION = 3; // one sign-in must not take every place (a phone and a computer, with a tab to spare)
export const MAX_PER_PERSON = 6; // nor one person over several sign-ins (each sign-in counts against the address limit only)
export const OWNER_RESERVE = 4; // the last places are an owner's: workers together cannot shut the owner out
export const MAX_BACKLOG = 64 * 1024; // bytes waiting for a client that does not read: it is dropped (the browser reconnects)
const KEEPALIVE_MS = 30_000;

// The farm's active alarms nobody has acknowledged: the number on the nav badge.
export function alarmCount(db) {
  return db.currentAlarms().filter((a) => a.clearedAt === null && a.ackedAt === null).length;
}

// Publishes alarms { count } after every alarm change.
export function watchAlarms(db, events) {
  return db.onAlarmChange(() => events.publish('alarms', { count: alarmCount(db) }));
}

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};

// The event stream. check(req) → true while the request's sign-in still holds (app.js: auth.alive, the session there, not
// expired, its worker active, its role the one it opened with); asked at every ping, and false (or a throw, logged) ends
// the stream, so a sign-in that ended is noticed up to one ping late (25 s). The browser's reconnect then meets the gate's
// 401. With sign-in on, the gate's req.who counts the streams of each sign-in (sessionId) and person (id), and keeps
// OWNER_RESERVE places from anyone not an owner; the 429s come before the 503. Without sign-in (no check, no req.who)
// none of it applies. pingMs and maxClients are only replaced by tests.
export function createSse({ events, pingMs = PING_MS, maxClients = MAX_CLIENTS, check = null, now = Date.now, log = console.error }) {
  const open = new Set(); // { res, off, ping, session, person }
  const perSession = new Map(); // session id → its open streams
  const perPerson = new Map(); // worker id → their open streams
  const count = (map, key, by) => {
    if (key === null) return;
    const n = (map.get(key) ?? 0) + by;
    if (n > 0) map.set(key, n);
    else map.delete(key);
  };

  function handler(req, res) {
    if (req.method !== 'GET') return json(res, 404, { error: 'Not found' });
    const session = req.who?.sessionId ?? null;
    const person = req.who?.id ?? null;
    if (session !== null && (perSession.get(session) ?? 0) >= MAX_PER_SESSION) {
      return json(res, 429, { error: 'Too many live connections for this sign-in' });
    }
    if (person !== null && (perPerson.get(person) ?? 0) >= MAX_PER_PERSON) {
      return json(res, 429, { error: 'Too many live connections for this person' });
    }
    const places = req.who && req.who.role !== 'owner' ? maxClients - OWNER_RESERVE : maxClients;
    if (open.size >= places) return json(res, 503, { error: 'Too many live connections' });
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive?.(true, KEEPALIVE_MS); // a phone that went away is noticed
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // a proxy in front must not hold the events back
    });
    res.flushHeaders();
    const client = { res, off: null, ping: null, session, person };
    open.add(client);
    count(perSession, session, 1);
    count(perPerson, person, 1);
    const write = (text) => {
      res.write(text);
      if (res.writableLength > MAX_BACKLOG) res.destroy(); // a client that does not read must not fill the memory
    };
    write(`event: hello\ndata: ${JSON.stringify({ at: now() })}\n\n`);
    client.off = events.subscribe((type, data) => write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
    client.ping = setInterval(() => {
      let holds = true;
      try {
        holds = !check || check(req);
      } catch (err) {
        log(err);
        holds = false; // a check that cannot answer does not keep the stream
      }
      if (!holds) {
        drop(client);
        res.end();
        return;
      }
      write(': ping\n\n');
    }, pingMs);
    res.on('close', () => drop(client));
  }

  function drop(client) {
    clearInterval(client.ping);
    client.off?.();
    if (!open.delete(client)) return;
    count(perSession, client.session, -1);
    count(perPerson, client.person, -1);
  }

  return {
    handler,
    clients: () => open.size,
    // Ends every stream (shutdown, tests).
    close() {
      for (const client of [...open]) {
        drop(client);
        client.res.end();
      }
    },
  };
}

// Publishes what changes without a route: room readings for every room with a device (after each cycle), and the
// machines, control and crop of a room when what they show changed since the last cycle (the controller sends machine
// commands itself, and the program moves the stage). The first cycle only takes note.
export function createLive({ db, events, machines = null, controller = null, log = console.error }) {
  const seen = new Map(); // `${part}/${roomId}` → the last view as text

  function changed(part, roomId, view) {
    const key = `${part}/${roomId}`;
    const text = JSON.stringify(view);
    const was = seen.get(key);
    seen.set(key, text);
    return was !== undefined && was !== text;
  }

  return {
    afterCycle() {
      // A live update must never break the control loop, and one room's failure must not hide the others.
      let rooms = [];
      try {
        rooms = db.listRooms();
        const live = new Set(rooms.map((r) => r.id));
        for (const key of seen.keys()) if (!live.has(Number(key.slice(key.indexOf('/') + 1)))) seen.delete(key);
      } catch (err) {
        log(err);
      }
      for (const room of rooms) {
        try {
          const { id } = room;
          if (room.trhAddress !== null || room.co2Address !== null || room.relayAddress !== null
            || room.acAddress !== null || room.meterAddress !== null || room.dpAddress !== null) events.publish('room', { id, part: 'readings' });
          if (machines && changed('machines', id, machines.get(id))) events.publish('room', { id, part: 'machines' });
          if (controller && changed('control', id, controller.get(id))) events.publish('room', { id, part: 'control' });
          if (changed('crop', id, db.getProgram(id))) events.publish('room', { id, part: 'crop' });
        } catch (err) {
          log(err);
        }
      }
      try {
        if (db.outdoorAddress() !== null) events.publish('outdoor', {});
      } catch (err) {
        log(err);
      }
    },
  };
}
