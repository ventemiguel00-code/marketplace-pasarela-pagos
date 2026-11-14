const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const PaymentTransaction = require('../src/domain/payment-transaction');
const { createPool } = require('../src/adapters/persistence/postgres');
const createPostgresTransactionRepository = require('../src/adapters/persistence/postgres-transaction-repository');

const pool = createPool();
const repository = createPostgresTransactionRepository(pool);
const testOrderId = 'TEST-PERSISTENCE';

after(async () => {
  await pool.query('DELETE FROM payment_transactions WHERE order_id = $1', [testOrderId]);
  await pool.end();
});

test('HU-PG-03 y 05: el repositorio registra y vuelve a consultar la transacción', async () => {
  const saved = await repository.save(new PaymentTransaction({
    orderId: testOrderId,
    methodId: 'qr',
    amount: 149900,
    status: 'APPROVED',
  }));

  assert.match(saved.transactionId, /^TX-\d{6,}$/);
  const result = await pool.query(
    `SELECT transaction_id, order_id, method_id, amount, status
     FROM payment_transactions WHERE transaction_id = $1`,
    [saved.transactionId],
  );
  assert.deepEqual(result.rows[0], {
    transaction_id: saved.transactionId,
    order_id: testOrderId,
    method_id: 'qr',
    amount: 149900,
    status: 'APPROVED',
  });

  const consulted = await repository.findByTransactionId(saved.transactionId);
  assert.equal(consulted.transactionId, saved.transactionId);
  assert.equal(consulted.orderId, testOrderId);
  assert.equal(consulted.status, 'APPROVED');
});

test('HU-PG-07: PostgreSQL conserva un solo registro por clave de intento', async () => {
  const transaction = new PaymentTransaction({
    orderId: testOrderId,
    methodId: 'pse',
    amount: 149900,
    status: 'APPROVED',
    idempotencyKey: 'attempt:persistence-001',
  });
  const first = await repository.save(transaction);
  const repeated = await repository.save(transaction);
  const result = await pool.query(
    'SELECT COUNT(*)::int AS count FROM payment_transactions WHERE idempotency_key = $1',
    [transaction.idempotencyKey],
  );

  assert.equal(repeated.transactionId, first.transactionId);
  assert.equal(repeated.isIdempotentReplay, true);
  assert.equal(result.rows[0].count, 1);
});

test('HU-PG-07: dos registros concurrentes con la misma clave no se duplican', async () => {
  const transaction = new PaymentTransaction({
    orderId: testOrderId,
    methodId: 'qr',
    amount: 149900,
    status: 'REJECTED',
    idempotencyKey: 'attempt:persistence-concurrent-002',
  });
  const [first, second] = await Promise.all([
    repository.save(transaction),
    repository.save(transaction),
  ]);
  const result = await pool.query(
    'SELECT COUNT(*)::int AS count FROM payment_transactions WHERE idempotency_key = $1',
    [transaction.idempotencyKey],
  );

  assert.equal(first.transactionId, second.transactionId);
  assert.equal(result.rows[0].count, 1);
});

test('HU-PG-09: consultar varias veces en PostgreSQL no crea ni modifica registros', async () => {
  const saved = await repository.save(new PaymentTransaction({
    orderId: testOrderId,
    methodId: 'pse',
    amount: 149900,
    status: 'APPROVED',
    idempotencyKey: 'attempt:query-read-only-009',
  }));
  const before = await pool.query(
    'SELECT COUNT(*)::int AS count FROM payment_transactions WHERE order_id = $1',
    [testOrderId],
  );

  const first = await repository.findByTransactionId(saved.transactionId);
  const second = await repository.findByTransactionId(saved.transactionId);
  const after = await pool.query(
    'SELECT COUNT(*)::int AS count FROM payment_transactions WHERE order_id = $1',
    [testOrderId],
  );

  assert.deepEqual(first, second);
  assert.equal(first.orderId, testOrderId);
  assert.equal(first.methodId, 'pse');
  assert.equal(first.amount, 149900);
  assert.equal(first.status, 'APPROVED');
  assert.equal(after.rows[0].count, before.rows[0].count);
});

test('HU-PG-11: PostgreSQL conserva una sola solicitud contra entrega pendiente', async () => {
  const transaction = new PaymentTransaction({
    orderId: testOrderId,
    methodId: 'cod:pse',
    amount: 50000,
    status: 'PENDING_COD',
    idempotencyKey: 'attempt:persistence-cod-011',
    product: 'Producto académico',
    totalAmount: 149900,
    balanceAmount: 99900,
  });
  const [first, repeated] = await Promise.all([
    repository.save(transaction),
    repository.save(transaction),
  ]);
  const result = await pool.query(
    `SELECT transaction_id, method_id, amount, status, total_amount, balance_amount,
            COUNT(*) OVER ()::int AS count
     FROM payment_transactions WHERE idempotency_key = $1`,
    [transaction.idempotencyKey],
  );

  assert.equal(first.transactionId, repeated.transactionId);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].method_id, 'cod:pse');
  assert.equal(result.rows[0].amount, 50000);
  assert.equal(result.rows[0].status, 'PENDING_COD');
  assert.equal(result.rows[0].total_amount, 149900);
  assert.equal(result.rows[0].balance_amount, 99900);
  assert.equal(result.rows[0].count, 1);
});

test('HU-PG-12: PostgreSQL conserva una reserva y su anticipo sin duplicarlos', async () => {
  const transaction = new PaymentTransaction({
    orderId: testOrderId,
    methodId: 'pse',
    amount: 50000,
    status: 'APPROVED',
    idempotencyKey: 'attempt:persistence-reservation-012',
    product: 'Producto académico',
    totalAmount: 149900,
    balanceAmount: 99900,
    reservationStatus: 'CONFIRMED',
  });
  const [first, repeated] = await Promise.all([
    repository.save(transaction),
    repository.save(transaction),
  ]);
  const result = await pool.query(
    `SELECT transaction_id, product_name, amount, total_amount, balance_amount,
            reservation_status, COUNT(*) OVER ()::int AS count
     FROM payment_transactions WHERE idempotency_key = $1`,
    [transaction.idempotencyKey],
  );

  assert.equal(first.transactionId, repeated.transactionId);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].product_name, 'Producto académico');
  assert.equal(result.rows[0].amount, 50000);
  assert.equal(result.rows[0].total_amount, 149900);
  assert.equal(result.rows[0].balance_amount, 99900);
  assert.equal(result.rows[0].reservation_status, 'CONFIRMED');
  assert.equal(result.rows[0].count, 1);

  const consulted = await repository.findByTransactionId(first.transactionId);
  assert.equal(consulted.product, 'Producto académico');
  assert.equal(consulted.reservationStatus, 'CONFIRMED');
});
