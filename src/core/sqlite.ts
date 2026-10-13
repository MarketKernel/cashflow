/**
 * SQLite itself: sql.js with its WebAssembly inlined. The bytes come from
 * esbuild's binary loader, in the page and in the tests alike, so nothing is
 * fetched — the CSP allows WebAssembly ('wasm-unsafe-eval') and no fetch.
 */
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasm from 'sql.js/dist/sql-wasm.wasm';

let loading: Promise<SqlJsStatic> | null = null;

export function loadSqlite(): Promise<SqlJsStatic> {
  // A copy of exactly the module's bytes: the loader's array may sit in a larger buffer.
  loading ??= initSqlJs({ wasmBinary: wasm.slice().buffer });
  return loading;
}
