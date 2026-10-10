/**
 * Reconciliation: the person enters the real balances, and the difference
 * from what the recorded operations lead one to expect is the money that went
 * unrecorded.
 *
 * For each currency c and the interval (previous.at, now]:
 *
 *   expected_c = the previous reconciliation's balances in c (assets +, debts −)
 *              + the opening balances of accounts created since
 *              + every movement in c since (recurring and one-off)
 *   actual_c   = the balances entered now in c (assets +, debts −)
 *   unaccounted = Σ (actual_c − expected_c) × rate_c, no fees
 *
 * By currency and not by the total in the base: a change of the exchange rate
 * between two reconciliations is not an expense. An account archived in the
 * interval counts in expected_c with its balance and its movements and in
 * actual_c as zero — it is closed — so transferring or writing it off when
 * archiving leaves nothing unaccounted.
 *
 * A reconciliation stores what it found, as numbers; nothing done to the
 * operations later recomputes it.
 */
import { type Flow, flowsBetween } from './flows';
import { DAY } from './schedule';
import { type Account, type Reconciliation, type State, decimalsOf, newId } from './state';
import { rateOf, signed } from './valuation';

export const lastReconciliation = (state: State): Reconciliation | undefined => state.reconciliations.at(-1);

/** Where an account's expected balance starts from: a reconciled balance or its opening one. */
interface Start {
  account: Account;
  /** Signed. */
  balance: number;
  since: number;
}

/**
 * The accounts that existed at some point of (previous.at, now], each with its
 * starting balance: an account reconciled last time starts from that balance,
 * one created since from its opening balance. One that is in no reconciliation
 * though it is older than the last is one archived before it: it is gone.
 */
function starts(state: State, previous: Reconciliation | undefined): Start[] {
  const out: Start[] = [];
  for (const account of state.accounts) {
    const reconciled = previous?.accounts.find((a) => a.id === account.id);
    if (reconciled) {
      out.push({ account, balance: signed(account.kind, reconciled.balance), since: previous!.at });
      continue;
    }
    if (previous && account.createdAt <= previous.at) continue;
    if (account.archivedAt !== undefined && previous && account.archivedAt <= previous.at) continue;
    out.push({ account, balance: signed(account.kind, account.opening), since: Math.max(account.createdAt, previous?.at ?? -Infinity) });
  }
  return out;
}

export interface Expectation {
  /** By account id, signed — a debt's as minus what is owed. */
  accounts: Map<string, number>;
  /** By currency, signed. */
  currencies: Record<string, number>;
  flows: Flow[];
  previous: Reconciliation | undefined;
}

/** What the balances should be at `now`, from the last reconciliation and the operations since. */
export function expect(state: State, now: number): Expectation {
  const previous = lastReconciliation(state);
  const from = previous?.at ?? Math.min(...state.accounts.map((a) => a.createdAt), now);
  const flows = flowsBetween(state, from, now);
  const accounts = new Map<string, number>();
  const currencies: Record<string, number> = {};
  const add = (code: string, amount: number): void => {
    currencies[code] = (currencies[code] ?? 0) + amount;
  };
  const list = starts(state, previous);
  for (const { account, balance } of list) {
    accounts.set(account.id, balance);
    add(account.currency, balance);
  }
  const since = new Map(list.map((s) => [s.account.id, s.since]));
  for (const flow of flows) {
    if (flow.accountId === undefined) {
      // Money outside the accounts counts only after the last reconciliation — before the first one there is no interval.
      if (previous) add(flow.currency, flow.amount);
      continue;
    }
    const start = since.get(flow.accountId);
    if (start === undefined || flow.at <= start) continue;
    accounts.set(flow.accountId, (accounts.get(flow.accountId) ?? 0) + flow.amount);
    add(flow.currency, flow.amount);
  }
  return { accounts, currencies, flows, previous };
}

/** The balance a reconciliation form shows for an account, as the person sees it (a debt's as owed). */
export function expectedBalance(expectation: Expectation, account: Account): number {
  return signed(account.kind, expectation.accounts.get(account.id) ?? signed(account.kind, account.opening));
}

/**
 * The snapshot of a reconciliation at `now` with the balances entered for the
 * active accounts (debts as owed). The first one has nothing to compare
 * against: what it expects is what it finds.
 */
export function reconcile(state: State, entered: ReadonlyMap<string, number>, now: number, id = newId()): Reconciliation {
  const expectation = expect(state, now);
  const active = state.accounts.filter((a) => a.archivedAt === undefined || a.archivedAt > now).sort((a, b) => a.order - b.order);
  const actual: Record<string, number> = {};
  const accounts = active.map((account) => {
    const balance = entered.get(account.id) ?? expectedBalance(expectation, account);
    actual[account.currency] = (actual[account.currency] ?? 0) + signed(account.kind, balance);
    return { id: account.id, name: account.name, kind: account.kind, currency: account.currency, fee: account.fee, balance };
  });
  const expected = expectation.previous ? { ...expectation.currencies } : { ...actual };
  for (const code of Object.keys(actual)) expected[code] ??= 0;
  for (const code of Object.keys(expected)) actual[code] ??= 0;
  const rates: Record<string, number> = {};
  const decimals: Record<string, number> = {};
  for (const c of state.currencies) {
    rates[c.code] = rateOf(state, c.code);
    decimals[c.code] = c.decimals;
  }
  return {
    id,
    at: now,
    base: state.base,
    rates,
    decimals,
    accounts,
    expected,
    actual,
    occurrences: expectation.previous
      ? expectation.flows.map((f) => ({ opId: f.opId, name: f.name, at: f.at, currency: f.currency, amount: f.amount }))
      : [],
  };
}

