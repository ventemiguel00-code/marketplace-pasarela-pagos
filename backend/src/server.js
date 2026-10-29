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

// Composición: los adaptadores locales pueden sustituirse por integraciones reales.
const pool = createPool();
const transactionRepository = createPostgresTransactionRepository(pool);
const getReservationQuote = createGetReservationQuote(localOrderSummary, academicReservationPolicy);
const app = createApp(
  createGetPaymentSummary(localOrderSummary),
  createGetPaymentMethods(localPaymentMethods),
  createProcessPayment({
    orderSummaryPort: localOrderSummary,
    paymentMethodPort: localPaymentMethods,
    paymentProcessorPort: simulatedPaymentProcessor,
    transactionRepositoryPort: transactionRepository,
  }),
  createGetPaymentStatus(transactionRepository),
  getReservationQuote,
  createProcessReservation({
    getReservationQuote,
    paymentMethodPort: localPaymentMethods,
    paymentProcessorPort: simulatedPaymentProcessor,
    transactionRepositoryPort: transactionRepository,
  }),
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
