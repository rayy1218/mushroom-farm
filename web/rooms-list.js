// The Rooms list page: list rooms, add one in the Add room dialog, edit one on its page's Room profile tab, delete with a confirm.

import { request, OFFLINE, GONE } from './api.js';
import { roomHash } from './route.js';
import { openRoomDialog, closeRoomDialog } from './room-dialog.js';
import { openSimulateDialog, closeSimulateDialog } from './simulate-dialog.js';
import { activeCounts, chipText, levelLabel } from './alarms-math.js';

const metres = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const cubic = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const day = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Rooms</h1>
      <p class="page-sub">Your growing rooms and their sensors.</p>
    </div>
    <div class="page-actions"><button type="button" class="primary" data-add>Add room</button></div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry hidden>Retry</button>
  </div>
  <p class="muted" data-loading>Loading rooms…</p>
  <div class="empty" data-empty hidden>
    <p>No rooms yet</p>
    <button type="button" class="primary" data-add-empty>Add room</button>
  </div>
  <table class="rooms" hidden>
    <thead>
      <tr>
        <th scope="col">Name</th>
        <th scope="col">Size (L × W × H m)</th>
        <th scope="col" class="num">Volume (m³)</th>
        <th scope="col">Created</th>
        <th scope="col"><span class="sr-only">Actions</span></th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>`;

let mountSeq = 0; // every mount gets a token; a reply that finds the token changed is dropped

export function mount(container) {
  const me = ++mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    add: q('[data-add]'),
    addEmpty: q('[data-add-empty]'),
    banner: q('.banner'),
    bannerText: q('[data-banner-text]'),
    retry: q('[data-retry]'),
    loading: q('[data-loading]'),
    empty: q('[data-empty]'),
    table: q('table.rooms'),
  };
  const deleteDialog = document.getElementById('delete-dialog');
  const deleteText = document.getElementById('delete-text');
  const abort = new AbortController();
  const { signal } = abort;

  let rooms = [];
  let alarmCounts = new Map(); // roomId → { count, level } of the active alarms
  let loaded = false;
  let loadSeq = 0;
  let rendered = false;
  let deletingId = null;

  const alive = () => me === mountSeq;

  function showBanner(text, { retry = false } = {}) {
    els.bannerText.textContent = text;
    els.retry.hidden = !retry;
    els.banner.hidden = false;
  }

  const hideBanner = () => { els.banner.hidden = true; };

  async function load() {
    const seq = ++loadSeq;
    try {
      const [data, alarms] = await Promise.all([
        request('GET', '/api/rooms'),
        request('GET', '/api/alarms').catch(() => null), // optional: the alarm chips
      ]);
      if (!alive() || seq !== loadSeq) return;
      rooms = data;
      alarmCounts = activeCounts(alarms);
      loaded = true;
      // Only the offline banner (the one with Retry) clears here; "That room no longer exists" stays.
      if (!els.retry.hidden) hideBanner();
    } catch {
      if (!alive() || seq !== loadSeq) return;
      showBanner(OFFLINE, { retry: true });
    }
    els.loading.hidden = true;
    render();
  }

  function cell(text, label, className) {
    const td = document.createElement('td');
    td.textContent = text;
    td.dataset.label = label;
    if (className) td.className = className;
    return td;
  }

  function button(text, action, room, className) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.dataset.action = action;
    b.dataset.id = room.id;
    b.setAttribute('aria-label', `${text} ${room.name}`);
    if (className) b.className = className;
    return b;
  }

  function row(room) {
    const tr = document.createElement('tr');
    const actions = document.createElement('td');
    actions.className = 'row-actions';
    actions.append(button('Edit', 'edit', room), button('Simulate', 'simulate', room), button('Delete', 'delete', room, 'danger-text'));
    const name = cell('', 'Name', 'name');
    const link = document.createElement('a');
    link.href = `#/rooms/${room.id}`;
    link.textContent = room.name;
    name.append(link);
    const alarm = alarmCounts.get(room.id);
    if (alarm) { // the chip: the number of active alarms, coloured by the highest level
      const chip = document.createElement('a');
      chip.className = 'alarm-chip';
      chip.href = `#/rooms/${room.id}`;
      chip.dataset.level = alarm.level;
      chip.textContent = chipText(alarm.count);
      chip.title = `${levelLabel(alarm.level)} alarm`;
      name.append(' ', chip);
    }
    tr.append(
      name,
      cell(`${metres.format(room.length)} × ${metres.format(room.width)} × ${metres.format(room.height)}`, 'Size (m)'),
      cell(cubic.format(room.volume), 'Volume (m³)', 'num'),
      cell(day.format(room.createdAt), 'Created'),
      actions,
    );
    return tr;
  }

  function render() {
    // Keep focus on the same row button across a re-render (the old one is replaced).
    const active = document.activeElement;
    const keep = [els.table, els.empty, els.banner].some((el) => el.contains(active)) || (active === document.body && rendered);
    const { action, id } = active?.dataset ?? {};
    els.table.tBodies[0].replaceChildren(...rooms.map(row));
    els.table.hidden = rooms.length === 0;
    els.empty.hidden = !loaded || rooms.length > 0;
    rendered = true;
    if (keep) (els.table.querySelector(`button[data-action="${action}"][data-id="${id}"]`) ?? els.add).focus();
  }

  function openAdd() {
    if (loaded) hideBanner(); // keep the load-failure banner (with Retry) until a load succeeds
    openRoomDialog({ onSaved: () => { if (alive()) load(); } });
  }

  function openDelete(room) {
    if (loaded) hideBanner();
    deletingId = room.id;
    deleteText.textContent = `Delete ${room.name}? This can't be undone.`;
    deleteDialog.returnValue = '';
    deleteDialog.showModal();
  }

  deleteDialog.addEventListener('close', async () => {
    if (deleteDialog.returnValue !== 'delete') return;
    try {
      await request('DELETE', `/api/rooms/${deletingId}`);
      if (!alive()) return;
      await load();
    } catch (err) {
      if (!alive()) return;
      if (err.status === 404) {
        showBanner(GONE);
        await load();
      } else {
        showBanner(OFFLINE, { retry: true });
      }
    }
  }, { signal });

  els.add.addEventListener('click', openAdd);
  els.addEmpty.addEventListener('click', openAdd);
  els.retry.addEventListener('click', load);

  els.table.addEventListener('click', (event) => {
    const b = event.target.closest('button[data-action]');
    if (!b) return;
    const room = rooms.find((r) => r.id === Number(b.dataset.id));
    if (!room) return;
    if (b.dataset.action === 'edit') location.hash = roomHash(room.id, 'profile'); // the room page's Room profile tab
    else if (b.dataset.action === 'simulate') openSimulateDialog(room);
    else openDelete(room);
  });

  load();

  return function unmount() {
    mountSeq++;
    abort.abort();
    closeRoomDialog();
    closeSimulateDialog();
    if (deleteDialog.open) deleteDialog.close();
    container.replaceChildren();
  };
}
