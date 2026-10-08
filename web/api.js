// web/api.js: one function per C3 route, and stream (docs/contracts/web.md section 4).
(function (global) {
'use strict';

class ApiError extends Error {
  constructor(status, error, details) {
    super(error);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
    this.details = details;
  }
}

function qs(query) {
  if (!query) return '';
  const parts = [];
  for (const k of Object.keys(query)) {
    const v = query[k];
    if (v === undefined || v === null) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? '?' + parts.join('&') : '';
}

async function request(method, path, { query, body } = {}) {
  const url = FarmApi.base + path + qs(query);
  const headers = { Accept: 'application/json' };
  const init = { method, headers };
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, init); }
  catch (err) { throw new ApiError(0, 'The farm server cannot be reached.', [String((err && err.message) || err)]); }
  let text;
  try { text = await res.text(); }
  catch (err) { throw new ApiError(0, 'The farm server cannot be reached.', [String((err && err.message) || err)]); }
  if (res.ok) {
    if (res.status === 204 || text === '') return null;
    try { return JSON.parse(text); }
    catch { throw new ApiError(res.status, 'The server sent a reply that is not JSON.', []); }
  }
  let errBody;
  try { errBody = JSON.parse(text); } catch { throw new ApiError(res.status, `HTTP ${res.status}`, []); }
  const error = (errBody && typeof errBody === 'object' && typeof errBody.error === 'string') ? errBody.error : `HTTP ${res.status}`;
  const details = (errBody && Array.isArray(errBody.details)) ? errBody.details : [];
  throw new ApiError(res.status, error, details);
}

function listRooms() { return request('GET', '/api/rooms'); }
function createRoom(room) { return request('POST', '/api/rooms', { body: room }); }
function updateRoom(id, fields) { return request('PATCH', `/api/rooms/${id}`, { body: fields }); }
function restartRoom(id) { return request('POST', `/api/rooms/${id}/restart`); }
function getSettings(id) { return request('GET', `/api/rooms/${id}/settings`); }
function saveSettings(id, settings, note) {
  const body = { settings };
  if (note !== undefined && note !== '') body.note = note;
  return request('PUT', `/api/rooms/${id}/settings`, { body });
}
function listSettingsHistory(id) { return request('GET', `/api/rooms/${id}/settings/history`); }
function restoreSettings(id, versionId) { return request('POST', `/api/rooms/${id}/settings/restore/${versionId}`); }
function getReadings(id, { from, to, step } = {}) { return request('GET', `/api/rooms/${id}/readings`, { query: { from, to, step } }); }
function getEvents(id, { limit, before } = {}) { return request('GET', `/api/rooms/${id}/events`, { query: { limit, before } }); }
function getAlarms(id) { return request('GET', `/api/rooms/${id}/alarms`); }
function ackAlarm(id, alarmKey) { return request('POST', `/api/rooms/${id}/alarms/${encodeURIComponent(alarmKey)}/ack`); }
function listCalibrations(id) { return request('GET', `/api/rooms/${id}/calibrations`); }
function saveCalibration(id, run) { return request('POST', `/api/rooms/${id}/calibrations`, { body: run }); }
function applyCalibration(id, runId) { return request('POST', `/api/rooms/${id}/calibrations/${runId}/apply`); }
function getMix(id) { return request('GET', `/api/rooms/${id}/mix`); }
function saveMix(id, rows) { return request('PUT', `/api/rooms/${id}/mix`, { body: rows }); }
async function getCapacity(id) {
  try { return await request('GET', `/api/rooms/${id}/capacity`); }
  catch (err) {
    if (err instanceof ApiError && err.status === 404 && err.error === 'No capacity report') return null;
    throw err;
  }
}
function saveCapacity(id, report) { return request('POST', `/api/rooms/${id}/capacity`, { body: report }); }

// ---------------- stream(onEvent) (4.4) ----------------
function stream(onEvent) {
  let delay = 3000;
  let closed = false;
  let isFirst = true;
  let controller = null;
  let watchdogTimer = null;
  let reconnectTimer = null;
  // Guards a single connection attempt against a double "down" + reconnect: the watchdog aborting the
  // request also makes the pending reader.read() reject, so both paths must end the connection at most once.
  let ended = true;

  function safeEvent(type, data) {
    if (closed) return;
    try { onEvent(type, data); } catch (err) { console.error(err); }
  }
  function clearWatchdog() { if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; } }
  function armWatchdog() {
    clearWatchdog();
    const ms = FarmApi.streamTimeoutMs;
    watchdogTimer = setTimeout(() => endConnection(`No data from the server for ${ms / 1000} s`), ms);
  }
  function scheduleReconnect() {
    if (closed) return;
    reconnectTimer = setTimeout(connect, delay);
  }
  function endConnection(message) {
    if (ended || closed) return;
    ended = true;
    clearWatchdog();
    if (controller) { try { controller.abort(); } catch { /* ignore */ } }
    safeEvent('down', { error: message });
    scheduleReconnect();
  }

  async function connect() {
    if (closed) return;
    ended = false;
    controller = new AbortController();
    const myController = controller;
    armWatchdog();
    let res;
    try {
      res = await fetch(FarmApi.base + '/api/stream', { headers: { Accept: 'text/event-stream' }, signal: myController.signal });
    } catch (err) {
      if (closed || ended) return;
      endConnection(String((err && err.message) || err));
      return;
    }
    if (closed || ended) return;
    if (res.status < 200 || res.status >= 300) { endConnection(`HTTP ${res.status}`); return; }
    safeEvent('open', { reconnect: !isFirst });
    isFirst = false;
    armWatchdog();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', dataLines = [], curEvent = 'message';
    function dispatchLine() {
      if (dataLines.length === 0) { curEvent = 'message'; return; }
      const dataText = dataLines.join('\n'); dataLines = [];
      const name = curEvent; curEvent = 'message';
      let data;
      try { data = JSON.parse(dataText); }
      catch { console.warn('Bad stream data:', dataText); return; }
      safeEvent(name, data);
    }
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (closed || ended) return;
        if (done) break;
        armWatchdog();
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n')) !== -1) {
          let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line === '') { dispatchLine(); continue; }
          if (line.startsWith(':')) continue; // comment (e.g. ": ping"); already counted by armWatchdog above
          const ci = line.indexOf(':');
          const field = ci === -1 ? line : line.slice(0, ci);
          let val = ci === -1 ? '' : line.slice(ci + 1);
          if (val.startsWith(' ')) val = val.slice(1);
          if (field === 'event') curEvent = val;
          else if (field === 'data') dataLines.push(val);
          else if (field === 'retry') { const n = parseInt(val, 10); if (Number.isFinite(n)) delay = n; }
          // id: ignored
        }
      }
    } catch (err) {
      if (closed || ended) return;
      endConnection(String((err && err.message) || err));
      return;
    }
    if (closed || ended) return;
    endConnection('The connection to the farm server was closed.');
  }

  connect();

  return function close() {
    if (closed) return;
    closed = true;
    ended = true;
    clearWatchdog();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (controller) { try { controller.abort(); } catch { /* ignore */ } }
  };
}

const FarmApi = {
  base: '',
  streamTimeoutMs: 45000,
  ApiError,
  listRooms, createRoom, updateRoom, restartRoom,
  getSettings, saveSettings, listSettingsHistory, restoreSettings,
  getReadings, getEvents, getAlarms, ackAlarm,
  listCalibrations, saveCalibration, applyCalibration,
  getMix, saveMix, getCapacity, saveCapacity,
  stream,
};

global.FarmApi = FarmApi;
})(typeof window !== 'undefined' ? window : globalThis);
