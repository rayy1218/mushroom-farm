// ---- Data integrity ---- (spec 2026-11-12-data-integrity-design.md 2 to 4): the change log's statements, a row's void and
// restore, Not sold records, the tariff and the closed months. Made by openDb on its connection; db.js spreads the methods
// into the database object. The stores check every value first.

const parse = (text) => {
  if (text === null || text === undefined) return null;
  try { return JSON.parse(text); } catch { return null; }
};
const changeOf = (r) => ({
  id: r.id, at: r.at, by: r.by, role: r.role, kind: r.kind, rowId: r.row_id, action: r.action, before: parse(r.before),
  after: parse(r.after), reason: r.reason,
});
// The actions an "edited" mark counts: what changed a record after it was made (a void or restore has its own mark).
export const EDIT_ACTIONS = ['edit', 'unpaid', 'change', 'stop']; // a Mark paid is no change to what was sold

const notSoldOf = (r) => ({
  id: r.id, at: r.at, crop: r.crop, kg: r.kg, reason: r.reason, roomId: r.room_id, runId: r.run_id, buyerId: r.buyer_id,
  note: r.note, worker: r.worker, createdAt: r.created_at,
  voided: r.voided_at === null ? null : { at: r.voided_at, by: r.voided_by, reason: r.void_reason },
});
const tariffOf = (r) => ({
  id: r.id, from: r.from_date, rate: r.rate, afa: r.afa, note: r.note, createdAt: r.created_at,
  voided: r.voided_at === null ? null : { at: r.voided_at, by: r.voided_by, reason: r.void_reason },
});

// A row's void as the replies give it: null, or { at, by, reason }.
export const voidOf = (r) => (r.voided_at === null || r.voided_at === undefined ? null
  : { at: r.voided_at, by: r.voided_by, reason: r.void_reason });

// The tables a void may touch, and the column a void names a row by (a delivery's lines share delivery_id).
const VOID_KEYS = {
  sales: 'delivery_id', costs: 'id', equipment: 'id', harvests: 'id', stock_moves: 'id', not_sold: 'id', tariffs: 'id',
};

