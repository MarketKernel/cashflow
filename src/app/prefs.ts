/**
 * Conveniences of this browser, in localStorage as one JSON: the language,
 * the theme, the open tab, folded groups, the chart's period. Nothing that
 * matters is here — the money is in SQLite (store.ts). Each field is checked
 * when read: an unknown or broken value falls back to its default.
 */
import { type Language, isLanguage } from '../core/i18n';
import type { Every } from '../core/state';

export const TABS = ['accounts', 'recurring', 'oneoff', 'goals', 'settings'] as const;
export type Tab = (typeof TABS)[number];
export const PERIODS = ['week', 'month', 'quarter', 'half', 'year'] as const;
export type Period = (typeof PERIODS)[number];

export interface Prefs {
  language: Language | 'system';
  theme: 'system' | 'light' | 'dark';
  tab: Tab;
  /** Folded currency groups: "asset:USD", "debt:UAH". */
  collapsed: string[];
  period: Period;
  every: Every;
  /** The account the last one-off went to: the next one goes there too. */
  lastAccount: string;
}

const KEY = 'cashflow';

const DEFAULTS: Prefs = { language: 'system', theme: 'system', tab: 'accounts', collapsed: [], period: 'quarter', every: 'month', lastAccount: '' };

function read(): Prefs {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
  } catch {
    /* no storage, or not JSON: the defaults */
  }
  const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);
  return {
    language: raw.language === 'system' || isLanguage(raw.language) ? (raw.language as Prefs['language']) : DEFAULTS.language,
    theme: pick(raw.theme, ['system', 'light', 'dark'] as const, DEFAULTS.theme),
    tab: pick(raw.tab, TABS, DEFAULTS.tab),
    collapsed: Array.isArray(raw.collapsed) ? raw.collapsed.filter((x): x is string => typeof x === 'string').slice(0, 200) : [],
    period: pick(raw.period, PERIODS, DEFAULTS.period),
    every: pick(raw.every, ['day', 'week', 'month', 'year'] as const, DEFAULTS.every),
    lastAccount: typeof raw.lastAccount === 'string' ? raw.lastAccount : '',
  };
}

export const prefs: Prefs = read();

export function savePrefs(change: Partial<Prefs>): void {
  Object.assign(prefs, change);
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode with no storage: the choice lasts this visit */
  }
}

/** Another window of the app changed them: take its values, or the next save here would undo them. */
addEventListener('storage', (event) => {
  if (event.key === KEY) Object.assign(prefs, read());
});
