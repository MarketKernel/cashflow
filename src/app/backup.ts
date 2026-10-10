/**
 * Getting the data out and back in: a JSON file (readable, and what moves
 * the data to another device — there is no sync), the SQLite file itself,
 * the SQLite file encrypted with a password (src/core/encryption.ts) and, in
 * Chrome and Edge, an automatic copy written to a chosen file after every
 * save.
 *
 * Chrome and Edge save through the File System Access API (a real "Save as");
 * the other browsers download.
 */
import { t, tn } from '../core/i18n';
import { isSqliteFile } from '../core/db';
import { PASSWORD_LENGTH, decrypt, encrypt, encryptionAvailable, fromLaterVersion, isEncrypted } from '../core/encryption';
import { checkPin } from '../core/pin';
import { type State, sanitizeState } from '../core/state';
import { h } from './dom';
import { dateValue } from './format';
import { createDatabase, currentName, fileStem, nameFromFile, removeCurrent, several, switchTo } from './databases';
import { askFilePin, pinInput } from './lock';
import { nav } from './nav';
import { loadRecord, saveRecord, storageAvailable } from './storage';
import { getState, onSaved, replace, sqliteBytes, sqliteOf, stateFromSqlite } from './store';
import { type Dialog, dialog, enterMovesOn, field, toast } from './ui';

interface WritableFile {
  write(data: Blob | BufferSource | string): Promise<void>;
  close(): Promise<void>;
}
interface FileHandle {
  name: string;
  createWritable(): Promise<WritableFile>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
}
type SavePicker = (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<FileHandle>;

const picker = (): SavePicker | undefined => (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;

export const canPickFiles = (): boolean => typeof picker() === 'function';

export const toJson = (state: State): string => `${JSON.stringify(state, null, 2)}\n`;

/**
 * Saves a file; false when the picker was cancelled. Data that takes a while
 * to make (encryption) comes as a function, called once the file is picked:
 * the picker needs the click that asked for it to be recent.
 */
async function save(name: string, content: Blob | (() => Promise<Blob>), type: string, extension: string): Promise<boolean> {
  const pick = picker();
  if (pick) {
    let handle: FileHandle;
    try {
      handle = await pick({ suggestedName: name, types: [{ description: name, accept: { [type]: [extension] } }] });
    } catch {
      return false; // cancelled
    }
    const data = typeof content === 'function' ? await content() : content;
    const file = await handle.createWritable();
    await file.write(data);
    await file.close();
  } else {
    const data = typeof content === 'function' ? await content() : content;
    const url = URL.createObjectURL(data);
    const link = h('a', { href: url, download: name, hidden: true });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  toast(t('backup', 'Exported'));
  return true;
}

const stamp = (): string => dateValue(Date.now());

export const exportJson = async (): Promise<void> =>
  void (await save(`${fileStem()}-${stamp()}.json`, new Blob([toJson(getState())], { type: 'application/json' }), 'application/json', '.json'));

export async function exportSqlite(): Promise<void> {
  const bytes = await sqliteBytes();
  await save(`${fileStem()}-${stamp()}.sqlite`, new Blob([bytes.slice()], { type: 'application/vnd.sqlite3' }), 'application/vnd.sqlite3', '.sqlite');
}

/**
 * A dialog held still while its slow work runs (the key from the password
 * takes a second or two on a phone): its buttons off and Esc ignored, so a
 * Cancel pressed meanwhile does not throw away a password that was right.
 */
function hold(shown: Dialog, busy: () => boolean): (on: boolean) => void {
  shown.element.addEventListener('cancel', (event) => busy() && event.preventDefault());
  return (on) => {
    for (const button of Array.from(shown.element.querySelectorAll('button'))) button.disabled = on;
  };
}

const passwordInput = (key: string, label: string, autocomplete: 'new-password' | 'current-password'): HTMLInputElement =>
  h('input', {
    type: 'password', key, autocomplete, 'aria-label': label,
    on: { input: (event: Event) => (event.target as HTMLElement).classList.remove('invalid') },
  });

/**
 * The SQLite file encrypted with a password typed twice. Only the export is
 * encrypted: the browser keeps the database as it was, behind the PIN.
 */
export function exportEncrypted(): void {
  const password = passwordInput('export-password', t('backup', 'Password'), 'new-password');
  const again = passwordInput('export-password-again', t('backup', 'The password again'), 'new-password');
  let busy = false;
  const problem = (): string | null => {
    if (password.value.length < PASSWORD_LENGTH) {
      password.classList.add('invalid');
      password.focus();
      return tn('backup', 'At least {count} character', 'At least {count} characters', PASSWORD_LENGTH);
    }
    if (again.value !== password.value) {
      again.classList.add('invalid');
      again.focus();
      return t('backup', 'The two passwords differ');
    }
    return null;
  };
  const opened = dialog(t('backup', 'Export encrypted'), [
    h('p', null, t('backup', 'The SQLite file, encrypted with a password (AES-256). Without the password nobody can open it, Cashflow included: a forgotten password cannot be recovered.')),
    field(t('backup', 'Password'), password, tn('backup', 'At least {count} character', 'At least {count} characters', PASSWORD_LENGTH)),
    field(t('backup', 'The password again'), again),
  ], [
    { label: t('dialog', 'Cancel') },
    {
      label: t('backup', 'Export'), kind: 'primary', key: 'export-encrypted-ok',
      run: async () => {
        if (busy) return false;
        const wrong = problem();
        if (wrong) {
          toast(wrong, 'error');
          return false;
        }
        busy = true;
        try {
          const typed = password.value;
          return await save(`${fileStem()}-${stamp()}.sqlite.enc`, async () => {
            setBusy(true);
            return new Blob([(await encrypt(await sqliteBytes(), typed)).slice()], { type: 'application/octet-stream' });
          }, 'application/octet-stream', '.enc');
        } catch {
          toast(t('backup', 'The file could not be written'), 'error');
          return false;
        } finally {
          busy = false;
          setBusy(false);
        }
      },
    },
  ]);
  const setBusy = hold(opened, () => busy);
  enterMovesOn([password, again], () => opened.element.querySelector<HTMLButtonElement>('[data-key="export-encrypted-ok"]')?.click());
  password.focus();
}

/** The password of an encrypted file, asked until it opens the file; the file's own bytes then, or null when given up. */
function askPassword(file: Uint8Array): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    let opened: Uint8Array | null = null;
    let busy = false;
    const input = passwordInput('import-password', t('backup', 'Password'), 'current-password');
    const shown = dialog(t('backup', 'An encrypted file'), [
      h('p', null, t('backup', 'The file is encrypted. Type its password to import it.')),
      field(t('backup', 'Password'), input),
    ], [
      { label: t('dialog', 'Cancel') },
      {
        label: t('lock', 'Import'), kind: 'primary', key: 'import-password-ok',
        run: async () => {
          if (busy) return false;
          busy = true;
          setBusy(true);
          opened = await decrypt(file, input.value);
          busy = false;
          setBusy(false);
          if (opened) return true;
          input.value = '';
          input.classList.add('invalid');
          input.focus();
          toast(t('backup', 'Wrong password, or the file is damaged'), 'error');
          return false;
        },
      },
    ], { onClose: () => resolve(opened) });
    const setBusy = hold(shown, () => busy);
    enterMovesOn([input], () => shown.element.querySelector<HTMLButtonElement>('[data-key="import-password-ok"]')?.click());
    input.focus();
  });
}

