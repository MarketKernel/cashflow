/**
 * The One-off tab: operations on a date, past or planned. A new one is a
 * dialog behind the button (or N): the cursor in the amount, Enter saves, the
 * type and the account are the last ones used.
 *
 * Where an operation's date falls decides what it does: after the last
 * reconciliation and before now it is expected at the next one (an expense
 * accounted for, not unaccounted); in the future it is in the forecast; before
 * the last reconciliation its period is closed — it is kept as a note and
 * changes nothing. So the list opens on what the next reconciliation takes
 * in; the filter shows the interval of a past one, everything, or the dates
 * typed in.
 */
import { t, tn } from '../core/i18n';
import { lastReconciliation } from '../core/reconcile';
import { type OneOff, type State, accountOf, newId } from '../core/state';
import { convert } from '../core/valuation';
import { signedAmount } from './accounts';
import { h, icon } from './dom';
import { date, dateTime, dateValue, fromInputs, inBase, money, timeValue } from './format';
import { nav } from './nav';
import { type OpFields, opFields } from './op-fields';
import { prefs, savePrefs } from './prefs';
import { change, getState } from './store';
import { type Action, confirmDialog, dialog, enterMovesOn, field, toast } from './ui';

/** The moment for a date and an optional time: today with no time is now — later than any reconciliation today. */
function momentOf(dateText: string, timeText: string, now: number): number | null {
  if (!timeText && dateText === dateValue(now)) return now;
  return fromInputs(dateText, timeText);
}

interface Form {
  element: HTMLElement;
  fields: OpFields;
  read: () => OneOff | null;
  focus: () => void;
}

/** The type of the last new operation: the next one starts with it. */
const draft: { type?: OneOff['type'] } = {};

function form(state: State, op: OneOff | null, prefix: string, now: number): Form {
  const fields = opFields(state, op ?? { type: draft.type ?? 'expense' }, prefix, prefs.lastAccount);
  const day = h('input', { type: 'date', value: dateValue(op?.at ?? now), key: `${prefix}-date` });
  const time = h('input', { type: 'time', value: op ? timeValue(op.at) : '', key: `${prefix}-time`, 'aria-label': t('oneoff', 'Time') });
  const note = h('input', { type: 'text', value: op?.note ?? '', key: `${prefix}-note`, autocomplete: 'off', placeholder: t('oneoff', 'What for'), 'aria-label': t('oneoff', 'Note') });
  const warning = h('p', { class: 'warning', role: 'status', hidden: true });
  const check = (): void => {
    const at = momentOf(day.value, time.value, Date.now());
    const last = lastReconciliation(getState());
    warning.hidden = !(at !== null && last && at <= last.at);
    if (last) warning.textContent = t('oneoff', 'The period is closed by the reconciliation of {date}: this does not change the calculations.', { date: dateTime(last.at) });
  };
  day.addEventListener('input', check);
  time.addEventListener('input', check);
  check();
  const element = h('div', { class: 'oneoff-form' },
    fields.element,
    h('div', { class: 'grid-3' },
      field(t('oneoff', 'Date'), day),
      field(t('oneoff', 'Time'), time, t('oneoff', 'Optional')),
      field(t('oneoff', 'Note'), note)),
    warning);
  const read = (): OneOff | null => {
    const core = fields.read();
    if (!core) return null;
    // Untouched date and time keep the moment to the millisecond: HH:MM alone could move it across a reconciliation.
    const kept = op && day.value === dateValue(op.at) && time.value === timeValue(op.at);
    const at = kept ? op.at : momentOf(day.value, time.value, Date.now());
    if (at === null) {
      day.classList.add('invalid');
      return null;
    }
    return { id: op?.id ?? newId(), at, note: note.value.trim(), ...core };
  };
  enterMovesOn([...fields.inputs(), note], () => element.dispatchEvent(new CustomEvent('submit-form')));
  for (const input of [day, time]) input.addEventListener('keydown', (e) => e.key === 'Enter' && element.dispatchEvent(new CustomEvent('submit-form')));
  return { element, fields, read, focus: () => fields.amount.input.focus() };
}

/* ------------------------------------------------------------------ *
 * The filter.
 * ------------------------------------------------------------------ */

/**
 * Which operations the list shows: those the next reconciliation takes in,
 * the interval (previous, this] of a past one, all of them, or local dates
 * with both days included. It lasts while the page is open.
 */
type Filter =
  | { kind: 'open' }
  | { kind: 'all' }
  | { kind: 'reconciliation'; id: string }
  | { kind: 'dates'; from: string; to: string };

let filter: Filter = { kind: 'open' };

