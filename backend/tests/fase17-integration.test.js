const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOrdersClient } = require('../src/adapters/http/orders-client');
const { createInventoryClient } = require('../src/adapters/http/inventory-client');
const { createTrackingClient } = require('../src/adapters/http/tracking-client');
const { planEvents, createRecordPaymentIntegrations } = require('../src/application/record-payment-integrations');
const { createIntegrationDispatcher } = require('../src/application/dispatch-integration-events');

const orderId = '2fef7d40-5e9f-4ccd-bde1-1f2a3db5a111';
const buyerId = 'bf985841-031d-4090-9f78-4c1bc9dc3333';
const sellerId = '8df287d0-46f0-45f5-a661-2f8b59fef222';
const order = {
  pedido_id: orderId,
  comprador_id: buyerId,
  vendedor_id: sellerId,
  monto_total: 149900,
  subtotal: 139900,
  costo_envio: 10000,
  comercio: 'TechStore Marketplace',
  items: [{ nombre: 'Audífonos Bluetooth', cantidad: 1 }],
  referencia_id: 'RES-101',
  numero_guia: 'GUIA-2026-1',
};

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

test('Fase 17: Órdenes usa UUID, reenvía Bearer y transforma el pedido sin perder sus identificadores', async () => {
  const calls = [];
  const client = createOrdersClient({
    baseUrl: 'https://orders.test', enabled: true,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return response({ data: { orden: order } }); },
  });
  const summary = await client.findByOrderId(orderId, { accessToken: 'legitimate-token' });
  assert.equal(summary.totalAmount, 149900);
  assert.equal(summary.buyerId, buyerId);
  assert.equal(summary.sellerId, sellerId);
  assert.equal(calls[0].url, `https://orders.test/api/ordenes/${orderId}`);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer legitimate-token');
  assert.equal(await client.isOrderOwnedBy({ orderId, buyerSubject: buyerId, accessToken: 'legitimate-token' }), true);
});

test('Fase 17: Órdenes rechaza identificadores locales y actualiza con el contrato oficial', async () => {
  const calls = [];
  const client = createOrdersClient({
    baseUrl: 'https://orders.test', enabled: true,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return response({ orden: order }); },
  });
  await assert.rejects(client.findByOrderId('ORD-00125', { accessToken: 'token' }), { code: 'INVALID_ORDER_ID' });
  await client.updateStatus({ orderId, status: 'CONFIRMADA', accessToken: 'token' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://orders.test/api/ordenes/${orderId}/estado`);
  assert.deepEqual(JSON.parse(calls[0].options.body), { nuevo_estado: 'CONFIRMADA' });
});

test('Fase 17: Inventario y Seguimiento usan exactamente las rutas oficiales', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return response({ ok: true }); };
  const inventory = createInventoryClient({ baseUrl: 'https://inventory.test', enabled: true, fetchImpl });
  const tracking = createTrackingClient({ baseUrl: 'https://tracking.test', enabled: true, fetchImpl });
  await inventory.confirmReservation({ referenceId: 'RES-101', accessToken: 'token' });
  await tracking.updateStatus({ trackingNumber: 'GUIA-2026-1', status: 'PAGO_CONFIRMADO', accessToken: 'token' });
  assert.equal(calls[0].url, 'https://inventory.test/api/inventario/confirmar/RES-101');
  assert.equal(calls[1].url, 'https://tracking.test/api/seguimiento/GUIA-2026-1/estado');
  assert.deepEqual(JSON.parse(calls[1].options.body), { estado: 'PAGO_CONFIRMADO' });
});

