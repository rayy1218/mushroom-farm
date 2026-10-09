// web/simulator.js: createRoomLink, the Test bench's Load / Save settings to a room (docs/contracts/web.md C5 7.8).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js');
require('../air.js');
require('../controller.js');
require('../runtime.js');
require('../calib.js');
require('../web/ui.js');
require('../web/api.js');
require('../web/charts.js');
require('../web/settings-panel.js');
globalThis.FarmShell = { register() {} };
const { createRoomLink, airText, mimicLayout } = require('../web/simulator.js');
const { startFakeApi } = require('./fakes/api-server.js');
const CC = globalThis.ClimateController, SP = globalThis.FarmSettingsPanel;

const ROOM = { id: 1, name: 'Room 1' };
const GET = '/api/rooms/1/settings';

function different(extra = {}) {
  return { ...CC.defaultSettings(), spRH: 85, crop: 'pink', ...extra };
}

// One fake server and one link per test. The showChanges stub records its calls and waits for the test.
async function setup(fn) {
  const fake = await startFakeApi();
  globalThis.FarmApi.base = fake.url;
  const cfg = CC.defaultSettings();
  const ctl = CC.create(cfg, null, null);
  const events = [], loaded = [], calls = [];
  let pending = null, shown;
  const shownP = new Promise(r => { shown = r; });
  const showChanges = (changes, opts) => new Promise(resolve => { calls.push({ changes, opts }); pending = resolve; shown(); });
  const link = createRoomLink({
    api: globalThis.FarmApi, diffSettings: SP.diffSettings, safeSettings: SP.safeSettings, showChanges,
    errorText: globalThis.FarmUi.errorText, cfg, getCtl: () => ctl, event: t => events.push(t), onLoaded: c => loaded.push(c),
  });
  const api = () => fake.requests.filter(r => r.path.startsWith('/api/'));
  const answer = v => pending(v);
  const tick = () => shownP;
  try { await fn({ fake, cfg, ctl, events, loaded, calls, link, api, answer, tick }); }
  finally { await fake.close(); }
}

test('T1 the requires succeed', () => {
  assert.equal(typeof createRoomLink, 'function');
});

test('L1 same settings: no dialog', () => setup(async ({ fake, cfg, link, calls, events, api }) => {
  fake.reply('GET', GET, 200, structuredClone(cfg));
  assert.equal(await link.load(ROOM), 'Same settings as Room 1.');
  assert.equal(api().filter(r => r.method === 'GET' && r.path === GET).length, 1);
  assert.equal(calls.length, 0);
  assert.deepEqual(events, []);
}));

test('L2 cancel changes nothing', () => setup(async ({ fake, cfg, link, calls, events, loaded, answer, tick }) => {
  const room = different(), before = structuredClone(cfg);
  fake.reply('GET', GET, 200, room);
  const p = link.load(ROOM);
  await tick();
  answer(null);
  assert.equal(await p, '');
  assert.deepEqual(calls[0].changes, SP.diffSettings(before, room));
  assert.deepEqual(calls[0].opts, { title: 'Load the settings of Room 1?', confirmText: 'Load', note: false });
  assert.deepEqual(cfg, before);
  assert.deepEqual(events, []);
  assert.deepEqual(loaded, []);
}));

test('L3 load copies into the same cfg and cancels the ramp', () => setup(async ({ fake, cfg, ctl, link, calls, events, loaded, answer, tick }) => {
  cfg.program.rampH = 4; ctl.setStage('pinning', 0);
  assert.ok(ctl.state.stage.ramp);
  const ref = cfg, room = different();
  fake.reply('GET', GET, 200, room);
  const p = link.load(ROOM);
  await tick();
  answer('');
  assert.equal(await p, 'Loaded the settings of Room 1.');
  assert.deepEqual(SP.diffSettings(cfg, room), []);
  assert.equal(cfg, ref); assert.equal(ctl.cfg, cfg);
  assert.equal(ctl.state.stage.ramp, null);
  assert.deepEqual(events, ['Settings loaded from room "Room 1"']);
  assert.equal(loaded.length, 1);
  assert.deepEqual(loaded[0], calls[0].changes);
}));

