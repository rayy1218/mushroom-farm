// The farm's Calendar page, #/calendar (spec 2026-11-03-calendar-design.md 5): a month grid of every room's tasks, or one
// room's, and the picked day's list. Past days show the rows as they were closed, today its open rows (ticked on Today),
// later days what the server works out from the stage plan, the daily rules and the upkeep intervals. Read only. The page
// asks for the month on the tasks events, when the stream comes back, and on a timer (as Today); the room and the day stay
// in the address.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { roomHash, TODAY_HASH } from './route.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { taskParts } from './tasks-math.js';
import { keepLines } from './text-math.js';
import { mainCrop } from './room-card-math.js';
import { picture, emptyPicture } from './pictures.js';
import { taskPicture } from './pictures-data.js';
import {
  WEEK_HEAD, monthGrid, monthRange, shiftMonth, monthOf, monthTitle, dayMarks, dayGroups, itemLine, stageText, calendarHash,
  dayTitle, dayLabel,
} from './calendar-math.js';

const REFRESH_MS = 60_000;

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Calendar</h1>
      <p class="page-sub">Done and missed on past days, the plan ahead</p>
    </div>
    <div class="field cal-room">
      <label for="cal-room">Room</label>
      <select id="cal-room" data-room><option value="">All rooms</option></select>
    </div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <div class="cal-layout">
    <section class="card cal-month" aria-labelledby="cal-month-title">
      <div class="cal-head">
        <h2 id="cal-month-title" data-month></h2>
        <div class="cal-nav">
          <button type="button" class="cal-step" data-prev aria-label="Previous month">‹</button>
          <button type="button" data-today>Today</button>
          <button type="button" class="cal-step" data-next aria-label="Next month">›</button>
        </div>
      </div>
      <div class="cal-week" aria-hidden="true">${WEEK_HEAD.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid" data-grid></div>
    </section>
    <section class="card cal-day" aria-labelledby="cal-day-title">
      <h2 id="cal-day-title" class="cal-day-title" tabindex="-1" data-day-title></h2>
      <div data-day-body><p class="none">Loading…</p></div>
    </section>
  </div>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

let mountSeq = 0;

export function mount(container, { room = null, day = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    room: q('[data-room]'), banner: q('.banner'), bannerText: q('[data-banner-text]'), month: q('[data-month]'), grid: q('[data-grid]'),
    dayTitle: q('[data-day-title]'), dayBody: q('[data-day-body]'),
  };
  document.title = 'Calendar · Mushroom farm';

  let today = null; // the farm's date, from the first answer
  let picked = day; // the day the list shows
  let month = day ? monthOf(day) : null;
  let roomId = room;
  let view = null; // GET /api/calendar of the month on show
  let seq = 0;
  let timer = null;
  let outdated = false;
  let painted = '';
  let pickerFromView = false;
  const openFolds = new Set(); // the routine folds opened, by day and room: a refresh keeps them open

  const keepAddress = () => history.replaceState(null, '', calendarHash({ room: roomId, day: picked && picked !== today ? picked : null }));

  // The room picker: every room, asked once.
  request('GET', '/api/rooms').then((rooms) => {
    if (!alive()) return;
    for (const r of rooms) {
      const o = el('option', '', r.name);
      o.value = String(r.id);
      els.room.append(o);
    }
    els.room.value = roomId ? String(roomId) : '';
  }).catch(() => { pickerFromView = true; }); // no list: the first answer for every room fills it
  els.room.addEventListener('change', () => {
    roomId = els.room.value ? Number(els.room.value) : null;
    keepAddress();
    view = null;
    load();
  });

  const cropOf = (id) => mainCrop(view?.rooms.find((r) => r.id === id)?.crop?.crops);

  function cell({ date, inMonth }) {
    const items = view?.days.find((d) => d.date === date)?.items ?? [];
    const marks = dayMarks(items, cropOf);
    const b = el('button', 'cal-cell');
    b.type = 'button';
    b.dataset.date = date;
    if (!inMonth) b.dataset.out = 'true';
    if (date === today) b.setAttribute('aria-current', 'date');
    b.setAttribute('aria-pressed', String(date === picked));
    b.tabIndex = date === picked ? 0 : -1;
    const roomName = (id) => view?.rooms.find((r) => r.id === id)?.name ?? '';
    const starts = items.filter((i) => i.kind === 'stage').map((i) => `${roomName(i.roomId)}: ${stageText(i.stage)}`);
    b.setAttribute('aria-label', dayLabel(date, today, marks, starts));
    const top = el('span', 'cal-top');
    top.append(el('span', 'cal-num', String(Number(date.slice(8)))));
    if (marks.missed || marks.overdue) { // a task missed that day or overdue today: amber beside the date (a phone: with the dots)
      const miss = el('span', 'cal-dot cal-miss');
      miss.dataset.tone = 'warn';
      top.append(miss);
    }
    b.append(top);
    const pics = el('span', 'cal-pics');
    for (const m of marks.marks) pics.append(m.kind === 'bag' ? picture('bag', m.key, { size: 20, stage: m.stage }) : picture('task', m.key, { size: 20, crop: m.crop }));
    if (marks.more) pics.append(el('span', 'cal-more', `+${marks.more}`));
    const dots = el('span', 'cal-dots');
    for (let i = 0; i < Math.min(3, marks.marks.length + marks.more); i++) dots.append(el('span', 'cal-dot'));
    if (marks.missed || marks.overdue) {
      const missed = el('span', 'cal-dot');
      missed.dataset.tone = 'warn';
      dots.append(missed);
      b.dataset.missed = 'true';
    }
    b.append(pics, dots);
    b.addEventListener('click', () => pick(date));
    return b;
  }

  // Arrow keys move the picked day (a week up or down); one day button is in the tab order.
  els.grid.addEventListener('keydown', (e) => {
    if (!picked) return;
    const at = Date.parse(`${picked}T00:00:00Z`);
    const weekday = (new Date(at).getUTCDay() + 6) % 7; // Monday 0
    const days = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday }[e.key];
    let d = null;
    if (days !== undefined) d = new Date(at + days * 86_400_000).toISOString().slice(0, 10);
    else if (e.key === 'PageUp' || e.key === 'PageDown') { // the month before or after, the same day of the month where it has one
      const m = shiftMonth(monthOf(picked), e.key === 'PageUp' ? -1 : 1);
      const last = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)), 0)).getUTCDate();
      d = `${m}-${String(Math.min(Number(picked.slice(8)), last)).padStart(2, '0')}`;
    }
    if (!d) return;
    e.preventDefault();
    pick(d, { focus: true });
  });

  function pick(date, { focus = false } = {}) {
    picked = date;
    keepAddress();
    if (monthOf(date) !== month) { // another month (a muted day, the keys, Today): its heading and grid at once, then its days
      month = monthOf(date);
      view = null;
      paint(true);
      load(focus);
      return;
    }
    paint(true);
    if (focus) els.grid.querySelector(`[data-date="${date}"]`)?.focus();
  }

  function row(i) {
    const li = el('li', 'cal-row');
    li.dataset.status = i.status;
    const { name, detail } = taskParts(i.text);
    const text = el('div', 'cal-text');
    text.append(el('p', 'cal-name', keepLines(name)));
    const closed = ['done', 'skipped', 'missed', 'cancelled'].includes(i.status); // closed: who and when is enough, as the Log
    if (detail && !closed) text.append(el('p', 'cal-detail', keepLines(detail)));
    if (i.note && !closed) text.append(el('p', 'cal-detail', keepLines(i.note)));
    const line = itemLine(i);
    if (line) {
      const p = el('p', 'cal-line', keepLines(line));
      if (i.status === 'missed' || i.overdueDays > 0) p.dataset.tone = 'warn';
      text.append(p);
    }
    li.append(picture('task', taskPicture(i), { size: 28, crop: cropOf(i.roomId) }), text);
    return li;
  }

  function roomPart(g) {
    const part = el('section', 'cal-room-part');
    const head = el('h3', 'cal-room-head');
    const crop = mainCrop(g.room.crop?.crops);
    const link = el('a', '', g.room.name);
    link.href = roomHash(g.room.id, 'tasks');
    link.dataset.focus = `room-${g.room.id}`;
    head.append(crop ? picture('crop', crop, { size: 28 }) : emptyPicture(28), link);
    part.append(head);
    if (g.about) part.append(el('p', 'cal-about', 'Dates estimated from the stage plan'));
    for (const s of g.stages) {
      const p = el('p', 'cal-stage');
      const words = el('span', '', keepLines(stageText(s.stage)));
      p.append(picture('bag', crop, { size: 28, stage: s.stage.done ? 'done' : s.stage.stage }), words);
      part.append(p);
    }
    for (const s of g.slots) {
      part.append(el('h4', 'cal-slot', s.label));
      const list = el('ul', 'cal-list');
      list.append(...s.rows.map(row));
      part.append(list);
    }
    if (g.upkeep.length) {
      part.append(el('h4', 'cal-slot', 'Upkeep'));
      const list = el('ul', 'cal-list');
      list.append(...g.upkeep.map(row));
      part.append(list);
    }
    if (g.routine.length) {
      const fold = el('details', 'cal-routine');
      const foldKey = `${picked}:${g.room.id}`;
      fold.open = openFolds.has(foldKey);
      fold.addEventListener('toggle', () => { if (fold.open) openFolds.add(foldKey); else openFolds.delete(foldKey); });
      const summary = el('summary', '', `+ ${g.routine.length} daily ${g.routine.length === 1 ? 'task' : 'tasks'}`);
      summary.dataset.focus = `fold-${g.room.id}`;
      fold.append(summary);
      const list = el('ul', 'cal-list');
      list.append(...g.routine.map(row));
      fold.append(list);
      part.append(fold);
    }
    return part;
  }

  function paintDay() {
    els.dayTitle.textContent = dayTitle(picked, today);
    const body = [];
    if (view && picked > view.horizon) body.push(el('p', 'none', `The calendar looks 92 days ahead, to ${dayTitle(view.horizon, today)}.`));
    else {
      const groups = view ? dayGroups(view, picked) : [];
      if (picked === today && groups.some((g) => [...g.slots.flatMap((s) => s.rows), ...g.upkeep, ...g.routine].some((i) => i.status === 'open'))) {
        const p = el('p', 'cal-today');
        const a = el('a', '', 'Tick them on Today');
        a.href = TODAY_HASH;
        p.append(a);
        body.push(p);
      }
      body.push(...(groups.length ? groups.map(roomPart) : [el('p', 'none', view ? 'Nothing on this day.' : 'Loading…')]));
    }
    const focus = els.dayBody.contains(document.activeElement) ? document.activeElement.dataset?.focus : null;
    els.dayBody.replaceChildren(...body);
    if (focus) (els.dayBody.querySelector(`[data-focus="${focus}"]`) ?? els.dayTitle).focus(); // a refresh keeps the cursor's place
  }

  function paint(force = false) {
    const key = JSON.stringify([view, picked]);
    if (!force && key === painted) return;
    painted = key;
    els.month.textContent = monthTitle(month);
    const focused = document.activeElement?.closest?.('.cal-cell')?.dataset.date;
    els.grid.replaceChildren(...monthGrid(month).map(cell));
    if (focused) els.grid.querySelector(`[data-date="${picked}"]`)?.focus();
    paintDay();
  }

  async function load(focus = false) {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    const m = month ?? monthOf(new Date().toISOString().slice(0, 10));
    const { from, to } = monthRange(m);
    try {
      const data = await request('GET', `/api/calendar?from=${from}&to=${to}${roomId ? `&room=${roomId}` : ''}`);
      if (!alive() || mine !== seq) return;
      today = data.today;
      if (!month) { // the first answer: the farm's today, unless the address picked a day
        month = monthOf(picked ?? today);
        picked ??= today;
        if (month !== m) { load(focus); return; }
      }
      if (!picked) picked = today;
      view = data;
      if (pickerFromView && roomId === null) {
        pickerFromView = false;
        for (const r of data.rooms) {
          const o = el('option', '', r.name);
          o.value = String(r.id);
          els.room.append(o);
        }
      }
      els.banner.hidden = true;
      paint(); // a refresh with nothing new leaves the page (its folds and focus) alone
      if (focus) els.grid.querySelector(`[data-date="${picked}"]`)?.focus();
    } catch (err) {
      if (!alive() || mine !== seq) return;
      els.bannerText.textContent = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message;
      els.banner.hidden = false;
      if (routeMissing(err)) { outdated = true; return; }
      if (err.status === 404 && roomId !== null) { // the room is gone: every room, at once
        els.room.querySelector(`option[value="${roomId}"]`)?.remove();
        roomId = null;
        els.room.value = '';
        keepAddress();
        load();
        return;
      }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  const go = (n) => {
    month = shiftMonth(month, n);
    const first = `${month}-01`;
    picked = today && monthOf(today) === month ? today : first;
    keepAddress();
    view = null;
    paint(true);
    load();
  };
  q('[data-prev]').addEventListener('click', () => month && go(-1));
  q('[data-next]').addEventListener('click', () => month && go(1));
  q('[data-today]').addEventListener('click', () => today && pick(today));
  q('[data-retry]').addEventListener('click', () => load());

  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [
    live.on('tasks', () => reload.call()),
    live.onStatus((up) => {
      if (up) reload.call();
      else if (!outdated) { clearTimeout(timer); timer = setTimeout(load, REFRESH_MS); }
    }),
  ];
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    reload.cancel();
    for (const off of offLive) off();
  };
}
