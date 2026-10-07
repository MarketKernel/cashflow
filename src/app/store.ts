/**
 * The state the page works on, and its way into SQLite and IndexedDB.
 *
 * Every change goes through change(): the state is changed in memory, the
 * screen redrawn, and a moment later (several quick changes make one save)
 * the whole state is written to SQLite in one transaction and the database's
 * bytes to IndexedDB in one put.
 *
 * Two windows of the app (a tab and the installed PWA) share the record. Each
 * save raises a revision kept in the database; before writing, a window looks
 * at the stored one, under a lock so two saves cannot cross. A revision other
 * than the one it loaded means another window saved since: this one takes
 * that data instead of overwriting it. A BroadcastChannel tells the other
 * windows after each save, so an idle one shows the new data at once.
 */
import type { Database, SqlJsStatic } from 'sql.js';
import { isEmpty, openDatabase, readState, revision, writeState } from '../core/db';
import { loadSqlite } from '../core/sqlite';
import { type State, emptyState } from '../core/state';
import { keepData, loadBytes, openStorage, saveBytes, saveRecord, storageAvailable } from './storage';

let SQL: SqlJsStatic;
let db: Database;
let state: State = emptyState();
let timer = 0;
let pending = false;
let saving: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
const savedListeners = new Set<(state: State) => void>();
let failed: ((error: unknown) => void) | null = null;
let overtaken: () => void = () => undefined;
/** The revision of the data this window holds. */
let loadedRevision = 0;
/** The stored data could not be read: nothing is written over it. */
let blocked = false;
/** The last save reached the database: it neither failed nor gave way to another window's. */
let lastSaved = true;
const channel = typeof BroadcastChannel === 'undefined' ? null : (() => {
  try {
    return new BroadcastChannel('cashflow');
  } catch {
    return null;
  }
})();

export const getState = (): State => state;

export interface Boot {
  /** Nothing stored yet: the first start. */
  fresh: boolean;
  /** IndexedDB works here; without it the data lasts only while the page is open. */
  persistent: boolean;
  /** The stored database could not be read; it was left as it is, and the page started empty. */
  unreadable: boolean;
}

export async function boot(defaultBase: string): Promise<Boot> {
  SQL = await loadSqlite();
  const persistent = await openStorage();
  let bytes: Uint8Array | null = null;
  let unreadable = false;
  try {
    bytes = await loadBytes();
  } catch {
    // The record is there but cannot be read now: it is left alone, and nothing is saved over it.
    unreadable = true;
    blocked = true;
  }
  try {
    db = openDatabase(SQL, bytes);
  } catch {
    // Not a database at all: its bytes are put aside, untouched, and the page starts afresh.
    unreadable = true;
    if (bytes) await saveRecord(`sqlite-unreadable-${Date.now()}`, bytes).catch(() => (blocked = true));
    db = openDatabase(SQL);
  }
  loadedRevision = revision(db);
  const fresh = isEmpty(db);
  state = fresh ? emptyState(defaultBase, Date.now()) : readState(db, Date.now());
  channel?.addEventListener('message', (event) => {
    if (event.data === 'saved' && !pending) void reloadFromStorage();
  });
  return { fresh, persistent, unreadable };
}

export const onChange = (listener: () => void): void => void listeners.add(listener);
/** After every save that reached the database: the automatic copy to a file listens here. */
export const onSaved = (listener: (state: State) => void): void => void savedListeners.add(listener);
export const onSaveFailed = (listener: (error: unknown) => void): void => void (failed = listener);
/** Another window saved first: this one now shows that data, and its own last change is dropped. */
export const onOvertaken = (listener: () => void): void => void (overtaken = listener);

/** The stored database, as another window left it; null when it is this window's own. */
async function storedIfNewer(): Promise<{ db: Database; at: number } | null> {
  const bytes = await loadBytes();
  if (!bytes) return null;
  const other = openDatabase(SQL, bytes);
  const at = revision(other);
  if (at === loadedRevision) {
    other.close();
    return null;
  }
  return { db: other, at };
}

function adopt(next: { db: Database; at: number }): void {
  db.close();
  db = next.db;
  loadedRevision = next.at;
  state = readState(db, Date.now());
  notify();
}

async function reloadFromStorage(): Promise<void> {
  if (!storageAvailable() || blocked) return;
  const next = await storedIfNewer().catch(() => null);
  if (next && !pending) adopt(next);
  else next?.db.close();
}

/** Runs `work` alone across this origin's windows, where the browser has Web Locks. */
function exclusive(work: () => Promise<void>): Promise<void> {
  if (!('locks' in navigator) || !navigator.locks) return work();
  // The lock is held until the promise `work` returns has settled.
  return navigator.locks.request('cashflow-save', () => work()) as unknown as Promise<void>;
}

const notify = (): void => {
  for (const listener of listeners) listener();
};

/** Changes the state; the screen follows at once, the database a moment later. */
export function change(mutate: (state: State) => void): void {
  mutate(state);
  notify();
  schedule();
}

/** Everything replaced at once: an import. */
export function replace(next: State): void {
  state = next;
  notify();
  schedule();
}

/**
 * Everything replaced and written now: a new database in place of one whose
 * PIN is forgotten. False when it did not land — the save failed, or another
 * window's came first and this one now holds that.
 */
export async function replaceNow(next: State): Promise<boolean> {
  replace(next);
  await flush();
  return lastSaved && state === next;
}

function schedule(): void {
  pending = true;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void flush(), 250);
}

/** Writes now what is waiting; resolves when it is in IndexedDB. */
export function flush(): Promise<void> {
  window.clearTimeout(timer);
  if (!pending) return saving;
  pending = false;
  const snapshot = state;
  saving = saving.then(() => exclusive(async () => {
    lastSaved = false;
    try {
      const persistent = storageAvailable() && !blocked;
      if (persistent) {
        const newer = await storedIfNewer();
        if (newer) {
          adopt(newer);
          overtaken();
          return;
        }
      }
      writeState(db, snapshot, loadedRevision + 1);
      loadedRevision += 1;
      if (persistent) {
        await saveBytes(db.export());
        keepData();
        channel?.postMessage('saved');
      }
      lastSaved = true;
      for (const listener of savedListeners) listener(snapshot);
    } catch (error) {
      failed?.(error);
    }
  }));
  return saving;
}

export const hasPendingSave = (): boolean => pending;

/** The database file as it is after the last save: an export of the .sqlite. */
export async function sqliteBytes(): Promise<Uint8Array> {
  pending = true;
  await flush();
  return db.export();
}

/** The state in a .sqlite file someone exported, read through the same checks. */
export function stateFromSqlite(bytes: Uint8Array): State {
  const other = openDatabase(SQL, bytes);
  try {
    return readState(other, Date.now());
  } finally {
    other.close();
  }
}
