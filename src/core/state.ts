/**
 * The whole state of the app, as the page holds it in memory and src/core/db.ts
 * writes it to SQLite, and how a document from anywhere — the database, an
 * imported JSON file, an older version — becomes a valid one.
 *
 * Amounts are integers in a currency's minor units (cents, kopiykas, satoshis);
 * floating point only appears when a value is turned into the base currency.
 * Times are milliseconds since the epoch.
 */

import { type PinHash, readPin } from './pin';

export const SCHEMA = 1;

export type Kind = 'asset' | 'debt';
export type OpType = 'income' | 'expense' | 'transfer';
export type Every = 'day' | 'week' | 'month' | 'year';

export interface Currency {
  code: string;
  /** 1 unit of this currency = rate units of the base; the base's own is 1. */
  rate: number;
  decimals: number;
  updatedAt: number;
}

export interface Account {
  id: string;
  name: string;
  kind: Kind;
  currency: string;
  /** Per cent lost when the money is turned into the base currency. */
  fee: number;
  /** The balance the account was created with; for a debt, what is owed (positive). */
  opening: number;
  createdAt: number;
  archivedAt?: number;
  order: number;
}

export interface Schedule {
  every: Every;
  /** HH:MM, local time. */
  time: string;
  /** 0 = Sunday … 6 = Saturday, as Date.getDay(). */
  weekday?: number;
  day?: number | 'last';
  /** 1 … 12. */
  month?: number;
}

export interface Recurring {
  id: string;
  /** The versions of one operation share it: an edit closes one version and opens the next. */
  seriesId: string;
  type: OpType;
  name: string;
  amount: number;
  /** What a transfer puts into the account it goes to, when the currencies differ. */
  amountTo?: number;
  accountId?: string;
  toAccountId?: string;
  currency: string;
  schedule: Schedule;
  validFrom: number;
  validTo?: number;
}

export interface OneOff {
  id: string;
  type: OpType;
  at: number;
  amount: number;
  amountTo?: number;
  accountId?: string;
  toAccountId?: string;
  currency: string;
  note: string;
}

export interface SnapshotAccount {
  id: string;
  name: string;
  kind: Kind;
  currency: string;
  fee: number;
  /** As entered: a debt's is what is owed, positive. */
  balance: number;
}

export interface SnapshotOccurrence {
  opId: string;
  name: string;
  at: number;
  currency: string;
  /** Signed: income +, expense −; a transfer is two of them. */
  amount: number;
}

/** A reconciliation: the real balances at a moment, never changed afterwards. */
export interface Reconciliation {
  id: string;
  at: number;
  base: string;
  rates: Record<string, number>;
  decimals: Record<string, number>;
  accounts: SnapshotAccount[];
  /** By currency, signed: assets +, debts −. */
  expected: Record<string, number>;
  actual: Record<string, number>;
  occurrences: SnapshotOccurrence[];
}

export type GoalRule = { kind: 'margin'; margin: number } | { kind: 'share'; percent: number };

export interface Goal {
  id: string;
  name: string;
  amount: number;
  currency: string;
  rule: GoalRule;
  order: number;
  doneAt?: number;
}

export interface ForecastSettings {
  includeUnaccounted: boolean;
  windowDays: number;
  horizonYears: number;
  remindDays: number;
}

export interface State {
  schema: typeof SCHEMA;
  base: string;
  currencies: Currency[];
  accounts: Account[];
  recurring: Recurring[];
  oneOff: OneOff[];
  reconciliations: Reconciliation[];
  goals: Goal[];
  forecast: ForecastSettings;
  /** The hash of the PIN asked when the database opens; none, no PIN. */
  pin?: PinHash;
}

export const DEFAULT_FORECAST: ForecastSettings = { includeUnaccounted: true, windowDays: 90, horizonYears: 5, remindDays: 14 };

/** Codes of 2–10 Latin letters and digits: USD, EUR, USDT, BTC. */
export const CURRENCY_CODE = /^[A-Z0-9]{2,10}$/;

