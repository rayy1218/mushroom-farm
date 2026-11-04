// The room's Harvest tab (spec 2026-11-04-harvest-design.md 3 and 7): Record a harvest; This run (when the blocks went in,
// the tiles, the flushes, By crop in a mixed room, a note when Settings → Yield lacks a figure); the run's Harvests, newest
// first, each with Edit and Delete; Past runs, each opening to its flushes and harvests. createHarvestCard(host, { roomId,
// onGone }) → { destroy() }. The card asks for its own data: on the room's harvest events and crop changes (New
// blocks starts a run), when the stream comes back, and on a timer (60 s; slower while the stream is up).

import { request, OUTDATED, routeMissing } from './api.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { cropShortName } from './crops.js';
import { picture } from './pictures.js';
import { roomHash } from './route.js';
import { DOT } from './text-math.js';
import { openForm, closeTaskDialog, loadWorkers, setWorker, workerField, errorText } from './task-dialogs.js';
import {
  runHead, harvestLine, pastRow, PAST_COLUMNS, missingNote, flushColumns, flushRows, BY_CROP_COLUMNS, byCropRows, runTiles, pricesNote,
  deleteTitle, deleteLead, whenBoxes, recordBody, editBody,
} from './harvest-math.js';

const REFRESH_MS = 60_000;
const COMMAND_TIMEOUT = 15000;
const SHOWN = 20; // the run's latest harvests; Show all for the rest
const SHOWN_PAST = 8; // an opened past run's latest harvests
const YIELD = 'Settings → Yield';

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(label, className) {
  const b = el('button', className ?? '', label);
  b.type = 'button';
  return b;
}

// A table of figures: the first column names the row, the columns from `numFrom` are numbers (right, tabular).
function table(caption, columns, rows, numFrom) {
  const wrap = el('div', 'us-table-wrap');
  const t = el('table', 'us-table hv-table');
  t.append(el('caption', '', caption));
  t.append(headRow(columns, numFrom));
  const body = el('tbody');
  for (const r of rows) {
    const tr = el('tr');
    r.forEach((cell, i) => {
      const td = el(i === 0 ? 'th' : 'td', i >= numFrom ? 'num' : i === 0 ? '' : 'hv-days', cell);
      if (i === 0) td.scope = 'row';
      tr.append(td);
    });
    body.append(tr);
  }
  t.append(body);
  wrap.append(t);
  return wrap;
}

// A table's head: the column names (BE spelt out for a pointer and a screen reader), the figures' right-aligned.
function headRow(columns, numFrom) {
  const head = el('tr');
  columns.forEach((c, i) => {
    const th = el('th', i >= numFrom ? 'num' : '');
    th.append(figureName(c, c === 'BE' ? 'Biological efficiency' : null));
    th.scope = 'col';
    head.append(th);
  });
  const thead = el('thead');
  thead.append(head);
  return thead;
}

const flushTable = (run) => table('Flushes', flushColumns(run.crops), flushRows(run), 2);

// "Set the price of Grey oyster in Settings → Yield." with Settings → Yield a link to Settings.
export function missingLine(missing) {
  const note = missingNote(missing);
  if (!note) return null;
  const p = el('p', 'muted hv-missing');
  const at = note.indexOf(YIELD);
  const a = el('a', '', YIELD);
  a.href = '#/settings';
  p.append(note.slice(0, at), a, note.slice(at + YIELD.length));
  return p;
}

// A figure's name: BE spelt out for a pointer and a screen reader (<abbr title>), the others as they are.
export function figureName(text, title) {
  if (!title) return text;
  const abbr = el('abbr', '', text);
  abbr.title = title;
  return abbr;
}

// The tiles of runTiles or pageTiles: [{ label, title?, value, line? }].
export function tileNodes(list) {
  return list.map((t) => {
    const tile = el('div', 'us-tile');
    const label = el('p', 'us-label');
    label.append(figureName(t.label, t.title));
    tile.append(label, el('p', 'us-kwh', t.value));
    if (t.line) tile.append(el('p', 'us-basis hv-basis', t.line));
    return tile;
  });
}

