/** @param {import('../ports/payment-method-port').PaymentMethodPort} paymentMethodPort */
function createGetPaymentMethods(paymentMethodPort) {
  return async function getPaymentMethods() {
    return paymentMethodPort.findAll();
  };
}

module.exports = createGetPaymentMethods;
