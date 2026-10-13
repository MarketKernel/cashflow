/**
 * Creating, editing, archiving and deleting an account or a debt.
 *
 * A new account starts with its balance at the moment it is created; that
 * balance is expected at the next reconciliation, so a new account is not
 * unaccounted income. The currency is chosen once: amounts are in its minor units.
 *
 * Archiving one with money left asks where the money goes — another account
 * (a transfer) or nowhere (an expense) — so the next reconciliation finds
 * nothing unaccounted. Only an account that is in no reconciliation can be
 * deleted outright, with the operations that only it knew.
 */
import { t, tn } from '../core/i18n';
import { formatInput } from '../core/money';
import { expect, expectedBalance } from '../core/reconcile';
import { type Account, type Kind, activeAccounts, decimalsOf, newId } from '../core/state';
import { convert, signed } from '../core/valuation';
import { h } from './dom';
import { money } from './format';
import { accountLabel, amountField, currencyOptions } from './inputs';
import { change, getState } from './store';
import { confirmDialog, dialog, enterMovesOn, field, segmented, select, toast } from './ui';

const parseFee = (text: string): number | null => {
  const value = Number(text.replace(',', '.').replace('%', '').trim() || '0');
  return Number.isFinite(value) && value >= 0 && value < 100 ? value : null;
};

export function openAccount(account: Account | null, kind: Kind = account?.kind ?? 'asset'): void {
  const state = getState();
  const isDebt = kind === 'debt';
  const name = h('input', { type: 'text', value: account?.name ?? '', key: 'account-name', autocomplete: 'off', placeholder: isDebt ? t('account', 'Credit card') : t('account', 'Bank card') });
  let currency = account?.currency ?? state.base;
  const currencyControl = account
    ? h('span', { class: 'static-value' }, account.currency)
    : select(currencyOptions(state), currency, (code) => void (currency = code), { key: 'account-currency' });
  const fee = h('input', { type: 'text', inputmode: 'decimal', value: account ? String(account.fee) : '0', key: 'account-fee', class: 'short-input' });
  // An overdrawn card starts below zero.
  const opening = amountField({ signed: true, decimals: () => decimalsOf(getState(), currency), key: 'account-opening', label: isDebt ? t('account', 'Owed now') : t('account', 'Balance now') });

  const body: Node[] = [
    field(t('account', 'Name'), name),
    h('div', { class: 'grid-2' },
      field(t('account', 'Currency'), currencyControl, account ? t('account', 'The currency of an account does not change.') : t('account', 'Other currencies are added in Settings.')),
      field(t('account', 'Fee, %'), fee, isDebt ? t('account', 'Paying it back costs this much more.') : t('account', 'Lost when turning it into the base currency.'))),
  ];
  if (!account) {
    body.push(field(isDebt ? t('account', 'Owed now') : t('account', 'Balance now'), opening.element,
      isDebt ? null : t('account', 'If the money came from another account, also add a transfer on the One-off tab — otherwise it is counted twice.')));
  }

  const save = (): boolean => {
    const title = name.value.trim();
    const feeValue = parseFee(fee.value);
    if (!title) {
      name.classList.add('invalid');
      name.focus();
      return false;
    }
    if (feeValue === null) {
      fee.classList.add('invalid');
      fee.focus();
      return false;
    }
    if (account) {
      change((s) => {
        const target = s.accounts.find((a) => a.id === account.id);
        if (target) Object.assign(target, { name: title, fee: feeValue });
      });
      return true;
    }
    const balance = opening.input.value.trim() === '' ? 0 : opening.read();
    if (balance === null) {
      opening.invalid(true);
      opening.input.focus();
      return false;
    }
    change((s) => void s.accounts.push({
      id: newId(), name: title, kind, currency, fee: feeValue, opening: balance, createdAt: Date.now(),
      order: Math.max(-1, ...s.accounts.map((a) => a.order)) + 1,
    }));
    toast(t('account', '{name} added', { name: title }));
    return true;
  };

  const actions: Parameters<typeof dialog>[2] = [];
  if (account) {
    const inHistory = state.reconciliations.some((r) => r.accounts.some((a) => a.id === account.id));
    if (!inHistory) actions.push({ label: t('account', 'Delete'), kind: 'danger', key: 'account-delete', run: () => void remove(account) });
    actions.push({ label: t('account', 'Archive'), key: 'account-archive', run: () => void archive(account) });
  }
  actions.push({ label: t('dialog', 'Cancel') }, { label: account ? t('dialog', 'Save') : t('account', 'Add'), kind: 'primary', key: 'account-save', run: save });

  const title = account ? account.name : isDebt ? t('account', 'New debt') : t('account', 'New account');
  const { element } = dialog(title, body, actions);
  enterMovesOn(account ? [name, fee] : [name, fee, opening.input], () => element.querySelector<HTMLButtonElement>('[data-key="account-save"]')?.click());
  name.focus();
}

async function remove(account: Account): Promise<void> {
  const ok = await confirmDialog(
    t('account', 'Delete {name}?', { name: account.name }),
    t('account', 'It is in no reconciliation, so it goes completely, with the operations that use it.'),
    t('account', 'Delete'),
    true,
  );
  if (!ok) return;
  change((s) => {
    const uses = (op: { accountId?: string; toAccountId?: string }): boolean => op.accountId === account.id || op.toAccountId === account.id;
    s.accounts = s.accounts.filter((a) => a.id !== account.id);
    s.recurring = s.recurring.filter((op) => !uses(op));
    s.oneOff = s.oneOff.filter((op) => !uses(op));
  });
  toast(t('account', '{name} deleted', { name: account.name }));
}

