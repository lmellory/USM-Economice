import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadDevVars() {
  const envPath = path.resolve(__dirname, '../.dev.vars');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

async function run() {
  const devVars = loadDevVars();
  const rawUrl = process.env.TURSO_URL || devVars.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || devVars.TURSO_AUTH_TOKEN;

  if (!rawUrl || !authToken) {
    console.error('❌ Ошибка: TURSO_URL или TURSO_AUTH_TOKEN не найдены.');
    console.error('Убедись, что они заданы в worker/.dev.vars или в переменных окружения.');
    process.exit(1);
  }

  const url = rawUrl.replace(/^libsql:\/\//, 'https://');
  console.log('Подключение к Turso...');
  const client = createClient({ url, authToken });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedRows = await client.execute('SELECT name FROM _migrations ORDER BY id ASC');
  const applied = new Set(appliedRows.rows.map((r) => String(r.name)));

  const migrationsDir = path.resolve(__dirname, '../migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`Найдено файлов миграций: ${files.length}`);

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  ✓ ${file} (уже применена)`);
      continue;
    }

    console.log(`  ⏳ Применяем ${file}...`);
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
      await client.executeMultiple(sql);
      await client.execute({
        sql: 'INSERT INTO _migrations (name) VALUES (?)',
        args: [file],
      });
      console.log(`  ✅ ${file} успешно применена`);
      appliedCount++;
    } catch (err) {
      console.error(`❌ Ошибка в миграции ${file}:`, err);
      process.exit(1);
    }
  }

  if (appliedCount === 0) {
    console.log('\nВсе миграции уже были применены. База актуальна!');
  } else {
    console.log(`\nГотово! Успешно применено миграций: ${appliedCount}`);
  }

  const tablesResult = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  console.log('\nТаблицы в Turso:');
  for (const row of tablesResult.rows) {
    console.log(`  • ${row.name}`);
  }
}

run().catch((err) => {
  if (err?.message?.includes('401') || err?.status === 401 || String(err).includes('401')) {
    console.error('\n❌ Ошибка авторизации (401 Unauthorized) от Turso.');
    console.error('Токен TURSO_AUTH_TOKEN не подошёл к базе данных.');
    console.error('Нужно сгенерировать свежий токен в панели Turso: выбери базу -> Generate Token.');
  } else {
    console.error('Непредвиденная ошибка:', err);
  }
  process.exit(1);
});
