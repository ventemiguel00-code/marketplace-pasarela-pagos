const { test } = require('node:test');
const assert = require('node:assert/strict');
const PaymentReservationQuote = require('../src/domain/payment-reservation');
const { ACADEMIC_ADVANCE_AMOUNT } = require('../src/adapters/local/academic-reservation-policy');

test('HU-PG-12: calcula el saldo con enteros COP y la regla académica visible', () => {
  const quote = new PaymentReservationQuote({
    orderId: 'ORD-00125',
    product: 'Producto de prueba',
    totalAmount: 149900,
    advanceAmount: ACADEMIC_ADVANCE_AMOUNT,
  });
  assert.equal(quote.advanceAmount, 50000);
  assert.equal(quote.balanceAmount, 99900);
  assert.equal(quote.rule, 'ACADEMIC_FIXED_AMOUNT');
});

for (const [name, advanceAmount] of [
  ['cero', 0],
  ['negativo', -1],
  ['decimal', 50000.5],
  ['superior al total', 150000],
]) {
  test(`HU-PG-12: rechaza un anticipo ${name}`, () => {
    assert.throws(() => new PaymentReservationQuote({
      orderId: 'ORD-00125',
      product: 'Producto de prueba',
      totalAmount: 149900,
      advanceAmount,
    }));
  });
}
