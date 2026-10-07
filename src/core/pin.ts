/**
 * The PIN of a database. It keeps out someone who sits down at an unlocked
 * computer, nothing more: the database itself is not encrypted, and four
 * digits fall to anyone holding their hash. So the hash is only there to keep
 * the digits themselves out of sight — PBKDF2 with a salt, the WebCrypto every
 * browser and Node have. It is kept in the database, as hex text, and travels
 * with it: an export asks for the same PIN wherever it is imported.
 */

/** Four digits: something typed on a phone's number pad. */
export const PIN = /^\d{4}$/;

const ITERATIONS = 100_000;
/** More than this in a stored hash is not ours: it would hang the check. */
const MOST_ITERATIONS = 10_000_000;
/** The pause after a wrong PIN doubles from a second, up to an hour: a passer-by gives up, the owner is not locked out for days. */
const FIRST_WAIT = 1000;
const LONGEST_WAIT = 3_600_000;
/**
 * The zero of each script's digits a keyboard of the app's languages may type:
 * Arabic-Indic, Eastern Arabic-Indic (Urdu), Devanagari, Bengali, Telugu, and
 * the full-width ones of Japanese and Chinese input.
 */
const ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0c66, 0xff10];

export interface PinHash {
  /** Hex. */
  salt: string;
  /** Hex, 32 bytes of PBKDF2-SHA-256. */
  hash: string;
  /** Kept with the hash, so a later version can raise it without breaking stored PINs. */
  iterations: number;
}

/** The PIN as typed, its digits made ASCII: a keyboard switched to other numerals still opens the page. */
export function pinDigits(text: string): string {
  let out = '';
  for (const char of text.trim()) {
    const code = char.codePointAt(0)!;
    const zero = ZEROS.find((z) => code >= z && code <= z + 9);
    out += zero === undefined ? char : String(code - zero);
  }
  return out;
}

export const pinAvailable = (): boolean => typeof crypto !== 'undefined' && !!crypto.subtle;

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (text: string): Uint8Array => new Uint8Array((text.match(/../g) ?? []).map((pair) => parseInt(pair, 16)));

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)));
}

export async function makePin(typed: string): Promise<PinHash> {
  const pin = pinDigits(typed);
  if (!PIN.test(pin)) throw new Error('A PIN is 4 digits');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: hex(salt), hash: await derive(pin, salt, ITERATIONS), iterations: ITERATIONS };
}

/** A stored PIN hash, if the value is one; anything else means no PIN. */
export function readPin(value: unknown): PinHash | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { salt, hash, iterations } = value as Record<string, unknown>;
  if (typeof salt !== 'string' || !/^([0-9a-f]{2}){8,64}$/.test(salt)) return undefined;
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return undefined;
  if (typeof iterations !== 'number' || !Number.isInteger(iterations) || iterations < 1 || iterations > MOST_ITERATIONS) return undefined;
  return { salt, hash, iterations };
}

/** False for a wrong PIN, and for a check the browser could not do. */
export async function checkPin(typed: string, pin: PinHash): Promise<boolean> {
  const digits = pinDigits(typed);
  if (!PIN.test(digits)) return false;
  const hash = await derive(digits, unhex(pin.salt), pin.iterations).catch(() => null);
  return hash === pin.hash;
}

/** How long the next try waits after this many wrong ones in a row, in milliseconds. */
export function pinWait(wrong: number): number {
  if (wrong < 1) return 0;
  return Math.min(LONGEST_WAIT, FIRST_WAIT * 2 ** Math.min(wrong - 1, 30));
}
