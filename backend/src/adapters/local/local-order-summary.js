const PaymentSummary = require('../../domain/payment-summary');

// Compra preparada de ejemplo. El importe de esta demo está expresado en COP.
const demoOrder = {
  orderId: 'ORD-00125',
  recipient: 'TechStore Marketplace',
  product: 'Audífonos Bluetooth JBL Tune 520BT',
  quantity: 1,
  subtotalAmount: 139900,
  shippingAmount: 10000,
  totalAmount: 149900,
};

/** @type {import('../../ports/order-summary-port').OrderSummaryPort} */
const localOrderSummary = {
  async findByOrderId(orderId) {
    if (orderId !== demoOrder.orderId) return null;
    return new PaymentSummary(demoOrder);
  },
};

module.exports = localOrderSummary;
