const { host, port } = require('./config/env');
const createApp = require('./adapters/http/app');
const createGetPaymentSummary = require('./application/get-payment-summary');
const localOrderSummary = require('./adapters/local/local-order-summary');
const createGetPaymentMethods = require('./application/get-payment-methods');
const localPaymentMethods = require('./adapters/local/local-payment-methods');
const createProcessPayment = require('./application/process-payment');
const createGetPaymentStatus = require('./application/get-payment-status');
const createGetReservationQuote = require('./application/get-reservation-quote');
const createProcessReservation = require('./application/process-reservation');
const { academicReservationPolicy } = require('./adapters/local/academic-reservation-policy');
const simulatedPaymentProcessor = require('./adapters/local/simulated-payment-processor');
const createPostgresTransactionRepository = require('./adapters/persistence/postgres-transaction-repository');
const { createPool } = require('./adapters/persistence/postgres');
const { createJwtAuthentication } = require('./adapters/http/jwt-authentication');
const { createRequestAuthorization } = require('./adapters/http/request-authorization');
const { createOrdersClient } = require('./adapters/http/orders-client');
const { createAccountingEscrowClient } = require('./adapters/http/accounting-escrow-client');
const { createNotificationsClient } = require('./adapters/http/notifications-client');
const { createInventoryClient } = require('./adapters/http/inventory-client');
const { createTrackingClient } = require('./adapters/http/tracking-client');
const createPostgresIntegrationOutbox = require('./adapters/persistence/postgres-integration-outbox');
const { createIntegrationDispatcher } = require('./application/dispatch-integration-events');
const { createRecordPaymentIntegrations } = require('./application/record-payment-integrations');

// Composición: los adaptadores locales pueden sustituirse por integraciones reales.
const pool = createPool();
const transactionRepository = createPostgresTransactionRepository(pool);
const ordersReadEnabled = process.env.ORDERS_INTEGRATION_ENABLED === 'true';
const externalWritesEnabled = process.env.PAYMENT_INTEGRATIONS_WRITE_ENABLED === 'true';
const outboxEnabled = process.env.INTEGRATION_OUTBOX_ENABLED === 'true';
const ordersClient = createOrdersClient({
  baseUrl: process.env.ORDERS_BASE_URL,
  enabled: ordersReadEnabled || externalWritesEnabled,
});
const orderSummaryPort = ordersReadEnabled ? ordersClient : localOrderSummary;
const outbox = outboxEnabled ? createPostgresIntegrationOutbox(pool) : null;
let recordIntegrations = null;
if (outbox) {
  const dispatcher = externalWritesEnabled ? createIntegrationDispatcher({
    outboxPort: outbox,
    accounting: createAccountingEscrowClient({ baseUrl: process.env.ACCOUNTING_BASE_URL, enabled: true }),
    notifications: createNotificationsClient({ baseUrl: process.env.NOTIFICATIONS_BASE_URL, enabled: true }),
    orders: ordersClient,
    inventory: createInventoryClient({ baseUrl: process.env.INVENTORY_BASE_URL, enabled: true }),
    tracking: createTrackingClient({ baseUrl: process.env.TRACKING_BASE_URL, enabled: true }),
  }) : null;
  recordIntegrations = createRecordPaymentIntegrations({
    outboxPort: outbox,
    dispatcher,
    confirmedOrderStatus: process.env.ORDERS_APPROVED_STATUS || null,
    inventoryResponsibility: process.env.INVENTORY_CONFIRMATION_BY_PAYMENTS === 'true',
    trackingStatus: process.env.TRACKING_PAYMENT_STATUS || null,
  });
}
const getReservationQuote = createGetReservationQuote(orderSummaryPort, academicReservationPolicy);
const processReservation = createProcessReservation({
  getReservationQuote,
  paymentMethodPort: localPaymentMethods,
  paymentProcessorPort: simulatedPaymentProcessor,
  transactionRepositoryPort: transactionRepository,
  recordIntegrations,
});
// La autenticación queda desactivada en la demostración local. Al habilitarla,
// la capa HTTP valida el JWT antes de entrar en los casos de uso.
const authenticateBuyer = createJwtAuthentication({
  required: process.env.AUTH_JWT_REQUIRED === 'true',
  issuer: process.env.AUTH_JWT_ISSUER,
  audience: process.env.AUTH_JWT_AUDIENCE,
  jwksUrl: process.env.AUTH_JWT_JWKS_URL,
  algorithms: ['ES256'],
});
const orderOwnershipPort = ordersReadEnabled ? {
  isOrderOwnedBy: (input) => ordersClient.isOrderOwnedBy(input),
  async isTransactionOwnedBy({ transactionId, buyerSubject, accessToken }) {
    const transaction = await transactionRepository.findByTransactionId(transactionId);
    if (!transaction) return false;
    return ordersClient.isOrderOwnedBy({ orderId: transaction.orderId, buyerSubject, accessToken });
  },
} : null;
const requestAuthorization = createRequestAuthorization({ orderOwnershipPort });
const app = createApp(
  createGetPaymentSummary(orderSummaryPort),
  createGetPaymentMethods(localPaymentMethods),
  createProcessPayment({
    orderSummaryPort,
    paymentMethodPort: localPaymentMethods,
    paymentProcessorPort: simulatedPaymentProcessor,
    transactionRepositoryPort: transactionRepository,
    processAdvance: processReservation,
    recordIntegrations,
  }),
  createGetPaymentStatus(transactionRepository),
  getReservationQuote,
  processReservation,
  {
    authenticateBuyer,
    requestAuthorization,
    corsAllowedOrigin: process.env.CORS_ALLOWED_ORIGIN || null,
    publicAuthentication: {
      required: process.env.AUTH_JWT_REQUIRED === 'true',
      url: process.env.AUTH_PUBLIC_URL || null,
      publishableKey: process.env.AUTH_PUBLIC_PUBLISHABLE_KEY || null,
      issuer: process.env.AUTH_JWT_ISSUER || null,
      audience: process.env.AUTH_JWT_AUDIENCE || null,
    },
  },
);

const server = app.listen(port, host, () => {
  console.log(`Pasarela de Pagos: http://${host}:${port}`);
  console.log(`Estado de la API: http://${host}:${port}/health`);
});

server.on('error', (error) => {
  console.error('No se pudo iniciar el servidor:', error.code || error.name);
  process.exitCode = 1;
});

function shutdown() {
  server.close(async () => {
    await pool.end();
    console.log('Servidor detenido.');
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
