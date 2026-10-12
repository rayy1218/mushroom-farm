// web/room-settings.js: the room Settings tab (C12 5.4): helpers, the save bar, remounts.
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller', 'runtime']) require(`../${f}.js`);
require('../web/ui.js'); require('../web/api.js'); require('../web/charts.js'); require('../web/settings-panel.js');
require('../web/room-tabs.js');
require('../web/room-live.js');
require('../web/room-settings.js');
const tab = globalThis.FarmRoomTabs.get('settings');
const H = tab && tab.helpers;
const CC = globalThis.ClimateController, clock = globalThis.FarmUi.farmClock();
const S = CC.defaultSettings();
const READING = { room_id: 1, t: 1791450000, T: 18.2, RH: 88.4, CO2: 812, t_out: 31.5, rh_out: 62, ac_mode: 'cool', ac_setpoint: 17.5,
  fog: 1, air: 0, lights: 1, circ: 0, power_w: 1430, kwh: 12.84, ac_fan: 'auto', stage: 'fruiting', core: 19.1 };

test('RT1 registration', () => {
  assert.ok(tab, 'tab settings registered');
  assert.equal(typeof tab.mount, 'function');
  assert.equal(typeof tab.unmount, 'function');
  for (const n of ['programText', 'commandFromReading', 'detailChanges', 'detailLines', 'countText', 'changeLines', 'versionText', 'barVisible', 'rebase']) {
    assert.equal(typeof H[n], 'function', n);
  }
  assert.doesNotThrow(() => tab.unmount());
});

test('RT2 programText', () => {
  assert.equal(H.programText({ crop: 'oyster', stage: 'fruiting', flush: 2 }), 'Running now: Grey oyster · Fruiting · flush 2');
  assert.equal(H.programText({ crop: 'oyster', stage: 'fruiting', flush: null }), 'Running now: Grey oyster · Fruiting');
  assert.equal(H.programText(null), ''); assert.equal(H.programText({ crop: null }), '');
});

test('RT3 command from a reading', () => {
  assert.deepEqual(H.commandFromReading(READING), { ac: { power: true, mode: 'cool', setpoint: 17.5 }, hu: { level: 1 },
    air: { on: false }, lights: { on: true }, circ: { on: false } });
  assert.deepEqual(H.commandFromReading({ ...READING, air: 1 }).air, { on: true });
  assert.deepEqual(H.commandFromReading({ ...READING, ac_mode: 'off' }).ac, { power: false });
  assert.equal(H.commandFromReading(null), null);
});

test('RT4 forms and change lines', () => {
  assert.deepEqual(H.detailChanges({ name: 'Room 1', volume: 60 }, { name: ' Room 1 ', volume: '60' }), {});
  assert.deepEqual(H.detailChanges({ name: 'Room 1', volume: 60 }, { name: 'Shed A', volume: '80' }), { name: 'Shed A', volume: 80 });
  assert.equal(H.countText(0), ''); assert.equal(H.countText(1), '1 unsaved change(s)');
  assert.equal(H.versionText({ id: 14, saved_at: 1791450100, note: 'Lower RH' }, clock, true), '2026-10-08 17:01:40 · Lower RH · current');
  assert.equal(H.versionText({ id: 14, saved_at: 1791450100, note: null }, clock, false), '2026-10-08 17:01:40 · —');
  assert.deepEqual(H.changeLines(globalThis.FarmSettingsPanel.diffSettings(S, { ...S, spT: 20 })), ['Temperature target: 25 °C → 20 °C']);
});

test('RT5 rebase keeps the edits', () => {
  const edit = o => ({ ...S, ...o });
  const args = [S, edit({ spT: 20 }), edit({ spRH: 90 })], copies = structuredClone(args);
  const r = H.rebase(...args);
  assert.equal(r.settings.spT, 20); assert.equal(r.settings.spRH, 90); assert.equal(r.kept, 1);
  assert.deepEqual(args, copies);
  const same = H.rebase(S, structuredClone(S), edit({ spRH: 90 }));
  assert.deepEqual(same.settings, edit({ spRH: 90 })); assert.equal(same.kept, 0);
  assert.equal(H.rebase(S, edit({ spT: 20 }), edit({ spT: 22 })).settings.spT, 20);
});


test('RT6 detailLines and barVisible', () => {
  const room = { name: 'Room 1', volume: 60 };
  assert.deepEqual(H.detailLines(room, {}), []);
  assert.deepEqual(H.detailLines(room, { name: 'Shed A', volume: 80 }), [
    { label: 'Room name', oldText: 'Room 1', newText: 'Shed A' }, { label: 'Room size', oldText: '60 m³', newText: '80 m³' }]);
  assert.equal(H.barVisible(0, false), false);
  assert.equal(H.barVisible(2, false), true);
  assert.equal(H.barVisible(0, true), true);
});

