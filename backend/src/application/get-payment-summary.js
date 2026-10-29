/** @param {import('../ports/order-summary-port').OrderSummaryPort} orderSummaryPort */
function createGetPaymentSummary(orderSummaryPort) {
  return async function getPaymentSummary(orderId) {
    return orderSummaryPort.findByOrderId(orderId);
  };
}

module.exports = createGetPaymentSummary;
