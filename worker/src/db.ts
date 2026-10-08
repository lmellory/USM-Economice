import { createClient, Client } from '@libsql/client/web';
import { Env } from './types.js';

export interface DatabaseResult<T = any> {
  results?: T[];
  success?: boolean;
  meta: {
    changes?: number;
    rows_read?: number;
    last_row_id?: number;
    duration?: number;
  };
}

export interface PreparedQuery {
  _sql: string;
  _args: any[];
  _d1Stmt?: any;
  bind(...args: any[]): PreparedQuery;
  first<T = any>(colName?: string): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[]; meta?: { changes?: number; rows_read?: number; last_row_id?: number } }>;
  run(): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
}

export interface Database {
  backend: 'turso' | 'd1';
  prepare(sql: string): PreparedQuery;
  batch<T = any>(statements: PreparedQuery[]): Promise<any[]>;
}

function normalizeArg(arg: any): any {
  if (arg === undefined) return null;
  return arg;
}

function normalizeValue(v: any): any {
  if (typeof v === 'bigint') {
    if (v <= Number.MAX_SAFE_INTEGER && v >= Number.MIN_SAFE_INTEGER) {
      return Number(v);
    }
    return v.toString();
  }
  return v;
}

function rowToPlainObject(row: any, columns: string[]): any {
  if (!row) return null;
  const obj: Record<string, any> = {};
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const val = row[col] !== undefined ? row[col] : row[i];
    obj[col] = normalizeValue(val);
  }
  return obj;
}

let cachedTursoClient: Client | null = null;
let cachedTursoKey = '';

export function getTursoClient(url: string, authToken?: string): Client {
  const key = `${url}:${authToken || ''}`;
  if (cachedTursoClient && cachedTursoKey === key) {
    return cachedTursoClient;
  }
  cachedTursoClient = createClient({ url, authToken });
  cachedTursoKey = key;
  return cachedTursoClient;
}

export function createTursoAdapter(client: Client): Database {
  return {
    backend: 'turso',
    prepare(sql: string): PreparedQuery {
      let boundArgs: any[] = [];
      const queryObj: PreparedQuery = {
        _sql: sql,
        _args: boundArgs,
        bind(...args: any[]) {
          boundArgs = args.map(normalizeArg);
          queryObj._args = boundArgs;
          return queryObj;
        },
        async first<T = any>(colName?: string): Promise<T | null> {
          const res = await client.execute({ sql, args: boundArgs });
          if (!res.rows || res.rows.length === 0) return null;
          if (colName) {
            const raw = res.rows[0][colName] !== undefined ? res.rows[0][colName] : (res.rows[0] as any)[0];
            return normalizeValue(raw) as T;
          }
          return rowToPlainObject(res.rows[0], res.columns) as T;
        },
        async all<T = any>() {
          const res = await client.execute({ sql, args: boundArgs });
          const results = (res.rows || []).map((row) => rowToPlainObject(row, res.columns) as T);
          return {
            results,
            meta: {
              changes: Number(res.rowsAffected || 0),
              last_row_id: Number(res.lastInsertRowid ?? 0),
              rows_read: results.length,
            },
          };
        },
        async run() {
          const res = await client.execute({ sql, args: boundArgs });
          return {
            success: true,
            meta: {
              changes: Number(res.rowsAffected || 0),
              last_row_id: Number(res.lastInsertRowid ?? 0),
            },
          };
        },
      };
      return queryObj;
    },

    async batch<T = any>(statements: PreparedQuery[]): Promise<any[]> {
      const stmts = statements.map((s) => ({
        sql: s._sql,
        args: (s._args || []).map(normalizeArg),
      }));
      const results = await client.batch(stmts, 'write');
      return results.map((res) => {
        const rows = (res.rows || []).map((row) => rowToPlainObject(row, res.columns));
        return {
          results: rows,
          meta: {
            changes: Number(res.rowsAffected || 0),
            last_row_id: Number(res.lastInsertRowid ?? 0),
            rows_read: rows.length,
          },
          success: true,
        };
      });
    },
  };
}

export function createD1Adapter(d1: D1Database): Database {
  return {
    backend: 'd1',
    prepare(sql: string): PreparedQuery {
      let d1Stmt = d1.prepare(sql);
      let boundArgs: any[] = [];
      const queryObj: PreparedQuery = {
        _sql: sql,
        _args: boundArgs,
        _d1Stmt: d1Stmt,
        bind(...args: any[]) {
          boundArgs = args.map(normalizeArg);
          queryObj._args = boundArgs;
          d1Stmt = d1Stmt.bind(...boundArgs);
          queryObj._d1Stmt = d1Stmt;
          return queryObj;
        },
        async first<T = any>(colName?: string): Promise<T | null> {
          if (colName) return d1Stmt.first<T>(colName);
          return d1Stmt.first<T>();
        },
        async all<T = any>() {
          return d1Stmt.all<T>();
        },
        async run() {
          const res = await d1Stmt.run();
          return {
            success: res.success,
            meta: {
              changes: Number(res.meta?.changes || 0),
              last_row_id: Number(res.meta?.last_row_id || 0),
            },
          };
        },
      };
      return queryObj;
    },

    async batch<T = any>(statements: PreparedQuery[]): Promise<any[]> {
      const d1Stmts = statements.map((s) => s._d1Stmt || s);
      return d1.batch(d1Stmts);
    },
  };
}

export function createDb(env: Env, customTursoClient?: Client): Database {
  if (customTursoClient) {
    return createTursoAdapter(customTursoClient);
  }
  if (env.TURSO_URL) {
    const client = getTursoClient(env.TURSO_URL, env.TURSO_AUTH_TOKEN);
    return createTursoAdapter(client);
  }
  return createD1Adapter(env.DB);
}
