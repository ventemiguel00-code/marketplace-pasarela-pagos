const path = require('node:path');
process.env.SUPABASE_ENV_FILE = path.resolve(__dirname, '../.env.supabase.backend');
const { loadSupabaseEnvironment } = require('./load-supabase-env');

async function main() {
  loadSupabaseEnvironment();
  const { createPool } = require('../src/adapters/persistence/postgres');
  const pool = createPool();
  try {
    const result = await pool.query(`SELECT current_user, current_schema(),
      (SELECT COUNT(*)::int FROM payment_transactions) AS historical_rows,
      has_table_privilege('public.payment_transactions', 'SELECT') AS can_select,
      has_table_privilege('public.payment_transactions', 'INSERT') AS can_insert,
      has_table_privilege('public.payment_transactions', 'UPDATE') AS can_update,
      has_table_privilege('public.payment_transactions', 'DELETE') AS can_delete,
      to_regclass('public.integration_outbox') IS NOT NULL AS outbox_exists,
      (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'payment_transactions') AS rls_enabled`);
    let outbox = {
      outbox_can_select: false, outbox_can_insert: false,
      outbox_can_update: false, outbox_can_delete: false, outbox_rows: 0,
    };
    if (result.rows[0].outbox_exists) {
      const outboxResult = await pool.query(`SELECT
        has_table_privilege('public.integration_outbox', 'SELECT') AS outbox_can_select,
        has_table_privilege('public.integration_outbox', 'INSERT') AS outbox_can_insert,
        has_table_privilege('public.integration_outbox', 'UPDATE') AS outbox_can_update,
        has_table_privilege('public.integration_outbox', 'DELETE') AS outbox_can_delete,
        (SELECT COUNT(*)::int FROM public.integration_outbox) AS outbox_rows`);
      outbox = outboxResult.rows[0];
    }
    let testSchemaBlocked = false;
    try {
      await pool.query('SELECT COUNT(*) FROM pagos_test.payment_transactions');
    } catch (error) {
      testSchemaBlocked = error.code === '42501';
    }
    if (!testSchemaBlocked) throw new Error('El rol de backend puede acceder al esquema de pruebas.');
    console.log(JSON.stringify({ ...result.rows[0], ...outbox, testSchemaBlocked }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('No se pudo verificar el modo principal Supabase:', error.code || error.message);
  process.exitCode = 1;
});
