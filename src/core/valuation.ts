/**
 * What the accounts are worth in the base currency.
 *
 *   asset = balance × rate × (1 − fee/100)
 *   debt  = owed    × rate × (1 + fee/100)
 *
 * A fee makes a debt larger, not smaller: paying back a debt held in another
 * currency, or through someone in between, costs that much more. Money that
 * belongs to no account, and the amounts of goals, convert at the bare rate.
 */
import { type Account, type Kind, type State, currencyOf, decimalsOf } from './state';
import { toMajor } from './money';

/** 1 unit of `code` in the base currency; 0 for a currency the list lacks. */
export function rateOf(state: State, code: string): number {
  if (code === state.base) return 1;
  return currencyOf(state, code)?.rate ?? 0;
}

export const assetValue = (balance: number, decimals: number, rate: number, fee: number): number =>
  toMajor(balance, decimals) * rate * (1 - fee / 100);

export const debtValue = (owed: number, decimals: number, rate: number, fee: number): number =>
  toMajor(owed, decimals) * rate * (1 + fee / 100);

/**
 * Balances are kept "signed" wherever they are summed: an asset's as it is, a
 * debt's as minus what is owed, so a payment into a debt moves it towards zero.
 */
export const signed = (kind: Kind, balance: number): number => (kind === 'debt' ? -balance : balance);

/** What one minor unit of a signed balance adds to the personal money, in the base currency. */
export function unitValue(kind: Kind, decimals: number, rate: number, fee: number): number {
  return kind === 'debt' ? debtValue(1, decimals, rate, fee) : assetValue(1, decimals, rate, fee);
}

/** The bare conversion: no fee, for money outside accounts and for goals. */
export const convert = (state: State, minor: number, code: string): number => toMajor(minor, decimalsOf(state, code)) * rateOf(state, code);

export interface Totals {
  /** Money on the accounts, after fees. */
  assets: number;
  /** All debts, fees included, positive. */
  debts: number;
  personal: number;
}

export interface AccountLine {
  account: Account;
  /** As the person sees it: a debt's is what is owed. */
  balance: number;
  value: number;
}

export interface CurrencyGroup {
  currency: string;
  kind: Kind;
  /** In the currency's minor units. */
  total: number;
  value: number;
  lines: AccountLine[];
}

export interface Valuation extends Totals {
  groups: CurrencyGroup[];
}

/** The accounts given with their balances (debts as owed), grouped by kind and currency. */
export function valuate(state: State, accounts: Account[], balances: ReadonlyMap<string, number>): Valuation {
  const groups = new Map<string, CurrencyGroup>();
  let assets = 0;
  let debts = 0;
  for (const account of accounts) {
    const balance = balances.get(account.id) ?? 0;
    const decimals = decimalsOf(state, account.currency);
    const rate = rateOf(state, account.currency);
    const value = account.kind === 'debt' ? debtValue(balance, decimals, rate, account.fee) : assetValue(balance, decimals, rate, account.fee);
    if (account.kind === 'debt') debts += value;
    else assets += value;
    const key = `${account.kind}:${account.currency}`;
    let group = groups.get(key);
    if (!group) {
      group = { currency: account.currency, kind: account.kind, total: 0, value: 0, lines: [] };
      groups.set(key, group);
    }
    group.total += balance;
    group.value += value;
    group.lines.push({ account, balance, value });
  }
  return { assets, debts, personal: assets - debts, groups: [...groups.values()] };
}
