// The farm database: schema and room queries.

import { DatabaseSync } from 'node:sqlite';
import { RELAY_KEYS } from './machine-codes.js';
import { RATINGS, FILTER } from './rooms.js';
import { PROGRAM_DEFAULTS } from './program.js';
import { FAMILY_OF, DAILY_RULES, HARVEST_RULES } from './task-rules.js';
import { BATCHES_SCHEMA, createBatchStore } from './batches-db.js'; // ---- Batches ---- (spec 2026-11-05-batches-design.md 2)
import { readSources } from './costs-sources.js'; // ---- Costs ----

const VERSION = 25;

// Iteration 1 (version 0) had only the rooms table without the address columns.
const ROOMS = `
CREATE TABLE rooms (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  length_m   REAL    NOT NULL CHECK (length_m BETWEEN 0.5 AND 100),
  width_m    REAL    NOT NULL CHECK (width_m BETWEEN 0.5 AND 100),
  height_m   REAL    NOT NULL CHECK (height_m BETWEEN 0.5 AND 10),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  trh_address INTEGER CHECK (trh_address BETWEEN 1 AND 247),
  co2_address INTEGER CHECK (co2_address BETWEEN 1 AND 247)
) STRICT;`;

const READINGS = `
CREATE TABLE readings (
  id      INTEGER PRIMARY KEY,
  room_id INTEGER NOT NULL,
  kind    TEXT    NOT NULL CHECK (kind IN ('trh', 'co2')),
  address INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  ok      INTEGER NOT NULL CHECK (ok IN (0, 1)),
  t       REAL,
  rh      REAL,
  co2     REAL,
  error   TEXT
) STRICT;
CREATE INDEX readings_by_sensor ON readings (room_id, kind, address, id);
CREATE INDEX readings_ok ON readings (room_id, kind, address, id) WHERE ok = 1;`;

// What the farm app last told each room's relay module and aircon gateway.
const MACHINE_COMMANDS = `
CREATE TABLE machine_commands (
  room_id      INTEGER PRIMARY KEY,
  intake       INTEGER NOT NULL DEFAULT 0,
  exhaust      INTEGER NOT NULL DEFAULT 0,
  circulation  INTEGER NOT NULL DEFAULT 0,
  humidifier   INTEGER NOT NULL DEFAULT 0,
  dehumidifier INTEGER NOT NULL DEFAULT 0,
  lights       INTEGER NOT NULL DEFAULT 0,
  ac_power     INTEGER NOT NULL DEFAULT 0,
  ac_mode      TEXT    NOT NULL DEFAULT 'cool',
  ac_setpoint  REAL    NOT NULL DEFAULT 25,
  ac_fan       TEXT    NOT NULL DEFAULT 'auto',
  relay_sent_at INTEGER,
  ac_sent_at   INTEGER
) STRICT;`;

// Automatic control (spec 2026-10-19-controller-design.md): the settings of each room and the
// remembered band states of the controller.
const ROOM_CONTROLS = `
CREATE TABLE room_controls (
  room_id  INTEGER PRIMARY KEY,
  auto     INTEGER NOT NULL DEFAULT 0 CHECK (auto IN (0, 1)),
  co2_low  REAL    NOT NULL DEFAULT 600,
  co2_high REAL    NOT NULL DEFAULT 750,
  t_low    REAL    NOT NULL DEFAULT 21,
  t_high   REAL    NOT NULL DEFAULT 23,
  rh_low   REAL    NOT NULL DEFAULT 85,
  rh_high  REAL    NOT NULL DEFAULT 95,
  exchange INTEGER NOT NULL DEFAULT 0 CHECK (exchange IN (0, 1)),
  exchange_since INTEGER,
  humidifier INTEGER NOT NULL DEFAULT 0 CHECK (humidifier IN (0, 1)),
  humidifier_during_exchange INTEGER NOT NULL DEFAULT 1 CHECK (humidifier_during_exchange IN (0, 1)),
  ac_fan TEXT NOT NULL DEFAULT 'auto' CHECK (ac_fan IN ('auto','low','high')),
  co2_safety REAL NOT NULL DEFAULT 1250,
  exchange_max_min INTEGER NOT NULL DEFAULT 10,
  exchange_ended_at INTEGER,
  capped_in_row INTEGER NOT NULL DEFAULT 0,
  humidifier_since INTEGER,
  ac_drop REAL NOT NULL DEFAULT 5,
  exchange_every_min INTEGER NOT NULL DEFAULT 15,
  exchange_forced INTEGER NOT NULL DEFAULT 0 CHECK (exchange_forced IN (0, 1)),
  fresh_from INTEGER,
  dehumidifier INTEGER NOT NULL DEFAULT 0 CHECK (dehumidifier IN (0, 1)),
  humidifier_last_on INTEGER,
  dehumidifier_off_at INTEGER,
  outdoor_air INTEGER NOT NULL DEFAULT 1 CHECK (outdoor_air IN (0, 1)),
  exchange_kind TEXT,
  auto_changed_at INTEGER
) STRICT;`;

// Safety and history (spec 2026-10-19-safety-and-history-design.md 3.2 and 4): the room_controls columns
// that version 7 adds to an older table, the alarms, the machine log and the readings time index.
const SAFETY_CONTROL_COLUMNS = `
-- an existing room's safety level is its CO2 upper limit + 500 (v1's rule), from 1250 to 10000
ALTER TABLE room_controls ADD COLUMN co2_safety REAL NOT NULL DEFAULT 1250;
ALTER TABLE room_controls ADD COLUMN exchange_max_min INTEGER NOT NULL DEFAULT 10;
ALTER TABLE room_controls ADD COLUMN exchange_ended_at INTEGER;
ALTER TABLE room_controls ADD COLUMN capped_in_row INTEGER NOT NULL DEFAULT 0;
ALTER TABLE room_controls ADD COLUMN humidifier_since INTEGER;
UPDATE room_controls SET co2_safety = MIN(10000, MAX(1250, co2_high + 500));`;

// Fresh air at least every N minutes (spec 2026-10-19-safety-and-history-design.md 2.6): the setting and the run state.
const FRESH_AIR_CONTROL_COLUMNS = `
ALTER TABLE room_controls ADD COLUMN exchange_every_min INTEGER NOT NULL DEFAULT 15;
ALTER TABLE room_controls ADD COLUMN exchange_forced INTEGER NOT NULL DEFAULT 0 CHECK (exchange_forced IN (0, 1));
ALTER TABLE room_controls ADD COLUMN fresh_from INTEGER;`;

// Crops, stage program and simulation runs (spec 2026-10-20-crops-and-simulation-design.md 3.1 and 4.4).
const PROGRAMS = `
CREATE TABLE room_crops (
  room_id  INTEGER NOT NULL,
  position INTEGER NOT NULL,
  crop     TEXT    NOT NULL,
  blocks   INTEGER NOT NULL CHECK (blocks BETWEEN 1 AND 100000),
  PRIMARY KEY (room_id, crop)
) STRICT;
CREATE TABLE room_programs (
  room_id       INTEGER PRIMARY KEY,
  farm_type     TEXT    NOT NULL DEFAULT 'ready' CHECK (farm_type IN ('ready', 'full')),
  stage         TEXT    NOT NULL DEFAULT 'fruiting' CHECK (stage IN ('spawn', 'pinning', 'fruiting', 'rest')),
  stage_since   INTEGER,
  flush         INTEGER NOT NULL DEFAULT 1,
  flushes       INTEGER NOT NULL DEFAULT 4,
  days_spawn    INTEGER NOT NULL DEFAULT 21,
  days_pinning  INTEGER NOT NULL DEFAULT 4,
  days_fruiting INTEGER NOT NULL DEFAULT 7,
  days_rest     INTEGER NOT NULL DEFAULT 10,
  ramp_h        REAL    NOT NULL DEFAULT 4,
  auto_advance  INTEGER NOT NULL DEFAULT 1 CHECK (auto_advance IN (0, 1)),
  ramp          TEXT,
  done          INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1))
) STRICT;
CREATE TABLE simulation_runs (
  id          INTEGER PRIMARY KEY,
  room_id     INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  status      TEXT    NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  progress    REAL    NOT NULL DEFAULT 0,
  input       TEXT    NOT NULL,
  summary     TEXT,
  result      TEXT,
  error       TEXT,
  finished_at INTEGER
) STRICT;
CREATE INDEX simulation_runs_by_room ON simulation_runs (room_id, created_at);`;

// The room columns of the dehumidifier: fitted or not, its power and its rated capacity.
const DEHUMIDIFIER_ROOM_COLUMNS = `
ALTER TABLE rooms ADD COLUMN dehumidifier INTEGER NOT NULL DEFAULT 0 CHECK (dehumidifier IN (0, 1));
ALTER TABLE rooms ADD COLUMN dehumidifier_w REAL NOT NULL DEFAULT 380;
ALTER TABLE rooms ADD COLUMN dehumidifier_lday REAL NOT NULL DEFAULT 20;`;

// Lights on a schedule per stage (spec 2026-10-26-lighting-design.md 6): the columns that version 16 adds, each only when the
// file does not have it yet (a re-run, or a table made above with it).
const LIGHTS_COLUMNS = [
  ['rooms', 'lights', 'INTEGER NOT NULL DEFAULT 0 CHECK (lights IN (0, 1))'],
  ['rooms', 'lights_w', 'REAL NOT NULL DEFAULT 60'],
  ['machine_commands', 'lights', 'INTEGER NOT NULL DEFAULT 0'],
  ['room_programs', 'light_spawn', 'INTEGER NOT NULL DEFAULT 0'],
  ['room_programs', 'light_pinning', 'INTEGER NOT NULL DEFAULT 12'],
  ['room_programs', 'light_fruiting', 'INTEGER NOT NULL DEFAULT 12'],
  ['room_programs', 'light_rest', 'INTEGER NOT NULL DEFAULT 0'],
  ['room_programs', 'light_start', "TEXT NOT NULL DEFAULT '07:00'"],
];

// The intake filter (spec 2026-10-22-filter-design.md 9): the room columns that version 14 adds, the filter pressure
// sensor's readings and the filter changes.
const FILTER_ROOM_COLUMNS = `
ALTER TABLE rooms ADD COLUMN fan_max_pa REAL NOT NULL DEFAULT 200;
ALTER TABLE rooms ADD COLUMN filter_clean_pa REAL NOT NULL DEFAULT 40;
ALTER TABLE rooms ADD COLUMN filter_final_pa REAL NOT NULL DEFAULT 80;
ALTER TABLE rooms ADD COLUMN filter_change_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE rooms ADD COLUMN filter_changed_at INTEGER;
ALTER TABLE rooms ADD COLUMN dp_address INTEGER CHECK (dp_address BETWEEN 1 AND 247);`;

const FILTER_TABLES = `
CREATE TABLE IF NOT EXISTS filter_readings (
  id      INTEGER PRIMARY KEY,
  room_id INTEGER NOT NULL,
  address INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  ok      INTEGER NOT NULL CHECK (ok IN (0, 1)),
  pa      REAL,
  error   TEXT
) STRICT;
-- the status like the energy meter's, and a covering index of the good readings for a time window
CREATE INDEX IF NOT EXISTS filter_readings_by_sensor ON filter_readings (room_id, address, id);
CREATE INDEX IF NOT EXISTS filter_readings_ok ON filter_readings (room_id, address, id) WHERE ok = 1;
CREATE INDEX IF NOT EXISTS filter_readings_by_time ON filter_readings (room_id, address, at, pa) WHERE ok = 1;
CREATE TABLE IF NOT EXISTS filter_changes (
  id        INTEGER PRIMARY KEY,
  room_id   INTEGER NOT NULL,
  at        INTEGER NOT NULL,
  pa_before REAL
) STRICT;
CREATE INDEX IF NOT EXISTS filter_changes_by_room ON filter_changes (room_id, at);`;

// The rooms column of each filter setting of rooms.js FILTER.
const FILTER_COLUMNS = { fanMaxPa: 'fan_max_pa', filterCleanPa: 'filter_clean_pa', filterFinalPa: 'filter_final_pa', filterChangeDays: 'filter_change_days' };

const LIGHT_STAGES = ['spawn', 'pinning', 'fruiting', 'rest']; // the order of the light_ columns

// Tasks (spec 2026-10-30-tasks-design.md 5): the rooms' daily, upkeep and long-term tasks, the worker names, the owner's
// changes of the built-in rules and the owner's own rules. A daily row has a date and a rule key and is unique per room,
// rule, date and slot; an upkeep row has a rule key and a due time, and a rule has at most one open row per room; a row
// has a closed time exactly when it is not open.
const TASKS = `
CREATE TABLE IF NOT EXISTS tasks (
  id         INTEGER PRIMARY KEY,
  room_id    INTEGER NOT NULL,
  kind       TEXT    NOT NULL CHECK (kind IN ('daily', 'upkeep', 'longterm')),
  rule_key   TEXT,
  date       TEXT,
  slot       TEXT    NOT NULL DEFAULT 'any' CHECK (slot IN ('morning', 'afternoon', 'any')),
  text       TEXT    NOT NULL,
  note       TEXT,
  status     TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'skipped', 'missed', 'cancelled')),
  due_at     INTEGER,
  created_at INTEGER NOT NULL,
  closed_at  INTEGER,
  worker     TEXT,
  amount     REAL,
  unit       TEXT,
  reason     TEXT,
  source     TEXT,
  CHECK (kind <> 'daily' OR (date IS NOT NULL AND rule_key IS NOT NULL)),
  CHECK (kind <> 'upkeep' OR (rule_key IS NOT NULL AND due_at IS NOT NULL)),
  CHECK ((status = 'open') = (closed_at IS NULL))
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_daily ON tasks (room_id, rule_key, date, slot) WHERE kind = 'daily';
CREATE UNIQUE INDEX IF NOT EXISTS tasks_upkeep_open ON tasks (room_id, rule_key) WHERE kind = 'upkeep' AND status = 'open';
CREATE INDEX IF NOT EXISTS tasks_by_status ON tasks (room_id, status);
CREATE INDEX IF NOT EXISTS tasks_closed ON tasks (room_id, closed_at, id) WHERE status <> 'open';
CREATE TABLE IF NOT EXISTS workers (
  id     INTEGER PRIMARY KEY,
  name   TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
) STRICT;
CREATE TABLE IF NOT EXISTS task_rule_settings (
  key        TEXT    PRIMARY KEY,
  enabled    INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  every_days INTEGER CHECK (every_days BETWEEN 1 AND 365)
) STRICT;
-- AUTOINCREMENT: a removed rule's id (its rows' rule key custom:<id>) is never given to a new rule
CREATE TABLE IF NOT EXISTS custom_task_rules (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text       TEXT    NOT NULL,
  rooms      TEXT,
  every_days INTEGER CHECK (every_days BETWEEN 1 AND 365),
  slot       TEXT    NOT NULL DEFAULT 'any' CHECK (slot IN ('morning', 'afternoon', 'any')),
  enabled    INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1))
) STRICT;`;

const RUNS_KEPT = 20; // finished simulation runs kept per room

// Runs of blocks and their harvests (spec 2026-11-04-harvest-design.md 2): a run opens when a room gets its crops or new
// blocks and ends at the next new blocks or when the crops are cleared; a harvest belongs to the run it was picked in.
const RUNS_HARVESTS = `
CREATE TABLE IF NOT EXISTS runs (
  id         INTEGER PRIMARY KEY,
  room_id    INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER,
  crops      TEXT    NOT NULL,
  partial    INTEGER NOT NULL DEFAULT 0 CHECK (partial IN (0, 1))
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS runs_open ON runs (room_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS runs_by_room ON runs (room_id, started_at);
CREATE TABLE IF NOT EXISTS harvests (
  id         INTEGER PRIMARY KEY,
  room_id    INTEGER NOT NULL,
  run_id     INTEGER NOT NULL,
  crop       TEXT    NOT NULL,
  stage      TEXT    NOT NULL,
  flush      INTEGER,
  blocks     INTEGER NOT NULL,
  kg         REAL    NOT NULL CHECK (kg > 0 AND kg <= 10000),
  picked_at  INTEGER NOT NULL,
  worker     TEXT,
  task_id    INTEGER,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS harvests_by_room ON harvests (room_id, picked_at);
CREATE INDEX IF NOT EXISTS harvests_by_run ON harvests (run_id, picked_at);
CREATE INDEX IF NOT EXISTS harvests_by_time ON harvests (picked_at);
CREATE INDEX IF NOT EXISTS harvests_by_task ON harvests (task_id) WHERE task_id IS NOT NULL;`;

// ---- Inventory (spec 2026-11-05-inventory-design.md 2) ----
// Stock items and their moves. Batches inserts block items and 'batch' moves naming only the contract's columns (contract
// section 7), so every other column is nullable or has a default; the unit has no CHECK here ('blocks' is Batches').
const INVENTORY = `
CREATE TABLE IF NOT EXISTS stock_items (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('blocks', 'spawn', 'bags', 'chemical', 'packaging', 'other')),
  unit        TEXT    NOT NULL,
  reorder_at  REAL,
  ingredient  TEXT,
  lrmp_no     TEXT,
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  low_sent_at INTEGER
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS stock_items_name ON stock_items (name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS stock_moves (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id        INTEGER NOT NULL REFERENCES stock_items (id),
  at             INTEGER NOT NULL,
  qty            REAL    NOT NULL,
  unit_cost      REAL,
  ref_kind       TEXT    NOT NULL CHECK (ref_kind IN ('purchase', 'use', 'batch', 'adjust')),
  ref_id         INTEGER,
  note           TEXT,
  total          REAL,
  supplier       TEXT,
  use_by         TEXT,
  room_id        INTEGER,
  reason         TEXT,
  worker         TEXT,
  counted        REAL,
  lot_id         INTEGER,
  use_by_sent_at INTEGER
) STRICT;
CREATE INDEX IF NOT EXISTS stock_moves_by_item ON stock_moves (item_id, at);
CREATE INDEX IF NOT EXISTS stock_moves_by_kind ON stock_moves (ref_kind, at);`;
// ---- Sales (spec 2026-11-05-sales-design.md 2) ----
// A sale is one crop line of a delivery to a buyer; the lines of a delivery share delivery_id (its first line's id when
// recorded; ids are never reused, AUTOINCREMENT) and are written together. buyer: the buyer's name at the sale (a rename
// rewrites it). room_id and run_id null: mixed, not tied.
const SALES = `
CREATE TABLE IF NOT EXISTS buyers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  phone      TEXT,
  note       TEXT,
  prices     TEXT    NOT NULL DEFAULT '{}',
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS sales (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id INTEGER NOT NULL,
  sold_at     INTEGER NOT NULL,
  crop        TEXT    NOT NULL,
  kg          REAL    NOT NULL CHECK (kg > 0 AND kg <= 10000),
  price_kg    REAL    NOT NULL CHECK (price_kg >= 0 AND price_kg <= 1000),
  total       REAL    NOT NULL CHECK (total >= 0),
  buyer       TEXT    NOT NULL,
  buyer_id    INTEGER NOT NULL,
  invoice_no  TEXT,
  room_id     INTEGER,
  run_id      INTEGER,
  note        TEXT,
  paid_at     INTEGER,
  created_at  INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS sales_by_time ON sales (sold_at);
CREATE INDEX IF NOT EXISTS sales_by_delivery ON sales (delivery_id);
CREATE INDEX IF NOT EXISTS sales_by_buyer ON sales (buyer_id);
CREATE INDEX IF NOT EXISTS sales_by_run ON sales (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sales_unpaid ON sales (sold_at) WHERE paid_at IS NULL;`;

