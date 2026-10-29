const PaymentReservationQuote = require('../domain/payment-reservation');

function reservationQuoteError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createGetReservationQuote(orderSummaryPort, reservationPolicyPort) {
  return async function getReservationQuote(orderId) {
    const summary = await orderSummaryPort.findByOrderId(orderId);
    if (!summary) {
      throw reservationQuoteError('ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    const advanceAmount = await reservationPolicyPort.getAdvanceAmount(summary);
    try {
      return new PaymentReservationQuote({
        orderId: summary.orderId,
        product: summary.product,
        totalAmount: summary.totalAmount,
        advanceAmount,
      });
    } catch (error) {
      throw reservationQuoteError('INVALID_RESERVATION_RULE', error.message);
    }
  };
}

module.exports = createGetReservationQuote;
