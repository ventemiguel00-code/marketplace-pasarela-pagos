function createAccountingEscrowClient({ baseUrl, fetchImpl = fetch } = {}) {
  return {
    async notifyApprovedPayment(event) {
      if (!baseUrl) throw new Error('La URL de Contabilidad no está configurada.');
      const response = await fetchImpl(`${baseUrl}/api/contabilidad/escrow/retener`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': event.eventId },
        body: JSON.stringify(event), signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Contabilidad no aceptó el evento de pago.');
    },
  };
}

module.exports = { createAccountingEscrowClient };
