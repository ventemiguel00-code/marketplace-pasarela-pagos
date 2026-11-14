const express = require('express');
const path = require('node:path');
const swaggerUi = require('swagger-ui-express');
const { openApiDocument } = require('./openapi');

const pass = (req, res, next) => next();

function getCodAdvanceMethod(methodId) {
  const match = /^cod:(pse|qr)$/.exec(methodId ?? '');
  return match?.[1] ?? null;
}

function toTransactionResponse(transaction) {
  const advanceMethodId = getCodAdvanceMethod(transaction.methodId);
  const response = {
    transactionId: transaction.transactionId,
    orderId: transaction.orderId,
    methodId: advanceMethodId ? 'cod' : transaction.methodId,
    amount: transaction.amount,
    status: transaction.status,
  };
  if (advanceMethodId) {
    Object.assign(response, {
      operationType: 'COD_WITH_ADVANCE',
      advanceMethodId,
      receivedAmount: transaction.status === 'PENDING_COD' ? transaction.amount : 0,
      product: transaction.product,
      totalAmount: transaction.totalAmount,
      balanceAmount: transaction.balanceAmount,
      codStatus: transaction.status === 'PENDING_COD' ? 'ENABLED' : 'NOT_ENABLED',
    });
  }
  return response;
}

function createApp(
  getPaymentSummary,
  getPaymentMethods,
  processPayment,
  getPaymentStatus,
  getReservationQuote,
  processReservation,
  options = {},
) {
  const app = express();
  const authenticateBuyer = options.authenticateBuyer || pass;
  const requestAuthorization = options.requestAuthorization || {
    authorizeOrder: pass,
    authorizeTransaction: pass,
  };
  app.disable('x-powered-by');
  const allowedOrigin = options.corsAllowedOrigin;
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (origin && allowedOrigin && origin === allowedOrigin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    }
    next();
  });
  app.use(express.json());

  // Comprobación técnica: no consulta PostgreSQL ni procesa pagos.
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', module: 'payments' });
  });

  app.get('/api/payments/summary/:orderId', authenticateBuyer, requestAuthorization.authorizeOrder, async (req, res) => {
    const summary = await getPaymentSummary(req.params.orderId);
    if (!summary) {
      return res.status(404).json({ error: 'Orden no encontrada' });
    }
    res.json(summary);
  });

  app.get('/api/payments/methods', async (req, res) => {
    const methods = await getPaymentMethods();
    res.json({ methods });
  });

  app.get('/api/payments/reservations/quote/:orderId', authenticateBuyer, requestAuthorization.authorizeOrder, async (req, res, next) => {
    try {
      const quote = await getReservationQuote(req.params.orderId);
      res.json(quote);
    } catch (error) {
      if (error.code === 'ORDER_NOT_FOUND') {
        return res.status(404).json({ error: error.message });
      }
      if (error.code === 'INVALID_RESERVATION_RULE') {
        return res.status(500).json({ error: 'La configuración del anticipo no es válida' });
      }
      next(error);
    }
  });

  async function processPaymentHandler(req, res, next) {
    try {
      const transaction = await processPayment({
        ...req.body,
        idempotencyKey: req.get('Idempotency-Key') ?? req.body.idempotencyKey,
      });
      res.status(transaction.isIdempotentReplay ? 200 : 201).json(
        toTransactionResponse(transaction),
      );
    } catch (error) {
      if (
        error.code === 'INVALID_PAYMENT_REQUEST'
        || error.code === 'METHOD_NOT_AVAILABLE'
        || error.code === 'INVALID_IDEMPOTENCY_KEY'
        || error.code === 'COD_REQUIRES_NEW_CUSTOMER_DEMO'
        || error.code === 'COD_ADVANCE_METHOD_REQUIRED'
        || error.code === 'COD_ADVANCE_NOT_CONFIGURED'
        || error.code === 'RESERVATION_METHOD_NOT_AVAILABLE'
      ) {
        return res.status(400).json({ error: error.message });
      }
      if (error.code === 'IDEMPOTENCY_KEY_CONFLICT') {
        return res.status(409).json({ error: error.message });
      }
      if (error.code === 'ORDER_NOT_FOUND') {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  }
  app.post('/api/payments', authenticateBuyer, requestAuthorization.authorizeOrder, processPaymentHandler);
  // Ruta de compatibilidad acordada con el Marketplace. Reutiliza el mismo caso de uso.
  app.post('/api/pagos/procesar', authenticateBuyer, requestAuthorization.authorizeOrder, processPaymentHandler);

  app.post('/api/payments/reservations', authenticateBuyer, requestAuthorization.authorizeOrder, async (req, res, next) => {
    try {
      const transaction = await processReservation({
        orderId: req.body.orderId,
        methodId: req.body.methodId,
        idempotencyKey: req.get('Idempotency-Key') ?? req.body.idempotencyKey,
        purpose: 'reservation',
      });
      res.status(transaction.isIdempotentReplay ? 200 : 201).json({
        transactionId: transaction.transactionId,
        orderId: transaction.orderId,
        methodId: transaction.methodId,
        amount: transaction.amount,
        status: transaction.status,
        product: transaction.product,
        totalAmount: transaction.totalAmount,
        balanceAmount: transaction.balanceAmount,
        reservationStatus: transaction.reservationStatus,
      });
    } catch (error) {
      if (
        error.code === 'INVALID_RESERVATION_REQUEST'
        || error.code === 'INVALID_IDEMPOTENCY_KEY'
        || error.code === 'RESERVATION_METHOD_NOT_AVAILABLE'
      ) {
        return res.status(400).json({ error: error.message });
      }
      if (error.code === 'IDEMPOTENCY_KEY_CONFLICT') {
        return res.status(409).json({ error: error.message });
      }
      if (error.code === 'ORDER_NOT_FOUND') {
        return res.status(404).json({ error: error.message });
      }
      next(error);
    }
  });

  async function getTransactionHandler(req, res, next) {
    try {
      const transaction = await getPaymentStatus(req.params.transactionId);
      if (!transaction) {
        return res.status(404).json({ error: 'Transacción no encontrada' });
      }
      const response = {
        ...toTransactionResponse(transaction),
        createdAt: transaction.createdAt,
      };
      if (transaction.reservationStatus) {
        Object.assign(response, {
          product: transaction.product,
          totalAmount: transaction.totalAmount,
          balanceAmount: transaction.balanceAmount,
          reservationStatus: transaction.reservationStatus,
        });
      }
      res.json(response);
    } catch (error) {
      if (error.code === 'INVALID_TRANSACTION_ID') {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }
  app.get('/api/payments/transactions/:transactionId', authenticateBuyer, requestAuthorization.authorizeTransaction, getTransactionHandler);
  app.get('/api/pagos/:id', authenticateBuyer, (req, res, next) => {
    req.params.transactionId = req.params.id;
    next();
  }, requestAuthorization.authorizeTransaction, getTransactionHandler);

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { explorer: false }));

  app.use(express.static(path.resolve(__dirname, '../../../../frontend')));

  app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
  });

  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON inválido' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Solicitud demasiado grande' });
    }
    console.error('Error HTTP:', error.code || error.name);
    res.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}

module.exports = createApp;
