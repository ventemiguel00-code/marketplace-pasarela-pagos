const { createPool } = require('../src/adapters/persistence/postgres');

async function migrate() {
  const pool = createPool();
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id BIGSERIAL PRIMARY KEY,
        transaction_id VARCHAR(20) UNIQUE,
        order_id VARCHAR(50) NOT NULL,
        method_id VARCHAR(20) NOT NULL,
        amount INTEGER NOT NULL CHECK (amount >= 0),
        status VARCHAR(20) NOT NULL CHECK (status IN ('APPROVED', 'REJECTED', 'PENDING_COD')),
        idempotency_key VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      ALTER TABLE payment_transactions
      ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100)
    `);
    await pool.query(`
      ALTER TABLE payment_transactions
      ADD COLUMN IF NOT EXISTS product_name VARCHAR(200),
      ADD COLUMN IF NOT EXISTS total_amount INTEGER,
      ADD COLUMN IF NOT EXISTS balance_amount INTEGER,
      ADD COLUMN IF NOT EXISTS reservation_status VARCHAR(30)
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_idempotency_key_unique
      ON payment_transactions (idempotency_key)
    `);
    await pool.query('BEGIN');
    try {
      await pool.query(`
        ALTER TABLE payment_transactions
        DROP CONSTRAINT IF EXISTS payment_transactions_status_check
      `);
      await pool.query(`
        ALTER TABLE payment_transactions
        ADD CONSTRAINT payment_transactions_status_check
        CHECK (status IN ('APPROVED', 'REJECTED', 'PENDING_COD')) NOT VALID
      `);
      await pool.query(`
        ALTER TABLE payment_transactions
        VALIDATE CONSTRAINT payment_transactions_status_check
      `);
      await pool.query(`
        ALTER TABLE payment_transactions
        DROP CONSTRAINT IF EXISTS payment_transactions_reservation_status_check,
        DROP CONSTRAINT IF EXISTS payment_transactions_total_amount_check,
        DROP CONSTRAINT IF EXISTS payment_transactions_balance_amount_check
      `);
      await pool.query(`
        ALTER TABLE payment_transactions
        ADD CONSTRAINT payment_transactions_reservation_status_check
          CHECK (reservation_status IS NULL OR reservation_status IN ('CONFIRMED', 'NOT_CONFIRMED')) NOT VALID,
        ADD CONSTRAINT payment_transactions_total_amount_check
          CHECK (total_amount IS NULL OR total_amount > 0) NOT VALID,
        ADD CONSTRAINT payment_transactions_balance_amount_check
          CHECK (balance_amount IS NULL OR balance_amount >= 0) NOT VALID
      `);
      await pool.query(`
        ALTER TABLE payment_transactions
        VALIDATE CONSTRAINT payment_transactions_reservation_status_check,
        VALIDATE CONSTRAINT payment_transactions_total_amount_check,
        VALIDATE CONSTRAINT payment_transactions_balance_amount_check
      `);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    console.log('Migración aplicada: payment_transactions disponible.');
  } finally {
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error('No se pudo aplicar la migración:', error.code || error.message);
  process.exitCode = 1;
});
