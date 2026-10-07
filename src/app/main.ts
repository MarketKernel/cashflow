/**
 * The page: opens SQLite and the stored data, draws the open tab, and draws
 * it again after every change. Data is small, so a tab is rebuilt whole; the
 * focused field is found again by its data-key so typing is not interrupted.
 *
 * Keys: N — a new operation (or account, or goal) on the current tab;
 * R — reconcile. ⌘/Ctrl combinations and typing in a field are left alone.
 */
import { detectLanguage, setLanguage, t, translatePage } from '../core/i18n';
import { emptyState } from '../core/state';
import { renderAccounts } from './accounts';
import { openAccount } from './account-dialog';
import { startAutoCopy, stopAutoCopy, onAutoCopyChange } from './backup';
import { h } from './dom';
import { renderGoals, openGoal } from './goals';
import { nav } from './nav';
import { askPin, locked, unlock } from './lock';
import { focusQuickAmount, renderOneOff } from './oneoff';
import { type Tab, TABS, prefs, savePrefs } from './prefs';
import { openReconcile } from './reconcile-form';
import { openRecurring, renderRecurring } from './recurring';
import { applyLanguageAndTheme, renderSettings } from './settings';
import { keepData } from './storage';
import { boot, flush, getState, hasPendingSave, onChange, onOvertaken, onSaveFailed, replaceNow } from './store';
import { justUpdated, startUpdates, updateState } from './update';
import { dialogOpen, toast } from './ui';

const view = document.getElementById('view')!;
const tabs = document.getElementById('tabs')!;
const notice = document.getElementById('notice')!;
let snapshotId: string | null = null;

/** The currency of the browser's region, for the first start; USD when there is no telling. */
function localCurrency(): string {
  const REGIONS: Record<string, string> = {
    US: 'USD', GB: 'GBP', UA: 'UAH', PL: 'PLN', CZ: 'CZK', CH: 'CHF', JP: 'JPY', CN: 'CNY', IN: 'INR', BR: 'BRL', TR: 'TRY', CA: 'CAD',
    AU: 'AUD', KZ: 'KZT', GE: 'GEL', RU: 'RUB', ID: 'IDR', PK: 'PKR', BD: 'BDT', MX: 'MXN', AR: 'ARS', KR: 'KRW', SE: 'SEK', NO: 'NOK',
    DK: 'DKK', HU: 'HUF', RO: 'RON', IL: 'ILS', AE: 'AED', SA: 'SAR', EG: 'EGP', ZA: 'ZAR', NG: 'NGN', MD: 'MDL', BY: 'BYN', AM: 'AMD',
  };
  const EURO = ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR', 'SK', 'SI', 'LT', 'LV', 'EE', 'LU', 'MT', 'CY', 'HR'];
  for (const tag of navigator.languages ?? [navigator.language]) {
    try {
      const region = new Intl.Locale(tag).maximize().region;
      if (region && EURO.includes(region)) return 'EUR';
      if (region && REGIONS[region]) return REGIONS[region];
    } catch {
      /* a tag Intl does not know */
    }
  }
  return 'USD';
}

function applyLanguage(): void {
  setLanguage(prefs.language === 'system' ? detectLanguage() : prefs.language);
  translatePage();
}

function render(): void {
  // The field being typed in comes back after the rebuild, with its cursor.
  const active = document.activeElement;
  const key = active instanceof HTMLElement && view.contains(active) ? active.dataset.key : undefined;
  const selection: [number | null, number | null] | null = active instanceof HTMLInputElement && ['text', 'search'].includes(active.type) ? [active.selectionStart, active.selectionEnd] : null;
  const scroll = window.scrollY;

  for (const button of Array.from(tabs.querySelectorAll<HTMLButtonElement>('[data-tab]'))) {
    const on = button.dataset.tab === prefs.tab;
    button.classList.toggle('tab--on', on);
    if (on) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  const now = Date.now();
  view.replaceChildren();
  view.dataset.tab = prefs.tab;
  switch (prefs.tab) {
    case 'accounts':
      renderAccounts(view, now);
      break;
    case 'recurring':
      renderRecurring(view, now);
      break;
    case 'oneoff':
      renderOneOff(view, now);
      break;
    case 'goals':
      renderGoals(view, now);
      break;
    case 'settings':
      renderSettings(view, now);
      break;
  }
  if (key) {
    const again = view.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    if (again) {
      again.focus({ preventScroll: true });
      if (selection && again instanceof HTMLInputElement) {
        try {
          again.setSelectionRange(selection[0], selection[1]);
        } catch {
          /* not a text field any more */
        }
      }
    }
  }
  window.scrollTo(0, scroll);
  const dot = document.getElementById('update-dot');
  if (dot) dot.hidden = updateState().kind !== 'ready';
}

function go(tab: Tab): void {
  if (tab !== prefs.tab) window.scrollTo(0, 0);
  snapshotId = null;
  savePrefs({ tab });
  render();
}

nav.go = go;
nav.render = render;
nav.reconcile = openReconcile;
nav.snapshotId = () => snapshotId;
nav.snapshot = (id) => {
  snapshotId = id;
  if (prefs.tab !== 'accounts') savePrefs({ tab: 'accounts' });
  window.scrollTo(0, 0);
  render();
};

tabs.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-tab]');
  const tab = button?.dataset.tab as Tab | undefined;
  if (tab && TABS.includes(tab)) go(tab);
});

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing || dialogOpen() || locked()) return;
  const target = event.target as HTMLElement;
  if (target.closest('input, textarea, select, [contenteditable]')) return;
  const key = event.key.toLowerCase();
  if (key === 'r' || key === 'к') {
    event.preventDefault();
    openReconcile();
  } else if (key === 'n' || key === 'т') {
    event.preventDefault();
    if (prefs.tab === 'accounts') openAccount(null, 'asset');
    else if (prefs.tab === 'recurring') openRecurring(null);
    else if (prefs.tab === 'oneoff') focusQuickAmount();
    else if (prefs.tab === 'goals') openGoal(null);
  }
});

