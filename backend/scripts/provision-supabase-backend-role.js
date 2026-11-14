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
    '../../supabase/migrations/20261112142454_create_pagos_backend_role.sql',
  );
  const password = crypto.randomBytes(32).toString('base64url');
  const sourceUser = process.env.SUPABASE_PGUSER;
  const projectSuffix = sourceUser.startsWith('postgres.') ? sourceUser.slice('postgres'.length) : '';

  try {
    await pool.query(fs.readFileSync(migrationPath, 'utf8'));
    await pool.query(`ALTER ROLE pagos_backend LOGIN PASSWORD '${password}'`);
    fs.writeFileSync(path.resolve(__dirname, '../.env.supabase.backend'), [
      `SUPABASE_PGHOST=${process.env.SUPABASE_PGHOST}`,
      `SUPABASE_PGPORT=${process.env.SUPABASE_PGPORT}`,
      `SUPABASE_PGDATABASE=${process.env.SUPABASE_PGDATABASE}`,
      `SUPABASE_PGUSER=pagos_backend${projectSuffix}`,
      `SUPABASE_PGPASSWORD=${password}`,
      `SUPABASE_PGSSLROOTCERT=${process.env.SUPABASE_PGSSLROOTCERT}`,
      'SUPABASE_PGSCHEMA=public',
      '',
    ].join('\n'), { mode: 0o600 });
    console.log('Rol de backend preparado. Las credenciales se guardaron solo en .env.supabase.backend.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('No se pudo preparar el rol de backend:', error.code || error.message);
  process.exitCode = 1;
});
