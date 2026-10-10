/**
 * The Recurring tab: operations on a schedule, by how often they happen, each
 * with what it comes to a month in the base currency.
 *
 * The past does not change. An edit closes the version in force (validTo =
 * now) and opens a new one from now with the same seriesId, so the time since
 * the last reconciliation is still counted by the old one; a deletion only
 * closes it. A version that has not started yet is simply replaced.
 */
import { dateFormat, t } from '../core/i18n';
import { perMonth } from '../core/schedule';
import { type Every, type OpType, type Recurring, type Schedule, type State, accountOf, activeRecurring, newId } from '../core/state';
import { convert } from '../core/valuation';
import { signedAmount } from './accounts';
import { h, icon } from './dom';
import { date, dateValue, firstWeekday, fromInputs, inBase, money, monthName, timeValue, weekdayName } from './format';
import { nav } from './nav';
import { opFields } from './op-fields';
import { prefs, savePrefs } from './prefs';
import { change, getState } from './store';
import { confirmDialog, dialog, enterMovesOn, field, segmented, select, toast } from './ui';

const EVERY: Every[] = ['day', 'week', 'month', 'year'];

export function everyLabel(every: Every): string {
  switch (every) {
    case 'day':
      return t('recurring', 'Daily');
    case 'week':
      return t('recurring', 'Weekly');
    case 'month':
      return t('recurring', 'Monthly');
    case 'year':
      return t('recurring', 'Yearly');
  }
}

export function describeSchedule(s: Schedule): string {
  const at = s.time !== '00:00' ? s.time : '';
  switch (s.every) {
    case 'day':
      return t('recurring', 'every day at {time}', { time: s.time });
    case 'week':
      return at ? t('recurring', '{weekday} at {time}', { weekday: weekdayName(s.weekday ?? 1), time: at }) : weekdayName(s.weekday ?? 1);
    case 'month': {
      const day = s.day === 'last' ? t('recurring', 'the last day') : t('recurring', 'day {day}', { day: s.day ?? 1 });
      return at ? t('recurring', '{day} of the month at {time}', { day, time: at }) : t('recurring', '{day} of the month', { day });
    }
    case 'year': {
      // 2028 is a leap year: 29 February has a name.
      const day = dateFormat({ day: 'numeric', month: 'long' }).format(new Date(2028, (s.month ?? 1) - 1, typeof s.day === 'number' ? s.day : 1));
      return at ? t('recurring', '{date} at {time}', { date: day, time: at }) : day;
    }
  }
}

/** What the operation comes to a month in the base currency, signed; 0 for a transfer. */
export function monthly(state: State, op: Recurring): number {
  if (op.type === 'transfer') return 0;
  const value = convert(state, op.amount, op.currency) * perMonth(op.schedule.every);
  return op.type === 'income' ? value : -value;
}

function totals(state: State, ops: Recurring[]): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const op of ops) {
    const m = monthly(state, op);
    if (m > 0) income += m;
    else expense -= m;
  }
  return { income, expense };
}

function totalLine(state: State, ops: Recurring[], label: string, key: string): HTMLElement {
  const { income, expense } = totals(state, ops);
  const balance = income - expense;
  return h('p', { class: 'month-total', 'data-test': key },
    h('span', { class: 'muted' }, label, ' '),
    signedAmount(inBase(state, income, { sign: true }), income), ' ',
    signedAmount(inBase(state, -expense, { sign: true }), -expense), ' = ',
    h('strong', null, signedAmount(inBase(state, balance, { sign: true }), balance)));
}

