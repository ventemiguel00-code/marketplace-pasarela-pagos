class PaymentTransaction {
  constructor({
    transactionId = null,
    orderId,
    methodId,
    amount,
    status,
    createdAt = null,
    idempotencyKey = null,
    isIdempotentReplay = false,
    product = null,
    totalAmount = null,
    balanceAmount = null,
    reservationStatus = null,
  }) {
    this.transactionId = transactionId;
    this.orderId = orderId;
    this.methodId = methodId;
    this.amount = amount;
    this.status = status;
    this.createdAt = createdAt;
    this.idempotencyKey = idempotencyKey;
    this.isIdempotentReplay = isIdempotentReplay;
    this.product = product;
    this.totalAmount = totalAmount;
    this.balanceAmount = balanceAmount;
    this.reservationStatus = reservationStatus;
  }
}

module.exports = PaymentTransaction;
