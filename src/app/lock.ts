/**
 * The PIN of the database: the screen that asks for it before the page shows
 * anything, the question a new database starts with, and the card in
 * Settings. The hash is part of the state (src/core/pin.ts), so it is saved,
 * exported and imported with the rest; a forgotten PIN leaves one way in — a
 * new, empty database.
 *
 * The pause after wrong tries is this browser's own, in localStorage: it
 * outlives a reload, or a reload would skip it.
 */
import { t } from '../core/i18n';
import { PIN, type PinHash, checkPin, makePin, pinAvailable, pinDigits, pinWait } from '../core/pin';
import { h } from './dom';
import { localeTag } from './format';
import { FIRST, currentDatabase } from './storage';
import { change, getState } from './store';
import { dialog, enterMovesOn, field, toast } from './ui';

/**
 * Each database's own pause: wrong tries on one do not hold up the owner of
 * another, and opening one does not clear the pause of another — or a second
 * database with a PIN of one's own would undo every pause.
 */
const waitKey = (): string => (currentDatabase() === FIRST ? 'cashflow-pin-wait' : `cashflow-pin-wait:${currentDatabase()}`);
/** A pause over this long ago is forgotten: a child's tries yesterday cost the owner nothing today. */
const FORGET_AFTER = 24 * 3600 * 1000;

interface Wait {
  /** Wrong tries in a row. */
  wrong: number;
  /** When the next try may be made, by the clock. */
  until: number;
}

function readWait(): Wait {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(waitKey()) ?? 'null');
    if (raw && typeof raw === 'object') {
      const { wrong, until } = raw as Record<string, unknown>;
      if (typeof wrong === 'number' && Number.isInteger(wrong) && wrong > 0 && typeof until === 'number' && Number.isFinite(until)
        && Date.now() - until < FORGET_AFTER) return { wrong, until };
    }
  } catch {
    /* no storage, or not JSON: no pause */
  }
  return { wrong: 0, until: 0 };
}

function saveWait(wait: Wait | null): void {
  try {
    if (wait) localStorage.setItem(waitKey(), JSON.stringify(wait));
    else localStorage.removeItem(waitKey());
  } catch {
    /* private mode with no storage: the pause lasts this visit */
  }
}

let isLocked = false;
/** True while a PIN screen is up: the keyboard shortcuts wait. */
export const locked = (): boolean => isLocked;

// A one-time code, to a password manager: it neither offers to save the PIN nor fills it in for someone else.
export const pinInput = (key: string, label: string): HTMLInputElement =>
  h('input', {
    type: 'password', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 4, class: 'pin-input', key, 'aria-label': label,
    on: { input: (event: Event) => (event.target as HTMLElement).classList.remove('invalid') },
  });

/** A screen over the hidden page, with the app's icon on top. */
function screen(title: string, ...children: Array<Node | null>): HTMLDivElement {
  const icon = document.querySelector<HTMLImageElement>('.brand img')?.src;
  return h('div', { class: 'lock' }, icon ? h('img', { src: icon, alt: '' }) : null, h('h1', null, title), ...children);
}

/** m:ss in the digits of the interface's language. */
function clock(seconds: number): string {
  const digits = (n: number, least: number): string => new Intl.NumberFormat(localeTag(), { minimumIntegerDigits: least, useGrouping: false }).format(n);
  return `${digits(Math.floor(seconds / 60), 1)}:${digits(seconds % 60, 2)}`;
}

/**
 * Asks for the PIN. Resolves 'open' once the right one is typed, 'anew' when
 * the person gave up on it and agreed to a new, empty database — the page
 * then stays locked until the new database's question is answered.
 *
 * Each try is checked against the PIN the state holds now (another window may
 * have changed it), and the pause is read anew from storage, which every tab
 * shares: more tabs give no more tries. `name` is the database's: a forgotten
 * PIN deletes it only once the name is typed. With several databases (`another`
 * given), the screen shows the name, and `another` goes back to their list.
 */
