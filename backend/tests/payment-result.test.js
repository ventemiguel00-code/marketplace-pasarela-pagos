const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getPaymentResultPresentation,
  getUnconfirmedPaymentPresentation,
  getSuccessfulPaymentConfirmation,
  getReservationInformation,
  getTransactionInformation,
  canRetryPayment,
  getPaymentReview,
  saveLastTransactionId,
  getLastTransactionId,
  getPurchaseChoicePresentation,
  canChangePurchaseChoice,
} = require('../../frontend/js/payment-result');

test('mejora visual: pago completo es la alternativa inicial y solo muestra su formulario', () => {
  assert.deepEqual(getPurchaseChoicePresentation(), {
    purchaseType: 'full',
    fullPaymentHidden: false,
    reservationHidden: true,
  });
});

test('mejora visual: permite alternar entre pago completo y anticipo sin mezclar formularios', () => {
  assert.deepEqual(getPurchaseChoicePresentation('reservation'), {
    purchaseType: 'reservation',
    fullPaymentHidden: true,
    reservationHidden: false,
  });
  assert.deepEqual(getPurchaseChoicePresentation('full'), {
    purchaseType: 'full',
    fullPaymentHidden: false,
    reservationHidden: true,
  });
});

test('mejora visual: bloquea el cambio durante operaciones o resultados sin confirmar', () => {
  assert.equal(canChangePurchaseChoice(), true);
  assert.equal(canChangePurchaseChoice({ paymentInProgress: true }), false);
  assert.equal(canChangePurchaseChoice({ reservationInProgress: true }), false);
  assert.equal(canChangePurchaseChoice({ reservationQuoteLoading: true }), false);
  assert.equal(canChangePurchaseChoice({ unconfirmedAttempt: true }), false);
  assert.equal(canChangePurchaseChoice({ reservationUnconfirmedAttempt: true }), false);
});

test('HU-PG-04: presenta APPROVED como Pago aprobado y conserva transactionId', () => {
  assert.deepEqual(getPaymentResultPresentation('APPROVED', 'TX-100'), {
    title: 'Pago aprobado',
    className: 'approved',
    transactionText: 'Transacción: TX-100',
  });
});

test('HU-PG-06: un pago aprobado genera la confirmación con sus datos reales', () => {
  assert.deepEqual(getSuccessfulPaymentConfirmation({
    transactionId: 'TX-000401',
    orderId: 'ORD-00125',
    methodId: 'pse',
    amount: 149900,
    status: 'APPROVED',
  }), {
    title: '¡Pago realizado con éxito!',
    transactionId: 'TX-000401',
    orderId: 'ORD-00125',
    amount: 149900,
    methodName: 'PSE',
    statusText: 'Aprobado',
  });
});

test('HU-PG-06: un pago rechazado no genera confirmación de éxito', () => {
  assert.equal(getSuccessfulPaymentConfirmation({
    transactionId: 'TX-000402',
    orderId: 'ORD-00125',
    methodId: 'qr',
    amount: 149900,
    status: 'REJECTED',
  }), null);
});

test('HU-PG-07: solo un pago confirmado como rechazado permite reintentar', () => {
  assert.equal(canRetryPayment({ status: 'REJECTED' }), true);
  assert.equal(canRetryPayment({ status: 'APPROVED' }), false);
  assert.equal(canRetryPayment(null), false);
  assert.equal(canRetryPayment({ status: 'UNCONFIRMED' }), false);
});

test('HU-PG-04: presenta REJECTED como Pago rechazado y conserva transactionId', () => {
  assert.deepEqual(getPaymentResultPresentation('REJECTED', 'TX-200'), {
    title: 'Pago rechazado',
    className: 'rejected',
    transactionText: 'Transacción: TX-200',
  });
});

test('HU-PG-05: un error de conexión se presenta como estado sin confirmar', () => {
  const presentation = getUnconfirmedPaymentPresentation('TX-000125');
  assert.equal(presentation.title, 'Estado del pago sin confirmar');
  assert.equal(presentation.className, 'unconfirmed');
  assert.match(presentation.transactionText, /TX-000125/);
  assert.doesNotMatch(presentation.title, /rechaz/i);
});

test('HU-PG-05: conserva el último transactionId para recuperarlo al reabrir', () => {
  const values = new Map();
  const storage = {
    setItem(key, value) { values.set(key, value); },
    getItem(key) { return values.get(key) ?? null; },
  };

  saveLastTransactionId(storage, 'TX-000321');
  assert.equal(getLastTransactionId(storage), 'TX-000321');
});

test('HU-PG-08: permite revisar y cambiar una operación antes de enviarla', () => {
  assert.deepEqual(getPaymentReview({
    orderId: 'ORD-00125',
    amount: 149900,
    methodId: 'pse',
  }), {
    orderId: 'ORD-00125',
    amount: 149900,
    methodName: 'PSE',
    statusText: 'Pendiente de confirmación',
    transactionId: null,
    canChangeMethod: true,
    canCancel: true,
  });
});

