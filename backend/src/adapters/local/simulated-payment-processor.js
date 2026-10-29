/** @type {import('../../ports/payment-processor-port').PaymentProcessorPort} */
const simulatedPaymentProcessor = {
  async process({ methodId }) {
    // Reglas académicas: PSE aprueba, QR rechaza y contra entrega queda pendiente.
    if (methodId === 'cod') return 'PENDING_COD';
    return methodId === 'qr' ? 'REJECTED' : 'APPROVED';
  },
};

module.exports = simulatedPaymentProcessor;
