/** The forecast and the goals: sections 3.6, 3.7 and 2.4 of the task. */
import { checker, load } from '../tools/load.mjs';
import { at, monoState, near, round2, sampleState } from './fixture.mjs';

const { check, done } = checker();
const C = await load('core/state', 'core/reconcile', 'core/forecast', 'core/goals');

const NOW = at(2026, 10, 7, 10);
const day = 86400000;

check('no reconciliation, no forecast', C.forecast(sampleState(C), NOW), null);

// The accounts of section 4, reconciled just now.
const state = sampleState(C);
state.reconciliations.push(C.reconcile(state, new Map(state.accounts.map((a) => [a.id, a.opening])), NOW, 'r1'));
const flat = C.forecast(state, NOW);
check('expected now: personal 60 285', near(flat.current.personal, 60285), true);
check('expected now: on the accounts 83 585', near(flat.current.assets, 83585), true);
check('nothing moves: never zero', [flat.assetsZero, flat.personalZero], [null, null]);
check('nothing moves: 0 a month', near(flat.perMonth, 0), true);
check('a point a day for five years', flat.points.length, 1827);
check('the last point is the horizon', flat.points.at(-1).at, new Date(2031, 9, 7, 10).getTime());
check('points keep the clock time across the change to winter time', new Date(flat.points[20].at).getHours(), 10);
check('the last reconciliation at today\'s rates', near(C.reconciledNow(state), 60285), true);

// Goals against that personal money.
const laptop = { id: 'g', name: 'Laptop', amount: 4000000, currency: 'UAH', rule: { kind: 'margin', margin: 3000000 }, order: 0 };
const a = C.goalStatus(state, laptop, flat);
check('margin: threshold 70 000', near(a.threshold, 70000), true);
check('margin: 9 715 lacking', near(a.lacking, 9715), true);
check('margin: not within the horizon when nothing grows', a.when, null);
const b = C.goalStatus(state, { ...laptop, rule: { kind: 'share', percent: 50 } }, flat);
check('share 50 %: threshold 80 000', near(b.threshold, 80000), true);
check('share 50 %: 75.36 %', round2(b.progress), 75.36);
check('a cheap goal: now', C.goalStatus(state, { ...laptop, amount: 100000, rule: { kind: 'margin', margin: 0 } }, flat).when, 'now');
const dollars = C.threshold(state, { ...laptop, amount: 100000, currency: 'USD', rule: { kind: 'margin', margin: 10000 } });
check('a goal in dollars converts at the bare rate', near(dollars, 1100 * 41.5), true);

// A salary makes it grow, and the goal gets a date.
{
  const s = structuredClone(state);
  s.recurring.push({ id: 'pay', seriesId: 'pay', type: 'income', name: 'Salary', amount: 5000000, accountId: 'mono', currency: 'UAH', schedule: { every: 'month', time: '00:00', day: 10 }, validFrom: NOW });
  const f = C.forecast(s, NOW);
  check('growing: never zero', f.assetsZero, null);
  check('growing: +50 000 a month', near(f.perMonth, 50000, 1), true);
  const when = C.goalStatus(s, laptop, f).when;
  check('the goal can be bought on the first salary day', when, at(2026, 10, 10));
}

