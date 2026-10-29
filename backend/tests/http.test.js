const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const createApp = require('../src/adapters/http/app');
const createGetPaymentSummary = require('../src/application/get-payment-summary');
const localOrderSummary = require('../src/adapters/local/local-order-summary');
const createGetPaymentMethods = require('../src/application/get-payment-methods');
const localPaymentMethods = require('../src/adapters/local/local-payment-methods');
const createProcessPayment = require('../src/application/process-payment');
const createGetPaymentStatus = require('../src/application/get-payment-status');
const createGetReservationQuote = require('../src/application/get-reservation-quote');
const createProcessReservation = require('../src/application/process-reservation');
const { academicReservationPolicy } = require('../src/adapters/local/academic-reservation-policy');
const simulatedPaymentProcessor = require('../src/adapters/local/simulated-payment-processor');

let fakeTransactionNumber = 0;
const fakeTransactions = new Map();
const fakeTransactionsByAttempt = new Map();
const fakeTransactionRepository = {
  async save(transaction) {
    if (transaction.idempotencyKey && fakeTransactionsByAttempt.has(transaction.idempotencyKey)) {
      return {
        ...fakeTransactionsByAttempt.get(transaction.idempotencyKey),
        isIdempotentReplay: true,
      };
    }
    fakeTransactionNumber += 1;
    const saved = {
      ...transaction,
      transactionId: `TX-${String(fakeTransactionNumber).padStart(6, '0')}`,
      createdAt: new Date(),
    };
    fakeTransactions.set(saved.transactionId, saved);
    if (saved.idempotencyKey) fakeTransactionsByAttempt.set(saved.idempotencyKey, saved);
    return saved;
  },
  async findByTransactionId(transactionId) {
    return fakeTransactions.get(transactionId) ?? null;
  },
  async findByIdempotencyKey(idempotencyKey) {
    return fakeTransactionsByAttempt.get(idempotencyKey) ?? null;
  },
};

const getReservationQuote = createGetReservationQuote(
  localOrderSummary,
  academicReservationPolicy,
);

const app = createApp(
  createGetPaymentSummary(localOrderSummary),
  createGetPaymentMethods(localPaymentMethods),
  createProcessPayment({
    orderSummaryPort: localOrderSummary,
    paymentMethodPort: localPaymentMethods,
    paymentProcessorPort: simulatedPaymentProcessor,
    transactionRepositoryPort: fakeTransactionRepository,
  }),
  createGetPaymentStatus(fakeTransactionRepository),
  getReservationQuote,
  createProcessReservation({
    getReservationQuote,
    paymentMethodPort: localPaymentMethods,
    paymentProcessorPort: simulatedPaymentProcessor,
    transactionRepositoryPort: fakeTransactionRepository,
  }),
);

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
});

test('GET /health responde 200 y JSON sin necesitar PostgreSQL', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), { status: 'ok', module: 'payments' });
});

