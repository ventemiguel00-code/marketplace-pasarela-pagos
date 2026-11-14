const { loadSupabaseEnvironment } = require('./load-supabase-env');

try {
  loadSupabaseEnvironment();
  const { createPool } = require('../src/adapters/persistence/postgres');

  (async () => {
    const pool = createPool();
    try {
      const result = await pool.query(`
        SELECT current_database() AS database,
               COUNT(*)::int AS transactions,
               (SELECT relrowsecurity
                  FROM pg_class
                 WHERE oid = 'public.payment_transactions'::regclass) AS rls_enabled
          FROM public.payment_transactions
      `);
      const row = result.rows[0];
      console.log(`Conexión TLS a Supabase correcta (${row.database}).`);
      console.log(`Transacciones: ${row.transactions}. RLS: ${row.rls_enabled}.`);
    } finally {
      await pool.end();
    }
  })().catch((error) => {
    console.error('No se pudo verificar Supabase:', error.code || error.message);
    process.exitCode = 1;
  });
} catch (error) {
  console.error('No se pudo cargar el entorno de Supabase:', error.message);
  process.exitCode = 1;
}
