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

// Composición: los adaptadores locales pueden sustituirse por integraciones reales.
const pool = createPool();
const transactionRepository = createPostgresTransactionRepository(pool);
const getReservationQuote = createGetReservationQuote(localOrderSummary, academicReservationPolicy);
const processReservation = createProcessReservation({
  getReservationQuote,
  paymentMethodPort: localPaymentMethods,
  paymentProcessorPort: simulatedPaymentProcessor,
  transactionRepositoryPort: transactionRepository,
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
// Órdenes aún no ha entregado su contrato de propiedad. En modo JWT el
// middleware responderá 503 en vez de asumir que una orden es del comprador.
const requestAuthorization = createRequestAuthorization();
const app = createApp(
  createGetPaymentSummary(localOrderSummary),
  createGetPaymentMethods(localPaymentMethods),
  createProcessPayment({
    orderSummaryPort: localOrderSummary,
    paymentMethodPort: localPaymentMethods,
    paymentProcessorPort: simulatedPaymentProcessor,
    transactionRepositoryPort: transactionRepository,
    processAdvance: processReservation,
  }),
  createGetPaymentStatus(transactionRepository),
  getReservationQuote,
  processReservation,
  {
    authenticateBuyer,
    requestAuthorization,
    corsAllowedOrigin: process.env.CORS_ALLOWED_ORIGIN || null,
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
