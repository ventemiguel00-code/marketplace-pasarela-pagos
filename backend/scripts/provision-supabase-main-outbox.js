const fs = require('node:fs');
const path = require('node:path');
const { loadSupabaseEnvironment } = require('./load-supabase-env');

async function main() {
  loadSupabaseEnvironment();
  const { createPool } = require('../src/adapters/persistence/postgres');
  const pool = createPool();
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/20261120150000_create_public_integration_outbox.sql',
  );

  try {
    const before = await pool.query('SELECT COUNT(*)::int AS historical_rows FROM public.payment_transactions');
    await pool.query(fs.readFileSync(migrationPath, 'utf8'));
    const after = await pool.query(`SELECT
      (SELECT COUNT(*)::int FROM public.payment_transactions) AS historical_rows,
      (SELECT COUNT(*)::int FROM public.integration_outbox) AS outbox_rows,
      (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'integration_outbox') AS rls_enabled`);
    if (before.rows[0].historical_rows !== after.rows[0].historical_rows) {
      throw new Error('La cantidad de transacciones históricas cambió durante la migración.');
    }
    console.log(JSON.stringify(after.rows[0], null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('No se pudo preparar la outbox principal:', error.code || error.message);
  process.exitCode = 1;
});
