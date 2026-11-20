const PaymentReservationQuote = require('../domain/payment-reservation');

function reservationQuoteError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createGetReservationQuote(orderSummaryPort, reservationPolicyPort) {
  return async function getReservationQuote(orderId, context = {}) {
    const summary = await orderSummaryPort.findByOrderId(orderId, context);
    if (!summary) {
      throw reservationQuoteError('ORDER_NOT_FOUND', 'Orden no encontrada');
    }

    const advanceAmount = await reservationPolicyPort.getAdvanceAmount(summary);
    try {
      const quote = new PaymentReservationQuote({
        orderId: summary.orderId,
        product: summary.product,
        totalAmount: summary.totalAmount,
        advanceAmount,
      });
      Object.assign(quote, {
        buyerId: summary.buyerId,
        sellerId: summary.sellerId,
        inventoryReferenceId: summary.inventoryReferenceId,
        trackingNumber: summary.trackingNumber,
      });
      return quote;
    } catch (error) {
      throw reservationQuoteError('INVALID_RESERVATION_RULE', error.message);
    }
  };
}

module.exports = createGetReservationQuote;