// The theme "as in the system" follows the system as it changes.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyLanguageAndTheme);

// Leaving the page: what is waiting is written now.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void flush();
});
addEventListener('pagehide', () => void flush());
addEventListener('beforeunload', (event) => {
  if (hasPendingSave()) {
    void flush();
    event.preventDefault();
  }
});

/**
 * A new, empty database in place of this one: a forgotten PIN, or "New
 * database" in Settings. The automatic copy is let go first, or the empty
 * database would be written over the last copy of the old one.
 */
async function startAnew(): Promise<boolean> {
  await stopAutoCopy();
  if (!(await replaceNow(emptyState(localCurrency(), Date.now())))) return false;
  snapshotId = null;
  savePrefs({ tab: 'accounts' });
  return true;
}

nav.anew = async () => {
  if (!(await startAnew())) return false;
  render();
  await askPin();
  render();
  return true;
};

function showNotice(text: string): void {
  notice.replaceChildren(h('p', null, text), h('button', { type: 'button', class: 'icon-button', 'aria-label': t('app', 'Close'), on: { click: () => (notice.hidden = true) } }, '×'));
  notice.hidden = false;
}

async function start(): Promise<void> {
  applyLanguageAndTheme();
  applyLanguage();
  let started;
  try {
    started = await boot(localCurrency());
  } catch (error) {
    document.getElementById('starting')!.textContent = t('app', 'The database could not be opened: {error}', { error: String(error) });
    return;
  }
  // The PIN before anything of the data shows; the data is loaded meanwhile, but not drawn.
  document.getElementById('starting')!.hidden = true;
  // Where nothing is kept, every start is a first one: the question would come each time, and its answer go.
  let fresh = started.fresh && started.persistent;
  if (getState().pin && (await unlock()) === 'anew') {
    if (!(await startAnew())) {
      // Not written (or another window saved first): what is stored is still the old database, and it asks for its PIN again.
      location.reload();
      return;
    }
    fresh = true;
  }
  if (fresh) await askPin();
  onChange(render);
  onOvertaken(() => toast(t('app', 'Another window of the app saved first: this one now shows its data, and the last change made here was not kept.'), 'error'));
  onSaveFailed(() => toast(t('app', 'The changes could not be saved in this browser. Export the data to keep it.'), 'error'));
  if (!started.persistent) {
    showNotice(location.protocol === 'file:'
      ? t('app', 'This browser keeps no data for a page opened from disk: what you enter lasts only until the page is closed. Export it in Settings, or use the installed app.')
      : t('app', 'This browser keeps no data for this page (a private window?): what you enter lasts only until it is closed. Export it in Settings.'));
  } else if (started.unreadable) {
    showNotice(t('app', 'The stored data could not be read, so the page started empty. Import a backup in Settings.'));
  }
  document.getElementById('app')!.classList.remove('app--starting');
  document.getElementById('starting')!.remove();
  render();
  void startAutoCopy().then(() => onAutoCopyChange(() => prefs.tab === 'settings' && render()));
  startUpdates(() => render());
  // The installed app: ask the browser to keep the data (no prompt there, it is the person's own app).
  if (matchMedia('(display-mode: standalone)').matches) keepData();
  if (justUpdated()) toast(t('app', 'Updated to {version}', { version: __APP_VERSION__ }));
}

// Another language picked in the settings: the page's own markup too.
const renderBefore = nav.render;
nav.render = () => {
  applyLanguage();
  renderBefore();
};

void start();