export function renderRecurring(view: HTMLElement, now: number): void {
  const state = getState();
  const active = activeRecurring(state, now);
  const every = prefs.every;
  const own = active.filter((op) => op.schedule.every === every).sort((a, b) => a.name.localeCompare(b.name));

  const tabs = h('nav', { class: 'subtabs', 'aria-label': t('recurring', 'How often') },
    ...EVERY.map((e) => {
      const count = active.filter((op) => op.schedule.every === e).length;
      return h('button', {
        type: 'button', class: e === every ? 'subtab subtab--on' : 'subtab', 'aria-current': e === every ? 'page' : undefined, key: `every-${e}`,
        on: { click: () => {
          savePrefs({ every: e });
          nav.render();
        } },
      }, everyLabel(e), count ? h('span', { class: 'count' }, count) : null);
    }));

  const list = own.length
    ? h('ul', { class: 'op-list' }, ...own.map((op) => {
        const account = accountOf(state, op.accountId);
        const to = accountOf(state, op.toAccountId);
        const m = monthly(state, op);
        const sign = op.type === 'expense' ? -1 : op.type === 'income' ? 1 : 0;
        return h('li', null, h('button', { type: 'button', class: 'op-row op-row--button', key: `op-${op.seriesId}`, on: { click: () => openRecurring(op) } },
          h('span', { class: 'op-main' },
            h('span', { class: 'op-name' }, op.name || everyLabel(op.schedule.every)),
            h('span', { class: 'op-meta muted' }, describeSchedule(op.schedule), ' · ',
              op.type === 'transfer' ? `${account?.name ?? '?'} → ${to?.name ?? '?'}` : account?.name ?? t('recurring', 'no account'),
              op.validTo ? ` · ${t('recurring', 'until {date}', { date: date(op.validTo - 1) })}` : '',
              op.validFrom > now ? ` · ${t('recurring', 'from {date}', { date: date(op.validFrom) })}` : '')),
          h('span', { class: 'op-amount' },
            sign ? signedAmount(money(state, sign * op.amount, op.currency, { sign: true }), sign) : h('span', { class: 'amount' }, money(state, op.amount, op.currency)),
            h('small', { class: 'muted' }, op.type === 'transfer' ? t('recurring', 'transfer') : t('recurring', '{amount} a month', { amount: inBase(state, m, { sign: true }) })))));
      }))
    : h('p', { class: 'muted empty-line' }, t('recurring', 'Nothing here yet.'));

  view.append(
    h('div', { class: 'page-head' },
      h('h1', { class: 'page-title' }, t('recurring', 'Recurring')),
      h('button', { type: 'button', class: 'button button--primary', key: 'add-recurring', on: { click: () => openRecurring(null) } }, icon('plus'), t('recurring', 'Operation'), h('kbd', { class: 'kbd' }, 'N'))),
    totalLine(state, active, t('recurring', 'A month:'), 'month-total'),
    h('div', { class: 'split' },
      tabs,
      h('section', { class: 'card' },
        h('h2', { class: 'card-title' }, everyLabel(every)),
        list,
        own.length ? totalLine(state, own, t('recurring', 'These, a month:'), 'every-total') : null)),
  );
}

/* ------------------------------------------------------------------ *
 * The form.
 * ------------------------------------------------------------------ */

const sameSchedule = (a: Schedule, b: Schedule): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A new operation filled in beforehand, for the person to check and add. */
export interface RecurringDraft {
  name: string;
  every: Every;
  type: OpType;
  amount: number;
  currency: string;
}

