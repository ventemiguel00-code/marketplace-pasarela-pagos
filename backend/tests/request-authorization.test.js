const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createRequestAuthorization } = require('../src/adapters/http/request-authorization');

async function callAuthorization(port, path) {
  const app = express();
  app.use((req, res, next) => { req.auth = { subject: 'buyer-123' }; next(); });
  app.get('/orders/:orderId', port.authorizeOrder, (req, res) => res.json({ ok: true }));
  app.get('/transactions/:transactionId', port.authorizeTransaction, (req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { return await fetch(`http://127.0.0.1:${server.address().port}${path}`); } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('Fase 9B: propiedad ajena devuelve 403 y servicio de Órdenes ausente devuelve 503', async () => {
  const denied = createRequestAuthorization({
    orderOwnershipPort: { isOrderOwnedBy: async () => false, isTransactionOwnedBy: async () => false },
  });
  assert.equal((await callAuthorization(denied, '/orders/ORD-00125')).status, 403);
  assert.equal((await callAuthorization(denied, '/transactions/TX-000013')).status, 403);

  const unavailable = createRequestAuthorization();
  assert.equal((await callAuthorization(unavailable, '/orders/ORD-00125')).status, 503);
});