export function createIntegrityStore(db, inTransaction) {
  const q = {
    log: db.prepare(`INSERT INTO changes (at, by, role, kind, row_id, action, before, after, reason)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    of: db.prepare('SELECT * FROM changes WHERE kind = ? AND row_id = ? ORDER BY id'),
    between: db.prepare(`SELECT * FROM changes WHERE at BETWEEN ?1 AND ?2 AND (?3 IS NULL OR kind = ?3) AND (?4 IS NULL OR by = ?4)
                         ORDER BY id DESC LIMIT ?5`),
    people: db.prepare('SELECT DISTINCT by FROM changes WHERE at BETWEEN ? AND ? ORDER BY by COLLATE NOCASE'),
    first: db.prepare('SELECT MIN(at) AS at FROM changes'),
    added: db.prepare("SELECT row_id FROM changes WHERE kind = ? AND action = 'add'"),
    edits: db.prepare(`SELECT row_id, COUNT(*) AS n FROM changes WHERE kind = ? AND action IN (${EDIT_ACTIONS.map(() => '?').join(', ')})
                       GROUP BY row_id`),
    addOf: db.prepare("SELECT * FROM changes WHERE kind = ? AND row_id = ? AND action = 'add' ORDER BY id DESC LIMIT 1"),
    notSold: db.prepare('SELECT * FROM not_sold WHERE id = ?'),
    notSoldBetween: db.prepare('SELECT * FROM not_sold WHERE at BETWEEN ? AND ? ORDER BY at, id'),
    notSoldLive: db.prepare('SELECT * FROM not_sold WHERE voided_at IS NULL ORDER BY at, id'),
    notSoldOfRun: db.prepare('SELECT * FROM not_sold WHERE run_id = ? ORDER BY at, id'),
    insertNotSold: db.prepare(`INSERT INTO not_sold (at, crop, kg, reason, room_id, run_id, buyer_id, note, worker, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    updateNotSold: db.prepare(`UPDATE not_sold SET at = ?, crop = ?, kg = ?, reason = ?, room_id = ?, run_id = ?, buyer_id = ?, note = ?,
                               worker = ? WHERE id = ?`),
    deleteNotSold: db.prepare('DELETE FROM not_sold WHERE id = ?'),
    tariffs: db.prepare('SELECT * FROM tariffs ORDER BY from_date, id'),
    tariff: db.prepare('SELECT * FROM tariffs WHERE id = ?'),
    insertTariff: db.prepare('INSERT INTO tariffs (from_date, rate, afa, note, created_at) VALUES (?, ?, ?, ?, ?)'),
    updateTariff: db.prepare('UPDATE tariffs SET from_date = ?, rate = ?, afa = ?, note = ? WHERE id = ?'),
    close: db.prepare('SELECT * FROM month_closes WHERE month = ?'),
    closes: db.prepare('SELECT * FROM month_closes ORDER BY month'),
    putClose: db.prepare(`INSERT INTO month_closes (month, closed_at, figures) VALUES (?, ?, ?)
                          ON CONFLICT (month) DO UPDATE SET closed_at = excluded.closed_at, figures = excluded.figures`),
  };
  const voidQ = new Map();
  const voidStatements = (table) => {
    if (!voidQ.has(table)) {
      const key = VOID_KEYS[table];
      voidQ.set(table, {
        void: db.prepare(`UPDATE ${table} SET voided_at = ?, voided_by = ?, void_reason = ? WHERE ${key} = ? AND voided_at IS NULL`),
        restore: db.prepare(`UPDATE ${table} SET voided_at = NULL, voided_by = NULL, void_reason = NULL WHERE ${key} = ? AND voided_at IS NOT NULL`),
      });
    }
    return voidQ.get(table);
  };
  const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));

  return {
    // fn's writes in one transaction (a store's write and its change entry together); inside one already, it joins. → fn's value.
    transaction(fn) {
      return inTransaction(fn);
    },

    // One change entry (section 3.1): { at, by, role, kind, rowId, action, before?, after?, reason? }. → its id.
    logChange({ at, by, role, kind, rowId, action, before = null, after = null, reason = null }) {
      return Number(q.log.run(at, by, role, kind, rowId, action, json(before), json(after), reason ?? null).lastInsertRowid);
    },

    // A record's entries, oldest first.
    changesOf(kind, rowId) {
      return q.of.all(kind, rowId).map(changeOf);
    },

    // The entries made in [from, to] (ms), newest first, at most `limit`; kind and by null: any.
    changesBetween(from, to, { kind = null, by = null, limit = 500 } = {}) {
      return q.between.all(from, to, kind, by, limit).map(changeOf);
    },

    // The people with entries in [from, to], A–Z.
    changePeople(from, to) {
      return q.people.all(from, to).map((r) => r.by);
    },

    // When the log began (its first entry), or null.
    changesSince() {
      return q.first.get().at ?? null;
    },

    // Map rowId → how many times a record of the kind was changed after it was made (EDIT_ACTIONS).
    editCounts(kind) {
      return new Map(q.edits.all(kind, ...EDIT_ACTIONS).map((r) => [r.row_id, r.n]));
    },

    // Set of the row ids of the kind that have an 'add' entry (made since the log began).
    addedRows(kind) {
      return new Set(q.added.all(kind).map((r) => r.row_id));
    },

    // A record's newest 'add' entry, or null (who made it and when: the Undo window).
    addOf(kind, rowId) {
      const r = q.addOf.get(kind, rowId);
      return r ? changeOf(r) : null;
    },

    // Voids a row (every line of a delivery: table 'sales', id the delivery's) at `at` by `by` for `reason`. → true when one
    // was voided (false: none, or voided already).
    voidRow(table, id, { at, by, reason }) {
      return voidStatements(table).void.run(at, by, reason, id).changes > 0;
    },

    // Restores a voided row. → true when one was restored.
    restoreRow(table, id) {
      return voidStatements(table).restore.run(id).changes > 0;
    },

    // ---- Not sold (section 6) ----
    getNotSold(id) {
      const r = q.notSold.get(id);
      return r ? notSoldOf(r) : null;
    },
    // Not sold records of [from, to] (ms), voided ones too, oldest first.
    notSoldBetween(from, to) {
      return q.notSoldBetween.all(from, to).map(notSoldOf);
    },
    // A run's Not sold records (tied on save), voided ones too, oldest first (the Harvest tab's run card).
    runNotSold(runId) {
      return q.notSoldOfRun.all(runId).map(notSoldOf);
    },
    // Every Not sold record not voided, oldest first.
    liveNotSold() {
      return q.notSoldLive.all().map(notSoldOf);
    },
    insertNotSold(f, at) {
      const id = Number(q.insertNotSold.run(f.at, f.crop, f.kg, f.reason, f.roomId, f.runId, f.buyerId, f.note, f.worker, at).lastInsertRowid);
      return this.getNotSold(id);
    },
    updateNotSold(id, f) {
      return q.updateNotSold.run(f.at, f.crop, f.kg, f.reason, f.roomId, f.runId, f.buyerId, f.note, f.worker, id).changes > 0 ? this.getNotSold(id) : null;
    },
    deleteNotSold(id) {
      return q.deleteNotSold.run(id).changes > 0;
    },

    // ---- The tariff (section 8.1) ----
    // Every rate, voided ones too, oldest first.
    listTariffs() {
      return q.tariffs.all().map(tariffOf);
    },
    getTariff(id) {
      const r = q.tariff.get(id);
      return r ? tariffOf(r) : null;
    },
    insertTariff({ from, rate, afa, note }, at) {
      return this.getTariff(Number(q.insertTariff.run(from, rate, afa, note, at).lastInsertRowid));
    },
    updateTariff(id, { from, rate, afa, note }) {
      return q.updateTariff.run(from, rate, afa, note, id).changes > 0 ? this.getTariff(id) : null;
    },

    // ---- Closed months (section 8.3) ----
    // A month's kept figures { month, closedAt, figures }, or null.
    monthClose(month) {
      const r = q.close.get(month);
      return r ? { month: r.month, closedAt: r.closed_at, figures: parse(r.figures) } : null;
    },
    monthCloses() {
      return q.closes.all().map((r) => ({ month: r.month, closedAt: r.closed_at, figures: parse(r.figures) }));
    },
    putMonthClose(month, closedAt, figures) {
      q.putClose.run(month, closedAt, JSON.stringify(figures));
      return this.monthClose(month);
    },
  };
}
