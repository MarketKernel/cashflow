/**
 * The Settings tab: the base currency, currencies and their rates, the
 * forecast, the language and theme, the data's export and import, the version.
 */
import { LANGUAGES, type Language, t, tn } from '../core/i18n';
import { CURRENCY_CODE, changeBase, defaultDecimals, usedCurrencies } from '../core/state';
import { DAY } from '../core/schedule';
import {
  autoCopyName, autoCopyPaused, canPickFiles, chooseAutoCopy, exportJson, exportSqlite, importFile, newDatabase, resumeAutoCopy, stopAutoCopy,
} from './backup';
import { h, icon } from './dom';
import { date, localeTag } from './format';
import { pinSection } from './lock';
import { nav } from './nav';
import { type Prefs, prefs, savePrefs } from './prefs';
import { storageAvailable } from './storage';
import { change, getState } from './store';
import { updateSection } from './update';
import { confirmDialog, field, select, toast } from './ui';

/** A rate this old is highlighted: the forecast may be off. */
export const STALE_DAYS = 30;
export const isStale = (updatedAt: number, now: number): boolean => now - updatedAt > STALE_DAYS * DAY;

export function applyLanguageAndTheme(): void {
  const theme = prefs.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : prefs.theme;
  document.documentElement.dataset.theme = theme;
}

const number = (value: number, digits = 6): string => new Intl.NumberFormat(localeTag(), { maximumFractionDigits: digits, useGrouping: false }).format(value);
/** A rate typed with a comma or a dot. */
const parseRate = (text: string): number | null => {
  const value = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
};

function card(title: string, ...children: Array<Node | null>): HTMLElement {
  return h('section', { class: 'card' }, h('h2', { class: 'card-title' }, title), ...children);
}

function currencies(now: number): HTMLElement {
  const state = getState();
  const used = usedCurrencies(state);
  // The base first, the rest as they were added.
  const listed = [...state.currencies].sort((a, b) => Number(b.code === state.base) - Number(a.code === state.base));
  const rows = listed.map((c) => {
    const isBase = c.code === state.base;
    const stale = !isBase && isStale(c.updatedAt, now);
    const rate = h('input', {
      type: 'text', inputmode: 'decimal', class: 'rate-input', value: isBase ? '1' : number(c.rate), disabled: isBase, key: `rate-${c.code}`,
      'aria-label': t('settings', 'Rate of {code}', { code: c.code }),
      on: {
        change: () => {
          const value = parseRate(rate.value);
          if (value === null) {
            rate.classList.add('invalid');
            toast(t('settings', 'A rate is a number above zero'), 'error');
            return;
          }
          change((s) => {
            const target = s.currencies.find((x) => x.code === c.code);
            if (target) Object.assign(target, { rate: value, updatedAt: Date.now() });
          });
        },
      },
    });
    const decimals = h('input', {
      type: 'number', min: 0, max: 12, step: 1, class: 'decimals-input', value: c.decimals, key: `decimals-${c.code}`,
      // Amounts are kept in minor units: a currency in use would have every amount rescaled.
      disabled: used.has(c.code),
      title: used.has(c.code) ? t('settings', 'In use: the decimals cannot change') : undefined,
      'aria-label': t('settings', 'Decimals of {code}', { code: c.code }),
      on: {
        change: () => {
          const value = Number(decimals.value);
          if (!Number.isInteger(value) || value < 0 || value > 12) return;
          change((s) => {
            const target = s.currencies.find((x) => x.code === c.code);
            if (target) target.decimals = value;
          });
        },
      },
    });
    const remove = h('button', {
      type: 'button', class: 'icon-button', disabled: used.has(c.code),
      title: used.has(c.code) ? t('settings', 'In use: it cannot be removed') : t('settings', 'Remove {code}', { code: c.code }),
      'aria-label': t('settings', 'Remove {code}', { code: c.code }),
      on: { click: () => change((s) => void (s.currencies = s.currencies.filter((x) => x.code !== c.code))) },
    }, icon('trash'));
    return h('tr', { class: stale ? 'stale' : undefined },
      h('th', { scope: 'row' }, c.code, isBase ? h('span', { class: 'badge' }, t('settings', 'base')) : null),
      h('td', null, rate),
      h('td', null, decimals),
      h('td', { class: 'muted', title: stale ? t('settings', 'Not updated for more than {days} days', { days: STALE_DAYS }) : undefined }, isBase ? '—' : date(c.updatedAt)),
      h('td', null, isBase ? null : remove));
  });

  const code = h('input', { type: 'text', class: 'code-input', placeholder: 'EUR', maxlength: 10, autocapitalize: 'characters', spellcheck: 'false', key: 'new-code', 'aria-label': t('settings', 'Code') });
  const rate = h('input', { type: 'text', inputmode: 'decimal', class: 'rate-input', placeholder: '1', key: 'new-rate', 'aria-label': t('settings', 'Rate') });
  const add = (): void => {
    const value = code.value.trim().toUpperCase();
    const r = parseRate(rate.value);
    if (!CURRENCY_CODE.test(value)) {
      toast(t('settings', 'A code is 2 to 10 Latin letters and digits'), 'error');
      code.focus();
      return;
    }
    if (getState().currencies.some((c) => c.code === value)) {
      toast(t('settings', '{code} is already here', { code: value }), 'error');
      return;
    }
    if (r === null) {
      toast(t('settings', 'A rate is a number above zero'), 'error');
      rate.focus();
      return;
    }
    change((s) => void s.currencies.push({ code: value, rate: r, decimals: defaultDecimals(value), updatedAt: Date.now() }));
    window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-key="new-code"]')?.focus());
  };
  for (const input of [code, rate]) input.addEventListener('keydown', (e) => e.key === 'Enter' && add());

  return card(
    t('settings', 'Currencies and rates'),
    h('p', { class: 'card-note' }, t('settings', 'A rate is what one unit of the currency is worth in {base}. Rates are typed in by hand: the app never goes online.', { base: state.base })),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'table rates' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, t('settings', 'Code')),
          h('th', { scope: 'col' }, t('settings', 'Rate to {base}', { base: state.base })),
          h('th', { scope: 'col' }, t('settings', 'Decimals')),
          h('th', { scope: 'col' }, t('settings', 'Updated')),
          h('th', { scope: 'col' }))),
        h('tbody', null, ...rows),
        h('tfoot', null, h('tr', null,
          h('td', null, code), h('td', null, rate), h('td', { colspan: 3 },
            h('button', { type: 'button', class: 'button button--small', on: { click: add } }, icon('plus'), t('settings', 'Add currency'))))))),
  );
}

