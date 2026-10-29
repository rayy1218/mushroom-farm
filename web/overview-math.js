// Pure helpers for the Overview page and the nav badge (no DOM, so they can be tested in Node).
// Spec 2026-10-19-safety-and-history-design.md section 6 (Overview, Nav).

import { nearChip, trendOf, co2Status } from './band-math.js';
import { formatStamp } from './history-math.js';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const round1 = (n) => Math.round(n * 10) / 10;

// The three sparklines of a room card: the key in overview.spark, the band keys in overview.bands.
export const SPARKS = [
  { key: 't', label: 'Temperature', unit: '°C', digits: 1, low: 'tLow', high: 'tHigh', color: 'var(--s-t)' },
  { key: 'rh', label: 'Humidity', unit: '% RH', digits: 1, low: 'rhLow', high: 'rhHigh', color: 'var(--s-rh)' }, // one decimal, as the room page
  { key: 'co2', label: 'CO₂', unit: 'ppm', digits: 0, low: 'co2Low', high: 'co2High', color: 'var(--s-co2)' },
];

// A sparkline: points [{ at, v }] in a w x h box with 3 px padding, band { low, high } or null.
// window { from, to, gapMs } fixes the x scale to [from, to] and starts a new line where the points are more than gapMs apart.
// Returns { d, last: { x, y }, band: { y, h } | null, joins, min, max }, or null with fewer than 2 usable points; joins:
// [{ x1, y1, x2, y2 }] from the point before each gap to the one after it, drawn dashed (critique 2026-10-29: a lone dot at
// the right edge after a gap). Like v1's, with the band stretching the scale so it is always inside the box.
export function sparkPath(points, w, h, band, window = null) {
  const pts = (points ?? []).filter((p) => p && finite(p.at) && finite(p.v)).sort((a, b) => a.at - b.at);
  if (pts.length < 2) return null;
  const pad = 3;
  const values = pts.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const hasBand = band && finite(band.low) && finite(band.high) && band.high > band.low;
  let lo = hasBand ? Math.min(min, band.low) : min;
  let hi = hasBand ? Math.max(max, band.high) : max;
  if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
  const t0 = window ? window.from : pts[0].at;
  const t1 = window ? window.to : pts[pts.length - 1].at;
  const x = (t) => pad + (t1 > t0 ? (t - t0) / (t1 - t0) : 0) * (w - 2 * pad);
  const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad);
  const last = pts[pts.length - 1];
  const gap = (i) => i > 0 && Boolean(window?.gapMs) && pts[i].at - pts[i - 1].at > window.gapMs;
  return {
    d: pts.map((p, i) => `${i && !gap(i) ? 'L' : 'M'}${round1(x(p.at))} ${round1(y(p.v))}`).join(' '),
    last: { x: round1(x(last.at)), y: round1(y(last.v)) },
    band: hasBand ? { y: round1(y(band.high)), h: round1(y(band.low) - y(band.high)) } : null,
    joins: pts.flatMap((p, i) => (gap(i) ? [{ x1: round1(x(pts[i - 1].at)), y1: round1(y(pts[i - 1].v)), x2: round1(x(p.at)), y2: round1(y(p.v)) }] : [])),
    min,
    max,
  };
}

export const alarmLevelRank = (level) => ({ critical: 3, serious: 2, warning: 1 })[level] ?? 0;

// The tiles over the room cards, from overview.rooms.
export function tiles(rooms) {
  let level = null;
  let alarms = 0;
  for (const r of rooms) {
    alarms += r.alarms.count;
    if (r.alarms.count > 0 && (level === null || alarmLevelRank(r.alarms.level) > alarmLevelRank(level))) level = r.alarms.level;
  }
  return {
    rooms: rooms.length,
    roomsOk: rooms.filter((r) => r.alarms.count === 0).length,
    alarms,
    level,
    exchanges: rooms.filter((r) => r.exchange).length,
  };
}

