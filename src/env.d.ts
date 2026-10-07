/** package.json's version, as build.mjs puts it in: 0.1.0, or 0.1.0+1a2b3c4 off a release. */
declare const __APP_VERSION__: string;

/** esbuild's binary loader: the file's bytes, inlined into the bundle. */
declare module '*.wasm' {
  const bytes: Uint8Array;
  export default bytes;
}

/** The part of sql.js the app uses (its own types would bring all of @types/node along). */
declare module 'sql.js' {
  export type SqlValue = number | string | Uint8Array | null;
  export interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }
  export interface Statement {
    run(params?: SqlValue[]): void;
    free(): boolean;
  }
  export interface Database {
    exec(sql: string, params?: SqlValue[]): QueryExecResult[];
    run(sql: string, params?: SqlValue[]): Database;
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }
  export interface SqlJsStatic {
    Database: new (data?: Uint8Array | null) => Database;
  }
  export default function initSqlJs(config?: { wasmBinary?: ArrayBuffer }): Promise<SqlJsStatic>;
}
