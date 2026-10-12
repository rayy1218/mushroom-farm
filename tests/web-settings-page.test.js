// web/settings-page.js against a tiny DOM stub (C12 3.2).
const test = require('node:test');
const assert = require('node:assert/strict');

function node(tag) {
  return {
    tag, className: '', textContent: '', dataset: {}, attrs: {}, children: [], hidden: false, listeners: {},
    setAttribute(n, v) { this.attrs[n] = v; },
    append(...c) { this.children.push(...c); },
    replaceChildren(...c) { this.children = c; },
    addEventListener(n, f) { this.listeners[n] = f; },
  };
}
const walk = (n, out = []) => { out.push(n); (n.children || []).forEach(c => walk(c, out)); return out; };
globalThis.document = { createElement: node };
globalThis.location = { host: 'farm.local:8101' };
let registered = null, theme = null, level = 'farmer', rooms = [];
globalThis.FarmShell = { register: (n, m) => { registered = { n, m }; }, get level() { return level; }, get theme() { return 'dark'; }, setTheme(t) { theme = t; } };
globalThis.FarmUi = { pageHead: ({ title, sub }) => Object.assign(node('header'), { className: 'page-head', textContent: `${title}|${sub}` }) };
globalThis.FarmApi = { listRooms: () => Promise.resolve(rooms) };
require('../web/settings-page.js');
const texts = view => walk(view).map(n => n.textContent).filter(Boolean);

test('ST1 registers as settings', () => {
  assert.equal(registered.n, 'settings');
  assert.equal(typeof registered.m.mount, 'function');
  assert.equal(typeof registered.m.unmount, 'function');
});

test('ST2 four cards, level and look choices', async () => {
  const view = node('main');
  rooms = [{ adapter: 'sim' }, { adapter: 'sim' }];
  registered.m.mount(view);
  const all = walk(view);
  assert.equal(all.filter(n => /^card set-card/.test(n.className)).length, 4);
  assert.ok(texts(view).includes('Settings|How this screen looks and who uses it.'));
  const lv = all.filter(n => n.dataset.levelBtn);
  assert.deepEqual(lv.map(b => [b.dataset.levelBtn, b.attrs['aria-pressed']]), [['farmer', 'true'], ['installer', 'false']]);
  const th = all.filter(n => n.dataset.themeBtn);
  assert.deepEqual(th.map(b => [b.textContent, b.attrs['aria-pressed']]), [['Light', 'false'], ['Dark', 'true'], ['Same as this device', 'false']]);
  th[0].listeners.click();
  assert.equal(theme, 'light');
  assert.ok(texts(view).includes('Farm server: farm.local:8101'));
  const note = all.find(n => n.textContent === 'No sensors are connected yet: the rooms run on a computer model.');
  assert.equal(note.hidden, true);
  await new Promise(r => setImmediate(r));
  assert.equal(note.hidden, false);
});

test('ST3 the no-sensors line stays hidden unless every room is simulated; late replies are dropped', async () => {
  rooms = [{ adapter: 'sim' }, { adapter: 'modbus' }];
  const view = node('main');
  registered.m.mount(view);
  const note = walk(view).find(n => /No sensors/.test(n.textContent));
  await new Promise(r => setImmediate(r));
  assert.equal(note.hidden, true);
  rooms = [{ adapter: 'sim' }];
  const v2 = node('main');
  registered.m.mount(v2);
  const n2 = walk(v2).find(n => /No sensors/.test(n.textContent));
  registered.m.unmount();
  await new Promise(r => setImmediate(r));
  assert.equal(n2.hidden, true);
});