test('L4 the reply goes through safeSettings', () => setup(async ({ fake, cfg, link, calls, answer, tick }) => {
  const body = Object.assign(JSON.parse('{"__proto__":{"polluted":1}}'), different(), { bogus: 1, spT: 99 });
  fake.reply('GET', GET, 200, body);
  const p = link.load(ROOM);
  await tick();
  answer('');
  await p;
  assert.equal(({}).polluted, undefined);
  assert.equal('bogus' in cfg, false);
  assert.equal(cfg.spT, 35);
  for (const c of calls[0].changes) assert.ok(c.path !== 'bogus' && !c.path.startsWith('__proto__'));
}));

test('L5 an unreadable reply is a message', () => setup(async ({ fake, cfg, link, calls }) => {
  const before = structuredClone(cfg);
  fake.reply('GET', GET, 200, 5);
  const text = await link.load(ROOM);
  assert.ok(text.startsWith('The settings of Room 1 could not be read: '), text);
  assert.equal(calls.length, 0);
  assert.deepEqual(cfg, before);
}));

test('L6 an ApiError becomes the message', () => setup(async ({ fake, cfg, link, calls }) => {
  const before = structuredClone(cfg);
  fake.reply('GET', GET, 404, { error: 'Unknown room', details: [] });
  assert.equal(await link.load(ROOM), 'Unknown room');
  assert.equal(calls.length, 0);
  assert.deepEqual(cfg, before);
}));

test('L7 an unreachable server leaves the link usable', () => setup(async ({ fake, link }) => {
  await fake.close();
  const text = await link.load(ROOM);
  assert.ok(text.startsWith('The farm server cannot be reached.'), text);
  assert.equal(link.busy, false);
}));

test('S1 same settings: nothing to save', () => setup(async ({ fake, cfg, link, calls, api }) => {
  fake.reply('GET', GET, 200, structuredClone(cfg));
  assert.equal(await link.save(ROOM), 'Room 1 already has these settings.');
  assert.equal(calls.length, 0);
  assert.equal(api().filter(r => r.method === 'PUT').length, 0);
}));

test('S2 cancel sends nothing', () => setup(async ({ fake, cfg, link, calls, answer, tick, api }) => {
  const room = different(), copy = structuredClone(cfg);
  fake.reply('GET', GET, 200, room);
  const p = link.save(ROOM);
  await tick();
  answer(null);
  assert.equal(await p, '');
  assert.deepEqual(calls[0].changes, SP.diffSettings(room, copy));
  assert.deepEqual(calls[0].opts, { title: 'Save these settings to Room 1?', confirmText: 'Save to room', note: true });
  assert.equal(api().filter(r => r.method === 'PUT').length, 0);
}));

test('S3 save sends the bare settings and the note', () => setup(async ({ fake, cfg, link, answer, tick, api }) => {
  const room = different(), copy = structuredClone(cfg);
  fake.reply('GET', GET, 200, room);
  fake.reply('PUT', GET, 200, { settings: { ...room, spT: 20 }, warnings: [] });
  const p = link.save(ROOM);
  await tick();
  answer('Lower RH');
  assert.equal(await p, 'Saved.');
  const put = api().find(r => r.method === 'PUT');
  assert.deepEqual(put.body, { settings: copy, note: 'Lower RH' });
  assert.equal(cfg.spT, copy.spT);
}));

test('S4 an empty note becomes the default note', () => setup(async ({ fake, link, answer, tick, api }) => {
  fake.reply('GET', GET, 200, different());
  fake.reply('PUT', GET, 200, { settings: different(), warnings: [] });
  const p = link.save(ROOM);
  await tick();
  answer('');
  await p;
  assert.equal(api().find(r => r.method === 'PUT').body.note, 'From the Simulator');
}));

test('S5 warnings are shown', () => setup(async ({ fake, link, answer, tick }) => {
  fake.reply('GET', GET, 200, different());
  fake.reply('PUT', GET, 200, { settings: different(), warnings: ['A.', 'B.'] });
  const p = link.save(ROOM);
  await tick();
  answer('x');
  assert.equal(await p, 'Saved with 2 warning(s): A. B.');
}));

test('S6 what is sent is what was shown', () => setup(async ({ fake, cfg, link, answer, tick, api }) => {
  const was = cfg.spT;
  fake.reply('GET', GET, 200, different());
  fake.reply('PUT', GET, 200, { settings: different(), warnings: [] });
  const p = link.save(ROOM);
  await tick();
  cfg.spT = 30;
  answer('x');
  await p;
  assert.equal(api().find(r => r.method === 'PUT').body.settings.spT, was);
}));

