import { describe, expect, it, vi } from 'vitest';
import { createDb, createTursoAdapter, createD1Adapter } from '../src/db.js';

describe('Database Adapter (Turso & D1)', () => {
  it('bind converts undefined arguments to null', async () => {
    let capturedArgs: any[] = [];
    const mockClient: any = {
      async execute({ sql, args }: any) {
        capturedArgs = args;
        return {
          columns: ['id'],
          columnTypes: ['INT'],
          rows: [],
          rowsAffected: 0,
          lastInsertRowid: undefined,
        };
      },
    };

    const db = createTursoAdapter(mockClient);
    await db.prepare('INSERT INTO test(a, b, c) VALUES(?, ?, ?)')
      .bind(1, undefined, 'hello')
      .run();

    expect(capturedArgs).toEqual([1, null, 'hello']);
  });

  it('first returns plain object or null', async () => {
    const mockClient: any = {
      async execute({ sql }: any) {
        if (sql.includes('empty')) {
          return {
            columns: ['id', 'name'],
            columnTypes: ['INT', 'TEXT'],
            rows: [],
            rowsAffected: 0,
          };
        }
        return {
          columns: ['id', 'name'],
          columnTypes: ['INT', 'TEXT'],
          rows: [{ id: 10, name: 'Alice' }],
          rowsAffected: 0,
        };
      },
    };

    const db = createTursoAdapter(mockClient);

    const row = await db.prepare('SELECT * FROM users').first<any>();
    expect(row).toEqual({ id: 10, name: 'Alice' });

    // With column name
    const name = await db.prepare('SELECT * FROM users').first<string>('name');
    expect(name).toBe('Alice');

    // Empty result
    const emptyRow = await db.prepare('SELECT * FROM empty').first<any>();
    expect(emptyRow).toBeNull();
  });

  it('all returns results and meta, normalizes BigInt to number', async () => {
    const mockClient: any = {
      async execute() {
        return {
          columns: ['id', 'big_count', 'title'],
          columnTypes: ['INT', 'INT', 'TEXT'],
          rows: [
            { id: 1, big_count: BigInt(12345), title: 'Item 1' },
            { id: 2, big_count: BigInt(67890), title: 'Item 2' },
          ],
          rowsAffected: 2,
          lastInsertRowid: BigInt(2),
        };
      },
    };

    const db = createTursoAdapter(mockClient);
    const res = await db.prepare('SELECT * FROM items').all<any>();

    expect(res.results).toEqual([
      { id: 1, big_count: 12345, title: 'Item 1' },
      { id: 2, big_count: 67890, title: 'Item 2' },
    ]);
    expect(typeof res.results[0].big_count).toBe('number');
    expect(res.meta?.changes).toBe(2);
    expect(res.meta?.last_row_id).toBe(2);
    expect(typeof res.meta?.last_row_id).toBe('number');
    expect(res.meta?.rows_read).toBe(2);
  });

  it('run returns changes from rowsAffected and numeric last_row_id', async () => {
    const mockClient: any = {
      async execute() {
        return {
          columns: [],
          columnTypes: [],
          rows: [],
          rowsAffected: 5,
          lastInsertRowid: BigInt(99),
        };
      },
    };

    const db = createTursoAdapter(mockClient);
    const res = await db.prepare('DELETE FROM temp WHERE expired = 1').run();

    expect(res.success).toBe(true);
    expect(res.meta.changes).toBe(5);
    expect(res.meta.last_row_id).toBe(99);
    expect(typeof res.meta.last_row_id).toBe('number');
  });

  it('batch executes in write mode and maintains statement order', async () => {
    let batchMode = '';
    let executedStmts: any[] = [];

    const mockClient: any = {
      async batch(stmts: any[], mode: string) {
        batchMode = mode;
        executedStmts = stmts;
        return stmts.map((s, idx) => ({
          columns: ['id'],
          columnTypes: ['INT'],
          rows: [{ id: idx + 1 }],
          rowsAffected: 1,
          lastInsertRowid: BigInt(idx + 1),
        }));
      },
    };

    const db = createTursoAdapter(mockClient);
    const q1 = db.prepare('INSERT INTO users(id) VALUES(?)').bind('u1');
    const q2 = db.prepare('INSERT INTO users(id) VALUES(?)').bind('u2');

    const results = await db.batch([q1, q2]);

    expect(batchMode).toBe('write');
    expect(executedStmts).toHaveLength(2);
    expect(executedStmts[0].args).toEqual(['u1']);
    expect(executedStmts[1].args).toEqual(['u2']);
    expect(results).toHaveLength(2);
    expect(results[0].results).toEqual([{ id: 1 }]);
    expect(results[1].results).toEqual([{ id: 2 }]);
  });

  it('createDb picks Turso when TURSO_URL is set, and D1 when absent', () => {
    const mockD1: any = {
      prepare: vi.fn(),
      batch: vi.fn(),
    };

    // Case 1: D1 fallback
    const envD1: any = { DB: mockD1 };
    const dbD1 = createDb(envD1);
    expect(dbD1.backend).toBe('d1');

    // Case 2: Turso selected
    const envTurso: any = {
      DB: mockD1,
      TURSO_URL: 'libsql://usm-life-test.turso.io',
      TURSO_AUTH_TOKEN: 'test-token',
    };
    const dbTurso = createDb(envTurso);
    expect(dbTurso.backend).toBe('turso');
  });
});
