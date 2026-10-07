/**
 * The forecast: personal money and the money on the accounts, from the last
 * reconciliation through now to the horizon.
 *
 * It starts where the reconciliation form would: the last reconciled balances,
 * the opening balances of accounts created since, every movement since — and,
 * when the setting is on, the average pace of unaccounted spending for the
 * days since. That is "expected now". From there it goes on with the recurring
 * operations, the planned one-offs and the same pace of unaccounted spending.
 *
 * Values are linear in the balances, so each movement adds its own worth to
 * running totals: no full revaluation per step, five years of a daily
 * operation are a few thousand additions.
 */
import { flowsBetween } from './flows';
import { expect, lastReconciliation, unaccountedRate, type UnaccountedRate } from './reconcile';
import { DAY } from './schedule';
import { type Kind, type State, decimalsOf } from './state';
import { rateOf, signed, unitValue } from './valuation';

export interface Sample {
  at: number;
  /** Money on the accounts, in the base currency. */
  assets: number;
  /** Money on the accounts minus the debts. */
  personal: number;
}

export interface Forecast {
  /** The last reconciliation's moment: where the curve is anchored. */
  from: number;
  now: number;
  end: number;
  /** "Expected now". */
  current: Sample;
  /** One a day from now (the first) to the horizon (the last). */
  points: Sample[];
  /** The points and the moment after each movement, in order: what crossings are looked for in. */
  samples: Sample[];
  /** When the money on the accounts first reaches zero or less; null if not before the horizon. */
  assetsZero: number | null;
  personalZero: number | null;
  /** The average change of personal money a month, over the horizon. */
  perMonth: number;
  rate: UnaccountedRate;
  /** The pace of unaccounted money the forecast uses, per day; 0 when it is left out. */
  pace: number;
}

interface Holder {
  kind: Kind;
  /** The base-currency worth of one minor unit of the signed balance. */
  unit: number;
}

export function forecast(state: State, now: number): Forecast | null {
  const last = lastReconciliation(state);
  if (!last) return null;
  const endDate = new Date(now);
  endDate.setFullYear(endDate.getFullYear() + state.forecast.horizonYears);
  const end = endDate.getTime();

  const holders = new Map<string, Holder>();
  const holder = (id: string): Holder | undefined => {
    let found = holders.get(id);
    if (found) return found;
    const account = state.accounts.find((a) => a.id === id) ?? last.accounts.find((a) => a.id === id);
    if (!account) return undefined;
    found = { kind: account.kind, unit: unitValue(account.kind, decimalsOf(state, account.currency), rateOf(state, account.currency), account.fee) };
    holders.set(id, found);
    return found;
  };

  let assets = 0;
  let debts = 0;
  const move = (accountId: string | undefined, currency: string, amount: number): void => {
    const h = accountId === undefined ? undefined : holder(accountId);
    if (!h) {
      assets += (amount / 10 ** decimalsOf(state, currency)) * rateOf(state, currency);
      return;
    }
    // A debt's signed balance is minus what is owed: + to it is less debt.
    if (h.kind === 'debt') debts -= amount * h.unit;
    else assets += amount * h.unit;
  };

  // Expected now, as the reconciliation form has it.
  const expectation = expect(state, now);
  for (const [id, balance] of expectation.accounts) move(id, '', balance);
  for (const flow of expectation.flows) if (flow.accountId === undefined) move(undefined, flow.currency, flow.amount);

  const rate = unaccountedRate(state, now);
  // Unaccounted spending is projected; unaccounted income is not counted on.
  const pace = state.forecast.includeUnaccounted ? Math.min(rate.perDay, 0) : 0;
  const drift = (at: number): number => (pace * (at - last.at)) / DAY;
  const sample = (at: number): Sample => ({ at, assets: assets + drift(at), personal: assets - debts + drift(at) });

  let assetsZero: number | null = null;
  let personalZero: number | null = null;
  const samples: Sample[] = [];
  const record = (s: Sample): Sample => {
    samples.push(s);
    if (assetsZero === null && s.assets <= 0) assetsZero = s.at;
    if (personalZero === null && s.personal <= 0) personalZero = s.at;
    return s;
  };

  const current = record(sample(now));
  const points: Sample[] = [current];
  const future = flowsBetween(state, now, end);
  const start = new Date(now);
  let next = 0;
  for (let day = 1; ; day += 1) {
    // Calendar days, so a point stays at the same clock time across a clock change.
    const at = Math.min(
      end,
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + day, start.getHours(), start.getMinutes(), start.getSeconds()).getTime(),
    );
    while (next < future.length && future[next]!.at <= at) {
      const flow = future[next]!;
      move(flow.accountId, flow.currency, flow.amount);
      next += 1;
      // Several movements at one moment count as one: a salary and a rent paid at 00:00 cancel before anything is looked at.
      if (future[next]?.at !== flow.at && flow.at < at) record(sample(flow.at));
    }
    points.push(record(sample(at)));
    if (at >= end) break;
  }

  const months = state.forecast.horizonYears * 12;
  return {
    from: last.at,
    now,
    end,
    current,
    points,
    samples,
    assetsZero,
    personalZero,
    perMonth: (points.at(-1)!.personal - current.personal) / months,
    rate,
    pace,
  };
}

/** The first moment personal money is at least `threshold`; null if not before the horizon. */
export function firstReaching(f: Forecast, threshold: number): number | null {
  for (const s of f.samples) if (s.personal >= threshold) return s.at;
  return null;
}

/** The samples in [from, to], for a chart of that period. */
export const samplesBetween = (f: Forecast, from: number, to: number): Sample[] => f.samples.filter((s) => s.at >= from && s.at <= to);

/**
 * The last reconciliation's balances at today's rates and fees: "expected now"
 * minus this is what the operations and the pace changed since, without the
 * exchange rates' doing.
 */
export function reconciledNow(state: State): number | null {
  const last = lastReconciliation(state);
  if (!last) return null;
  let personal = 0;
  for (const a of last.accounts) {
    const account = state.accounts.find((x) => x.id === a.id);
    const fee = account?.fee ?? a.fee;
    personal += signed(a.kind, a.balance) * unitValue(a.kind, decimalsOf(state, a.currency), rateOf(state, a.currency), fee);
  }
  return personal;
}