/**
 * Closes the account now. Money left on it is moved or written off first, and
 * what is planned on it later is removed, so nothing goes unaccounted: by the
 * next reconciliation it holds nothing and nothing more happens to it.
 */
function archive(account: Account): void {
  const now = Date.now();
  const state = getState();
  const left = expectedBalance(expect(state, now), account);
  const uses = (op: { accountId?: string; toAccountId?: string }): boolean => op.accountId === account.id || op.toAccountId === account.id;
  const planned = state.oneOff.filter((op) => uses(op) && op.at > now).length;
  const plannedNote = planned ? h('p', { class: 'warning' }, tn('account', '{count} operation planned on it is removed.', '{count} operations planned on it are removed.', planned)) : null;
  const close = (): void => {
    change((s) => {
      const target = s.accounts.find((a) => a.id === account.id);
      if (target) target.archivedAt = now;
      // Its recurring operations end with it, its planned ones go.
      for (const op of s.recurring) {
        if (uses(op) && (op.validTo === undefined || op.validTo > now)) op.validTo = now;
      }
      s.oneOff = s.oneOff.filter((op) => !(uses(op) && op.at > now));
    });
    toast(t('account', '{name} archived', { name: account.name }));
  };
  if (left === 0) {
    void confirmDialog(t('account', 'Archive {name}?', { name: account.name }),
      [t('account', 'It leaves the lists and the next reconciliation; its history stays.'), planned ? tn('account', '{count} operation planned on it is removed.', '{count} operations planned on it are removed.', planned) : ''].filter(Boolean).join(' '),
      t('account', 'Archive')).then((ok) => ok && close());
    return;
  }

  // What has to happen to the account's signed balance to bring it to zero: below zero, money leaves it;
  // above, money comes in — a debt being paid off, or an overdraft covered.
  const delta = -signed(account.kind, left);
  const incoming = delta > 0;
  const amount = Math.abs(delta);
  const others = activeAccounts(state).filter((a) => a.id !== account.id);
  let mode: 'transfer' | 'write-off' = others.length ? 'transfer' : 'write-off';
  let target = others[0]?.id ?? '';
  const targetOf = (): Account | undefined => getState().accounts.find((a) => a.id === target);
  const other = amountField({ decimals: () => decimalsOf(getState(), targetOf()?.currency ?? account.currency), key: 'archive-credited' });
  const otherRow = field(incoming ? t('account', 'Taken from there') : t('account', 'Credited there'), other.element);
  const suggest = (): void => {
    const to = targetOf();
    otherRow.hidden = !to || to.currency === account.currency;
    if (to && to.currency !== account.currency) {
      // A suggestion at today's rates; the person types what really moved.
      const s = getState();
      const value = convert(s, amount, account.currency) / (convert(s, 10 ** decimalsOf(s, to.currency), to.currency) || 1);
      other.input.value = formatInput(Math.round(value * 10 ** decimalsOf(s, to.currency)), decimalsOf(s, to.currency));
    }
  };
  const targetPicker = select(others.map((a) => [a.id, accountLabel(a)] as [string, string]), target, (id) => {
    target = id;
    suggest();
  }, { key: 'archive-target' });
  const transferPart = h('div', null, field(incoming ? t('account', 'From') : t('account', 'To'), targetPicker), otherRow);
  transferPart.hidden = mode !== 'transfer';
  suggest();

  dialog(t('account', 'Archive {name}', { name: account.name }), ([
    h('p', null, incoming
      ? t('account', '{amount} is still owed on it, by the records. What happened to it?', { amount: money(state, amount, account.currency) })
      : t('account', '{amount} is still on it, by the records. Where did it go?', { amount: money(state, amount, account.currency) })),
    others.length
      ? segmented<'transfer' | 'write-off'>([
          ['transfer', incoming ? t('account', 'Paid from another account') : t('account', 'Moved to another account')],
          ['write-off', incoming ? t('account', 'Forgiven') : t('account', 'Spent')],
        ], mode, (next) => {
          mode = next;
          transferPart.hidden = mode !== 'transfer';
        }, t('account', 'What happened'), 'archive-mode')
      : null,
    transferPart,
    plannedNote,
  ] as Array<HTMLElement | null>).filter((n): n is HTMLElement => n !== null), [
    { label: t('dialog', 'Cancel') },
    {
      label: t('account', 'Archive'), kind: 'primary', key: 'archive-confirm',
      run: () => {
        const to = targetOf();
        const note = t('account', 'Closing {name}', { name: account.name });
        if (mode === 'transfer' && to) {
          const same = to.currency === account.currency;
          const there = same ? amount : other.read();
          if (there === null || there === 0) {
            other.invalid(true);
            return false;
          }
          // Out of this account into the other, or out of the other into this one.
          change((s) => void s.oneOff.push(incoming
            ? { id: newId(), type: 'transfer', at: now, amount: there, ...(same ? {} : { amountTo: amount }), accountId: to.id, toAccountId: account.id, currency: to.currency, note }
            : { id: newId(), type: 'transfer', at: now, amount, ...(same ? {} : { amountTo: there }), accountId: account.id, toAccountId: to.id, currency: account.currency, note }));
        } else {
          change((s) => void s.oneOff.push({ id: newId(), type: incoming ? 'income' : 'expense', at: now, amount, accountId: account.id, currency: account.currency, note }));
        }
        close();
        return true;
      },
    },
  ]);
}