// A room has something to watch: a wired sensor (a room with nothing wired in Manual is not a worry).
const wired = (r) => r.trh?.status !== 'not-wired' || r.co2?.status !== 'not-wired';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// A room's readings out of band now (critique 2026-10-28: "OK" beside a humidity under its band), from online sensors only:
// [{ key, text }]. Temperature and humidity outside their band; CO₂ when its exchange words are amber or red (over the start
// point with the exchange off, near or at the safety level).
export function outOfBand(room) {
  const b = room?.bands;
  if (!b) return [];
  const on = (s, field) => (s?.status === 'online' && finite(s[field]) ? s[field] : null);
  const out = [];
  for (const [key, name, low, high] of [['t', 'Temperature', b.tLow, b.tHigh], ['rh', 'Humidity', b.rhLow, b.rhHigh]]) {
    const v = on(room.trh, key);
    if (v === null || !finite(low) || !finite(high)) continue;
    if (v > high) out.push({ key, text: `${name} high` });
    else if (v < low) out.push({ key, text: `${name} low` });
  }
  const co2 = on(room.co2, 'co2');
  const st = co2 === null ? null : co2Status(co2, { stop: b.co2Low, start: b.co2High, safety: b.co2Safety ?? null, exchange: Boolean(room.exchange) });
  if (st && (st.tone === 'amber' || st.tone === 'critical')) out.push({ key: 'co2', text: 'CO₂ high' });
  return out;
}

// The line at the top of the Overview (redesign 2026-10-28, in place of three number tiles): { text, tone, facts } or null
// without rooms. A room needs attention with an alarm, a reading out of band or in Manual (with something wired); the tone
// is the worst alarm's level, amber without alarms. One reading out of band is named ("Humidity low in Container Alpha").
// A room otherwise OK with a reading near an edge (nearEdges) is one to watch, not one that needs attention: named when it
// is the only one ("3 rooms OK · Room 1 humidity near high"), counted when there are more ("2 rooms to watch"), amber.
export function farmStatus(rooms) {
  if (!rooms?.length) return null;
  const t = tiles(rooms);
  const manual = rooms.filter((r) => !r.auto && wired(r)).length;
  const out = rooms.flatMap((r) => outOfBand(r).map((x) => ({ ...x, room: r.name })));
  const needs = (r) => r.alarms.count > 0 || outOfBand(r).length > 0 || (!r.auto && wired(r));
  const attention = rooms.filter(needs).length;
  const watch = rooms.filter((r) => !needs(r) && wired(r) && nearEdges(r).length > 0);
  const watchText = watch.length === 1
    ? `${watch[0].name} ${nearEdges(watch[0]).map((x) => x.text.toLowerCase()).join(', ')}`
    : watch.length > 1 ? `${watch.length} rooms to watch` : null;
  const bare = rooms.filter((r) => !wired(r) && r.alarms.count === 0).length; // nothing wired: not set up, never OK
  const facts = [t.alarms === 0 ? 'No alarms' : plural(t.alarms, 'alarm', 'alarms')];
  if (out.length === 1) facts.push(`${out[0].text} in ${out[0].room}`);
  else if (out.length > 1) facts.push(`${out.length} readings out of band`);
  if (manual > 0) facts.push(`${plural(manual, 'room', 'rooms')} in Manual`);
  if (attention > 0 && watchText) facts.push(watchText);
  facts.push(t.exchanges === 0 ? 'No air exchange running' : `${plural(t.exchanges, 'air exchange', 'air exchanges')} running`);
  if (attention === 0) {
    const ok = rooms.length - bare - watch.length;
    const parts = [ok > 0 ? (bare === 0 && !watchText ? `All ${plural(ok, 'room', 'rooms')} OK` : `${plural(ok, 'room', 'rooms')} OK`) : null,
      watchText, bare > 0 ? (ok > 0 || watchText ? `${bare} not set up` : `${plural(bare, 'room', 'rooms')} not set up`) : null].filter(Boolean);
    return { text: parts.join(' · '), tone: watchText ? 'amber' : ok > 0 ? 'good' : 'none', facts };
  }
  return {
    text: `${attention} of ${plural(rooms.length, 'room', 'rooms')} ${attention === 1 ? 'needs' : 'need'} attention`,
    tone: t.level ?? 'amber', facts,
  };
}

// Whether alarms reach a phone (GET /api/settings): null when they do (or the settings did not load), otherwise one
// line for the Overview's status card, with the way to fix it on Settings.
export function phoneAlarms(settings) {
  if (!settings) return null;
  const line = (text, tone) => ({ text, tone, href: '#/settings', link: 'Fix on Settings' });
  if (!settings.telegramTokenSet || !settings.telegramChatId) return { ...line('Phone alarms are not set up: an alarm only shows here', 'amber'), link: 'Set them up on Settings' };
  if (/^@\w*bot$/i.test(settings.telegramChatId)) return line("Phone alarms can't be delivered: the chat id is the bot's own name", 'serious');
  if (settings.telegramLastError) return line(`Phone alarms are failing: ${settings.telegramLastError}`, 'serious');
  if (!settings.telegramLevels?.length) return line('Phone alarms are off for every level', 'amber');
  return null;
}