function base(): HTMLElement {
  const state = getState();
  const picker = select(state.currencies.map((c) => [c.code, c.code] as [string, string]), state.base, async (next) => {
    const ok = await confirmDialog(
      t('settings', 'Change the base currency?'),
      t('settings', 'All totals will be shown in {code}. Every rate is recalculated to keep the ratios; past reconciliations keep their own.', { code: next }),
      t('settings', 'Change'),
    );
    if (!ok) {
      picker.value = getState().base;
      return;
    }
    change((s) => Object.assign(s, changeBase(s, next)));
  }, { key: 'base', 'aria-label': t('settings', 'Base currency') });
  return card(t('settings', 'Base currency'),
    field(t('settings', 'Totals are shown in'), picker, t('settings', 'Add a currency below to pick it here.')));
}

function forecast(): HTMLElement {
  const state = getState();
  const numberField = (label: string, key: 'windowDays' | 'horizonYears' | 'remindDays', min: number, max: number, unit: string): HTMLElement => {
    const input = h('input', {
      type: 'number', min, max, step: 1, value: state.forecast[key], key: `forecast-${key}`, class: 'short-input',
      on: {
        change: () => {
          const value = Math.round(Number(input.value));
          if (!Number.isFinite(value) || value < min || value > max) {
            input.value = String(getState().forecast[key]);
            return;
          }
          change((s) => void (s.forecast[key] = value));
        },
      },
    });
    return field(label, h('span', { class: 'with-unit' }, input, h('span', { class: 'muted' }, unit)));
  };
  const include = h('input', {
    type: 'checkbox', checked: state.forecast.includeUnaccounted, key: 'forecast-include',
    on: { change: () => change((s) => void (s.forecast.includeUnaccounted = include.checked)) },
  });
  return card(t('settings', 'Forecast'),
    h('label', { class: 'check' }, include, h('span', null, t('settings', 'Count on unaccounted spending at its average pace'))),
    h('div', { class: 'grid-3' },
      numberField(t('settings', 'Averaging window'), 'windowDays', 7, 3650, t('settings', 'days')),
      numberField(t('settings', 'Horizon'), 'horizonYears', 1, 30, t('settings', 'years')),
      numberField(t('settings', 'Remind to reconcile after'), 'remindDays', 1, 365, t('settings', 'days'))));
}

