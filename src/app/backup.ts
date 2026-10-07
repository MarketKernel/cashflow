/**
 * Getting the data out and back in: a JSON file (readable, and what moves
 * the data to another device — there is no sync), the SQLite file itself, and,
 * in Chrome and Edge, an automatic copy written to a chosen file after every
 * save.
 *
 * Chrome and Edge save through the File System Access API (a real "Save as");
 * the other browsers download.
 */
import { t, tn } from '../core/i18n';
import { isSqliteFile } from '../core/db';
import { checkPin } from '../core/pin';
import { type State, sanitizeState } from '../core/state';
import { h } from './dom';
import { dateValue } from './format';
import { askFilePin, pinInput } from './lock';
import { nav } from './nav';
import { loadRecord, saveRecord, storageAvailable } from './storage';
import { getState, onSaved, replace, sqliteBytes, stateFromSqlite } from './store';
import { confirmDialog, dialog, field, toast } from './ui';

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

async function save(name: string, data: Blob, type: string, extension: string): Promise<void> {
  const pick = picker();
  if (pick) {
    let handle: FileHandle;
    try {
      handle = await pick({ suggestedName: name, types: [{ description: name, accept: { [type]: [extension] } }] });
    } catch {
      return; // cancelled
    }
    const file = await handle.createWritable();
    await file.write(data);
    await file.close();
  } else {
    const url = URL.createObjectURL(data);
    const link = h('a', { href: url, download: name, hidden: true });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  toast(t('backup', 'Exported'));
}

const stamp = (): string => dateValue(Date.now());

export const exportJson = (): Promise<void> =>
  save(`cashflow-${stamp()}.json`, new Blob([toJson(getState())], { type: 'application/json' }), 'application/json', '.json');

export async function exportSqlite(): Promise<void> {
  const bytes = await sqliteBytes();
  await save(`cashflow-${stamp()}.sqlite`, new Blob([bytes.slice()], { type: 'application/vnd.sqlite3' }), 'application/vnd.sqlite3', '.sqlite');
}

/** A file to import: JSON or SQLite, checked as the stored data is, then — once confirmed — in place of everything. */
export async function importFile(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
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
  const yes = await confirmDialog(
    t('backup', 'Replace everything?'),
    t('backup', '{file}: {summary}. Everything here now is replaced by it.', { file: file.name, summary }),
    t('backup', 'Replace everything'),
    true,
  );
  if (!yes) return false;
  // The file's PIN comes with it, once typed; a file without one keeps the PIN in place.
  const current = getState().pin;
  if (next.pin && next.pin.hash !== current?.hash && !(await askFilePin(next.pin))) return false;
  if (!next.pin && current) next.pin = current;
  replace(next);
  toast(t('backup', 'Imported'));
  return true;
}

/**
 * "New database": everything here deleted, after a warning that offers an
 * export first, and the current PIN when there is one.
 */
export function newDatabase(): void {
  const pin = getState().pin;
  const input = pin ? pinInput('new-database-pin', t('lock', 'Current PIN')) : null;
  let go = false;
  dialog(t('backup', 'Create a new database?'), [
    h('p', null, t('backup', 'Everything here is deleted for good: accounts, operations, reconciliations and goals. Export the data first if it may be needed.')),
    input ? field(t('lock', 'Current PIN'), input) : null,
  ].filter((x): x is HTMLParagraphElement | HTMLLabelElement => x !== null), [
    { label: t('dialog', 'Cancel') },
    { label: t('settings', 'Export JSON'), key: 'new-database-export', run: async () => {
      await exportJson();
      return false;
    } },
    {
      label: t('backup', 'Delete and create'), kind: 'danger', key: 'new-database-confirm',
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
  ], { onClose: () => void (go && nav.anew()) });
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
    handle = await pick({ suggestedName: 'cashflow-autocopy.json', types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }] });
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
