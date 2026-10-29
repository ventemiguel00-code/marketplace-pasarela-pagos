const express = require('express');
const path = require('node:path');

function createApp(
  getPaymentSummary,
  getPaymentMethods,
  processPayment,
  getPaymentStatus,
  getReservationQuote,
  processReservation,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  // Comprobación técnica: no consulta PostgreSQL ni procesa pagos.
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', module: 'payments' });
  });

  app.get('/api/payments/summary/:orderId', async (req, res) => {
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

  app.get('/api/payments/reservations/quote/:orderId', async (req, res, next) => {
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

  app.post('/api/payments', async (req, res, next) => {
    try {
      const transaction = await processPayment({
        ...req.body,
        idempotencyKey: req.get('Idempotency-Key') ?? req.body.idempotencyKey,
      });
      res.status(transaction.isIdempotentReplay ? 200 : 201).json({
        transactionId: transaction.transactionId,
        orderId: transaction.orderId,
        methodId: transaction.methodId,
        amount: transaction.amount,
        status: transaction.status,
      });
    } catch (error) {
      if (
        error.code === 'INVALID_PAYMENT_REQUEST'
        || error.code === 'METHOD_NOT_AVAILABLE'
        || error.code === 'INVALID_IDEMPOTENCY_KEY'
        || error.code === 'COD_REQUIRES_NEW_CUSTOMER_DEMO'
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

  app.post('/api/payments/reservations', async (req, res, next) => {
    try {
      const transaction = await processReservation({
        ...req.body,
        idempotencyKey: req.get('Idempotency-Key') ?? req.body.idempotencyKey,
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

  app.get('/api/payments/transactions/:transactionId', async (req, res, next) => {
    try {
      const transaction = await getPaymentStatus(req.params.transactionId);
      if (!transaction) {
        return res.status(404).json({ error: 'Transacción no encontrada' });
      }
      const response = {
        transactionId: transaction.transactionId,
        orderId: transaction.orderId,
        methodId: transaction.methodId,
        amount: transaction.amount,
        status: transaction.status,
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
  });

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
