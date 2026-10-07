/**
 * When a recurring operation happens.
 *
 * Every moment is built from local calendar parts — new Date(y, m, d, h, min)
 * — and never by adding milliseconds: a day is not always 24 hours, and a
 * daily payment at 09:00 must stay at 09:00 across the clock change.
 */
import type { Every, Recurring, Schedule } from './state';

const DAY = 24 * 60 * 60 * 1000;

export const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();

function clock(time: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return [0, 0];
  return [Math.min(23, Number(match[1])), Math.min(59, Number(match[2]))];
}

type Window = Pick<Recurring, 'schedule' | 'validFrom' | 'validTo'>;

/**
 * Every moment the operation happens in the half-open (from, to], within the
 * time it is in force, [validFrom, validTo). Sorted, earliest first.
 */
export function occurrences(op: Window, from: number, to: number): number[] {
  const low = Math.max(from, op.validFrom - 1);
  const high = Math.min(to, op.validTo === undefined ? Infinity : op.validTo - 1);
  if (!(high > low)) return [];
  // The first calendar day that can hold one: the day of the lower bound.
  const start = new Date(low);
  const [hour, minute] = clock(op.schedule.time);
  const out: number[] = [];
  const take = (moment: number): boolean => {
    if (moment > high) return false;
    if (moment > low) out.push(moment);
    return true;
  };
  const s: Schedule = op.schedule;
  const y = start.getFullYear();
  const m = start.getMonth();
  const d = start.getDate();
  // Bounded loops: a bad date never makes them spin.
  switch (s.every) {
    case 'day':
      for (let i = 0; i < 400_000; i += 1) if (!take(new Date(y, m, d + i, hour, minute).getTime())) break;
      break;
    case 'week': {
      const shift = ((s.weekday ?? 1) - start.getDay() + 7) % 7;
      for (let i = 0; i < 60_000; i += 1) if (!take(new Date(y, m, d + shift + i * 7, hour, minute).getTime())) break;
      break;
    }
    case 'month':
      for (let i = 0; i < 12_000; i += 1) {
        const year = y + Math.floor((m + i) / 12);
        const month = (m + i) % 12;
        const last = daysInMonth(year, month);
        // The 31st in April is the 30th; "last" is whichever day ends the month.
        const day = s.day === 'last' ? last : Math.min(s.day ?? 1, last);
        if (!take(new Date(year, month, day, hour, minute).getTime())) break;
      }
      break;
    case 'year':
      for (let i = 0; i < 1_000; i += 1) {
        const month = (s.month ?? 1) - 1;
        // 29 February in a common year is the 28th.
        const day = Math.min(typeof s.day === 'number' ? s.day : 1, daysInMonth(y + i, month));
        if (!take(new Date(y + i, month, day, hour, minute).getTime())) break;
      }
      break;
  }
  return out;
}

/** How many times a month it happens, on average: a daily payment is about 30.44 of them. */
export function perMonth(every: Every): number {
  switch (every) {
    case 'day':
      return 365.2425 / 12;
    case 'week':
      return 365.2425 / 7 / 12;
    case 'month':
      return 1;
    case 'year':
      return 1 / 12;
  }
}

export const days = (ms: number): number => ms / DAY;
export { DAY };
