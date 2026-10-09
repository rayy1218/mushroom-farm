// web/shell.js routing, against a tiny DOM stub (no browser). docs/contracts/web.md section 2, C10 11.
const test = require('node:test');
const assert = require('node:assert/strict');

const listeners = {};
const view = {
  children: [], attributes: [],
  replaceChildren(...c) { this.children = c; },
  append(...c) { this.children.push(...c); },
  removeAttribute() {},
};
const link = module => ({ dataset: { module }, attrs: {}, setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; } });
const links = [link('rooms'), link('batches'), link('simulator')];
globalThis.document = {
  addEventListener(n, f) { listeners['doc:' + n] = f; },
  getElementById: () => view,
  querySelectorAll: sel => (sel === '#menu a' ? links : []),
  createElement: () => ({ className: '', textContent: '' }),
  body: { dataset: {} },
  title: '',
};
globalThis.location = { hash: '', replace(h) { this.hash = h; } };
globalThis.addEventListener = (n, f) => { listeners[n] = f; };
require('../web/shell.js');
const FarmShell = globalThis.FarmShell;
function go(hash) { location.hash = hash; listeners.hashchange(); }
const marked = () => links.filter(l => l.attrs['aria-current'] === 'page').map(l => l.dataset.module);
const tick = ms => new Promise(r => setTimeout(r, ms));

const events = [];
let updateImpl = () => false;
let updateCalls = [];
let rejectLate;
FarmShell.register('rooms', {
  mount(v, params) { events.push({ name: 'rooms', params }); },
  unmount() { events.push({ name: 'rooms', unmount: true }); },
  update(params) { updateCalls.push(params); return updateImpl(params); },
});
const plain = name => ({
  mount(v, params) { events.push({ name, params }); },
  unmount() { events.push({ name, unmount: true }); },
});
FarmShell.register('simulator', plain('simulator'));

test('SH1 parseHash', () => {
  const p = FarmShell.parseHash;
  assert.deepEqual(p('#/rooms'), { name: 'rooms', params: {} });
  assert.deepEqual(p('#/rooms/'), { name: 'rooms', params: {} });
  assert.deepEqual(p('#/rooms/3'), { redirect: '#/rooms/3/live' });
  for (const tab of ['live', 'simulate', 'calibrate']) {
    assert.deepEqual(p(`#/rooms/3/${tab}`), { name: 'rooms', params: { id: 3, tab } });
    assert.deepEqual(p(`#/rooms/3/${tab}/`), { name: 'rooms', params: { id: 3, tab } });
  }
  assert.deepEqual(p('#/rooms/3/calibrate/12'), { name: 'rooms', params: { id: 3, tab: 'calibrate', runId: 12 } });
  assert.deepEqual(p('#/rooms/999999999999999/live'), { name: 'rooms', params: { id: 999999999999999, tab: 'live' } });
  assert.deepEqual(p('#/simulator'), { name: 'simulator', params: {} });
  assert.deepEqual(p('#/simulator/2'), { name: 'simulator', params: { roomId: 2 } });
  assert.deepEqual(p('#/batches'), { name: 'batches', params: {} });
  assert.deepEqual(p('#/batches/4'), { name: 'batches', params: { id: 4 } });
  assert.deepEqual(p('#/harvest/stickers'), { name: 'harvest', params: { view: 'stickers' } });
  assert.deepEqual(p('#/harvest/stickers/'), { name: 'harvest', params: { view: 'stickers' } });
  assert.deepEqual(p('#/harvest/3'), { name: 'harvest', params: { view: 'record', id: 3 } });
  for (const bad of ['#/capacity', '#/calibration', '', '#', '#/', '#rooms', '#//simulator', '#/rooms//3', '#/rooms/0',
    '#/rooms/1234567890123456', '#/rooms/3/settings', '#/rooms/3/simulate/5', '#/rooms/3/calibrate/0', '#/rooms/3/live/1',
    '#/simulator/0', '#/batches/x', '#/harvest', '#/harvest/0', '#/harvest/stickers/1', '#/rooms?x=1', '#/nowhere']) {
    assert.equal(p(bad), null, JSON.stringify(bad));
  }
  assert.equal(p(undefined), null);
});

