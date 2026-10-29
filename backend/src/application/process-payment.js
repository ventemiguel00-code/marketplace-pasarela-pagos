const PaymentTransaction = require('../domain/payment-transaction');

function paymentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function ensureSameAttempt(transaction, orderId, methodId) {
  if (transaction.orderId !== orderId || transaction.methodId !== methodId) {
    throw paymentError(
      'IDEMPOTENCY_KEY_CONFLICT',
      'La clave de intento ya fue utilizada para otra solicitud',
    );
  }
}

function createProcessPayment({
  orderSummaryPort,
  paymentMethodPort,
  paymentProcessorPort,
  transactionRepositoryPort,
}) {
  return async function processPayment({
    orderId,
    methodId,
    idempotencyKey = null,
    customerType = null,
  } = {}) {
    if (!orderId || !methodId) {
      throw paymentError('INVALID_PAYMENT_REQUEST', 'orderId y methodId son obligatorios');
    }
    if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) {
      throw paymentError('INVALID_IDEMPOTENCY_KEY', 'La clave de intento no es válida');
    }
    if (methodId === 'cod' && customerType !== 'NEW_CUSTOMER_DEMO') {
      throw paymentError(
        'COD_REQUIRES_NEW_CUSTOMER_DEMO',
        'Activa la simulación de cliente nuevo para usar pago contra entrega',
      );
    }

    if (idempotencyKey) {
      const existing = await transactionRepositoryPort.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        ensureSameAttempt(existing, orderId, methodId);
        existing.isIdempotentReplay = true;
        return existing;
      }
    }

    const summary = await orderSummaryPort.findByOrderId(orderId);
    if (!summary) {
      throw paymentError('ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    const methods = await paymentMethodPort.findAll();
    if (!methods.some((method) => method.id === methodId)) {
      throw paymentError('METHOD_NOT_AVAILABLE', 'Método de pago no disponible');
    }

    const status = await paymentProcessorPort.process({
      orderId,
      methodId,
      amount: summary.totalAmount,
    });

    const saved = await transactionRepositoryPort.save(new PaymentTransaction({
      orderId,
      methodId,
      amount: summary.totalAmount,
      status,
      idempotencyKey,
    }));
    ensureSameAttempt(saved, orderId, methodId);
    return saved;
  };
}

module.exports = createProcessPayment;