test('HU-PG-08: una transacción registrada se presenta como información no editable', () => {
  const review = getPaymentReview({
    orderId: 'ORD-00125',
    amount: 149900,
    methodId: 'qr',
    status: 'REJECTED',
    transactionId: 'TX-000402',
  });

  assert.equal(review.methodName, 'Código QR');
  assert.equal(review.statusText, 'Rechazado');
  assert.equal(review.transactionId, 'TX-000402');
  assert.equal(review.canChangeMethod, false);
  assert.equal(review.canCancel, false);
});

test('HU-PG-08: un estado sin confirmar no permite editar ni cancelar', () => {
  const review = getPaymentReview({
    orderId: 'ORD-00125',
    amount: 149900,
    methodId: 'pse',
    status: 'UNCONFIRMED',
  });

  assert.equal(review.statusText, 'Estado del pago sin confirmar');
  assert.equal(review.canChangeMethod, false);
  assert.equal(review.canCancel, false);
});

test('HU-PG-09: presenta todos los datos básicos de una transacción aprobada', () => {
  assert.deepEqual(getTransactionInformation({
    transactionId: 'TX-000501',
    orderId: 'ORD-00125',
    methodId: 'pse',
    amount: 149900,
    status: 'APPROVED',
  }), {
    transactionId: 'TX-000501',
    orderId: 'ORD-00125',
    amount: 149900,
    methodName: 'PSE',
    statusText: 'Aprobado',
  });
});

test('HU-PG-09: presenta REJECTED como Rechazado sin habilitar edición', () => {
  const information = getTransactionInformation({
    transactionId: 'TX-000502',
    orderId: 'ORD-00125',
    methodId: 'qr',
    amount: 149900,
    status: 'REJECTED',
  });

  assert.equal(information.methodName, 'Código QR');
  assert.equal(information.statusText, 'Rechazado');
  assert.equal('canChangeMethod' in information, false);
  assert.equal('canCancel' in information, false);
});

test('HU-PG-11: presenta contra entrega como pendiente y conserva el identificador', () => {
  assert.deepEqual(getPaymentResultPresentation('PENDING_COD', 'TX-000601'), {
    title: 'Pago contra entrega pendiente',
    className: 'pending-cod',
    transactionText: 'Solicitud: TX-000601',
  });

  assert.deepEqual(getTransactionInformation({
    transactionId: 'TX-000601',
    orderId: 'ORD-00125',
    methodId: 'cod',
    amount: 149900,
    status: 'PENDING_COD',
  }), {
    transactionId: 'TX-000601',
    orderId: 'ORD-00125',
    amount: 149900,
    methodName: 'Pago contra entrega',
    statusText: 'Pendiente de pago contra entrega',
  });
});

test('HU-PG-11: contra entrega pendiente no genera éxito ni permite reintento', () => {
  const transaction = { status: 'PENDING_COD' };
  assert.equal(getSuccessfulPaymentConfirmation(transaction), null);
  assert.equal(canRetryPayment(transaction), false);
});

test('HU-PG-12: un anticipo aprobado no se presenta como pago completo', () => {
  const transaction = {
    transactionId: 'TX-000701',
    orderId: 'ORD-00125',
    methodId: 'pse',
    amount: 50000,
    status: 'APPROVED',
    product: 'Audífonos Bluetooth',
    totalAmount: 149900,
    balanceAmount: 99900,
    reservationStatus: 'CONFIRMED',
  };
  assert.deepEqual(
    getPaymentResultPresentation('APPROVED', transaction.transactionId, transaction),
    { title: 'Anticipo aprobado', className: 'approved', transactionText: 'Anticipo: TX-000701' },
  );
  assert.equal(getSuccessfulPaymentConfirmation(transaction), null);
  assert.equal(getReservationInformation(transaction).registeredAdvanceAmount, 50000);
  assert.equal(getReservationInformation(transaction).balanceAmount, 99900);
});

test('HU-PG-12: un anticipo rechazado no confirma reserva ni descuenta saldo', () => {
  const information = getReservationInformation({
    transactionId: 'TX-000702',
    orderId: 'ORD-00125',
    methodId: 'qr',
    amount: 50000,
    status: 'REJECTED',
    product: 'Audífonos Bluetooth',
    totalAmount: 149900,
    balanceAmount: 149900,
    reservationStatus: 'NOT_CONFIRMED',
  });
  assert.equal(information.registeredAdvanceAmount, 0);
  assert.equal(information.balanceAmount, 149900);
  assert.equal(information.reservationStatusText, 'Reserva no confirmada');
});
