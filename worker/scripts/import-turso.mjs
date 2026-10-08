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

const TABLE_ORDER = [
  'users',
  'settings',
  'classes',
  'schedule_exceptions',
  'homework',
  'notification_log',
  'schedule_overrides',
  'commute_options',
  'transit_state',
  'tranzy_routes',
  'tranzy_stops',
  'app_state',
  'trip_plan_rate_limit',
];

function getTableRank(sql) {
  for (let i = 0; i < TABLE_ORDER.length; i++) {
    const tbl = TABLE_ORDER[i];
    if (sql.includes(`"${tbl}"`) || sql.includes(` ${tbl} `) || sql.includes(` ${tbl}(`)) {
      return i;
    }
  }
  return 999;
}

async function run() {
  const dumpPath = path.resolve(__dirname, '../dump-data.sql');
  if (!fs.existsSync(dumpPath)) {
    console.error('❌ Файл worker/dump-data.sql не найден!');
    console.error('Сначала экспортируй данные из D1 командой:');
    console.error('npx wrangler d1 export usm-life --remote --no-schema --output=./dump-data.sql -y');
    process.exit(1);
  }

  const devVars = loadDevVars();
  const rawUrl = process.env.TURSO_URL || devVars.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN || devVars.TURSO_AUTH_TOKEN;

  if (!rawUrl || !authToken) {
    console.error('❌ Ошибка: TURSO_URL или TURSO_AUTH_TOKEN не найдены.');
    process.exit(1);
  }

  const url = rawUrl.replace(/^libsql:\/\//, 'https://');
  console.log('Подключение к Turso...');
  const client = createClient({ url, authToken });

  console.log('Чтение и подготовка дампа dump-data.sql...');
  const content = fs.readFileSync(dumpPath, 'utf8');
  const rawLines = content.split('\n');

  const statements = [];
  let buffer = '';

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    if (trimmed.startsWith('PRAGMA ')) continue;

    buffer += (buffer ? '\n' : '') + trimmed;
    if (trimmed.endsWith(';')) {
      const stmt = buffer.trim();
      buffer = '';

      if (stmt.includes('"d1_migrations"') || stmt.includes('"sqlite_sequence"')) {
        continue;
      }

      // Заменяем INSERT INTO на INSERT OR REPLACE INTO для идемпотентности
      const idempotentStmt = stmt.replace(/^INSERT\s+INTO\s+/i, 'INSERT OR REPLACE INTO ');
      statements.push(idempotentStmt);
    }
  }

  // Сортируем по зависимостям внешних ключей (users -> settings -> classes -> ...)
  statements.sort((a, b) => getTableRank(a) - getTableRank(b));

  console.log(`Найдено записей для импорта: ${statements.length}`);

  const BATCH_SIZE = 100;
  let imported = 0;

  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const chunk = statements.slice(i, i + BATCH_SIZE);
    const chunkSql = chunk.join('\n');
    await client.executeMultiple(chunkSql);
    imported += chunk.length;
    process.stdout.write(`\r  Импортировано: ${imported} / ${statements.length}`);
  }

  console.log('\n\n✅ Все данные успешно импортированы в Turso!');

  console.log('\nПроверка количества записей в таблицах Turso:');
  const checkTables = [
    'users',
    'settings',
    'homework',
    'classes',
    'schedule_exceptions',
    'commute_options',
    'tranzy_stops',
    'tranzy_routes',
    'transit_state',
  ];

  for (const table of checkTables) {
    try {
      const res = await client.execute(`SELECT COUNT(*) as c FROM ${table}`);
      console.log(`  • ${table.padEnd(22)} : ${res.rows[0].c}`);
    } catch {
      // Таблица может отсутствовать
    }
  }
}

run().catch((err) => {
  console.error('\n❌ Ошибка при импорте:', err);
  process.exit(1);
});
