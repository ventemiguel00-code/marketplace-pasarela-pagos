// Modelo de lectura: describe una compra, sin ejecutar acciones de pago.
class PaymentSummary {
  constructor({
    orderId,
    recipient,
    product,
    quantity,
    subtotalAmount,
    shippingAmount,
    totalAmount,
  }) {
    this.orderId = orderId;
    this.recipient = recipient;
    this.product = product;
    this.quantity = quantity;
    this.subtotalAmount = subtotalAmount;
    this.shippingAmount = shippingAmount;
    this.totalAmount = totalAmount;
  }
}

module.exports = PaymentSummary;
