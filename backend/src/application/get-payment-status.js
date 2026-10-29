function paymentStatusError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createGetPaymentStatus(transactionRepositoryPort) {
  return async function getPaymentStatus(transactionId) {
    if (!/^TX-\d{6,17}$/.test(transactionId ?? '')) {
      throw paymentStatusError(
        'INVALID_TRANSACTION_ID',
        'El identificador de transacción no es válido',
      );
    }

    return transactionRepositoryPort.findByTransactionId(transactionId);
  };
}

module.exports = createGetPaymentStatus;