function appearance(): HTMLElement {
  const languages: Array<[Prefs['language'], string]> = [['system', t('settings', 'As in the system')], ...(Object.entries(LANGUAGES) as Array<[Language, string]>)];
  const themes: Array<[Prefs['theme'], string]> = [['system', t('settings', 'As in the system')], ['light', t('settings', 'Light')], ['dark', t('settings', 'Dark')]];
  return card(t('settings', 'Language and theme'),
    h('div', { class: 'grid-2' },
      field(t('settings', 'Language'), select(languages, prefs.language, (value) => {
        savePrefs({ language: value });
        nav.render();
      }, { key: 'language' })),
      field(t('settings', 'Theme'), select(themes, prefs.theme, (value) => {
        savePrefs({ theme: value });
        applyLanguageAndTheme();
      }, { key: 'theme' }))));
}

function data(): HTMLElement {
  const state = getState();
  const file = h('input', {
    type: 'file', accept: '.json,.sqlite,.sqlite3,.db,application/json', hidden: true, id: 'import-file',
    on: {
      change: () => {
        const picked = file.files?.[0];
        file.value = '';
        if (picked) void importFile(picked);
      },
    },
  });
  const copy = autoCopyName();
  const autocopy = canPickFiles()
    ? h('div', { class: 'autocopy' },
        h('h3', null, t('settings', 'Automatic copy')),
        copy
          ? h('p', null, autoCopyPaused()
              ? t('settings', 'Paused: the browser asks again for access to {file}.', { file: copy })
              : t('settings', 'Every change is written to {file}.', { file: copy }))
          : h('p', { class: 'muted' }, t('settings', 'Pick a file, and every change is written to it in the background.')),
        h('div', { class: 'buttons' },
          copy && autoCopyPaused() ? h('button', { type: 'button', class: 'button button--primary', on: { click: () => void resumeAutoCopy() } }, t('settings', 'Allow access')) : null,
          h('button', { type: 'button', class: 'button', on: { click: () => void chooseAutoCopy() } }, copy ? t('settings', 'Another file') : t('settings', 'Choose a file')),
          copy ? h('button', { type: 'button', class: 'button', on: { click: () => void stopAutoCopy() } }, t('settings', 'Stop')) : null))
    : null;
  return card(t('settings', 'Data'),
    h('p', { class: 'card-note' }, storageAvailable()
      ? t('settings', 'The data is an SQLite database kept by this browser on this device. Nothing is synced: to move it to another device, export it here and import it there.')
      : t('settings', 'This browser keeps nothing for this page: the data lasts only while it is open. Export before closing, or install the app.')),
    h('p', { class: 'muted' }, tn('settings', '{count} account', '{count} accounts', state.accounts.length), ' · ',
      tn('settings', '{count} reconciliation', '{count} reconciliations', state.reconciliations.length)),
    h('div', { class: 'buttons' },
      h('button', { type: 'button', class: 'button', key: 'export-json', on: { click: () => void exportJson() } }, t('settings', 'Export JSON')),
      h('button', { type: 'button', class: 'button', key: 'export-sqlite', on: { click: () => void exportSqlite() } }, t('settings', 'Export SQLite')),
      h('button', { type: 'button', class: 'button', key: 'import', on: { click: () => file.click() } }, t('settings', 'Import…')),
      h('button', { type: 'button', class: 'button button--danger', key: 'new-database', on: { click: newDatabase } }, t('settings', 'New database…')),
      file),
    autocopy);
}

export function renderSettings(view: HTMLElement, now: number): void {
  view.append(...[
    h('h1', { class: 'page-title' }, t('settings', 'Settings')),
    base(),
    currencies(now),
    forecast(),
    appearance(),
    data(),
    pinSection(),
    updateSection(),
  ].filter((section): section is HTMLElement => section !== null));
}
