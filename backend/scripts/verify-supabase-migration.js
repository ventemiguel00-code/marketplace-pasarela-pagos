const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { loadSupabaseEnvironment } = require('./load-supabase-env');

function fingerprint(rows) {
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

async function describe(pool) {
  const [columns, constraints, indexes] = await Promise.all([
    pool.query(`SELECT column_name, data_type, is_nullable
                  FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'payment_transactions'
                 ORDER BY ordinal_position`),
    pool.query(`SELECT conname, pg_get_constraintdef(oid) AS definition
                  FROM pg_constraint
                 WHERE conrelid = 'public.payment_transactions'::regclass
                 ORDER BY conname`),
    pool.query(`SELECT indexname, indexdef
                  FROM pg_indexes
                 WHERE schemaname = 'public' AND tablename = 'payment_transactions'
                 ORDER BY indexname`),
  ]);
  return { columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows };
}

async function rowsForMigration(pool) {
  const result = await pool.query(`SELECT id, transaction_id, order_id, method_id, amount,
      status, idempotency_key, created_at, product_name, total_amount,
      balance_amount, reservation_status
    FROM public.payment_transactions ORDER BY id`);
  return result.rows;
}

(async () => {
  const localFile = path.resolve(__dirname, '../.env');
  const local = dotenv.parse(fs.readFileSync(localFile));
  const localPool = new Pool({
    host: local.PGHOST,
    port: Number(local.PGPORT),
    database: local.PGDATABASE,
    user: local.PGUSER,
    password: local.PGPASSWORD,
    max: 1,
  });

  try {
    loadSupabaseEnvironment();
    const { createPool } = require('../src/adapters/persistence/postgres');
    const supabasePool = createPool();
    try {
      const [localRows, supabaseRows, localSchema, supabaseSchema] = await Promise.all([
        rowsForMigration(localPool), rowsForMigration(supabasePool),
        describe(localPool), describe(supabasePool),
      ]);
      const localColumns = new Set(localSchema.columns.map((column) => column.column_name));
      const supabaseColumns = new Set(supabaseSchema.columns.map((column) => column.column_name));
      const missingColumns = [...localColumns].filter((name) => !supabaseColumns.has(name));
      const readyToImport = localRows.length === 16 && supabaseRows.length === 0
        && missingColumns.length === 0;

      console.log(JSON.stringify({
        localRows: localRows.length,
        localFingerprint: fingerprint(localRows),
        supabaseRows: supabaseRows.length,
        supabaseFingerprint: fingerprint(supabaseRows),
        missingColumns,
        supabaseExtraColumns: [...supabaseColumns].filter((name) => !localColumns.has(name)),
        localMaxId: localRows.at(-1)?.id || 0,
        readyToImport,
      }, null, 2));
    } finally {
      await supabasePool.end();
    }
  } finally {
    await localPool.end();
  }
})().catch((error) => {
  console.error('No se pudo verificar la preparación de la migración:', error.code || error.message);
  process.exitCode = 1;
});
