const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

function loadSupabaseEnvironment() {
  const filePath = process.env.SUPABASE_ENV_FILE
    || path.resolve(__dirname, '../.env.supabase');
  const result = dotenv.config({ path: filePath, quiet: true });

  if (result.error && result.error.code !== 'ENOENT') {
    throw result.error;
  }

  const mapping = {
    SUPABASE_PGHOST: 'PGHOST',
    SUPABASE_PGPORT: 'PGPORT',
    SUPABASE_PGDATABASE: 'PGDATABASE',
    SUPABASE_PGUSER: 'PGUSER',
    SUPABASE_PGPASSWORD: 'PGPASSWORD',
    SUPABASE_PGSSLROOTCERT: 'PGSSLROOTCERT',
    SUPABASE_PGSSLROOTCERT_CONTENT: 'PGSSLROOTCERT_CONTENT',
  };
  const required = Object.keys(mapping).filter((name) => name !== 'SUPABASE_PGSSLROOTCERT' && name !== 'SUPABASE_PGSSLROOTCERT_CONTENT');
  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(`Configura en backend/.env.supabase: ${missing.join(', ')}`);
  }

  if (!process.env.SUPABASE_PGSSLROOTCERT && !process.env.SUPABASE_PGSSLROOTCERT_CONTENT) {
    throw new Error('Configura SUPABASE_PGSSLROOTCERT o SUPABASE_PGSSLROOTCERT_CONTENT.');
  }
  if (process.env.SUPABASE_PGSSLROOTCERT && !fs.existsSync(process.env.SUPABASE_PGSSLROOTCERT)) {
    throw new Error('No se encontró el certificado indicado por SUPABASE_PGSSLROOTCERT.');
  }

  for (const [source, target] of Object.entries(mapping)) {
    if (process.env[source]) process.env[target] = process.env[source];
  }

  if (process.env.SUPABASE_PGSCHEMA) {
    if (!/^[a-z_][a-z0-9_]*$/.test(process.env.SUPABASE_PGSCHEMA)) {
      throw new Error('SUPABASE_PGSCHEMA solo puede contener letras minúsculas, números y guiones bajos.');
    }
    process.env.PGSCHEMA = process.env.SUPABASE_PGSCHEMA;
  }
}

module.exports = { loadSupabaseEnvironment };