test('SH2 MENU_NAMES', () => {
  assert.deepEqual(FarmShell.MENU_NAMES, { rooms: 'Rooms', simulator: 'Test bench', batches: 'Batches', harvest: 'Harvest' });
  assert.ok(Object.isFrozen(FarmShell.MENU_NAMES));
  assert.deepEqual(Object.keys(FarmShell).sort(), ['MENU_NAMES', 'level', 'parseHash', 'register']);
});

test('SH3 redirects', () => {
  go('#/simulator');
  events.length = 0;
  go('#/rooms/3');
  assert.equal(location.hash, '#/rooms/3/live');
  assert.deepEqual(events, []);
  for (const h of ['#/capacity', '#/calibration', '#/nowhere']) {
    go('#/simulator');
    events.length = 0;
    go(h);
    assert.equal(location.hash, '#/rooms', h);
    assert.deepEqual(events, [], h);
  }
});

test('SH4 update keeps the module mounted', () => {
  go('#/simulator');
  events.length = 0; updateCalls = [];
  updateImpl = () => true;
  go('#/rooms/3/live');
  assert.deepEqual(events, [{ name: 'simulator', unmount: true }, { name: 'rooms', params: { id: 3, tab: 'live' } }]);
  events.length = 0;
  go('#/rooms/3/simulate');
  assert.deepEqual(updateCalls, [{ id: 3, tab: 'simulate' }]);
  assert.deepEqual(events, []);
  go('#/rooms/3/simulate');
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(events, []);
  updateImpl = () => false;
  go('#/rooms/4/live');
  assert.deepEqual(events, [{ name: 'rooms', unmount: true }, { name: 'rooms', params: { id: 4, tab: 'live' } }]);
  events.length = 0;
  const saved = console.error; const logged = []; console.error = (...a) => logged.push(a);
  updateImpl = () => { throw new Error('boom'); };
  go('#/rooms/4/calibrate');
  console.error = saved;
  assert.equal(logged.length, 1);
  assert.deepEqual(events, [{ name: 'rooms', unmount: true }, { name: 'rooms', params: { id: 4, tab: 'calibrate' } }]);
});

test('SH5 menu, title, layout', () => {
  updateImpl = () => true;
  go('#/rooms/1/live');
  assert.deepEqual(marked(), ['rooms']);
  assert.equal(document.title, 'Rooms · Mushroom farm');
  assert.equal('layout' in document.body.dataset, false);
  go('#/simulator/1');
  assert.deepEqual(marked(), ['simulator']);
  assert.equal(document.title, 'Test bench · Mushroom farm');
  go('#/batches/4');
  assert.deepEqual(marked(), ['batches']);
  go('#/harvest/stickers');
  assert.deepEqual(marked(), ['batches']);
  assert.equal(document.title, 'Harvest · Mushroom farm');
  assert.equal('layout' in document.body.dataset, false);
  go('#/harvest/1');
  assert.deepEqual(marked(), []);
  assert.equal(document.body.dataset.layout, 'bare');
  go('#/rooms');
  assert.deepEqual(marked(), ['rooms']);
  assert.equal('layout' in document.body.dataset, false);
  go('#/rooms/1/live');
  go('#/simulator/1');
  go('#/rooms/1/live');
  links.forEach(l => l.removeAttribute('aria-current')); document.title = '';
  go('#/rooms/1/simulate'); // update() returns true: menu and title are still set
  assert.deepEqual(marked(), ['rooms']);
  assert.equal(document.title, 'Rooms · Mushroom farm');
});

test('SH6 not installed', () => {
  go('#/batches');
  assert.equal(view.children[0].textContent, 'This part of the app is not installed.');
});

test('SH7 late rejection of an old mount is ignored, a current one shows the notice', async () => {
  const old = FarmShell; // the shell has one registry; replace rooms with a rejecting mounter
  old.register('rooms', {
    mount() { return new Promise((_, rej) => { rejectLate = rej; }); },
    unmount() {},
  });
  go('#/simulator');
  go('#/rooms/1/live');
  const reject = rejectLate;
  go('#/simulator/1');
  view.children = ['mimic'];
  reject(new Error('late failure'));
  await tick(20);
  assert.deepEqual(view.children, ['mimic']);
  // a rejection of the current async mount shows the notice
  go('#/simulator');
  go('#/rooms/2/live');
  rejectLate(new Error('now failure'));
  await tick(20);
  assert.match(view.children[0].textContent, /now failure/);
});
