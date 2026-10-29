require('../../config/env');
const { Pool } = require('pg');

function createPool() {
  const required = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Configura en backend/.env: ${missing.join(', ')}`);
  }

  const port = Number(process.env.PGPORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PGPORT debe ser un entero entre 1 y 65535.');
  }

  // pg lee las variables PG*. Crear el pool no abre una conexión todavía.
  const pool = new Pool({ connectionTimeoutMillis: 3000, query_timeout: 3000 });
  pool.on('error', (error) => {
    console.error('Error de conexión PostgreSQL:', error.code || error.name);
  });
  return pool;
}

module.exports = { createPool };
