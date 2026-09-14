// Test database lifecycle: schema via the real migrations, a clean slate per
// test, and a hard guard so the suite can never run against a remote DB.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function assertLocalTestDb() {
  const host = process.env.DB_HOST;
  const name = process.env.DB_NAME || '';
  const local = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (process.env.DATABASE_URL || !local || !/test/i.test(name)) {
    throw new Error(
      `Refusing to run tests: DB must be local and named *test* (got host=${host}, db=${name}, DATABASE_URL=${
        process.env.DATABASE_URL ? 'set' : 'unset'
      })`
    );
  }
}
assertLocalTestDb();

const db = require('../../src/database').default;

const { connection } = db;
// Sequelize logs every query through console.log; keep the TAP output readable.
if (!process.env.TEST_SQL) connection.options.logging = false;

const TABLES = [
  'user_followers',
  'chat_messages',
  'messages',
  'tasks',
  'offerings',
  'signatures',
  'files',
  'users',
];

let schemaReady = false;

// Run the migrations once per process unless every one is already applied.
async function ensureSchema() {
  if (schemaReady) return;
  const files = fs
    .readdirSync(path.join(ROOT, 'src/database/migrations'))
    .filter(f => f.endsWith('.js'));
  let applied = -1;
  try {
    const [rows] = await connection.query(
      'SELECT COUNT(*)::int AS n FROM "SequelizeMeta"'
    );
    applied = rows[0].n;
  } catch {
    applied = -1;
  }
  if (applied !== files.length) {
    execFileSync('npx', ['sequelize', 'db:migrate'], {
      cwd: ROOT,
      env: process.env,
      stdio: process.env.TEST_LOG_LEVEL ? 'inherit' : 'pipe',
    });
  }
  schemaReady = true;
}

async function truncateAll() {
  await connection.query(
    `TRUNCATE ${TABLES.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`
  );
}

module.exports = { db, connection, ensureSchema, truncateAll, TABLES };
