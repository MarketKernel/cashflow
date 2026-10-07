/**
 * The reconciliation form: every active account and debt, each field already
 * holding the balance the records expect, so only what differs needs typing.
 * The difference shows beside each field as it is typed, and the total
 * unaccounted under them all. Rates can be corrected here too, the stale ones
 * first in line. One button saves the snapshot.
 */
import { t } from '../core/i18n';
import { formatInput } from '../core/money';
import { expect, expectedBalance, reconcile, unaccounted } from '../core/reconcile';
import { type Account, type State, activeAccounts, decimalsOf } from '../core/state';
import { rateOf, signed } from '../core/valuation';
import { signedAmount } from './accounts';
import { h, fill } from './dom';
import { date, dateTime, inBase, money } from './format';
import { type AmountField, amountField } from './inputs';
import { nav } from './nav';
import { isStale } from './settings';
import { change, getState } from './store';
import { dialog, enterMovesOn, toast } from './ui';

const parseRate = (text: string): number | null => {
  const value = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
};

export function openReconcile(): void {
  const state = getState();
  const accounts = activeAccounts(state);
  if (accounts.length === 0) {
    toast(t('reconcile', 'Add an account first'), 'error');
    return;
  }
  nav.snapshot(null);
  const now = Date.now();
  const last = state.reconciliations.at(-1);
  if (last && now <= last.at) {
    // A clock set back: a snapshot older than the last one would break the order of the history.
    toast(t('reconcile', 'This device\'s clock is before the last reconciliation ({date}): check its date and time.', { date: dateTime(last.at) }), 'error');
    return;
  }
  const expectation = expect(state, now);
  const first = state.reconciliations.length === 0;
  const fields = new Map<string, { account: Account; field: AmountField; expected: number; diff: HTMLElement }>();
  const rateInputs = new Map<string, HTMLInputElement>();
  const total = h('p', { class: 'reconcile-total', 'aria-live': 'polite' });

  /** The state with the rates as typed: the snapshot keeps them. */
  const withRates = (): State | null => {
    const s = structuredClone(getState());
    for (const [code, input] of rateInputs) {
      // A field left as it was shown keeps the stored rate exactly, and its date: nobody checked it.
      if (input.value === input.defaultValue) continue;
      const rate = parseRate(input.value);
      if (rate === null) return null;
      const currency = s.currencies.find((c) => c.code === code);
      if (currency && currency.rate !== rate) Object.assign(currency, { rate, updatedAt: now });
    }
    return s;
  };
  const entered = (): Map<string, number> | null => {
    const out = new Map<string, number>();
    for (const [id, f] of fields) {
      const value = f.field.read();
      if (value === null) return null;
      out.set(id, value);
    }
    return out;
  };

  const update = (): void => {
    for (const f of fields.values()) {
      const value = f.field.read();
      f.field.invalid(value === null && f.field.input.value.trim() !== '');
      // The difference as money: owing more is less money.
      const diff = value === null ? 0 : signed(f.account.kind, value) - signed(f.account.kind, f.expected);
      fill(f.diff, diff === 0 ? '' : signedAmount(money(state, diff, f.account.currency, { sign: true }), diff));
    }
    const s = withRates();
    const balances = entered();
    if (!s || !balances) {
      fill(total, h('span', { class: 'negative' }, t('reconcile', 'A field holds something that is not an amount.')));
      return;
    }
    if (first) {
      fill(total, t('reconcile', 'The first reconciliation is the starting point: nothing is unaccounted yet.'));
      return;
    }
    const value = unaccounted(reconcile(s, balances, now, 'preview'));
    fill(total, t('reconcile', 'Unaccounted since the last reconciliation:'), ' ', signedAmount(inBase(s, value, { sign: true }), value));
  };

  const rows = (kind: 'asset' | 'debt'): HTMLElement | null => {
    const own = accounts.filter((a) => a.kind === kind);
    if (own.length === 0) return null;
    return h('fieldset', { class: 'reconcile-group' },
      h('legend', null, kind === 'asset' ? t('reconcile', 'Accounts') : t('reconcile', 'Debts, owed')),
      ...own.map((account) => {
        const expected = expectedBalance(expectation, account);
        const f = amountField({
          value: formatInput(expected, decimalsOf(state, account.currency)),
          decimals: () => decimalsOf(state, account.currency),
          key: `reconcile-${account.id}`,
          label: account.name,
          signed: true,
          onInput: update,
        });
        const diff = h('span', { class: 'reconcile-diff' });
        fields.set(account.id, { account, field: f, expected, diff });
        return h('label', { class: 'reconcile-row' },
          h('span', { class: 'reconcile-name' }, account.name, h('small', { class: 'muted' }, account.currency)),
          f.element,
          diff);
      }));
  };

  // The rates of the currencies the accounts are in; the stale ones go first.
  const codes = [...new Set(accounts.map((a) => a.currency))].filter((c) => c !== state.base)
    .sort((a, b) => Number(isStale(state.currencies.find((c) => c.code === b)?.updatedAt ?? 0, now)) - Number(isStale(state.currencies.find((c) => c.code === a)?.updatedAt ?? 0, now)));
  const rates = codes.length
    ? h('fieldset', { class: 'reconcile-group reconcile-rates' },
        h('legend', null, t('reconcile', 'Rates to {base}', { base: state.base })),
        ...codes.map((code) => {
          const currency = state.currencies.find((c) => c.code === code);
          const stale = isStale(currency?.updatedAt ?? 0, now);
          const input = h('input', {
            type: 'text', inputmode: 'decimal', class: 'rate-input', key: `reconcile-rate-${code}`,
            // The rate as it is stored, every digit of it: rounding here would change it.
            value: String(rateOf(state, code)),
            'aria-label': t('reconcile', 'Rate of {code}', { code }),
            on: { input: update },
          });
          rateInputs.set(code, input);
          return h('label', { class: stale ? 'reconcile-row stale' : 'reconcile-row' },
            h('span', { class: 'reconcile-name' }, `1 ${code} =`),
            h('span', { class: 'with-unit' }, input, h('span', { class: 'muted' }, state.base)),
            h('small', { class: stale ? 'stale-note' : 'muted' }, stale
              ? t('reconcile', 'updated {date} — check it', { date: date(currency?.updatedAt ?? 0) })
              : t('reconcile', 'updated {date}', { date: date(currency?.updatedAt ?? 0) })));
        }))
    : null;

  const save = (): boolean => {
    const s = withRates();
    const balances = entered();
    if (!s || !balances) {
      update();
      return false;
    }
    const rec = reconcile(s, balances, now);
    change((target) => {
      target.currencies = s.currencies;
      target.reconciliations.push(rec);
    });
    toast(first
      ? t('reconcile', 'Reconciliation saved: the forecast starts here')
      : t('reconcile', 'Reconciliation saved: {amount} unaccounted', { amount: inBase(s, unaccounted(rec), { sign: true }) }));
    return true;
  };

  const body = [
    h('p', { class: 'muted' }, t('reconcile', 'Type in the real balances. Each field holds what the records expect: change only what differs.')),
    rows('asset'),
    rows('debt'),
    rates,
    total,
  ].filter((n): n is HTMLElement => n !== null);
  const { element } = dialog(t('reconcile', 'Reconciliation'), body, [
    { label: t('dialog', 'Cancel') },
    { label: t('reconcile', 'Save'), kind: 'primary', key: 'reconcile-save', run: save },
  ], { wide: true });
  const inputs = [...[...fields.values()].map((f) => f.field.input), ...rateInputs.values()];
  enterMovesOn(inputs, () => element.querySelector<HTMLButtonElement>('[data-key="reconcile-save"]')?.focus());
  update();
  inputs[0]?.focus();
  inputs[0]?.select();
}
