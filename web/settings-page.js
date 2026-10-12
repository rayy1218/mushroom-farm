// web/settings-page.js: the Settings page, #/settings (C12 3.2).
(function (global) {
'use strict';

const LEVELS = [
  { id: 'farmer', name: 'Farmer', text: 'Simple view: rooms, harvest and batches.' },
  { id: 'installer', name: 'Installer', text: 'Everything, plus the planning tools (Simulate, Calibrate, Test bench) and the control rules.' },
];
const LOOKS = [['light', 'Light'], ['dark', 'Dark'], ['device', 'Same as this device']];
const ABOUT = "This app runs your grow rooms. It keeps each room's temperature, humidity and fresh air where your mushrooms like them, using the aircon, mister and fans. It records your batches of blocks and every crate you harvest.";
const SIM_NOTE = 'No sensors are connected yet: the rooms run on a computer model.';

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
function card(title, ...kids) {
  const c = el('section', 'card set-card');
  c.append(el('h2', null, title), ...kids);
  return c;
}

let mountSeq = 0;
function mount(view) {
  const me = ++mountSeq;
  view.replaceChildren();
  const root = el('div', 'set-page');
  root.append(global.FarmUi.pageHead({ title: 'Settings', sub: 'How this screen looks and who uses it.' }));

  const choices = el('div', 'seg-lg');
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', 'Who uses this screen');
  for (const l of LEVELS) {
    const b = el('button', 'choice');
    b.type = 'button';
    b.dataset.levelBtn = l.id;
    b.setAttribute('aria-pressed', String(global.FarmShell.level === l.id));
    b.append(el('strong', null, l.name), el('span', null, l.text));
    choices.append(b);
  }

  const look = el('div', 'seg');
  look.setAttribute('role', 'group');
  look.setAttribute('aria-label', 'Look');
  for (const [id, name] of LOOKS) {
    const b = el('button', null, name);
    b.type = 'button';
    b.dataset.themeBtn = id;
    b.setAttribute('aria-pressed', String(global.FarmShell.theme === id));
    b.addEventListener('click', () => global.FarmShell.setTheme(id));
    look.append(b);
  }

  const about = el('p', null, ABOUT);
  const simNote = el('p', 'est-note', SIM_NOTE);
  simNote.hidden = true;
  const device = el('p', 'set-meta', `Farm server: ${location.host}`);

  const whoCard = card('Who uses this screen', choices);
  whoCard.className += ' set-wide';
  const tools = card('Installer tools', Object.assign(el('a', 'btn btn-link', 'Open the test bench'), { href: '#/simulator' }));
  tools.dataset.levelOnly = 'installer';
  tools.className += ' set-wide';
  root.append(whoCard, tools, card('Look', look), card('About this app', about, simNote), card('This device', device));
  view.append(root);

  // The "no sensors" line only shows when every room is simulated.
  if (global.FarmApi && global.FarmApi.listRooms) {
    global.FarmApi.listRooms().then(rooms => {
      if (me !== mountSeq) return;
      simNote.hidden = !(Array.isArray(rooms) && rooms.length && rooms.every(r => r.adapter === 'sim'));
    }).catch(() => { /* the note stays hidden */ });
  }
}
function unmount() { mountSeq++; }

if (global.FarmShell) global.FarmShell.register('settings', { mount, unmount });
})(typeof window !== 'undefined' ? window : globalThis);
