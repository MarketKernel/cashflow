/**
 * Several databases in one browser: one for the family and one for a
 * business, say, each with its own accounts, operations, goals and PIN. The
 * list of them (an id, a name, when it was made) is a record of its own in
 * IndexedDB beside their bytes (storage.ts); where there is none yet, there is
 * one database, the one an earlier version kept.
 *
 * With more than one, the app opens on the list. The choice holds for the tab
 * in sessionStorage, so a reload stays in the same database, and a new window
 * or the installed app asks again. Switching saves what is waiting and
 * reloads the page into the other database: every module starts afresh, and
 * nothing of one database stays in memory with the other.
 */
import { t } from '../core/i18n';
import { newId } from '../core/state';
import { h, icon } from './dom';
import {
  type Entry, FIRST, NAME_LENGTH, addDatabase, currentDatabase, loadList, readList, removeDatabase, storageAvailable, updateList,
} from './storage';
import { dropPending, exclusive, flush } from './store';
import { dialog, enterMovesOn, field, toast } from './ui';

const CHOICE = 'cashflow-database';

let entries: Entry[] = readList(undefined);
let listener: () => void = () => undefined;
/** False while the list on entry is up: nothing is open yet that another window could have deleted. */
let chosen = false;
/** Draws the list on entry again, while it is up. */
let redrawPick: (() => void) | null = null;

export const databases = (): Entry[] => entries;
export const several = (): boolean => entries.length > 1;
export const nameOf = (entry: Entry): string => entry.name || t('databases', 'Main');
export const currentName = (): string => nameOf(entries.find((e) => e.id === currentDatabase()) ?? entries[0]!);
/** Another window changed the list: the screens showing it are drawn again. */
export const onListChange = (change: () => void): void => void (listener = change);

/**
 * The start of a file name: "cashflow", and the database's name after it when
 * there are several, so two exports of the same day do not take each other's place.
 */
export function fileStem(): string {
  if (!several()) return 'cashflow';
  const name = currentName().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '');
  return name ? `cashflow-${name}` : 'cashflow';
}

const channel = typeof BroadcastChannel === 'undefined' ? null : (() => {
  try {
    return new BroadcastChannel('cashflow-databases');
  } catch {
    return null;
  }
})();

channel?.addEventListener('message', () => void refresh());

async function refresh(): Promise<void> {
  try {
    entries = await loadList();
  } catch {
    return;
  }
  if (!chosen) {
    redrawPick?.();
    return;
  }
  // This database was deleted in another window: what waits here is dropped, and the list comes up again.
  if (!entries.some((e) => e.id === currentDatabase())) {
    dropPending();
    forgetChoice();
    location.reload();
    return;
  }
  listener();
}

/** The list changed here: this window and the others draw it again. */
function changed(list: Entry[]): void {
  entries = list;
  channel?.postMessage('changed');
  listener();
}

function rememberChoice(id: string): void {
  try {
    sessionStorage.setItem(CHOICE, id);
  } catch {
    /* no session storage: a reload shows the list again */
  }
}

function forgetChoice(): void {
  try {
    sessionStorage.removeItem(CHOICE);
  } catch {
    /* nothing kept to forget */
  }
}

function storedChoice(): string | null {
  try {
    return sessionStorage.getItem(CHOICE);
  } catch {
    return null;
  }
}

/** A name typed for a database: the problem with it, or null. */
function nameProblem(name: string, except?: string): string | null {
  if (!name) return t('databases', 'Type a name');
  if (entries.some((e) => e.id !== except && nameOf(e).toLocaleLowerCase() === name.toLocaleLowerCase())) return t('databases', 'There is already a database with this name');
  return null;
}

const nameInput = (key: string, value = ''): HTMLInputElement =>
  h('input', { type: 'text', maxlength: NAME_LENGTH, value, key, autocomplete: 'off', on: { input: (event: Event) => (event.target as HTMLElement).classList.remove('invalid') } });

/** Adds a database to the list, with the bytes of an imported file; a new one's come with its first save. */
export async function createDatabase(name: string, bytes?: Uint8Array): Promise<string> {
  const id = newId();
  changed(await addDatabase({ id, name: name.slice(0, NAME_LENGTH), created: Date.now() }, bytes));
  return id;
}

/** A name for a database made from a file: the file's own, without the extension, made unique. */
export function nameFromFile(file: string): string {
  const base = file.replace(/(\.(sqlite3?|db|json|enc))+$/i, '').trim().slice(0, NAME_LENGTH - 4) || t('databases', 'Imported');
  let name = base;
  for (let n = 2; nameProblem(name); n += 1) name = `${base} ${n}`;
  return name;
}

/** The other database, by a reload: what is waiting is saved first. */
export async function switchTo(id: string): Promise<void> {
  await flush();
  rememberChoice(id);
  location.reload();
}

/** Back to the list of databases: a reload with no choice made. */
export async function chooseAnother(): Promise<void> {
  await flush();
  forgetChoice();
  location.reload();
}

/**
 * The open database out of the list and out of storage, under the lock saves
 * take, so another window's save cannot land between; the page then opens on
 * the list, or the one left.
 */
