process.env.SUPABASE_ENV_FILE = require('node:path').resolve(__dirname, '../.env.supabase.test');
const { loadSupabaseEnvironment } = require('./load-supabase-env');
loadSupabaseEnvironment();
require('../src/server');