/** The start of the day after a date input's value. */
function nextDay(text: string): number | null {
  const start = fromInputs(text, '');
  if (start === null) return null;
  const d = new Date(start);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** Whether a moment is in the filter; a reconciliation that is gone is the open period again. */
function inFilter(state: State, f: Filter): (at: number) => boolean {
  const recs = state.reconciliations;
  if (f.kind === 'all') return () => true;
  if (f.kind === 'reconciliation') {
    const i = recs.findIndex((r) => r.id === f.id);
    if (i >= 0) {
      const after = recs[i - 1]?.at ?? -Infinity;
      const upTo = recs[i]!.at;
      return (at) => at > after && at <= upTo;
    }
  }
  if (f.kind === 'dates') {
    const from = fromInputs(f.from, '') ?? -Infinity;
    const before = nextDay(f.to) ?? Infinity;
    return (at) => at >= from && at < before;
  }
  const last = lastReconciliation(state)?.at ?? -Infinity;
  return (at) => at > last;
}

function current(state: State): Filter {
  const f = filter;
  return f.kind === 'reconciliation' && !state.reconciliations.some((r) => r.id === f.id) ? { kind: 'open' } : f;
}

function setFilter(next: Filter): void {
  filter = next;
  nav.render();
}

function filterValue(f: Filter): string {
  return f.kind === 'reconciliation' ? `rec:${f.id}` : f.kind;
}

function filterBar(state: State, f: Filter, shown: OneOff[]): HTMLElement {
  const recs = state.reconciliations;
  const last = recs.at(-1);
  const periods = recs.flatMap((rec, i) => {
    const prev = recs[i - 1];
    // Before the first one there is only what was entered with a date before it.
    if (!prev && !state.oneOff.some((op) => op.at <= rec.at)) return [];
    // Two reconciliations on one day need their times to be told apart.
    const at = prev && date(prev.at) === date(rec.at) ? dateTime : date;
    return [h('option', { value: `rec:${rec.id}` }, prev ? `${at(prev.at)} – ${at(rec.at)}` : t('oneoff', 'Before {date}', { date: at(rec.at) }))];
  }).reverse();
  const picker = h('select', {
    key: 'oneoff-filter',
    on: { change: () => {
      const value = picker.value;
      if (value.startsWith('rec:')) setFilter({ kind: 'reconciliation', id: value.slice(4) });
      else if (value === 'dates') {
        const today = new Date();
        setFilter({ kind: 'dates', from: dateValue(new Date(today.getFullYear(), today.getMonth(), 1).getTime()), to: dateValue(today.getTime()) });
      } else setFilter({ kind: value === 'all' ? 'all' : 'open' });
    } },
  },
  h('option', { value: 'open' }, last ? t('oneoff', 'Not reconciled yet: since {date}', { date: date(last.at) }) : t('oneoff', 'Not reconciled yet')),
  periods.length ? h('optgroup', { label: t('oneoff', 'Between reconciliations') }, ...periods) : null,
  h('option', { value: 'all' }, t('oneoff', 'All operations')),
  h('option', { value: 'dates' }, t('oneoff', 'Dates…')));
  picker.value = filterValue(f);

  const dates = f.kind === 'dates'
    ? (['from', 'to'] as const).map((end) => {
        const input = h('input', {
          type: 'date', value: f[end], key: `oneoff-filter-${end}`,
          on: { change: () => setFilter({ ...f, [end]: input.value }) },
        });
        return field(end === 'from' ? t('oneoff', 'From') : t('oneoff', 'To'), input);
      })
    : [];

  return h('section', { class: 'card oneoff-filter' },
    h('div', { class: 'filter-row' }, field(t('oneoff', 'Period'), picker), ...dates),
    totalLine(state, shown));
}

/** What the operations shown come to in the base currency, at today's rates; transfers move nothing. */
function totalLine(state: State, ops: OneOff[]): HTMLElement {
  let income = 0;
  let expense = 0;
  for (const op of ops) {
    if (op.type === 'income') income += convert(state, op.amount, op.currency);
    else if (op.type === 'expense') expense += convert(state, op.amount, op.currency);
  }
  const balance = income - expense;
  return h('p', { class: 'month-total', 'data-test': 'oneoff-total' },
    h('span', { class: 'muted' }, tn('oneoff', '{count} operation:', '{count} operations:', ops.length), ' '),
    signedAmount(inBase(state, income, { sign: true }), income), ' ',
    signedAmount(inBase(state, -expense, { sign: true }), -expense), ' = ',
    h('strong', null, signedAmount(inBase(state, balance, { sign: true }), balance)));
}

/* ------------------------------------------------------------------ *
 * The tab.
 * ------------------------------------------------------------------ */

function row(state: State, op: OneOff, closedBefore: number): HTMLElement {
  const account = accountOf(state, op.accountId);
  const to = accountOf(state, op.toAccountId);
  const sign = op.type === 'expense' ? -1 : op.type === 'income' ? 1 : 0;
  const closed = op.at <= closedBefore;
  return h('li', null, h('button', {
    type: 'button', class: closed ? 'op-row op-row--button op-row--closed' : 'op-row op-row--button', key: `oneoff-${op.id}`,
    title: closed ? t('oneoff', 'In a closed period: it changes nothing') : undefined,
    on: { click: () => openOneOff(op) },
  },
  h('span', { class: 'op-main' },
    h('span', { class: 'op-name' }, op.note || (op.type === 'income' ? t('oneoff', 'Income') : op.type === 'expense' ? t('oneoff', 'Expense') : t('oneoff', 'Transfer'))),
    h('span', { class: 'op-meta muted' }, dateTime(op.at), ' · ',
      op.type === 'transfer' ? `${account?.name ?? '?'} → ${to?.name ?? '?'}` : account?.name ?? t('oneoff', 'no account'))),
  h('span', { class: 'op-amount' }, sign
    ? signedAmount(money(state, sign * op.amount, op.currency, { sign: true }), sign)
    : h('span', { class: 'amount' }, money(state, op.amount, op.currency)))));
}

export function renderOneOff(view: HTMLElement, now: number): void {
  const state = getState();
  const f = current(state);
  const shown = state.oneOff.filter((op) => inFilter(state, f)(op.at));
  // In the interval of a past reconciliation everything is closed: no need to grey it all out.
  const last = f.kind === 'reconciliation' ? -Infinity : lastReconciliation(state)?.at ?? -Infinity;
  const planned = shown.filter((op) => op.at > now).sort((a, b) => a.at - b.at);
  const past = shown.filter((op) => op.at <= now).sort((a, b) => b.at - a.at);

  view.append(
    h('div', { class: 'page-head' },
      h('h1', { class: 'page-title' }, t('oneoff', 'One-off')),
      h('button', { type: 'button', class: 'button button--primary', key: 'add-oneoff', on: { click: () => openOneOff(null) } }, icon('plus'), t('oneoff', 'Operation'), h('kbd', { class: 'kbd' }, 'N'))),
    state.oneOff.length ? filterBar(state, f, shown) : '',
    planned.length
      ? h('section', { class: 'card' }, h('h2', { class: 'card-title' }, t('oneoff', 'Planned')), h('ul', { class: 'op-list' }, ...planned.map((op) => row(state, op, last))))
      : '',
    planned.length && !past.length
      ? ''
      : h('section', { class: 'card' },
          h('h2', { class: 'card-title' }, t('oneoff', 'Done')),
          past.length
            ? h('ul', { class: 'op-list' }, ...past.map((op) => row(state, op, last)))
            : h('p', { class: 'muted empty-line' }, state.oneOff.length
              ? t('oneoff', 'Nothing in this period.')
              : t('oneoff', 'Nothing yet. Add what the regular operations do not cover: a purchase, a bonus, a transfer.'))),
  );
}

/** A new operation (null) or an existing one, in a dialog. */
export function openOneOff(op: OneOff | null): void {
  const state = getState();
  const edit = form(state, op, op ? 'edit' : 'new', Date.now());
  const save = (): boolean => {
    const next = edit.read();
    if (!next) return false;
    if (op) {
      change((s) => {
        const i = s.oneOff.findIndex((o) => o.id === op.id);
        if (i >= 0) s.oneOff[i] = next;
      });
    } else {
      draft.type = next.type;
      if (next.accountId) savePrefs({ lastAccount: next.accountId });
      change((s) => void s.oneOff.push(next));
    }
    const s = getState();
    toast(!inFilter(s, current(s))(next.at)
      ? t('oneoff', 'Saved, outside the period shown')
      : !op && next.at > Date.now() ? t('oneoff', 'Planned for {date}', { date: date(next.at) }) : t('oneoff', 'Saved'));
    return true;
  };
  const actions: Action[] = [
    { label: t('dialog', 'Cancel') },
    { label: t('dialog', 'Save'), kind: 'primary', key: 'oneoff-save', run: save },
  ];
  if (op) {
    actions.unshift({
      label: t('oneoff', 'Delete'), kind: 'danger', key: 'oneoff-delete',
      run: async () => {
        const ok = await confirmDialog(t('oneoff', 'Delete this operation?'), t('oneoff', 'It is removed from the records.'), t('oneoff', 'Delete'), true);
        if (ok) {
          change((s) => void (s.oneOff = s.oneOff.filter((o) => o.id !== op.id)));
          toast(t('oneoff', 'Deleted'));
        }
        return ok;
      },
    });
  }
  const { close } = dialog(op ? t('oneoff', 'One-off operation') : t('oneoff', 'New one-off operation'), edit.element, actions, { wide: true });
  edit.element.addEventListener('submit-form', () => save() && close());
  edit.focus();
}
