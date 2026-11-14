const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAccountingEscrowClient } = require('../src/adapters/http/accounting-escrow-client');
const { createNotificationsClient } = require('../src/adapters/http/notifications-client');

function response(ok = true) { return { ok }; }

test('Fase 9B: adaptadores preparados usan sus rutas y clave idempotente sin invocarse automáticamente', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return response();
  };
  const event = {
    eventId: 'payment:TX-000013:approved',
    transactionId: 'TX-000013',
    orderId: 'ORD-00125',
    amount: 149900,
  };

  await createAccountingEscrowClient({ baseUrl: 'https://contabilidad.test', fetchImpl })
    .notifyApprovedPayment(event);
  await createNotificationsClient({ baseUrl: 'https://notificaciones.test', fetchImpl })
    .notifyPaymentApproved(event);

  assert.equal(calls[0].url, 'https://contabilidad.test/api/contabilidad/escrow/retener');
  assert.equal(calls[1].url, 'https://notificaciones.test/api/notificaciones');
  assert.equal(calls[0].options.headers['Idempotency-Key'], event.eventId);
  assert.equal(calls[1].options.headers['Idempotency-Key'], event.eventId);
  assert.deepEqual(JSON.parse(calls[0].options.body), event);
});
