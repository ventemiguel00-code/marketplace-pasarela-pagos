const PaymentTransaction = require('../domain/payment-transaction');

function reservationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function ensureSameReservationAttempt(transaction, orderId, methodId) {
  if (
    transaction.orderId !== orderId
    || transaction.methodId !== methodId
    || !transaction.reservationStatus
  ) {
    throw reservationError(
      'IDEMPOTENCY_KEY_CONFLICT',
      'La clave de intento ya fue utilizada para otra solicitud',
    );
  }
}

function createProcessReservation({
  getReservationQuote,
  paymentMethodPort,
  paymentProcessorPort,
  transactionRepositoryPort,
}) {
  return async function processReservation({ orderId, methodId, idempotencyKey = null } = {}) {
    if (!orderId || !methodId) {
      throw reservationError('INVALID_RESERVATION_REQUEST', 'orderId y methodId son obligatorios');
    }
    if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey)) {
      throw reservationError('INVALID_IDEMPOTENCY_KEY', 'La clave de intento no es válida');
    }
    if (!['pse', 'qr'].includes(methodId)) {
      throw reservationError(
        'RESERVATION_METHOD_NOT_AVAILABLE',
        'El anticipo solo puede simularse con PSE o Código QR',
      );
    }

    if (idempotencyKey) {
      const existing = await transactionRepositoryPort.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        ensureSameReservationAttempt(existing, orderId, methodId);
        existing.isIdempotentReplay = true;
        return existing;
      }
    }

    const methods = await paymentMethodPort.findAll();
    if (!methods.some((method) => method.id === methodId)) {
      throw reservationError('RESERVATION_METHOD_NOT_AVAILABLE', 'Método no disponible');
    }

    const quote = await getReservationQuote(orderId);
    const status = await paymentProcessorPort.process({
      orderId,
      methodId,
      amount: quote.advanceAmount,
    });
    const isApproved = status === 'APPROVED';
    const saved = await transactionRepositoryPort.save(new PaymentTransaction({
      orderId,
      methodId,
      amount: quote.advanceAmount,
      status,
      idempotencyKey,
      product: quote.product,
      totalAmount: quote.totalAmount,
      balanceAmount: isApproved ? quote.balanceAmount : quote.totalAmount,
      reservationStatus: isApproved ? 'CONFIRMED' : 'NOT_CONFIRMED',
    }));
    ensureSameReservationAttempt(saved, orderId, methodId);
    return saved;
  };
}

module.exports = createProcessReservation;
