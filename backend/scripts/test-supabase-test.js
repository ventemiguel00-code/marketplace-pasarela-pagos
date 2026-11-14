const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

process.env.SUPABASE_ENV_FILE = path.resolve(__dirname, '../.env.supabase.test');
const { loadSupabaseEnvironment } = require('./load-supabase-env');
loadSupabaseEnvironment();

const testFiles = fs.readdirSync(path.resolve(__dirname, '../tests'))
  .filter((name) => name.endsWith('.test.js'))
  .map((name) => path.resolve(__dirname, '../tests', name));

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: path.resolve(__dirname, '..'),
  env: process.env,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
