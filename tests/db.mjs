/** The state in SQLite: the schema, its migrations, a round trip, and damage in the tables. */
import { checker, load } from '../tools/load.mjs';
import { at, canon, sampleState } from './fixture.mjs';

const { check, done } = checker();
const C = await load('core/state', 'core/reconcile', 'core/db', 'core/sqlite');
const SQL = await C.loadSqlite();

// A state with a bit of everything in it.
const state = sampleState(C);
state.reconciliations.push(C.reconcile(state, new Map(state.accounts.map((a) => [a.id, a.opening])), at(2026, 10, 1, 10), 'r1'));
state.recurring.push(
  { id: 'r', seriesId: 's', type: 'expense', name: 'Rent', amount: 1200000, accountId: 'mono', currency: 'UAH', schedule: { every: 'month', time: '00:00', day: 'last' }, validFrom: 1, validTo: 5 },
  { id: 'r2', seriesId: 's', type: 'transfer', name: 'Card payment', amount: 10000, amountTo: 415000, accountId: 'wise', toAccountId: 'card', currency: 'USD', schedule: { every: 'week', time: '12:30', weekday: 3 }, validFrom: 5 },
  { id: 'r3', seriesId: 'r3', type: 'income', name: 'Interest', amount: 100, currency: 'EUR', schedule: { every: 'year', time: '00:00', month: 2, day: 29 }, validFrom: 5 },
);
state.oneOff.push({ id: 'o', type: 'income', at: at(2026, 10, 3), amount: 500000, accountId: 'mono', currency: 'UAH', note: 'Bonus' });
state.reconciliations.push(C.reconcile(state, new Map([['mono', 2140000]]), at(2026, 10, 8, 10), 'r2'));
state.goals.push(
  { id: 'g1', name: 'Laptop', amount: 4000000, currency: 'UAH', rule: { kind: 'margin', margin: 3000000 }, order: 0 },
  { id: 'g2', name: 'Bike', amount: 50000, currency: 'EUR', rule: { kind: 'share', percent: 12.5 }, order: 1, doneAt: 9 },
);
state.accounts[2].archivedAt = at(2026, 10, 9);
state.forecast = { includeUnaccounted: false, windowDays: 60, horizonYears: 3, remindDays: 7 };

const db = C.openDatabase(SQL);
check('a new database is at the latest schema', C.schemaVersion(db), C.DB_VERSION);
check('… and empty', C.isEmpty(db), true);
C.writeState(db, state);
check('written: no longer empty', C.isEmpty(db), false);
check('read back: the same state', canon(C.readState(db)), canon(state));

const bytes = db.export();
check('the bytes are an SQLite file', C.isSqliteFile(bytes), true);
check('JSON is not', C.isSqliteFile(new TextEncoder().encode('{"schema":1}')), false);
const reopened = C.openDatabase(SQL, bytes);
check('reopened from its bytes: the same state', canon(C.readState(reopened)), canon(state));

// Real tables, for any SQLite tool.
const count = (sql) => reopened.exec(sql)[0].values[0][0];
check('tables', reopened.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")[0].values.flat(), [
  'accounts', 'currencies', 'goals', 'meta', 'one_off', 'reconciliation_accounts', 'reconciliation_currencies', 'reconciliation_occurrences', 'reconciliations', 'recurring',
]);
check('a row per account', count('SELECT COUNT(*) FROM accounts'), 5);
check('amounts are integers', count("SELECT typeof(opening) FROM accounts WHERE id = 'mono'"), 'integer');
check('a debt in a snapshot is what is owed', count("SELECT balance FROM reconciliation_accounts WHERE reconciliation_id = 'r1' AND account_id = 'card'"), 1500000);

// The PIN's hash: three rows of the settings table, and no rows without a PIN.
check('no PIN: no PIN rows', count("SELECT COUNT(*) FROM meta WHERE key LIKE 'pin%'"), 0);
const pin = { salt: '00112233445566778899aabbccddeeff', hash: 'ab'.repeat(32), iterations: 100000 };
const locked = C.openDatabase(SQL);
C.writeState(locked, { ...state, pin });
check('a PIN: its hash among the settings', locked.exec("SELECT key, value FROM meta WHERE key LIKE 'pin%' ORDER BY key")[0].values,
  [['pin_hash', pin.hash], ['pin_iterations', 100000], ['pin_salt', pin.salt]]);
