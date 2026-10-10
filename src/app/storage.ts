/**
 * Where the SQLite databases' bytes live between visits: IndexedDB, database
 * "cashflow", store "state", one record per database. A page opened from disk has neither a
 * disk to write to nor, everywhere, OPFS; IndexedDB is what every browser gives
 * it — Chrome, Firefox and Safari keep it for file:// pages too, each file its
 * own origin. Where it is missing or refuses (some private modes), the page
 * says so and works in memory: export, or the installed app, keeps the data.
 */

const NAME = 'cashflow';
const STORE = 'state';
const RECORD = 'sqlite';
/** The list of databases (databases.ts), the one record all of them share. */
const LIST = 'databases';
/**
 * The database the page started with before there could be several: its
 * records keep their old keys, so data stored by an earlier version is simply
 * this database.
 */
export const FIRST = 'main';

let database: IDBDatabase | null = null;
/** The database this page works on; every record but the list is its own. */
let current = FIRST;

/** A record of database `id`: the first one's keys as they always were, the others' with the id after them. */
const own = (key: string, id = current): string => (id === FIRST ? key : `${key}:${id}`);

export const useDatabase = (id: string): void => void (current = id);
export const currentDatabase = (): string => current;

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB'));
  });
}

/** Opens the database; false when this browser keeps nothing for the page. */
export async function openStorage(): Promise<boolean> {
  try {
    const opening = indexedDB.open(NAME, 1);
    opening.onupgradeneeded = () => {
      if (!opening.result.objectStoreNames.contains(STORE)) opening.result.createObjectStore(STORE);
    };
    database = await request(opening);
    // Another tab updating the database's version would wait for this one forever otherwise.
    database.onversionchange = () => database?.close();
    return true;
  } catch {
    database = null;
    return false;
  }
}

export const storageAvailable = (): boolean => database !== null;

export async function loadBytes(): Promise<Uint8Array | null> {
  if (!database) return null;
  const value: unknown = await request(database.transaction(STORE, 'readonly').objectStore(STORE).get(own(RECORD)));
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

/** One put in one transaction: the record is the old bytes or the new ones, never a mix. */
export const saveBytes = (bytes: Uint8Array, id = current): Promise<void> =>
  database ? write((store) => store.put(bytes, own(RECORD, id))) : Promise.reject(new Error('No storage'));

/** Changes in one readwrite transaction; resolves once it is committed. */
function write(work: (store: IDBObjectStore) => void): Promise<void> {
  const db = database;
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    work(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB'));
  });
}

let asked = false;

/**
 * Asks the browser not to evict the data when space runs short. Firefox shows a
 * prompt, so this waits for the first save — something the person just did.
 */
export function keepData(): void {
  if (asked || !navigator.storage?.persist) return;
  asked = true;
  void navigator.storage.persisted().then((already) => (already ? undefined : navigator.storage.persist())).catch(() => undefined);
}

/** Another record of this database: the handle of its automatic copy's file. */
export async function loadRecord(key: string): Promise<unknown> {
  if (!database) return undefined;
  return request(database.transaction(STORE, 'readonly').objectStore(STORE).get(own(key)));
}

export const saveRecord = (key: string, value: unknown): Promise<void> =>
  write((store) => (value === undefined ? store.delete(own(key)) : store.put(value, own(key))));

export interface Entry {
  id: string;
  /** As typed; empty for the first database until it is renamed. */
  name: string;
  created: number;
}

export const NAME_LENGTH = 60;

/** The stored list, checked; none at all, or nothing usable in it, means the one first database. */
export function readList(value: unknown): Entry[] {
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    if (!item || typeof item !== 'object') continue;
    const { id, name, created } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[0-9a-z]{1,40}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: typeof name === 'string' ? name.slice(0, NAME_LENGTH) : '',
      created: typeof created === 'number' && Number.isFinite(created) ? created : 0,
    });
  }
  return out.length ? out : [{ id: FIRST, name: '', created: 0 }];
}

/** The list as stored; a failed read is an error, not "only the first database". */
export async function loadList(): Promise<Entry[]> {
  if (!database) return readList(undefined);
  return readList(await request(database.transaction(STORE, 'readonly').objectStore(STORE).get(LIST)));
}

/**
 * The list read, changed and written back in one transaction, with whatever
 * else `change` does to the store: two windows changing it at once take
 * turns, a new database's entry and bytes land together, and a deleted one's
 * entry and records go together.
 */
function changeList(change: (list: Entry[], store: IDBObjectStore) => Entry[]): Promise<Entry[]> {
  const db = database;
  if (!db) return Promise.reject(new Error('No storage'));
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    let result: Entry[] = [];
    const reading = store.get(LIST);
    reading.onsuccess = () => {
      result = change(readList(reading.result), store);
      store.put(result, LIST);
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB'));
  });
}

export const updateList = (edit: (list: Entry[]) => Entry[]): Promise<Entry[]> => changeList((list) => edit(list));

/** A database put in the list, with its bytes when it comes from a file. */
export const addDatabase = (entry: Entry, bytes?: Uint8Array): Promise<Entry[]> =>
  changeList((list, store) => {
    if (bytes) store.put(bytes, own(RECORD, entry.id));
    return [...list, entry];
  });

/** A database out of the list, and every record of it: its bytes, its automatic copy, what was put aside as unreadable. */
export const removeDatabase = (id: string): Promise<Entry[]> =>
  changeList((list, store) => {
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      for (const key of keys.result) {
        if (typeof key === 'string' && key !== LIST && (id === FIRST ? !key.includes(':') : key.endsWith(`:${id}`))) store.delete(key);
      }
    };
    return list.filter((e) => e.id !== id);
  });

/** Still in the list: a save into a database another window deleted would bring it back. */
export const listed = async (id: string): Promise<boolean> => (await loadList()).some((e) => e.id === id);
