// The Alarms card on the room page, and the calls to the alarm routes.
// createAlarmsCard(host, { roomId, onChange, onOffline }) → { update(data, readings), focus(), destroy() }; data is the reply of
// GET /api/rooms/:id/alarms ({ current, history }), readings the room's values now ({ t, rh, co2, pa }, null where not
// known) for the "now" beside an alarm's text. The card is hidden while there are no current alarms; it takes the tone of
// its worst active alarm, and a visually hidden live line announces only the alarms that are new. The active alarms come
// first; the cleared ones nobody acknowledged fold into one line, grouped by cause, in neutral grey (spec
// 2026-11-12-alarms-triage-design.md 5). createAlarmStrip(host, { href, onOpen }): the one line off the Now tab (6).

import { request, OFFLINE } from './api.js';
import {
  levelLabel, isDimmed, timesLine, ackLabel, nowText, cardTone, newAlarmText, tierText, alarmTime, splitAlarms, causeGroups, foldText,
  stripText, heldText,
} from './alarms-math.js';

const COMMAND_TIMEOUT = 30000;

export const fetchAlarms = () => request('GET', '/api/alarms');
export const fetchRoomAlarms = (roomId) => request('GET', `/api/rooms/${roomId}/alarms`);
export const ackAlarm = (id) => request('POST', `/api/alarms/${id}/ack`, undefined, COMMAND_TIMEOUT);
export const ackAllAlarms = (roomId) => request('POST', `/api/rooms/${roomId}/alarms/ack`, undefined, COMMAND_TIMEOUT);
export const ackSomeAlarms = (ids) => request('POST', '/api/alarms/ack', { ids }, COMMAND_TIMEOUT);

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// One alarm as a list item: the level chip, the text (with the value now), the times and (when asked) its Acknowledge button.
function alarmItem(a, { withAck, readings = null }) {
  const li = el('li', 'al-item');
  li.dataset.level = a.level;
  li.dataset.id = a.id;
  if (isDimmed(a)) li.classList.add('dimmed');
  const chip = el('span', 'al-level', levelLabel(a.level));
  chip.dataset.level = a.level;
  const body = el('div', 'al-body');
  const text = el('span', 'al-text', a.text);
  const now = nowText(a, readings);
  if (now) text.append(el('span', 'al-now', ` · ${now}`));
  body.append(text);
  const held = a.clearedAt == null ? heldText(a.held) : '';
  if (held) body.append(el('span', 'al-held', held)); // a gateway or relay module alarm: what waits under it
  // History names a gateway alarm's address (its text leads with the place)
  body.append(el('span', 'al-times', `${timesLine(a)}${!withAck && a.gatewayAddress ? ` · gateway ${a.gatewayAddress}` : ''}`));
  li.append(chip, body);
  if (withAck && a.ackedAt == null) {
    const b = el('button', 'al-ack', 'Acknowledge'); // a worker acknowledges too (spec 2026-11-12-alarms-triage-design.md 7)
    b.type = 'button';
    b.dataset.ack = a.id;
    b.setAttribute('aria-label', ackLabel(a));
    li.append(b);
  }
  return li;
}

// One group of cleared alarms (causeGroups): a neutral "Cleared" chip, its text, when it last cleared and one Acknowledge for
// the whole group. The room page's row (.al-item).
export function clearedItem(g) {
  const li = el('li', 'al-item al-cleared-item');
  const chip = el('span', 'al-level', 'Cleared');
  chip.dataset.level = 'cleared';
  const body = el('div', 'al-body');
  body.append(el('span', 'al-text', g.text), el('span', 'al-times', `Last cleared ${alarmTime(g.lastCleared)}`));
  li.append(chip, body);
  if (g.unacked > 0) li.append(groupAck(g));
  return li;
}

// A group's Acknowledge: every id of the group in one request.
export function groupAck(g) {
  const b = el('button', 'al-ack', 'Acknowledge');
  b.type = 'button';
  b.dataset.ackIds = g.ids.join(',');
  b.setAttribute('aria-label', `Acknowledge cleared: ${g.text}`);
  return b;
}