export async function removeCurrent(): Promise<void> {
  const id = currentDatabase();
  await flush();
  dropPending();
  try {
    await exclusive(async () => changed(await removeDatabase(id)));
  } catch {
    toast(t('app', 'The changes could not be saved in this browser. Export the data to keep it.'), 'error');
    return;
  }
  forgetChoice();
  location.reload();
}

/**
 * Which database this start opens: the tab's choice, the only one there is,
 * or the one picked from the list on a screen like the PIN's.
 */
export async function chooseDatabase(): Promise<string> {
  if (!storageAvailable()) return FIRST;
  entries = await loadList();
  const stored = storedChoice();
  let id = stored && entries.some((e) => e.id === stored) ? stored : entries.length === 1 ? entries[0]!.id : await pick();
  // Picked while another window deleted it: the list again.
  while (!(entries = await loadList()).some((e) => e.id === id)) id = entries.length === 1 ? entries[0]!.id : await pick();
  chosen = true;
  rememberChoice(id);
  return id;
}

/** The list on entry: a button per database, and a new one with a name. */
function pick(): Promise<string> {
  return new Promise((resolve) => {
    const iconSrc = document.querySelector<HTMLImageElement>('.brand img')?.src;
    const done = (id: string): void => {
      redrawPick = null;
      shown.remove();
      resolve(id);
    };
    const name = nameInput('database-new-name');
    const message = h('p', { class: 'lock-message', role: 'alert' });
    const create = async (): Promise<void> => {
      const typed = name.value.trim();
      const problem = nameProblem(typed);
      message.textContent = problem ?? '';
      if (problem) {
        name.classList.add('invalid');
        name.focus();
        return;
      }
      done(await createDatabase(typed));
    };
    const form = h('div', { class: 'database-new', hidden: true },
      field(t('databases', 'Name'), name),
      h('button', { type: 'button', class: 'button button--primary', key: 'database-create', on: { click: () => void create() } }, t('databases', 'Create')));
    enterMovesOn([name], () => void create());
    const list = h('ul', { class: 'database-list' });
    redrawPick = () => list.replaceChildren(...entries.map((entry) => h('li', null,
      h('button', { type: 'button', class: 'button database-pick', key: 'database-pick', on: { click: () => done(entry.id) } }, nameOf(entry)))));
    redrawPick();
    const shown = h('div', { class: 'lock' },
      iconSrc ? h('img', { src: iconSrc, alt: '' }) : null,
      h('h1', null, t('databases', 'Choose a database')),
      list,
      h('button', {
        type: 'button', class: 'link-button', key: 'database-new',
        on: {
          click: () => {
            form.hidden = false;
            name.focus();
          },
        },
      }, icon('plus'), t('databases', 'New database')),
      form,
      message);
    document.body.append(shown);
    shown.querySelector<HTMLButtonElement>('.database-pick')?.focus();
  });
}

/** A name asked in a dialog: a new database, or the open one renamed. */
function askName(title: string, value: string, button: string, apply: (name: string) => Promise<void>): void {
  const input = nameInput('database-name', value);
  const opened = dialog(title, [field(t('databases', 'Name'), input)], [
    { label: t('dialog', 'Cancel') },
    {
      label: button, kind: 'primary', key: 'database-name-save',
      run: async () => {
        const typed = input.value.trim();
        const problem = nameProblem(typed, value ? currentDatabase() : undefined);
        if (problem) {
          input.classList.add('invalid');
          input.focus();
          toast(problem, 'error');
          return false;
        }
        await apply(typed);
        return true;
      },
    },
  ]);
  enterMovesOn([input], () => opened.element.querySelector<HTMLButtonElement>('[data-key="database-name-save"]')?.click());
  input.select();
  input.focus();
}

/** The card in Settings: the databases, opening another, a new one, renaming this one; deleting is backup.ts's. */
export function databasesSection(remove: HTMLElement): HTMLElement {
  if (!storageAvailable()) {
    return h('section', { class: 'card' }, h('h2', { class: 'card-title' }, t('databases', 'Database')), h('div', { class: 'buttons' }, remove));
  }
  const id = currentDatabase();
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, t('databases', 'Databases')),
    h('p', { class: 'card-note' }, t('databases', 'Each database has its own accounts, operations, goals and PIN. With more than one, the app asks which to open when it starts.')),
    h('ul', { class: 'database-rows' }, ...entries.map((entry) => h('li', { class: 'database-row' },
      h('span', { class: 'database-row-name' }, nameOf(entry), entry.id === id ? h('span', { class: 'badge' }, t('databases', 'open')) : null),
      entry.id === id
        ? h('button', { type: 'button', class: 'button button--small', key: 'database-rename', on: { click: () => askName(t('databases', 'Rename the database'), nameOf(entry), t('databases', 'Save'), async (name) => changed(await updateList((list) => list.map((e) => (e.id === id ? { ...e, name } : e))))) } }, t('databases', 'Rename…'))
        : h('button', { type: 'button', class: 'button button--small', key: 'database-open', on: { click: () => void switchTo(entry.id) } }, t('databases', 'Open'))))),
    h('div', { class: 'buttons' },
      h('button', { type: 'button', class: 'button', key: 'database-add', on: { click: () => askName(t('databases', 'New database'), '', t('databases', 'Create'), async (name) => switchTo(await createDatabase(name))) } }, icon('plus'), t('databases', 'New database…')),
      remove));
}
