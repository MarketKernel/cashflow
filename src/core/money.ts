/**
 * Money: amounts are integers in minor units, typed in by hand and shown in
 * the interface language.
 *
 * What a person types is read generously — a comma or a dot for the decimal
 * point, spaces and apostrophes between thousands, and simple arithmetic
 * (`1200+350-50*2`), which is parsed here: there is no eval, and the page's CSP
 * would forbid it anyway.
 */

export const pow10 = (decimals: number): number => 10 ** decimals;

export const toMajor = (minor: number, decimals: number): number => minor / pow10(decimals);

export const toMinor = (major: number, decimals: number): number => Math.round(major * pow10(decimals));

/** Thousands separators people type: spaces of every width and apostrophes. */
const SEPARATORS = /[\s\u00a0\u2009\u202f'\u2019\u02bc`]/g;

type Token = { kind: 'number'; value: number } | { kind: 'op'; value: string };

function tokenize(input: string): Token[] | null {
  const source = input.replace(SEPARATORS, '').replace(/[\u2212\u2013]/g, '-').replace(/\u00d7/g, '*').replace(/\u00f7/g, '/');
  const tokens: Token[] = [];
  let at = 0;
  while (at < source.length) {
    const rest = source.slice(at);
    // One decimal separator at most: "12,5.3" leaves ".3", a number right after a number.
    const number = /^(\d+(?:[.,]\d+)?|[.,]\d+)/.exec(rest);
    if (number) {
      tokens.push({ kind: 'number', value: Number(number[1]!.replace(',', '.')) });
      at += number[1]!.length;
      continue;
    }
    const char = source[at]!;
    if ('+-*/()'.includes(char)) {
      tokens.push({ kind: 'op', value: char });
      at += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

/**
 * The value of an expression of numbers, + - * / and brackets, in major units;
 * null for anything else, an empty text or a division by zero.
 */
export function evaluate(input: string): number | null {
  const found = tokenize(input);
  if (!found || found.length === 0) return null;
  const tokens: Token[] = found;
  let at = 0;
  const peek = (): Token | undefined => tokens[at];
  const isOp = (value: string): boolean => {
    const token = peek();
    return token?.kind === 'op' && token.value === value;
  };

  function expression(): number {
    let value = term();
    while (isOp('+') || isOp('-')) {
      const op = (tokens[at++] as Token).value;
      const right = term();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }
  function term(): number {
    let value = factor();
    while (isOp('*') || isOp('/')) {
      const op = (tokens[at++] as Token).value;
      const right = factor();
      if (op === '/' && right === 0) throw new Error('division by zero');
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }
  function factor(): number {
    const token = tokens[at++];
    if (!token) throw new Error('unexpected end');
    if (token.kind === 'number') return token.value;
    if (token.value === '-') return -factor();
    if (token.value === '+') return factor();
    if (token.value === '(') {
      const value = expression();
      if (!isOp(')')) throw new Error('unclosed bracket');
      at += 1;
      return value;
    }
    throw new Error('unexpected operator');
  }

  try {
    const value = expression();
    if (at !== tokens.length || !Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

/** What the person typed, in minor units of a currency with `decimals`; null if it is not an amount. */
export function parseAmount(input: string, decimals: number): number | null {
  const value = evaluate(input);
  if (value === null) return null;
  const minor = toMinor(value, decimals);
  return Number.isSafeInteger(minor) ? minor : null;
}

/** An amount as an input field shows it for editing: no grouping, a dot, no needless zeros. */
export function formatInput(minor: number, decimals: number): string {
  const text = toMajor(minor, decimals).toFixed(decimals);
  return decimals > 0 ? text.replace(/\.?0+$/, '') : text;
}

/* ------------------------------------------------------------------ *
 * Showing amounts
 * ------------------------------------------------------------------ */

let isoCodes: Set<string> | null = null;

/**
 * Intl's style: 'currency' for the ISO codes Intl knows; anything else (USDT, a
 * made-up code) is the number and the code. Intl takes any three letters, so
 * its own list decides, where the runtime has one.
 */
function isIsoCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  if (!isoCodes) {
    try {
      isoCodes = new Set(Intl.supportedValuesOf('currency'));
    } catch {
      isoCodes = new Set();
    }
  }
  return isoCodes.size === 0 || isoCodes.has(code);
}

export interface MoneyStyle {
  /** + before a positive amount, as a difference wants. */
  sign?: boolean;
  /** No fraction: for large totals and chart labels. */
  whole?: boolean;
  /** Without the currency. */
  bare?: boolean;
}

const formats = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string, code: string, decimals: number, style: MoneyStyle): { format: Intl.NumberFormat; suffix: string } {
  const digits = style.whole ? 0 : decimals;
  const currency = !style.bare && isIsoCurrency(code);
  const key = [locale, currency ? code : '', digits, style.sign ? 's' : ''].join('|');
  let format = formats.get(key);
  if (!format) {
    const options: Intl.NumberFormatOptions = {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: style.sign ? 'exceptZero' : 'auto',
    };
    try {
      format = new Intl.NumberFormat(locale, currency ? { ...options, style: 'currency', currency: code } : options);
    } catch {
      // A RangeError (an odd locale or code) must not take the page down.
      format = new Intl.NumberFormat('en', options);
    }
    formats.set(key, format);
  }
  return { format, suffix: currency || style.bare ? '' : `\u00a0${code}` };
}

/** A value in major units — a sum in the base currency, say — as text. */
export function formatMajor(major: number, code: string, decimals: number, locale: string, style: MoneyStyle = {}): string {
  const { format, suffix } = numberFormat(locale, code, decimals, style);
  // -0 shows as "-0.00"; a value that rounds to nothing is shown as nothing.
  const value = Math.abs(major) < 0.5 / pow10(style.whole ? 0 : decimals) ? 0 : major;
  return format.format(value) + suffix;
}

export function formatMinor(minor: number, code: string, decimals: number, locale: string, style: MoneyStyle = {}): string {
  return formatMajor(toMajor(minor, decimals), code, decimals, locale, style);
}