export function unlock(name: string, another?: () => void): Promise<'open' | 'anew'> {
  isLocked = true;
  return new Promise((resolve) => {
    let wait = readWait();
    let busy = false;
    let done = false;
    let timer = 0;
    const input = pinInput('pin-unlock', t('lock', 'PIN'));
    const message = h('p', { class: 'lock-message', role: 'alert' });
    const button = h('button', { type: 'button', class: 'button button--primary', key: 'pin-unlock-button', on: { click: () => void attempt() } }, t('lock', 'Unlock'));
    const forgot = h('button', { type: 'button', class: 'link-button', key: 'pin-forgot', on: { click: () => anew() } }, t('lock', 'Forgot the PIN?'));
    const shown = screen(t('lock', 'Enter the PIN'),
      another ? h('p', { class: 'lock-note', key: 'pin-database' }, name) : null,
      input, message, button, forgot,
      another ? h('button', { type: 'button', class: 'link-button', key: 'pin-another', on: { click: another } }, t('lock', 'Another database')) : null);
    const finish = (how: 'open' | 'anew'): void => {
      if (done) return;
      done = true;
      window.clearInterval(timer);
      saveWait(null);
      isLocked = how === 'anew';
      shown.remove();
      resolve(how);
    };
    /** Holds the field shut until the pause is over, counting down; the clock may be off, so never longer than the pause itself. */
    const pause = (): void => {
      window.clearInterval(timer);
      const left = Math.min(wait.until - Date.now(), pinWait(wait.wrong));
      if (left <= 0) {
        input.disabled = button.disabled = false;
        input.focus();
        return;
      }
      const end = performance.now() + left;
      input.disabled = button.disabled = true;
      const tick = (): void => {
        const seconds = Math.ceil((end - performance.now()) / 1000);
        if (seconds > 0) {
          message.textContent = t('lock', 'Wrong PIN. Try again in {time}.', { time: clock(seconds) });
          return;
        }
        window.clearInterval(timer);
        message.textContent = t('lock', 'Wrong PIN');
        input.disabled = button.disabled = false;
        input.focus();
      };
      tick();
      timer = window.setInterval(tick, 250);
    };
    const attempt = async (): Promise<void> => {
      // Fewer than four digits are not a try: they cost no pause.
      if (busy || done || input.disabled || !PIN.test(pinDigits(input.value))) return;
      // Another tab's wrong try since: its pause holds here too.
      const stored = readWait();
      if (stored.wrong > wait.wrong) {
        wait = stored;
        input.value = '';
        pause();
        if (input.disabled) return;
      }
      const pin = getState().pin;
      busy = true;
      const right = !pin || (await checkPin(input.value, pin));
      busy = false;
      if (right) {
        finish('open');
        return;
      }
      wait = { wrong: wait.wrong + 1, until: Date.now() + pinWait(wait.wrong + 1) };
      saveWait(wait);
      input.value = '';
      input.classList.add('invalid');
      pause();
    };
    // A child trying keys finds "Forgot the PIN?" soon enough: the database goes only once its name is typed.
    const anew = (): void => {
      let ok = false;
      const typed = h('input', {
        type: 'text', key: 'forgot-name', autocomplete: 'off', spellcheck: 'false', 'aria-label': t('lock', 'The name of the database'),
        on: { input: () => typed.classList.remove('invalid') },
      });
      const opened = dialog(t('lock', 'Start a new database?'), [
        h('p', null, t('lock', 'Without the PIN this database cannot be opened. A new, empty one takes its place: everything in this one is deleted for good.')),
        field(t('lock', 'To delete it, type its name: {name}', { name }), typed),
      ], [
        { label: t('dialog', 'Cancel') },
        {
          label: t('lock', 'Delete and start anew'), kind: 'danger', key: 'confirm',
          run: () => {
            ok = typed.value.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase();
            if (ok) return true;
            typed.classList.add('invalid');
            typed.focus();
            toast(t('lock', 'The name does not match'), 'error');
            return false;
          },
        },
      ], {
        onClose: () => {
          if (ok) finish('anew');
          else if (!input.disabled) input.focus();
        },
      });
      enterMovesOn([typed], () => opened.element.querySelector<HTMLButtonElement>('[data-key="confirm"]')?.click());
      typed.focus();
    };
    // Four digits are the whole PIN: it is checked as soon as they are typed.
    input.addEventListener('input', () => {
      if (pinDigits(input.value).length === 4) void attempt();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        void attempt();
      }
    });
    document.body.append(shown);
    input.focus();
    pause();
  });
}

