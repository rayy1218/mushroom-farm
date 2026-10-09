// web/harvest.js: the phone page and the stickers page (docs/contracts/harvest.md 12.4, 12.5).
(function (global) {
'use strict';

let current = null;                         // the token of the mounted page; a late reply of an older mount sees it changed

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

// "12.5", "12,5" and " 12.5 " give 12.5; anything else (a unit, a sign, ".5", "12.") gives null.
function parseKg(text) {
  const t = String(text).trim();
  return /^\d+([.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : null;
}

function summaryText(batch) {
  const n = batch.today.crates.length;
  if (n === 0) return 'No crates today';
  return `Flush ${batch.flush} · ${batch.today.kg} kg today · ${n} ${n === 1 ? 'crate' : 'crates'}`;
}

const stickerLink = (origin, roomId) => `${origin}/#/harvest/${roomId}`;
const isLocalHost = hostname => LOCAL_HOSTS.includes(hostname);

// One path of unit squares on a white square; the string holds only numbers and fixed text.
function qrSvg(qrcodegen, text) {
  const qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.QUARTILE);
  const n = qr.size + 8;
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) d += `M${x + 4},${y + 4}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" class="st-qr" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">` +
    `<rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

const cropName = k => (global.ClimateController.CROPS[k] ? global.ClimateController.CROPS[k].name : k);
const errText = err => global.FarmUi.errorText(err);
const batchLine = b => `${cropName(b.crop)} · ${b.strain || '–'} · placed ${dateOf(b.placed_at)}`;

// Farm date (UTC+8) of a time, whatever the browser's zone.
function dateOf(t) {
  const d = new Date((t + 8 * 3600) * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

const RECORD_HTML = `
<div class="hv-page">
  <h2 id="hvRoom"></h2>
  <div class="hv-pick" id="hvPick"></div>
  <p class="hv-msg" id="hvNone" hidden>No batch in this room. Ask the office to place one.</p>
  <p class="hv-picked" id="hvPicked" hidden></p>
  <button class="btn" id="hvChange" type="button" hidden>Change batch</button>
  <div class="hv-weigh" id="hvWeigh" hidden>
    <label for="hvName">Your name (optional)</label>
    <input class="hv-name" id="hvName" autocomplete="off">
    <label for="hvKg">Weight (kg)</label>
    <input class="hv-kg" id="hvKg" inputmode="decimal" autocomplete="off">
    <button class="hv-add" id="hvAdd" type="button">Add crate</button>
  </div>
  <p class="hv-msg" id="hvMsg" role="status"></p>
  <p class="hv-summary" id="hvSummary"></p>
  <ul class="hv-today" id="hvToday"></ul>
</div>`;

const STICKERS_HTML = `
<div class="st-page">
  <h2>QR stickers</h2>
  <button class="btn" id="stPrint" type="button">Print</button>
  <p class="st-warn" id="stWarn" hidden>Open this page from the farm address (for example http://192.168.1.20:8080); phones cannot reach localhost.</p>
  <div class="st-advice" id="stAdvice">
    <p>Laminate the stickers or print on waterproof labels: the rooms run at 90 % humidity.</p>
    <p>Give the farm device a fixed address on the router; if its address changes, every sticker stops working.</p>
  </div>
  <div class="st-cards" id="stCards"></div>
</div>`;

// ---- phone page ----

async function mountRecord(el, roomId, live) {
  let gen = 0;                              // bumped by every load: an older reply is dropped
  const $ = s => el.querySelector(s);
  el.innerHTML = RECORD_HTML;
  const LIM = global.FarmHarvestRules.LIM;
  const clock = global.FarmUi.farmClock();
  const name = $('#hvName'), kgEl = $('#hvKg'), msgEl = $('#hvMsg'), addEl = $('#hvAdd');   // held: a 404 reload detaches the page
  name.maxLength = LIM.picker;
  try { name.value = global.localStorage.getItem('farm.picker') || ''; } catch { name.value = ''; }
  name.addEventListener('change', () => {
    try { global.localStorage.setItem('farm.picker', name.value.trim()); } catch { /* storage unavailable */ }
  });

  let data = null;
  let pickedId = null;

  const setMsg = (text, isErr) => {
    msgEl.textContent = text;
    msgEl.className = isErr ? 'hv-msg err' : 'hv-msg';
  };
  const picked = () => (data && data.batches.find(b => b.id === pickedId)) || null;

  function render() {
    const batches = data.batches;
    if (!picked()) pickedId = batches.length === 1 ? batches[0].id : null;
    const b = picked();
    $('#hvRoom').textContent = data.room.name;
    $('#hvNone').hidden = batches.length !== 0;
    $('#hvPick').hidden = b !== null || batches.length < 2;
    $('#hvChange').hidden = !(b && batches.length > 1);
    $('#hvWeigh').hidden = b === null;
    const pickedLine = $('#hvPicked');
    pickedLine.hidden = b === null;
    if (!$('#hvPick').hidden) {
      $('#hvPick').replaceChildren(...batches.map(x => {
        const btn = document.createElement('button');
        btn.className = 'hv-batch'; btn.type = 'button'; btn.dataset.batch = String(x.id); btn.textContent = batchLine(x);
        return btn;
      }));
    }
    const list = $('#hvToday');
    if (!b) { $('#hvSummary').textContent = ''; list.replaceChildren(); return; }
    pickedLine.textContent = batchLine(b);
    $('#hvSummary').textContent = summaryText(b);
    list.replaceChildren(...b.today.crates.map(c => {
      const li = document.createElement('li');
      li.dataset.crate = String(c.id);
      const text = document.createElement('span');
      text.textContent = [clock.hm(c.t), `${c.kg} kg`, c.picker].filter(Boolean).join('  ');
      const undo = document.createElement('button');
      undo.className = 'btn'; undo.type = 'button'; undo.textContent = 'Undo'; undo.dataset.undo = String(c.id);
      li.append(text, undo);
      return li;
    }));
  }

  // Returns false when the room is gone, the call failed or the page was left.
  async function load() {
    const mine = ++gen;
    let reply;
    try { reply = await global.FarmApi.getRoomHarvest(roomId); }
    catch (err) {
      if (!live() || mine !== gen) return false;
      if (err && err.name === 'ApiError' && err.status === 404 && err.error === 'Unknown room') {
        const page = document.createElement('div'); page.className = 'hv-page';
        const p = document.createElement('p'); p.className = 'hv-msg'; p.textContent = 'This room does not exist or is archived.';
        page.appendChild(p);
        el.replaceChildren(page);
      } else setMsg(errText(err), true);
      return false;
    }
    if (!live() || mine !== gen) return false;
    data = reply;
    render();
    return true;
  }

  $('#hvPick').addEventListener('click', e => {
    const btn = e.target && e.target.closest ? e.target.closest('button[data-batch]') : null;
    if (!btn) return;
    pickedId = Number(btn.dataset.batch);
    setMsg('', false);
    render();
  });
  $('#hvChange').addEventListener('click', () => { pickedId = null; setMsg('', false); render(); });

  kgEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addEl.click(); } });

  addEl.addEventListener('click', async () => {
    const b = picked();
    const kg = parseKg(kgEl.value);
    if (!b) return;
    if (kg === null) { setMsg('Type the weight in kg, for example 12.5', false); return; }
    addEl.disabled = true;
    const body = { kg };
    const who = name.value.trim();
    if (who) body.picker = who;
    try {
      await global.FarmApi.addCrate(b.id, body);
      if (!live()) return;
      kgEl.value = '';
      setMsg('', false);
      await load();
      if (live()) kgEl.focus();
    } catch (err) {
      if (!live()) return;
      const api = err && err.name === 'ApiError';
      if (!api || err.status === 0 || err.status >= 500) {
        setMsg('Not saved: check Wi-Fi and press Add crate again', true);
      } else if (err.status === 400 && err.error === 'Invalid crate') {
        setMsg((err.details && err.details[0]) || err.error, true);
      } else if ((err.status === 400 && (err.error === 'Batch is cleared' || err.error === 'Batch is not in a room')) ||
                 (err.status === 404 && err.error === 'Unknown batch')) {
        setMsg('This batch was cleared', true);
        pickedId = null;
        await load();
      } else setMsg(errText(err), true);
    } finally {
      if (live()) addEl.disabled = false;
    }
  });

  $('#hvToday').addEventListener('click', async e => {
    const btn = e.target && e.target.closest ? e.target.closest('button[data-undo]') : null;
    if (!btn) return;
    const b = picked();
    const crate = b && b.today.crates.find(c => String(c.id) === btn.dataset.undo);
    if (!global.confirm(`Undo the crate of ${crate ? crate.kg : ''} kg?`)) return;
    btn.disabled = true;
    try {
      await global.FarmApi.undoCrate(Number(btn.dataset.undo));
      if (live()) { setMsg('', false); await load(); }
    } catch (err) {
      if (live()) { setMsg(errText(err), true); btn.disabled = false; }
    }
  });

  await load();
}

// ---- stickers page ----

async function mountStickers(el, live) {
  const $ = s => el.querySelector(s);
  el.innerHTML = STICKERS_HTML;
  const local = isLocalHost(global.location.hostname);
  $('#stWarn').hidden = !local;
  $('#stPrint').disabled = local;
  $('#stPrint').addEventListener('click', () => global.print());

  let rooms;
  try { rooms = await global.FarmApi.listRooms(); }
  catch (err) {
    if (!live()) return;
    const p = document.createElement('p'); p.className = 'tag'; p.textContent = errText(err);
    $('#stCards').replaceChildren(p);
    return;
  }
  if (!live()) return;
  $('#stCards').replaceChildren(...rooms.map(r => {
    const link = stickerLink(global.location.origin, r.id);
    const card = document.createElement('div'); card.className = 'st-card'; card.dataset.room = String(r.id);
    const nm = document.createElement('p'); nm.className = 'st-name'; nm.textContent = r.name;
    const box = document.createElement('div'); box.className = 'st-qrbox';
    box.innerHTML = qrSvg(global.qrcodegen, link);       // numbers and fixed text only
    const ln = document.createElement('p'); ln.className = 'st-link'; ln.textContent = link;
    const sc = document.createElement('p'); sc.className = 'st-scan'; sc.textContent = 'Scan to record harvest';
    card.append(nm, box, ln, sc);
    return card;
  }));
}

function mount(el, params) {
  const me = current = {};
  const live = () => current === me;
  if (params && params.view === 'stickers') return mountStickers(el, live);
  return mountRecord(el, params.id, live);
}
function unmount() { current = null; }

global.FarmShell.register('harvest', { mount, unmount });

if (typeof module === 'object' && module && module.exports) module.exports = { parseKg, summaryText, stickerLink, isLocalHost, qrSvg };
})(typeof window !== 'undefined' ? window : globalThis);