export function openRecurring(op: Recurring | null, draft?: RecurringDraft): void {
  const state = getState();
  const now = Date.now();
  const started = op !== null && op.validFrom <= now;
  let every: Every = op?.schedule.every ?? draft?.every ?? prefs.every;
  const name = h('input', { type: 'text', value: op?.name ?? draft?.name ?? '', key: 'recurring-name', autocomplete: 'off', placeholder: t('recurring', 'Rent, salary, subscription…') });
  const fields = opFields(state, op ?? draft ?? {}, 'recurring', prefs.lastAccount);

  const time = h('input', { type: 'time', value: op?.schedule.time ?? '09:00', key: 'recurring-time' });
  const weekdays: Array<[string, string]> = Array.from({ length: 7 }, (_, i) => (firstWeekday() + i) % 7).map((d) => [String(d), weekdayName(d)]);
  let weekday = String(op?.schedule.weekday ?? 1);
  const weekdayPicker = select(weekdays, weekday, (v) => void (weekday = v), { key: 'recurring-weekday' });
  let day = String(op?.schedule.day ?? 1);
  const days: Array<[string, string]> = [...Array.from({ length: 31 }, (_, i) => [String(i + 1), String(i + 1)] as [string, string]), ['last', t('recurring', 'the last day')]];
  const dayPicker = select(days, day, (v) => void (day = v), { key: 'recurring-day' });
  let month = String(op?.schedule.month ?? 1);
  const monthPicker = select(Array.from({ length: 12 }, (_, i) => [String(i + 1), monthName(i + 1)] as [string, string]), month, (v) => void (month = v), { key: 'recurring-month' });
  const yearDayPicker = select(days.slice(0, 31), day === 'last' ? '1' : day, (v) => void (day = v), { key: 'recurring-year-day' });

  const timeRow = field(t('recurring', 'Time'), time);
  const weekdayRow = field(t('recurring', 'Day of the week'), weekdayPicker);
  const dayRow = field(t('recurring', 'Day of the month'), dayPicker, t('recurring', 'In a shorter month, the last day.'));
  const monthRow = field(t('recurring', 'Month'), monthPicker);
  const yearDayRow = field(t('recurring', 'Day'), yearDayPicker, t('recurring', '29 February is the 28th in a common year.'));
  const timeHint = h('span', { class: 'field-hint' });
  timeRow.append(timeHint);

  const sync = (): void => {
    weekdayRow.hidden = every !== 'week';
    dayRow.hidden = every !== 'month';
    monthRow.hidden = every !== 'year';
    yearDayRow.hidden = every !== 'year';
    timeHint.textContent = every === 'day' ? '' : t('recurring', 'Optional; midnight if left empty.');
    if (every !== 'day' && !op && time.value === '09:00') time.value = '';
    if (every === 'day' && !time.value) time.value = '09:00';
  };
  const everyPicker = segmented<Every>(EVERY.map((e) => [e, everyLabel(e)]), every, (e) => {
    every = e;
    sync();
  }, t('recurring', 'How often'), 'recurring-every');
  sync();

  const from = h('input', { type: 'date', value: dateValue(op?.validFrom ?? now), key: 'recurring-from' });
  const fromTime = h('input', { type: 'time', value: timeValue(op?.validFrom ?? now), key: 'recurring-from-time' });
  const until = h('input', { type: 'date', value: op?.validTo ? dateValue(op.validTo - 1) : '', key: 'recurring-until' });

  const body: HTMLElement[] = [
    field(t('recurring', 'Name'), name),
    fields.element,
    everyPicker,
    h('div', { class: 'grid-2' }, weekdayRow, dayRow, monthRow, yearDayRow, timeRow),
    h('div', { class: 'grid-2' },
      started
        ? h('p', { class: 'field-hint hint-box' }, t('recurring', 'In force since {date}. Changes apply from now on; the past keeps the old version.', { date: date(op.validFrom) }))
        : field(t('recurring', 'In force from'), h('span', { class: 'date-time' }, from, fromTime)),
      field(t('recurring', 'Until'), until, t('recurring', 'Optional: when a loan or a subscription ends.'))),
  ];

  const schedule = (): Schedule => {
    const s: Schedule = { every, time: time.value || (every === 'day' ? '09:00' : '00:00') };
    if (every === 'week') s.weekday = Number(weekday);
    if (every === 'month') s.day = day === 'last' ? 'last' : Number(day);
    if (every === 'year') {
      s.month = Number(month);
      s.day = Number(day === 'last' ? 1 : day);
    }
    return s;
  };

  const save = (): boolean => {
    const core = fields.read();
    if (!core) return false;
    const validTo = until.value ? fromInputs(until.value, '') : null;
    // "Until 31 March" includes the 31st: the version ends when the next day begins.
    const end = validTo === null ? undefined : new Date(new Date(validTo).getFullYear(), new Date(validTo).getMonth(), new Date(validTo).getDate() + 1).getTime();
    // Left as shown, "from" is the moment the form opened — creation, to the millisecond.
    const untouched = from.value === dateValue(op?.validFrom ?? now) && fromTime.value === timeValue(op?.validFrom ?? now);
    const startChosen = started ? now : untouched ? (op?.validFrom ?? now) : (fromInputs(from.value, fromTime.value) ?? now);
    // A version cannot start before it was entered: the past is not rewritten.
    const start = op ? Math.max(now, startChosen) : startChosen;
    if (end !== undefined && end <= (started ? now : start)) {
      until.classList.add('invalid');
      toast(t('recurring', 'It ends before it starts'), 'error');
      return false;
    }
    const next: Recurring = {
      id: newId(), seriesId: op?.seriesId ?? '', name: name.value.trim(), schedule: schedule(), validFrom: start,
      type: core.type, amount: core.amount, currency: core.currency,
      ...(core.amountTo !== undefined ? { amountTo: core.amountTo } : {}),
      ...(core.accountId ? { accountId: core.accountId } : {}),
      ...(core.toAccountId ? { toAccountId: core.toAccountId } : {}),
      ...(end !== undefined ? { validTo: end } : {}),
    };
    next.seriesId ||= next.id;
    if (core.accountId) savePrefs({ lastAccount: core.accountId });

    if (!op) {
      change((s) => void s.recurring.push(next));
      toast(t('recurring', 'Added'));
      return true;
    }
    const essence = (x: Omit<Recurring, 'id' | 'seriesId' | 'validFrom'>): string =>
      JSON.stringify([x.type, x.name, x.amount, x.amountTo ?? null, x.accountId ?? null, x.toAccountId ?? null, x.currency]);
    const unchanged = essence(next) === essence(op) && sameSchedule(next.schedule, op.schedule);
    change((s) => {
      const old = s.recurring.find((r) => r.id === op.id);
      if (!old) return;
      if (!started) {
        // Not in force yet: nothing to keep.
        Object.assign(old, { ...next, id: old.id, seriesId: old.seriesId });
        if (end === undefined) delete old.validTo;
        return;
      }
      if (unchanged) {
        // Only the end moved: that is about the future.
        if (end === undefined) delete old.validTo;
        else old.validTo = end;
        return;
      }
      old.validTo = now;
      s.recurring.push({ ...next, validFrom: now });
    });
    toast(t('recurring', 'Saved'));
    return true;
  };

  const remove = async (): Promise<void> => {
    if (!op) return;
    const ok = await confirmDialog(
      t('recurring', 'Delete {name}?', { name: op.name || everyLabel(op.schedule.every) }),
      started
        ? t('recurring', 'It stops from now on. What it did before stays counted.')
        : t('recurring', 'It has not started yet and goes completely.'),
      t('recurring', 'Delete'),
      true,
    );
    if (!ok) return;
    change((s) => {
      if (!started) s.recurring = s.recurring.filter((r) => r.id !== op.id);
      else {
        const old = s.recurring.find((r) => r.id === op.id);
        if (old) old.validTo = Date.now();
      }
    });
    toast(t('recurring', 'Deleted'));
  };

  const { element } = dialog(op ? op.name || t('recurring', 'Recurring operation') : t('recurring', 'New recurring operation'), body, [
    ...(op ? [{ label: t('recurring', 'Delete'), kind: 'danger' as const, key: 'recurring-delete', run: () => void remove() }] : []),
    { label: t('dialog', 'Cancel') },
    { label: op ? t('dialog', 'Save') : t('recurring', 'Add'), kind: 'primary', key: 'recurring-save', run: save },
  ], { wide: true });
  enterMovesOn([name, ...fields.inputs()], () => element.querySelector<HTMLButtonElement>('[data-key="recurring-save"]')?.click());
  (op || draft ? fields.amount.input : name).focus();
}
