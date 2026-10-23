// The Filter card of the room page (spec 2026-10-22-filter-design.md 5): the filter pressure now on a bar marked clean and
// change pressure (or "No pressure sensor"), the days in use and when it is due, a Filter changed button with a confirm and
// the last 5 changes. createFilterCard(host, { roomId, onChanged }) → { update(room, sensor), destroy() }.
// The changes are asked when the card is made and after a change; the room and the sensor come with the page's refresh.

import { request, OFFLINE } from './api.js';
import { filterCard } from './filter-math.js';

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
  let changes = [];
  let seq = 0; // every changes load takes a token; a reply that finds it changed is dropped

  host.className = 'card filter-card';
  host.hidden = true;
  const head = el('div', 'sim-card-head');
  const changed = el('button', '', 'Filter changed');
  changed.type = 'button';
  head.append(el('h2', '', 'Intake filter'), changed);
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

  function paint() {
    if (!room) return;
    const c = filterCard({ room, sensor, changes, now: Date.now() });
    const parts = [];
    if (c.pressure) {
      const p = c.pressure;
      if (p.value === null) parts.push(el('p', 'meta', p.text));
      else {
        const line = el('p', 'reading');
        const span = el('span');
        span.append(el('span', 'val', p.value.toFixed(1)), el('span', 'unit', 'Pa'));
        line.append(span);
        parts.push(line);
        const meter = el('meter', 'filter-meter');
        Object.assign(meter, { min: p.min, max: p.max, low: p.clean, high: p.final, optimum: p.min, value: p.value });
        meter.setAttribute('aria-label', `Filter pressure ${p.text}`);
        parts.push(meter);
      }
      parts.push(el('p', 'meta', `clean ${p.clean} Pa · change at ${p.final} Pa · ${p.status}`));
      if (p.over) parts.push(el('p', 'meta warn', 'At or above the change pressure: change the filter'));
    } else {
      parts.push(el('p', 'addr', c.noSensor));
    }
    parts.push(el('p', 'meta', c.age), el('p', c.overdue ? 'meta warn' : 'meta', c.due));
    body.replaceChildren(...parts);
    list.replaceChildren(...c.changes.map((t) => el('li', 'meta', t)));
    host.hidden = false;
  }

  async function loadChanges() {
    const me = ++seq;
    try {
      const data = await request('GET', `/api/rooms/${roomId}/filter/changes`);
      if (!alive || me !== seq) return;
      changes = Array.isArray(data) ? data : [];
      paint();
    } catch {
      // the list stays as it was; the card itself still shows
    }
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
      loadChanges();
      onChanged?.();
    } catch (err) {
      if (!alive) return;
      error.textContent = err.status === 0 ? `${OFFLINE}. Try again.` : err.message;
      error.hidden = false;
    } finally {
      changed.disabled = false;
    }
  });

  loadChanges();

  return {
    // room: GET /api/rooms/:id; s: the 'dp' element of the sensors reply, or null.
    update(r, s) {
      room = r;
      sensor = s ?? null;
      paint();
    },
    destroy() {
      alive = false;
      seq++;
      if (confirm.open) confirm.close();
      host.replaceChildren();
    },
  };
}
