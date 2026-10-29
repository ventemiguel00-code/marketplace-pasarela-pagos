function getPaymentResultPresentation(status, transactionId, transaction = null) {
  if (transaction?.reservationStatus) {
    return {
      title: status === 'APPROVED' ? 'Anticipo aprobado' : 'Anticipo rechazado',
      className: status === 'APPROVED' ? 'approved' : 'rejected',
      transactionText: `Anticipo: ${transactionId}`,
    };
  }
  if (status === 'APPROVED') {
    return {
      title: 'Pago aprobado',
      className: 'approved',
      transactionText: `Transacción: ${transactionId}`,
    };
  }
  if (status === 'REJECTED') {
    return {
      title: 'Pago rechazado',
      className: 'rejected',
      transactionText: `Transacción: ${transactionId}`,
    };
  }
  if (status === 'PENDING_COD') {
    return {
      title: 'Pago contra entrega pendiente',
      className: 'pending-cod',
      transactionText: `Solicitud: ${transactionId}`,
    };
  }
  throw new Error('Estado de pago desconocido');
}

function getUnconfirmedPaymentPresentation(transactionId = '') {
  return {
    title: 'Estado del pago sin confirmar',
    className: 'unconfirmed',
    transactionText: transactionId
      ? `Transacción: ${transactionId}`
      : 'Consulta nuevamente cuando se restablezca la conexión.',
  };
}

function getSuccessfulPaymentConfirmation(transaction) {
  if (!transaction || transaction.status !== 'APPROVED' || transaction.reservationStatus) {
    return null;
  }

  const information = getTransactionInformation(transaction);
  return {
    title: '¡Pago realizado con éxito!',
    ...information,
  };
}

function getReservationInformation(transaction) {
  if (!transaction?.reservationStatus) return null;
  return {
    transactionId: transaction.transactionId,
    orderId: transaction.orderId,
    product: transaction.product,
    totalAmount: transaction.totalAmount,
    requestedAdvanceAmount: transaction.amount,
    registeredAdvanceAmount: transaction.status === 'APPROVED' ? transaction.amount : 0,
    balanceAmount: transaction.balanceAmount,
    methodName: { pse: 'PSE', qr: 'Código QR' }[transaction.methodId] ?? transaction.methodId,
    paymentStatusText: transaction.status === 'APPROVED'
      ? 'Anticipo aprobado'
      : 'Anticipo rechazado',
    reservationStatusText: transaction.reservationStatus === 'CONFIRMED'
      ? 'Reserva de demostración confirmada'
      : 'Reserva no confirmada',
  };
}

function getTransactionInformation(transaction) {
  if (!transaction?.transactionId) return null;

  const methodNames = { pse: 'PSE', qr: 'Código QR', cod: 'Pago contra entrega' };
  const statusNames = {
    APPROVED: 'Aprobado',
    REJECTED: 'Rechazado',
    PENDING_COD: 'Pendiente de pago contra entrega',
  };
  return {
    transactionId: transaction.transactionId,
    orderId: transaction.orderId,
    amount: transaction.amount,
    methodName: methodNames[transaction.methodId] ?? transaction.methodId,
    statusText: statusNames[transaction.status] ?? transaction.status,
  };
}

function canRetryPayment(transaction) {
  return transaction?.status === 'REJECTED';
}

function getPaymentReview({
  orderId,
  amount,
  methodId,
  status = 'PENDING',
  transactionId = null,
}) {
  const methodNames = { pse: 'PSE', qr: 'Código QR', cod: 'Pago contra entrega' };
  const statusNames = {
    PENDING: 'Pendiente de confirmación',
    APPROVED: 'Aprobado',
    REJECTED: 'Rechazado',
    PENDING_COD: 'Pendiente de pago contra entrega',
    UNCONFIRMED: 'Estado del pago sin confirmar',
  };
  const isEditable = status === 'PENDING' && !transactionId;
  return {
    orderId,
    amount,
    methodName: methodNames[methodId] ?? methodId,
    statusText: statusNames[status] ?? status,
    transactionId,
    canChangeMethod: isEditable,
    canCancel: isEditable,
  };
}

const LAST_TRANSACTION_KEY = 'marketplace:lastTransactionId';

function saveLastTransactionId(storage, transactionId) {
  if (storage && /^TX-\d{6,17}$/.test(transactionId ?? '')) {
    storage.setItem(LAST_TRANSACTION_KEY, transactionId);
  }
}

function getLastTransactionId(storage) {
  return storage?.getItem(LAST_TRANSACTION_KEY) ?? '';
}

if (typeof window !== 'undefined') {
  window.PaymentResult = {
    getPaymentResultPresentation,
    getUnconfirmedPaymentPresentation,
    getSuccessfulPaymentConfirmation,
    getReservationInformation,
    getTransactionInformation,
    canRetryPayment,
    getPaymentReview,
    saveLastTransactionId,
    getLastTransactionId,
  };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getPaymentResultPresentation,
    getUnconfirmedPaymentPresentation,
    getSuccessfulPaymentConfirmation,
    getReservationInformation,
    getTransactionInformation,
    canRetryPayment,
    getPaymentReview,
    saveLastTransactionId,
    getLastTransactionId,
  };
}