export function createHarvestCard(host, { roomId, onGone }) {
  let alive = true;
  let seq = 0; // every load takes a token; an answer that finds it changed is dropped
  let timer = null;
  let view = null; // GET /api/rooms/:id/harvests
  let painted = ''; // what the parts show: a refresh with nothing new leaves them (and their focus and folds) alone
  let showAll = false;
  const openRuns = new Set(); // the past runs opened, kept over a repaint
  const allOf = new Set(); // the past runs showing all their harvests
  let pendingFocus = null; // after a Delete: where the cursor goes once the row is gone (focus keys, the first found)

  const hostClass = host.className;
  host.className = 'hv-grid';

  // the head: Record a harvest, off with a note while the room has no crops (gone while it never had any: the empty card says it)
  const head = el('div', 'hv-head');
  const record = button('Record a harvest', 'primary');
  record.disabled = true; // until the first answer says whether the room has a run
  const recordNote = el('p', 'muted hv-note');
  const toCrop = el('a', '', 'Crop tab');
  toCrop.href = roomHash(roomId, 'crop');
  recordNote.append('Give the room its crops on the ', toCrop, ' first');
  recordNote.id = `hv-${roomId}-record-note`;
  recordNote.hidden = true;
  const error = el('p', 'meta warn tk-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  head.append(record, recordNote, error);

  // This run
  const runCard = el('section', 'card hv-part hv-run-card');
  const runLine = el('p', 'muted tk-sub', 'Loading…');
  const tiles = el('div', 'us-tiles hv-tiles');
  const runBody = el('div', 'hv-body');
  runCard.append(el('h2', '', 'This run'), runLine, tiles, runBody);

  // Harvests
  const listCard = el('section', 'card hv-part hv-list-card');
  const list = el('ul', 'hv-list');
  const listNone = el('p', 'none', 'No harvests recorded in this run yet.');
  const more = button('');
  const listTitle = el('h2', '', 'Harvests');
  listTitle.tabIndex = -1;
  listTitle.dataset.focusKey = 'harvests-title';
  listCard.append(listTitle, el('p', 'muted tk-sub', "This run's harvests, newest first."), list, listNone, more);

  // Past runs: a table, a row per run opening below it to the run's flushes and harvests
  const pastCard = el('section', 'card hv-part hv-past-card');
  const pastList = el('div', 'us-table-wrap hv-runs');
  pastCard.append(el('h2', '', 'Past runs'), el('p', 'muted tk-sub', 'Each New blocks starts a run; a run keeps its figures.'), pastList);

  // No run ever: the room has never had crops (an empty state: dashed, the basket faded, the way to the Crop tab)
  const emptyCard = el('section', 'card hv-part hv-empty');
  const giveCrops = el('a', 'button', 'Give it crops on the Crop tab');
  giveCrops.href = roomHash(roomId, 'crop');
  emptyCard.append(picture('task', 'harvestDaily', { size: 40 }), el('p', 'none', 'No crops in this room yet.'), giveCrops);

  for (const node of [runCard, listCard, pastCard, emptyCard]) node.hidden = true;
  runCard.hidden = false; // its line says Loading…
  host.replaceChildren(head, runCard, listCard, pastCard, emptyCard);

  const showError = (text) => {
    if (!alive) return;
    error.textContent = text;
    error.hidden = !text;
    if (text) head.hidden = false;
  };

  // ---- painting ----

  function harvestRow(h, run, fallback) {
    const mixed = (run.crops ?? []).length > 1;
    const l = harvestLine(h, { mixed });
    const li = el('li', 'hv-row');
    li.dataset.id = String(h.id);
    const text = el('div', 'hv-text');
    const title = el('p', 'hv-title');
    title.append(el('span', 'hv-kg', l.kg), `${DOT}${l.what}`);
    text.append(title, el('p', 'hv-meta', [l.when, l.who, l.from].filter(Boolean).join(DOT)));
    const actions = el('div', 'tk-actions');
    const edit = button('Edit', 'tk-quiet');
    edit.dataset.focusKey = `edit-${h.id}`;
    edit.setAttribute('aria-label', `Edit ${l.kg} picked ${l.when}`);
    edit.addEventListener('click', () => editHarvest(h, run));
    const del = button('Delete', 'tk-quiet');
    del.dataset.focusKey = `delete-${h.id}`;
    del.setAttribute('aria-label', `Delete ${l.kg} picked ${l.when}`);
    del.addEventListener('click', () => deleteHarvest(h, li, fallback));
    actions.append(edit, del);
    li.append(picture('task', 'harvestDaily', { crop: h.crop, size: 32 }), text, actions);
    return li;
  }

  function paintRun(run) {
    runLine.textContent = runHead(run);
    tiles.replaceChildren(...tileNodes(runTiles(run)));
    // under the tiles, what they leave out: the prices the cost is at, a figure missing in Settings → Yield
    const prices = pricesNote(run.cost);
    const parts = [prices && el('p', 'muted hv-missing', prices), missingLine(run.missing)].filter(Boolean);
    if ((run.flushes ?? []).length) parts.push(flushTable(run));
    if ((run.crops ?? []).length > 1) parts.push(table('By crop', BY_CROP_COLUMNS, byCropRows(run), 1));
    runBody.replaceChildren(...parts);
    const harvests = run.harvests ?? [];
    const shown = showAll ? harvests : harvests.slice(0, SHOWN);
    list.replaceChildren(...shown.map((h) => harvestRow(h, run, 'harvests-title')));
    listNone.hidden = harvests.length > 0;
    more.hidden = shown.length === harvests.length;
    more.textContent = `Show all ${harvests.length}`;
  }

  // A past run: its row (the dates a button that opens it) and the row under it with its flushes and latest harvests.
  function pastRun(run) {
    const row = pastRow(run);
    const tr = el('tr', 'hv-run-row');
    const name = el('th');
    name.scope = 'row';
    const toggle = button(row.title, 'hv-run-toggle');
    toggle.dataset.focusKey = `run-${run.id}`;
    toggle.setAttribute('aria-controls', `hv-run-${run.id}`);
    name.append(toggle);
    tr.append(name, ...row.cells.map((c, i) => {
      const td = el('td', i >= 1 ? 'num' : 'hv-run-crops', c);
      td.dataset.label = PAST_COLUMNS[i + 1];
      return td;
    }));
    const detail = el('tr', 'hv-run-detail');
    detail.id = `hv-run-${run.id}`;
    const cell = el('td');
    cell.colSpan = PAST_COLUMNS.length;
    const body = el('div', 'hv-run-body');
    const harvests = run.harvests ?? [];
    const note = missingLine(run.missing);
    if (note) body.append(note);
    if ((run.flushes ?? []).length) body.append(flushTable(run));
    if (harvests.length) {
      const all = allOf.has(run.id);
      const ul = el('ul', 'hv-list');
      ul.append(...(all ? harvests : harvests.slice(0, SHOWN_PAST)).map((h) => harvestRow(h, run, `run-${run.id}`)));
      body.append(ul);
      if (!all && harvests.length > SHOWN_PAST) {
        const rest = button(`Show all ${harvests.length}`);
        rest.addEventListener('click', () => {
          allOf.add(run.id);
          paint();
          const first = host.querySelector(`#hv-run-${run.id} .hv-list`)?.children[SHOWN_PAST];
          if (first) { first.tabIndex = -1; first.focus(); }
        });
        body.append(rest);
      }
    } else body.append(el('p', 'none', 'No harvests in this run.'));
    cell.append(body);
    detail.append(cell);
    const show = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      detail.hidden = !open;
      tr.classList.toggle('open', open);
    };
    show(openRuns.has(run.id));
    toggle.addEventListener('click', () => {
      const open = !openRuns.has(run.id);
      if (open) openRuns.add(run.id); else openRuns.delete(run.id);
      show(open);
    });
    return [tr, detail];
  }

  function pastTable(past) {
    const t = el('table', 'us-table hv-table hv-runs-table');
    t.append(el('caption', 'sr-only', 'Past runs'), headRow(PAST_COLUMNS, 2));
    const body = el('tbody');
    for (const run of past) body.append(...pastRun(run));
    t.append(body);
    return t;
  }

  function paint() {
    const key = JSON.stringify([view, showAll, [...allOf]]);
    if (key === painted) return;
    painted = key;
    // the cursor on a row's button or a run's fold comes back to the same one after the repaint
    const focusKey = host.contains(document.activeElement) ? document.activeElement.dataset?.focusKey : null;
    const keys = pendingFocus ?? (focusKey ? [focusKey] : []);
    pendingFocus = null;
    const run = view.current;
    const past = Array.isArray(view.past) ? view.past : [];
    const never = !run && past.length === 0; // never had crops: no button, the empty card shows the way
    record.disabled = !run;
    record.hidden = never;
    recordNote.hidden = Boolean(run) || never;
    if (run || never) record.removeAttribute('aria-describedby');
    else record.setAttribute('aria-describedby', recordNote.id);
    runCard.hidden = !run;
    listCard.hidden = !run;
    if (run) paintRun(run);
    pastCard.hidden = past.length === 0;
    pastList.replaceChildren(...(past.length ? [pastTable(past)] : []));
    emptyCard.hidden = !never;
    head.hidden = never && error.hidden; // nothing in it: no gap above the empty card
    for (const key of keys) {
      const node = host.querySelector(`[data-focus-key="${key}"]`);
      if (node && !node.closest('[hidden]')) { node.focus(); break; }
    }
  }

  // ---- loading ----

  async function refresh() {
    if (!alive) return;
    clearTimeout(timer);
    const me = ++seq;
    try {
      const data = await request('GET', `/api/rooms/${roomId}/harvests`);
      if (!alive || me !== seq) return;
      view = data;
      paint();
    } catch (err) {
      if (!alive || me !== seq) return;
      if (routeMissing(err)) { // a farm app from before the harvests: say so, nothing else
        runLine.textContent = OUTDATED;
        record.hidden = true;
        return;
      }
      if (err.status === 404) { onGone?.(); return; }
      if (!view) runLine.textContent = "Couldn't load the harvests";
    }
    if (!alive) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, fallbackMs(REFRESH_MS, live.connected()));
  }

  // A change (here or elsewhere) asks again at most once in 2 s.
  const reload = createThrottle(() => { if (alive) refresh(); });
  const changed = () => { if (alive) { showError(''); painted = ''; reload.call(); } };

  // ---- Record, Edit and Delete ----

  // A command; after it (and after a 404 or 409: gone, or the crops cleared meanwhile) the harvests are asked again.
  async function send(method, path, body) {
    try {
      await request(method, path, body, COMMAND_TIMEOUT);
      changed();
      return true;
    } catch (err) {
      if (err.status === 404 || err.status === 409) changed();
      if (err.status === 400 && err.field === 'worker') window.dispatchEvent(new CustomEvent('farm:worker')); // renamed or removed
      return err.status === 400 && err.field ? { field: err.field, message: err.message } : { message: errorText(err) };
    }
  }

  const ask = (options) => openForm({ ...options, onLost: (text) => showError(text) });
  const kgField = (value) => ({ name: 'kg', label: 'kg picked', kind: 'number', value });
  // the day (the browser's date box, from the run's start to its end or today) and a 24 h time typed in a text box
  const whenFields = (shown, run, now) => [
    { name: 'pickedDate', label: 'Date', kind: 'date', value: shown.date, min: whenBoxes(run.startedAt).date, max: whenBoxes(Math.min(run.endedAt ?? now, now)).date },
    { name: 'pickedTime', label: 'Time', kind: 'text', value: shown.time, placeholder: '08:12', inputMode: 'decimal', maxLength: 5, hint: '24 h, like 08:12' },
  ];
  // the server's word on the time is about the day or the time: shown under the date box
  const onTime = (r) => (r !== true && r.field === 'pickedAt' ? { ...r, field: 'pickedDate' } : r);

  async function recordHarvest() {
    const run = view?.current;
    if (!run) return;
    let names;
    try {
      names = await loadWorkers();
    } catch (err) {
      showError(errorText(err));
      return;
    }
    if (!alive) return;
    const now = Date.now();
    const shown = whenBoxes(now);
    const crops = run.crops ?? [];
    const lead = [runHead(run)];
    if (!names.length) {
      const p = el('p', 'tk-lead');
      const a = el('a', '', 'Settings');
      a.href = '#/settings';
      p.append("No names yet: add the workers' names in ", a, ' first.');
      lead.push(p);
    }
    ask({
      title: 'Record a harvest',
      lead,
      fields: [
        ...(crops.length > 1 ? [{ name: 'crop', label: 'Crop', kind: 'select', value: crops[0].crop, options: crops.map((c) => [c.crop, cropShortName(c.crop)]) }] : []),
        kgField(''), workerField(names, 'Who picked it'), ...whenFields(shown, run, now),
      ],
      buttons: [{ value: 'record', label: 'Record', primary: true }],
      submit: async (v) => {
        const body = recordBody(v, { run, now: Date.now(), shown });
        if (body.error) return { field: body.field, message: body.error };
        setWorker(body.worker); // kept for the next Done, as the Done dialog does
        return onTime(await send('POST', `/api/rooms/${roomId}/harvests`, body));
      },
    });
  }

  function editHarvest(h, run) {
    const now = Date.now();
    const shown = whenBoxes(h.pickedAt);
    const l = harvestLine(h, { mixed: true }); // the crop named, whatever the room
    ask({
      title: 'Edit a harvest',
      lead: [[l.what, l.who, l.from].filter(Boolean).join(DOT)],
      fields: [kgField(String(h.kg)), ...whenFields(shown, run, now)],
      buttons: [{ value: 'save', label: 'Save', primary: true }],
      submit: async (v) => {
        const body = editBody(v, h, { run, now: Date.now(), shown });
        if (body.error) return { field: body.field, message: body.error };
        if (Object.keys(body).length === 0) return true; // nothing changed
        return onTime(await send('PUT', `/api/harvests/${h.id}`, body));
      },
    });
  }

  // After it the cursor goes to the next row's Edit (the previous row's when it was the last), else the list's title (the
  // Harvests card's, or a past run's fold).
  function deleteHarvest(h, li, fallback) {
    const near = li.nextElementSibling ?? li.previousElementSibling;
    ask({
      title: deleteTitle(h),
      lead: [deleteLead(h), ...(h.taskId ? ["Its harvest check's kg becomes the total of what is left."] : [])],
      buttons: [{ value: 'delete', label: 'Delete', primary: true, danger: true }],
      closeLabel: 'Keep it',
      submit: async () => {
        pendingFocus = [near && `edit-${near.dataset.id}`, fallback].filter(Boolean);
        const r = await send('DELETE', `/api/harvests/${h.id}`);
        if (r !== true) pendingFocus = null;
        return r;
      },
    });
  }

  record.addEventListener('click', recordHarvest);
  more.addEventListener('click', () => {
    const at = list.children.length;
    showAll = true;
    paint();
    const first = list.children[at];
    if (first) { first.tabIndex = -1; first.focus(); }
  });

  // The room's harvests changed (a Record, an Edit, a Done on a harvest check) or its crops (New blocks starts a run): ask
  // again. The stream back: ask once. The stream gone: the short timer.
  const offLive = [
    live.on('harvest', (d) => { if (d.roomId === roomId) reload.call(); }),
    live.on('room', (d) => { if (d.id === roomId && d.part === 'crop') reload.call(); }),
    live.onStatus((up) => {
      if (up) reload.call();
      else if (view) { clearTimeout(timer); timer = setTimeout(refresh, REFRESH_MS); }
    }),
  ];
  refresh();

  return {
    destroy() {
      alive = false;
      seq++;
      clearTimeout(timer);
      reload.cancel();
      for (const off of offLive) off();
      closeTaskDialog();
      host.replaceChildren();
      host.className = hostClass;
    },
  };
}