// Where the focus goes once an Acknowledge has done its work and the card is painted again (critique 2026-11-12: it had gone to
// the first active alarm's button, so Enter twice acknowledged a live alarm). origin: { zone: 'cleared' | 'active', index } from
// originOf. A cleared group's: the next group's Acknowledge, else the fold's toggle; anything else, or nothing left there: the
// card's title (never another active alarm's button); a hidden card: fallback().
export function originOf(button, card) {
  if (!button.closest('.al-fold')) return { zone: 'active', index: 0 };
  const groups = [...card.querySelectorAll('.al-cleared button[data-ack-ids]')];
  return { zone: 'cleared', index: Math.max(0, groups.indexOf(button)) };
}
export function focusAfterAck(card, origin, fallback = () => {}) {
  if (card.hidden) return fallback();
  if (origin?.zone === 'cleared') {
    const left = [...card.querySelectorAll('.al-fold-body:not([hidden]) .al-cleared button[data-ack-ids]')].filter((b) => b.offsetParent !== null);
    if (left.length) return left[Math.min(origin.index, left.length - 1)].focus();
    const toggle = card.querySelector('.al-fold:not([hidden]) .al-fold-toggle');
    if (toggle) return toggle.focus();
  }
  const title = card.querySelector('h2');
  if (title) { title.tabIndex = -1; title.focus(); }
}

// The fold of the cleared alarms: "8 cleared to review" and Review / Hide over Acknowledge all cleared and the groups. item: a
// group's row (the room page's clearedItem by default; the Overview's own). A phone shows the first PHONE_GROUPS groups and
// "Show all N" (UI audit 2026-11-12: 14 groups were 2,300 px). → { node, paint(cleared) }.
const PHONE_GROUPS = 5;
let foldSeq = 0;
export function createFold({ item = clearedItem } = {}) {
  const node = el('div', 'al-fold');
  const toggle = el('button', 'al-fold-toggle');
  toggle.type = 'button';
  const line = el('span', 'al-fold-text');
  const word = el('span', 'al-fold-word', 'Review');
  // the card's title in front while the card is quiet (no active alarm: the fold is its only line); the h2 stays for a screen
  // reader, so this one is hidden from it
  const title = el('span', 'al-fold-title', 'Alarms');
  title.setAttribute('aria-hidden', 'true');
  toggle.append(title, line, word);
  const body = el('div', 'al-fold-body');
  body.id = `al-cleared-${++foldSeq}`;
  toggle.setAttribute('aria-controls', body.id);
  // one tap for every cleared alarm (UI check 2026-11-12: 35 after one outage were 14 rows of Acknowledge on a phone)
  const all = el('button', 'al-ack-cleared', 'Acknowledge all cleared');
  all.type = 'button';
  const list = el('ul', 'al-list al-cleared');
  const more = el('button', 'al-fold-more');
  more.type = 'button';
  body.append(all, list, more);
  let open = false;
  let whole = false; // "Show all" was used
  let last = [];
  const show = () => {
    toggle.setAttribute('aria-expanded', String(open));
    word.textContent = open ? 'Hide' : 'Review';
    body.hidden = !open;
  };
  const paintList = () => {
    const groups = causeGroups(last);
    const cap = !whole && matchMedia('(max-width: 760px)').matches ? PHONE_GROUPS : Infinity;
    list.replaceChildren(...groups.slice(0, cap).map((g) => item(g)));
    more.hidden = groups.length <= cap;
    more.textContent = `Show all ${groups.length}`;
  };
  toggle.addEventListener('click', () => { open = !open; show(); });
  more.addEventListener('click', () => {
    whole = true;
    paintList();
    list.querySelectorAll('button[data-ack-ids]')[PHONE_GROUPS]?.focus(); // the first row it added
  });
  node.append(toggle, body);
  show();
  return {
    node,
    paint(cleared) {
      last = cleared;
      node.hidden = cleared.length === 0;
      line.textContent = foldText(cleared.length);
      toggle.setAttribute('aria-label', `Alarms: ${foldText(cleared.length)}`);
      const unacked = cleared.filter((a) => a.ackedAt == null).map((a) => a.id);
      all.hidden = unacked.length < 2;
      all.dataset.ackIds = unacked.slice(0, 500).join(',');
      paintList();
    },
  };
}

