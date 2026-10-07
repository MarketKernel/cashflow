/** The PIN of a database: its hash, checking it, what a stored hash may be, and the pause after wrong tries. */
import { checker, load } from '../tools/load.mjs';

const { check, done } = checker();
const P = await load('core/pin');

check('WebCrypto is there', P.pinAvailable(), true);
check('4 digits are a PIN', P.PIN.test('1234'), true);
check('3 digits are not', P.PIN.test('123'), false);
check('5 digits are not', P.PIN.test('12345'), false);
check('letters are not', P.PIN.test('12a4'), false);

const pin = await P.makePin('2580');
check('the hash: hex salt of 16 bytes, hex hash of 32, the iterations', [/^[0-9a-f]{32}$/.test(pin.salt), /^[0-9a-f]{64}$/.test(pin.hash), pin.iterations > 0], [true, true, true]);
check('the right PIN', await P.checkPin('2580', pin), true);
check('a wrong PIN', await P.checkPin('2581', pin), false);
check('an empty PIN', await P.checkPin('', pin), false);
check('letters are a wrong PIN, not an error', await P.checkPin('abcd', pin), false);
const other = await P.makePin('2580');
check('the same PIN, another salt, another hash', other.hash === pin.hash, false);
check('… and it still checks', await P.checkPin('2580', other), true);
check('a JSON round trip keeps it working', await P.checkPin('2580', JSON.parse(JSON.stringify(pin))), true);
for (const typed of ['258', '25800', '25a0']) {
  let refused = false;
  await P.makePin(typed).catch(() => (refused = true));
  check(`"${typed}" is not made a PIN`, refused, true);
}

check('Arabic-Indic digits', P.pinDigits('٢٥٨٠'), '2580');
check('Urdu digits', P.pinDigits('۲۵۸۰'), '2580');
check('Devanagari digits', P.pinDigits('२५८०'), '2580');
check('Bengali digits', P.pinDigits('২৫৮০'), '2580');
check('Telugu digits', P.pinDigits('౨౫౮౦'), '2580');
check('full-width digits', P.pinDigits('２５８０'), '2580');
check('spaces around are dropped', P.pinDigits(' 2580 '), '2580');
check('letters stay letters', P.pinDigits('25a0'), '25a0');
check('the PIN typed in Devanagari opens', await P.checkPin('२५८०', pin), true);
check('set in Arabic-Indic, typed in ASCII', await P.checkPin('2580', await P.makePin('٢٥٨٠')), true);

check('a stored hash reads back', P.readPin({ ...pin }), pin);
check('nothing stored: no PIN', P.readPin(undefined), undefined);
check('a string: no PIN', P.readPin('2580'), undefined);
check('a short hash: no PIN', P.readPin({ ...pin, hash: 'abcd' }), undefined);
check('upper-case or odd hex: no PIN', [P.readPin({ ...pin, hash: pin.hash.toUpperCase() }), P.readPin({ ...pin, salt: pin.salt.slice(1) })], [undefined, undefined]);
check('a short salt: no PIN', P.readPin({ ...pin, salt: 'abcd' }), undefined);
check('no iterations: no PIN', P.readPin({ salt: pin.salt, hash: pin.hash }), undefined);
check('fractional iterations: no PIN', P.readPin({ ...pin, iterations: 1.5 }), undefined);
check('iterations that would hang the check: no PIN', P.readPin({ ...pin, iterations: 2 ** 31 }), undefined);

check('no wrong tries, no pause', P.pinWait(0), 0);
check('the pause doubles from a second', [1, 2, 3, 4, 5].map(P.pinWait), [1000, 2000, 4000, 8000, 16000]);
check('… up to an hour', [12, 13, 100, 10000].map(P.pinWait), [2048000, 3600000, 3600000, 3600000]);

done('pin');
