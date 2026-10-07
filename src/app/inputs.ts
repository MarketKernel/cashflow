/**
 * The fields the forms share: an amount (with its arithmetic worked out under
 * it as the person types), an account and a currency.
 */
import { t } from '../core/i18n';
import { evaluate, parseAmount } from '../core/money';
import { type Account, type State, activeAccounts } from '../core/state';
import { h } from './dom';
import { localeTag } from './format';

export interface AmountField {
  input: HTMLInputElement;
  /** The input and the line under it. */
  element: HTMLElement;
  /** Minor units, or null when the text is not an amount. */
  read: () => number | null;
  /** Marks the field as wrong (or right again). */
  invalid: (on: boolean) => void;
}

export function amountField(options: { value?: string; decimals: () => number; key?: string; label?: string; placeholder?: string; signed?: boolean; onInput?: () => void }): AmountField {
  const input = h('input', {
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    spellcheck: 'false',
    class: 'amount-input',
    value: options.value ?? '',
    placeholder: options.placeholder ?? '0',
    key: options.key,
    'aria-label': options.label,
  });
  const preview = h('span', { class: 'amount-preview', 'aria-live': 'polite' });
  const read = (): number | null => {
    const value = parseAmount(input.value, options.decimals());
    if (value === null) return null;
    return options.signed || value >= 0 ? value : null;
  };
  const show = (): void => {
    input.classList.remove('invalid');
    // "= 1 450" under an expression; nothing under a plain number.
    const text = input.value.trim();
    const value = evaluate(text);
    preview.textContent = value !== null && /[+\-*/×÷()]/.test(text.replace(/^-/, ''))
      ? `= ${new Intl.NumberFormat(localeTag(), { maximumFractionDigits: options.decimals() }).format(value)}`
      : '';
    options.onInput?.();
  };
  input.addEventListener('input', show);
  return {
    input,
    element: h('span', { class: 'amount-field' }, input, preview),
    read,
    invalid: (on) => input.classList.toggle('invalid', on),
  };
}

export function accountLabel(account: Account): string {
  return `${account.name} · ${account.currency}`;
}

/** The active accounts and debts, optionally with "no account" first. */
export function accountOptions(state: State, none: string | null): Array<[string, string]> {
  const out: Array<[string, string]> = none === null ? [] : [['', none]];
  const accounts = activeAccounts(state);
  for (const a of accounts.filter((x) => x.kind === 'asset')) out.push([a.id, accountLabel(a)]);
  for (const a of accounts.filter((x) => x.kind === 'debt')) out.push([a.id, `${accountLabel(a)} · ${t('inputs', 'debt')}`]);
  return out;
}

export function currencyOptions(state: State): Array<[string, string]> {
  return state.currencies.map((c) => [c.code, c.code]);
}