// The Sales statements of a database, prepared on first use (after migrate) and kept per connection.
const salesStatements = new WeakMap();
function salesQ(db) {
  let s = salesStatements.get(db);
  if (s) return s;
  s = {
    runAt: db.prepare(`SELECT id FROM runs WHERE room_id = ? AND started_at <= ? AND (ended_at IS NULL OR ended_at > ?)
                       ORDER BY started_at DESC, id DESC LIMIT 1`),
    insertSale: db.prepare(`INSERT INTO sales (delivery_id, sold_at, crop, kg, price_kg, total, buyer, buyer_id, invoice_no,
                                               room_id, run_id, note, paid_at, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    setDeliveryId: db.prepare('UPDATE sales SET delivery_id = ? WHERE id = ?'),
    deliveryLines: db.prepare('SELECT * FROM sales WHERE delivery_id = ? ORDER BY id'),
    deleteDelivery: db.prepare('DELETE FROM sales WHERE delivery_id = ?'),
    setPaid: db.prepare('UPDATE sales SET paid_at = ? WHERE delivery_id = ?'),
    between: db.prepare('SELECT * FROM sales WHERE sold_at BETWEEN ? AND ? ORDER BY sold_at, id'),
    unpaid: db.prepare('SELECT * FROM sales WHERE paid_at IS NULL ORDER BY sold_at, id'),
    clearRoom: db.prepare('UPDATE sales SET room_id = NULL, run_id = NULL WHERE room_id = ?'),
    buyers: db.prepare('SELECT * FROM buyers ORDER BY name COLLATE NOCASE, id'),
    buyer: db.prepare('SELECT * FROM buyers WHERE id = ?'),
    insertBuyer: db.prepare('INSERT INTO buyers (name, phone, note, prices, archived, created_at) VALUES (?, ?, ?, ?, 0, ?)'),
    updateBuyer: db.prepare('UPDATE buyers SET name = ?, phone = ?, note = ?, prices = ?, archived = ? WHERE id = ?'),
    renameSales: db.prepare('UPDATE sales SET buyer = ? WHERE buyer_id = ?'),
    deleteBuyer: db.prepare('DELETE FROM buyers WHERE id = ?'),
    buyerSales: db.prepare('SELECT COUNT(DISTINCT delivery_id) AS n FROM sales WHERE buyer_id = ?'),
    buyerSalesAll: db.prepare('SELECT buyer_id, COUNT(DISTINCT delivery_id) AS n FROM sales GROUP BY buyer_id'),
  };
  salesStatements.set(db, s);
  return s;
}

const saleOf = (r) => ({
  id: r.id, deliveryId: r.delivery_id, soldAt: r.sold_at, crop: r.crop, kg: r.kg, priceKg: r.price_kg, total: r.total,
  buyer: r.buyer, buyerId: r.buyer_id, invoiceNo: r.invoice_no, roomId: r.room_id, runId: r.run_id, note: r.note,
  paidAt: r.paid_at, createdAt: r.created_at,
});

const buyerOf = (r) => {
  let prices = {};
  try { prices = JSON.parse(r.prices) ?? {}; } catch { /* a bad value reads as none */ }
  return { id: r.id, name: r.name, phone: r.phone, note: r.note, prices, archived: r.archived === 1, createdAt: r.created_at };
};
// ---- end Sales ----
// ---- Costs ---- (spec 2026-11-05-costs-design.md 2): what the farm spends, entered by hand; Batches, Inventory and Sales
// are read live, never copied (source_kind stays 'manual'). Rooms and runs have no foreign keys (deleteRoom deletes by hand), so
// two triggers keep a deleted room's costs as the farm's and drop a deleted run from its costs.
const COSTS = `
CREATE TABLE IF NOT EXISTS costs (
  id           INTEGER PRIMARY KEY,
  date         TEXT    NOT NULL,
  category     TEXT    NOT NULL CHECK (category IN ('blocks', 'spawn', 'labour', 'rent', 'repairs', 'transport', 'packaging', 'utilities', 'other')),
  amount       REAL    NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  room_id      INTEGER,
  run_id       INTEGER,
  note         TEXT    NOT NULL DEFAULT '',
  source_kind  TEXT    NOT NULL DEFAULT 'manual' CHECK (source_kind IN ('manual', 'batch', 'purchase')),
  source_id    INTEGER,
  repeat       TEXT    CHECK (repeat IN ('monthly')),
  repeat_until TEXT,
  worker       TEXT,
  utility      TEXT    CHECK (utility IN ('electricity', 'water', 'other')),
  period_from  TEXT,
  period_to    TEXT,
  created_at   INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS costs_by_date ON costs (date);
CREATE INDEX IF NOT EXISTS costs_by_room ON costs (room_id);
CREATE TRIGGER IF NOT EXISTS costs_room_gone AFTER DELETE ON rooms BEGIN
  UPDATE costs SET room_id = NULL, run_id = NULL WHERE room_id = OLD.id;
END;
CREATE TRIGGER IF NOT EXISTS costs_run_gone AFTER DELETE ON runs BEGIN
  UPDATE costs SET run_id = NULL WHERE run_id = OLD.id;
END;`;

// ---- Login ---- (spec 2026-11-06-login-design.md 2): how each worker signs in (an owner's password or a worker's PIN, as a
// scrypt hash; null: cannot sign in), the wrong tries and the lock, and the signed-in browsers (only the token's SHA-256).
const LOGIN_COLUMNS = `
ALTER TABLE workers ADD COLUMN role TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('owner', 'worker'));
ALTER TABLE workers ADD COLUMN secret_hash TEXT;
ALTER TABLE workers ADD COLUMN failed_tries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workers ADD COLUMN locked_until INTEGER;`;
const LOGIN = `
-- Foreign keys are on: a later step that rebuilds workers (rename, copy, drop) must set PRAGMA foreign_keys = OFF outside its
-- transaction, or the sessions would follow the renamed table and be cascaded away.
CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY,
  token_hash TEXT    NOT NULL UNIQUE,
  worker_id  INTEGER NOT NULL REFERENCES workers (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen  INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS sessions_by_worker ON sessions (worker_id);`;

const accountRow = (r) => ({
  id: r.id, name: r.name, active: r.active === 1, role: r.role, secretHash: r.secret_hash, failedTries: r.failed_tries,
  lockedUntil: r.locked_until,
});

const ALARMS = `
CREATE TABLE alarms (
  id         INTEGER PRIMARY KEY,
  room_id    INTEGER NOT NULL,
  key        TEXT    NOT NULL,
  level      TEXT    NOT NULL CHECK (level IN ('warning', 'serious', 'critical')),
  text       TEXT    NOT NULL,
  raised_at  INTEGER NOT NULL,
  cleared_at INTEGER,
  acked_at   INTEGER
) STRICT;
CREATE INDEX alarms_by_room ON alarms (room_id, id);
CREATE UNIQUE INDEX alarms_active ON alarms (room_id, key) WHERE cleared_at IS NULL;`;

const MACHINE_LOG = `
CREATE TABLE machine_log (
  id       INTEGER PRIMARY KEY,
  room_id  INTEGER NOT NULL,
  machine  TEXT    NOT NULL CHECK (machine IN ('intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'lights', 'ac')),
  at       INTEGER NOT NULL,
  on_      INTEGER NOT NULL CHECK (on_ IN (0, 1)),
  setpoint REAL,
  mode     TEXT,
  fan      TEXT,
  source   TEXT    NOT NULL CHECK (source IN ('manual', 'auto'))
) STRICT;
CREATE INDEX machine_log_by_room ON machine_log (room_id, machine, at);`;

// Farm-wide settings (spec 2026-10-19-settings-design.md): no rows means the defaults.
const SETTINGS = `
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;`;

// Energy and water usage (spec 2026-10-20-energy-water-outdoor-design.md section 9): the rooms columns that version 9
// adds (machine ratings, meter address), the outdoor probe's readings and the rooms' energy meter readings.
const USAGE_ROOM_COLUMNS = `
ALTER TABLE rooms ADD COLUMN intake_w REAL NOT NULL DEFAULT 60;
ALTER TABLE rooms ADD COLUMN exhaust_w REAL NOT NULL DEFAULT 60;
ALTER TABLE rooms ADD COLUMN circulation_w REAL NOT NULL DEFAULT 60;
ALTER TABLE rooms ADD COLUMN humidifier_w REAL NOT NULL DEFAULT 80;
ALTER TABLE rooms ADD COLUMN humidifier_lh REAL NOT NULL DEFAULT 2;
ALTER TABLE rooms ADD COLUMN ac_input_w REAL NOT NULL DEFAULT 1050;
ALTER TABLE rooms ADD COLUMN meter_address INTEGER CHECK (meter_address BETWEEN 1 AND 247);`;

const OUTDOOR_READINGS = `
CREATE TABLE outdoor_readings (
  id      INTEGER PRIMARY KEY,
  address INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  ok      INTEGER NOT NULL CHECK (ok IN (0, 1)),
  t       REAL,
  rh      REAL,
  error   TEXT
) STRICT;
-- the status like a room sensor's, and a covering index for the time windows (the history buckets and the checks)
CREATE INDEX outdoor_readings_by_sensor ON outdoor_readings (address, id);
CREATE INDEX outdoor_readings_ok ON outdoor_readings (address, id) WHERE ok = 1;
CREATE INDEX outdoor_readings_by_time ON outdoor_readings (address, at, ok, t, rh);`;

const METER_READINGS = `
CREATE TABLE meter_readings (
  id         INTEGER PRIMARY KEY,
  room_id    INTEGER NOT NULL,
  address    INTEGER NOT NULL,
  at         INTEGER NOT NULL,
  ok         INTEGER NOT NULL CHECK (ok IN (0, 1)),
  power_w    REAL,
  energy_kwh REAL,
  error      TEXT
) STRICT;
-- the status like a room sensor's, and a covering index of the good readings for the energy of a time window
CREATE INDEX meter_readings_by_sensor ON meter_readings (room_id, address, id);
CREATE INDEX meter_readings_ok ON meter_readings (room_id, address, id) WHERE ok = 1;
CREATE INDEX meter_readings_energy ON meter_readings (room_id, address, at, energy_kwh) WHERE ok = 1;`;

// The energy meter and outdoor probe queries, exported so a test can check their query plans. The status ones mirror
// STATUS_SQL; the others read a time window from a covering index.
const GOOD_METER = 'room_id = ?1 AND address = ?2 AND ok = 1 AND energy_kwh IS NOT NULL';
export const METER_SQL = {
  latest: `SELECT * FROM (SELECT * FROM meter_readings WHERE room_id = ? AND address = ? ORDER BY id DESC LIMIT ?) ORDER BY id`,
  lastOk: 'SELECT * FROM meter_readings WHERE room_id = ? AND address = ? AND ok = 1 ORDER BY id DESC LIMIT 1',
  failuresSince: `SELECT COUNT(*) AS n FROM (SELECT 1 FROM meter_readings WHERE room_id = ? AND address = ? AND id > ? LIMIT 10000)`,
  // The last good reading before a time, and the good readings in [from, to) (parameters: room, address, from, to).
  before: `SELECT at, energy_kwh FROM meter_readings WHERE ${GOOD_METER} AND at < ?3 ORDER BY at DESC LIMIT 1`,
  rows: `SELECT at, energy_kwh FROM meter_readings WHERE ${GOOD_METER} AND at >= ?3 AND at < ?4 ORDER BY at`,
  first: `SELECT at, energy_kwh FROM meter_readings WHERE ${GOOD_METER} AND at >= ?3 AND at < ?4 ORDER BY at LIMIT 1`,
  last: `SELECT at, energy_kwh FROM meter_readings WHERE ${GOOD_METER} AND at >= ?3 AND at < ?4 ORDER BY at DESC LIMIT 1`,
  // The readings of [from, to) in one pass: how many, the sum of the steps between neighbours that are plain (not a
  // decrease, not above 100 kW over the time between them) and how many are not. dt in ms, 100 kW = 100 / 3.6e6 kWh per ms.
  chunk: `SELECT COUNT(*) AS n,
                 COALESCE(SUM(CASE WHEN dv >= 0 AND dv <= 100.0 * dt / 3600000.0 THEN dv END), 0) AS kwh,
                 COALESCE(SUM(CASE WHEN dv < 0 OR dv > 100.0 * dt / 3600000.0 THEN 1 END), 0) AS bad
          FROM (SELECT energy_kwh - LAG(energy_kwh) OVER w AS dv, at - LAG(at) OVER w AS dt
                FROM meter_readings WHERE ${GOOD_METER} AND at >= ?3 AND at < ?4 WINDOW w AS (ORDER BY at))`,
};

export const FILTER_SQL = {
  latest: 'SELECT * FROM (SELECT * FROM filter_readings WHERE room_id = ? AND address = ? ORDER BY id DESC LIMIT ?) ORDER BY id',
  lastOk: 'SELECT * FROM filter_readings WHERE room_id = ? AND address = ? AND ok = 1 ORDER BY id DESC LIMIT 1',
  failuresSince: 'SELECT COUNT(*) AS n FROM (SELECT 1 FROM filter_readings WHERE room_id = ? AND address = ? AND id > ? LIMIT 10000)',
  window: 'SELECT at, pa FROM filter_readings WHERE room_id = ? AND address = ? AND ok = 1 AND at >= ? AND at < ? ORDER BY at',
  lastIn: 'SELECT at, pa FROM filter_readings WHERE room_id = ? AND address = ? AND ok = 1 AND at >= ? AND at < ? ORDER BY at DESC LIMIT 1',
};

export const OUTDOOR_SQL = {
  latest: 'SELECT * FROM (SELECT * FROM outdoor_readings WHERE address = ? ORDER BY id DESC LIMIT ?) ORDER BY id',
  lastOk: 'SELECT * FROM outdoor_readings WHERE address = ? AND ok = 1 ORDER BY id DESC LIMIT 1',
  failuresSince: 'SELECT COUNT(*) AS n FROM (SELECT 1 FROM outdoor_readings WHERE address = ? AND id > ? LIMIT 10000)',
  since: 'SELECT at, ok, t, rh FROM outdoor_readings WHERE address = ? AND at >= ? ORDER BY at',
  // One bucket like HISTORY_SQL.bucket: good readings in the plausible ranges in [from, to).
  bucket: `SELECT AVG(t) AS t, AVG(rh) AS rh, COUNT(*) AS n FROM outdoor_readings
           WHERE address = ? AND at >= ? AND at < ? AND ok = 1 AND t BETWEEN -10 AND 60 AND rh BETWEEN 1 AND 100`,
};

// The status queries, exported so a test can check their query plans.
export const STATUS_SQL = {
  latest: `SELECT * FROM (SELECT * FROM readings WHERE room_id = ? AND kind = ? AND address = ?
                          ORDER BY id DESC LIMIT ?) ORDER BY id`,
  lastOk: `SELECT * FROM readings WHERE room_id = ? AND kind = ? AND address = ? AND ok = 1
           ORDER BY id DESC LIMIT 1`,
  // Counting stops at 10000: the status only needs to know "3 or more".
  failuresSince: `SELECT COUNT(*) AS n FROM (SELECT 1 FROM readings WHERE room_id = ? AND kind = ? AND address = ? AND id > ?
                                            LIMIT 10000)`,
};

// Stream B: the history queries (spec 2026-10-19-safety-and-history-design.md 5). One query averages one bucket
// (parameters: room id, from, to; from inclusive, to exclusive). It reads only the covering readings_by_time index and
// has no GROUP BY, so no temp b-tree. Good readings inside the plausible ranges of spec section 1 only.
export const HISTORY_SQL = {
  bucket(kind) {
    return kind === 'trh'
      ? `SELECT AVG(t) AS t, AVG(rh) AS rh, COUNT(*) AS n FROM readings
         WHERE room_id = ? AND kind = 'trh' AND at >= ? AND at < ? AND ok = 1 AND t BETWEEN -10 AND 60 AND rh BETWEEN 1 AND 100`
      : `SELECT AVG(co2) AS co2, COUNT(*) AS n FROM readings
         WHERE room_id = ? AND kind = 'co2' AND at >= ? AND at < ? AND ok = 1 AND co2 BETWEEN 300 AND 10000`;
  },
};

// The machine log queries a test checks the plans of.
export const MACHINE_LOG_SQL = {
  last: 'SELECT * FROM machine_log WHERE room_id = ? AND machine = ? ORDER BY at DESC, id DESC LIMIT 1',
};

// The task log queries (spec 2026-10-30-tasks-design.md 5), exported so a test can check that they read the partial index
// tasks_closed (their status <> 'open' is that index's WHERE). taskLog: the closed rows newest first; ?2 (before): the id
// of the last row of the page before (older rows only), or null; ?3 the page size. taskLogAll: oldest first, for the CSV.
export const TASK_LOG_SQL = {
  taskLog: `SELECT * FROM tasks WHERE room_id = ?1 AND status <> 'open'
              AND (?2 IS NULL OR closed_at < (SELECT closed_at FROM tasks WHERE id = ?2)
                   OR (closed_at = (SELECT closed_at FROM tasks WHERE id = ?2) AND id < ?2))
            ORDER BY closed_at DESC, id DESC LIMIT ?3`,
  taskLogAll: "SELECT * FROM tasks WHERE room_id = ? AND status <> 'open' ORDER BY closed_at, id",
};

// Completed buckets kept per room, sensor kind and bucket size; at most this many buckets back from the newest.
const CACHE_BUCKETS = 400;

// range hours → bucket seconds
export const HISTORY_BUCKET_S = { 1: 15, 6: 60, 24: 300, 168: 1800, 720: 7200 };
const SPARK_BUCKET_MS = 30 * 60_000;
const MACHINE_KEYS = [...RELAY_KEYS, 'ac'];
const LEVEL_RANK = { critical: 3, serious: 2, warning: 1 };

const alarmRow = (r) => ({
  id: r.id, roomId: r.room_id, roomName: r.room_name, key: r.key, level: r.level, text: r.text,
  raisedAt: r.raised_at, clearedAt: r.cleared_at, ackedAt: r.acked_at,
});

// The upgrade to version 20 (spec 2026-11-04-harvest-design.md 2.2): each room with crops gets an open partial run, and its
// done harvest checks with kg become harvests of that run, of the first of its crops the rule is for (a row with none of
// them stays a task row only). The run starts at the upgrade or at its first copied harvest, whichever is earlier.
function upgradeHarvests(db, now) {
  const rooms = db.prepare('SELECT DISTINCT room_id FROM room_crops ORDER BY room_id').all().map((r) => r.room_id);
  const crops = db.prepare('SELECT crop, blocks FROM room_crops WHERE room_id = ? ORDER BY position');
  const stage = db.prepare('SELECT stage FROM room_programs WHERE room_id = ?');
  const done = db.prepare(`SELECT * FROM tasks WHERE room_id = ? AND rule_key IN (${HARVEST_RULES.map(() => '?').join(', ')})
                           AND status = 'done' AND amount > 0 ORDER BY closed_at, id`);
  const insertRun = db.prepare('INSERT INTO runs (room_id, started_at, crops, partial) VALUES (?, ?, ?, 1)');
  const insertHarvest = db.prepare(`INSERT INTO harvests (room_id, run_id, crop, stage, flush, blocks, kg, picked_at, worker, task_id, created_at)
                                    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`);
  const families = Object.fromEntries(DAILY_RULES.filter((r) => HARVEST_RULES.includes(r.key)).map((r) => [r.key, r.families]));
  for (const roomId of rooms) {
    const list = crops.all(roomId).map((c) => ({ crop: c.crop, blocks: c.blocks }));
    const roomStage = stage.get(roomId)?.stage ?? 'fruiting';
    const copies = done.all(roomId, ...HARVEST_RULES).flatMap((row) => {
      const c = list.find((x) => families[row.rule_key].includes(FAMILY_OF[x.crop]));
      return c ? [{ row, c }] : [];
    });
    const startedAt = Math.min(now, copies[0]?.row.closed_at ?? now);
    const runId = Number(insertRun.run(roomId, startedAt, JSON.stringify(list)).lastInsertRowid);
    for (const { row, c } of copies) {
      insertHarvest.run(roomId, runId, c.crop, roomStage, c.blocks, row.amount, row.closed_at, row.worker, row.id, row.closed_at);
    }
  }
}

// Brings a new or older database up to VERSION in one transaction.
function migrate(db) {
  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  if (version >= VERSION) return;
  db.exec('BEGIN');
  try {
    if (version < 1) {
      const hasRooms = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'rooms'").get();
      if (hasRooms) {
        db.exec(`ALTER TABLE rooms ADD COLUMN trh_address INTEGER CHECK (trh_address BETWEEN 1 AND 247);
                 ALTER TABLE rooms ADD COLUMN co2_address INTEGER CHECK (co2_address BETWEEN 1 AND 247);`);
      } else {
        db.exec(ROOMS);
      }
      db.exec(READINGS);
    }
    if (version < 2) {
      db.exec(`ALTER TABLE rooms ADD COLUMN relay_address INTEGER CHECK (relay_address BETWEEN 1 AND 247);
               ALTER TABLE rooms ADD COLUMN ac_address INTEGER CHECK (ac_address BETWEEN 1 AND 247);`);
      db.exec(MACHINE_COMMANDS);
      db.exec('INSERT INTO machine_commands (room_id) SELECT id FROM rooms');
    }
    if (version < 3) {
      db.exec(ROOM_CONTROLS);
      db.exec(`INSERT INTO room_controls (room_id, exchange, humidifier)
               SELECT r.id, COALESCE(c.intake, 0), COALESCE(c.humidifier, 0)
               FROM rooms r LEFT JOIN machine_commands c ON c.room_id = r.id`);
    }
    if (version === 3) { // a new database or an older one already has the column from ROOM_CONTROLS
      db.exec('ALTER TABLE room_controls ADD COLUMN humidifier_during_exchange INTEGER NOT NULL DEFAULT 1 CHECK (humidifier_during_exchange IN (0, 1))');
    }
    if (version < 5) db.exec(SETTINGS);
    if (version >= 3 && version < 6) { // older tables lack the column; a table made above by ROOM_CONTROLS has it
      db.exec("ALTER TABLE room_controls ADD COLUMN ac_fan TEXT NOT NULL DEFAULT 'auto' CHECK (ac_fan IN ('auto','low','high'))");
    }
    if (version < 7) {
      if (version >= 3) db.exec(SAFETY_CONTROL_COLUMNS); // a table made above by ROOM_CONTROLS has them
      db.exec(ALARMS);
      db.exec(MACHINE_LOG);
      // The log starts with what each room has commanded now, so machines already on show on the timeline.
      const at = Date.now();
      for (const key of RELAY_KEYS.filter((k) => k !== 'dehumidifier' && k !== 'lights')) { // those came later (upgrades 12, 16)
        db.prepare(`INSERT INTO machine_log (room_id, machine, at, on_, source)
                    SELECT m.room_id, ?, ?, m.${key}, CASE WHEN c.auto = 1 THEN 'auto' ELSE 'manual' END
                    FROM machine_commands m JOIN room_controls c ON c.room_id = m.room_id`).run(key, at);
      }
      db.prepare(`INSERT INTO machine_log (room_id, machine, at, on_, setpoint, mode, fan, source)
                  SELECT m.room_id, 'ac', ?, m.ac_power, m.ac_setpoint, m.ac_mode, m.ac_fan,
                         CASE WHEN c.auto = 1 THEN 'auto' ELSE 'manual' END
                  FROM machine_commands m JOIN room_controls c ON c.room_id = m.room_id`).run(at);
      // Covering: the history buckets read only the index, not the table.
      db.exec('CREATE INDEX readings_by_time ON readings (room_id, kind, at, ok, t, rh, co2);');
    }
    // The aircon drop during an exchange becomes a room setting: existing rooms keep the 5 °C they had.
    if (version >= 3 && version < 8) {
      db.exec('ALTER TABLE room_controls ADD COLUMN ac_drop REAL NOT NULL DEFAULT 5');
      // The CO2 lower limit is now at least 450 ppm: lift an older band so the room stays valid (else no setting could
      // be saved, not even auto off), keeping the upper limit above it and the safety level above that.
      db.exec(`UPDATE room_controls SET co2_low = 450 WHERE co2_low < 450;
               UPDATE room_controls SET co2_high = 600 WHERE co2_high <= co2_low;
               UPDATE room_controls SET co2_safety = MIN(10000, co2_high + 500) WHERE co2_safety <= co2_high;`);
    }
    if (version < 9) {
      db.exec(USAGE_ROOM_COLUMNS);
      db.exec(OUTDOOR_READINGS);
      db.exec(METER_READINGS);
    }
    // Fresh air at least every 15 min, for the existing rooms too (a table made above by ROOM_CONTROLS has the columns).
    if (version >= 3 && version < 10) db.exec(FRESH_AIR_CONTROL_COLUMNS);
    if (version < 11) db.exec(PROGRAMS);
    // When the dehumidifier last stopped (the humidifier waits after it); a table made above already has it.
    if (version >= 3 && version < 13 && !db.prepare('PRAGMA table_info(room_controls)').all().some((c) => c.name === 'dehumidifier_off_at')) {
      db.exec('ALTER TABLE room_controls ADD COLUMN dehumidifier_off_at INTEGER');
    }
    if (version < 12) {
      // The dehumidifier (spec 2026-10-21-dehumidifier-design.md 6). A table made above already has its columns.
      const has = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
      if (!has('machine_commands', 'dehumidifier')) db.exec('ALTER TABLE machine_commands ADD COLUMN dehumidifier INTEGER NOT NULL DEFAULT 0');
      if (!has('room_controls', 'dehumidifier')) {
        db.exec('ALTER TABLE room_controls ADD COLUMN dehumidifier INTEGER NOT NULL DEFAULT 0 CHECK (dehumidifier IN (0, 1))');
      }
      if (!has('room_controls', 'humidifier_last_on')) db.exec('ALTER TABLE room_controls ADD COLUMN humidifier_last_on INTEGER');
      if (!has('rooms', 'dehumidifier')) db.exec(DEHUMIDIFIER_ROOM_COLUMNS);
      // machine_log's CHECK must allow the new machine: rebuild it with its rows (a table made above already allows it).
      if (version >= 7) {
        db.exec(`ALTER TABLE machine_log RENAME TO machine_log_old;
                 DROP INDEX machine_log_by_room;
                 ${MACHINE_LOG}
                 INSERT INTO machine_log SELECT * FROM machine_log_old;
                 DROP TABLE machine_log_old;`);
      }
    }
    if (version < 14) {
      // The filter (spec 2026-10-22-filter-design.md 9): an existing room's filter counts as changed at the upgrade. A file
      // that already has the columns and tables keeps them.
      if (!db.prepare('PRAGMA table_info(rooms)').all().some((c) => c.name === 'fan_max_pa')) {
        db.exec(FILTER_ROOM_COLUMNS);
        db.prepare('UPDATE rooms SET filter_changed_at = ?').run(Date.now());
      }
      db.exec(FILTER_TABLES);
    }
    // Outdoor air in control (spec 2026-10-26-live-alarms-outdoor-design.md 4): the room setting and why the exchange runs.
    if (version >= 3 && version < 15) {
      const cols = db.prepare('PRAGMA table_info(room_controls)').all().map((c) => c.name);
      if (!cols.includes('outdoor_air')) db.exec('ALTER TABLE room_controls ADD COLUMN outdoor_air INTEGER NOT NULL DEFAULT 1 CHECK (outdoor_air IN (0, 1))');
      if (!cols.includes('exchange_kind')) db.exec('ALTER TABLE room_controls ADD COLUMN exchange_kind TEXT');
    }
    if (version < 16) {
      const has = (table, column) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
      for (const [table, column, type] of LIGHTS_COLUMNS) if (!has(table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
      // machine_log's CHECK must allow the lights: rebuild it with its rows, unless it already allows them.
      const { sql } = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'machine_log'").get();
      if (!sql.includes("'lights'")) {
        db.exec(`ALTER TABLE machine_log RENAME TO machine_log_old;
                 DROP INDEX machine_log_by_room;
                 ${MACHINE_LOG}
                 INSERT INTO machine_log SELECT * FROM machine_log_old;
                 DROP TABLE machine_log_old;`);
      }
    }
    // Since when automatic control is on or off (the Manual reminder, alarm 'manualLong'). Not known for the existing rows:
    // a room in Manual counts from the upgrade (its reminder comes 2 h after it), a room in auto stays null (not known; only
    // the time auto went off matters). A file that already has the column keeps its times.
    if (version < 17) {
      if (!db.prepare('PRAGMA table_info(room_controls)').all().some((c) => c.name === 'auto_changed_at')) {
        db.exec('ALTER TABLE room_controls ADD COLUMN auto_changed_at INTEGER');
      }
      db.prepare('UPDATE room_controls SET auto_changed_at = ? WHERE auto = 0 AND auto_changed_at IS NULL').run(Date.now());
    }
    // A room behind its own Modbus gateway (a container): its host:port, null for the farm's (FARM_GATEWAY). A file that
    // already has the column keeps it.
    if (version < 18 && !db.prepare('PRAGMA table_info(rooms)').all().some((c) => c.name === 'gateway')) {
      db.exec('ALTER TABLE rooms ADD COLUMN gateway TEXT');
    }
    if (version < 19) db.exec(TASKS);
    // Runs and harvests. A file that already has the tables keeps them (its runs and harvests are not made twice).
    if (version < 20) {
      const had = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'runs'").get();
      db.exec(RUNS_HARVESTS);
      if (!had) upgradeHarvests(db, Date.now());
    }
    // ---- Batches ---- (spec 2026-11-05-batches-design.md 2): every table of both parts in one step.
    if (version < 21) db.exec(BATCHES_SCHEMA);
    // ---- Inventory (spec 2026-11-05-inventory-design.md 2.3) ----
    if (version < 22) db.exec(INVENTORY);
    // ---- Sales (spec 2026-11-05-sales-design.md 2.4): buyers and sales; nothing to copy (the farm kept no sales). ----
    if (version < 23) db.exec(SALES);
    // ---- Costs ---- (spec 2026-11-05-costs-design.md 2)
    if (version < 24) db.exec(COSTS);
    // ---- Login ---- (spec 2026-11-06-login-design.md 2): every worker of before is a worker who cannot sign in yet.
    if (version < 25) {
      // A file the tests only stamped with an older version already has the columns (as with the steps above).
      if (!db.prepare('PRAGMA table_info(workers)').all().some((c) => c.name === 'role')) db.exec(LOGIN_COLUMNS);
      db.exec(LOGIN);
    }
    db.exec(`PRAGMA user_version = ${VERSION}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// A simulation_runs row (without result) as the API shows it.
const runRow = (r) => ({
  id: r.id, roomId: r.room_id, createdAt: r.created_at, status: r.status, progress: r.progress, input: JSON.parse(r.input),
  summary: r.summary === null ? null : JSON.parse(r.summary), error: r.error, finishedAt: r.finished_at,
});

// A tasks row as the tasks module and the API show it (amountLabel is the tasks module's).
const taskRow = (r) => ({
  id: r.id, roomId: r.room_id, kind: r.kind, ruleKey: r.rule_key, date: r.date, slot: r.slot, text: r.text, note: r.note,
  status: r.status, dueAt: r.due_at, createdAt: r.created_at, closedAt: r.closed_at, worker: r.worker, amount: r.amount,
  unit: r.unit, reason: r.reason, source: r.source === null ? null : JSON.parse(r.source),
});

// A runs row (a run of blocks, not a simulation run) and a harvests row as the harvest module shows them.
const runOf = (r) => ({ id: r.id, roomId: r.room_id, startedAt: r.started_at, endedAt: r.ended_at, crops: JSON.parse(r.crops), partial: r.partial === 1 });
const harvestOf = (r) => ({
  id: r.id, roomId: r.room_id, runId: r.run_id, crop: r.crop, stage: r.stage, flush: r.flush, blocks: r.blocks, kg: r.kg,
  pickedAt: r.picked_at, worker: r.worker, taskId: r.task_id, createdAt: r.created_at,
});

// ---- Inventory ---- A stock_items row and a stock_moves row as the inventory module shows them.
const stockItemOf = (r) => ({
  id: r.id, name: r.name, kind: r.kind, unit: r.unit, reorderAt: r.reorder_at, ingredient: r.ingredient, lrmpNo: r.lrmp_no,
  archived: r.archived === 1, lowSentAt: r.low_sent_at,
});
const stockMoveOf = (r) => ({
  id: r.id, itemId: r.item_id, at: r.at, qty: r.qty, unitCost: r.unit_cost, refKind: r.ref_kind, refId: r.ref_id, note: r.note,
  total: r.total, supplier: r.supplier, useBy: r.use_by, roomId: r.room_id, reason: r.reason, worker: r.worker,
  counted: r.counted, lotId: r.lot_id, useBySentAt: r.use_by_sent_at,
});
// ---- Costs ---- A costs row as the costs module shows it, and a cost's fields in the insert's and update's column order.
const costOf = (r) => ({
  id: r.id, date: r.date, category: r.category, amount: r.amount, roomId: r.room_id, runId: r.run_id, note: r.note,
  sourceKind: r.source_kind, sourceId: r.source_id, repeat: r.repeat, repeatUntil: r.repeat_until, worker: r.worker,
  utility: r.utility, periodFrom: r.period_from, periodTo: r.period_to, createdAt: r.created_at,
});
const costValues = (f) => [f.date, f.category, f.amount, f.roomId ?? null, f.runId ?? null, f.note ?? '', f.repeat ?? null,
  f.repeatUntil ?? null, f.worker ?? null, f.utility ?? null, f.periodFrom ?? null, f.periodTo ?? null];

// A machine_log row as the API shows it.
const logRow = (r) => ({ at: r.at, on: r.on_ === 1, setpoint: r.setpoint, mode: r.mode, fan: r.fan, source: r.source });

// Thrown by createRoom and updateRoom when another room already has the name
// (ignoring case).
export class NameTakenError extends Error {
  constructor(name) {
    super(`A room called "${name}" already exists`);
    this.name = 'NameTakenError';
    this.roomName = name;
  }
}

// Thrown by createRoom and updateRoom when another room on the same gateway already uses an address (any of the six: trh,
// co2, relay, ac, meter, dp). field says which address clashes.
export class AddressTakenError extends Error {
  constructor(address, roomName, field) {
    super(`Address ${address} is already used by ${roomName}`);
    this.name = 'AddressTakenError';
    this.address = address;
    this.roomName = roomName;
    this.field = field;
  }
}

const KINDS = ['trh', 'co2'];
const FAILS_FOR_OFFLINE = 3;

function toRoom(row) {
  return {
    id: row.id,
    name: row.name,
    length: row.length_m,
    width: row.width_m,
    height: row.height_m,
    volume: Math.round(row.length_m * row.width_m * row.height_m * 100) / 100,
    trhAddress: row.trh_address,
    co2Address: row.co2_address,
    relayAddress: row.relay_address,
    acAddress: row.ac_address,
    meterAddress: row.meter_address,
    gateway: row.gateway ?? null,
    intakeW: row.intake_w,
    exhaustW: row.exhaust_w,
    circulationW: row.circulation_w,
    humidifierW: row.humidifier_w,
    humidifierLH: row.humidifier_lh,
    acInputW: row.ac_input_w,
    dehumidifierW: row.dehumidifier_w,
    dehumidifierLday: row.dehumidifier_lday,
    dehumidifier: row.dehumidifier === 1,
    lightsW: row.lights_w,
    lights: row.lights === 1,
    dpAddress: row.dp_address,
    fanMaxPa: row.fan_max_pa,
    filterCleanPa: row.filter_clean_pa,
    filterFinalPa: row.filter_final_pa,
    filterChangeDays: row.filter_change_days,
    filterChangedAt: row.filter_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// The six ratings in column order; one not given is the default (an older client's body).
const ratingValues = (given) => RATINGS.map(({ field, default: d }) => given[field] ?? d);

// The four filter settings in column order: one not given keeps the stored value (old: the rooms row), or is the default.
const filterValues = (given, old = null) => FILTER.map(({ field, default: d }) => given[field] ?? old?.[FILTER_COLUMNS[field]] ?? d);

function toAlarm(row) {
  return {
    id: row.id, roomId: row.room_id, roomName: row.room_name, key: row.key, level: row.level, text: row.text,
    raisedAt: row.raised_at, clearedAt: row.cleared_at, ackedAt: row.acked_at,
  };
}

// path is a file path or ':memory:'. Fields passed in must already be valid
// (see validateRoom in rooms.js).
export function openDb(path, { log = console.error } = {}) {
  const alarmListeners = new Set();
  const safe = (fn) => { try { fn(); } catch (err) { log(err); } };
  const tellAlarm = (change, alarmOf) => {
    if (alarmListeners.size === 0) return;
    const alarm = alarmOf();
    for (const fn of [...alarmListeners]) safe(() => fn({ change, alarm }));
  };
  // timeout: a write waits up to 2 s for another reader (a copy made with VACUUM INTO, a backup) instead of failing at once
  // with "database is locked" (seen 2026-10-28: polls lost while copies of the farm database were made)
  const db = new DatabaseSync(path, { timeout: 2000 });
  migrate(db);

  const q = {
    list: db.prepare('SELECT * FROM rooms ORDER BY name, id'),
    get: db.prepare('SELECT * FROM rooms WHERE id = ?'),
    nameUsed: db.prepare('SELECT 1 FROM rooms WHERE name = ? AND id IS NOT ?'),
    addressUsed: db.prepare(`SELECT name FROM rooms WHERE id IS NOT ?1 AND gateway IS ?3
                             AND (trh_address = ?2 OR co2_address = ?2 OR relay_address = ?2 OR ac_address = ?2 OR meter_address = ?2
                                  OR dp_address = ?2)`),
    insert: db.prepare(`INSERT INTO rooms (name, length_m, width_m, height_m, trh_address, co2_address,
                                           relay_address, ac_address, meter_address, intake_w, exhaust_w, circulation_w,
                                           humidifier_w, humidifier_lh, ac_input_w, dehumidifier_w, dehumidifier_lday, lights_w,
                                           dehumidifier, lights, fan_max_pa, filter_clean_pa, filter_final_pa, filter_change_days,
                                           filter_changed_at, dp_address, gateway, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    update: db.prepare(`UPDATE rooms SET name = ?, length_m = ?, width_m = ?, height_m = ?,
                               trh_address = ?, co2_address = ?, relay_address = ?, ac_address = ?, meter_address = ?,
                               intake_w = ?, exhaust_w = ?, circulation_w = ?, humidifier_w = ?, humidifier_lh = ?, ac_input_w = ?,
                               dehumidifier_w = ?, dehumidifier_lday = ?, lights_w = ?, dehumidifier = ?, lights = ?,
                               fan_max_pa = ?, filter_clean_pa = ?, filter_final_pa = ?, filter_change_days = ?, dp_address = ?,
                               gateway = ?, updated_at = ?
                        WHERE id = ?`),
    delete: db.prepare('DELETE FROM rooms WHERE id = ?'),
    deleteReadings: db.prepare('DELETE FROM readings WHERE room_id = ?'),
    insertCommands: db.prepare('INSERT INTO machine_commands (room_id) VALUES (?)'),
    deleteCommands: db.prepare('DELETE FROM machine_commands WHERE room_id = ?'),
    commands: db.prepare('SELECT * FROM machine_commands WHERE room_id = ?'),
    // A new room: the humidifier is not forced on during an air exchange (fresh Malaysian air is wet already).
    // and the aircon is not lowered during an exchange (it already runs at full power then). The column defaults
    // (humidifier 1, ac_drop 5) stay for the rooms that the upgrades gave the settings. Auto is off from when the row is made.
    insertControl: db.prepare(`INSERT OR REPLACE INTO room_controls (room_id, humidifier_during_exchange, ac_drop, auto_changed_at)
                               VALUES (?, 0, 0, ?)`),
    deleteControl: db.prepare('DELETE FROM room_controls WHERE room_id = ?'),
    clearDehumidifierBand: db.prepare('UPDATE room_controls SET dehumidifier = 0 WHERE room_id = ?'),
    deleteAlarms: db.prepare('DELETE FROM alarms WHERE room_id = ?'),
    deleteMachineLog: db.prepare('DELETE FROM machine_log WHERE room_id = ?'),
    deleteMeterReadings: db.prepare('DELETE FROM meter_readings WHERE room_id = ?'),
    deleteFilterReadings: db.prepare('DELETE FROM filter_readings WHERE room_id = ?'),
    deleteFilterChanges: db.prepare('DELETE FROM filter_changes WHERE room_id = ?'),
    crops: db.prepare('SELECT crop, blocks FROM room_crops WHERE room_id = ? ORDER BY position'),
    deleteCrops: db.prepare('DELETE FROM room_crops WHERE room_id = ?'),
    insertCrop: db.prepare('INSERT INTO room_crops (room_id, position, crop, blocks) VALUES (?, ?, ?, ?)'),
    program: db.prepare('SELECT * FROM room_programs WHERE room_id = ?'),
    deleteProgram: db.prepare('DELETE FROM room_programs WHERE room_id = ?'),
    setProgram: db.prepare(`INSERT OR REPLACE INTO room_programs (room_id, farm_type, stage, stage_since, flush, flushes, days_spawn,
                              days_pinning, days_fruiting, days_rest, ramp_h, auto_advance, ramp, done, light_spawn,
                              light_pinning, light_fruiting, light_rest, light_start)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    insertRun: db.prepare(`INSERT INTO simulation_runs (room_id, created_at, status, progress, input) VALUES (?, ?, 'queued', 0, ?)`),
    run: db.prepare('SELECT * FROM simulation_runs WHERE id = ?'),
    runHead: db.prepare(`SELECT id, room_id, created_at, status, progress, input, summary, error, finished_at
                         FROM simulation_runs WHERE id = ?`),
    runs: db.prepare(`SELECT id, room_id, created_at, status, progress, input, summary, error, finished_at
                      FROM simulation_runs WHERE room_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`),
    setRunProgress: db.prepare('UPDATE simulation_runs SET status = ?, progress = ? WHERE id = ?'),
    finishRun: db.prepare(`UPDATE simulation_runs SET status = ?, progress = ?, summary = ?, result = ?, error = ?, finished_at = ?
                           WHERE id = ?`),
    deleteRun: db.prepare('DELETE FROM simulation_runs WHERE id = ?'),
    deleteRuns: db.prepare('DELETE FROM simulation_runs WHERE room_id = ?'),
    unfinishedRuns: db.prepare("SELECT id FROM simulation_runs WHERE status IN ('queued', 'running') ORDER BY id"),
    pruneRuns: db.prepare(`DELETE FROM simulation_runs WHERE room_id = ? AND status IN ('done', 'failed') AND id NOT IN (
                             SELECT id FROM simulation_runs WHERE room_id = ? AND status IN ('done', 'failed')
                             ORDER BY created_at DESC, id DESC LIMIT ?)`),
    control: db.prepare('SELECT * FROM room_controls WHERE room_id = ?'),
    setControl: db.prepare(`UPDATE room_controls SET auto = ?, co2_low = ?, co2_high = ?, t_low = ?, t_high = ?,
                                   rh_low = ?, rh_high = ?, humidifier_during_exchange = ?, ac_fan = ?,
                                   co2_safety = ?, exchange_max_min = ?, ac_drop = ?, exchange_every_min = ?, outdoor_air = ? WHERE room_id = ?`),
    setControlState: db.prepare(`UPDATE room_controls SET exchange = ?, humidifier = ?, exchange_since = ?,
                                        exchange_ended_at = ?, capped_in_row = ?, humidifier_since = ?,
                                        exchange_forced = ?, fresh_from = ?, dehumidifier = ?, humidifier_last_on = ?, dehumidifier_off_at = ?,
                                        exchange_kind = ?, auto_changed_at = ? WHERE room_id = ?`),
    setRelay: Object.fromEntries(RELAY_KEYS.map((key) => [key,
      db.prepare(`UPDATE machine_commands SET ${key} = ?, relay_sent_at = ? WHERE room_id = ?`)])),
    setAc: db.prepare(`UPDATE machine_commands SET ac_power = ?, ac_mode = ?, ac_setpoint = ?, ac_fan = ?, ac_sent_at = ?
                       WHERE room_id = ?`),
    // outputs: how many coils and inputs the relay is read with: what the room has fitted (a relay module with 4 outputs
    // and no dehumidifier or lights must not be asked for 6)
    wiredMachines: db.prepare(`SELECT id AS roomId, 'relay' AS kind, relay_address AS address,
                                      CASE WHEN lights = 1 THEN 6 WHEN dehumidifier = 1 THEN 5 ELSE 4 END AS outputs, gateway
                               FROM rooms WHERE relay_address IS NOT NULL
                               UNION ALL
                               SELECT id, 'ac', ac_address, NULL, gateway FROM rooms WHERE ac_address IS NOT NULL
                               ORDER BY 1, 2 DESC`),
    wired: db.prepare(`SELECT id AS roomId, 'trh' AS kind, trh_address AS address, gateway FROM rooms WHERE trh_address IS NOT NULL
                       UNION ALL
                       SELECT id, 'co2', co2_address, gateway FROM rooms WHERE co2_address IS NOT NULL
                       ORDER BY 1, 2 DESC`),
    // Only while the room still has that address for that kind.
    addReading: db.prepare(`INSERT INTO readings (room_id, kind, address, at, ok, t, rh, co2, error)
                            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
                            WHERE EXISTS (SELECT 1 FROM rooms WHERE id = ? AND
                              CASE ? WHEN 'trh' THEN trh_address WHEN 'co2' THEN co2_address END = ?)`),
    // Alarms (spec 2026-10-19-safety-and-history-design.md section 3): the queries of the alarm module and routes.
    insertAlarm: db.prepare('INSERT INTO alarms (room_id, key, level, text, raised_at) VALUES (?, ?, ?, ?, ?)'),
    clearAlarm: db.prepare('UPDATE alarms SET cleared_at = ? WHERE room_id = ? AND key = ? AND cleared_at IS NULL'),
    alarm: db.prepare(`SELECT a.*, r.name AS room_name FROM alarms a JOIN rooms r ON r.id = a.room_id WHERE a.id = ?`),
    activeAlarms: db.prepare(`SELECT a.*, r.name AS room_name FROM alarms a JOIN rooms r ON r.id = a.room_id
                              WHERE a.room_id = ? AND a.cleared_at IS NULL ORDER BY a.id`),
    // Current = active, or cleared and not acknowledged. Critical first, then newest.
    currentAlarms: db.prepare(`SELECT a.*, r.name AS room_name FROM alarms a JOIN rooms r ON r.id = a.room_id
                               WHERE (a.cleared_at IS NULL OR a.acked_at IS NULL) AND (?1 IS NULL OR a.room_id = ?1)
                               ORDER BY a.level = 'critical' DESC, a.raised_at DESC, a.id DESC`),
    alarmHistory: db.prepare(`SELECT a.*, r.name AS room_name FROM alarms a JOIN rooms r ON r.id = a.room_id
                              WHERE a.room_id = ? ORDER BY a.id DESC LIMIT 50`),
    ackAlarm: db.prepare('UPDATE alarms SET acked_at = COALESCE(acked_at, ?) WHERE id = ?'),
    ackRoomAlarms: db.prepare('UPDATE alarms SET acked_at = ? WHERE room_id = ? AND acked_at IS NULL'), // all of those are current
    // Stream B: machine log (spec 2026-10-19-safety-and-history-design.md 4).
    logLast: db.prepare(MACHINE_LOG_SQL.last),
    logAdd: db.prepare(`INSERT INTO machine_log (room_id, machine, at, on_, setpoint, mode, fan, source)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    logAll: db.prepare('SELECT * FROM machine_log WHERE room_id = ? AND machine = ? ORDER BY id'),
    logSince: db.prepare('SELECT * FROM machine_log WHERE room_id = ? AND machine = ? AND at >= ? AND at <= ? ORDER BY at, id'),
    logBefore: db.prepare('SELECT * FROM machine_log WHERE room_id = ? AND machine = ? AND at < ? ORDER BY at DESC, id DESC LIMIT 1'),
    overviewActive: db.prepare(`SELECT room_id, level FROM alarms WHERE cleared_at IS NULL`),
    overviewAlarms: db.prepare(`SELECT alarms.*, rooms.name AS room_name FROM alarms JOIN rooms ON rooms.id = alarms.room_id
                               WHERE cleared_at IS NULL OR acked_at IS NULL
                               ORDER BY (level = 'critical') DESC, raised_at DESC, alarms.id DESC LIMIT 10`),
    // Energy meter, outdoor probe and usage queries (spec 2026-10-20-energy-water-outdoor-design.md).
    wiredMeters: db.prepare('SELECT id AS roomId, meter_address AS address, gateway FROM rooms WHERE meter_address IS NOT NULL ORDER BY id'),
    addMeterReading: db.prepare(`INSERT INTO meter_readings (room_id, address, at, ok, power_w, energy_kwh, error)
                                 SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rooms WHERE id = ? AND meter_address = ?)`),
    meterLatest: db.prepare(METER_SQL.latest),
    meterLastOk: db.prepare(METER_SQL.lastOk),
    meterFailuresSince: db.prepare(METER_SQL.failuresSince),
    meterBefore: db.prepare(METER_SQL.before),
    meterRows: db.prepare(METER_SQL.rows),
    meterFirst: db.prepare(METER_SQL.first),
    meterLast: db.prepare(METER_SQL.last),
    meterChunk: db.prepare(METER_SQL.chunk),
    // The filter pressure sensor and the filter changes (spec 2026-10-22-filter-design.md 4 and 5).
    wiredFilters: db.prepare('SELECT id AS roomId, dp_address AS address, gateway FROM rooms WHERE dp_address IS NOT NULL ORDER BY id'),
    addFilterReading: db.prepare(`INSERT INTO filter_readings (room_id, address, at, ok, pa, error)
                                  SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM rooms WHERE id = ? AND dp_address = ?)`),
    filterLatest: db.prepare(FILTER_SQL.latest),
    filterLastOk: db.prepare(FILTER_SQL.lastOk),
    filterFailuresSince: db.prepare(FILTER_SQL.failuresSince),
    filterWindow: db.prepare(FILTER_SQL.window),
    filterLastIn: db.prepare(FILTER_SQL.lastIn),
    setFilterChangedAt: db.prepare('UPDATE rooms SET filter_changed_at = ? WHERE id = ?'),
    addFilterChange: db.prepare('INSERT INTO filter_changes (room_id, at, pa_before) VALUES (?, ?, ?)'),
    filterChanges: db.prepare('SELECT at, pa_before FROM filter_changes WHERE room_id = ? ORDER BY at DESC, id DESC LIMIT ?'),
    addOutdoor: db.prepare(`INSERT INTO outdoor_readings (address, at, ok, t, rh, error)
                            SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM settings WHERE key = 'outdoorAddress' AND value = ?)`),
    outdoorLatest: db.prepare(OUTDOOR_SQL.latest),
    outdoorLastOk: db.prepare(OUTDOOR_SQL.lastOk),
    outdoorFailuresSince: db.prepare(OUTDOOR_SQL.failuresSince),
    outdoorSince: db.prepare(OUTDOOR_SQL.since),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
    latest: db.prepare(STATUS_SQL.latest),
    lastOk: db.prepare(STATUS_SQL.lastOk),
    failuresSince: db.prepare(STATUS_SQL.failuresSince),
    // Tasks (spec 2026-10-30-tasks-design.md 4 and 5). ON CONFLICT DO NOTHING skips only a row the unique indexes already
    // have; a bad row (a CHECK or NOT NULL failure) still throws, where INSERT OR IGNORE would skip it too.
    insertDailyTask: db.prepare(`INSERT INTO tasks (room_id, kind, rule_key, date, slot, text, note, unit, created_at)
                                 VALUES (?, 'daily', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`),
    insertUpkeepTask: db.prepare(`INSERT INTO tasks (room_id, kind, rule_key, slot, text, due_at, created_at)
                                  VALUES (?, 'upkeep', ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`),
    insertLongtermTask: db.prepare(`INSERT INTO tasks (room_id, kind, slot, text, note, source, created_at)
                                    VALUES (?, 'longterm', 'any', ?, ?, ?, ?)`),
    task: db.prepare('SELECT * FROM tasks WHERE id = ?'),
    dailyTasks: db.prepare("SELECT * FROM tasks WHERE room_id = ? AND kind = 'daily' AND date = ? ORDER BY id"),
    calendarTasks: db.prepare(`SELECT * FROM tasks WHERE room_id = ?1 AND ((kind = 'daily' AND date BETWEEN ?2 AND ?3)
      OR (kind <> 'daily' AND status <> 'open' AND closed_at >= ?4 AND closed_at < ?5)) ORDER BY id`),
    openTasks: db.prepare("SELECT * FROM tasks WHERE room_id = ? AND kind = ? AND status = 'open' ORDER BY due_at, id"),
    openDailyBefore: db.prepare("SELECT * FROM tasks WHERE room_id = ? AND kind = 'daily' AND status = 'open' AND date < ? ORDER BY id"),
    lastClosedUpkeep: db.prepare(`SELECT * FROM tasks WHERE room_id = ? AND kind = 'upkeep' AND rule_key = ? AND status IN ('done', 'skipped')
                                  ORDER BY closed_at DESC, id DESC LIMIT 1`),
    closeTask: db.prepare(`UPDATE tasks SET status = ?, closed_at = ?, worker = ?, amount = ?, reason = ?
                           WHERE id = ? AND status = 'open'`),
    reopenTask: db.prepare(`UPDATE tasks SET status = 'open', closed_at = NULL, worker = NULL, amount = NULL, reason = NULL
                            WHERE id = ? AND kind = 'daily' AND status = 'cancelled' AND reason IN ('Stage changed', 'Rule changed')`),
    undoTask: db.prepare(`UPDATE tasks SET status = 'open', closed_at = NULL, worker = NULL, amount = NULL, reason = NULL
                          WHERE id = ? AND kind = 'daily' AND status IN ('done', 'skipped') AND closed_at >= ?`),
    deleteTaskHarvests: db.prepare('DELETE FROM harvests WHERE task_id = ?'),
    setTaskDue: db.prepare("UPDATE tasks SET due_at = ? WHERE id = ? AND kind = 'upkeep' AND status = 'open'"),
    taskLog: db.prepare(TASK_LOG_SQL.taskLog),
    taskLogAll: db.prepare(TASK_LOG_SQL.taskLogAll),
    deleteTasks: db.prepare('DELETE FROM tasks WHERE room_id = ?'),
    workers: db.prepare('SELECT * FROM workers ORDER BY name, id'),
    insertWorker: db.prepare('INSERT INTO workers (name, active) VALUES (?, ?)'),
    updateWorker: db.prepare('UPDATE workers SET name = ?, active = ? WHERE id = ?'),
    deleteWorker: db.prepare('DELETE FROM workers WHERE id = ?'),
    parkWorker: db.prepare('UPDATE workers SET name = ? WHERE id = ?'),
    // ---- Login ----
    account: db.prepare('SELECT * FROM workers WHERE id = ?'),
    accountByName: db.prepare('SELECT * FROM workers WHERE name = ?'), // the column is NOCASE
    loginNames: db.prepare('SELECT id, name, role FROM workers WHERE active = 1 AND secret_hash IS NOT NULL ORDER BY name, id'),
    ownerCount: db.prepare("SELECT COUNT(*) AS n FROM workers WHERE role = 'owner' AND active = 1"),
    activate: db.prepare('UPDATE workers SET active = 1 WHERE id = ?'),
    setSecret: db.prepare('UPDATE workers SET secret_hash = ?, failed_tries = 0, locked_until = NULL WHERE id = ?'),
    setRole: db.prepare('UPDATE workers SET role = ? WHERE id = ?'),
    setTries: db.prepare('UPDATE workers SET failed_tries = ?, locked_until = ? WHERE id = ?'),
    insertSession: db.prepare(`INSERT INTO sessions (token_hash, worker_id, created_at, last_seen, expires_at, user_agent)
                               VALUES (?, ?, ?, ?, ?, ?)`),
    sessionByHash: db.prepare(`SELECT s.id, s.worker_id, s.last_seen, s.expires_at, w.name, w.role, w.active
                               FROM sessions s JOIN workers w ON w.id = s.worker_id WHERE s.token_hash = ?`),
    touchSession: db.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE id = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
    deleteSessionsOf: db.prepare('DELETE FROM sessions WHERE worker_id = ?'),
    deleteSessionsOfInactive: db.prepare('DELETE FROM sessions WHERE worker_id IN (SELECT id FROM workers WHERE active = 0)'),
    pruneSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    sessionCounts: db.prepare('SELECT worker_id, COUNT(*) AS n FROM sessions WHERE expires_at > ? GROUP BY worker_id'),
    ruleSettings: db.prepare('SELECT * FROM task_rule_settings ORDER BY key'),
    clearRuleSettings: db.prepare('DELETE FROM task_rule_settings'),
    insertRuleSetting: db.prepare('INSERT INTO task_rule_settings (key, enabled, every_days) VALUES (?, ?, ?)'),
    customRules: db.prepare('SELECT * FROM custom_task_rules ORDER BY id'),
    insertCustomRule: db.prepare('INSERT INTO custom_task_rules (text, rooms, every_days, slot, enabled) VALUES (?, ?, ?, ?, ?)'),
    updateCustomRule: db.prepare('UPDATE custom_task_rules SET text = ?, rooms = ?, every_days = ?, slot = ?, enabled = ? WHERE id = ?'),
    deleteCustomRule: db.prepare('DELETE FROM custom_task_rules WHERE id = ?'),
    customRuleRooms: db.prepare('UPDATE custom_task_rules SET rooms = ? WHERE id = ?'),
    // A check's amount: the total of its harvests (rounded as the kg are), null when none are left.
    sumTaskAmount: db.prepare('UPDATE tasks SET amount = (SELECT ROUND(SUM(kg), 3) FROM harvests WHERE task_id = ?1) WHERE id = ?1'),
    // Runs of blocks and harvests (spec 2026-11-04-harvest-design.md 2).
    openRun: db.prepare('SELECT * FROM runs WHERE room_id = ? AND ended_at IS NULL'),
    cropRun: db.prepare('SELECT * FROM runs WHERE id = ?'),
    cropRuns: db.prepare('SELECT * FROM runs WHERE room_id = ? ORDER BY started_at DESC, id DESC'),
    startRun: db.prepare('INSERT INTO runs (room_id, started_at, crops) VALUES (?, ?, ?)'),
    setRunCrops: db.prepare('UPDATE runs SET crops = ? WHERE room_id = ? AND ended_at IS NULL'),
    endRun: db.prepare('UPDATE runs SET ended_at = ? WHERE room_id = ? AND ended_at IS NULL'),
    deleteCropRuns: db.prepare('DELETE FROM runs WHERE room_id = ?'),
    insertHarvest: db.prepare(`INSERT INTO harvests (room_id, run_id, crop, stage, flush, blocks, kg, picked_at, worker, task_id, created_at)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    harvest: db.prepare('SELECT * FROM harvests WHERE id = ?'),
    runHarvests: db.prepare('SELECT * FROM harvests WHERE run_id = ? ORDER BY picked_at, id'),
    harvestsBetween: db.prepare('SELECT * FROM harvests WHERE picked_at BETWEEN ? AND ? ORDER BY picked_at, id'),
    updateHarvest: db.prepare('UPDATE harvests SET kg = ?, picked_at = ? WHERE id = ?'),
    deleteHarvest: db.prepare('DELETE FROM harvests WHERE id = ?'),
    deleteHarvests: db.prepare('DELETE FROM harvests WHERE room_id = ?'),
    // ---- Inventory (spec 2026-11-05-inventory-design.md 2) ----
    stockItems: db.prepare('SELECT * FROM stock_items ORDER BY name COLLATE NOCASE, id'),
    stockItem: db.prepare('SELECT * FROM stock_items WHERE id = ?'),
    stockNameUsed: db.prepare('SELECT name FROM stock_items WHERE name = ? COLLATE NOCASE AND id IS NOT ?'),
    insertStockItem: db.prepare('INSERT INTO stock_items (name, kind, unit, reorder_at, ingredient, lrmp_no) VALUES (?, ?, ?, ?, ?, ?)'),
    updateStockItem: db.prepare('UPDATE stock_items SET name = ?, kind = ?, unit = ?, reorder_at = ?, ingredient = ?, lrmp_no = ?, archived = ? WHERE id = ?'),
    deleteStockItem: db.prepare('DELETE FROM stock_items WHERE id = ?'),
    setStockLowSent: db.prepare('UPDATE stock_items SET low_sent_at = ? WHERE id = ?'),
    stockMoves: db.prepare('SELECT * FROM stock_moves ORDER BY at, id'),
    itemStockMoves: db.prepare('SELECT * FROM stock_moves WHERE item_id = ? ORDER BY at, id'),
    stockMove: db.prepare('SELECT * FROM stock_moves WHERE id = ?'),
    insertStockMove: db.prepare(`INSERT INTO stock_moves (item_id, at, qty, unit_cost, ref_kind, ref_id, note, total, supplier, use_by,
                                                          room_id, reason, worker, counted, lot_id)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    updateStockMove: db.prepare(`UPDATE stock_moves SET at = ?, qty = ?, unit_cost = ?, total = ?, supplier = ?, use_by = ?, room_id = ?,
                                                        reason = ?, worker = ?, use_by_sent_at = ? WHERE id = ?`),
    deleteStockMove: db.prepare('DELETE FROM stock_moves WHERE id = ?1 OR lot_id = ?1'),
    setStockUseBySent: db.prepare('UPDATE stock_moves SET use_by_sent_at = ? WHERE id = ? AND use_by IS ?'),
    stockPurchasesBetween: db.prepare(`SELECT m.*, i.name AS item_name, i.kind AS item_kind FROM stock_moves m
                                       JOIN stock_items i ON i.id = m.item_id
                                       WHERE m.ref_kind = 'purchase' AND m.at BETWEEN ? AND ? ORDER BY m.at, m.id`),
    hasBatches: db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'batches'"),
  };
  const batchStore = createBatchStore(db); // ---- Batches ---- (spec 2026-11-05-batches-design.md 2)

  function checkName(name, id) {
    if (q.nameUsed.get(name, id)) throw new NameTakenError(name);
  }

  // Replaces the rows of a list table in one transaction: rows whose id is not in the list are deleted, list items with a
  // stored id updated, the others inserted. → read() after it.
  // before(kept): runs after the deletes, before the updates (workers park their names there, so a swap of two names never
  // trips UNIQUE(name) halfway).
  function replaceList(all, remove, list, update, insert, read, before = null) {
    inTransaction(() => replaceRows(all, remove, list, update, insert, before));
    return read();
  }

  // replaceList's writes, inside a transaction of the caller's.
  function replaceRows(all, remove, list, update, insert, before = null) {
    const stored = new Set(all.all().map((r) => r.id));
    const kept = new Set(list.filter((x) => stored.has(x.id)).map((x) => x.id));
    for (const id of stored) if (!kept.has(id)) remove.run(id);
    before?.(kept);
    for (const x of list) {
      if (kept.has(x.id)) update(x);
      else insert(x);
    }
  }

  // ---- Costs ---- (spec 2026-11-05-costs-design.md 2): the costs table's statements.
  const costQ = {
    insert: db.prepare(`INSERT INTO costs (date, category, amount, room_id, run_id, note, repeat, repeat_until, worker, utility,
                                           period_from, period_to, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    get: db.prepare('SELECT * FROM costs WHERE id = ?'),
    list: db.prepare('SELECT * FROM costs ORDER BY date, id'),
    update: db.prepare(`UPDATE costs SET date = ?, category = ?, amount = ?, room_id = ?, run_id = ?, note = ?, repeat = ?,
                               repeat_until = ?, worker = ?, utility = ?, period_from = ?, period_to = ? WHERE id = ?`),
    until: db.prepare('UPDATE costs SET repeat_until = ? WHERE id = ?'),
    delete: db.prepare('DELETE FROM costs WHERE id = ?'),
  };

  // Runs fn in one transaction: all of its writes or none.
  function inTransaction(fn) {
    db.exec('BEGIN');
    try {
      fn();
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  // setProgram's run change, inside its transaction.
  function writeRun(roomId, crops, { change, at }) {
    if (change === 'end' || change === 'restart') q.endRun.run(at, roomId);
    if (change === 'start' || change === 'restart') q.startRun.run(roomId, at, JSON.stringify(crops));
    if (change === 'update' && q.setRunCrops.run(JSON.stringify(crops), roomId).changes === 0) throw new Error('No open run');
  }

  // A new harvests row, inside a transaction of the caller's or on its own. → its id.
  function writeHarvest({ roomId, runId, crop, stage, flush, blocks, kg, pickedAt, worker = null, taskId = null, at }) {
    return Number(q.insertHarvest.run(roomId, runId, crop, stage, flush, blocks, kg, pickedAt, worker, taskId, at).lastInsertRowid);
  }

  // The writes of setTaskRuleSettings and setCustomTaskRules, inside a transaction of the caller's.
  function writeRuleSettings(list) {
    q.clearRuleSettings.run();
    for (const s of list) q.insertRuleSetting.run(s.key, s.enabled ? 1 : 0, s.everyDays ?? null);
  }
  const customRuleValues = (c) => [c.text, c.rooms == null ? null : JSON.stringify(c.rooms), c.everyDays ?? null, c.slot, c.enabled ? 1 : 0];
  function writeCustomRules(list) {
    replaceRows(q.customRules, q.deleteCustomRule, list, (c) => q.updateCustomRule.run(...customRuleValues(c), c.id),
      (c) => q.insertCustomRule.run(...customRuleValues(c)));
  }

  // Each address may be used by one device of one room only on a gateway (null: the farm's).
  function checkAddresses(addresses, id, gateway) {
    for (const field of ['trhAddress', 'co2Address', 'relayAddress', 'acAddress', 'meterAddress', 'dpAddress']) {
      const address = addresses[field];
      if (address == null) continue;
      const other = q.addressUsed.get(id, address, gateway);
      if (other) throw new AddressTakenError(address, other.name, field);
    }
  }

  function sensorOf(room, kind, limit) {
    const address = room[`${kind}Address`];
    const sensor = { kind, address, status: 'not-wired', failuresInRow: 0, lastOk: null, readings: [] };
    if (address === null) return sensor;
    const rows = q.latest.all(room.id, kind, address, limit);
    sensor.readings = rows.map((r) => (kind === 'trh'
      ? { at: r.at, ok: r.ok === 1, t: r.t, rh: r.rh }
      : { at: r.at, ok: r.ok === 1, co2: r.co2 }));
    if (rows.length === 0) {
      sensor.status = 'no-data';
      return sensor;
    }
    const ok = q.lastOk.get(room.id, kind, address);
    if (ok) sensor.lastOk = kind === 'trh' ? { at: ok.at, t: ok.t, rh: ok.rh } : { at: ok.at, co2: ok.co2 };
    sensor.failuresInRow = q.failuresSince.get(room.id, kind, address, ok ? ok.id : 0).n;
    const n = sensor.failuresInRow;
    sensor.status = n === 0 ? 'online' : n < FAILS_FOR_OFFLINE ? 'timeout' : 'offline';
    return sensor;
  }

  // The outdoor address from the settings, or null.
  function outdoorAddress() {
    const n = Number(q.getSetting.get('outdoorAddress')?.value);
    return Number.isInteger(n) && n >= 1 && n <= 247 ? n : null;
  }

  // A reading at `at` inside a completed bucket makes that cache stale.
  function dropStaleBuckets(roomId, kind, at) {
    const perRoom = bucketCache.get(roomId);
    if (!perRoom) return;
    for (const [key, e] of perRoom) {
      const [k, b] = key.split('/');
      if (k === kind && at < e.hi * Number(b)) perRoom.delete(key);
    }
  }

  function getRoom(id) {
    const row = q.get.get(id);
    return row ? toRoom(row) : null;
  }

  // Averages per bucket. Completed buckets (the bucket of `to` is still running) are cached per room, kind and bucket
  // size as { lo, hi, rows }: the buckets with index lo <= i < hi are complete and rows holds the non-empty ones.
  // A later request reads only the buckets after hi from the table. The queries ignore the sensor address, so
  // a changed address needs no invalidation; a room delete and a reading inside a cached bucket do.
  // The outdoor probe is kind 'out' of the pseudo room 0: its buckets answer for the address that is set now, so a changed
  // address drops them (setSetting).
  const outdoorBucket = db.prepare(OUTDOOR_SQL.bucket);
  const bucketStatements = {
    trh: db.prepare(HISTORY_SQL.bucket('trh')),
    co2: db.prepare(HISTORY_SQL.bucket('co2')),
    out: { get: (_, from, to) => outdoorBucket.get(outdoorAddress(), from, to) },
  };
  const bucketCache = new Map(); // roomId -> Map("kind/bucketMs" -> entry)
  // The completed days of the usage replies (see usage.js), by room and "start/end" of the day; the entries are the usage
  // module's. A change of the room, a row written inside a day that was worked out, and a room delete drop them.
  const usageCache = new Map();
  const OUTDOOR = 0; // the pseudo room

  function computeBuckets(roomId, kind, b, fromIdx, toIdx) {
    const stmt = bucketStatements[kind];
    const rows = [];
    for (let i = fromIdx; i < toIdx; i++) {
      const r = stmt.get(roomId, i * b, (i + 1) * b);
      if (r.n > 0) rows.push(kind === 'co2' ? { idx: i, co2: r.co2 } : { idx: i, t: r.t, rh: r.rh });
    }
    return rows;
  }

  // [{ at, ...values }] of one sensor kind in the window [from, to], bucketMs wide, buckets aligned to the epoch.
  // The window starts at the first bucket boundary at or after from; each `at` is the bucket middle kept inside [from, to].
  function buckets(roomId, kind, b, from, to) {
    const fi = Math.ceil(from / b);
    const ci = Math.floor(to / b); // the bucket holding `to` is not complete
    let rows = [];
    if (ci > fi) {
      let perRoom = bucketCache.get(roomId);
      if (!perRoom) bucketCache.set(roomId, (perRoom = new Map()));
      const key = `${kind}/${b}`;
      let e = perRoom.get(key);
      if (!e || ci < e.lo || fi > e.hi) perRoom.set(key, (e = { lo: fi, hi: fi, rows: [] }));
      if (fi < e.lo) {
        e.rows = computeBuckets(roomId, kind, b, fi, e.lo).concat(e.rows);
        e.lo = fi;
      }
      if (ci > e.hi) {
        e.rows.push(...computeBuckets(roomId, kind, b, e.hi, ci));
        e.hi = ci;
      }
      if (e.hi - e.lo > CACHE_BUCKETS) {
        e.lo = e.hi - CACHE_BUCKETS;
        e.rows = e.rows.filter((r) => r.idx >= e.lo);
      }
      rows = e.rows.filter((r) => r.idx >= fi && r.idx < ci);
    }
    if (ci >= fi) { // the running bucket: readings up to `to`
      const r = bucketStatements[kind].get(roomId, ci * b, to + 1);
      if (r.n > 0) rows = rows.concat(kind === 'co2' ? { idx: ci, co2: r.co2 } : { idx: ci, t: r.t, rh: r.rh });
    }
    return rows.map(({ idx, ...values }) => ({ at: Math.min(Math.max(idx * b + b / 2, from), to), ...values }));
  }

  return {
    listRooms() {
      return q.list.all().map(toRoom);
    },

    getRoom,

    createRoom({ name, length, width, height, trhAddress = null, co2Address = null, relayAddress = null, acAddress = null,
      meterAddress = null, dpAddress = null, gateway = null, ...ratings }, now = Date.now()) {
      checkName(name, null);
      checkAddresses({ trhAddress, co2Address, relayAddress, acAddress, meterAddress, dpAddress }, null, gateway);
      db.exec('BEGIN');
      try {
        // A new room's filter counts as changed when it was made.
        const { lastInsertRowid } = q.insert.run(name, length, width, height, trhAddress, co2Address,
          relayAddress, acAddress, meterAddress, ...ratingValues(ratings), ratings.dehumidifier ? 1 : 0, ratings.lights ? 1 : 0,
          ...filterValues(ratings), now, dpAddress, gateway, now, now);
        q.insertCommands.run(lastInsertRowid);
        q.insertControl.run(lastInsertRowid, now);
        db.exec('COMMIT');
        return getRoom(Number(lastInsertRowid));
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    // Returns the updated room, or null when there is no room with that id. A gateway left out (undefined) keeps the stored one.
    updateRoom(id, { name, length, width, height, trhAddress = null, co2Address = null, relayAddress = null, acAddress = null,
      meterAddress = null, dpAddress = null, gateway, ...ratings }, now = Date.now()) {
      const old = q.get.get(id);
      if (!old) return null;
      const via = gateway === undefined ? old.gateway : gateway;
      checkName(name, id);
      checkAddresses({ trhAddress, co2Address, relayAddress, acAddress, meterAddress, dpAddress }, id, via);
      const fitted = ratings.dehumidifier === undefined ? old.dehumidifier === 1 : ratings.dehumidifier;
      const lit = ratings.lights === undefined ? old.lights === 1 : ratings.lights;
      q.update.run(name, length, width, height, trhAddress, co2Address, relayAddress, acAddress, meterAddress,
        ...ratingValues(ratings), fitted ? 1 : 0, lit ? 1 : 0, ...filterValues(ratings, old), dpAddress, via, now, id);
      // Lights taken out: their log ends now (no usage charged for ever).
      if (old.lights === 1 && !lit) this.logOff(id, 'lights', now);
      // A dehumidifier taken out of the room: its log ends now (no usage charged for ever) and its band state starts again.
      if (old.dehumidifier === 1 && !fitted) {
        this.logOff(id, 'dehumidifier', now);
        q.clearDehumidifierBand.run(id);
      }
      // A device that is gone or is another one (another address or gateway) no longer runs its machines: log the ones logged
      // on as off now, else the usage estimate charges them for ever.
      const moved = old.gateway !== via;
      if (moved || old.relay_address !== relayAddress) for (const key of RELAY_KEYS) this.logOff(id, key, now);
      if (moved || old.ac_address !== acAddress) this.logOff(id, 'ac', now);
      // The worked-out days keep the meter's steps and the filter sensor's pressure (another device or gateway reads others);
      // the run times change only with a log row (logMachine drops those days), the ratings and size are read at read time.
      if (moved || old.meter_address !== meterAddress || old.dp_address !== dpAddress) usageCache.delete(id);
      return getRoom(id);
    },

    // What was last commanded, or null when there is no such room:
    // { relay: { intake, exhaust, circulation, humidifier, dehumidifier, lights, sentAt }, ac: { power, mode, setpoint, fan, sentAt } }
    getCommands(roomId) {
      const r = q.commands.get(roomId);
      if (!r) return null;
      return {
        relay: {
          intake: r.intake === 1, exhaust: r.exhaust === 1, circulation: r.circulation === 1,
          humidifier: r.humidifier === 1, dehumidifier: r.dehumidifier === 1, lights: r.lights === 1, sentAt: r.relay_sent_at,
        },
        ac: { power: r.ac_power === 1, mode: r.ac_mode, setpoint: r.ac_setpoint, fan: r.ac_fan, sentAt: r.ac_sent_at },
      };
    },

    // The automatic control settings and band states, or null when there is no such room:
    // { auto, co2Low, co2High, tLow, tHigh, rhLow, rhHigh, humidifierDuringExchange, acFan, co2Safety, exchangeMaxMin, acDrop,
    //   exchangeEveryMin, exchangeForced, freshFrom,
    //   exchange, exchangeSince, exchangeEndedAt, cappedInRow, humidifier, humidifierSince,
    //   autoChangedAt (ms when auto was last switched on or off, or null when not known) }
    getControl(roomId) {
      let r = q.control.get(roomId);
      if (!r) {
        if (!q.get.get(roomId)) return null;
        q.insertControl.run(roomId, Date.now()); // a room made by older code has no row yet
        r = q.control.get(roomId);
      }
      return {
        auto: r.auto === 1, co2Low: r.co2_low, co2High: r.co2_high, tLow: r.t_low, tHigh: r.t_high,
        rhLow: r.rh_low, rhHigh: r.rh_high, humidifierDuringExchange: r.humidifier_during_exchange === 1, acFan: r.ac_fan,
        exchange: r.exchange === 1, exchangeSince: r.exchange_since, humidifier: r.humidifier === 1,
        co2Safety: r.co2_safety, exchangeMaxMin: r.exchange_max_min, acDrop: r.ac_drop, exchangeEndedAt: r.exchange_ended_at,
        cappedInRow: r.capped_in_row, humidifierSince: r.humidifier_since, dehumidifier: r.dehumidifier === 1,
        humidifierLastOn: r.humidifier_last_on, dehumidifierOffAt: r.dehumidifier_off_at,
        exchangeEveryMin: r.exchange_every_min, exchangeForced: r.exchange_forced === 1, freshFrom: r.fresh_from,
        outdoorAir: r.outdoor_air === 1, exchangeKind: r.exchange_kind, autoChangedAt: r.auto_changed_at,
      };
    },

    // Returns true when the room exists. Settings must be valid (see validateControl in controller.js).
    setControl(roomId, { auto, co2Low, co2High, tLow, tHigh, rhLow, rhHigh, humidifierDuringExchange, acFan, co2Safety, exchangeMaxMin, acDrop, exchangeEveryMin, outdoorAir = true }) {
      return q.setControl.run(auto ? 1 : 0, co2Low, co2High, tLow, tHigh, rhLow, rhHigh, humidifierDuringExchange ? 1 : 0, acFan,
        co2Safety, exchangeMaxMin, acDrop, exchangeEveryMin, outdoorAir ? 1 : 0, roomId).changes > 0;
    },

    // Without exchangeSince it keeps the time the exchange began and is cleared when it ends. exchangeEndedAt, cappedInRow,
    // humidifierSince, exchangeForced and freshFrom are kept when not given (null is a value).
    // dehumidifier: its band state (spec 2026-10-21-dehumidifier-design.md 3), kept when not given.
    // autoChangedAt: when auto was last switched on or off (the controller's update), kept when not given.
    setControlState(roomId, { exchange, humidifier, exchangeSince, exchangeEndedAt, cappedInRow, humidifierSince, exchangeForced, freshFrom, dehumidifier, humidifierLastOn, dehumidifierOffAt, exchangeKind, autoChangedAt }, at) {
      const r = q.control.get(roomId);
      if (!r) return false;
      const since = exchangeSince !== undefined ? exchangeSince : exchange ? (r.exchange_since ?? at) : null;
      return q.setControlState.run(exchange ? 1 : 0, humidifier ? 1 : 0, since,
        exchangeEndedAt !== undefined ? exchangeEndedAt : r.exchange_ended_at,
        cappedInRow !== undefined ? cappedInRow : r.capped_in_row,
        humidifierSince !== undefined ? humidifierSince : r.humidifier_since,
        exchangeForced !== undefined ? (exchangeForced ? 1 : 0) : r.exchange_forced,
        freshFrom !== undefined ? freshFrom : r.fresh_from,
        dehumidifier !== undefined ? (dehumidifier ? 1 : 0) : r.dehumidifier,
        humidifierLastOn !== undefined ? humidifierLastOn : r.humidifier_last_on,
        dehumidifierOffAt !== undefined ? dehumidifierOffAt : r.dehumidifier_off_at,
        exchangeKind !== undefined ? exchangeKind : r.exchange_kind,
        autoChangedAt !== undefined ? autoChangedAt : r.auto_changed_at, roomId).changes > 0;
    },

    // ---- Alarms (spec 2026-10-19-safety-and-history-design.md section 3) ----
    // An alarm is { id, roomId, roomName, key, level, text, raisedAt, clearedAt, ackedAt }.

    // Raises an alarm and returns its id. Throws when the room already has an active alarm with that key.
    raiseAlarm(roomId, key, level, text, at) {
      const id = Number(q.insertAlarm.run(roomId, key, level, text, at).lastInsertRowid);
      tellAlarm('raised', () => this.getAlarm(id));
      return id;
    },

    // Returns true when an active alarm was cleared.
    clearAlarm(roomId, key, at) {
      const active = alarmListeners.size ? q.activeAlarms.all(roomId).find((r) => r.key === key) : null;
      const cleared = q.clearAlarm.run(at, roomId, key).changes > 0;
      if (cleared && active) tellAlarm('cleared', () => this.getAlarm(active.id));
      return cleared;
    },

    // Calls fn({ change: 'raised' | 'cleared' | 'acked' | 'acked-room', alarm?, roomId? }) after every alarm change; returns
    // the unsubscribe. A listener that throws is logged and does not stop the change (spec 2026-10-26 section 2).
    onAlarmChange(fn) {
      alarmListeners.add(fn);
      return () => alarmListeners.delete(fn);
    },

    getAlarm(id) {
      const row = q.alarm.get(id);
      return row ? toAlarm(row) : null;
    },

    // The room's active alarms.
    activeAlarms(roomId) {
      return q.activeAlarms.all(roomId).map(toAlarm);
    },

    // Active alarms, and cleared ones not yet acknowledged: of one room, or of every room. Critical first, then newest.
    currentAlarms(roomId = null) {
      return q.currentAlarms.all(roomId).map(toAlarm);
    },

    // { current, history }: history = the room's last 50 alarms of any state, newest first.
    roomAlarms(roomId) {
      return { current: this.currentAlarms(roomId), history: q.alarmHistory.all(roomId).map(toAlarm) };
    },

    // Acknowledging again keeps the first time. Returns the alarm, or null when there is none.
    ackAlarm(id, at) {
      if (q.ackAlarm.run(at, id).changes === 0) return null;
      const alarm = this.getAlarm(id);
      tellAlarm('acked', () => alarm);
      return alarm;
    },

    // Acknowledges every unacknowledged alarm of the room (all of them are current). Returns how many.
    ackRoomAlarms(roomId, at) {
      const n = Number(q.ackRoomAlarms.run(at, roomId).changes);
      if (n > 0) for (const fn of [...alarmListeners]) safe(() => fn({ change: 'acked-room', roomId }));
      return n;
    },

    // Both of these return true when the room exists.
    setRelayCommand(roomId, key, on, at) {
      if (!RELAY_KEYS.includes(key)) throw new Error(`unknown machine ${key}`);
      return q.setRelay[key].run(on ? 1 : 0, at, roomId).changes > 0;
    },

    setAcCommand(roomId, { power, mode, setpoint, fan }, at) {
      return q.setAc.run(power ? 1 : 0, mode, setpoint, fan, at, roomId).changes > 0;
    },

    // ---- Stream B: machine log ----

    // Writes a log row for a saved command unless it equals the machine's previous row (a re-send).
    // change: { on, setpoint, mode, fan } (the last three only for the aircon). Returns true when a row was written.
    logMachine(roomId, machine, { on, setpoint = null, mode = null, fan = null }, source, at) {
      const last = q.logLast.get(roomId, machine);
      if (last && last.on_ === (on ? 1 : 0) && last.setpoint === setpoint && last.mode === mode && last.fan === fan) return false;
      q.logAdd.run(roomId, machine, at, on ? 1 : 0, setpoint, mode, fan, source);
      for (const [k, e] of usageCache.get(roomId) ?? []) if (e.ms && e.end > at) usageCache.get(roomId).delete(k); // a settled day changes
      return true;
    },

    // Logs the machine off at `at` when its last row says on (the other fields stay as they were).
    // When the machine's command last changed (its newest log row), or null.
    lastLogAt(roomId, machine) {
      return q.logBefore.get(roomId, machine, Number.MAX_SAFE_INTEGER)?.at ?? null;
    },

    logOff(roomId, machine, at) {
      const last = q.logLast.get(roomId, machine);
      if (last?.on_ === 1) this.logMachine(roomId, machine, { on: false, setpoint: last.setpoint, mode: last.mode, fan: last.fan }, 'manual', at);
    },

    // Every log row of one machine, oldest first.
    machineLog(roomId, machine) {
      return q.logAll.all(roomId, machine).map(logRow);
    },

    // ---- Stream B: history and overview ----

    // The charts data for the last `hours` (1, 6, 24, 168 or 720) ending at now, or null when there is no such room.
    // Machines: the log rows in the window, and the last row before it moved to the start of the window.
    history(roomId, hours, now = Date.now()) {
      if (!q.get.get(roomId)) return null;
      const bucketS = HISTORY_BUCKET_S[hours];
      const from = now - hours * 3_600_000;
      const machines = {};
      for (const key of MACHINE_KEYS) {
        const rows = [];
        const before = q.logBefore.get(roomId, key, from);
        if (before) rows.push({ ...before, at: from });
        rows.push(...q.logSince.all(roomId, key, from, now));
        machines[key] = rows.map((r) => {
          const { at, on, setpoint, mode, fan, source } = logRow(r);
          return key === 'ac' ? { at, on, setpoint, mode, fan, source } : { at, on, source };
        });
      }
      return {
        from, to: now, bucketS,
        trh: buckets(roomId, 'trh', bucketS * 1000, from, now),
        co2: buckets(roomId, 'co2', bucketS * 1000, from, now),
        machines,
      };
    },

    // Everything the Overview page shows. Alarms come straight from the alarms table:
    // a room's count is its active alarms (not cleared); the list is the current ones (active, or cleared and not acknowledged).
    overview(now = Date.now()) {
      const perRoom = new Map();
      for (const a of q.overviewActive.all()) {
        const e = perRoom.get(a.room_id) ?? { count: 0, level: null };
        e.count++;
        if (e.level === null || LEVEL_RANK[a.level] > LEVEL_RANK[e.level]) e.level = a.level;
        perRoom.set(a.room_id, e);
      }
      const rooms = this.listRooms().map((room) => {
        const [trh, co2] = this.getSensors(room.id, 1);
        const c = this.getControl(room.id);
        // With auto off the machines are driven by hand: an exchange is the intake and the exhaust both commanded on.
        const { relay, ac } = this.getCommands(room.id);
        const exchange = c.auto ? c.exchange : relay.intake && relay.exhaust;
        const day = (kind) => buckets(room.id, kind, SPARK_BUCKET_MS, now - 24 * 3_600_000, now);
        const line = (rows, field) => rows.map((p) => ({ at: p.at, v: p[field] }));
        const trhDay = day('trh');
        return {
          id: room.id,
          name: room.name,
          trh: { status: trh.status, t: trh.lastOk?.t ?? null, rh: trh.lastOk?.rh ?? null, at: trh.lastOk?.at ?? null },
          co2: { status: co2.status, co2: co2.lastOk?.co2 ?? null, at: co2.lastOk?.at ?? null },
          auto: c.auto,
          exchange,
          exchangeSince: c.auto ? c.exchangeSince : null,
          // the fresh-air wait (the card says when the next one comes): its interval, and from when it counts in Auto (the
          // last fresh-air start, else the last exchange's end, as server/controller.js decide), null in Manual or never
          exchangeEveryMin: c.exchangeEveryMin,
          freshFrom: c.auto ? (c.freshFrom ?? c.exchangeEndedAt ?? null) : null,
          bands: { tLow: c.tLow, tHigh: c.tHigh, rhLow: c.rhLow, rhHigh: c.rhHigh, co2Low: c.co2Low, co2High: c.co2High, co2Safety: c.co2Safety },
          alarms: perRoom.get(room.id) ?? { count: 0, level: null },
          spark: { t: line(trhDay, 't'), rh: line(trhDay, 'rh'), co2: line(day('co2'), 'co2') },
          // What the machines that act on a band edge are commanded to do (near an edge is amber only when the one that
          // should act is not acting); null for a machine the room has not wired or fitted.
          machines: {
            humidifier: room.relayAddress !== null ? relay.humidifier : null,
            dehumidifier: room.relayAddress !== null && room.dehumidifier ? relay.dehumidifier : null,
            cooling: room.acAddress !== null ? ac.power && ac.mode === 'cool' : null,
          },
        };
      });
      return { rooms, alarms: q.overviewAlarms.all().map(alarmRow) };
    },

    // Every wired relay module and aircon gateway: rooms by id, relay before ac, with the room's gateway (null: the farm's).
    listWiredMachines() {
      return q.wiredMachines.all().map((r) => (r.kind === 'relay'
        ? { roomId: r.roomId, kind: r.kind, address: r.address, outputs: r.outputs, gateway: r.gateway }
        : { roomId: r.roomId, kind: r.kind, address: r.address, gateway: r.gateway }));
    },

    // Returns true when a room was deleted.
    deleteRoom(id) {
      db.exec('BEGIN');
      try {
        q.deleteReadings.run(id);
        q.deleteCommands.run(id);
        q.deleteControl.run(id);
        q.deleteAlarms.run(id);
        q.deleteMachineLog.run(id);
        q.deleteMeterReadings.run(id);
        q.deleteFilterReadings.run(id);
        q.deleteFilterChanges.run(id);
        q.deleteCrops.run(id);
        q.deleteProgram.run(id);
        q.deleteRuns.run(id);
        q.deleteHarvests.run(id);
        salesQ(db).clearRoom.run(id); // Sales: the room's sales keep their money, the room and run cleared (ids are reused)
        q.deleteCropRuns.run(id);
        q.deleteTasks.run(id);
        batchStore.forgetRoom(id); // ---- Batches ---- the room's batches are kept without it (room and run ids are reused)
        db.prepare('UPDATE stock_moves SET room_id = 0 WHERE room_id = ?').run(id); // Inventory: its uses read "A deleted room"
        // The owner's rules lose the room (its id is given to the next room made after the top one); a rule left with no
        // room is removed (its rows went with the room's tasks). A rooms value that is not a list is left alone.
        for (const r of q.customRules.all()) {
          let rooms = null;
          try { rooms = JSON.parse(r.rooms); } catch { continue; }
          if (!Array.isArray(rooms) || !rooms.includes(id)) continue;
          const left = rooms.filter((x) => x !== id);
          if (left.length) q.customRuleRooms.run(JSON.stringify(left), r.id);
          else q.deleteCustomRule.run(r.id);
        }
        bucketCache.delete(id);
        usageCache.delete(id);
        const deleted = q.delete.run(id).changes > 0;
        db.exec('COMMIT');
        return deleted;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    // Every wired sensor: rooms by id, trh before co2, with the room's gateway (null: the farm's).
    listWiredSensors() {
      return q.wired.all().map((r) => ({ roomId: r.roomId, kind: r.kind, address: r.address, gateway: r.gateway }));
    },

    // One poll result. Values not measured are null.
    addReading({ roomId, kind, address, at, ok, t = null, rh = null, co2 = null, error = null }) {
      q.addReading.run(roomId, kind, address, at, ok ? 1 : 0, t, rh, co2, error, roomId, kind, address);
      dropStaleBuckets(roomId, kind, at);
    },

    // [trhSensor, co2Sensor] for the room, or null when there is no such room.
    getSensors(roomId, limit = 50) {
      const room = getRoom(roomId);
      return room ? KINDS.map((kind) => sensorOf(room, kind, limit)) : null;
    },

    // ---- Energy meter (spec 2026-10-20-energy-water-outdoor-design.md section 3) ----

    // Every room with an energy meter, by room id: [{ roomId, address, gateway }].
    listMeters() {
      return q.wiredMeters.all().map((r) => ({ roomId: r.roomId, address: r.address, gateway: r.gateway }));
    },

    // One meter poll result (powerW in W, energyKwh the meter total); only while the room still has that meter address.
    addMeterReading({ roomId, address, at, ok, powerW = null, energyKwh = null, error = null }) {
      q.addMeterReading.run(roomId, address, at, ok ? 1 : 0, powerW, energyKwh, error, roomId, address);
      if (ok) for (const [k, e] of usageCache.get(roomId) ?? []) if (e.meter && at < e.meter.upto) usageCache.get(roomId).delete(k);
    },

    // The room's meter like a sensor of getSensors: { kind: 'meter', address, status, failuresInRow, lastOk, readings },
    // lastOk and readings carrying { at, power (W), energy (kWh) }. Null when there is no such room.
    getMeter(roomId, limit = 50) {
      const room = getRoom(roomId);
      if (!room) return null;
      const address = room.meterAddress;
      const meter = { kind: 'meter', address, status: 'not-wired', failuresInRow: 0, lastOk: null, readings: [] };
      if (address === null) return meter;
      const rows = q.meterLatest.all(roomId, address, limit);
      meter.readings = rows.map((r) => ({ at: r.at, ok: r.ok === 1, power: r.power_w, energy: r.energy_kwh }));
      if (rows.length === 0) {
        meter.status = 'no-data';
        return meter;
      }
      const ok = q.meterLastOk.get(roomId, address);
      if (ok) meter.lastOk = { at: ok.at, power: ok.power_w, energy: ok.energy_kwh };
      meter.failuresInRow = q.meterFailuresSince.get(roomId, address, ok ? ok.id : 0).n;
      const n = meter.failuresInRow;
      meter.status = n === 0 ? 'online' : n < FAILS_FOR_OFFLINE ? 'timeout' : 'offline';
      return meter;
    },

    // The meter of the usage replies. All of these use the room's current meter address and give nothing without one.
    // The last good reading before `at`: { at, energy } or null.
    meterBefore(roomId, at) {
      const room = q.get.get(roomId);
      const r = room?.meter_address == null ? null : q.meterBefore.get(roomId, room.meter_address, at);
      return r ? { at: r.at, energy: r.energy_kwh } : null;
    },

    // The good readings in [from, to), oldest first: [{ at, energy }].
    meterRows(roomId, from, to) {
      const room = q.get.get(roomId);
      return room?.meter_address == null ? [] : q.meterRows.all(roomId, room.meter_address, from, to).map((r) => ({ at: r.at, energy: r.energy_kwh }));
    },

    // The good readings in [from, to) in one pass without reading them into JS: { n, kWh, bad, first, last } where kWh is
    // the sum of the plain steps between neighbours (not a decrease, not above 100 kW over their time apart), bad how
    // many steps are not plain, first and last the readings at the ends ({ at, energy }, null when n is 0).
    meterChunk(roomId, from, to) {
      const room = q.get.get(roomId);
      const none = { n: 0, kWh: 0, bad: 0, first: null, last: null };
      if (room?.meter_address == null) return none;
      const { n, kwh, bad } = q.meterChunk.get(roomId, room.meter_address, from, to);
      if (n === 0) return none;
      const end = (r) => ({ at: r.at, energy: r.energy_kwh });
      return {
        n, kWh: kwh, bad,
        first: end(q.meterFirst.get(roomId, room.meter_address, from, to)),
        last: end(q.meterLast.get(roomId, room.meter_address, from, to)),
      };
    },

    // The completed-day cache of one room (a Map the usage module fills).
    usageDays(roomId) {
      let days = usageCache.get(roomId);
      if (!days) usageCache.set(roomId, (days = new Map()));
      return days;
    },

    // The machine's log rows [{ at, on, setpoint, mode, fan, source }] for [from, to]: the last row before `from` moved to
    // `from`, then the rows inside. Oldest first.
    machineLogWindow(roomId, machine, from, to) {
      const rows = [];
      const before = q.logBefore.get(roomId, machine, from);
      if (before) rows.push({ ...before, at: from });
      rows.push(...q.logSince.all(roomId, machine, from, to));
      return rows.map(logRow);
    },

    // ---- Filter pressure sensor and filter changes (spec 2026-10-22-filter-design.md 4 and 5) ----

    // Every room with a filter pressure sensor, by room id: [{ roomId, address, gateway }].
    listFilterSensors() {
      return q.wiredFilters.all().map((r) => ({ roomId: r.roomId, address: r.address, gateway: r.gateway }));
    },

    // One poll of the sensor (pa in Pa; kept on an out-of-range poll too); only while the room still has that address.
    // A row inside a worked-out usage day makes it stale (its intake estimate uses the day's pressure).
    addFilterReading({ roomId, address, at, ok, pa = null, error = null }) {
      q.addFilterReading.run(roomId, address, at, ok ? 1 : 0, pa, error, roomId, address);
      for (const [k, e] of usageCache.get(roomId) ?? []) if (e.ms && e.end > at) usageCache.get(roomId).delete(k);
    },

    // The room's sensor like the energy meter of getMeter: { kind: 'dp', address, status, failuresInRow, lastOk, readings },
    // lastOk and readings carrying { at, pa }. Null when there is no such room.
    getFilterSensor(roomId, limit = 50) {
      const room = getRoom(roomId);
      if (!room) return null;
      const address = room.dpAddress;
      const sensor = { kind: 'dp', address, status: 'not-wired', failuresInRow: 0, lastOk: null, readings: [] };
      if (address === null) return sensor;
      const rows = q.filterLatest.all(roomId, address, limit);
      sensor.readings = rows.map((r) => ({ at: r.at, ok: r.ok === 1, pa: r.pa }));
      if (rows.length === 0) {
        sensor.status = 'no-data';
        return sensor;
      }
      const ok = q.filterLastOk.get(roomId, address);
      if (ok) sensor.lastOk = { at: ok.at, pa: ok.pa };
      sensor.failuresInRow = q.filterFailuresSince.get(roomId, address, ok ? ok.id : 0).n;
      const n = sensor.failuresInRow;
      sensor.status = n === 0 ? 'online' : n < FAILS_FOR_OFFLINE ? 'timeout' : 'offline';
      return sensor;
    },

    // The good readings of the room's present sensor address in [from, to), oldest first: [{ at, pa }].
    filterReadingsWindow(roomId, from, to) {
      const room = q.get.get(roomId);
      return room?.dp_address == null ? [] : q.filterWindow.all(roomId, room.dp_address, from, to).map((r) => ({ at: r.at, pa: r.pa }));
    },

    // The newest good reading of the room's present sensor address in [from, to): { at, pa } or null.
    lastFilterReading(roomId, from, to) {
      const room = q.get.get(roomId);
      const r = room?.dp_address == null ? undefined : q.filterLastIn.get(roomId, room.dp_address, from, to);
      return r ? { at: r.at, pa: r.pa } : null;
    },

    // The filter was changed at `at` (paBefore: the last counted pressure, or null). Returns false when there is no such room.
    markFilterChanged(roomId, at, paBefore) {
      if (!q.get.get(roomId)) return false;
      db.exec('BEGIN');
      try {
        q.setFilterChangedAt.run(at, roomId);
        q.addFilterChange.run(roomId, at, paBefore);
        db.exec('COMMIT');
        return true;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    // The room's last `limit` filter changes, newest first: [{ at, paBefore }].
    filterChanges(roomId, limit = 20) {
      return q.filterChanges.all(roomId, limit).map((r) => ({ at: r.at, paBefore: r.pa_before }));
    },

    // ---- Outdoor probe (spec section 2) ----

    // The outdoor address from the settings, or null.
    outdoorAddress,

    // One poll of the outdoor probe; stored only while the setting still has that address.
    addOutdoorReading({ address, at, ok, t = null, rh = null, error = null }) {
      q.addOutdoor.run(address, at, ok ? 1 : 0, t, rh, error, String(address));
      dropStaleBuckets(OUTDOOR, 'out', at);
    },

    // { address, status, failuresInRow, lastOk: { at, t, rh } | null, readings } like a room sensor; status 'not-set'
    // without an address.
    getOutdoor(limit = 1) {
      const address = this.outdoorAddress();
      const out = { address, status: 'not-set', failuresInRow: 0, lastOk: null, readings: [] };
      if (address === null) return out;
      const rows = q.outdoorLatest.all(address, limit);
      out.readings = rows.map((r) => ({ at: r.at, ok: r.ok === 1, t: r.t, rh: r.rh }));
      if (rows.length === 0) {
        out.status = 'no-data';
        return out;
      }
      const ok = q.outdoorLastOk.get(address);
      if (ok) out.lastOk = { at: ok.at, t: ok.t, rh: ok.rh };
      out.failuresInRow = q.outdoorFailuresSince.get(address, ok ? ok.id : 0).n;
      const n = out.failuresInRow;
      out.status = n === 0 ? 'online' : n < FAILS_FOR_OFFLINE ? 'timeout' : 'offline';
      return out;
    },

    // The probe's readings (good and failed) since `from`, oldest first: [{ at, ok, t, rh }].
    outdoorSince(from) {
      const address = outdoorAddress();
      return address === null ? [] : q.outdoorSince.all(address, from).map((r) => ({ at: r.at, ok: r.ok === 1, t: r.t, rh: r.rh }));
    },

    // Averages per bucket in the window [from, to] of the probe that is set now, like a room's trh buckets (buckets aligned
    // to the epoch, the window starts at the first boundary at or after from, `at` the bucket middle kept inside the
    // window, completed buckets cached): [{ at, t, rh }].
    outdoorBuckets(b, from, to) {
      return outdoorAddress() === null ? [] : buckets(OUTDOOR, 'out', b, from, to);
    },

    // ---- Crops and stage program (spec 2026-10-20-crops-and-simulation-design.md 3.1) ----

    // The room's program (server/program.js shape; the defaults when it has none yet), or null when there is no such room.
    getProgram(roomId) {
      if (!q.get.get(roomId)) return null;
      const r = q.program.get(roomId);
      const crops = q.crops.all(roomId).map((c) => ({ crop: c.crop, blocks: c.blocks }));
      if (!r) return { ...PROGRAM_DEFAULTS, days: { ...PROGRAM_DEFAULTS.days }, lightHours: { ...PROGRAM_DEFAULTS.lightHours }, crops };
      return {
        crops, farmType: r.farm_type, stage: r.stage, stageSince: r.stage_since, flush: r.flush, flushes: r.flushes,
        days: { spawn: r.days_spawn, pinning: r.days_pinning, fruiting: r.days_fruiting, rest: r.days_rest },
        rampH: r.ramp_h, autoAdvance: r.auto_advance === 1, ramp: r.ramp === null ? null : JSON.parse(r.ramp), done: r.done === 1,
        lightHours: { spawn: r.light_spawn, pinning: r.light_pinning, fruiting: r.light_fruiting, rest: r.light_rest }, lightStart: r.light_start,
      };
    },

    // Stores a whole program (valid: validateProgram) with its crops. Returns false when there is no such room.
    // run: the change of the room's run of blocks written with it (spec 2026-11-04-harvest-design.md 2.1), { change, at }:
    // 'start' opens a run with p.crops, 'update' gives the open run p.crops, 'end' ends the open run, 'restart' ends the
    // open run (if any) and opens a new one. Throws, writing nothing, on an 'update' with no open run.
    setProgram(roomId, p, run = null) {
      if (!q.get.get(roomId)) return false;
      db.exec('BEGIN');
      try {
        if (run) writeRun(roomId, p.crops, run);
        q.deleteCrops.run(roomId);
        p.crops.forEach((c, i) => q.insertCrop.run(roomId, i, c.crop, c.blocks));
        q.setProgram.run(roomId, p.farmType, p.stage, p.stageSince, p.flush, p.flushes, p.days.spawn, p.days.pinning,
          p.days.fruiting, p.days.rest, p.rampH, p.autoAdvance ? 1 : 0, p.ramp === null ? null : JSON.stringify(p.ramp), p.done ? 1 : 0,
          ...LIGHT_STAGES.map((s) => p.lightHours?.[s] ?? PROGRAM_DEFAULTS.lightHours[s]), p.lightStart ?? PROGRAM_DEFAULTS.lightStart);
        db.exec('COMMIT');
        return true;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    // ---- Simulation runs (spec 4.4). A run is { id, roomId, createdAt, status, progress, input, summary, error,
    //      finishedAt } and, from getRun, result. ----

    // A new queued run; returns it (without result). input: the JSON-able run input.
    createRun(roomId, input, at) {
      const { lastInsertRowid } = q.insertRun.run(roomId, at, JSON.stringify(input));
      return runRow(q.runHead.get(Number(lastInsertRowid)));
    },

    // The run with its result (withResult false: without), or null.
    getRun(id, { withResult = true } = {}) {
      const r = withResult ? q.run.get(id) : q.runHead.get(id);
      if (!r) return null;
      const run = runRow(r);
      if (withResult) run.result = r.result === null ? null : JSON.parse(r.result);
      return run;
    },

    // The room's runs, newest first, without results.
    listRuns(roomId, limit = RUNS_KEPT) {
      return q.runs.all(roomId, limit).map(runRow);
    },

    setRunProgress(id, status, progress) {
      return q.setRunProgress.run(status, progress, id).changes > 0;
    },

    // Ends a run: { status: 'done' | 'failed', summary, result, error }; then keeps the newest RUNS_KEPT finished runs of its room.
    finishRun(id, { status, summary = null, result = null, error = null }, at) {
      const r = q.runHead.get(id);
      if (!r) return false;
      q.finishRun.run(status, status === 'done' ? 1 : r.progress, summary === null ? null : JSON.stringify(summary),
        result === null ? null : JSON.stringify(result), error, at, id);
      q.pruneRuns.run(r.room_id, r.room_id, RUNS_KEPT);
      return true;
    },

    deleteRun(id) {
      return q.deleteRun.run(id).changes > 0;
    },

    // Marks every queued or running run as failed (a server start: their worker is gone). Returns the ids.
    failUnfinishedRuns(text, at) {
      const ids = q.unfinishedRuns.all().map((r) => r.id);
      for (const id of ids) this.finishRun(id, { status: 'failed', error: text }, at);
      return ids;
    },

    // The stored text of a setting, or null when it was never set.
    getSetting(key) {
      return q.getSetting.get(key)?.value ?? null;
    },

    setSetting(key, value) {
      q.setSetting.run(key, value);
      if (key === 'outdoorAddress') bucketCache.delete(OUTDOOR);
    },

    // ---- Tasks (spec 2026-10-30-tasks-design.md 4 and 5). A task is taskRow's shape. ----

    // A daily row, unless the room already has one of that rule, date and slot (any status). → true when it was made.
    insertDailyTask({ roomId, ruleKey, date, slot, text, note = null, unit = null, at }) {
      return q.insertDailyTask.run(roomId, ruleKey, date, slot, text, note, unit, at).changes > 0;
    },

    // An open upkeep row due at dueAt, unless the rule already has an open row in the room. → true when it was made.
    insertUpkeepTask({ roomId, ruleKey, slot = 'any', text, dueAt, at }) {
      return q.insertUpkeepTask.run(roomId, ruleKey, slot, text, dueAt, at).changes > 0;
    },

    // A long-term row (source: a suggestion's { machine, from, to, rmMonth, suggestedAt } or null). → the row.
    insertLongtermTask({ roomId, text, note = null, source = null, at }) {
      const { lastInsertRowid } = q.insertLongtermTask.run(roomId, text, note, source === null ? null : JSON.stringify(source), at);
      return taskRow(q.task.get(Number(lastInsertRowid)));
    },

    // Several long-term rows (insertLongtermTask's fields) in one transaction: every row or none. → the rows. replaced: the
    // open rows they take the place of ({ id, at, reason }), cancelled in the same transaction (Plan this to another size).
    insertLongtermTasks(list, replaced = []) {
      db.exec('BEGIN');
      try {
        for (const r of replaced) q.closeTask.run('cancelled', r.at, null, null, r.reason, r.id);
        const rows = list.map((t) => this.insertLongtermTask(t));
        db.exec('COMMIT');
        return rows;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    getTask(id) {
      const r = q.task.get(id);
      return r ? taskRow(r) : null;
    },

    // The room's daily rows of a date (every status), oldest first.
    dailyTasks(roomId, date) {
      return q.dailyTasks.all(roomId, date).map(taskRow);
    },

    // The calendar's stored rows of a room (spec 2026-11-03-calendar-design.md 2): its daily rows of the dates from–to (every
    // status) and its upkeep and long-term rows closed from startAt up to endAt (ms).
    calendarTasks(roomId, from, to, startAt, endAt) {
      return q.calendarTasks.all(roomId, from, to, startAt, endAt).map(taskRow);
    },

    // The room's open rows of a kind: upkeep by due time, the others oldest first.
    openTasks(roomId, kind) {
      return q.openTasks.all(roomId, kind).map(taskRow);
    },

    // The room's open daily rows of dates before `date`.
    openDailyBefore(roomId, date) {
      return q.openDailyBefore.all(roomId, date).map(taskRow);
    },

    // The last done or skipped row of an upkeep rule in the room, or null.
    lastClosedUpkeep(roomId, ruleKey) {
      const r = q.lastClosedUpkeep.get(roomId, ruleKey);
      return r ? taskRow(r) : null;
    },

    // Closes an open row: { status, at, worker, amount, reason }; next: an upkeep row to make in the same transaction
    // (insertUpkeepTask's fields); harvests: the harvests the close records (insertHarvest's fields), made in it too.
    // → false when the row is not open (nothing changes then). Throws, closing nothing, when the next row is not made (its
    // rule already has an open row) or a harvest is refused (its kg out of range).
    closeTask(id, { status, at, worker = null, amount = null, reason = null }, next = null, harvests = []) {
      db.exec('BEGIN');
      try {
        const closed = q.closeTask.run(status, at, worker, amount, reason, id).changes > 0;
        if (closed && next && !this.insertUpkeepTask(next)) throw new Error('The next upkeep row was not made');
        if (closed) for (const h of harvests) writeHarvest(h);
        db.exec('COMMIT');
        return closed;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    // Opens again a daily row the server cancelled because its stage or rule changed (wanted again the same day). → false
    // for any other row (nothing changes then).
    reopenTask(id) {
      return q.reopenTask.run(id).changes > 0;
    },

    // Opens again a daily row done or skipped at or after `since` (ms), and deletes the harvests its Done made, in one
    // transaction. → how many harvests went, or null when the row is not such a row (nothing changes then).
    undoTask(id, since) {
      let went = null;
      inTransaction(() => {
        if (q.undoTask.run(id, since).changes === 0) return;
        went = Number(q.deleteTaskHarvests.run(id).changes);
      });
      return went;
    },

    // A new due time for an open upkeep row (its rule's interval changed). → false for any other row.
    setTaskDue(id, dueAt) {
      return q.setTaskDue.run(dueAt, id).changes > 0;
    },

    // The room's closed rows, newest closedAt first, `limit` of them, older than the row `before` (an id) when given.
    taskLog(roomId, { before = null, limit = 50 } = {}) {
      return q.taskLog.all(roomId, before, limit).map(taskRow);
    },

    // Every closed row of the room, oldest closedAt first (the CSV).
    taskLogAll(roomId) {
      return q.taskLogAll.all(roomId).map(taskRow);
    },

    // ---- Workers and task rules (spec 2026-10-30-tasks-design.md 3.4 and 7.3). The lists must be valid (tasks-api.js). ----

    // [{ id, name, active }] by name.
    listWorkers() {
      return q.workers.all().map((r) => ({ id: r.id, name: r.name, active: r.active === 1 }));
    },

    // Replaces the list: a worker with a known id is updated (a rename), one without is added, one left out is removed (the
    // tasks keep the name as text). → the new list.
    setWorkers(list) {
      inTransaction(() => {
        replaceRows(q.workers, q.deleteWorker, list, (w) => q.updateWorker.run(w.name, w.active ? 1 : 0, w.id),
          (w) => q.insertWorker.run(w.name, w.active ? 1 : 0),
          // Parked names start with \u0001, not \u0000: NOCASE stops comparing at a NUL, so every \u0000 name would be the same.
          (kept) => { for (const id of kept) q.parkWorker.run(`\u0001${id}`, id); });
        q.deleteSessionsOfInactive.run(); // ---- Login ---- a worker made inactive is signed out (a removed one's went with the row)
      });
      return this.listWorkers();
    },

    // ---- Login (spec 2026-11-06-login-design.md 2) ----

    // A worker's sign-in row: { id, name, active, role, secretHash, failedTries, lockedUntil }, or null.
    account(id) {
      const r = q.account.get(id);
      return r ? accountRow(r) : null;
    },

    // Settings → Workers' sign-in state, by name: [{ id, name, active, role, hasSecret, lockedUntil, sessions }]; sessions:
    // those not expired at now.
    accounts(now) {
      const counts = new Map(q.sessionCounts.all(now).map((r) => [r.worker_id, r.n]));
      return q.workers.all().map((r) => ({
        id: r.id, name: r.name, active: r.active === 1, role: r.role, hasSecret: r.secret_hash !== null, lockedUntil: r.locked_until,
        sessions: counts.get(r.id) ?? 0,
      }));
    },

    // The names on the sign-in page: the active workers with a secret, by name; kind 'password' for an owner, else 'pin'.
    loginNames() {
      return q.loginNames.all().map((r) => ({ id: r.id, name: r.name, kind: r.role === 'owner' ? 'password' : 'pin' }));
    },

    // The active owners.
    ownerCount() {
      return q.ownerCount.get().n;
    },

    // A new secret (its hash) clears the wrong tries and the lock and signs the worker out everywhere.
    setSecret(id, hash) {
      inTransaction(() => { q.setSecret.run(hash, id); q.deleteSessionsOf.run(id); });
    },

    // 'owner' or 'worker'; the worker is signed out everywhere, so their pages follow the new role at the next sign-in.
    setRole(id, role) {
      inTransaction(() => { q.setRole.run(role, id); q.deleteSessionsOf.run(id); });
    },

    setTries(id, tries, lockedUntil) {
      q.setTries.run(tries, lockedUntil, id);
    },

    // → the number of sessions ended.
    signOutEverywhere(id) {
      return Number(q.deleteSessionsOf.run(id).changes);
    },

    // The first owner and a lost password (server/owner.js): the worker of that name (any case), added when missing, becomes
    // an active owner with the hash, signed out everywhere. → their id.
    setOwner(name, hash) {
      let id;
      inTransaction(() => {
        const row = q.accountByName.get(name);
        id = row ? row.id : Number(q.insertWorker.run(name, 1).lastInsertRowid);
        q.activate.run(id);
        q.setRole.run('owner', id);
        q.setSecret.run(hash, id);
        q.deleteSessionsOf.run(id);
      });
      return id;
    },

    // → the new session's id.
    addSession({ tokenHash, workerId, at, expiresAt, userAgent }) {
      return Number(q.insertSession.run(tokenHash, workerId, at, at, expiresAt, userAgent).lastInsertRowid);
    },

    // The session of a token's hash with its worker: { id, workerId, name, role, active, lastSeen, expiresAt }, or null.
    session(tokenHash) {
      const r = q.sessionByHash.get(tokenHash);
      return r ? {
        id: r.id, workerId: r.worker_id, name: r.name, role: r.role, active: r.active === 1, lastSeen: r.last_seen, expiresAt: r.expires_at,
      } : null;
    },

    touchSession(id, at, expiresAt) {
      q.touchSession.run(at, expiresAt, id);
    },

    endSession(id) {
      q.deleteSession.run(id);
    },

    // → the number of expired sessions deleted.
    pruneSessions(now) {
      return Number(q.pruneSessions.run(now).changes);
    },

    // The owner's changes of the built-in rules: [{ key, enabled, everyDays }] (everyDays null: the rule's own).
    taskRuleSettings() {
      return q.ruleSettings.all().map((r) => ({ key: r.key, enabled: r.enabled === 1, everyDays: r.every_days }));
    },

    // Replaces every change of the built-in rules. → the new list.
    setTaskRuleSettings(list) {
      inTransaction(() => writeRuleSettings(list));
      return this.taskRuleSettings();
    },

    // The owner's own rules: [{ id, text, rooms: number[] | null, everyDays: number | null, slot, enabled }] by id.
    customTaskRules() {
      return q.customRules.all().map((r) => ({
        id: r.id, text: r.text, rooms: r.rooms === null ? null : JSON.parse(r.rooms), everyDays: r.every_days, slot: r.slot, enabled: r.enabled === 1,
      }));
    },

    // Replaces the owner's rules like setWorkers (a rule left out is removed; its rows stay). → the new list.
    setCustomTaskRules(list) {
      inTransaction(() => writeCustomRules(list));
      return this.customTaskRules();
    },

    // Both of the above in one step (a list null: kept as it is), so a refused write changes neither.
    // → { settings, custom }: the new lists.
    setTaskRules({ settings = null, custom = null }) {
      inTransaction(() => {
        if (settings) writeRuleSettings(settings);
        if (custom) writeCustomRules(custom);
      });
      return { settings: this.taskRuleSettings(), custom: this.customTaskRules() };
    },

    // ---- Runs of blocks and harvests (spec 2026-11-04-harvest-design.md 2). A run is { id, roomId, startedAt, endedAt,
    //      crops, partial }; a harvest { id, roomId, runId, crop, stage, flush, blocks, kg, pickedAt, worker, taskId,
    //      createdAt }. setProgram opens and ends the runs. ----

    // The room's open run, or null.
    openRun(roomId) {
      const r = q.openRun.get(roomId);
      return r ? runOf(r) : null;
    },

    // A run, or null.
    getRunById(id) {
      const r = q.cropRun.get(id);
      return r ? runOf(r) : null;
    },

    // Every run of the room, newest first. (listRuns is the simulation runs'.)
    cropRuns(roomId) {
      return q.cropRuns.all(roomId).map(runOf);
    },

    // A new harvest: { roomId, runId, crop, stage, flush, blocks, kg, pickedAt, worker, taskId, at }. → the harvest.
    // Throws when kg is not over 0 up to 10,000.
    insertHarvest(fields) {
      return this.getHarvest(writeHarvest(fields));
    },

    // A harvest, or null.
    getHarvest(id) {
      const r = q.harvest.get(id);
      return r ? harvestOf(r) : null;
    },

    // The run's harvests, oldest pick first.
    runHarvests(runId) {
      return q.runHarvests.all(runId).map(harvestOf);
    },

    // The harvests of every room picked in [from, to] (ms), oldest first.
    harvestsBetween(from, to) {
      return q.harvestsBetween.all(from, to).map(harvestOf);
    },

    // A new kg and pick time; a harvest from a check sets the check's amount to the new total in the same transaction.
    // → the harvest, or null when there is no such harvest (nothing changes then).
    updateHarvest(id, { kg, pickedAt }) {
      let changed = false;
      inTransaction(() => {
        changed = q.updateHarvest.run(kg, pickedAt, id).changes > 0;
        const taskId = changed ? q.harvest.get(id).task_id : null;
        if (taskId !== null) q.sumTaskAmount.run(taskId);
      });
      return changed ? this.getHarvest(id) : null;
    },

    // Deletes a harvest; one from a check sets the check's amount to the total left (null when none is). → true when a
    // harvest went.
    deleteHarvest(id) {
      let deleted = false;
      inTransaction(() => {
        const taskId = q.harvest.get(id)?.task_id ?? null;
        deleted = q.deleteHarvest.run(id).changes > 0;
        if (deleted && taskId !== null) q.sumTaskAmount.run(taskId);
      });
      return deleted;
    },

    // ---- Batches ---- (spec 2026-11-05-batches-design.md): the store of server/batches-db.js.
    batches: batchStore,

    // ---- Inventory (spec 2026-11-05-inventory-design.md 2). An item is { id, name, kind, unit, reorderAt, ingredient, lrmpNo,
    //      archived, lowSentAt }; a move { id, itemId, at, qty, unitCost, refKind, refId, note, total, supplier, useBy, roomId,
    //      reason, worker, counted, lotId, useBySentAt }. Batches writes its own 'batch' moves (contract section 7). ----

    // Every item, by name.
    stockItems() {
      return q.stockItems.all().map(stockItemOf);
    },

    // An item, or null.
    stockItem(id) {
      const r = q.stockItem.get(id);
      return r ? stockItemOf(r) : null;
    },

    // The stored name of another item called `name` (case aside), or null.
    stockNameTaken(name, id = null) {
      return q.stockNameUsed.get(name, id)?.name ?? null;
    },

    // A new item: { name, kind, unit, reorderAt?, ingredient?, lrmpNo? } → the item. Throws on a name used (the unique index).
    insertStockItem({ name, kind, unit, reorderAt = null, ingredient = null, lrmpNo = null }) {
      return this.stockItem(Number(q.insertStockItem.run(name, kind, unit, reorderAt, ingredient, lrmpNo).lastInsertRowid));
    },

    // The item's fields as given (all of them: name, kind, unit, reorderAt, ingredient, lrmpNo, archived). → the item.
    updateStockItem(id, { name, kind, unit, reorderAt, ingredient, lrmpNo, archived }) {
      q.updateStockItem.run(name, kind, unit, reorderAt, ingredient, lrmpNo, archived ? 1 : 0, id);
      return this.stockItem(id);
    },

    // → true when an item went.
    deleteStockItem(id) {
      return q.deleteStockItem.run(id).changes > 0;
    },

    // When the item's Low message went (ms), or null once it is back over its level.
    setStockLowSent(id, at) {
      q.setStockLowSent.run(at, id);
    },

    // Every move, oldest first.
    stockMoves() {
      return q.stockMoves.all().map(stockMoveOf);
    },

    // The item's moves, oldest first.
    itemStockMoves(itemId) {
      return q.itemStockMoves.all(itemId).map(stockMoveOf);
    },

    // A move, or null.
    stockMove(id) {
      const r = q.stockMove.get(id);
      return r ? stockMoveOf(r) : null;
    },

    // New moves in one transaction: [{ itemId, at, qty, refKind, unitCost?, refId?, note?, total?, supplier?, useBy?, roomId?,
    // reason?, worker?, counted?, lotId? }] → the moves. One bad row writes none.
    insertStockMoves(list) {
      const ids = [];
      inTransaction(() => {
        for (const m of list) {
          ids.push(Number(q.insertStockMove.run(m.itemId, m.at, m.qty, m.unitCost ?? null, m.refKind, m.refId ?? null, m.note ?? null,
            m.total ?? null, m.supplier ?? null, m.useBy ?? null, m.roomId ?? null, m.reason ?? null, m.worker ?? null,
            m.counted ?? null, m.lotId ?? null).lastInsertRowid));
        }
      });
      return ids.map((id) => this.stockMove(id));
    },

    // A move's changeable fields as given (at, qty, unitCost, total, supplier, useBy, roomId, reason, worker, useBySentAt).
    // → the move.
    updateStockMove(id, m) {
      q.updateStockMove.run(m.at, m.qty, m.unitCost ?? null, m.total ?? null, m.supplier ?? null, m.useBy ?? null, m.roomId ?? null,
        m.reason ?? null, m.worker ?? null, m.useBySentAt ?? null, id);
      return this.stockMove(id);
    },

    // Deletes a move and the throw-outs taken from it (lot_id). → how many rows went.
    deleteStockMove(id) {
      return Number(q.deleteStockMove.run(id).changes);
    },

    // When the purchase's use-by message went (ms), or null.
    // Only while the purchase's use-by is still `useBy` (the one told); a clear (at null) passes the use-by it has.
    setStockUseBySent(id, at, useBy) {
      q.setStockUseBySent.run(at, id, useBy ?? null);
    },

    // The purchases made in [from, to] (ms), oldest first, each with its item's name and kind.
    stockPurchasesBetween(from, to) {
      return q.stockPurchasesBetween.all(from, to).map((r) => ({ ...stockMoveOf(r), name: r.item_name, kind: r.item_kind }));
    },

    // Batches' rooms: Map batch id → room id (null until its blocks go in), read from Batches' table when it is there.
    batchRooms(ids) {
      const out = new Map();
      if (!ids.length || !q.hasBatches.get()) return out;
      const rows = db.prepare(`SELECT id, room_id FROM batches WHERE id IN (${ids.map(() => '?').join(', ')})`).all(...ids);
      for (const r of rows) out.set(r.id, r.room_id);
      return out;
    },
    // Batches' rows as Inventory names them (joint audit B2, read only): Map batch id → { id, roomId, kind, crop, blocks,
    // supplier, receivedAt, mixedAt }; empty without Batches' table.
    batchRows(ids) {
      const out = new Map();
      if (!ids.length || !q.hasBatches.get()) return out;
      const rows = db.prepare(`SELECT id, room_id, kind, crop, blocks, supplier, received_at, mixed_at FROM batches WHERE id IN (${ids.map(() => '?').join(', ')})`).all(...ids);
      for (const r of rows) {
        out.set(r.id, { id: r.id, roomId: r.room_id, kind: r.kind, crop: r.crop, blocks: r.blocks, supplier: r.supplier, receivedAt: r.received_at, mixedAt: r.mixed_at });
      }
      return out;
    },

    // ---- Sales (spec 2026-11-05-sales-design.md 2). A sale line is { id, deliveryId, soldAt, crop, kg, priceKg, total,
    //      buyer, buyerId, invoiceNo, roomId, runId, note, paidAt, createdAt }; a buyer { id, name, phone, note, prices,
    //      archived, createdAt }. The store (server/sales.js) checks every value first. ----

    // The id of the room's run open at ms (started at or before it, not ended by it), or null.
    runAt(roomId, ms) {
      return salesQ(db).runAt.get(roomId, ms, ms)?.id ?? null;
    },

    // Writes a delivery: { id (null: new), soldAt, buyerId, buyer, invoiceNo, note, lines: [{ crop, kg, priceKg, total,
    // roomId, runId }] } at `at`. An edit replaces the lines and keeps the id and the paid time. → the delivery's id, or null
    // when id names no delivery. Throws when there are no lines.
    saveDelivery({ id = null, soldAt, buyerId, buyer, invoiceNo, note, lines }, at) {
      const s = salesQ(db);
      if (!lines.length) throw new Error('A delivery needs lines');
      let deliveryId = id;
      inTransaction(() => {
        let paidAt = null;
        let createdAt = at;
        if (id !== null) {
          const old = s.deliveryLines.all(id);
          if (!old.length) {
            deliveryId = null;
            return;
          }
          paidAt = old[0].paid_at;
          createdAt = old[0].created_at;
          s.deleteDelivery.run(id);
        }
        for (const l of lines) {
          const rowId = Number(s.insertSale.run(deliveryId ?? 0, soldAt, l.crop, l.kg, l.priceKg, l.total, buyer, buyerId,
            invoiceNo, l.roomId, l.runId, note, paidAt, createdAt).lastInsertRowid);
          if (deliveryId === null) {
            deliveryId = rowId;
            s.setDeliveryId.run(rowId, rowId);
          }
        }
      });
      return deliveryId;
    },

    // A delivery's lines in the order written ([] for none).
    deliveryLines(id) {
      return salesQ(db).deliveryLines.all(id).map(saleOf);
    },

    // → true when a delivery went.
    deleteDelivery(id) {
      return salesQ(db).deleteDelivery.run(id).changes > 0;
    },

    // Paid at ms, or unpaid (null), on every line. → true when the delivery exists.
    setDeliveryPaid(id, paidAt) {
      return salesQ(db).setPaid.run(paidAt, id).changes > 0;
    },

    // The sale lines sold in [from, to] (ms), oldest first.
    salesBetween(from, to) {
      return salesQ(db).between.all(from, to).map(saleOf);
    },

    // Every unpaid sale line, oldest first.
    unpaidSales() {
      return salesQ(db).unpaid.all().map(saleOf);
    },

    // The buyers A–Z (without regard to case).
    listBuyers() {
      return salesQ(db).buyers.all().map(buyerOf);
    },

    // A buyer, or null.
    getBuyer(id) {
      const r = salesQ(db).buyer.get(id);
      return r ? buyerOf(r) : null;
    },

    // A new buyer: { name, phone, note, prices }. Throws on a name taken (UNIQUE, without regard to case). → the buyer.
    insertBuyer({ name, phone, note, prices }, at) {
      const id = Number(salesQ(db).insertBuyer.run(name, phone, note, JSON.stringify(prices ?? {}), at).lastInsertRowid);
      return this.getBuyer(id);
    },

    // Changes the given fields of a buyer; a new name is written on their sales too, in one transaction. → the buyer, or null.
    updateBuyer(id, fields) {
      const s = salesQ(db);
      const old = this.getBuyer(id);
      if (!old) return null;
      const b = { ...old, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)) };
      inTransaction(() => {
        s.updateBuyer.run(b.name, b.phone, b.note, JSON.stringify(b.prices ?? {}), b.archived ? 1 : 0, id);
        if (b.name !== old.name) s.renameSales.run(b.name, id);
      });
      return this.getBuyer(id);
    },

    // → true when a buyer went. (The store refuses a buyer with sales.)
    deleteBuyer(id) {
      return salesQ(db).deleteBuyer.run(id).changes > 0;
    },

    // How many deliveries the buyer has.
    buyerSaleCount(id) {
      return salesQ(db).buyerSales.get(id).n;
    },

    // Every buyer's delivery count: Map buyerId → n (buyers with none are absent).
    buyerSaleCounts() {
      return new Map(salesQ(db).buyerSalesAll.all().map((r) => [r.buyer_id, r.n]));
    },
    // ---- end Sales ----

    // ---- Costs (spec 2026-11-05-costs-design.md 2 and 3). A cost is costOf's object; its fields { date, category, amount,
    //      roomId, runId, note, repeat, repeatUntil, worker, utility, periodFrom, periodTo } are checked by server/costs.js. ----

    // A new cost made at `at` (ms). → the cost.
    insertCost(fields, at) {
      return this.getCost(Number(costQ.insert.run(...costValues(fields), at).lastInsertRowid));
    },

    // A cost, or null.
    getCost(id) {
      const r = costQ.get.get(id);
      return r ? costOf(r) : null;
    },

    // Every cost, oldest date first.
    listCosts() {
      return costQ.list.all().map(costOf);
    },

    // → the cost with its new fields, or null when there is no such cost.
    updateCost(id, fields) {
      return costQ.update.run(...costValues(fields), id).changes > 0 ? this.getCost(id) : null;
    },

    // A monthly item's last month ('YYYY-MM'). → the cost, or null.
    stopCost(id, until) {
      return costQ.until.run(until, id).changes > 0 ? this.getCost(id) : null;
    },

    // A monthly item changed from a month: it ends at `until` and `fields` start a new one, in one transaction.
    // → { ended, started }, or null when there is no such cost (nothing changes then).
    changeCost(id, until, fields, at) {
      let started = null;
      inTransaction(() => {
        if (costQ.until.run(until, id).changes === 0) return;
        started = Number(costQ.insert.run(...costValues(fields), at).lastInsertRowid);
      });
      return started === null ? null : { ended: this.getCost(id), started: this.getCost(started) };
    },

    // → true when a cost went.
    deleteCost(id) {
      return costQ.delete.run(id).changes > 0;
    },

    // The other modules' rows Costs reads, from ms to ms (server/costs-sources.js): their tables may not exist yet.
    costSources(from, to) {
      return readSources(db, from, to);
    },

    // ---- Runs ---- (spec 2026-11-05-runs-design.md 2): every run of blocks, newest started first, with its room's name
    // (null when the room is gone: deleteRoom deletes a room's runs, so only a database edited by hand has one).
    allRuns() {
      return db.prepare(`SELECT r.*, m.name AS room_name FROM runs r LEFT JOIN rooms m ON m.id = r.room_id
                         ORDER BY r.started_at DESC, r.id DESC`).all().map((r) => ({ ...runOf(r), roomName: r.room_name ?? null }));
    },
    // ---- end Runs ----

    close() {
      db.close();
    },
  };
}
