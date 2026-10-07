/**
 * The fields recurring and one-off operations share: the type, the amount,
 * the account — or, with no account, the currency — and for a transfer the
 * account it goes to and, between currencies, the amount credited there.
 */
import { t } from '../core/i18n';
import { formatInput } from '../core/money';
import { type OpType, type State, accountOf, activeAccounts, decimalsOf } from '../core/state';
import { h } from './dom';
import { type AmountField, accountOptions, amountField, currencyOptions } from './inputs';
import { field, segmented, select } from './ui';

export interface OpCore {
  type: OpType;
  amount: number;
  amountTo?: number;
  accountId?: string;
  toAccountId?: string;
  currency: string;
}

export interface OpFields {
  element: HTMLElement;
  /** The operation as typed; null (and the wrong field marked) when it is not complete. */
  read: () => OpCore | null;
  amount: AmountField;
  /** The fields Enter walks through, in order. */
  inputs: () => HTMLElement[];
  type: () => OpType;
  onChange: (listener: () => void) => void;
}

export function opFields(state: State, initial: Partial<OpCore>, keyPrefix: string, defaultAccount = ''): OpFields {
  let type: OpType = initial.type ?? 'expense';
  // The last account used, or the first one: an operation with no account is the exception.
  const usable = (id: string): boolean => accountOf(state, id)?.archivedAt === undefined && !!accountOf(state, id);
  const fallback = activeAccounts(state).find((a) => a.kind === 'asset')?.id ?? '';
  // An operation being edited has its amount; a new one has none.
  let accountId = initial.amount !== undefined ? (initial.accountId ?? '') : usable(defaultAccount) ? defaultAccount : fallback;
  let toAccountId = initial.toAccountId ?? '';
  let currency = initial.currency ?? state.base;
  let listener: () => void = () => undefined;

  const currencyNow = (): string => accountOf(state, accountId)?.currency ?? currency;
  const toCurrency = (): string | undefined => accountOf(state, toAccountId)?.currency;
  const amount = amountField({
    value: initial.amount !== undefined ? formatInput(initial.amount, decimalsOf(state, currencyNow())) : '',
    decimals: () => decimalsOf(state, currencyNow()),
    key: `${keyPrefix}-amount`,
    label: t('op', 'Amount'),
    placeholder: '0',
  });
  const amountTo = amountField({
    value: initial.amountTo !== undefined ? formatInput(initial.amountTo, decimalsOf(state, toCurrency() ?? currency)) : '',
    decimals: () => decimalsOf(state, toCurrency() ?? currency),
    key: `${keyPrefix}-amount-to`,
    label: t('op', 'Credited'),
  });

  const accountPicker = select(accountOptions(state, t('op', 'No account')), accountId, (id) => {
    accountId = id;
    sync();
  }, { key: `${keyPrefix}-account`, 'aria-label': t('op', 'Account') });
  const fromPicker = select(accountOptions(state, null), accountId, (id) => {
    accountId = id;
    sync();
  }, { key: `${keyPrefix}-from`, 'aria-label': t('op', 'From') });
  const toPicker = select(accountOptions(state, null), toAccountId, (id) => {
    toAccountId = id;
    sync();
  }, { key: `${keyPrefix}-to`, 'aria-label': t('op', 'To') });
  const currencyPicker = select(currencyOptions(state), currency, (code) => {
    currency = code;
    sync();
  }, { key: `${keyPrefix}-currency`, 'aria-label': t('op', 'Currency') });

  const unit = h('span', { class: 'amount-unit muted' });
  const accountRow = field(t('op', 'Account'), accountPicker);
  const currencyRow = field(t('op', 'Currency'), currencyPicker);
  const fromRow = field(t('op', 'From'), fromPicker);
  const toRow = field(t('op', 'To'), toPicker);
  const toUnit = h('span', { class: 'amount-unit muted' });
  const amountToRow = field(t('op', 'Credited there'), h('span', { class: 'with-unit' }, amountTo.element, toUnit));
  const debtHint = h('p', { class: 'field-hint hint-box' }, t('op', 'Interest is not modelled: add it as a recurring expense, and the repayment of the debt itself as a transfer like this one.'));

  function sync(): void {
    const isTransfer = type === 'transfer';
    if (isTransfer && !accountId) accountId = fromPicker.value;
    if (isTransfer && (!toAccountId || toAccountId === accountId)) {
      toAccountId = [...toPicker.options].map((o) => o.value).find((v) => v !== accountId) ?? '';
    }
    fromPicker.value = accountId;
    toPicker.value = toAccountId;
    accountPicker.value = accountId;
    accountRow.hidden = isTransfer;
    fromRow.hidden = !isTransfer;
    toRow.hidden = !isTransfer;
    // With an account, the currency is the account's.
    currencyRow.hidden = isTransfer || !!accountId;
    const to = toCurrency();
    amountToRow.hidden = !isTransfer || !to || to === currencyNow();
    debtHint.hidden = !isTransfer || accountOf(state, toAccountId)?.kind !== 'debt';
    unit.textContent = currencyNow();
    toUnit.textContent = to ?? '';
    listener();
  }

  const typePicker = segmented<OpType>([
    ['expense', t('op', 'Expense')],
    ['income', t('op', 'Income')],
    ['transfer', t('op', 'Transfer')],
  ], type, (next) => {
    type = next;
    sync();
  }, t('op', 'Type'), `${keyPrefix}-type`);

  const element = h('div', { class: 'op-fields' },
    typePicker,
    h('div', { class: 'grid-2' },
      field(t('op', 'Amount'), h('span', { class: 'with-unit' }, amount.element, unit)),
      accountRow, fromRow),
    h('div', { class: 'grid-2' }, currencyRow, toRow, amountToRow),
    debtHint);
  sync();

  const read = (): OpCore | null => {
    const value = amount.read();
    if (value === null || value === 0) {
      amount.invalid(true);
      amount.input.focus();
      return null;
    }
    const out: OpCore = { type, amount: value, currency: currencyNow() };
    if (type === 'transfer') {
      if (!accountId || !toAccountId || accountId === toAccountId) {
        toPicker.classList.add('invalid');
        return null;
      }
      out.accountId = accountId;
      out.toAccountId = toAccountId;
      if (!amountToRow.hidden) {
        const credited = amountTo.read();
        if (credited === null || credited === 0) {
          amountTo.invalid(true);
          amountTo.input.focus();
          return null;
        }
        out.amountTo = credited;
      }
    } else if (accountId) out.accountId = accountId;
    return out;
  };

  return {
    element,
    read,
    amount,
    type: () => type,
    inputs: () => [amount.input, ...(amountToRow.hidden ? [] : [amountTo.input])],
    onChange: (l) => void (listener = l),
  };
}
