const PaymentTransaction = require('../../domain/payment-transaction');

function createPostgresTransactionRepository(pool) {
  return {
    async save(transaction) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query(
          `INSERT INTO payment_transactions
             (order_id, method_id, amount, status, idempotency_key,
              product_name, total_amount, balance_amount, reservation_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING id, created_at`,
          [
            transaction.orderId,
            transaction.methodId,
            transaction.amount,
            transaction.status,
            transaction.idempotencyKey,
            transaction.product,
            transaction.totalAmount,
            transaction.balanceAmount,
            transaction.reservationStatus,
          ],
        );
        if (inserted.rows.length === 0) {
          const existing = await client.query(
            `SELECT transaction_id, order_id, method_id, amount, status,
                    created_at, idempotency_key, product_name, total_amount,
                    balance_amount, reservation_status
             FROM payment_transactions
             WHERE idempotency_key = $1`,
            [transaction.idempotencyKey],
          );
          await client.query('COMMIT');
          return mapRow(existing.rows[0], true);
        }
        const row = inserted.rows[0];
        const transactionId = `TX-${String(row.id).padStart(6, '0')}`;
        await client.query(
          'UPDATE payment_transactions SET transaction_id = $1 WHERE id = $2',
          [transactionId, row.id],
        );
        await client.query('COMMIT');
        return new PaymentTransaction({
          ...transaction,
          transactionId,
          createdAt: row.created_at,
          idempotencyKey: transaction.idempotencyKey,
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async findByTransactionId(transactionId) {
      const result = await pool.query(
        `SELECT transaction_id, order_id, method_id, amount, status, created_at,
                idempotency_key, product_name, total_amount, balance_amount,
                reservation_status
         FROM payment_transactions
         WHERE transaction_id = $1`,
        [transactionId],
      );
      return mapRow(result.rows[0]);
    },

    async findByIdempotencyKey(idempotencyKey) {
      if (!idempotencyKey) return null;
      const result = await pool.query(
        `SELECT transaction_id, order_id, method_id, amount, status, created_at,
                idempotency_key, product_name, total_amount, balance_amount,
                reservation_status
         FROM payment_transactions
         WHERE idempotency_key = $1`,
        [idempotencyKey],
      );
      return mapRow(result.rows[0]);
    },
  };
}

function mapRow(row, isIdempotentReplay = false) {
  if (!row) return null;
  return new PaymentTransaction({
    transactionId: row.transaction_id,
    orderId: row.order_id,
    methodId: row.method_id,
    amount: row.amount,
    status: row.status,
    createdAt: row.created_at,
    idempotencyKey: row.idempotency_key,
    isIdempotentReplay,
    product: row.product_name,
    totalAmount: row.total_amount,
    balanceAmount: row.balance_amount,
    reservationStatus: row.reservation_status,
  });
}

module.exports = createPostgresTransactionRepository;
