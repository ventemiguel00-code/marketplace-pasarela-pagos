const PaymentMethod = require('../../domain/payment-method');

const methods = [
  new PaymentMethod({ id: 'pse', name: 'PSE' }),
  new PaymentMethod({ id: 'qr', name: 'Código QR' }),
  new PaymentMethod({ id: 'cod', name: 'Pago contra entrega' }),
];

/** @type {import('../../ports/payment-method-port').PaymentMethodPort} */
const localPaymentMethods = {
  async findAll() {
    return methods;
  },
};

module.exports = localPaymentMethods;