/** Checks a new PIN and its repetition; the message for the first thing wrong, or null. */
function newPinProblem(first: HTMLInputElement, again: HTMLInputElement): string | null {
  if (!PIN.test(pinDigits(first.value))) {
    first.classList.add('invalid');
    first.focus();
    return t('lock', 'A PIN is 4 digits');
  }
  if (pinDigits(again.value) !== pinDigits(first.value)) {
    again.classList.add('invalid');
    again.focus();
    return t('lock', 'The two PINs differ');
  }
  return null;
}

/** The question a new database starts with: a PIN, or none. Either answer creates the database. */
export function askPin(): Promise<void> {
  if (!pinAvailable()) return Promise.resolve();
  isLocked = true;
  return new Promise((resolve) => {
    let busy = false;
    const first = pinInput('pin-new', t('lock', 'New PIN'));
    const again = pinInput('pin-again', t('lock', 'The PIN again'));
    const message = h('p', { class: 'lock-message', role: 'alert' });
    const finish = (pin: PinHash | null): void => {
      if (!isLocked) return;
      // Saved either way, so the question is asked once. "Without" leaves alone
      // a PIN another window set for this database in the meantime.
      change((s) => {
        if (pin) s.pin = pin;
      });
      isLocked = false;
      shown.remove();
      resolve();
    };
    const set = async (): Promise<void> => {
      if (busy) return;
      const problem = newPinProblem(first, again);
      message.textContent = problem ?? '';
      if (problem) return;
      busy = true;
      finish(await makePin(first.value));
    };
    const shown = screen(t('lock', 'A PIN for the new database'),
      h('p', { class: 'lock-note' }, t('lock', 'Four digits, asked each time the page opens. A forgotten PIN cannot be recovered: the only way in is then a new, empty database. It can be changed or removed in Settings.')),
      h('div', { class: 'lock-fields' }, field(t('lock', 'New PIN'), first), field(t('lock', 'The PIN again'), again)),
      message,
      h('div', { class: 'buttons' },
        h('button', { type: 'button', class: 'button button--primary', key: 'pin-create', on: { click: () => void set() } }, t('lock', 'Set a PIN')),
        h('button', { type: 'button', class: 'button', key: 'pin-skip', on: { click: () => busy || finish(null) } }, t('lock', 'Without a PIN'))));
    enterMovesOn([first, again], () => void set());
    document.body.append(shown);
    first.focus();
  });
}

/**
 * An imported file brings its own PIN: it is asked before the file takes this
 * database's place. True once it is typed right; false when given up.
 */
export function askFilePin(pin: PinHash): Promise<boolean> {
  return new Promise((resolve) => {
    let right = false;
    const input = pinInput('pin-file', t('lock', 'The PIN of the file'));
    const opened = dialog(t('lock', 'The PIN of the file'), [
      h('p', null, t('lock', 'The file is protected by a PIN of its own. Type it to import the file; it then becomes the PIN here.')),
      field(t('lock', 'The PIN of the file'), input),
    ], [
      { label: t('dialog', 'Cancel') },
      {
        label: t('lock', 'Import'), kind: 'primary', key: 'pin-file-ok',
        run: async () => {
          right = await checkPin(input.value, pin);
          if (right) return true;
          input.value = '';
          input.classList.add('invalid');
          input.focus();
          toast(t('lock', 'Wrong PIN'), 'error');
          return false;
        },
      },
    ], { onClose: () => resolve(right) });
    enterMovesOn([input], () => opened.element.querySelector<HTMLButtonElement>('[data-key="pin-file-ok"]')?.click());
    input.focus();
  });
}

