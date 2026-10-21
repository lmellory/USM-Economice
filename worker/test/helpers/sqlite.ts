import { DatabaseSync } from 'node:sqlite';
export function sqliteD1(sqlite: DatabaseSync) {
  const prepare = (sql: string, args: any[] = []) => ({
    bind(...values: any[]) {
      return prepare(sql, values);
    },
    async all() {
      return { results: sqlite.prepare(sql).all(...args), success: true, meta: {} };
    },
    async first(column?: string) {
      const row = sqlite.prepare(sql).get(...args) as any;
      return row ? (column ? row[column] : row) : null;
    },
    async run() {
      const result = sqlite.prepare(sql).run(...args);
      return {
        success: true,
        meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
      };
    },
  });
  return {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec('BEGIN');
      try {
        const rows = [];
        for (const statement of statements) rows.push(await statement.run());
        sqlite.exec('COMMIT');
        return rows;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