// The line off the Now tab: "1 active alarm · 7 cleared to review", then a chevron, toned by the worst active alarm (the cleared
// part in grey beside a red one); hidden without current alarms and while shown is false (the Now tab). Its name says the whole
// line with "Open on Now". onOpen: called on a click (the page puts the focus on the card once Now shows). → { update(data), show(shown) }.
export function createAlarmStrip(host, { href, onOpen }) {
  host.className = 'al-strip';
  host.href = href;
  host.hidden = true;
  host.addEventListener('click', () => onOpen?.());
  let text = null;
  let shown = false;
  const paint = () => { host.hidden = !shown || text === null; };
  return {
    update(data) {
      if (!data) return;
      const { active, cleared } = splitAlarms(data.current);
      text = stripText({ active: active.length, cleared: cleared.length });
      if (text !== null && host.getAttribute('aria-label') !== text) {
        const parts = text.split(' · ').slice(0, -1); // without "Open on Now": the chevron says it (critique 2026-11-12)
        const words = el('span', 'al-strip-text');
        parts.forEach((part, i) => {
          if (i > 0) words.append(' · ');
          words.append(el('span', i === 1 ? 'al-strip-cleared' : '', part));
        });
        host.replaceChildren(words);
        host.setAttribute('aria-label', text);
      }
      host.dataset.tone = cardTone(active);
      paint();
    },
    show(on) { shown = on; paint(); },
  };
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
  head.querySelector('h2').tabIndex = -1; // the strip off Now puts the focus here
  const list = el('ul', 'al-list');
  const fold = createFold();
  const err = el('p', 'm-error');
  err.setAttribute('role', 'status');
  err.hidden = true;
  const details = el('details', 'al-history');
  details.append(el('summary', '', 'History'));
  const historyList = el('ul', 'al-list');
  details.append(historyList);
  const said = el('p', 'sr-only');
  said.setAttribute('aria-live', 'polite'); // only the new alarms' line, not the whole list on every refresh
  host.append(head, said, list, fold.node, err, details);
  host.hidden = true;
  let seen = null; // the ids of the alarms painted last (null before the first paint)
  let levels = new Map(); // id → level painted last: a tier change is announced too
  let origin = null; // where the last Acknowledge was used (originOf), for the focus once the card is painted again
  let activeIds = []; // the active alarms not acknowledged: what Acknowledge all acknowledges (never the folded cleared ones)

  function showError(text) {
    if (err.textContent !== text) err.textContent = text;
    err.hidden = text === '';
  }

  // Acknowledge buttons are disabled while a request is in flight.
  function paintBusy() {
    ackAll.disabled = busy;
    for (const b of host.querySelectorAll('button[data-ack], button[data-ack-ids]')) b.disabled = busy;
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    paintBusy();
    showError('');
    try {
      await action();
      window.dispatchEvent(new Event('farm:alarms-changed')); // the nav badge counts again at once
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
    if (b) { origin = originOf(b, host); run(() => ackAlarm(Number(b.dataset.ack))); }
    const group = event.target.closest('button[data-ack-ids]');
    if (group) { origin = originOf(group, host); run(() => ackSomeAlarms(group.dataset.ackIds.split(',').map(Number))); }
  });
  // the active ones only (critique 2026-11-12: it had also acknowledged the cleared ones folded out of sight)
  ackAll.addEventListener('click', () => { origin = { zone: 'active', index: 0 }; run(() => ackSomeAlarms(activeIds)); });

  return {
    update(data, readings = null) {
      if (!alive || !data) return;
      const current = data.current ?? [];
      const hadFocus = host.contains(document.activeElement);
      host.hidden = current.length === 0;
      host.dataset.tone = cardTone(current); // amber for warnings only, red from serious up
      const fresh = [newAlarmText(seen, current), tierText(levels, current)].filter(Boolean).join('. ');
      if (fresh) said.textContent = fresh;
      seen = new Set(current.map((a) => a.id));
      levels = new Map(current.map((a) => [a.id, a.level]));
      const { active, cleared } = splitAlarms(current);
      host.dataset.quiet = String(active.length === 0); // only cleared ones: one 44 px line until Review opens it
      list.hidden = active.length === 0;
      list.replaceChildren(...active.map((a) => alarmItem(a, { withAck: true, readings })));
      fold.paint(cleared);
      activeIds = active.filter((a) => a.ackedAt == null).map((a) => a.id);
      ackAll.hidden = activeIds.length < 2; // one active alarm has its own Acknowledge
      paintBusy();
      historyList.replaceChildren(...(data.history ?? []).map((a) => alarmItem(a, { withAck: false })));
      // The button that was used is gone: the focus goes on as focusAfterAck says (never to a live alarm's button).
      if (hadFocus && !host.contains(document.activeElement)) {
        focusAfterAck(host, origin, () => document.querySelector('[data-title]')?.focus());
        origin = null;
      }
    },
    // The focus on the card's title (the strip off Now opened it).
    focus() {
      if (host.hidden) return;
      if (host.dataset.quiet === 'true') host.querySelector('.al-fold-toggle').focus();
      else head.querySelector('h2').focus();
    },
    destroy() { alive = false; host.replaceChildren(); },
  };
}
