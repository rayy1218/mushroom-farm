// The Simulations card of the room page: the last runs of the room, each linking to its page, a Simulate button that opens
// the same stepper as the Rooms list, and Suggest machines beside it (its own page since 2026-10-28). createSimulationsCard(host, { roomId, getRoom, onOffline }) → { refresh(), destroy() }.
// While a run is going the list is asked every 2 s, otherwise only when asked for (after a run was started).

import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { request } from './api.js';
import { openSimulateDialog } from './simulate-dialog.js';
import { runRow, isActive, compareRuns, differingLines } from './simulation-math.js';
import { suggestHash } from './route.js';

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
  let picked = []; // up to two run ids to compare (the oldest pick drops out for a third)

  host.className = 'card sim-card';
  const head = el('div', 'sim-card-head');
  const simulate = el('button', 'primary', 'Simulate');
  simulate.type = 'button';
  const suggest = el('a', 'button', 'Suggest machines');
  suggest.href = suggestHash(roomId);
  const buttons = el('div', 'sim-card-actions');
  buttons.append(suggest, simulate);
  head.append(el('h2', '', 'Simulations'), buttons);
  const msg = el('p', 'none', 'Loading…');
  const list = el('ul', 'sim-list');
  const more = el('button', '', '');
  more.type = 'button';
  more.hidden = true;
  const compare = el('div', 'sim-compare');
  compare.hidden = true;
  host.append(head, msg, list, more, compare);

  let painted = ''; // what the list shows: a refresh with nothing new leaves it (and its focus and clicks) alone

  function paint() {
    const shown = all ? runs : runs.slice(0, SHOWN);
    const key = JSON.stringify([all, picked, shown.map((r) => [r.id, r.status, r.progress, r.summary?.inBand?.all])]);
    if (key === painted) return;
    painted = key;
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
    msg.hidden = runs.length > 0;
    msg.textContent = 'No simulations yet. Simulate shows how this room would do over days, with your crops and machines.';
    const header = el('li', 'sim-item sim-list-head');
    header.setAttribute('aria-hidden', 'true'); // the columns' names for the eye; each cell says what it is to a screen reader
    header.append(el('span', '', 'Run and machines'), el('span', '', 'Length'), el('span', '', 'In band'), el('span', '', 'Energy · water'), el('span', ''), el('span', '', 'Compare'));
    const given = differingLines(shown); // what tells runs of the same machines apart
    list.replaceChildren(...(shown.length ? [header] : []), ...shown.map((run, i) => {
      const r = runRow(run, roomId);
      const li = el('li', 'sim-item');
      const link = el('a', '', r.date);
      link.href = r.href;
      link.dataset.focusKey = `link-${run.id}`;
      const name = el('div', 'sim-name');
      name.append(link, el('span', 'sim-machines', r.machines));
      if (given[i]) name.append(el('span', 'sim-given', given[i]));
      const inBand = el('span', 'sim-all pill', run.status === 'done' ? `${r.all} in band` : '');
      inBand.dataset.tone = r.tone;
      const pick = el('label', 'sim-pick');
      const box = el('input');
      box.type = 'checkbox';
      box.name = 'compare';
      box.value = String(run.id);
      box.id = `sim-pick-${run.id}`;
      box.checked = picked.includes(run.id);
      box.disabled = run.status !== 'done';
      box.setAttribute('aria-label', `Compare the run of ${r.date}`);
      box.dataset.focusKey = `pick-${run.id}`;
      box.addEventListener('change', () => {
        picked = box.checked ? [...picked.filter((x) => x !== run.id), run.id].slice(-2) : picked.filter((x) => x !== run.id);
        paint();
      });
      pick.append(box, el('span', 'sim-pick-word', 'Compare'));
      li.append(name, el('span', 'sim-length', r.days), inBand,
        el('span', 'sim-use', run.status === 'done' ? `${r.kWh} · ${r.litres}` : ''), el('span', 'sim-status', run.status === 'done' ? '' : r.status), pick);
      li.dataset.status = run.status;
      return li;
    }));
    if (focused) list.querySelector(`[data-focus-key="${focused}"]`)?.focus();
    paintCompare();
    more.hidden = runs.length <= SHOWN;
    more.textContent = all ? 'Show fewer' : `Show all ${runs.length}`;
  }

  // The word beside a differing row's name, for the eye (critique 2026-10-29: not a stripe down its side); the screen reader
  // hears '(differs)'.
  function differs() {
    const word = el('span', 'sim-differs', 'differs');
    word.setAttribute('aria-hidden', 'true');
    return word;
  }

  // Two runs picked: their inputs and results side by side, the rows that differ in bold.
  function paintCompare() {
    const [a, b] = picked.map((id) => runs.find((x) => x.id === id)).filter(Boolean);
    if (a && !b) { // one ticked: say what the tick is for
      compare.hidden = false;
      compare.replaceChildren(el('p', 'muted sim-compare-hint', 'Tick one more run to compare the two side by side.'));
      return;
    }
    compare.hidden = !(a && b);
    if (compare.hidden) { compare.replaceChildren(); return; }
    const table = el('table', 'us-table sim-compare-table');
    table.append(el('caption', '', 'Two runs side by side (the rows that differ are marked)'));
    const head = el('tr');
    head.append(el('th', '', ''), el('th', '', runRow(a, roomId).date), el('th', '', runRow(b, roomId).date));
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    for (const row of compareRuns(a, b)) {
      const tr = el('tr');
      if (row.differ) tr.dataset.differ = 'true';
      const th = el('th', '', row.label);
      th.scope = 'row';
      if (row.differ) th.append(el('span', 'sr-only', ' (differs)'), differs());
      tr.append(th, el('td', '', row.a), el('td', '', row.b));
      body.append(tr);
    }
    table.append(thead, body);
    const wrap = el('div', 'us-table-wrap');
    wrap.append(table);
    const clear = el('button', '', 'Clear the comparison');
    clear.type = 'button';
    clear.addEventListener('click', () => { picked = []; paint(); });
    compare.replaceChildren(wrap, clear);
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