/** Minor units a currency has when nothing says otherwise. */
export function defaultDecimals(code: string): number {
  if (code === 'BTC') return 8;
  if (code === 'ETH') return 8;
  if (['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'HUF'].includes(code)) return 0;
  return 2;
}

export function emptyState(base = 'USD', now = 0): State {
  return {
    schema: SCHEMA,
    base,
    currencies: [{ code: base, rate: 1, decimals: defaultDecimals(base), updatedAt: now }],
    accounts: [],
    recurring: [],
    oneOff: [],
    reconciliations: [],
    goals: [],
    forecast: { ...DEFAULT_FORECAST },
  };
}

/* ------------------------------------------------------------------ *
 * Reading a document: every field is checked, a broken one replaced by
 * its default, so a damaged or hand-edited file opens rather than fails.
 * ------------------------------------------------------------------ */

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const integer = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isSafeInteger(value) ? value : fallback);
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const optionalTime = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const optionalId = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
const optionalInteger = (value: unknown): number | undefined => (typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined);
const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  options.includes(value as T) ? (value as T) : fallback;
const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter(isObject) : []);
const code = (value: unknown): string | null => {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return CURRENCY_CODE.test(upper) ? upper : null;
};
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const OP_TYPES = ['income', 'expense', 'transfer'] as const;

/** Signed minor units by currency code. */
function amounts(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(value)) return out;
  for (const [key, amount] of Object.entries(value)) {
    const c = code(key);
    if (c && typeof amount === 'number' && Number.isSafeInteger(amount)) out[c] = amount;
  }
  return out;
}

function numbers(value: unknown, valid: (n: number) => boolean): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(value)) return out;
  for (const [key, n] of Object.entries(value)) {
    const c = code(key);
    if (c && typeof n === 'number' && Number.isFinite(n) && valid(n)) out[c] = n;
  }
  return out;
}

function schedule(value: unknown): Schedule {
  const raw = isObject(value) ? value : {};
  const every = oneOf(raw.every, ['day', 'week', 'month', 'year'] as const, 'month');
  const time = typeof raw.time === 'string' && TIME.test(raw.time) ? raw.time : every === 'day' ? '09:00' : '00:00';
  const out: Schedule = { every, time };
  if (every === 'week') out.weekday = clamp(integer(raw.weekday, 1), 0, 6);
  if (every === 'month') out.day = raw.day === 'last' ? 'last' : clamp(integer(raw.day, 1), 1, 31);
  if (every === 'year') {
    out.month = clamp(integer(raw.month, 1), 1, 12);
    out.day = clamp(integer(raw.day, 1), 1, 31);
  }
  return out;
}

