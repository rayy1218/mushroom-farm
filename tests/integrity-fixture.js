// Data integrity's tests over HTTP: the farm app with sign-in on a new database, the owner Lim and the worker Aminah signed in,
// a room (Container 4, 500 grey oyster blocks, fruiting). call(method, path, body, who): who 'owner' (default) or 'worker'.

import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createTasks } from '../server/tasks.js';
import { createEvents } from '../server/events.js';
import { hashSecret } from '../server/auth.js';
import { createCropApi } from '../server/crop-api.js';

export async function signedInFarm(t) {
  const db = openDb(':memory:');
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const server = createApp(db, { tasks: createTasks({ db }), events, log: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (method, path, body, cookie) => {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let parsed = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* a CSV */ }
    return { status: res.status, body: parsed, cookie: res.headers.get('set-cookie') };
  };
  db.setWorkers([{ name: 'Aminah', active: true }]);
  const aminah = db.listWorkers()[0].id;
  db.setSecret(aminah, await hashSecret('482915'));
  const lim = db.setOwner('Lim', await hashSecret('a long enough password'));
  const signIn = async (id, secret) => /^farm_session=[^;]+/.exec((await send('POST', '/api/login', { id, secret })).cookie)[0];
  const cookies = { owner: await signIn(lim, 'a long enough password'), worker: await signIn(aminah, '482915') };
  const room = db.createRoom({ name: 'Container 4', length: 12, width: 2.3, height: 2.5, trhAddress: 1 }, Date.now() - 86_400_000).id;
  createCropApi({ db }).put(room, { crops: [{ crop: 'oyster', blocks: 500 }] });
  db.setProgram(room, { ...db.getProgram(room), stage: 'fruiting', stageSince: Date.now() - 3_600_000 });
  const call = (method, path, body, who = 'owner') => send(method, path, body, cookies[who]);
  return { db, call, room, seen };
}

// Good T/RH readings every 10 minutes over [from, to): the app saw the room all the while (Data integrity 7.1: a machine's run
// time counts only while the room is seen). For the usage tests written before seen time.
// The room needs its T/RH sensor's address (readings are kept only for a room's own sensor).
export function seenAllDay(db, roomId, from, to) {
  const address = db.getRoom(roomId).trhAddress;
  if (address === null) throw new Error('seenAllDay: give the room a T/RH sensor address');
  for (let at = from; at < to; at += 10 * 60_000) db.addReading({ roomId, kind: 'trh', address, at, ok: true, t: 25, rh: 85 });
}
