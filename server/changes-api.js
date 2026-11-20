// The change log's routes (spec 2026-11-12-data-integrity-design.md 10), called from api.js: GET /api/changes (a record's
// entries with kind and id, else a period's with days, kind, by) and GET /api/changes.csv?days=. The owner's only (roles.js).

import { attachment } from './tasks-api.js';
import { CHANGE_KINDS } from './db.js';
import { localDate, localTime, dayStart, addDays } from './task-rules.js';
import { cell } from './csv.js';
import { recordTitle, changeWords, KIND_WORDS } from '../web/changes-math.js';

export const CHANGE_DAYS = [7, 30, 90, 365];
const BOM = '\ufeff'; // Excel on Windows reads the CSV as UTF-8
export const CHANGES_CSV_HEADER = 'when,who,what,record,action,change,reason';
const PAGE_MAX = 500; // the Changes page's rows; the CSV has no cap
const CSV_MAX = 1_000_000; // a bound all the same: years of a farm's entries
const REUSE_GRACE_MS = 60_000; // an entry's time and its row's created_at are one write's, a moment apart

export function createChangeRoutes({ db, now = Date.now }) {
  // The farm days of a period ending today, and its entries newest first (the page's at most PAGE_MAX, more: true when there
  // were others; the CSV's every one), each with its title and words.
  function period(days, { kind = null, by = null, limit = PAGE_MAX } = {}) {
    const to = localDate(now());
    const from = addDays(to, -(days - 1));
    const [a, b] = [dayStart(from), dayStart(addDays(to, 1)) - 1];
    const found = db.changesBetween(a, b, { kind, by, limit: limit + 1 });
    const entries = found.slice(0, limit).map((e) => ({ ...e, title: recordTitle(e), words: changeWords(e) }));
    return { from, to, days, entries, more: found.length > limit, kinds: CHANGE_KINDS, people: db.changePeople(a, b) };
  }

  // A record's own entries. A harvest's id can be given back (its table has no AUTOINCREMENT: a Done's Undo or a room delete
  // frees the newest ids), so a harvest living now owns only the entries after its id's last Undo and from its own making on.
  function ownEntries(kind, id) {
    const entries = db.changesOf(kind, id);
    const row = kind === 'harvest' ? db.getHarvest(id) : null;
    if (!row) return entries;
    const cut = entries.findLastIndex((e) => e.action === 'undo');
    return entries.slice(cut + 1).filter((e) => e.at >= row.createdAt - REUSE_GRACE_MS);
  }

  return async function changeRoutes(req, res, path, { send, HttpError, url }) {
    if (path !== '/api/changes' && path !== '/api/changes.csv') return false;
    if (req.method !== 'GET') throw new HttpError(404, 'Not found');
    const q = (name) => url.searchParams.get(name);
    const kind = q('kind') || null;
    if (kind !== null && !CHANGE_KINDS.includes(kind)) throw new HttpError(400, `kind must be one of ${CHANGE_KINDS.join(', ')}`, 'kind');
    const asked = q('days');
    if (asked !== null && !/^[0-9]{1,3}$/.test(asked)) throw new HttpError(400, 'days must be 7, 30, 90 or 365', 'days');
    const days = asked === null ? 30 : Number(asked);
    if (!CHANGE_DAYS.includes(days)) throw new HttpError(400, 'days must be 7, 30, 90 or 365', 'days');
    if (path === '/api/changes.csv') {
      const { from, to, entries } = period(days, { kind, limit: CSV_MAX });
      const rows = entries.toReversed().map((e) => [
        `${localDate(e.at)} ${localTime(e.at)}`, e.by, KIND_WORDS[e.kind], e.title, e.action, e.words, e.reason,
      ].map(cell).join(','));
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': attachment(`changes ${from}–${to}.csv`) });
      res.end(`${BOM}${[CHANGES_CSV_HEADER, ...rows].join('\r\n')}\r\n`);
      return true;
    }
    const id = q('id');
    if (id !== null) {
      if (kind === null) throw new HttpError(400, 'Give the kind of record', 'kind');
      if (!/^[1-9][0-9]{0,14}$/.test(id)) throw new HttpError(400, 'id must be a record id', 'id');
      const entries = ownEntries(kind, Number(id));
      send(res, 200, { entries, before: !entries.some((e) => e.action === 'add'), since: db.changesSince() });
      return true;
    }
    const by = q('by') || null;
    send(res, 200, period(days, { kind, by }));
    return true;
  };
}
