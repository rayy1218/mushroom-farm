// web/shell.js routing, against a tiny DOM stub (no browser). docs/contracts/web.md section 2.
const test = require('node:test');
const assert = require('node:assert/strict');

const listeners = {};
const view = {
  children: [], attributes: [],
  replaceChildren(...c) { this.children = c; },
  append(...c) { this.children.push(...c); },
  removeAttribute() {},
};
function makeEl() { return { className: '', textContent: '' }; }
globalThis.document = {
  addEventListener(n, f) { listeners['doc:' + n] = f; },
  getElementById: () => view,
  querySelectorAll: () => [],
  createElement: makeEl,
  title: '',
};
globalThis.location = { hash: '', replace(h) { this.hash = h; } };
globalThis.addEventListener = (n, f) => { listeners[n] = f; };
require('../web/shell.js');
const FarmShell = globalThis.FarmShell;

const mounts = [];
function mod(name, impl) {
  return {
    mount(v, params) { mounts.push({ name, params }); return impl ? impl() : undefined; },
    unmount() { mounts.push({ name, unmount: true }); },
  };
}
function go(hash) { location.hash = hash; listeners.hashchange(); }
const tick = ms => new Promise(r => setTimeout(r, ms));

let rejectLate;
FarmShell.register('rooms', mod('rooms', () => new Promise((_, rej) => { rejectLate = rej; })));
FarmShell.register('simulator', mod('simulator'));
FarmShell.register('capacity', mod('capacity'));
FarmShell.register('calibration', mod('calibration'));

test('routing: valid and invalid hashes', () => {
  mounts.length = 0;
  go('#/capacity');
  assert.deepEqual(mounts.at(-1), { name: 'capacity', params: {} });
  go('#/simulator/');
  assert.deepEqual(mounts.at(-1), { name: 'simulator', params: {} });
  go('#/rooms/3');
  assert.deepEqual(mounts.at(-1), { name: 'rooms', params: { id: 3 } });
  go('#/rooms/999999999999999');
  assert.deepEqual(mounts.at(-1), { name: 'rooms', params: { id: 999999999999999 } });
  for (const bad of ['#rooms', '#/rooms//3', '#//simulator', '#/rooms/0', '#/rooms/1234567890123456', '#/nowhere', '']) {
    go('#/capacity');
    const n = mounts.length;
    go(bad);
    assert.equal(location.hash, '#/rooms', `redirect for ${JSON.stringify(bad)}`);
    assert.equal(mounts.length, n, 'nothing unmounted or mounted');
  }
});

test('a late rejection of an old async mount does not touch the new module view', async () => {
  go('#/capacity');
  go('#/rooms/1');
  const reject = rejectLate;
  go('#/simulator');
  view.children = ['mimic'];
  reject(new Error('late failure'));
  await tick(20);
  assert.deepEqual(view.children, ['mimic']);
});

test('a rejection of the current async mount shows the notice', async () => {
  go('#/capacity');
  go('#/rooms/2');
  rejectLate(new Error('now failure'));
  await tick(20);
  assert.match(view.children[0].textContent, /now failure/);
});
