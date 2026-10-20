// The Alarms card on the room page, and the calls to the alarm routes.
// createAlarmsCard(host, { roomId, onChange, onOffline }) → { update(data), destroy() }; data is the reply of
// GET /api/rooms/:id/alarms ({ current, history }). The card is hidden while there are no current alarms.

import { request, OFFLINE } from './api.js';
import { levelLabel, isDimmed, timesLine, unackedCount, ackLabel } from './alarms-math.js';

const COMMAND_TIMEOUT = 30000;

export const fetchAlarms = () => request('GET', '/api/alarms');
export const fetchRoomAlarms = (roomId) => request('GET', `/api/rooms/${roomId}/alarms`);
export const ackAlarm = (id) => request('POST', `/api/alarms/${id}/ack`, undefined, COMMAND_TIMEOUT);
export const ackAllAlarms = (roomId) => request('POST', `/api/rooms/${roomId}/alarms/ack`, undefined, COMMAND_TIMEOUT);

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// One alarm as a list item: the level chip, the text, the times and (when asked) its Acknowledge button.
function alarmItem(a, { withAck }) {
  const li = el('li', 'al-item');
  li.dataset.level = a.level;
  li.dataset.id = a.id;
  if (isDimmed(a)) li.classList.add('dimmed');
  const chip = el('span', 'al-level', levelLabel(a.level));
  chip.dataset.level = a.level;
  const body = el('div', 'al-body');
  body.append(el('span', 'al-text', a.text), el('span', 'al-times', timesLine(a)));
  li.append(chip, body);
  if (withAck && a.ackedAt == null) {
    const b = el('button', 'al-ack', 'Acknowledge');
    b.type = 'button';
    b.dataset.ack = a.id;
    b.setAttribute('aria-label', ackLabel(a));
    li.append(b);
  }
  return li;
}

export function createAlarmsCard(host, { roomId, onChange, onOffline }) {
  let alive = true;
  let busy = false;
  host.className = 'card alarms';
  const head = el('div', 'al-head');
  head.append(el('h2', '', 'Alarms'));
  const ackAll = el('button', '', 'Acknowledge all');
  ackAll.type = 'button';
  head.append(ackAll);
  const list = el('ul', 'al-list');
  const err = el('p', 'm-error');
  err.setAttribute('role', 'status');
  err.hidden = true;
  const details = el('details', 'al-history');
  details.append(el('summary', '', 'History'));
  const historyList = el('ul', 'al-list');
  details.append(historyList);
  host.append(head, list, err, details);
  host.hidden = true;

  function showError(text) {
    if (err.textContent !== text) err.textContent = text;
    err.hidden = text === '';
  }

  // Acknowledge buttons are disabled while a request is in flight.
  function paintBusy() {
    ackAll.disabled = busy;
    for (const b of host.querySelectorAll('button[data-ack]')) b.disabled = busy;
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    paintBusy();
    showError('');
    try {
      await action();
      if (!alive) return;
      onChange?.();
    } catch (e) {
      if (!alive) return;
      if (e.status === 404) onChange?.(); // the alarm or room is gone: read the page again
      else {
        showError(e.status === 0 ? `${OFFLINE}. Try again.` : e.message);
        if (e.status === 0) onOffline?.();
      }
    } finally {
      busy = false;
      if (alive) paintBusy();
    }
  }

  host.addEventListener('click', (event) => {
    const b = event.target.closest('button[data-ack]');
    if (b) run(() => ackAlarm(Number(b.dataset.ack)));
  });
  ackAll.addEventListener('click', () => run(() => ackAllAlarms(roomId)));

  return {
    update(data) {
      if (!alive || !data) return;
      const current = data.current ?? [];
      const hadFocus = host.contains(document.activeElement);
      host.hidden = current.length === 0;
      list.replaceChildren(...current.map((a) => alarmItem(a, { withAck: true })));
      ackAll.hidden = unackedCount(current) < 1;
      paintBusy();
      historyList.replaceChildren(...(data.history ?? []).map((a) => alarmItem(a, { withAck: false })));
      // The button that was used is gone: keep focus inside the card.
      if (hadFocus && !host.contains(document.activeElement) && !host.hidden) (list.querySelector('button') ?? details.querySelector('summary')).focus();
    },
    destroy() { alive = false; host.replaceChildren(); },
  };
}
