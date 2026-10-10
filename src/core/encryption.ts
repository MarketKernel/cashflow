/**
 * A file encrypted with a password, for an export kept where others may see
 * it: a cloud folder, a USB stick. Unlike the PIN, which only hides the page,
 * this is encryption proper — AES-256-GCM with a key derived from the
 * password by PBKDF2-SHA-256, the WebCrypto every browser and Node have.
 * Without the password nothing in the file can be read, by anyone, Cashflow
 * included; GCM also tells a wrong password from a damaged file only in that
 * neither opens.
 *
 * The file: "CASHFLOW-ENC", a version byte, the PBKDF2 iterations (4 bytes,
 * big-endian), a 16-byte salt, a 12-byte IV, then the ciphertext with GCM's
 * tag. Everything before the ciphertext is the GCM's additional data, so a
 * changed header fails like a changed byte of the data. What is inside is the
 * file an ordinary export would have written: SQLite, or JSON.
 */

const MAGIC = 'CASHFLOW-ENC';
const VERSION = 1;
const SALT = 16;
const IV = 12;
const HEADER = MAGIC.length + 1 + 4 + SALT + IV;
/** OWASP's figure for PBKDF2-SHA-256 in 2023: about half a second on a phone, once per export or import. */
export const ITERATIONS = 600_000;
/** More than this in a header is not ours: it would hang the import. */
const MOST_ITERATIONS = 10_000_000;
/** The shortest password taken: not a strength meter, a floor under typing one letter by mistake. */
export const PASSWORD_LENGTH = 8;

export const encryptionAvailable = (): boolean => typeof crypto !== 'undefined' && !!crypto.subtle;

/** Starts with our header: the import asks for a password before anything else. */
export function isEncrypted(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER + 16) return false;
  for (let i = 0; i < MAGIC.length; i += 1) if (bytes[i] !== MAGIC.charCodeAt(i)) return false;
  return true;
}

/**
 * Our header, but a version or iterations this one does not write: a later
 * Cashflow made it. Told apart before the password is asked, or every
 * password would look wrong.
 */
export function fromLaterVersion(bytes: Uint8Array): boolean {
  if (!isEncrypted(bytes)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const iterations = view.getUint32(MAGIC.length + 1);
  return view.getUint8(MAGIC.length) !== VERSION || iterations < 1 || iterations > MOST_ITERATIONS;
}

// The same password typed on another keyboard may come as other code points (é as e + ´): NFC makes them one.
async function key(password: string, salt: Uint8Array, iterations: number, use: KeyUsage): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [use],
  );
}

export async function encrypt(plain: Uint8Array, password: string, iterations = ITERATIONS): Promise<Uint8Array> {
  const header = new Uint8Array(HEADER);
  for (let i = 0; i < MAGIC.length; i += 1) header[i] = MAGIC.charCodeAt(i);
  const view = new DataView(header.buffer);
  view.setUint8(MAGIC.length, VERSION);
  view.setUint32(MAGIC.length + 1, iterations);
  const salt = crypto.getRandomValues(new Uint8Array(SALT));
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  header.set(salt, MAGIC.length + 5);
  header.set(iv, MAGIC.length + 5 + SALT);
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: header as BufferSource },
    await key(password, salt, iterations, 'encrypt'),
    plain as BufferSource,
  ));
  const out = new Uint8Array(HEADER + sealed.length);
  out.set(header);
  out.set(sealed, HEADER);
  return out;
}

/** The file as it was before encryption; null for a wrong password, a damaged file, or one from a later version. */
export async function decrypt(file: Uint8Array, password: string): Promise<Uint8Array | null> {
  if (!isEncrypted(file) || fromLaterVersion(file)) return null;
  const iterations = new DataView(file.buffer, file.byteOffset, file.byteLength).getUint32(MAGIC.length + 1);
  const salt = file.slice(MAGIC.length + 5, MAGIC.length + 5 + SALT);
  const iv = file.slice(MAGIC.length + 5 + SALT, HEADER);
  try {
    return new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: file.slice(0, HEADER) as BufferSource },
      await key(password, salt, iterations, 'decrypt'),
      file.slice(HEADER) as BufferSource,
    ));
  } catch {
    return null;
  }
}
