function createIntegrationDispatcher({ outboxPort, accounting, notifications, orders, inventory, tracking }) {
  async function deliver(event, authContext) {
    switch (event.eventType) {
      case 'ACCOUNTING_ESCROW_RETAIN': return accounting.retainEscrow(event.payload);
      case 'NOTIFY_PAYMENT_APPROVED':
      case 'NOTIFY_PAYMENT_REJECTED': return notifications.createNotification(event.payload);
      case 'ORDER_STATUS_UPDATE': return orders.updateStatus({ ...event.payload, accessToken: authContext.accessToken });
      case 'INVENTORY_RESERVATION_CONFIRM': return inventory.confirmReservation({ ...event.payload, accessToken: authContext.accessToken });
      case 'TRACKING_STATUS_UPDATE': return tracking.updateStatus({ ...event.payload, accessToken: authContext.accessToken });
      default: throw Object.assign(new Error('Tipo de evento no soportado.'), { code: 'UNSUPPORTED_INTEGRATION_EVENT' });
    }
  }

  return {
    async dispatch(events, authContext = {}) {
      const results = [];
      for (const event of events) {
        try {
          const response = await deliver(event, authContext);
          results.push(await outboxPort.markResult(event.eventId, {
            deliveryStatus: 'DELIVERED', httpStatus: response?._httpStatus ?? null,
          }));
        } catch (error) {
          // Un timeout o error de red puede haber producido un efecto remoto. Se
          // conserva como UNCERTAIN y jamás se reintenta automáticamente.
          const uncertain = ['ACCOUNTING_TIMEOUT', 'ACCOUNTING_UNAVAILABLE', 'NOTIFICATIONS_TIMEOUT',
            'NOTIFICATIONS_UNAVAILABLE', 'ORDERS_TIMEOUT', 'ORDERS_UNAVAILABLE',
            'INVENTORY_TIMEOUT', 'INVENTORY_UNAVAILABLE', 'TRACKING_TIMEOUT', 'TRACKING_UNAVAILABLE'].includes(error.code);
          results.push(await outboxPort.markResult(event.eventId, {
            deliveryStatus: uncertain ? 'UNCERTAIN' : 'FAILED',
            httpStatus: error.status ?? null,
            errorCode: error.code ?? 'INTEGRATION_ERROR',
          }));
        }
      }
      return results;
    },
  };
}

module.exports = { createIntegrationDispatcher };
