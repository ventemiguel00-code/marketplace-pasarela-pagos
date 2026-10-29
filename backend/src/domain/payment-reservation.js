class PaymentReservationQuote {
  constructor({ orderId, product, totalAmount, advanceAmount }) {
    if (!Number.isInteger(totalAmount) || totalAmount <= 0) {
      throw new Error('El valor total debe ser un entero positivo en COP');
    }
    if (!Number.isInteger(advanceAmount) || advanceAmount <= 0) {
      throw new Error('El anticipo debe ser un entero mayor que cero en COP');
    }
    if (advanceAmount > totalAmount) {
      throw new Error('El anticipo no puede superar el valor total');
    }

    this.orderId = orderId;
    this.product = product;
    this.totalAmount = totalAmount;
    this.advanceAmount = advanceAmount;
    this.balanceAmount = totalAmount - advanceAmount;
    this.rule = 'ACADEMIC_FIXED_AMOUNT';
  }
}

module.exports = PaymentReservationQuote;