test('Express sirve la página y sus recursos desde el mismo origen', async () => {
  for (const [route, contentType] of [
    ['/', 'text/html'], ['/css/styles.css', 'text/css'], ['/js/payment-result.js', 'javascript'],
    ['/js/app.js', 'javascript'], ['/js/support-contact.js', 'javascript'],
  ]) {
    const response = await fetch(`${baseUrl}${route}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').includes(contentType));
    assert.ok((await response.text()).length > 0);
  }
});

test('HU-PG-10: la página muestra ayuda pendiente sin enlaces ni crear pagos', async () => {
  const transactionCount = fakeTransactionNumber;
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /¿Necesitas ayuda con tu pago\?/);
  assert.match(html, /Número de soporte pendiente por definir/);
  assert.doesNotMatch(html, /href=["'](?:tel:|https:\/\/(?:wa\.me|api\.whatsapp))/i);
  assert.equal(fakeTransactionNumber, transactionCount);
});

test('una ruta inexistente devuelve 404 en JSON', async () => {
  const response = await fetch(`${baseUrl}/ruta-inexistente`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Ruta no encontrada' });
});

test('un cuerpo JSON inválido devuelve 400 en JSON', async () => {
  const response = await fetch(`${baseUrl}/health`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'JSON inválido' });
});

test('HU-PG-01: orden válida devuelve 200 y los datos del resumen en JSON', async () => {
  const response = await fetch(`${baseUrl}/api/payments/summary/ORD-00125`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), {
    orderId: 'ORD-00125',
    recipient: 'TechStore Marketplace',
    product: 'Audífonos Bluetooth JBL Tune 520BT',
    quantity: 1,
    subtotalAmount: 139900,
    shippingAmount: 10000,
    totalAmount: 149900,
  });
});

test('HU-PG-01: orden inexistente devuelve 404 sin inventar un resumen', async () => {
  const response = await fetch(`${baseUrl}/api/payments/summary/ORD-999`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Orden no encontrada' });
});

test('HU-PG-02 y 11: endpoint devuelve PSE, Código QR y Pago contra entrega', async () => {
  const response = await fetch(`${baseUrl}/api/payments/methods`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), {
    methods: [
      { id: 'pse', name: 'PSE' },
      { id: 'qr', name: 'Código QR' },
      { id: 'cod', name: 'Pago contra entrega' },
    ],
  });
});

test('HU-PG-11: la página identifica claramente la simulación de cliente nuevo', async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Simular cliente nuevo/);
  assert.match(html, /no valida identidad ni historial/);
  assert.match(html, /Pagarás el valor del pedido cuando recibas el producto/);
});

test('HU-PG-03 y 04: PSE procesa con HTTP 201 y resultado APPROVED', async () => {
  const response = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'pse' }),
  });
  assert.equal(response.status, 201);
  const transaction = await response.json();
  assert.match(transaction.transactionId, /^TX-/);
  assert.equal(transaction.orderId, 'ORD-00125');
  assert.equal(transaction.methodId, 'pse');
  assert.equal(transaction.amount, 149900);
  assert.equal(transaction.status, 'APPROVED');
});

test('HU-PG-04: Código QR conserva transactionId y devuelve REJECTED', async () => {
  const response = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'qr' }),
  });
  assert.equal(response.status, 201);
  const transaction = await response.json();
  assert.match(transaction.transactionId, /^TX-/);
  assert.equal(transaction.methodId, 'qr');
  assert.equal(transaction.status, 'REJECTED');
});

test('HU-PG-03: rechaza un método inexistente', async () => {
  const response = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'card' }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Método de pago no disponible' });
});

test('HU-PG-03: no procesa una solicitud sin orderId', async () => {
  const response = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ methodId: 'pse' }),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'orderId y methodId son obligatorios' });
});

test('HU-PG-11: contra entrega exige activar la simulación de cliente nuevo', async () => {
  const response = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'cod' }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'Activa la simulación de cliente nuevo para usar pago contra entrega',
  });
});

test('HU-PG-11: registra contra entrega como pendiente y permite consultarla', async () => {
  const countBefore = fakeTransactionNumber;
  const paymentResponse = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'attempt:cod-new-customer-001',
    },
    body: JSON.stringify({
      orderId: 'ORD-00125',
      methodId: 'cod',
      customerType: 'NEW_CUSTOMER_DEMO',
    }),
  });
  const payment = await paymentResponse.json();

  assert.equal(paymentResponse.status, 201);
  assert.equal(payment.methodId, 'cod');
  assert.equal(payment.amount, 149900);
  assert.equal(payment.status, 'PENDING_COD');
  assert.equal(fakeTransactionNumber, countBefore + 1);

  const queryResponse = await fetch(
    `${baseUrl}/api/payments/transactions/${payment.transactionId}`,
  );
  const queried = await queryResponse.json();
  assert.equal(queryResponse.status, 200);
  assert.deepEqual(queried, {
    transactionId: payment.transactionId,
    orderId: 'ORD-00125',
    methodId: 'cod',
    amount: 149900,
    status: 'PENDING_COD',
    createdAt: queried.createdAt,
  });
  assert.ok(queried.createdAt);
  assert.equal(fakeTransactionNumber, countBefore + 1);
});

test('HU-PG-11: solicitudes simultáneas con la misma clave no se duplican', async () => {
  const key = 'attempt:cod-concurrent-002';
  const request = () => fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({
      orderId: 'ORD-00125',
      methodId: 'cod',
      customerType: 'NEW_CUSTOMER_DEMO',
    }),
  });
  const countBefore = fakeTransactionNumber;
  const [firstResponse, secondResponse] = await Promise.all([request(), request()]);
  const first = await firstResponse.json();
  const second = await secondResponse.json();

  assert.deepEqual([firstResponse.status, secondResponse.status].sort(), [200, 201]);
  assert.equal(first.transactionId, second.transactionId);
  assert.equal(first.status, 'PENDING_COD');
  assert.equal(fakeTransactionNumber, countBefore + 1);
});

test('HU-PG-12: cotiza el anticipo académico sin aceptar montos del frontend', async () => {
  const response = await fetch(`${baseUrl}/api/payments/reservations/quote/ORD-00125`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    orderId: 'ORD-00125',
    product: 'Audífonos Bluetooth JBL Tune 520BT',
    totalAmount: 149900,
    advanceAmount: 50000,
    balanceAmount: 99900,
    rule: 'ACADEMIC_FIXED_AMOUNT',
  });
});

test('HU-PG-12: PSE aprueba el anticipo y confirma la reserva de demostración', async () => {
  const response = await fetch(`${baseUrl}/api/payments/reservations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'attempt:reservation-pse-001',
    },
    body: JSON.stringify({
      orderId: 'ORD-00125', methodId: 'pse', amount: 1, totalAmount: 1,
    }),
  });
  const reservation = await response.json();

  assert.equal(response.status, 201);
  assert.equal(reservation.status, 'APPROVED');
  assert.equal(reservation.amount, 50000);
  assert.equal(reservation.totalAmount, 149900);
  assert.equal(reservation.balanceAmount, 99900);
  assert.equal(reservation.reservationStatus, 'CONFIRMED');

  const query = await fetch(`${baseUrl}/api/payments/transactions/${reservation.transactionId}`);
  const queried = await query.json();
  assert.equal(query.status, 200);
  assert.equal(queried.product, 'Audífonos Bluetooth JBL Tune 520BT');
  assert.equal(queried.reservationStatus, 'CONFIRMED');
});