/** The document as it is now, from whatever came in; never throws. */
export function sanitizeState(input: unknown, now = 0): State {
  const raw = migrate(input);
  const base = code(raw.base) ?? 'USD';

  const currencies: Currency[] = [];
  const known = new Set<string>();
  for (const item of list(raw.currencies)) {
    const c = code(item.code);
    if (!c || known.has(c)) continue;
    known.add(c);
    const rate = finite(item.rate, 1);
    currencies.push({
      code: c,
      rate: c === base ? 1 : rate > 0 ? rate : 1,
      decimals: clamp(integer(item.decimals, defaultDecimals(c)), 0, 12),
      updatedAt: finite(item.updatedAt, now),
    });
  }
  /** A reference to a currency the list lacks gets one, at rate 1, rather than a crash later. */
  const ensure = (value: unknown): string => {
    const c = code(value) ?? base;
    if (!known.has(c)) {
      known.add(c);
      currencies.push({ code: c, rate: 1, decimals: defaultDecimals(c), updatedAt: c === base ? now : 0 });
    }
    return c;
  };
  ensure(base);

  const accounts: Account[] = [];
  const accountIds = new Set<string>();
  for (const [index, item] of list(raw.accounts).entries()) {
    const id = optionalId(item.id);
    if (!id || accountIds.has(id)) continue;
    accountIds.add(id);
    const account: Account = {
      id,
      name: text(item.name, '?'),
      kind: oneOf(item.kind, ['asset', 'debt'] as const, 'asset'),
      currency: ensure(item.currency),
      fee: clamp(finite(item.fee, 0), 0, 100),
      opening: integer(item.opening, 0),
      createdAt: finite(item.createdAt, now),
      order: finite(item.order, index),
    };
    const archivedAt = optionalTime(item.archivedAt);
    if (archivedAt !== undefined) account.archivedAt = archivedAt;
    accounts.push(account);
  }
  const accountOf = (value: unknown): string | undefined => {
    const id = optionalId(value);
    return id && accountIds.has(id) ? id : undefined;
  };
  const currencyOfAccount = (id: string | undefined): string | undefined => accounts.find((a) => a.id === id)?.currency;

  /** The fields one-off and recurring operations share; null when the operation cannot stand. */
  const operation = (item: Raw) => {
    const id = optionalId(item.id);
    const amount = integer(item.amount, -1);
    if (!id || amount < 0) return null;
    const type = oneOf(item.type, OP_TYPES, 'expense');
    const accountId = accountOf(item.accountId);
    const toAccountId = type === 'transfer' ? accountOf(item.toAccountId) : undefined;
    // A transfer needs both ends; one that lost an account to a damaged file is dropped.
    if (type === 'transfer' && (!accountId || !toAccountId)) return null;
    const out: { id: string; type: OpType; amount: number; currency: string; accountId?: string; toAccountId?: string; amountTo?: number } = {
      id,
      type,
      amount,
      currency: currencyOfAccount(accountId) ?? ensure(item.currency),
    };
    if (accountId) out.accountId = accountId;
    if (toAccountId) out.toAccountId = toAccountId;
    const amountTo = optionalInteger(item.amountTo);
    if (type === 'transfer' && amountTo !== undefined && amountTo >= 0) out.amountTo = amountTo;
    return out;
  };

  const recurring: Recurring[] = [];
  const opIds = new Set<string>();
  for (const item of list(raw.recurring)) {
    const op = operation(item);
    if (!op || opIds.has(op.id)) continue;
    opIds.add(op.id);
    const entry: Recurring = {
      ...op,
      seriesId: optionalId(item.seriesId) ?? op.id,
      name: text(item.name),
      schedule: schedule(item.schedule),
      validFrom: finite(item.validFrom, now),
    };
    const validTo = optionalTime(item.validTo);
    if (validTo !== undefined) entry.validTo = validTo;
    recurring.push(entry);
  }

  const oneOff: OneOff[] = [];
  for (const item of list(raw.oneOff)) {
    const op = operation(item);
    if (!op || opIds.has(op.id)) continue;
    opIds.add(op.id);
    oneOff.push({ ...op, at: finite(item.at, now), note: text(item.note) });
  }

  const reconciliations: Reconciliation[] = [];
  const recIds = new Set<string>();
  for (const item of list(raw.reconciliations)) {
    const id = optionalId(item.id);
    const at = optionalTime(item.at);
    if (!id || at === undefined || recIds.has(id)) continue;
    recIds.add(id);
    const recBase = code(item.base) ?? base;
    reconciliations.push({
      id,
      at,
      base: recBase,
      rates: { ...numbers(item.rates, (n) => n > 0), [recBase]: 1 },
      decimals: numbers(item.decimals, (n) => Number.isInteger(n) && n >= 0 && n <= 12),
      accounts: list(item.accounts).flatMap((a, index, all) => {
        const accountId = optionalId(a.id);
        const c = code(a.currency);
        // An account twice in one snapshot (a hand-edited file) keeps its first line: SQLite allows one.
        if (!accountId || !c || all.findIndex((other) => other.id === accountId) !== index) return [];
        return [{
          id: accountId,
          name: text(a.name, '?'),
          kind: oneOf(a.kind, ['asset', 'debt'] as const, 'asset'),
          currency: c,
          fee: clamp(finite(a.fee, 0), 0, 100),
          balance: integer(a.balance, 0),
        }];
      }),
      expected: amounts(item.expected),
      actual: amounts(item.actual),
      occurrences: list(item.occurrences).flatMap((o) => {
        const c = code(o.currency);
        const amount = optionalInteger(o.amount);
        const when = optionalTime(o.at);
        if (!c || amount === undefined || when === undefined) return [];
        return [{ opId: text(o.opId), name: text(o.name), at: when, currency: c, amount }];
      }),
    });
  }
  reconciliations.sort((a, b) => a.at - b.at);

  const goals: Goal[] = [];
  const goalIds = new Set<string>();
  for (const [index, item] of list(raw.goals).entries()) {
    const id = optionalId(item.id);
    if (!id || goalIds.has(id)) continue;
    goalIds.add(id);
    const rule = isObject(item.rule) ? item.rule : {};
    const goal: Goal = {
      id,
      name: text(item.name, '?'),
      amount: Math.max(0, integer(item.amount, 0)),
      currency: ensure(item.currency),
      rule:
        rule.kind === 'share'
          ? { kind: 'share', percent: clamp(finite(rule.percent, 50), 0.01, 100) }
          : { kind: 'margin', margin: Math.max(0, integer(rule.margin, 0)) },
      order: finite(item.order, index),
    };
    const doneAt = optionalTime(item.doneAt);
    if (doneAt !== undefined) goal.doneAt = doneAt;
    goals.push(goal);
  }

  const forecast = isObject(raw.forecast) ? raw.forecast : {};
  const state: State = {
    schema: SCHEMA,
    base,
    currencies,
    accounts,
    recurring,
    oneOff,
    reconciliations,
    goals,
    forecast: {
      includeUnaccounted: typeof forecast.includeUnaccounted === 'boolean' ? forecast.includeUnaccounted : DEFAULT_FORECAST.includeUnaccounted,
      windowDays: clamp(integer(forecast.windowDays, DEFAULT_FORECAST.windowDays), 7, 3650),
      horizonYears: clamp(integer(forecast.horizonYears, DEFAULT_FORECAST.horizonYears), 1, 30),
      remindDays: clamp(integer(forecast.remindDays, DEFAULT_FORECAST.remindDays), 1, 365),
    },
  };
  // A broken hash is no PIN: the database opens rather than stays shut for good.
  const pin = readPin(raw.pin);
  if (pin) state.pin = pin;
  return state;
}

