// FarmSettingsPanel.showChanges against a tiny DOM stub: the dialog resolves null when the hash changes.
const test = require('node:test');
const assert = require('node:assert/strict');

const winListeners = {};
function makeEl(tag) {
  const l = {};
  return {
    tag, children: [], className: '', textContent: '', value: '', open: false, removed: false,
    append(...c) { this.children.push(...c); }, setAttribute() {},
    addEventListener(n, f) { l[n] = f; }, fire(n, e) { return l[n](e); },
    showModal() { this.open = true; }, close() { this.open = false; }, remove() { this.removed = true; },
  };
}
const body = makeEl('body');
globalThis.document = { createElement: makeEl, body, addEventListener() {}, removeEventListener() {} };
globalThis.addEventListener = (n, f) => { (winListeners[n] ||= new Set()).add(f); };
globalThis.removeEventListener = (n, f) => { (winListeners[n] ||= new Set()).delete(f); };
require('../controller.js');
require('../web/ui.js');
require('../web/settings-panel.js');
const SP = globalThis.FarmSettingsPanel;
const changes = [{ path: 'spT', label: 'T', oldText: '1', newText: '2' }];
const opts = { title: 'T', confirmText: 'Save', note: false };
const dialog = () => body.children.at(-1);
const actions = () => dialog().children.at(-1).children;

test('a hash change closes the dialog and resolves null; the listener is removed', async () => {
  const p = SP.showChanges(changes, opts);
  assert.ok(dialog().open);
  assert.equal(winListeners.hashchange.size, 1);
  const d = dialog();
  for (const f of [...winListeners.hashchange]) f();
  assert.equal(await p, null);
  assert.ok(d.removed && !d.open);
  assert.equal(winListeners.hashchange.size, 0);
  actions()[1].fire('click'); // a late click does nothing (already settled)
});

test('confirm and cancel still resolve and remove the hashchange listener', async () => {
  let p = SP.showChanges(changes, opts);
  actions()[1].fire('click');
  assert.equal(await p, '');
  assert.equal(winListeners.hashchange.size, 0);
  p = SP.showChanges(changes, opts);
  actions()[0].fire('click');
  assert.equal(await p, null);
  assert.equal(winListeners.hashchange.size, 0);
});