test('HU-PG-12: QR rechaza el anticipo y no confirma la reserva', async () => {
  const response = await fetch(`${baseUrl}/api/payments/reservations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'attempt:reservation-qr-002',
    },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'qr' }),
  });
  const reservation = await response.json();

  assert.equal(response.status, 201);
  assert.equal(reservation.status, 'REJECTED');
  assert.equal(reservation.amount, 50000);
  assert.equal(reservation.balanceAmount, 149900);
  assert.equal(reservation.reservationStatus, 'NOT_CONFIRMED');
});

test('HU-PG-12: contra entrega no puede utilizarse para pagar el anticipo', async () => {
  const response = await fetch(`${baseUrl}/api/payments/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'cod' }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /PSE o Código QR/);
});

test('HU-PG-12: solicitudes concurrentes con la misma clave crean un solo anticipo', async () => {
  const key = 'attempt:reservation-concurrent-003';
  const request = () => fetch(`${baseUrl}/api/payments/reservations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'pse' }),
  });
  const countBefore = fakeTransactionNumber;
  const [firstResponse, secondResponse] = await Promise.all([request(), request()]);
  const first = await firstResponse.json();
  const second = await secondResponse.json();

  assert.deepEqual([firstResponse.status, secondResponse.status].sort(), [200, 201]);
  assert.equal(first.transactionId, second.transactionId);
  assert.equal(fakeTransactionNumber, countBefore + 1);
});

test('HU-PG-05 y 09: consulta una transacción aprobada con sus datos sin crear otra', async () => {
  const paymentResponse = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'pse' }),
  });
  const payment = await paymentResponse.json();
  const transactionCount = fakeTransactionNumber;

  const response = await fetch(
    `${baseUrl}/api/payments/transactions/${payment.transactionId}`,
  );
  assert.equal(response.status, 200);
  const consulted = await response.json();
  assert.equal(consulted.transactionId, payment.transactionId);
  assert.equal(consulted.orderId, 'ORD-00125');
  assert.equal(consulted.methodId, 'pse');
  assert.equal(consulted.amount, 149900);
  assert.equal(consulted.status, 'APPROVED');
  assert.ok(consulted.createdAt);
  assert.equal(fakeTransactionNumber, transactionCount);
});

test('HU-PG-05 y 09: consulta una transacción rechazada con sus datos básicos', async () => {
  const paymentResponse = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'qr' }),
  });
  const payment = await paymentResponse.json();

  const response = await fetch(
    `${baseUrl}/api/payments/transactions/${payment.transactionId}`,
  );
  assert.equal(response.status, 200);
  const consulted = await response.json();
  assert.equal(consulted.transactionId, payment.transactionId);
  assert.equal(consulted.orderId, 'ORD-00125');
  assert.equal(consulted.methodId, 'qr');
  assert.equal(consulted.amount, 149900);
  assert.equal(consulted.status, 'REJECTED');
});

test('HU-PG-05: una transacción inexistente devuelve 404', async () => {
  const response = await fetch(`${baseUrl}/api/payments/transactions/TX-999999`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Transacción no encontrada' });
});

test('HU-PG-05: un identificador inválido devuelve 400', async () => {
  const response = await fetch(`${baseUrl}/api/payments/transactions/incorrecto`);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: 'El identificador de transacción no es válido',
  });
});

test('HU-PG-05: un error temporal del repositorio devuelve 500 sin indicar rechazo', async () => {
  const failingApp = createApp(
    createGetPaymentSummary(localOrderSummary),
    createGetPaymentMethods(localPaymentMethods),
    createProcessPayment({
      orderSummaryPort: localOrderSummary,
      paymentMethodPort: localPaymentMethods,
      paymentProcessorPort: simulatedPaymentProcessor,
      transactionRepositoryPort: fakeTransactionRepository,
    }),
    async () => { throw new Error('Conexión temporal no disponible'); },
  );
  const failingServer = failingApp.listen(0, '127.0.0.1');
  await once(failingServer, 'listening');
  const previousConsoleError = console.error;
  console.error = () => {};
  try {
    const response = await fetch(
      `http://127.0.0.1:${failingServer.address().port}/api/payments/transactions/TX-000001`,
    );
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.deepEqual(body, { error: 'Error interno del servidor' });
    assert.doesNotMatch(body.error, /rechaz/i);
  } finally {
    console.error = previousConsoleError;
    await new Promise((resolve) => failingServer.close(resolve));
  }
});

