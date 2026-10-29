const { createPool } = require('../src/adapters/persistence/postgres');

async function main() {
  let pool;
  try {
    pool = createPool();
    await pool.query('SELECT 1 AS connected');
    console.log('Conexión a PostgreSQL correcta (SELECT 1).');
  } catch (error) {
    console.error('No se pudo verificar PostgreSQL:', error.code || error.message);
    console.error('Revisa el servicio, la base de datos y las variables PG* de backend/.env.');
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}

main();