check('… read back with the rest', canon(C.readState(C.openDatabase(SQL, locked.export()))), canon({ ...state, pin }));
C.writeState(locked, state);
check('saved without the PIN: its rows are gone', locked.exec("SELECT COUNT(*) FROM meta WHERE key LIKE 'pin%'")[0].values[0][0], 0);
C.writeState(locked, { ...state, pin });
locked.exec("DELETE FROM meta WHERE key = 'pin_salt'");
check('a PIN with a row missing reads as no PIN', C.readState(locked).pin, undefined);
C.writeState(locked, { ...state, pin });
locked.exec("UPDATE meta SET value = 'not hex' WHERE key = 'pin_hash'");
check('a broken hash reads as no PIN', C.readState(locked).pin, undefined);

// A save that fails half way leaves the previous one whole.
const wrong = structuredClone(state);
wrong.accounts.push({ ...wrong.accounts[0] });
let failed = false;
try {
  C.writeState(reopened, wrong);
} catch {
  failed = true;
}
check('a save that breaks a constraint fails …', failed, true);
check('… and the previous state is all still there', canon(C.readState(reopened)), canon(state));

// Damage written into the tables by hand is read as defaults.
reopened.exec("UPDATE accounts SET fee = 'lots', kind = 'asset' WHERE id = 'wise'");
reopened.exec("UPDATE meta SET value = 'zz' WHERE key = 'window_days'");
const damaged = C.readState(reopened);
check('a broken fee reads as 0', damaged.accounts.find((a) => a.id === 'wise').fee, 0);
check('a broken setting reads as its default', damaged.forecast.windowDays, 90);

// The migration from an empty file, as an old page left it: no tables, user_version 0.
const blank = new SQL.Database();
check('a database of version 0', C.schemaVersion(blank), 0);
C.migrateDatabase(blank);
check('migrated to the latest', C.schemaVersion(blank), C.DB_VERSION);
C.migrateDatabase(blank);
check('migrating again changes nothing', C.schemaVersion(blank), C.DB_VERSION);
check('an empty database reads as an empty state', C.readState(blank, 3), C.emptyState('USD', 3));

// Version 1 kept a goal's margin in the REAL rule_value; version 2 moves it to an INTEGER column.
const v1 = new SQL.Database();
v1.exec('BEGIN');
v1.exec(C.MIGRATIONS[0]);
v1.exec('PRAGMA user_version = 1; COMMIT');
v1.exec("INSERT INTO meta VALUES ('base', 'UAH'); INSERT INTO currencies VALUES ('UAH', 1, 2, 0)");
v1.exec("INSERT INTO goals (id, name, amount, currency, rule, rule_value, sort) VALUES ('g', 'Laptop', 4000000, 'UAH', 'margin', 3000000, 0), ('s', 'Bike', 100, 'UAH', 'share', 12.5, 1)");
C.migrateDatabase(v1);
check('version 1 → 2', C.schemaVersion(v1), 2);
check('… the margin is an integer column now', v1.exec("SELECT typeof(margin), margin FROM goals WHERE id = 'g'")[0].values[0], ['integer', 3000000]);
check('… both goals read back', C.readState(v1).goals.map((g) => g.rule), [{ kind: 'margin', margin: 3000000 }, { kind: 'share', percent: 12.5 }]);

// The revision: what lets two windows notice each other's saves.
check('a new database is at revision 0', C.revision(SQL ? C.openDatabase(SQL) : null), 0);
C.writeState(reopened, state, 7);
check('a save writes its revision', C.revision(reopened), 7);
check('… and the revision is in the bytes', C.revision(C.openDatabase(SQL, reopened.export())), 7);
check('… beside the same state', canon(C.readState(reopened)), canon(state));

done('db');
