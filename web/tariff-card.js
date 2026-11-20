// The "Electricity tariff" card of the Settings page (spec 2026-11-12-data-integrity-design.md 8.1), in place of the old
// price box: every rate newest first (From · To · Rate · AFA · RM per kWh · Note), a quiet Edit each, Add a rate. A rate's
// dialog sends through the server's asks (a rate whose days reach a closed month: "Save anyway"); its Edit has Void (never
// the first rate's, which holds from 2020) and the History fold; a voided rate opens as itself with Restore. The owner's
// (Settings is). The pure parts are in web/tariff-math.js.

import { request, OFFLINE } from './api.js';
import { live } from './live.js';
import { openForm as openTaskForm, errorText } from './task-dialogs.js';
import { askingSend } from './asks.js';
import { openVoid, openVoided } from './void-dialog.js';
import { addHistory } from './changes-fold.js';
import { dateHint } from './harvest-math.js';
import { tariffRows, rateBody, rateVoidTitle, RATE_VOID_LEAD, MAX_NOTE } from './tariff-math.js';

const COMMAND_TIMEOUT = 15000;
const NOTE = 'Each day is priced at the rate holding on it: the energy charge and the AFA on your TNB bill, in RM per kWh. A new rate starts on its day; the days before keep theirs.';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

// The tasks' openForm with the Business dialogs' form class.
function openForm(options) {
  const handle = openTaskForm(options);
  document.querySelector('dialog.tk-dialog[open] > form')?.classList.add('bz-form');
  return handle;
}

