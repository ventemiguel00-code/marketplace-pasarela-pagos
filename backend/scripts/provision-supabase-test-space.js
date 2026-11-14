const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { loadSupabaseEnvironment } = require('./load-supabase-env');

async function main() {
  loadSupabaseEnvironment();
  const { createPool } = require('../src/adapters/persistence/postgres');
  const pool = createPool();
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/20261112140620_create_pagos_test_schema.sql',
  );
  const testPassword = crypto.randomBytes(32).toString('base64url');
  // El Session Pooler de Supabase identifica el proyecto con el sufijo del
  // usuario (rol.project-ref). Conservamos ese sufijo para el rol de pruebas.
  const sourceUser = process.env.SUPABASE_PGUSER;
  const projectSuffix = sourceUser.startsWith('postgres.') ? sourceUser.slice('postgres'.length) : '';
  const testConnectionUser = `pagos_test_runner${projectSuffix}`;

  try {
    await pool.query(fs.readFileSync(migrationPath, 'utf8'));
    await pool.query(`ALTER ROLE pagos_test_runner LOGIN PASSWORD '${testPassword}'`);

    const testEnvironment = [
      `SUPABASE_PGHOST=${process.env.SUPABASE_PGHOST}`,
      `SUPABASE_PGPORT=${process.env.SUPABASE_PGPORT}`,
      `SUPABASE_PGDATABASE=${process.env.SUPABASE_PGDATABASE}`,
      `SUPABASE_PGUSER=${testConnectionUser}`,
      `SUPABASE_PGPASSWORD=${testPassword}`,
      `SUPABASE_PGSSLROOTCERT=${process.env.SUPABASE_PGSSLROOTCERT}`,
      'SUPABASE_PGSCHEMA=pagos_test',
      '',
    ].join('\n');
    fs.writeFileSync(path.resolve(__dirname, '../.env.supabase.test'), testEnvironment, { mode: 0o600 });
    console.log('Esquema y rol de pruebas preparados. Las credenciales se guardaron solo en .env.supabase.test.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('No se pudo preparar el espacio de pruebas:', error.code || error.message);
  process.exitCode = 1;
});
