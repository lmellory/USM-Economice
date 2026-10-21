import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { ensureClassesPopulated } from '../src/classes.js';
import { sqliteD1 } from './helpers/sqlite.js';

let sqlite: DatabaseSync;
let env: any;
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  sqlite.exec(
    "INSERT INTO users(id,first_name) VALUES('u1','Саша'); INSERT INTO settings(user_id) VALUES('u1');"
  );
  env = { DB: sqliteD1(sqlite) };
});
afterEach(() => sqlite.close());
describe('Schedule initialization and migrations', () => {
  it('initializes a new user once and keeps an intentionally empty schedule empty', async () => {
    await ensureClassesPopulated(env, 'u1');
    expect(
      Number(
        (sqlite.prepare("SELECT COUNT(*) AS n FROM classes WHERE user_id='u1'").get() as any).n
      )
    ).toBeGreaterThan(0);
    sqlite.exec("DELETE FROM classes WHERE user_id='u1'");
    await ensureClassesPopulated(env, 'u1');
    expect(
      Number(
        (sqlite.prepare("SELECT COUNT(*) AS n FROM classes WHERE user_id='u1'").get() as any).n
      )
    ).toBe(0);
  });
  it('preserves an existing customized schedule and marks it initialized', async () => {
    sqlite.exec(
      "INSERT INTO classes(id,user_id,day,start,end,title) VALUES('custom','u1',1,'10:00','11:00','Свой предмет')"
    );
    await ensureClassesPopulated(env, 'u1');
    expect(
      Number(
        (sqlite.prepare("SELECT COUNT(*) AS n FROM classes WHERE user_id='u1'").get() as any).n
      )
    ).toBe(1);
    expect(
      (sqlite.prepare("SELECT schedule_initialized FROM settings WHERE user_id='u1'").get() as any)
        .schedule_initialized
    ).toBe(1);
  });
});
