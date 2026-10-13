/**
 * Amounts and dates as the interface shows them: in the interface language,
 * with the region of the browser's own locale where it speaks that language
 * (en-GB writes 1,234.56 £ differently from en-US).
 */
import { dateFormat, language, t, tn } from '../core/i18n';
import { type MoneyStyle, formatMajor, formatMinor } from '../core/money';
import { type State, decimalsOf } from '../core/state';
import { DAY } from '../core/schedule';

export function localeTag(): string {
  const lang = language();
  const regional = (typeof navigator === 'undefined' ? [] : navigator.languages).find((tag) => tag.toLowerCase().split('-')[0] === lang);
  return regional ?? lang;
}

/** An amount in minor units of `code`. */
export const money = (state: State, minor: number, code: string, style?: MoneyStyle): string =>
  formatMinor(minor, code, decimalsOf(state, code), localeTag(), style);

/** A value in the base currency (a float of major units). */
export const inBase = (state: State, major: number, style?: MoneyStyle): string =>
  formatMajor(major, state.base, decimalsOf(state, state.base), localeTag(), style);

/** A value in another base currency, a past reconciliation's. */
export const inCurrency = (major: number, code: string, decimals: number, style?: MoneyStyle): string =>
  formatMajor(major, code, decimals, localeTag(), style);

export const date = (ms: number): string => dateFormat({ day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
export const dateTime = (ms: number): string => dateFormat({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ms);
export const shortDate = (ms: number): string => dateFormat({ day: 'numeric', month: 'short' }).format(ms);
export const monthName = (month: number): string => dateFormat({ month: 'long' }).format(new Date(2026, month - 1, 1));
/** 0 = Sunday, as Date.getDay(); 4 January 2026 was a Sunday. */
export const weekdayName = (weekday: number): string => dateFormat({ weekday: 'long' }).format(new Date(2026, 0, 4 + weekday));

/** The first day of the week where the person lives: Monday unless the locale says otherwise. */
export function firstWeekday(): number {
  try {
    const info = (new Intl.Locale(localeTag()) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } });
    const first = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    return first === undefined ? 1 : first % 7;
  } catch {
    return 1;
  }
}

/** "3 days ago", "today": how long since a reconciliation. */
export function ago(ms: number, now: number): string {
  const days = Math.floor((now - ms) / DAY);
  if (days <= 0) return t('time', 'today');
  return tn('time', '{count} day ago', '{count} days ago', days);
}

/** <input type=date> and type=time values, local. */
export const dateValue = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const timeValue = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** A local moment from the two inputs' values; null when the date is not one. */
export function fromInputs(dateText: string, timeText: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!d) return null;
  const tm = /^(\d{2}):(\d{2})$/.exec(timeText);
  return new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), tm ? Number(tm[1]) : 0, tm ? Number(tm[2]) : 0).getTime();
}