/** actual − expected, by currency, in minor units. */
export function differences(rec: Reconciliation): Record<string, number> {
  const out: Record<string, number> = {};
  for (const code of new Set([...Object.keys(rec.expected), ...Object.keys(rec.actual)])) {
    out[code] = (rec.actual[code] ?? 0) - (rec.expected[code] ?? 0);
  }
  return out;
}

const decimalsIn = (state: State | null, rec: Reconciliation, code: string): number =>
  rec.decimals[code] ?? (state ? decimalsOf(state, code) : 2);

/** The unaccounted money of a reconciliation, in its own base currency, at its own rates. */
export function unaccounted(rec: Reconciliation): number {
  let sum = 0;
  for (const [code, diff] of Object.entries(differences(rec))) sum += (diff / 10 ** decimalsIn(null, rec, code)) * (rec.rates[code] ?? 0);
  return sum;
}

/**
 * The same at today's rates in today's base: for the average, so that a
 * change of base currency does not break it. A currency no longer listed
 * converts through the snapshot's rates when they hold today's base.
 */
export function unaccountedNow(state: State, rec: Reconciliation): number {
  const pivot = rec.rates[state.base];
  let sum = 0;
  for (const [code, diff] of Object.entries(differences(rec))) {
    const listed = state.currencies.some((c) => c.code === code);
    const rate = listed ? rateOf(state, code) : pivot ? (rec.rates[code] ?? 0) / pivot : 0;
    sum += (diff / 10 ** decimalsIn(state, rec, code)) * rate;
  }
  return sum;
}

/**
 * A value of a reconciliation (in its base) in today's base, through the
 * snapshot's own rates; null when the snapshot has no rate for today's base.
 */
export function inCurrentBase(state: State, rec: Reconciliation, value: number): number | null {
  if (rec.base === state.base) return value;
  const pivot = rec.rates[state.base];
  return pivot ? value / pivot : null;
}

export interface UnaccountedRate {
  /** In the base currency per day; 0 when there is no interval to learn from. */
  perDay: number;
  intervals: number;
  days: number;
}

/**
 *   rate_per_day = Σ unaccounted_i / Σ days_i
 * over the intervals between reconciliations that end within the window — the
 * window days up to the last reconciliation, not up to now: the pace stays
 * what it was until the next reconciliation, however long that takes. With
 * `after`, only the intervals that end after it count.
 */
export function unaccountedRate(state: State, now: number, after = -Infinity): UnaccountedRate {
  const recs = state.reconciliations.filter((r) => r.at <= now);
  const since = (recs.at(-1)?.at ?? now) - state.forecast.windowDays * DAY;
  let sum = 0;
  let length = 0;
  let intervals = 0;
  for (let i = 1; i < recs.length; i += 1) {
    const rec = recs[i]!;
    if (rec.at < since || rec.at <= after) continue;
    sum += unaccountedNow(state, rec);
    length += (rec.at - recs[i - 1]!.at) / DAY;
    intervals += 1;
  }
  return { perDay: length > 0 ? sum / length : 0, intervals, days: length };
}

/**
 * When spending outside the accounts was last planned: the latest start of a
 * recurring expense with no account still in force — what adding unaccounted
 * spending as a recurring expense creates. The intervals that ended before it
 * were unaccounted against a plan without it, so the pace is learnt from the
 * ones after; otherwise the same spending would be offered for adding again.
 */
export function plannedSince(state: State, now: number): number | undefined {
  let latest: number | undefined;
  for (const op of state.recurring) {
    if (op.type !== 'expense' || op.accountId !== undefined || (op.validTo !== undefined && op.validTo <= now)) continue;
    latest = Math.max(latest ?? -Infinity, op.validFrom);
  }
  return latest;
}

/** The values of a snapshot as it was: its balances, its fees, its rates. */
export function snapshotTotals(rec: Reconciliation): { assets: number; debts: number; personal: number } {
  let assets = 0;
  let debts = 0;
  for (const a of rec.accounts) {
    const value = (a.balance / 10 ** (rec.decimals[a.currency] ?? 2)) * (rec.rates[a.currency] ?? 0);
    if (a.kind === 'debt') debts += value * (1 + a.fee / 100);
    else assets += value * (1 - a.fee / 100);
  }
  return { assets, debts, personal: assets - debts };
}