// Spending runs it out: the last day there is money, to the payment.
{
  const s = monoState(C);
  s.forecast.includeUnaccounted = false;
  const R2 = at(2026, 10, 8, 10);
  s.reconciliations.push(C.reconcile(s, new Map([['mono', 2140000]]), R2, 'r'));
  s.recurring.push({ id: 'food', seriesId: 'food', type: 'expense', name: 'Food', amount: 30000, accountId: 'mono', currency: 'UAH', schedule: { every: 'day', time: '09:00' }, validFrom: R2 });
  const f = C.forecast(s, R2);
  check('21 400 at −300 a day: zero at the 72nd payment, 19 Dec 09:00', f.assetsZero, at(2026, 12, 19, 9));
  check('personal money runs out at the same moment with no debts', f.personalZero, f.assetsZero);
  check('falling: −9 131 a month', round2(f.perMonth) < 0, true);

  // With a debt, personal money runs out first.
  s.accounts.push({ id: 'loan', name: 'Loan', kind: 'debt', currency: 'UAH', fee: 0, opening: 1000000, createdAt: R2 - 1000, order: 1 });
  s.reconciliations = [C.reconcile(s, new Map([['mono', 2140000], ['loan', 1000000]]), R2, 'r')];
  const g = C.forecast(s, R2);
  check('with a 10 000 debt: personal money at the 38th payment', g.personalZero, at(2026, 11, 15, 9));
  check('… the accounts still on 19 Dec', g.assetsZero, at(2026, 12, 19, 9));
}

// The section 4 interval with the pace of unaccounted spending.
{
  const s = monoState(C);
  const R1 = at(2026, 10, 1, 10);
  const R2 = at(2026, 10, 8, 10);
  s.reconciliations.push(C.reconcile(s, new Map([['mono', 2000000]]), R1, 'r1'));
  s.recurring.push({ id: 'food', seriesId: 'food', type: 'expense', name: 'Food', amount: 30000, accountId: 'mono', currency: 'UAH', schedule: { every: 'day', time: '09:00' }, validFrom: R1 });
  s.oneOff.push({ id: 'bonus', type: 'income', at: at(2026, 10, 3), amount: 500000, accountId: 'mono', currency: 'UAH', note: '' });
  s.reconciliations.push(C.reconcile(s, new Map([['mono', 2140000]]), R2, 'r2'));
  const later = R2 + 2 * day;
  const f = C.forecast(s, later);
  check('the pace is used: −214.29 a day', round2(f.pace), -214.29);
  check('expected now, two days on: 21 400 − 2 × 300 − 2 × 214.29', round2(f.current.personal), round2(21400 - 600 - 1500 / 7 * 2));
  s.forecast.includeUnaccounted = false;
  check('… or without the pace', round2(C.forecast(s, later).current.personal), 20800);
  s.forecast.includeUnaccounted = true;
  // Unaccounted income is not counted on.
  s.reconciliations[1] = C.reconcile(s, new Map([['mono', 2500000]]), R2, 'r2');
  check('unaccounted income: no pace', C.forecast(s, later).pace, 0);
}

// Planned one-offs are in the forecast, past ones in "expected now".
{
  const s = structuredClone(state);
  s.oneOff.push({ id: 'car', type: 'expense', at: NOW + 30 * day, amount: 7000000, accountId: 'mono', currency: 'UAH', note: 'Car' });
  s.oneOff.push({ id: 'gift', type: 'income', at: NOW + day / 2, amount: 100000, currency: 'USD', note: 'Gift' });
  const f = C.forecast(s, NOW + day);
  check('a past one-off with no account: in expected now', near(f.current.personal, 60285 + 41500), true);
  check('a planned purchase: personal money after it', near(f.points.at(-1).personal, 60285 + 41500 - 70000), true);
}

// Ten operations, five years: well under 50 ms.
{
  const s = structuredClone(state);
  for (let i = 0; i < 10; i += 1) {
    const every = ['day', 'week', 'month', 'year'][i % 4];
    s.recurring.push({ id: `op${i}`, seriesId: `op${i}`, type: i % 3 ? 'expense' : 'income', name: `Op ${i}`, amount: 1000 + i, accountId: i % 2 ? 'mono' : undefined, currency: i % 2 ? 'UAH' : 'USD',
      schedule: { every, time: '08:00', weekday: 1, day: 15, month: 6 }, validFrom: NOW - 30 * day });
  }
  C.forecast(s, NOW);
  const started = performance.now();
  for (let i = 0; i < 5; i += 1) C.forecast(s, NOW);
  const took = (performance.now() - started) / 5;
  check(`five years, ten operations: ${took.toFixed(1)} ms < 50 ms`, took < 50, true);
}

done('forecast');
