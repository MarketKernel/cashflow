/** Reconciliation and unaccounted money: sections 3.4 and 3.5 of the task, the numbers of section 4. */
import { checker, load } from '../tools/load.mjs';
import { at, CREATED, monoState, round2, sampleState } from './fixture.mjs';

const { check, done } = checker();
const C = await load('core/state', 'core/reconcile');

const R1 = at(2026, 10, 1, 10);
const R2 = at(2026, 10, 8, 10);
const spend = (extra = {}) => ({
  id: 'daily', seriesId: 'daily', type: 'expense', name: 'Food', amount: 30000, accountId: 'mono', currency: 'UAH',
  schedule: { every: 'day', time: '09:00' }, validFrom: R1, ...extra,
});
const bonus = { id: 'bonus', type: 'income', at: at(2026, 10, 3), amount: 500000, accountId: 'mono', currency: 'UAH', note: 'Bonus' };

function example(op) {
  const state = monoState(C);
  state.reconciliations.push(C.reconcile(state, new Map([['mono', 2000000]]), R1, 'r1'));
  state.recurring.push(op);
  state.oneOff.push(bonus);
  return state;
}

// The first reconciliation has nothing before it.
{
  const state = monoState(C);
  const first = C.reconcile(state, new Map([['mono', 1900000]]), R1, 'r1');
  check('the first reconciliation: nothing unaccounted', C.unaccounted(first), 0);
  check('… and no operations in it', first.occurrences, []);
  check('… a copy of the account', first.accounts, [{ id: 'mono', name: 'Monobank', kind: 'asset', currency: 'UAH', fee: 0, balance: 1900000 }]);
}

// The example of section 4.
{
  const state = example(spend());
  const expectation = C.expect(state, R2);
  check('the form shows the expected balance: 22 900', C.expectedBalance(expectation, state.accounts[0]), 2290000);
  const second = C.reconcile(state, new Map([['mono', 2140000]]), R2, 'r2');
  check('expected = 20 000 − 7 × 300 + 5 000 = 22 900', second.expected, { UAH: 2290000 });
  check('actual = 21 400', second.actual, { UAH: 2140000 });
  check('unaccounted = −1 500', C.unaccounted(second), -1500);
  check('seven payments and the bonus are in it', [second.occurrences.length, second.occurrences.filter((o) => o.opId === 'daily').length], [8, 7]);
  state.reconciliations.push(second);
  const pace = C.unaccountedRate(state, R2);
  check('the pace: −1 500 / 7 = −214.29 a day', round2(pace.perDay), -214.29);
  check('… from one interval of 7 days', [pace.intervals, pace.days], [1, 7]);
  check('outside the window there is no pace', C.unaccountedRate(state, R2 + 91 * 86400000).perDay, 0);
}

// Removed on 5 October at 12:00: four payments.
{
  const state = example(spend({ validTo: at(2026, 10, 5, 12) }));
  const second = C.reconcile(state, new Map([['mono', 2140000]]), R2, 'r2');
  check('removed on 5 Oct: expected = 23 800', second.expected.UAH, 2380000);
  check('… unaccounted = −2 400', C.unaccounted(second), -2400);
}

// The same expense with no account: it still counts in the currency.
{
  const state = example(spend({ accountId: undefined }));
  const second = C.reconcile(state, new Map([['mono', 2140000]]), R2, 'r2');
  check('an operation with no account counts in its currency', C.unaccounted(second), -1500);
}

// A change of the exchange rate is not an expense.
{
  const state = C.emptyState('UAH', CREATED);
  state.currencies.push({ code: 'USD', rate: 41.5, decimals: 2, updatedAt: CREATED });
  state.accounts.push({ id: 'usd', name: 'Dollars', kind: 'asset', currency: 'USD', fee: 0, opening: 10000, createdAt: CREATED, order: 0 });
  state.reconciliations.push(C.reconcile(state, new Map([['usd', 10000]]), R1, 'r1'));
  state.currencies[1].rate = 42;
  const second = C.reconcile(state, new Map([['usd', 10000]]), R2, 'r2');
  check('USD 100 → 100 at 41.5 → 42: unaccounted 0', C.unaccounted(second), 0);
  check('… the snapshot keeps its rate', [state.reconciliations[0].rates.USD, second.rates.USD], [41.5, 42]);
}

