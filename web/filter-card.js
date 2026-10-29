// The Filter card of the room page (spec 2026-10-22-filter-design.md 5): the filter pressure now on a bar marked clean and
// change pressure (or "No pressure sensor"), the days in use and when it is due, a Filter changed button with a confirm and
// the last 5 changes. createFilterCard(host, { roomId, onChanged }) → { update(room, sensor), destroy() }.
// The room and the sensor come with the page's refresh; the changes are asked again when the room's change time is not the
// one last loaded (a change made here or on another page) or the last load failed.

import { request, OFFLINE } from './api.js';
import { filterCard, changesStale, lastRunningOf } from './filter-math.js';
import { keepLines } from './text-math.js';

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

export function createFilterCard(host, { roomId, onChanged }) {
  let alive = true;
  let room = null;
  let sensor = null;
  let intake = null; // the intake fan runs: true, false, or null (cannot be told)
  let lastRunning = null; // the last reading with the intake on, shown while it is off
  let changes = [];
  let seen = { seenChangedAt: undefined, failed: false }; // the change time the list was loaded for, and whether that failed
  let loading = false;
  let seq = 0; // every changes load takes a token; a reply that finds it changed is dropped

  host.className = 'card filter-card';
  host.hidden = true;
  const head = el('div', 'sim-card-head');
  const changed = el('button', '', 'Filter changed');
  changed.type = 'button';
  head.append(el('h3', '', 'Pressure and changes'), changed); // in the Intake filter part, beside its settings
  const body = el('div', 'filter-body');
  const error = el('p', 'meta warn');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const list = el('ul', 'filter-changes');

  const confirm = el('dialog', 'confirm');
  confirm.setAttribute('aria-labelledby', `filter-confirm-${roomId}`);
  const form = el('form');
  form.method = 'dialog';
  const title = el('h2', '', 'Filter changed');
  title.id = `filter-confirm-${roomId}`;
  const actions = el('div', 'actions');
  const cancel = el('button', '', 'Cancel');
  cancel.value = 'cancel';
  const ok = el('button', 'primary', 'Filter changed');
  ok.value = 'changed';
  actions.append(cancel, ok);
  form.append(title, el('p', '', 'Record a new filter now? The days in use start again and the filter alarms clear.'), actions);
  confirm.append(form);
  host.append(head, body, error, list, confirm);

  // The bar: the reading on a scale from 0 to the fan's maximum, ticks at the clean and the change pressure, its colour by range.
  function barNode(p) {
    const bar = el('div', 'filter-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', `Filter pressure ${p.text}: clean ${p.clean} Pa, change at ${p.final} Pa`);
    const fill = el('div', `filter-fill ${p.bar.tone ?? ''}`);
    fill.style.width = `${p.bar.fill * 100}%`;
    const tick = (at, cls) => {
      const t = el('span', `filter-tick ${cls}`);
      t.style.left = `${at * 100}%`;
      return t;
    };
    bar.append(fill, tick(p.bar.cleanAt, 'clean'), tick(p.bar.finalAt, 'final'));
    return bar;
  }

  function paint() {
    if (!room) return;
    const c = filterCard({ room, sensor, changes, now: Date.now(), changesFailed: seen.failed, intake, lastRunning });
    const parts = [];
    if (c.pressure) {
      const p = c.pressure;
      if (p.value === null) parts.push(el('p', 'meta', p.text));
      else {
        const line = el('p', 'reading');
        const span = el('span');
        span.append(el('span', 'val', p.value.toFixed(1)), ' ', el('span', 'unit', 'Pa'));
        line.append(span);
        parts.push(line);
        parts.push(barNode(p));
      }
      if (p.idle) parts.push(el('p', 'meta', p.idle));
      parts.push(el('p', 'meta', keepLines(`clean ${p.clean} Pa · change at ${p.final} Pa · ${p.status}`)));
      if (p.over) parts.push(el('p', 'meta warn', 'At or above the change pressure: change the filter'));
    } else {
      parts.push(el('p', 'addr', c.noSensor));
    }
    parts.push(el('p', 'meta', c.age), el('p', c.overdue ? 'meta warn' : 'meta', c.due));
    body.replaceChildren(...parts);
    list.replaceChildren(...(c.changesError ? [el('li', 'meta warn', c.changesError)] : c.changes.map((t) => el('li', 'meta', t))));
    host.hidden = false;
  }

  async function loadChanges() {
    if (loading || !room || !changesStale(seen, room)) return;
    const me = ++seq;
    const changedAt = room.filterChangedAt;
    loading = true;
    try {
      const data = await request('GET', `/api/rooms/${roomId}/filter/changes`);
      if (!alive || me !== seq) return;
      changes = Array.isArray(data) ? data : [];
      seen = { seenChangedAt: changedAt, failed: false };
    } catch {
      if (!alive || me !== seq) return;
      seen = { ...seen, failed: true }; // the card says so; the next refresh asks again
    } finally {
      if (me === seq) loading = false;
    }
    paint();
    loadChanges(); // the change time may have moved while this load was out
  }

  changed.addEventListener('click', () => {
    confirm.returnValue = '';
    confirm.showModal();
  });

  confirm.addEventListener('close', async () => {
    if (!alive || confirm.returnValue !== 'changed') return;
    error.hidden = true;
    changed.disabled = true;
    try {
      room = await request('POST', `/api/rooms/${roomId}/filter/changed`);
      if (!alive) return;
      paint();
      loadChanges(); // the change time moved: the list is asked again
      onChanged?.();
    } catch (err) {
      if (!alive) return;
      error.textContent = err.status === 0 ? `${OFFLINE}. Try again.` : err.message;
      error.hidden = false;
    } finally {
      changed.disabled = false;
    }
  });

  return {
    // room: GET /api/rooms/:id; s: the 'dp' element of the sensors reply, or null; running: intakeRunning() of the machines view.
    update(r, s, running = null) {
      room = r;
      sensor = s ?? null;
      intake = running;
      lastRunning = lastRunningOf(lastRunning, intake, sensor);
      paint();
      loadChanges();
    },
    destroy() {
      alive = false;
      seq++;
      loading = false;
      if (confirm.open) confirm.close();
      host.replaceChildren();
    },
  };
}
