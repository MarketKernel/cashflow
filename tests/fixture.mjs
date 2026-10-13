/**
 * The numbers of the task (section 4), shared by the unit tests: base UAH,
 * USD = 41.5, EUR = 45; three accounts and two debts. They are fixed — a test
 * that needs other numbers builds its own state.
 *
 * Every test runs in Europe/Kyiv, where 25 October 2026 has 25 hours.
 */
process.env.TZ = 'Europe/Kyiv';

/** Local time, as the page builds it. */
export const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

export const CREATED = at(2026, 10, 1, 9);

export function sampleState(core) {
  const state = core.emptyState('UAH', CREATED);
  state.currencies.push({ code: 'USD', rate: 41.5, decimals: 2, updatedAt: CREATED }, { code: 'EUR', rate: 45, decimals: 2, updatedAt: CREATED });
  const account = (id, name, kind, currency, fee, opening, order) => ({ id, name, kind, currency, fee, opening, createdAt: CREATED, order });
  state.accounts.push(
    account('mono', 'Monobank', 'asset', 'UAH', 0, 2000000, 0),
    account('wise', 'Wise', 'asset', 'USD', 1, 100000, 1),
    account('cash', 'Cash', 'asset', 'EUR', 0, 50000, 2),
    account('card', 'Card', 'debt', 'UAH', 0, 1500000, 3),
    account('friend', 'Friend', 'debt', 'USD', 0, 20000, 4),
  );
  return state;
}

/** Only Monobank: the state of the unaccounted-money example. */
export function monoState(core) {
  const state = core.emptyState('UAH', CREATED);
  state.accounts.push({ id: 'mono', name: 'Monobank', kind: 'asset', currency: 'UAH', fee: 0, opening: 2000000, createdAt: CREATED, order: 0 });
  return state;
}

export const near = (a, b, epsilon = 1e-6) => Math.abs(a - b) < epsilon;
export const round2 = (n) => Math.round(n * 100) / 100;

/** The same value with every object's keys sorted: for comparing states built in different orders. */
export function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canon(value[k])]));
  return value;
}