/**
 * What to do with a file being imported: put it in place of this database, or
 * — where the browser keeps data — make it a database of its own beside this one.
 */
function askImport(file: string, summary: string): Promise<'replace' | 'new' | null> {
  return new Promise((resolve) => {
    let answer: 'replace' | 'new' | null = null;
    dialog(t('backup', 'Import the file'), h('p', null, t('backup', '{file}: {summary}. It can replace everything in this database, or become a new database beside it.', { file, summary })), [
      { label: t('dialog', 'Cancel') },
      ...(storageAvailable() ? [{ label: t('backup', 'As a new database'), key: 'import-new', run: () => void (answer = 'new') }] : []),
      { label: t('backup', 'Replace everything'), kind: 'danger' as const, key: 'confirm', run: () => void (answer = 'replace') },
    ], { onClose: () => resolve(answer) });
  });
}

/**
 * A file to import: JSON or SQLite, checked as the stored data is, then — once
 * confirmed — in place of everything, or as a new database that the page then opens.
 */
export async function importFile(file: File): Promise<boolean> {
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  if (isEncrypted(bytes)) {
    if (!encryptionAvailable()) {
      toast(t('backup', 'This browser cannot open encrypted files'), 'error');
      return false;
    }
    if (fromLaterVersion(bytes)) {
      toast(t('backup', 'The file was encrypted by a newer version of Cashflow: open it there, or update this one'), 'error');
      return false;
    }
    const opened = await askPassword(bytes);
    if (!opened) return false;
    bytes = opened;
  }
  let next: State;
  try {
    if (isSqliteFile(bytes)) next = stateFromSqlite(bytes);
    else {
      const raw: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (!raw || typeof raw !== 'object' || !('base' in raw || 'accounts' in raw)) throw new Error('not ours');
      next = sanitizeState(raw, Date.now());
    }
  } catch {
    toast(t('backup', 'This is not a Cashflow file'), 'error');
    return false;
  }
  const summary = [
    tn('backup', '{count} account', '{count} accounts', next.accounts.length),
    tn('backup', '{count} operation', '{count} operations', next.recurring.length + next.oneOff.length),
    tn('backup', '{count} reconciliation', '{count} reconciliations', next.reconciliations.length),
  ].join(', ');
  const how = await askImport(file.name, summary);
  if (!how) return false;
  if (how === 'new') {
    // A database of its own, with the file's PIN or none: opening it asks for that PIN as any other start would.
    let id: string;
    try {
      id = await createDatabase(nameFromFile(file.name), sqliteOf(next));
    } catch {
      toast(t('app', 'The changes could not be saved in this browser. Export the data to keep it.'), 'error');
      return false;
    }
    await switchTo(id);
    return true;
  }
  // The file's PIN comes with it, once typed; a file without one keeps the PIN in place.
  const current = getState().pin;
  if (next.pin && next.pin.hash !== current?.hash && !(await askFilePin(next.pin))) return false;
  if (!next.pin && current) next.pin = current;
  replace(next);
  toast(t('backup', 'Imported'));
  return true;
}

