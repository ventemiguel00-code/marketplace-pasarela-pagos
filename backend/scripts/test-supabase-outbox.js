const path = require('node:path');
process.env.SUPABASE_ENV_FILE = path.resolve(__dirname, '../.env.supabase.test');
const { loadSupabaseEnvironment } = require('./load-supabase-env');

async function main() {
  loadSupabaseEnvironment();
  const { createPool } = require('../src/adapters/persistence/postgres');
  const createOutbox = require('../src/adapters/persistence/postgres-integration-outbox');
  const pool = createPool();
  const outbox = createOutbox(pool);
  const eventId = `TX-TEST-F17:OUTBOX-${Date.now()}`;
  const sample = {
    eventId,
    transactionId: 'TX-TEST-F17',
    orderId: 'ORDER-TEST-F17',
    eventType: 'NOTIFY_PAYMENT_APPROVED',
    targetService: 'NOTIFICATIONS',
    payload: { tipo: 'PAGO_APROBADO' },
  };
  try {
    const first = await outbox.enqueue([sample]);
    const repeated = await outbox.enqueue([sample]);
    if (first.length !== 1 || repeated.length !== 0) throw new Error('La outbox no preservó la idempotencia.');
    const marked = await outbox.markResult(eventId, { deliveryStatus: 'DELIVERED', httpStatus: 201 });
    if (marked?.deliveryStatus !== 'DELIVERED' || marked?.httpStatus !== 201) {
      throw new Error('La outbox no conservó el resultado de entrega.');
    }
    console.log(JSON.stringify({ inserted: first.length, duplicateInserted: repeated.length, deliveryStatus: marked.deliveryStatus }, null, 2));
  } finally {
    await pool.query('DELETE FROM integration_outbox WHERE event_id = $1', [eventId]);
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Falló la prueba aislada de outbox:', error.code || error.message);
  process.exitCode = 1;
});
