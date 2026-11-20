/** @param {import('../ports/order-summary-port').OrderSummaryPort} orderSummaryPort */
function createGetPaymentSummary(orderSummaryPort) {
  return async function getPaymentSummary(orderId, context = {}) {
    return orderSummaryPort.findByOrderId(orderId, context);
  };
}

module.exports = createGetPaymentSummary;