// ---- mount: a tiny DOM stub, installed only inside these tests ----
class FakeEl {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.style = {}; this.className = ''; this.textContent = '';
    this.value = ''; this.hidden = false; this.disabled = false; this.listeners = {};
    const self = this;
    this.classList = { add: c => { self.className = (self.className + ' ' + c).trim(); } };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; }
  append(...c) { this.children.push(...c.filter(x => typeof x !== 'string')); }
  replaceChildren(...c) { this.children = []; this.append(...c); }
  addEventListener(n, f) { this.listeners[n] = f; }
  matches(part) {
    if (part[0] === '#') return this.attrs.id === part.slice(1);
    if (part[0] === '.') return this.className.split(/\s+/).includes(part.slice(1));
    if (part[0] === '[') { const m = /^\[([\w-]+)="(.*)"\]$/.exec(part); return this.attrs[m[1]] === m[2]; }
    return this.tagName === part.toUpperCase();
  }
  all(chain, out) {
    for (const c of this.children) {
      if (c.matches(chain[0])) { if (chain.length === 1) out.push(c); else c.all(chain.slice(1), out); }
      c.all(chain, out);
    }
    return out;
  }
  querySelectorAll(sel) { return sel.split(',').flatMap(s => this.all(s.trim().split(/\s+/), [])); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
const later = () => new Promise(r => setTimeout(r, 20));
const ROOM = { id: 1, name: 'Room 1', volume: 60, live: { reading: READING, crop: 'oyster', stage: 'fruiting', flush: 1, air: null } };

function withDom(t, settingsById) {
  globalThis.document = { createElement: tag => new FakeEl(tag), querySelector: () => null };
  const api = globalThis.FarmApi, oldApi = { ...api }, oldSP = globalThis.FarmSettingsPanel.createSettingsPanel, oldCharts = globalThis.FarmCharts.createLadder;
  const made = [];
  let diff = [];
  globalThis.FarmSettingsPanel.createSettingsPanel = (host, opts) => {
    const slot = new FakeEl('div'); slot.setAttribute('data-slot', 'rules-side');
    const prog = new FakeEl('div'); prog.setAttribute('data-slot', 'program-status');
    host.append(slot, prog);
    const p = { opts, get: () => opts.settings, set() {}, diff: () => diff, destroy() { p.destroyed = true; } };
    made.push(p);
    return p;
  };
  globalThis.FarmCharts.createLadder = () => ({ draw() {}, destroy() {} });
  Object.assign(api, { getSettings: id => settingsById[id], listSettingsHistory: async () => [{ id: 1, saved_at: 1791450000, note: null }] });
  t.after(() => {
    delete globalThis.document; Object.assign(api, oldApi);
    globalThis.FarmSettingsPanel.createSettingsPanel = oldSP; globalThis.FarmCharts.createLadder = oldCharts;
  });
  t.after(() => tab.unmount());
  const ctx = (id, lists = {}) => ({ id, params: {}, room: () => ({ ...ROOM, id }), on: (type, fn) => { (lists[type] ||= []).push(fn); return () => {}; } });
  return { ctx, made, setDiff: d => { diff = d; } };
}

test('RT7 the save bar shows only with unsaved changes; Discard hides it', async t => {
  const { ctx, made, setDiff } = withDom(t, { 1: Promise.resolve(S) });
  const el = new FakeEl('div');
  await tab.mount(el, ctx(1));
  const bar = el.querySelector('.save-bar');
  assert.equal(bar.hidden, true);
  setDiff([{ path: 'spT', label: 'Temperature target', oldText: '25 °C', newText: '20 °C' }]);
  made[0].opts.onChange();
  assert.equal(bar.hidden, false);
  assert.equal(el.querySelector('#spCount').textContent, '1 unsaved change(s)');
  assert.equal(el.querySelector('#spSave').disabled, false);
  setDiff([]);
  el.querySelector('#spDiscard').listeners.click();
  assert.equal(bar.hidden, true);
  assert.equal(el.querySelector('#spCount').textContent, '');
});

test('RT8 the Settings versions card is installer-only; the danger zone has Archive', async t => {
  const { ctx } = withDom(t, { 1: Promise.resolve(S) });
  const el = new FakeEl('div');
  await tab.mount(el, ctx(1));
  assert.equal(el.querySelector('.room-versions').attrs['data-level-only'], 'installer');
  assert.equal(el.querySelector('.room-details').attrs['data-level-only'], undefined);
  assert.ok(el.querySelector('.room-danger #rdArchive').className.includes('btn-danger'));
});

test('RT9 mounting room 2 on the same element: a slow load of room 1 never paints into it', async t => {
  let late;
  const slow = new Promise(r => { late = r; });
  const { ctx, made } = withDom(t, { 1: slow, 2: Promise.resolve({ ...S, spT: 22 }) });
  const el = new FakeEl('div');
  const p1 = tab.mount(el, ctx(1));
  tab.unmount();
  const p2 = tab.mount(el, ctx(2));
  await p2; await later();
  late({ ...S, spT: 99 });
  await p1; await later();
  assert.equal(made.length, 1);
  assert.equal(made[0].opts.settings.spT, 22);
});

test('RT10 mounting twice on the same element makes one panel; a reading updates the command', async t => {
  const lists = {};
  const { ctx, made } = withDom(t, { 1: Promise.resolve(S) });
  const el = new FakeEl('div');
  const p1 = tab.mount(el, ctx(1)), p2 = tab.mount(el, ctx(1, lists));
  await Promise.all([p1, p2]); await later();
  assert.equal(made.length, 1);
  lists.reading[0]({ ...READING, t: READING.t + 1, ac_mode: 'off' });
  assert.deepEqual(made[0].opts.getCommand().ac, { power: false });
});