/* ------------------------------------------------------------------ *
 * Migrations: each takes a document of one schema to the next. A
 * document with no schema at all is the draft format of 0.0.x, where the
 * rates were one map and there were no forecast settings.
 * ------------------------------------------------------------------ */

const MIGRATIONS: Array<(doc: Raw) => Raw> = [
  // 0 → 1: `rates: { USD: 41.5 }` and `decimals: { USD: 2 }` became the list of currencies.
  (doc) => {
    const { rates, decimals, ...rest } = doc;
    const r = isObject(rates) ? rates : {};
    const d = isObject(decimals) ? decimals : {};
    const fromRates = Object.keys(r).map((key) => ({ code: key, rate: r[key], decimals: d[key], updatedAt: 0 }));
    // A document that only lost its schema field keeps the list it has.
    const currencies = Array.isArray(rest.currencies) ? rest.currencies : fromRates;
    return { ...rest, schema: 1, currencies, forecast: rest.forecast ?? { ...DEFAULT_FORECAST } };
  },
];

/** Brings a document of an older schema up to SCHEMA; a newer or unknown one is read as it is. */
export function migrate(input: unknown): Raw {
  let doc: Raw = isObject(input) ? input : {};
  let version = typeof doc.schema === 'number' && Number.isInteger(doc.schema) ? doc.schema : 0;
  while (version < SCHEMA) {
    const step = MIGRATIONS[version];
    if (!step) break;
    doc = step(doc);
    version += 1;
  }
  return doc;
}

/* ------------------------------------------------------------------ *
 * Small helpers the rest of the core shares.
 * ------------------------------------------------------------------ */

/** A random id; getRandomValues works where randomUUID does not (a page opened from disk). */
export function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function currencyOf(state: State, code: string): Currency | undefined {
  return state.currencies.find((c) => c.code === code);
}

export function decimalsOf(state: State, code: string): number {
  return currencyOf(state, code)?.decimals ?? defaultDecimals(code);
}

export function accountOf(state: State, id: string | undefined): Account | undefined {
  return id === undefined ? undefined : state.accounts.find((a) => a.id === id);
}

export const activeAccounts = (state: State): Account[] =>
  state.accounts.filter((a) => a.archivedAt === undefined).sort((a, b) => a.order - b.order);

/** Recurring operations in force at `now`, the ones the list shows. */
export const activeRecurring = (state: State, now: number): Recurring[] =>
  state.recurring.filter((op) => op.validTo === undefined || op.validTo > now);

/** Every currency some account, operation, goal or the base uses: those cannot be removed. */
export function usedCurrencies(state: State): Set<string> {
  const used = new Set<string>([state.base]);
  for (const a of state.accounts) used.add(a.currency);
  for (const op of state.recurring) used.add(op.currency);
  for (const op of state.oneOff) used.add(op.currency);
  for (const g of state.goals) used.add(g.currency);
  return used;
}

/**
 * A new base currency: every rate is divided by the new base's, so the ratios
 * between currencies stay — R'(x) = R(x) / R(new base). Reconciliations keep theirs.
 */
export function changeBase(state: State, next: string): State {
  const pivot = currencyOf(state, next)?.rate;
  if (!pivot || next === state.base) return state;
  return {
    ...state,
    base: next,
    currencies: state.currencies.map((c) => ({ ...c, rate: c.code === next ? 1 : c.rate / pivot })),
  };
}
