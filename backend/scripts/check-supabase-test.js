const path = require('node:path');
process.env.SUPABASE_ENV_FILE = path.resolve(__dirname, '../.env.supabase.test');
const { loadSupabaseEnvironment } = require('./load-supabase-env');

async function main() {
  loadSupabaseEnvironment();
  const { createPool } = require('../src/adapters/persistence/postgres');
  const pool = createPool();
  try {
    const current = await pool.query('SELECT current_user, current_schema(), COUNT(*)::int AS test_rows FROM payment_transactions');
    let historicalAccessBlocked = false;
    try {
      await pool.query('SELECT COUNT(*) FROM public.payment_transactions');
    } catch (error) {
      historicalAccessBlocked = error.code === '42501';
    }
    if (!historicalAccessBlocked) throw new Error('El rol de pruebas puede acceder a la tabla histórica.');
    console.log(JSON.stringify({ ...current.rows[0], historicalAccessBlocked }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('No se pudo verificar el espacio de pruebas:', error.code || error.message);
  process.exitCode = 1;
});
