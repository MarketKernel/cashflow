/** The accounts in the base currency, with the fees: section 3.2 of the task, the numbers of section 4. */
import { checker, load } from '../tools/load.mjs';
import { near, sampleState } from './fixture.mjs';

const { check, done } = checker();
const C = await load('core/state', 'core/valuation');

const state = sampleState(C);
const balances = new Map(state.accounts.map((a) => [a.id, a.opening]));
const v = C.valuate(state, state.accounts, balances);
const wise = v.groups.find((g) => g.currency === 'USD' && g.kind === 'asset');

check('Wise = 1000 × 41.5 × 0.99 = 41 085', near(wise.value, 41085), true);
check('assets = 83 585', near(v.assets, 83585), true);
check('debts = 23 300', near(v.debts, 23300), true);
check('personal = 60 285', near(v.personal, 60285), true);
check('groups by kind and currency', v.groups.map((g) => `${g.kind}:${g.currency}`), ['asset:UAH', 'asset:USD', 'asset:EUR', 'debt:UAH', 'debt:USD']);
check('a group total in its own currency', wise.total, 100000);

const friend = state.accounts.find((a) => a.id === 'friend');
friend.fee = 2;
const withFee = C.valuate(state, state.accounts, balances);
check('Friend at a 2 % fee: 200 × 41.5 × 1.02 = 8 466', near(withFee.groups.find((g) => g.kind === 'debt' && g.currency === 'USD').value, 8466), true);
check('a fee makes a debt larger', withFee.debts > v.debts, true);

check('the base rate is 1', C.rateOf(state, 'UAH'), 1);
check('an unknown currency is worth nothing, not NaN', C.rateOf(state, 'XYZ'), 0);
check('bare conversion: 100 USD', near(C.convert(state, 10000, 'USD'), 4150), true);
check('signed: a debt is minus what is owed', C.signed('debt', 500), -500);

done('valuation');