test('HU-PG-07: repetir la misma clave no crea otra transacción', async () => {
  const key = 'attempt:http-repeat-001';
  const request = () => fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'pse' }),
  });
  const countBefore = fakeTransactionNumber;
  const [firstResponse, secondResponse] = await Promise.all([request(), request()]);
  const first = await firstResponse.json();
  const second = await secondResponse.json();

  assert.deepEqual([firstResponse.status, secondResponse.status].sort(), [200, 201]);
  assert.equal(second.transactionId, first.transactionId);
  assert.equal(fakeTransactionNumber, countBefore + 1);
});

test('HU-PG-07: dos intentos voluntarios conservan transacciones diferentes', async () => {
  const rejectedResponse = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'attempt:retry-qr-001' },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'qr' }),
  });
  const rejected = await rejectedResponse.json();
  const approvedResponse = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'attempt:retry-pse-002' },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'pse' }),
  });
  const approved = await approvedResponse.json();

  assert.equal(rejectedResponse.status, 201);
  assert.equal(approvedResponse.status, 201);
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(approved.status, 'APPROVED');
  assert.notEqual(approved.transactionId, rejected.transactionId);
  assert.equal((await fakeTransactionRepository.findByTransactionId(rejected.transactionId)).status, 'REJECTED');
});

test('HU-PG-07: una clave reutilizada para otra solicitud devuelve 409', async () => {
  const key = 'attempt:http-conflict-001';
  await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'qr' }),
  });
  const response = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ orderId: 'ORD-00125', methodId: 'pse' }),
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /otra solicitud/);
});
