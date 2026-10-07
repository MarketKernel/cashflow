/** Amounts typed in, kept in minor units and shown in a language. */
import { checker, load } from '../tools/load.mjs';

const { check, done } = checker();
const M = await load('core/money');

check('"1 234,56" in kopiykas', M.parseAmount('1 234,56', 2), 123456);
check('"1200+350-50*2" is 1450.00', M.parseAmount('1200+350-50*2', 2), 145000);
check('"12,5.3" is no amount', M.parseAmount('12,5.3', 2), null);
check('a dot', M.parseAmount('99.95', 2), 9995);
check('a no-break space between thousands', M.parseAmount('1 000 000', 2), 100000000);
check('apostrophes between thousands', M.parseAmount("1'250'000.5", 2), 125000050);
check('brackets', M.parseAmount('(100 + 50) * 2', 2), 30000);
check('division rounds to the minor unit', M.parseAmount('100/3', 2), 3333);
check('a unary minus', M.parseAmount('-250', 2), -25000);
check('satoshis', M.parseAmount('0,12345678', 8), 12345678);
check('no decimals: rounded', M.parseAmount('12.6', 0), 13);
check('empty', M.parseAmount('', 2), null);
check('letters', M.parseAmount('12abc', 2), null);
check('division by zero', M.parseAmount('5/0', 2), null);
check('an unclosed bracket', M.parseAmount('(5+1', 2), null);
check('two operators', M.parseAmount('5+*1', 2), null);
check('a trailing operator', M.parseAmount('5+', 2), null);
check('the typographic minus and times', M.parseAmount('10×3−5', 2), 2500);
check('eval is not used', /\beval\(|new Function/.test(String(M.evaluate)), false);

check('input text: whole', M.formatInput(2000000, 2), '20000');
check('input text: fraction', M.formatInput(123450, 2), '1234.5');
check('input text: no decimals', M.formatInput(15, 0), '15');
check('input text: negative', M.formatInput(-5, 2), '-0.05');

const nbsp = (s) => s.replace(/[  ]/g, ' ');
check('ISO code: Intl currency style', nbsp(M.formatMinor(123456, 'USD', 2, 'en')), '$1,234.56');
check('USDT is the number and the code', nbsp(M.formatMinor(123456, 'USDT', 2, 'en')), '1,234.56 USDT');
check('BTC is not ISO: the number and the code', nbsp(M.formatMinor(12345678, 'BTC', 8, 'en')), '0.12345678 BTC');
check('the interface language: Ukrainian', nbsp(M.formatMinor(6028500, 'UAH', 2, 'uk')), '60 285,00 ₴');
check('a sign for differences', nbsp(M.formatMinor(150000, 'UAH', 2, 'en', { sign: true })).startsWith('+'), true);
check('no sign at zero', nbsp(M.formatMinor(0, 'UAH', 2, 'en', { sign: true })).startsWith('+'), false);
check('whole', nbsp(M.formatMajor(60285.4, 'USD', 2, 'en', { whole: true })), '$60,285');
check('no minus zero', nbsp(M.formatMajor(-0.001, 'USD', 2, 'en')), '$0.00');
let crashed = false;
try {
  M.formatMinor(100, 'USD', 2, 'not a locale!!');
  M.formatMinor(100, 'X', 2, 'en');
} catch {
  crashed = true;
}
check('an Intl RangeError does not throw', crashed, false);

done('money');
