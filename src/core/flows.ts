/**
 * Operations as movements of money: what each one does to which account, or
 * to which currency when it belongs to no account.
 *
 * Signs are those of signed balances (valuation.ts): income +, expense −; a
 * transfer is − in the account it leaves and + (the amount credited) in the
 * one it reaches. A transfer to a debt is + there, which brings the debt,
 * held as minus what is owed, towards zero.
 */
import { occurrences } from './schedule';
import { type OneOff, type Recurring, type State, accountOf } from './state';

export interface Flow {
  at: number;
  opId: string;
  name: string;
  /** Absent for money outside the accounts. */
  accountId?: string;
  currency: string;
  amount: number;
}

type Operation = Pick<OneOff, 'id' | 'type' | 'amount' | 'amountTo' | 'accountId' | 'toAccountId' | 'currency'>;

function movements(state: State, op: Operation, at: number, name: string): Flow[] {
  const from = accountOf(state, op.accountId);
  const currency = from?.currency ?? op.currency;
  const base = { at, opId: op.id, name };
  const own = (amount: number): Flow => (from ? { ...base, accountId: from.id, currency, amount } : { ...base, currency, amount });
  switch (op.type) {
    case 'income':
      return [own(op.amount)];
    case 'expense':
      return [own(-op.amount)];
    case 'transfer': {
      const to = accountOf(state, op.toAccountId);
      const out = [own(-op.amount)];
      if (to) {
        const credited = to.currency === currency ? op.amount : (op.amountTo ?? op.amount);
        out.push({ ...base, accountId: to.id, currency: to.currency, amount: credited });
      }
      return out;
    }
  }
}

export const oneOffName = (op: OneOff): string => op.note;

/** Every movement of every operation in (from, to], earliest first. */
export function flowsBetween(state: State, from: number, to: number): Flow[] {
  const out: Flow[] = [];
  for (const op of state.recurring) {
    for (const at of occurrences(op, from, to)) out.push(...movements(state, op, at, op.name));
  }
  for (const op of state.oneOff) {
    if (op.at > from && op.at <= to) out.push(...movements(state, op, op.at, oneOffName(op)));
  }
  return out.sort((a, b) => a.at - b.at);
}

/** One recurring operation's movements, for the forecast to sweep. */
export const recurringFlows = (state: State, op: Recurring, from: number, to: number): Flow[] =>
  occurrences(op, from, to).flatMap((at) => movements(state, op, at, op.name));

/** What a one-off operation moves, as the form shows before saving. */
export const oneOffFlows = (state: State, op: OneOff): Flow[] => movements(state, op, op.at, oneOffName(op));
