function createNotificationsClient({ baseUrl, fetchImpl = fetch } = {}) {
  return {
    async notifyPaymentApproved(event) {
      if (!baseUrl) throw new Error('La URL de Notificaciones no está configurada.');
      const response = await fetchImpl(`${baseUrl}/api/notificaciones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': event.eventId },
        body: JSON.stringify(event), signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('Notificaciones no aceptó el evento de pago.');
    },
  };
}

module.exports = { createNotificationsClient };
