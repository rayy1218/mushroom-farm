// Live updates (spec 2026-10-26-live-alarms-outdoor-design.md section 3): the GET /api/events stream, and the places that
// publish the farm's change events (section 2) that no route or job publishes itself.
//   createSse({ events }) → { handler(req, res), clients(), close() }
//   createLive({ db, events, machines, controller }) → { afterCycle() }: after each poll cycle and the controller's run
//   alarmCount(db) · watchAlarms(db, events) → unsubscribe

export const PING_MS = 25_000;
export const MAX_CLIENTS = 20;

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

// The event stream. pingMs and maxClients are only replaced by tests.
export function createSse({ events, pingMs = PING_MS, maxClients = MAX_CLIENTS, now = Date.now }) {
  const open = new Set(); // { res, off, ping }

  function handler(req, res) {
    if (req.method !== 'GET') return json(res, 404, { error: 'Not found' });
    if (open.size >= maxClients) return json(res, 503, { error: 'Too many live connections' });
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // a proxy in front must not hold the events back
    });
    res.flushHeaders();
    const client = { res, off: null, ping: null };
    open.add(client);
    res.write(`event: hello\ndata: ${JSON.stringify({ at: now() })}\n\n`);
    client.off = events.subscribe((type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
    client.ping = setInterval(() => res.write(': ping\n\n'), pingMs);
    res.on('close', () => drop(client));
  }

  function drop(client) {
    clearInterval(client.ping);
    client.off?.();
    open.delete(client);
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
      try {
        const rooms = db.listRooms();
        const live = new Set(rooms.map((r) => r.id));
        for (const key of seen.keys()) if (!live.has(Number(key.slice(key.indexOf('/') + 1)))) seen.delete(key);
        const wired = rooms.filter((r) => r.trhAddress !== null || r.co2Address !== null || r.relayAddress !== null
          || r.acAddress !== null || r.meterAddress !== null || r.dpAddress !== null);
        for (const { id } of wired) events.publish('room', { id, part: 'readings' });
        for (const { id } of rooms) {
          if (machines && changed('machines', id, machines.get(id))) events.publish('room', { id, part: 'machines' });
          if (controller && changed('control', id, controller.get(id))) events.publish('room', { id, part: 'control' });
          if (changed('crop', id, db.getProgram(id))) events.publish('room', { id, part: 'crop' });
        }
        if (db.outdoorAddress() !== null) events.publish('outdoor', {});
      } catch (err) {
        log(err); // a live update must never break the control loop
      }
    },
  };
}