test('Fase 17: pago aprobado planifica contratos; rechazado nunca crea escrow ni confirma orden', () => {
  const base = {
    transactionId: 'TX-000101', orderId, methodId: 'pse', amount: 149900,
  };
  const summary = { buyerId, sellerId, inventoryReferenceId: 'RES-101', trackingNumber: 'GUIA-2026-1' };
  const approved = planEvents({
    transaction: { ...base, status: 'APPROVED' }, orderSummary: summary,
    operationType: 'PAYMENT', confirmedOrderStatus: 'CONFIRMADA',
    inventoryResponsibility: true, trackingStatus: 'PAGO_CONFIRMADO',
  });
  assert.deepEqual(approved.map((item) => item.targetService), [
    'ACCOUNTING', 'ORDERS', 'NOTIFICATIONS', 'INVENTORY', 'TRACKING',
  ]);
  assert.deepEqual(approved[0].payload, {
    pedido_id: orderId, vendedor_id: sellerId, comprador_id: buyerId, monto_bruto: 149900,
  });
  const rejected = planEvents({
    transaction: { ...base, status: 'REJECTED' }, orderSummary: summary,
    operationType: 'PAYMENT', confirmedOrderStatus: 'CONFIRMADA', inventoryResponsibility: true,
  });
  assert.deepEqual(rejected.map((item) => item.eventType), ['NOTIFY_PAYMENT_REJECTED']);
  assert.equal(rejected[0].payload.tipo, 'PAGO_RECHAZADO');
});

test('Fase 17: anticipos COD y reservas no se presentan como pago completo aprobado', () => {
  const transaction = { transactionId: 'TX-000102', orderId, amount: 50000, status: 'PENDING_COD' };
  assert.deepEqual(planEvents({
    transaction, orderSummary: { buyerId, sellerId }, operationType: 'COD_ADVANCE',
    confirmedOrderStatus: 'CONFIRMADA', inventoryResponsibility: true,
  }), []);
  assert.deepEqual(planEvents({
    transaction: { ...transaction, status: 'APPROVED' }, orderSummary: { buyerId, sellerId },
    operationType: 'RESERVATION_ADVANCE', confirmedOrderStatus: 'CONFIRMADA', inventoryResponsibility: true,
  }), []);
});

test('Fase 17: la outbox evita duplicar eventos y solo despacha los recién insertados', async () => {
  const stored = new Map();
  const delivered = [];
  const outboxPort = {
    async enqueue(events) {
      const inserted = [];
      for (const item of events) if (!stored.has(item.eventId)) { stored.set(item.eventId, item); inserted.push(item); }
      return inserted;
    },
    async markResult(eventId, result) { delivered.push({ eventId, ...result }); return result; },
  };
  const dispatcher = createIntegrationDispatcher({
    outboxPort,
    accounting: { retainEscrow: async () => ({ ok: true }) },
    notifications: { createNotification: async () => ({ ok: true }) },
    orders: { updateStatus: async () => ({ ok: true }) },
    inventory: { confirmReservation: async () => ({ ok: true }) },
    tracking: { updateStatus: async () => ({ ok: true }) },
  });
  const record = createRecordPaymentIntegrations({ outboxPort, dispatcher, confirmedOrderStatus: 'CONFIRMADA' });
  const input = {
    transaction: { transactionId: 'TX-000103', orderId, amount: 149900, status: 'APPROVED' },
    orderSummary: { buyerId, sellerId }, authContext: { accessToken: 'token' },
  };
  await record(input);
  await record(input);
  assert.equal(stored.size, 3);
  assert.equal(delivered.length, 3);
});

test('Fase 17: un resultado de red incierto queda registrado y no se reintenta automáticamente', async () => {
  let calls = 0;
  const results = [];
  const outboxPort = { markResult: async (eventId, result) => { results.push({ eventId, ...result }); return result; } };
  const dispatcher = createIntegrationDispatcher({
    outboxPort,
    accounting: { retainEscrow: async () => { calls += 1; throw Object.assign(new Error('timeout'), { code: 'ACCOUNTING_TIMEOUT' }); } },
    notifications: {}, orders: {}, inventory: {}, tracking: {},
  });
  await dispatcher.dispatch([{
    eventId: 'TX-000104:ACCOUNTING_ESCROW_RETAIN', eventType: 'ACCOUNTING_ESCROW_RETAIN',
    payload: { pedido_id: orderId },
  }]);
  assert.equal(calls, 1);
  assert.equal(results[0].deliveryStatus, 'UNCERTAIN');
});