/** Setting, changing or removing the PIN in Settings; changing and removing ask for the current one first. */
function openPin(mode: 'set' | 'change' | 'remove'): void {
  const currentField = mode === 'set' ? null : pinInput('pin-current', t('lock', 'Current PIN'));
  const newField = mode === 'remove' ? null : pinInput('pin-new', t('lock', 'New PIN'));
  const againField = mode === 'remove' ? null : pinInput('pin-again', t('lock', 'The PIN again'));
  let saving = false;
  const apply = async (): Promise<boolean> => {
    const stored = getState().pin;
    if (currentField && !(stored && (await checkPin(currentField.value, stored)))) {
      currentField.classList.add('invalid');
      currentField.focus();
      toast(t('lock', 'Wrong PIN'), 'error');
      return false;
    }
    if (newField && againField) {
      const problem = newPinProblem(newField, againField);
      if (problem) {
        toast(problem, 'error');
        return false;
      }
    }
    const next = newField ? await makePin(newField.value) : null;
    change((s) => {
      if (next) s.pin = next;
      else delete s.pin;
    });
    toast(next ? t('lock', 'The PIN is set') : t('lock', 'The PIN is removed'));
    return true;
  };
  const save = async (): Promise<boolean> => {
    if (saving) return false;
    saving = true;
    try {
      return await apply();
    } finally {
      saving = false;
    }
  };
  const title = mode === 'set' ? t('lock', 'Set a PIN') : mode === 'change' ? t('lock', 'Change the PIN') : t('lock', 'Remove the PIN');
  const fields = [currentField, newField, againField].filter((x): x is HTMLInputElement => x !== null);
  const opened = dialog(title, [
    currentField ? field(t('lock', 'Current PIN'), currentField) : null,
    newField ? field(t('lock', 'New PIN'), newField, t('lock', '4 digits')) : null,
    againField ? field(t('lock', 'The PIN again'), againField) : null,
  ].filter((x): x is HTMLLabelElement => x !== null), [
    { label: t('dialog', 'Cancel') },
    mode === 'remove'
      ? { label: t('lock', 'Remove'), kind: 'danger', key: 'pin-save', run: save }
      : { label: t('lock', 'Save'), kind: 'primary', key: 'pin-save', run: save },
  ]);
  enterMovesOn(fields, () => opened.element.querySelector<HTMLButtonElement>('[data-key="pin-save"]')?.click());
  fields[0]?.focus();
}

/** The card in Settings; none where the browser cannot hash. */
export function pinSection(): HTMLElement | null {
  if (!pinAvailable()) return null;
  const on = getState().pin !== undefined;
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, t('lock', 'PIN on entry'), on ? h('span', { class: 'badge' }, t('lock', 'on')) : null),
    h('p', { class: 'card-note' }, t('lock', 'The PIN is kept in the database, exports included, and asked each time it opens. It keeps out a passer-by, not a thief: the data is not encrypted. A forgotten PIN cannot be recovered: the only way in is then a new, empty database.')),
    h('div', { class: 'buttons' }, ...(on
      ? [
          h('button', { type: 'button', class: 'button', key: 'pin-change', on: { click: () => openPin('change') } }, t('lock', 'Change the PIN')),
          h('button', { type: 'button', class: 'button', key: 'pin-remove', on: { click: () => openPin('remove') } }, t('lock', 'Remove the PIN')),
        ]
      : [h('button', { type: 'button', class: 'button', key: 'pin-set', on: { click: () => openPin('set') } }, t('lock', 'Set a PIN'))])));
}