export function mountTariff(container) {
  let alive = true;
  container.innerHTML = `
  <div class="banner" role="alert" data-tf-banner hidden>
    <span data-tf-banner-text></span>
    <button type="button" data-tf-retry>Retry</button>
  </div>
  <section class="card settings tf-card" id="tariff" aria-labelledby="tf-title" data-tf-card hidden>
    <div class="tf-head">
      <h2 id="tf-title">Electricity tariff</h2>
      <button type="button" data-tf-add>Add a rate</button>
    </div>
    <div class="us-table-wrap"><table class="us-table tf-table">
      <caption class="sr-only">Electricity tariff, newest rate first</caption>
      <thead><tr><th scope="col">From</th><th scope="col">To</th><th scope="col" class="num">Rate</th><th scope="col" class="num">AFA</th><th scope="col" class="num">RM per kWh</th><th scope="col">Note</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
      <tbody data-tf-rows></tbody>
    </table></div>
    <p class="muted s-hint">${NOTE}</p>
    <p class="s-saved" data-tf-saved role="status" hidden></p>
  </section>`;
  const q = (sel) => container.querySelector(sel);
  const card = q('[data-tf-card]');
  const rows = q('[data-tf-rows]');
  const saved = q('[data-tf-saved]');
  const banner = q('[data-tf-banner]');
  const bannerText = q('[data-tf-banner-text]');
  let data = null; // GET /api/tariffs

  const showError = (text) => {
    bannerText.textContent = `Electricity tariff: ${text}`;
    banner.hidden = false;
  };
  const done = (words) => () => {
    saved.textContent = words;
    saved.hidden = false;
    load();
  };

  function paint() {
    const list = tariffRows(data.tariffs);
    rows.replaceChildren(...list.map((row, i) => {
      const rate = data.tariffs[i];
      const tr = el('tr', row.voided ? 'dx-voided' : '');
      const from = el('th', 'tf-from');
      from.scope = 'row';
      if (row.voided) from.append(el('span', 'dx-chip', 'Voided'));
      from.append(row.from);
      if (row.edited) from.append(el('span', 'dx-edited', 'edited'));
      if (row.voided) from.append(el('span', 'dx-void-line', row.voided));
      const figure = (text, label) => {
        const td = el('td', `num${row.voided ? ' dx-figure' : ''}`, text);
        td.dataset.label = label; // a phone's label beside the figure
        return td;
      };
      const to = el('td', 'tf-to', row.to);
      to.dataset.label = 'To';
      const note = el('td', 'tf-note', row.note);
      note.dataset.label = 'Note';
      const act = el('td', 'tf-act');
      const b = el('button', 'bz-quiet', row.voided ? 'Open' : 'Edit');
      b.type = 'button';
      b.dataset.focusKey = `tariff-${row.id}`;
      b.setAttribute('aria-label', `${row.voided ? 'Open' : 'Edit'} the rate from ${row.from}${row.voided ? ', voided' : ''}`);
      b.addEventListener('click', () => (row.voided ? openVoidedRate(rate, row) : openRateDialog(rate, row)));
      act.append(b);
      tr.append(from, to, figure(row.rate, 'Rate'), figure(row.afa, 'AFA'), figure(row.price, 'RM per kWh'), note, act);
      return tr;
    }));
    card.hidden = false;
  }

  async function load() {
    try {
      const reply = await request('GET', '/api/tariffs');
      if (!alive) return;
      data = reply;
      banner.hidden = true;
      paint();
    } catch (err) {
      if (alive) showError(err.status === 0 ? OFFLINE : err.message);
    }
  }

  // Add a rate (rate null) or Edit one: From (the first rate's is fixed at 2020), Rate, AFA, Note.
  function openRateDialog(rate = null, row = null) {
    const label = rate ? 'Save' : 'Add';
    const send = askingSend({ value: 'save', label, fields: ['from', 'rate', 'afa'] });
    const buttons = [{ value: 'save', label, primary: true }];
    if (row?.mayVoid) {
      buttons.unshift({
        label: 'Void this rate',
        action: () => openVoid({
          title: rateVoidTitle(rate), lead: [`RM ${row.price} per kWh${rate.note ? `, ${rate.note}` : ''}.`, RATE_VOID_LEAD], label: 'Void rate',
          path: `/api/tariffs/${rate.id}/void`, onChanged: done('Rate voided'), onError: showError, hint: 'Entered the wrong day',
        }),
      });
    }
    const fromField = row?.first
      ? { name: 'from', label: 'From', kind: 'fixed', value: rate.from }
      : { name: 'from', label: 'From', kind: 'date', value: rate?.from ?? data?.today ?? '', hintOf: (d) => (d ? dateHint(d) : '') };
    openForm({
      title: rate ? `Rate from ${row.from}` : 'Add a rate',
      lead: rate ? (row.first ? ['The first rate holds from 2020: a change from a day is a new rate.'] : [])
        : ['From its day on, until the next rate. Enter the energy charge and the AFA as your TNB bill prints them.'],
      fields: [
        fromField,
        { name: 'rate', label: 'Rate (RM per kWh)', kind: 'number', value: rate ? String(rate.rate) : '', placeholder: '0.5150' },
        { name: 'afa', label: 'AFA (RM per kWh)', kind: 'number', value: rate ? String(rate.afa) : '', placeholder: '0.0000', hint: 'The fuel adjustment; a rebate below 0. Empty is 0.' },
        { name: 'note', label: 'Note (optional)', kind: 'text', value: rate?.note ?? '', maxLength: MAX_NOTE, placeholder: 'TNB bill Oct 2026' },
      ],
      buttons,
      onLost: showError,
      submit: async (v, _which, form) => {
        const r = rateBody({ ...v, from: row?.first ? rate.from : v.from });
        if (!r.body) return r;
        try {
          const out = await send(form, r.body, (b) => (rate
            ? request('PUT', `/api/tariffs/${rate.id}`, b, COMMAND_TIMEOUT)
            : request('POST', '/api/tariffs', b, COMMAND_TIMEOUT)));
          if (out !== true) return out;
        } catch (err) {
          if (err.field && ['from', 'rate', 'afa', 'note'].includes(err.field)) return { field: err.field, message: err.message }; // a day taken: under From
          return { message: errorText(err) };
        }
        done(rate ? 'Saved' : 'Rate added')();
        return true;
      },
    });
    if (rate) addHistory({ kind: 'tariff', id: rate.id });
  }

  // A voided rate: what it was, the void said, Restore and its History.
  function openVoidedRate(rate, row) {
    openVoided({
      title: `Rate from ${row.from}`, lead: [`RM ${row.price} per kWh${rate.note ? `, ${rate.note}` : ''}.`], voided: rate.voided,
      path: `/api/tariffs/${rate.id}/restore`, onChanged: done('Rate restored'), onError: showError, kind: 'tariff', id: rate.id,
    });
  }

  q('[data-tf-add]').addEventListener('click', () => { if (data) openRateDialog(); });
  q('[data-tf-retry]').addEventListener('click', () => load());
  const off = live.on('costs', () => { if (alive) load(); }); // a rate set elsewhere (Settings' old route, another device)
  load();
  return function unmount() {
    alive = false;
    off();
  };
}