/**
 * "Delete this database": everything in it deleted, after a warning that
 * offers an export first, and the current PIN when there is one. One of
 * several goes from the list; the only one gives way to a new, empty database.
 */
export function deleteDatabase(): void {
  const pin = getState().pin;
  const input = pin ? pinInput('delete-database-pin', t('lock', 'Current PIN')) : null;
  const alone = !several();
  let go = false;
  dialog(t('backup', 'Delete this database?'), [
    h('p', null, alone
      ? t('backup', 'Everything here is deleted for good: accounts, operations, reconciliations and goals. A new, empty database takes its place. Export the data first if it may be needed.')
      : t('backup', '{name} is deleted for good: its accounts, operations, reconciliations and goals. Export the data first if it may be needed.', { name: currentName() })),
    input ? field(t('lock', 'Current PIN'), input) : null,
  ].filter((x): x is HTMLParagraphElement | HTMLLabelElement => x !== null), [
    { label: t('dialog', 'Cancel') },
    { label: t('settings', 'Export JSON'), key: 'delete-database-export', run: async () => {
      await exportJson();
      return false;
    } },
    {
      label: t('backup', 'Delete'), kind: 'danger', key: 'delete-database-confirm',
      run: async () => {
        if (pin && input && !(await checkPin(input.value, pin))) {
          input.value = '';
          input.classList.add('invalid');
          input.focus();
          toast(t('lock', 'Wrong PIN'), 'error');
          return false;
        }
        go = true;
        return true;
      },
    },
  // Another window may have deleted the other databases meanwhile: the only one left is never removed from the list.
  ], { onClose: () => void (go && (several() ? removeCurrent() : nav.anew())) });
  input?.focus();
}

/* ------------------------------------------------------------------ *
 * The automatic copy: a file picked once; every save writes the JSON
 * there in the background. The browser forgets the permission now and
 * then (a restart); the copy then waits for a click to ask again.
 * ------------------------------------------------------------------ */

const RECORD = 'autocopy';
let handle: FileHandle | null = null;
let paused = false;
let listener: () => void = () => undefined;

export const autoCopyName = (): string | null => handle?.name ?? null;
export const autoCopyPaused = (): boolean => paused;
export const onAutoCopyChange = (change: () => void): void => void (listener = change);

async function writeCopy(state: State): Promise<void> {
  if (!handle) return;
  // Another window let the copy go (a new database in place of one whose PIN
  // is forgotten): the file keeps the old data, and this window lets it go too.
  if (storageAvailable() && !(await loadRecord(RECORD).catch(() => null))) {
    handle = null;
    paused = false;
    listener();
    return;
  }
  const permission = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  if (permission !== 'granted') {
    if (!paused) {
      paused = true;
      listener();
    }
    return;
  }
  try {
    const file = await handle.createWritable();
    await file.write(toJson(state));
    await file.close();
    if (paused) {
      paused = false;
      listener();
    }
  } catch {
    paused = true;
    listener();
  }
}

export async function startAutoCopy(): Promise<void> {
  const stored = await loadRecord(RECORD).catch(() => undefined);
  if (stored && typeof stored === 'object' && 'createWritable' in stored) {
    handle = stored as FileHandle;
    const permission = (await handle.queryPermission?.({ mode: 'readwrite' }).catch(() => 'denied' as const)) ?? 'granted';
    paused = permission !== 'granted';
  }
  onSaved((state) => void writeCopy(state));
}

export async function chooseAutoCopy(): Promise<void> {
  const pick = picker();
  if (!pick) return;
  try {
    handle = await pick({ suggestedName: `${fileStem()}-autocopy.json`, types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
  } catch {
    return;
  }
  paused = false;
  await saveRecord(RECORD, handle);
  await writeCopy(getState());
  listener();
  toast(t('backup', 'Every change is now copied to {file}', { file: handle.name }));
}

/** After the browser dropped the permission: asked again, from a click. */
export async function resumeAutoCopy(): Promise<void> {
  if (!handle) return;
  const permission = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'granted';
  if (permission === 'granted') {
    paused = false;
    await writeCopy(getState());
  }
  listener();
}

export async function stopAutoCopy(): Promise<void> {
  handle = null;
  paused = false;
  await saveRecord(RECORD, undefined);
  listener();
}