test('S7 a 400 is shown, not thrown', () => setup(async ({ fake, link, answer, tick }) => {
  fake.reply('GET', GET, 200, different());
  fake.reply('PUT', GET, 400, { error: 'Invalid settings', details: ['note must be text of at most 200 characters'] });
  const p = link.save(ROOM);
  await tick();
  answer('x');
  assert.equal(await p, 'Invalid settings: note must be text of at most 200 characters');
}));

test('C1 one action at a time', () => setup(async ({ fake, link, answer, tick, api }) => {
  fake.reply('GET', GET, 200, different());
  const p = link.load(ROOM);
  await tick();
  const n = api().length;
  assert.equal(link.busy, true);
  const p2 = link.load(ROOM), p3 = link.save(ROOM);
  for (const q of [p2, p3]) assert.equal(await Promise.race([q, new Promise(r => setTimeout(() => r('pending'), 1000))]), null);
  assert.equal(api().length, n);
  answer(null);
  await p;
  assert.equal(link.busy, false);
}));

test('C5 dispose while a request is in flight', () => setup(async ({ fake, cfg, link, events, loaded, calls, api }) => {
  const before = structuredClone(cfg);
  fake.reply('GET', GET, 200, structuredClone(cfg));
  const p = link.load(ROOM);
  link.dispose();
  assert.equal(await p, null);
  assert.deepEqual(events, []); assert.deepEqual(loaded, []); assert.deepEqual(cfg, before); assert.equal(calls.length, 0);
}));

test('C6 dispose while a save request is in flight', () => setup(async ({ fake, cfg, link, calls, api }) => {
  fake.reply('GET', GET, 200, structuredClone(cfg));
  const p = link.save(ROOM);
  link.dispose();
  assert.equal(await p, null);
  assert.equal(calls.length, 0);
  assert.equal(api().filter(r => r.method === 'PUT').length, 0);
}));

test('C7 dispose while a request that fails is in flight', () => setup(async ({ fake, link }) => {
  fake.reply('GET', GET, 404, { error: 'Unknown room', details: [] });
  const p = link.load(ROOM);
  link.dispose();
  assert.equal(await p, null);
}));

test('C2 dispose during a load touches nothing', () => setup(async ({ fake, cfg, link, events, loaded, answer, tick }) => {
  const before = structuredClone(cfg);
  fake.reply('GET', GET, 200, different());
  const p = link.load(ROOM);
  await tick();
  link.dispose();
  answer('');
  assert.equal(await p, null);
  assert.deepEqual(cfg, before);
  assert.deepEqual(events, []);
  assert.deepEqual(loaded, []);
}));

test('C3 dispose during a save sends nothing', () => setup(async ({ fake, link, answer, tick, api }) => {
  fake.reply('GET', GET, 200, different());
  const p = link.save(ROOM);
  await tick();
  link.dispose();
  answer('x');
  assert.equal(await p, null);
  assert.equal(api().filter(r => r.method === 'PUT').length, 0);
}));

test('C4 after dispose nothing runs', () => setup(async ({ link, api }) => {
  link.dispose(); link.dispose();
  assert.equal(await link.load(ROOM), null);
  assert.equal(await link.save(ROOM), null);
  assert.equal(api().length, 0);
}));

test('RL1 the Node export', () => {
  assert.deepEqual(Object.keys(require('../web/simulator.js')).sort(), ['airText', 'createRoomLink', 'mimicLayout']);
  assert.equal(globalThis.FarmBench, undefined);
  assert.equal(mimicLayout({ inletAt: 'high', exhaustAt: 'low' }).inlet.tag, 'SF-203');
  assert.equal(typeof airText, 'function');
});

test('RL2 a loaded air size is a change', () => setup(async ({ fake, cfg, link, calls, loaded, answer, tick }) => {
  fake.reply('GET', GET, 200, different({ airM3h: 900 }));
  const p = link.load(ROOM);
  await tick();
  answer('');
  await p;
  assert.equal(cfg.airM3h, 900);
  for (const list of [calls[0].changes, loaded[0]]) {
    const c = list.filter(x => x.path === 'airM3h');
    assert.equal(c.length, 1);
    assert.equal(c[0].old, 1800); assert.equal(c[0].new, 900);
  }
}));
