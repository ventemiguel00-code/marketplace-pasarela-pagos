const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { loadSupabaseEnvironment } = require('./load-supabase-env');

const MIGRATION_COLUMNS = [
  'id', 'transaction_id', 'order_id', 'method_id', 'amount', 'status',
  'idempotency_key', 'created_at', 'product_name', 'total_amount',
  'balance_amount', 'reservation_status',
];

function fingerprint(rows) {
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

async function readRows(pool) {
  const result = await pool.query(`SELECT ${MIGRATION_COLUMNS.join(', ')}
    FROM public.payment_transactions ORDER BY id`);
  return result.rows;
}

function localPool() {
  const localFile = path.resolve(__dirname, '../.env');
  const local = dotenv.parse(fs.readFileSync(localFile));
  return new Pool({
    host: local.PGHOST,
    port: Number(local.PGPORT),
    database: local.PGDATABASE,
    user: local.PGUSER,
    password: local.PGPASSWORD,
    max: 1,
  });
}

async function main() {
  const source = localPool();
  let target;
  try {
    loadSupabaseEnvironment();
    const { createPool } = require('../src/adapters/persistence/postgres');
    target = createPool();

    const sourceRows = await readRows(source);
    const sourceFingerprint = fingerprint(sourceRows);
    const targetBefore = await readRows(target);

    if (sourceRows.length !== 16) {
      throw new Error(`Se esperaban 16 registros locales y se encontraron ${sourceRows.length}`);
    }
    if (targetBefore.length !== 0) {
      throw new Error(`Supabase no está vacío (${targetBefore.length} registros); importación cancelada`);
    }

    const client = await target.connect();
    try {
      await client.query('BEGIN');
      for (const row of sourceRows) {
        const values = MIGRATION_COLUMNS.map((column) => row[column]);
        const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
        await client.query(
          `INSERT INTO public.payment_transactions (${MIGRATION_COLUMNS.join(', ')})
           VALUES (${placeholders})`,
          values,
        );
      }
      await client.query(
        `SELECT setval('public.payment_transactions_id_seq',
          (SELECT MAX(id) FROM public.payment_transactions), true)`,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const targetAfter = await readRows(target);
    const targetFingerprint = fingerprint(targetAfter);
    const sequence = await target.query(
      `SELECT last_value::bigint AS last_value, is_called
         FROM public.payment_transactions_id_seq`,
    );

    if (targetAfter.length !== sourceRows.length || targetFingerprint !== sourceFingerprint) {
      throw new Error('La verificación posterior no coincide con el origen');
    }

    console.log(JSON.stringify({
      importedRows: targetAfter.length,
      fingerprint: targetFingerprint,
      sourceFingerprint,
      sequenceLastValue: sequence.rows[0].last_value,
      sequenceReady: Number(sequence.rows[0].last_value) >= Number(sourceRows.at(-1).id),
    }, null, 2));
  } finally {
    await source.end();
    if (target) await target.end();
  }
}

main().catch((error) => {
  console.error('La importación fue cancelada:', error.code || error.message);
  process.exitCode = 1;
});
