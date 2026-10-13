/** Reading documents — damaged, imported, of an older schema — and changing the base currency. */
import { checker, load } from '../tools/load.mjs';
import { at, CREATED, sampleState } from './fixture.mjs';

const { check, done } = checker();
const C = await load('core/state', 'core/reconcile', 'core/forecast');

const sample = sampleState(C);
check('a valid document reads back as it is', C.sanitizeState(structuredClone(sample)), sample);
check('anything at all gives an empty state', C.sanitizeState('nonsense', 5), C.emptyState('USD', 5));

// A document of the 0.0.x draft: no schema, the rates as one map, no forecast settings.
const old = {
  base: 'UAH',
  rates: { UAH: 1, USD: 41.5, BTC: 4000000 },
  decimals: { BTC: 8 },
  accounts: [{ id: 'a', name: 'Cash', kind: 'asset', currency: 'USD', fee: 0, opening: 100, createdAt: 1, order: 0 }],
};
const migrated = C.sanitizeState(old, 9);
check('migrated: schema 1', migrated.schema, 1);
check('migrated: the rates became currencies', migrated.currencies.map((c) => [c.code, c.rate, c.decimals]), [['UAH', 1, 2], ['USD', 41.5, 2], ['BTC', 4000000, 8]]);
check('migrated: default forecast settings', migrated.forecast, C.DEFAULT_FORECAST);
check('migrated: the account kept', migrated.accounts.length, 1);
check('migrate() itself', C.migrate(old).schema, 1);
check('a current document is not migrated', C.migrate({ schema: 1, currencies: [] }).currencies, []);

// Damage is replaced by defaults, not thrown.
const broken = C.sanitizeState({
  schema: 1,
  base: 'uah',
  currencies: [{ code: 'UAH', rate: 7 }, { code: 'usd', rate: -3 }, { code: 'X', rate: 2 }, { code: 'USD', rate: 40 }, 'junk'],
  accounts: [
    { id: 'a', name: 5, kind: 'boat', currency: 'EUR', fee: 400, opening: 1.5, createdAt: 'x' },
    { id: 'a', name: 'duplicate' },
    { name: 'no id' },
  ],
  recurring: [
    { id: 'r', type: 'expense', amount: 100, currency: 'UAH', schedule: { every: 'fortnight', time: '25:99' } },
    { id: 't', type: 'transfer', amount: 100, accountId: 'a', toAccountId: 'gone', currency: 'UAH', schedule: { every: 'day' } },
    { id: 'neg', type: 'income', amount: -5, currency: 'UAH' },
  ],
  oneOff: [{ id: 'o', type: 'income', at: 5, amount: 100, accountId: 'gone', currency: 'GBP', note: null }],
  goals: [{ id: 'g', name: 'Car', amount: 100, currency: 'UAH', rule: { kind: 'share', percent: 900 } }],
  forecast: { includeUnaccounted: 'yes', windowDays: -4, horizonYears: 500, remindDays: 3 },
}, 77);
check('the base is upper-cased', broken.base, 'UAH');
check('the base rate is always 1; bad codes and rates are dropped or reset', broken.currencies.map((c) => [c.code, c.rate]), [['UAH', 1], ['USD', 1], ['EUR', 1], ['GBP', 1]]);
check('a broken account gets defaults', broken.accounts, [{ id: 'a', name: '?', kind: 'asset', currency: 'EUR', fee: 100, opening: 0, createdAt: 77, order: 0 }]);
check('a broken schedule gets a default', broken.recurring[0].schedule, { every: 'month', time: '00:00', day: 1 });
check('a transfer that lost an end is dropped; a negative amount too', broken.recurring.map((r) => r.id), ['r']);
check('a one-off with a lost account keeps its currency', [broken.oneOff[0].accountId, broken.oneOff[0].currency, broken.oneOff[0].note], [undefined, 'GBP', '']);
check('a goal share is at most 100 %', broken.goals[0].rule, { kind: 'share', percent: 100 });
check('forecast settings within their bounds', broken.forecast, { windowDays: 7, horizonYears: 30, remindDays: 3 });

// An account twice in one snapshot (SQLite takes one line per account) keeps its first line.
{
  const doubled = C.sanitizeState({ ...structuredClone(sample), reconciliations: [{ id: 'r', at: 5, base: 'UAH', rates: {}, decimals: {}, expected: {}, actual: {}, occurrences: [],
    accounts: [{ id: 'mono', name: 'Monobank', kind: 'asset', currency: 'UAH', fee: 0, balance: 1 }, { id: 'mono', name: 'Again', kind: 'asset', currency: 'UAH', fee: 0, balance: 2 }] }] });
  check('a snapshot account listed twice is kept once', doubled.reconciliations[0].accounts.map((a) => a.balance), [1]);
}

// The PIN's hash goes with the document; a broken one is no PIN.
const pin = { salt: '00112233445566778899aabbccddeeff', hash: 'ab'.repeat(32), iterations: 100000 };
check('a PIN hash reads back', C.sanitizeState({ ...structuredClone(sample), pin }).pin, pin);
check('none by default', 'pin' in C.sanitizeState(structuredClone(sample)), false);
check('a broken one is dropped', 'pin' in C.sanitizeState({ ...structuredClone(sample), pin: { salt: 'x', hash: 'y', iterations: 1 } }), false);

// Changing the base keeps the ratios.
const usd = C.changeBase(sample, 'USD');
const rate = (s, code) => s.currencies.find((c) => c.code === code).rate;
check('R\'(UAH) = 1 / 41.5', rate(usd, 'UAH'), 1 / 41.5);
check('R\'(EUR) = 45 / 41.5', rate(usd, 'EUR'), 45 / 41.5);
check('R\'(USD) = 1', rate(usd, 'USD'), 1);
check('personal money is the same, in dollars', Math.round(C.forecast({ ...usd, reconciliations: [C.reconcile(usd, new Map(usd.accounts.map((a) => [a.id, a.opening])), CREATED + 1, 'r')] }, CREATED + 2).current.personal * 41.5), 60285);
check('used currencies cannot be removed', [...C.usedCurrencies(sample)].sort(), ['EUR', 'UAH', 'USD']);
check('ids are random and long', C.newId() !== C.newId() && C.newId().length === 24, true);

// A one-off before the last reconciliation is in a closed period: it changes nothing.
{
  const s = structuredClone(sample);
  s.reconciliations.push(C.reconcile(s, new Map(s.accounts.map((a) => [a.id, a.opening])), at(2026, 10, 7), 'r'));
  const before = C.forecast(s, at(2026, 10, 8)).current.personal;
  s.oneOff.push({ id: 'late', type: 'expense', at: at(2026, 10, 6), amount: 100000, accountId: 'mono', currency: 'UAH', note: '' });
  check('a one-off in a closed period changes nothing', C.forecast(s, at(2026, 10, 8)).current.personal, before);
}

done('state');