// A new account brings its opening balance with it, not unaccounted income.
{
  const state = sampleState(C);
  const all = new Map(state.accounts.map((a) => [a.id, a.opening]));
  state.reconciliations.push(C.reconcile(state, all, R1, 'r1'));
  state.accounts.push({ id: 'new', name: 'Deposit', kind: 'asset', currency: 'UAH', fee: 0, opening: 1000000, createdAt: at(2026, 10, 4), order: 5 });
  const second = C.reconcile(state, new Map([...all, ['new', 1000000]]), R2, 'r2');
  check('a new account: nothing unaccounted', C.unaccounted(second), 0);
  check('… and it is in the snapshot', second.accounts.some((a) => a.id === 'new'), true);
}

// Archiving an account with money on it: transferred away, nothing is unaccounted.
{
  const state = sampleState(C);
  const all = new Map(state.accounts.map((a) => [a.id, a.opening]));
  state.reconciliations.push(C.reconcile(state, all, R1, 'r1'));
  const cash = state.accounts.find((a) => a.id === 'cash');
  cash.archivedAt = at(2026, 10, 5);
  state.currencies.find((c) => c.code === 'EUR');
  state.oneOff.push({ id: 't', type: 'transfer', at: at(2026, 10, 5), amount: 50000, amountTo: 2250000, accountId: 'cash', toAccountId: 'mono', currency: 'EUR', note: '' });
  all.delete('cash');
  all.set('mono', 2000000 + 2250000);
  const second = C.reconcile(state, all, R2, 'r2');
  check('an archived account is not in the new snapshot', second.accounts.some((a) => a.id === 'cash'), false);
  check('archived and transferred: nothing unaccounted', C.unaccounted(second), 0);
  check('… the euros are expected to be gone', [second.expected.EUR, second.actual.EUR], [0, 0]);
  // And the next interval no longer knows the account.
  state.reconciliations.push(second);
  const third = C.reconcile(state, all, R2 + 86400000, 'r3');
  check('the interval after: nothing unaccounted', C.unaccounted(third), 0);
}

// A transfer onto a debt makes the debt smaller.
{
  const state = sampleState(C);
  const all = new Map(state.accounts.map((a) => [a.id, a.opening]));
  state.reconciliations.push(C.reconcile(state, all, R1, 'r1'));
  state.oneOff.push({ id: 'pay', type: 'transfer', at: at(2026, 10, 2), amount: 500000, accountId: 'mono', toAccountId: 'card', currency: 'UAH', note: '' });
  const expectation = C.expect(state, R2);
  check('the card debt after paying 5 000 into it: 10 000 owed', C.expectedBalance(expectation, state.accounts.find((a) => a.id === 'card')), 1000000);
  check('… and Monobank has 15 000', C.expectedBalance(expectation, state.accounts.find((a) => a.id === 'mono')), 1500000);
  const second = C.reconcile(state, new Map([...all, ['mono', 1500000], ['card', 1000000]]), R2, 'r2');
  check('… nothing unaccounted', C.unaccounted(second), 0);
}

// Reconciliations are numbers, kept: nothing done to operations later changes them.
{
  const state = example(spend());
  const second = C.reconcile(state, new Map([['mono', 2140000]]), R2, 'r2');
  state.reconciliations.push(second);
  const before = JSON.stringify(state.reconciliations);
  state.recurring[0].validTo = R2 + 1000;
  state.accounts[0].name = 'Renamed';
  const changed = C.changeBase({ ...state, currencies: [...state.currencies, { code: 'USD', rate: 41.5, decimals: 2, updatedAt: 0 }] }, 'USD');
  check('history unchanged by an edit, a rename and a new base', JSON.stringify(changed.reconciliations), before);
  check('… still −1 500 in its own base', C.unaccounted(changed.reconciliations[1]), -1500);
  check('… shown in the new base through its own rates: none for USD there', C.inCurrentBase(changed, second, -1500), null);
  const pace = C.unaccountedRate(changed, R2);
  check('the pace in the new base: −1 500 UAH a week in dollars', round2(pace.perDay * 41.5), -214.29);
}

done('reconcile');
