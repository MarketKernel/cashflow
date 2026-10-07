/**
 * Where the SQLite database's bytes live between visits: IndexedDB, database
 * "cashflow", store "state", one record. A page opened from disk has neither a
 * disk to write to nor, everywhere, OPFS; IndexedDB is what every browser gives
 * it — Chrome, Firefox and Safari keep it for file:// pages too, each file its
 * own origin. Where it is missing or refuses (some private modes), the page
 * says so and works in memory: export, or the installed app, keeps the data.
 */

const NAME = 'cashflow';
const STORE = 'state';
const RECORD = 'sqlite';

let database: IDBDatabase | null = null;

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
  const value: unknown = await request(database.transaction(STORE, 'readonly').objectStore(STORE).get(RECORD));
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

/** One put in one transaction: the record is the old bytes or the new ones, never a mix. */
export function saveBytes(bytes: Uint8Array): Promise<void> {
  const db = database;
  if (!db) return Promise.reject(new Error('No storage'));
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(bytes, RECORD);
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

/** Another record beside the database: the handle of the automatic copy's file. */
export async function loadRecord(key: string): Promise<unknown> {
  if (!database) return undefined;
  return request(database.transaction(STORE, 'readonly').objectStore(STORE).get(key));
}

export function saveRecord(key: string, value: unknown): Promise<void> {
  const db = database;
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    if (value === undefined) transaction.objectStore(STORE).delete(key);
    else transaction.objectStore(STORE).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB'));
  });
}
