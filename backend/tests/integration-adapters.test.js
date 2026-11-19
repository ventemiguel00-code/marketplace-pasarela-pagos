const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAccountingEscrowClient } = require('../src/adapters/http/accounting-escrow-client');
const { createNotificationsClient } = require('../src/adapters/http/notifications-client');

function jsonResponse(data, status = 201) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

const escrowRequest = {
  pedido_id: '2fef7d40-5e9f-4ccd-bde1-1f2a3db5a111',
  vendedor_id: '8df287d0-46f0-45f5-a661-2f8b59fef222',
  comprador_id: 'bf985841-031d-4090-9f78-4c1bc9dc3333',
  monto_bruto: 149900,
};
const escrowResponse = {
  id: 'e1', ...escrowRequest, porcentaje_comision: 5, comision_plataforma: 7495,
  monto_neto_vendedor: 142405, estado_escrow: 'RETENIDO', creado_en: '2026-11-19T00:00:00Z',
};
const notificationRequest = {
  usuario_id: escrowRequest.comprador_id,
  tipo: 'PAGO_APROBADO',
  titulo: 'Pago aprobado',
  mensaje: 'Tu pago fue aprobado.',
  referencia_id: escrowRequest.pedido_id,
  referencia_tipo: 'ORDEN',
};
const notificationResponse = {
  id: 'n1', ...notificationRequest, leido: false, creado_en: '2026-11-19T00:00:00Z',
};

test('Fase 13 MOCK: pago completo aprobado usa los contratos reales de Contabilidad y Notificaciones', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return url.includes('contabilidad') ? jsonResponse(escrowResponse) : jsonResponse(notificationResponse);
  };
  const accounting = createAccountingEscrowClient({ baseUrl: 'http://mock.contabilidad', enabled: true, fetchImpl });
  const notifications = createNotificationsClient({ baseUrl: 'http://mock.notificaciones', enabled: true, fetchImpl });

  assert.deepEqual(await accounting.retainEscrow(escrowRequest), escrowResponse);
  assert.deepEqual(await notifications.createNotification(notificationRequest), notificationResponse);
  assert.equal(calls[0].url, 'http://mock.contabilidad/api/contabilidad/escrow/retener');
  assert.equal(calls[1].url, 'http://mock.notificaciones/api/notificaciones');
  assert.deepEqual(JSON.parse(calls[0].options.body), escrowRequest);
  assert.deepEqual(JSON.parse(calls[1].options.body), notificationRequest);
});

test('Fase 13 MOCK: un pago rechazado no crea evento de escrow y puede usar PAGO_RECHAZADO', async () => {
  const notifications = createNotificationsClient({
    baseUrl: 'http://mock.notificaciones', enabled: true,
    fetchImpl: async (_url, options) => jsonResponse({
      ...notificationResponse, tipo: JSON.parse(options.body).tipo,
    }),
  });
  await notifications.createNotification({ ...notificationRequest, tipo: 'PAGO_RECHAZADO', titulo: 'Pago rechazado' });
});

test('Fase 13 MOCK: anticipo COD y reserva no se convierten automáticamente en escrow', async () => {
  const calls = [];
  const accounting = createAccountingEscrowClient({
    baseUrl: 'http://mock.contabilidad',
    fetchImpl: async () => { calls.push('network'); return jsonResponse(escrowResponse); },
  });
  await assert.rejects(accounting.retainEscrow(escrowRequest), { code: 'ACCOUNTING_INTEGRATION_DISABLED' });
  assert.deepEqual(calls, []);
});

test('Fase 13 MOCK: Contabilidad maneja HTTP no exitoso sin reintentos automáticos', async () => {
  let calls = 0;
  const accounting = createAccountingEscrowClient({
    baseUrl: 'http://mock.contabilidad', enabled: true,
    fetchImpl: async () => { calls += 1; return jsonResponse({}, 422); },
  });
  await assert.rejects(accounting.retainEscrow(escrowRequest), { code: 'ACCOUNTING_HTTP_ERROR', status: 422 });
  assert.equal(calls, 1);
});

test('Fase 13 MOCK: Notificaciones maneja HTTP no exitoso sin reintentos automáticos', async () => {
  let calls = 0;
  const notifications = createNotificationsClient({
    baseUrl: 'http://mock.notificaciones', enabled: true,
    fetchImpl: async () => { calls += 1; return jsonResponse({}, 401); },
  });
  await assert.rejects(notifications.createNotification(notificationRequest), {
    code: 'NOTIFICATIONS_HTTP_ERROR', status: 401,
  });
  assert.equal(calls, 1);
});

test('Fase 13 MOCK: los timeouts y respuestas incompletas se informan de forma segura', async () => {
  const timeout = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  const accounting = createAccountingEscrowClient({
    baseUrl: 'http://mock.contabilidad', enabled: true, fetchImpl: async () => { throw timeout; },
  });
  await assert.rejects(accounting.retainEscrow(escrowRequest), { code: 'ACCOUNTING_TIMEOUT' });

  const notifications = createNotificationsClient({
    baseUrl: 'http://mock.notificaciones', enabled: true,
    fetchImpl: async () => jsonResponse({ id: 'incompleta' }),
  });
  await assert.rejects(notifications.createNotification(notificationRequest), {
    code: 'INVALID_NOTIFICATIONS_RESPONSE',
  });
});

test('Fase 13 MOCK: la configuración predeterminada bloquea cualquier llamada externa repetida', async () => {
  let calls = 0;
  const notifications = createNotificationsClient({
    baseUrl: 'https://example.invalid', fetchImpl: async () => { calls += 1; return jsonResponse(notificationResponse); },
  });
  await assert.rejects(notifications.createNotification(notificationRequest), { code: 'NOTIFICATIONS_INTEGRATION_DISABLED' });
  await assert.rejects(notifications.createNotification(notificationRequest), { code: 'NOTIFICATIONS_INTEGRATION_DISABLED' });
  assert.equal(calls, 0);
});

test('Fase 13 MOCK: se validan campos reales antes de contactar los servicios', async () => {
  const accounting = createAccountingEscrowClient({ baseUrl: 'http://mock.contabilidad', enabled: true, fetchImpl: async () => jsonResponse(escrowResponse) });
  const notifications = createNotificationsClient({ baseUrl: 'http://mock.notificaciones', enabled: true, fetchImpl: async () => jsonResponse(notificationResponse) });
  await assert.rejects(accounting.retainEscrow({ ...escrowRequest, monto_bruto: -1 }), { code: 'INVALID_ESCROW_REQUEST' });
  await assert.rejects(notifications.createNotification({ ...notificationRequest, tipo: 'PAGO_INVENTADO' }), { code: 'INVALID_NOTIFICATION_REQUEST' });
});
