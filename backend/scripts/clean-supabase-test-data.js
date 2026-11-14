const path = require('node:path');
process.env.SUPABASE_ENV_FILE = path.resolve(__dirname, '../.env.supabase.test');
const { loadSupabaseEnvironment } = require('./load-supabase-env');

async function main() {
  loadSupabaseEnvironment();
  const { createPool } = require('../src/adapters/persistence/postgres');
  const pool = createPool();
  try {
    // TRUNCATE requiere ser propietario. DELETE respeta el rol limitado y la
    // política RLS del esquema de pruebas, sin pedir privilegios adicionales.
    await pool.query('DELETE FROM payment_transactions');
    console.log('Datos temporales del esquema pagos_test eliminados.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('No se pudieron limpiar los datos de pruebas:', error.code || error.message);
  process.exitCode = 1;
});
