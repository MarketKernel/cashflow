/** An export encrypted with a password: the round trip, a wrong password, a damaged file, the header. */
import { checker, load } from '../tools/load.mjs';

const { check, done } = checker();
const E = await load('core/encryption');
// Few iterations keep the test quick; the default is what the page uses.
const FAST = 1000;
const plain = new TextEncoder().encode('SQLite format 3\0 and the rest of a database');

check('WebCrypto is there', E.encryptionAvailable(), true);
check('the default iterations', E.ITERATIONS, 600_000);
const sealed = await E.encrypt(plain, 'correct horse', FAST);
check('it starts with the header', new TextDecoder().decode(sealed.subarray(0, 12)), 'CASHFLOW-ENC');
check('… and is told from SQLite and JSON', [E.isEncrypted(sealed), E.isEncrypted(plain), E.isEncrypted(new TextEncoder().encode('{"base":"UAH"}'))], [true, false, false]);
check('the iterations are in the header', new DataView(sealed.buffer).getUint32(13), FAST);
check('nothing of the data shows', new TextDecoder('latin1').decode(sealed).includes('SQLite'), false);
check('header, ciphertext and tag', sealed.length, 12 + 1 + 4 + 16 + 12 + plain.length + 16);
check('the right password opens it', Array.from((await E.decrypt(sealed, 'correct horse')) ?? []), Array.from(plain));
check('a wrong one does not', await E.decrypt(sealed, 'correct horsf'), null);
check('nor an empty one', await E.decrypt(sealed, ''), null);
const again = await E.encrypt(plain, 'correct horse', FAST);
check('the same password, another salt and IV, other bytes', Buffer.from(again).equals(Buffer.from(sealed)), false);

// The same letter typed as one code point or as a letter and an accent.
const composed = await E.encrypt(plain, 'café au lait', FAST);
check('a password is the same whatever the keyboard composed', (await E.decrypt(composed, 'café au lait')) !== null, true);

const flipped = (at) => {
  const copy = sealed.slice();
  copy[at] ^= 1;
  return copy;
};
check('a changed byte of the data fails', await E.decrypt(flipped(sealed.length - 20), 'correct horse'), null);
check('a changed byte of the tag fails', await E.decrypt(flipped(sealed.length - 1), 'correct horse'), null);
check('a changed byte of the salt fails', await E.decrypt(flipped(20), 'correct horse'), null);
check('a cut file fails', await E.decrypt(sealed.slice(0, sealed.length - 1), 'correct horse'), null);
check('another version is not read', await E.decrypt(flipped(12), 'correct horse'), null);
check('… and is told apart before a password is asked', [E.fromLaterVersion(flipped(12)), E.fromLaterVersion(sealed), E.fromLaterVersion(plain)], [true, false, false]);
{
  // Iterations no export would write: refused before the derivation could hang.
  const copy = sealed.slice();
  new DataView(copy.buffer).setUint32(13, 0xffffffff);
  check('absurd iterations are refused', [await E.decrypt(copy, 'correct horse'), E.fromLaterVersion(copy)], [null, true]);
}
check('a file shorter than the header is not ours', E.isEncrypted(sealed.slice(0, 40)), false);
// A Uint8Array that is a window on a larger buffer, as a File's bytes may be.
{
  const big = new Uint8Array(sealed.length + 10);
  big.set(sealed, 5);
  check('bytes at an offset in their buffer', (await E.decrypt(big.subarray(5, 5 + sealed.length), 'correct horse')) !== null, true);
}

done('encryption');
