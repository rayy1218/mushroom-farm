// The Simulations card of the room page: the last runs of the room, each linking to its page, and a Simulate button that opens
// the same stepper as the Rooms list. createSimulationsCard(host, { roomId, getRoom, onOffline }) → { refresh(), destroy() }.
// While a run is going the list is asked every 2 s, otherwise only when asked for (after a run was started).

import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { request } from './api.js';
import { openSimulateDialog } from './simulate-dialog.js';
import { runRow, isActive } from './simulation-math.js';

const SHOWN = 5;
const ACTIVE_MS = 2000;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

export function createSimulationsCard(host, { roomId, getRoom }) {
  let alive = true;
  let seq = 0; // every load takes a token; a reply that finds it changed is dropped
  let runs = null;
  let all = false;
  let timer = null;

  host.className = 'card sim-card';
  const head = el('div', 'sim-card-head');
  const simulate = el('button', 'primary', 'Simulate');
  simulate.type = 'button';
  head.append(el('h2', '', 'Simulations'), simulate);
  const msg = el('p', 'none', 'Loading…');
  const list = el('ul', 'sim-list');
  const more = el('button', '', '');
  more.type = 'button';
  more.hidden = true;
  host.append(head, msg, list, more);

  function paint() {
    const shown = all ? runs : runs.slice(0, SHOWN);
    msg.hidden = runs.length > 0;
    msg.textContent = 'No simulations yet. Simulate shows how this room would do over days, with your crops and machines.';
    list.replaceChildren(...shown.map((run) => {
      const r = runRow(run, roomId);
      const li = el('li', 'sim-item');
      const link = el('a', '', r.date);
      link.href = r.href;
      li.append(link, el('span', 'sim-days', r.days), el('span', 'sim-all', run.status === 'done' ? `${r.all} in band` : ''),
        el('span', 'sim-use', run.status === 'done' ? `${r.kWh} · ${r.litres}` : ''), el('span', 'sim-status', r.status));
      li.dataset.status = run.status;
      return li;
    }));
    more.hidden = runs.length <= SHOWN;
    more.textContent = all ? 'Show fewer' : `Show all ${runs.length}`;
  }

  async function refresh() {
    clearTimeout(timer);
    const me = ++seq;
    try {
      const data = await request('GET', `/api/rooms/${roomId}/simulations`);
      if (!alive || me !== seq) return;
      runs = Array.isArray(data) ? data : [];
      paint();
    } catch (err) {
      if (!alive || me !== seq) return;
      if (err.status === 404 && !runs) { host.hidden = true; return; } // an older server
      if (!runs) msg.textContent = "Couldn't load the simulations";
    }
    if (alive && runs?.some(isActive)) timer = setTimeout(refresh, fallbackMs(ACTIVE_MS, live.connected()));
  }

  simulate.addEventListener('click', () => {
    const room = getRoom();
    if (room) openSimulateDialog(room, { onStarted: () => { if (alive) refresh(); }, onFinished: () => { if (alive) refresh(); } });
  });
  more.addEventListener('click', () => { all = !all; paint(); });
  // A run of this room moving asks again (at most once in 2 s), instead of waiting for the timer.
  const reload = createThrottle(() => { if (alive) refresh(); }, 2000);
  const offLive = [
    live.on('simulation', (data) => { if (data.roomId === roomId) reload.call(); }),
    live.onStatus(() => { if (alive) refresh(); }), // up: once, in case events were missed; down: refresh sets the short timer
  ];
  refresh();

  return {
    refresh,
    destroy() { alive = false; seq++; clearTimeout(timer); reload.cancel(); offLive.forEach((off) => off()); host.replaceChildren(); },
  };
}
