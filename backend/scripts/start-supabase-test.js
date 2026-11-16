const path = require('node:path');
const fs = require('node:fs');
const localEnvironment = path.resolve(__dirname, '../.env.supabase.test');
// En Render las variables se entregan como secretos; localmente se conserva el
// archivo privado de pruebas si existe.
if (fs.existsSync(localEnvironment)) process.env.SUPABASE_ENV_FILE = localEnvironment;
const { loadSupabaseEnvironment } = require('./load-supabase-env');
loadSupabaseEnvironment();
require('../src/server');
