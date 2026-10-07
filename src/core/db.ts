/**
 * The state in SQLite (sql.js, SQLite compiled to WebAssembly).
 *
 * The database lives in memory; the page keeps its bytes (db.export()) as one
 * record in IndexedDB, and an export can hand the same bytes out as a .sqlite
 * file any SQLite tool opens.
 *
 * Every save rewrites all tables in one transaction: the data is small
 * (hundreds of rows), and a save is then either whole or not there at all.
 * Reading goes through sanitizeState(), as an import does, so a damaged or
 * hand-edited database opens with defaults in place of what is broken.
 *
 * The schema's version is PRAGMA user_version; MIGRATIONS[n] takes a database
 * of version n to n + 1.
 */
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { type Recurring, type State, sanitizeState } from './state';

export const MIGRATIONS: string[] = [
  // 0 → 1: the first schema.
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value);
  CREATE TABLE currencies (
    code TEXT PRIMARY KEY,
    rate REAL NOT NULL,
    decimals INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('asset', 'debt')),
    currency TEXT NOT NULL,
    fee REAL NOT NULL DEFAULT 0,
    opening INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    archived_at INTEGER,
    sort REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE recurring (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    amount_to INTEGER,
    account_id TEXT,
    to_account_id TEXT,
    currency TEXT NOT NULL,
    every TEXT NOT NULL CHECK (every IN ('day', 'week', 'month', 'year')),
    time TEXT NOT NULL,
    weekday INTEGER,
    day INTEGER,
    last_day INTEGER NOT NULL DEFAULT 0,
    month INTEGER,
    valid_from INTEGER NOT NULL,
    valid_to INTEGER
  );
  CREATE INDEX recurring_series ON recurring (series_id);
  CREATE TABLE one_off (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
    at INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    amount_to INTEGER,
    account_id TEXT,
    to_account_id TEXT,
    currency TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX one_off_at ON one_off (at);
  CREATE TABLE reconciliations (
    id TEXT PRIMARY KEY,
    at INTEGER NOT NULL,
    base TEXT NOT NULL
  );
  CREATE TABLE reconciliation_currencies (
    reconciliation_id TEXT NOT NULL REFERENCES reconciliations (id),
    currency TEXT NOT NULL,
    rate REAL,
    decimals INTEGER,
    expected INTEGER,
    actual INTEGER,
    PRIMARY KEY (reconciliation_id, currency)
  );
  CREATE TABLE reconciliation_accounts (
    reconciliation_id TEXT NOT NULL REFERENCES reconciliations (id),
    account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    currency TEXT NOT NULL,
    fee REAL NOT NULL,
    balance INTEGER NOT NULL,
    sort INTEGER NOT NULL,
    PRIMARY KEY (reconciliation_id, account_id)
  );
  CREATE TABLE reconciliation_occurrences (
    reconciliation_id TEXT NOT NULL REFERENCES reconciliations (id),
    op_id TEXT NOT NULL,
    name TEXT NOT NULL,
    at INTEGER NOT NULL,
    currency TEXT NOT NULL,
    amount INTEGER NOT NULL,
    sort INTEGER NOT NULL
  );
  CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    rule TEXT NOT NULL CHECK (rule IN ('margin', 'share')),
    rule_value REAL NOT NULL,
    sort REAL NOT NULL DEFAULT 0,
    done_at INTEGER
  );
  `,
  // 1 → 2: a goal's margin is money, in minor units: an INTEGER column of its own, rule_value keeps the percent.
  `
  ALTER TABLE goals ADD COLUMN margin INTEGER;
  UPDATE goals SET margin = CAST(rule_value AS INTEGER), rule_value = 0 WHERE rule = 'margin';
  `,
];

export const DB_VERSION = MIGRATIONS.length;

const TABLES = [
  'reconciliation_occurrences',
  'reconciliation_accounts',
  'reconciliation_currencies',
  'reconciliations',
  'goals',
  'one_off',
  'recurring',
  'accounts',
  'currencies',
  'meta',
];

export function schemaVersion(db: Database): number {
  const value = db.exec('PRAGMA user_version')[0]?.values[0]?.[0];
  return typeof value === 'number' ? value : 0;
}

/** Brings the database up to DB_VERSION; a newer one is read as it is. */
export function migrateDatabase(db: Database): void {
  for (let version = schemaVersion(db); version < DB_VERSION; version += 1) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

/** A database from its bytes, or a new empty one; migrated either way. */
export function openDatabase(SQL: SqlJsStatic, bytes?: Uint8Array | null): Database {
  const db = new SQL.Database(bytes ?? null);
  migrateDatabase(db);
  return db;
}

/** SQLite's first 16 bytes: how an imported file is told from JSON. */
export function isSqliteFile(bytes: Uint8Array): boolean {
  const magic = 'SQLite format 3\0';
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) if (bytes[i] !== magic.charCodeAt(i)) return false;
  return true;
}

const value = (v: unknown): SqlValue => (v === undefined ? null : (v as SqlValue));

function insert(db: Database, table: string, rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]!);
  const statement = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
  try {
    for (const row of rows) statement.run(columns.map((c) => value(row[c])));
  } finally {
    statement.free();
  }
}

const scheduleColumns = (op: Recurring) => ({
  every: op.schedule.every,
  time: op.schedule.time,
  weekday: op.schedule.weekday,
  day: typeof op.schedule.day === 'number' ? op.schedule.day : undefined,
  last_day: op.schedule.day === 'last' ? 1 : 0,
  month: op.schedule.month,
});

/** Writes the whole state in one transaction, with the save's revision: all of it, or — on any error — nothing. */
export function writeState(db: Database, state: State, revisionNumber = 0): void {
  db.exec('BEGIN');
  try {
    for (const table of TABLES) db.exec(`DELETE FROM ${table}`);
    insert(db, 'meta', [
      { key: 'schema', value: state.schema },
      { key: 'base', value: state.base },
      { key: 'include_unaccounted', value: state.forecast.includeUnaccounted ? 1 : 0 },
      { key: 'window_days', value: state.forecast.windowDays },
      { key: 'horizon_years', value: state.forecast.horizonYears },
      { key: 'remind_days', value: state.forecast.remindDays },
      { key: 'revision', value: revisionNumber },
      // The PIN's hash among the settings; no rows, no PIN.
      ...(state.pin ? [
        { key: 'pin_salt', value: state.pin.salt },
        { key: 'pin_hash', value: state.pin.hash },
        { key: 'pin_iterations', value: state.pin.iterations },
      ] : []),
    ]);
    insert(db, 'currencies', state.currencies.map((c) => ({ code: c.code, rate: c.rate, decimals: c.decimals, updated_at: c.updatedAt })));
    insert(db, 'accounts', state.accounts.map((a) => ({
      id: a.id, name: a.name, kind: a.kind, currency: a.currency, fee: a.fee, opening: a.opening,
      created_at: a.createdAt, archived_at: a.archivedAt, sort: a.order,
    })));
    insert(db, 'recurring', state.recurring.map((op) => ({
      id: op.id, series_id: op.seriesId, type: op.type, name: op.name, amount: op.amount, amount_to: op.amountTo,
      account_id: op.accountId, to_account_id: op.toAccountId, currency: op.currency, ...scheduleColumns(op),
      valid_from: op.validFrom, valid_to: op.validTo,
    })));
    insert(db, 'one_off', state.oneOff.map((op) => ({
      id: op.id, type: op.type, at: op.at, amount: op.amount, amount_to: op.amountTo, account_id: op.accountId,
      to_account_id: op.toAccountId, currency: op.currency, note: op.note,
    })));
    insert(db, 'reconciliations', state.reconciliations.map((r) => ({ id: r.id, at: r.at, base: r.base })));
    insert(db, 'reconciliation_currencies', state.reconciliations.flatMap((r) => {
      const codes = new Set([...Object.keys(r.rates), ...Object.keys(r.expected), ...Object.keys(r.actual)]);
      return [...codes].map((currency) => ({
        reconciliation_id: r.id, currency, rate: r.rates[currency], decimals: r.decimals[currency],
        expected: r.expected[currency], actual: r.actual[currency],
      }));
    }));
    insert(db, 'reconciliation_accounts', state.reconciliations.flatMap((r) => r.accounts.map((a, sort) => ({
      reconciliation_id: r.id, account_id: a.id, name: a.name, kind: a.kind, currency: a.currency, fee: a.fee, balance: a.balance, sort,
    }))));
    insert(db, 'reconciliation_occurrences', state.reconciliations.flatMap((r) => r.occurrences.map((o, sort) => ({
      reconciliation_id: r.id, op_id: o.opId, name: o.name, at: o.at, currency: o.currency, amount: o.amount, sort,
    }))));
    insert(db, 'goals', state.goals.map((g) => ({
      id: g.id, name: g.name, amount: g.amount, currency: g.currency, rule: g.rule.kind,
      rule_value: g.rule.kind === 'share' ? g.rule.percent : 0, margin: g.rule.kind === 'margin' ? g.rule.margin : undefined,
      sort: g.order, done_at: g.doneAt,
    })));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

type Row = Record<string, SqlValue>;

function rows(db: Database, sql: string): Row[] {
  const result = db.exec(sql)[0];
  if (!result) return [];
  return result.values.map((values) => Object.fromEntries(result.columns.map((c, i) => [c, values[i] ?? null])));
}

/** NULL is "absent": the optional fields of the state are undefined, not null. */
const opt = (v: SqlValue): SqlValue | undefined => (v === null ? undefined : v);

function group<T>(items: Row[], key: string, map: (row: Row) => T): Map<SqlValue, T[]> {
  const out = new Map<SqlValue, T[]>();
  for (const row of items) {
    const list = out.get(row[key]!) ?? [];
    list.push(map(row));
    out.set(row[key]!, list);
  }
  return out;
}

/** The state as stored, through the same checks as an import. */
export function readState(db: Database, now = 0): State {
  const meta = new Map(rows(db, 'SELECT key, value FROM meta').map((r) => [r.key, r.value]));
  const currencies = rows(db, 'SELECT * FROM currencies').map((r) => ({ code: r.code, rate: r.rate, decimals: r.decimals, updatedAt: r.updated_at }));
  const accounts = rows(db, 'SELECT * FROM accounts ORDER BY sort').map((r) => ({
    id: r.id, name: r.name, kind: r.kind, currency: r.currency, fee: r.fee, opening: r.opening,
    createdAt: r.created_at, archivedAt: opt(r.archived_at!), order: r.sort,
  }));
  const recurring = rows(db, 'SELECT * FROM recurring ORDER BY valid_from').map((r) => ({
    id: r.id, seriesId: r.series_id, type: r.type, name: r.name, amount: r.amount, amountTo: opt(r.amount_to!),
    accountId: opt(r.account_id!), toAccountId: opt(r.to_account_id!), currency: r.currency,
    schedule: { every: r.every, time: r.time, weekday: opt(r.weekday!), day: r.last_day ? 'last' : opt(r.day!), month: opt(r.month!) },
    validFrom: r.valid_from, validTo: opt(r.valid_to!),
  }));
  const oneOff = rows(db, 'SELECT * FROM one_off ORDER BY at').map((r) => ({
    id: r.id, type: r.type, at: r.at, amount: r.amount, amountTo: opt(r.amount_to!), accountId: opt(r.account_id!),
    toAccountId: opt(r.to_account_id!), currency: r.currency, note: r.note,
  }));
  const recCurrencies = group(rows(db, 'SELECT * FROM reconciliation_currencies'), 'reconciliation_id', (r) => r);
  const recAccounts = group(rows(db, 'SELECT * FROM reconciliation_accounts ORDER BY sort'), 'reconciliation_id', (r) => ({
    id: r.account_id, name: r.name, kind: r.kind, currency: r.currency, fee: r.fee, balance: r.balance,
  }));
  const recOccurrences = group(rows(db, 'SELECT * FROM reconciliation_occurrences ORDER BY sort'), 'reconciliation_id', (r) => ({
    opId: r.op_id, name: r.name, at: r.at, currency: r.currency, amount: r.amount,
  }));
  const pick = (list: Row[], column: string): Record<string, SqlValue> =>
    Object.fromEntries(list.filter((r) => r[column] !== null).map((r) => [r.currency as string, r[column]!]));
  const reconciliations = rows(db, 'SELECT * FROM reconciliations ORDER BY at').map((r) => {
    const own = recCurrencies.get(r.id!) ?? [];
    return {
      id: r.id, at: r.at, base: r.base,
      rates: pick(own, 'rate'), decimals: pick(own, 'decimals'), expected: pick(own, 'expected'), actual: pick(own, 'actual'),
      accounts: recAccounts.get(r.id!) ?? [], occurrences: recOccurrences.get(r.id!) ?? [],
    };
  });
  const goals = rows(db, 'SELECT * FROM goals ORDER BY sort').map((r) => ({
    id: r.id, name: r.name, amount: r.amount, currency: r.currency,
    rule: r.rule === 'share' ? { kind: 'share', percent: r.rule_value } : { kind: 'margin', margin: r.margin },
    order: r.sort, doneAt: opt(r.done_at!),
  }));
  return sanitizeState({
    schema: meta.get('schema') ?? 1,
    base: meta.get('base'),
    currencies,
    accounts,
    recurring,
    oneOff,
    reconciliations,
    goals,
    forecast: {
      includeUnaccounted: meta.has('include_unaccounted') ? meta.get('include_unaccounted') === 1 : undefined,
      windowDays: meta.get('window_days'),
      horizonYears: meta.get('horizon_years'),
      remindDays: meta.get('remind_days'),
    },
    pin: meta.has('pin_hash') ? { salt: meta.get('pin_salt'), hash: meta.get('pin_hash'), iterations: meta.get('pin_iterations') } : undefined,
  }, now);
}

/**
 * A counter every save raises. A window compares the stored one with the one it
 * loaded before writing: a different one means another window saved since.
 */
export function revision(db: Database): number {
  const value = db.exec("SELECT value FROM meta WHERE key = 'revision'")[0]?.values[0]?.[0];
  return typeof value === 'number' ? value : 0;
}

/** True when the database holds nothing yet: the first start. */
export const isEmpty = (db: Database): boolean => rows(db, "SELECT 1 FROM meta WHERE key = 'base'").length === 0;
