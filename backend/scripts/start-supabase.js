const { loadSupabaseEnvironment } = require('./load-supabase-env');

loadSupabaseEnvironment();
require('../src/server');
