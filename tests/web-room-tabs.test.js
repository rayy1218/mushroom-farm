// web/room-tabs.js: the tab registry (docs/contracts/web.md section 3.9) and the prep 2.0 tab stubs (1.7).
const test = require('node:test');
const assert = require('node:assert/strict');

// Runs first: require() caches one registry for the whole file, and a later test registers 'live'.
test('the tab files load and register nothing', () => {
  require('../web/room-tabs.js');
  for (const f of ['room-live', 'room-simulate', 'room-calibrate']) require(`../web/${f}.js`);
  const FarmRoomTabs = globalThis.FarmRoomTabs;
  for (const name of FarmRoomTabs.NAMES) assert.equal(FarmRoomTabs.get(name), undefined);
});

test('NAMES: live, simulate, calibrate, frozen', () => {
  require('../web/room-tabs.js');
  const { NAMES } = globalThis.FarmRoomTabs;
  assert.deepEqual(NAMES, ['live', 'simulate', 'calibrate']);
  assert.ok(Object.isFrozen(NAMES));
});

test('register and get; a second register replaces the first', () => {
  require('../web/room-tabs.js');
  const { register, get } = globalThis.FarmRoomTabs;
  const a = { mount() {} };
  const b = { mount() {} };
  assert.equal(register('live', a), undefined);
  assert.equal(get('live'), a);
  register('live', b);
  assert.equal(get('live'), b);
  assert.equal(get('simulate'), undefined);
  assert.equal(get('nope'), undefined);
});

test('an unknown name throws', () => {
  require('../web/room-tabs.js');
  assert.throws(() => globalThis.FarmRoomTabs.register('settings', {}), { name: 'Error', message: 'Unknown tab: settings' });
  assert.throws(() => globalThis.FarmRoomTabs.register(undefined, {}), { message: 'Unknown tab: undefined' });
});
