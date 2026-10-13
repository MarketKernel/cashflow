/**
 * A household's worth of data for screenshots and browser tests: the accounts
 * of the task's section 4, a salary, rent, food and a card payment, three
 * reconciliations with a little unaccounted spending, a planned purchase and
 * two goals. Built with the core itself, so the reconciliations hold exactly
 * what the page would have stored.
 */
import { load } from './load.mjs';

const DAY = 86400000;

export async function sampleDocument(now = Date.now()) {
  const C = await load('core/state', 'core/reconcile');
  const day = (n, h = 10) => {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, h).getTime();
  };
  const created = day(-60);
  const state = C.emptyState('UAH', created);
  state.currencies.push({ code: 'USD', rate: 41.5, decimals: 2, updatedAt: day(-3) }, { code: 'EUR', rate: 45, decimals: 2, updatedAt: day(-40) });
  const account = (id, name, kind, currency, fee, opening, order) => ({ id, name, kind, currency, fee, opening, createdAt: created, order });
  state.accounts.push(
    account('mono', 'Monobank', 'asset', 'UAH', 0, 2000000, 0),
    account('privat', 'PrivatBank', 'asset', 'UAH', 0, 850000, 1),
    account('wise', 'Wise', 'asset', 'USD', 1, 100000, 2),
    account('cash', 'Cash', 'asset', 'EUR', 0, 50000, 3),
    account('card', 'Credit card', 'debt', 'UAH', 0, 1500000, 4),
    account('friend', 'Friend', 'debt', 'USD', 0, 20000, 5),
  );
  const recurring = (id, type, name, amount, schedule, extra = {}) => ({ id, seriesId: id, type, name, amount, currency: 'UAH', accountId: 'mono', schedule, validFrom: created + 1, ...extra });
  state.recurring.push(
    recurring('salary', 'income', 'Salary', 6500000, { every: 'month', time: '00:00', day: 5 }),
    recurring('rent', 'expense', 'Rent', 1800000, { every: 'month', time: '00:00', day: 1 }),
    recurring('food', 'expense', 'Food', 45000, { every: 'day', time: '20:00' }),
    recurring('gym', 'expense', 'Gym', 90000, { every: 'month', time: '00:00', day: 'last' }),
    recurring('music', 'expense', 'Music', 1099, { every: 'month', time: '00:00', day: 12 }, { currency: 'USD', accountId: 'wise' }),
    recurring('lessons', 'expense', 'Lessons', 60000, { every: 'week', time: '18:00', weekday: 3 }),
    recurring('insurance', 'expense', 'Car insurance', 1200000, { every: 'year', time: '00:00', month: 3, day: 15 }),
    recurring('payoff', 'transfer', 'Card payment', 300000, { every: 'month', time: '00:00', day: 6 }, { toAccountId: 'card' }),
  );
  const balances = new Map(state.accounts.map((a) => [a.id, a.opening]));
  state.reconciliations.push(C.reconcile(state, balances, day(-45), 'r1'));
  const settle = (at, id, shift) => {
    const e = C.expect(state, at);
    const entered = new Map(state.accounts.map((a) => [a.id, C.expectedBalance(e, a) + (shift[a.id] ?? 0)]));
    state.reconciliations.push(C.reconcile(state, entered, at, id));
  };
  state.oneOff.push(
    { id: 'o1', type: 'expense', at: day(-38, 14), amount: 420000, accountId: 'privat', currency: 'UAH', note: 'Shoes' },
    { id: 'o2', type: 'income', at: day(-20, 12), amount: 30000, accountId: 'wise', currency: 'USD', note: 'Freelance' },
  );
  settle(day(-30), 'r2', { mono: -310000, cash: -4000 });
  state.oneOff.push({ id: 'o3', type: 'expense', at: day(-12, 9), amount: 250000, accountId: 'mono', currency: 'UAH', note: 'Dentist' });
  settle(day(-9), 'r3', { mono: -270000, privat: -50000 });
  state.oneOff.push(
    { id: 'o4', type: 'expense', at: day(-2, 19), amount: 120000, accountId: 'privat', currency: 'UAH', note: 'Dinner' },
    { id: 'o5', type: 'expense', at: day(40, 12), amount: 2500000, accountId: 'mono', currency: 'UAH', note: 'Holiday' },
    { id: 'o6', type: 'income', at: day(75, 12), amount: 2000000, accountId: 'mono', currency: 'UAH', note: 'Annual bonus' },
  );
  state.goals.push(
    { id: 'laptop', name: 'Laptop', amount: 4000000, currency: 'UAH', rule: { kind: 'margin', margin: 3000000 }, order: 0 },
    { id: 'bike', name: 'Bike', amount: 80000, currency: 'EUR', rule: { kind: 'share', percent: 20 }, order: 1 },
  );
  return C.sanitizeState(state, now);
}

export { DAY };
