/**
 * The One-off tab: operations on a date, past or planned. Quick entry is the
 * point of it — the form is open at the top, the cursor in the amount, Enter
 * saves, the type is an expense and the account the last one used.
 *
 * Where an operation's date falls decides what it does: after the last
 * reconciliation and before now it is expected at the next one (an expense
 * accounted for, not unaccounted); in the future it is in the forecast; before
 * the last reconciliation its period is closed — it is kept as a note and
 * changes nothing.
 */
import { t } from '../core/i18n';
import { lastReconciliation } from '../core/reconcile';
import { type OneOff, type State, accountOf, newId } from '../core/state';
import { signedAmount } from './accounts';
import { h, icon } from './dom';
import { date, dateTime, dateValue, fromInputs, money, timeValue } from './format';
import { type OpFields, opFields } from './op-fields';
import { prefs, savePrefs } from './prefs';
import { change, getState } from './store';
import { confirmDialog, dialog, enterMovesOn, field, toast } from './ui';

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

/** The type and account of the quick form, kept between saves and renders. */
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
  const quick = form(state, null, 'quick', now);
  const save = (): void => {
    const op = quick.read();
    if (!op) return;
    draft.type = op.type;
    if (op.accountId) savePrefs({ lastAccount: op.accountId });
    change((s) => void s.oneOff.push(op));
    toast(op.at > Date.now() ? t('oneoff', 'Planned for {date}', { date: date(op.at) }) : t('oneoff', 'Saved'));
    // The tab is drawn again with an empty form: the cursor goes back to the amount.
    window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-key="quick-amount"]')?.focus());
  };
  quick.element.addEventListener('submit-form', save);

  const last = lastReconciliation(state)?.at ?? -Infinity;
  const planned = state.oneOff.filter((op) => op.at > now).sort((a, b) => a.at - b.at);
  const past = state.oneOff.filter((op) => op.at <= now).sort((a, b) => b.at - a.at);

  view.append(
    h('h1', { class: 'page-title' }, t('oneoff', 'One-off')),
    h('section', { class: 'card quick' },
      quick.element,
      h('div', { class: 'buttons' },
        h('button', { type: 'button', class: 'button button--primary', key: 'quick-save', on: { click: save } }, icon('check'), t('oneoff', 'Save'), h('kbd', { class: 'kbd' }, '↵')))),
    planned.length
      ? h('section', { class: 'card' }, h('h2', { class: 'card-title' }, t('oneoff', 'Planned')), h('ul', { class: 'op-list' }, ...planned.map((op) => row(state, op, last))))
      : '',
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('oneoff', 'Done')),
      past.length ? h('ul', { class: 'op-list' }, ...past.map((op) => row(state, op, last))) : h('p', { class: 'muted empty-line' }, t('oneoff', 'Nothing yet. Add what the regular operations do not cover: a purchase, a bonus, a transfer.'))),
  );
  if (!document.querySelector('dialog[open]')) quick.focus();
}

export function openOneOff(op: OneOff): void {
  const state = getState();
  const edit = form(state, op, 'edit', Date.now());
  const save = (): boolean => {
    const next = edit.read();
    if (!next) return false;
    change((s) => {
      const i = s.oneOff.findIndex((o) => o.id === op.id);
      if (i >= 0) s.oneOff[i] = next;
    });
    toast(t('oneoff', 'Saved'));
    return true;
  };
  const { close } = dialog(t('oneoff', 'One-off operation'), edit.element, [
    {
      label: t('oneoff', 'Delete'), kind: 'danger', key: 'oneoff-delete',
      run: async () => {
        const ok = await confirmDialog(t('oneoff', 'Delete this operation?'), t('oneoff', 'It is removed from the records.'), t('oneoff', 'Delete'), true);
        if (ok) {
          change((s) => void (s.oneOff = s.oneOff.filter((o) => o.id !== op.id)));
          toast(t('oneoff', 'Deleted'));
        }
        return ok;
      },
    },
    { label: t('dialog', 'Cancel') },
    { label: t('dialog', 'Save'), kind: 'primary', key: 'oneoff-save', run: save },
  ], { wide: true });
  edit.element.addEventListener('submit-form', () => save() && close());
  edit.focus();
}

/** For the N key on this tab: the cursor into the quick form's amount. */
export function focusQuickAmount(): void {
  document.querySelector<HTMLInputElement>('[data-key="quick-amount"]')?.focus();
}