// The room cards' order: rooms that need someone first (alarms by level, then a reading out of band, then Manual), then the
// ones to watch, then OK, then the ones not set up; the server's order (by name) inside each group.
export function sortRooms(rooms) {
  const rank = (r) => (r.alarms.count > 0 ? 3 - alarmLevelRank(r.alarms.level) / 10 : !wired(r) ? 7 : outOfBand(r).length ? 3.5 : !r.auto ? 4
    : nearEdges(r).length ? 4.5 : 5);
  return rooms.map((r, i) => [r, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([r]) => r);
}

// Critical first, then newest (the order of GET /api/alarms).
export function sortAlarms(alarms) {
  return [...alarms].sort((a, b) => (b.level === 'critical') - (a.level === 'critical') || b.raisedAt - a.raisedAt || b.id - a.id);
}

// The number on the nav badge: alarms that are active (not cleared) and not acknowledged.
export function badgeCount(alarms) {
  return (alarms ?? []).filter((a) => a.clearedAt === null && a.ackedAt === null).length;
}

// "(2) " in front of a page title when there are unacknowledged alarms; an old prefix is replaced.
export function withTitlePrefix(title, count) {
  const bare = title.replace(/^\(\d+\) /, '');
  return count > 0 ? `(${count}) ${bare}` : bare;
}

const STATUS_WORDS = { timeout: 'Timeout', offline: 'Offline' };

// A value to its digits, the thousands grouped like the room page: "23.5", "1,301".
export const grouped = (x, digits) => x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

// The value of a sensor on a room card: "23.5 °C", with the status word after it when the sensor is not online.
export function sensorText(sensor, field, digits, unit) {
  if (sensor.status === 'not-wired') return 'Not wired';
  if (sensor.status === 'no-data') return 'No data yet';
  const value = finite(sensor[field]) ? `${grouped(sensor[field], digits)} ${unit}` : '—';
  return STATUS_WORDS[sensor.status] ? `${value} · ${STATUS_WORDS[sensor.status]}` : value;
}

// A reading against its band, from an online sensor only: { text, tone } or null. Near an edge by the room page's rule
// (band-math.js nearChip): amber only while the machine that should act is not (room.machines) or after 15 min there; the
// trend is the last hour of the sparkline. CO₂ in the air exchange's words (co2Status), "Exchange off" with its start point
// (critique 2026-10-28: 1,241 ppm and the exchange off read as a contradiction without it).
function bandChip(sensor, field, low, high, spark, room) {
  const v = sensor?.status === 'online' ? sensor[field] : null;
  if (!finite(v) || !finite(low) || !finite(high)) return null;
  if (field === 'co2') {
    const st = co2Status(v, { stop: low, start: high, safety: room.bands.co2Safety ?? null, exchange: Boolean(room.exchange) });
    return st?.text === 'Exchange off' ? { ...st, text: `Exchange off · starts at ${grouped(high, 0)} ppm` } : st;
  }
  if (v > high) return { text: 'Above band', tone: 'amber' };
  if (v < low) return { text: 'Below band', tone: 'amber' };
  const near = nearOf(v, field, low, high, spark, room);
  return near ? { text: near.text, tone: 'amber' } : { text: 'In band', tone: 'good' };
}

// The amber near-edge words of an in-band value (band-math.js nearChip) or null; the trend is the last hour of the sparkline.
function nearOf(v, field, low, high, spark, room) {
  const points = (spark ?? []).map((p) => ({ at: p.at, value: p.v }));
  if (points.length) points.push({ at: Math.max(...points.map((p) => p.at)) + 1, value: v }); // the live value ends it
  return nearChip(field, v, low, high, { trend: trendOf(points, 60 * 60_000), points, machines: room.machines ?? null });
}

// A room's temperature and humidity in band but near an edge with amber words, from online sensors only (critique
// 2026-10-29, owner: "OK" beside an amber "Near high" read as a contradiction): [{ key, text }], "Humidity near high".
export function nearEdges(room) {
  const b = room?.bands;
  if (!b) return [];
  const out = [];
  for (const [key, name, low, high] of [['t', 'Temperature', b.tLow, b.tHigh], ['rh', 'Humidity', b.rhLow, b.rhHigh]]) {
    const v = room.trh?.status === 'online' && finite(room.trh[key]) ? room.trh[key] : null;
    if (v === null || !finite(low) || !finite(high) || v > high || v < low) continue;
    const near = nearOf(v, key, low, high, room.spark?.[key], room);
    if (near) out.push({ key, text: `${name} near ${near.edge === 'top' ? 'high' : 'low'}` });
  }
  return out;
}

// A room's values now for the "now" beside its alarms (alarms-math.js nowText): online sensors only, and the filter's
// last counted pressure when the server sends it. { t, rh, co2, pa }, null where not known.
export function roomReadings(room) {
  const on = (s, field) => (s?.status === 'online' && finite(s[field]) ? s[field] : null);
  return { t: on(room?.trh, 't'), rh: on(room?.trh, 'rh'), co2: on(room?.co2, 'co2'), pa: finite(room?.filterPa) ? room.filterPa : null };
}

export function exchangeText(room, now = Date.now()) {
  if (!room.exchange) return 'Air exchange off';
  if (!finite(room.exchangeSince)) return 'Air exchange on';
  return `Air exchange on since ${formatStamp(room.exchangeSince, now)}`;
}

// "10:42" today, "12 Oct 10:42" before.
export const alarmTimeText = (at, now = Date.now()) => formatStamp(at, now);

export const SPARK_WINDOW_MS = 24 * 3_600_000; // the sparklines show the last 24 h in 30 min buckets
export const SPARK_BUCKET_MS = 30 * 60_000;
export const SPARK_W = 140;
export const SPARK_H = 36;
const SHORT_MS = 2 * 3_600_000; // traces of less than this are scaled to the data (a hook at the right edge otherwise)
const MIN_SPAN_MS = 10 * 60_000;

// The window of a room card's traces (critique 2026-10-28): the last 24 h, or from the room's first point when its data
// covers less than 2 h of it (at least 10 min wide). → { from, text }: text 'last 24 hours' or 'since 17:08'.
export function traceWindow(spark, now) {
  const ats = ['t', 'rh', 'co2'].flatMap((k) => (spark?.[k] ?? []).map((p) => p.at)).filter(finite);
  const first = ats.length ? Math.min(...ats) : null;
  if (first === null || now - first >= SHORT_MS) return { from: now - SPARK_WINDOW_MS, text: 'last 24 hours' };
  return { from: Math.min(first, now - MIN_SPAN_MS), text: `since ${formatStamp(first, now)}` };
}

const withLive = (points, sensor, key, now) => (sensor?.status === 'online' && finite(sensor[key]) && points?.length
  ? [...points, { at: now, v: sensor[key] }] : points);

// What one room card shows, from a room of GET /api/overview:
// { href, name, values: [{ label, text, color, spark, ... }], auto, exchange, traces, alarm: { text, level } | null }
export function roomCard(room, now = Date.now()) {
  const span = traceWindow(room.spark, now);
  const values = SPARKS.map((def) => {
    const sensor = def.key === 'co2' ? room.co2 : room.trh;
    return {
      key: def.key,
      label: def.label,
      color: def.color,
      text: sensorText(sensor, def.key, def.digits, def.unit),
      chip: bandChip(sensor, def.key, room.bands[def.low], room.bands[def.high], room.spark?.[def.key], room),
      // the trace ends at the reading shown beside it (the buckets are 30 min averages, so the last one can lag it)
      spark: sparkPath(withLive(room.spark[def.key], sensor, def.key, now), SPARK_W, SPARK_H, { low: room.bands[def.low], high: room.bands[def.high] },
        { from: span.from, to: now, gapMs: 3 * SPARK_BUCKET_MS }),
    };
  });
  const n = room.alarms.count;
  // The room's state in one pill: its alarms first, then a reading out of band, Manual, a reading near an edge (Watch), OK,
  // or nothing wired.
  const state = n > 0 ? { text: `${n} ${n === 1 ? 'alarm' : 'alarms'}`, tone: room.alarms.level }
    : !wired(room) ? { text: 'Not set up', tone: 'none' }
      : outOfBand(room).length ? { text: 'Out of band', tone: 'amber' } : !room.auto ? { text: 'Manual', tone: 'amber' }
        : nearEdges(room).length ? { text: 'Watch', tone: 'amber' } : { text: 'OK', tone: 'good' };
  return {
    href: `#/rooms/${room.id}`,
    name: room.name,
    values,
    state,
    unwired: !wired(room), // nothing wired: the card is one line and a Set up link
    setupHref: `#/rooms/${room.id}/setup`,
    auto: room.auto ? 'Auto' : 'Manual',
    exchange: exchangeText(room, now),
    traces: span.text, // the traces' window, said on the card when it is not the section's 24 h
    alarm: n > 0 ? { text: `${n} ${n === 1 ? 'alarm' : 'alarms'}`, level: room.alarms.level } : null,
  };
}
