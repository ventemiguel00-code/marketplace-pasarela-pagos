require('../../config/env');
const fs = require('node:fs');
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

  const config = { connectionTimeoutMillis: 3000, query_timeout: 3000 };
  const certificatePath = process.env.PGSSLROOTCERT;
  const certificateContent = process.env.PGSSLROOTCERT_CONTENT;

  // Local no necesita TLS. El entorno opcional de Supabase exige certificado y
  // validación del servidor, sin debilitar la conexión local predeterminada.
  if (certificatePath || certificateContent) {
    config.ssl = {
      ca: certificateContent || fs.readFileSync(certificatePath, 'utf8'),
      rejectUnauthorized: true,
    };
  }

  // Un entorno de pruebas puede limitarse a un esquema privado. No se añade
  // "public" como alternativa: así una consulta sin esquema no puede llegar
  // accidentalmente a las transacciones históricas.
  if (process.env.PGSCHEMA) {
    if (!/^[a-z_][a-z0-9_]*$/.test(process.env.PGSCHEMA)) {
      throw new Error('PGSCHEMA contiene un nombre de esquema no válido.');
    }
    config.options = `-c search_path=${process.env.PGSCHEMA}`;
  }

  // pg lee las variables PG*. Crear el pool no abre una conexión todavía.
  const pool = new Pool(config);
  pool.on('error', (error) => {
    console.error('Error de conexión PostgreSQL:', error.code || error.name);
  });
  return pool;
}

module.exports = { createPool };
